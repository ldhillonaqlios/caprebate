# Changelog: the dated notes that were in the code

Written by Phase 161i1 (8 November 2026). Until then many comments in the code said when something was decided, by
which phase and who asked for it. That history now lives here, and the code keeps comments that say why the code is as
it is. Every note below is the comment as it stood in the code, word for word, under the file it was in and the line
it started on that day (the file may have changed since). Notes from the files of the core, the shared parts and the
outside services (`src/core/`, `src/shared/`, `src/integrations/`) are here; Phases 161j and 161k bring the
business modules' notes here the same way.

How far the notes come out was put to the developer (question D16 of the developer question pack). Until they answer,
this follows our recommendation: keep a short comment that says why; move every dated note, and every name, here.
A phase's full record is in `00-START-HERE/hub/PHASE-HISTORY.md`.

Dates: the date the note itself gives, otherwise the date of its phase in the phase history; "date not recorded" where
neither says.

## 29 Mar 2026: no phase named

### `src/shared/localtime.ts`

- Line 136:

  > THE REVERSE MAPPING, AND IT IS THE HARD ONE: a local wall-clock time on a
  > local calendar day becomes the UTC instant or instants that ARE it.
  >
  > "OR INSTANTS" IS NOT PEDANTRY — IT IS THE WHOLE REASON THIS RETURNS AN ARRAY.
  > A local wall clock is not a function of time; twice a year it is not even
  > injective.
  >
  >   THE SPRING GAP. On 29 March 2026 the clocks go from 00:59 GMT to 02:00 BST.
  >   Local 01:30 DOES NOT EXIST that day. This returns an empty array, and the
  >   caller offers no slot — which is right: nobody can take a call at a time
  >   that does not happen. A naive `Date.UTC(...) - offset` would silently
  >   invent one, an hour away from where it was asked for.
  >
  >   THE AUTUMN OVERLAP. On 25 October 2026 local 01:30 happens TWICE, once at
  >   00:30Z in BST and again at 01:30Z in GMT. This returns both, earliest
  >   first. They are two genuinely different moments in a twenty-five-hour day
  >   and a booking system that collapsed them would lose one hour of real
  >   capacity every year.
  >
  > HOW IT WORKS, AND WHY THIS SHAPE RATHER THAN ARITHMETIC. Every candidate
  > offset in the region of the day is tried, and a candidate is KEPT ONLY IF IT
  > ROUND-TRIPS — that is, only if the instant it produces really does render as
  > the local time we were asked for. That test is what makes the gap return
  > nothing and the overlap return two, without this file containing the words
  > "British Summer Time", a rule about last Sundays, or the number 60.

## 30 May 2026: Phase 64

### `src/integrations/registers/source-register.ts`

- Line 804:

  > Phase 64: the service moved from epc.opendatacommunities.org on 30 May 2026;

## 29 Aug 2026: Phase 98

### `src/integrations/registers/name-exclusion.ts`

- Line 857:

  > ------------------------------------------------------------------ *
  > 6. THE ARTICLE 14 TRANSPARENCY RECORD — the RP-E1 and RP-E2 stores
  >
  > Board item 12927936989, specified 29 August 2026 (Phase 39), built
  > 8 September 2026 (Phase 98).
  >
  > WHY IT IS HERE AND NOT IN A MODULE OF ITS OWN. This file is what decides
  > which records retain a natural person's name — the two documented
  > exceptions, RP-E1 (Companies House person with significant control) and RP-E2
  > (HM Land Registry individual proprietor). The duty to tell that person we
  > hold their data follows from exactly the same fact, so the predicate that
  > decides whether a notice is owed is derived from NAME_EXCLUSION_POLICY
  > rather than from a flag somebody remembers to set. The equivalent record
  > for the uploaded-document population lives in caprebate-client-doc-
  > ingestion.ts section 6 for the same reason.
  >
  > WHAT WAS ACTUALLY MISSING, WHICH IS NARROWER THAN "NOTHING RECORDS THIS".
  > Phase 98's prompt said `art14_notice_sent` appears nowhere in 04-phase-work,
  > and that grep was correct. The conclusion drawn from it was not: a full
  > Article 14 transparency record ALREADY EXISTS for the uploaded-document
  > population, with per-person notices, 14(5)(e) exemption reasons and a
  > completeness assertion. Its own header even says that population was "worse
  > off than the register population because it has no store at all to add a
  > field to" — implying the register population had one. It did not. THIS is
  > the store, and the gap was real; it was just not the gap the grep described.
  >
  > ROUTE 2 IS A DECISION, NOT A RECOMMENDATION. Item 5 §8.5, 28 August 2026:
  > publish under Article 14(5)(e) with 14(7) as the baseline, AND notify the
  > individual directly wherever a route to them exists. So "we published" is
  > not an answer on its own for a person we could have reached.
  >
  > WHY PER PERSON AND NOT PER POLICY. Article 14(5) reads "do not apply TO THE
  > EXTENT THAT". Reliance on the exemption is a per-person assertion, and a
  > position that cannot be evidenced person by person is not a position. Same
  > reasoning as the document population; same conclusion.
  >
  > A BLANK IS NOT AN ANSWER — the rule the breach register applies at its
  > §2.5. NOT SENT with a reason is an answer; empty is not. That is the whole
  > point of assertArt14Complete: four fields that may be left empty are four
  > boxes, not a record.
  > ------------------------------------------------------------------

## 3 Sept 2026: Phase 105

### `src/core/seed.ts`

- Line 60:

  > THE CONTACT CHANNEL IS CB_BOOKING'S, AND IT USED NOT TO BE.
  >
  > Until Phase 105 this list carried 'virtual' and 'post'. 'virtual' is VIDEO,
  > which CB_BOOKING deliberately removed on 3 September 2026 and whose own
  > comment says "do not quietly re-add it here"; 'post' was never a channel at
  > all. Neither is a thing a client can choose, so the seed was demonstrating a
  > shape the funnel cannot produce — and a developer reads the seed as the
  > schema, which is how video would have come back.
  >
  > Migration 004 narrows the column to CB_BOOKING's three ids at the database,
  > and it refused this file until it was corrected. That is the sequence to
  > repeat: put the rule where the data is, and let it fail the seed.

## 3 Sept 2026: Phase 106

### `src/core/seed.ts`

- Line 427:

  > CRM 7 of 10: CAPREBATE'S OWN FINANCE IS SEEDED ON THE CLAIMS, BELOW, once the
  > claims exist — an invoice belongs to a claim. The reasoning that follows is
  > unchanged and applies to those rows.
  >
  > Caprebate's own finance. Not VAT registered — confirmed, not assumed.
  >
  > THE FEE IS 3% OF THE CLAIM VALUE AND IS WRITTEN OUT RATHER THAN INHERITED.
  > £300,000 of allowances identified, £9,000 of fee. Phase 132e, 16 September
  > 2026: a flat 3%, no bands and no minimum (it was 5% and £15,000 from Q55,
  > 3 September 2026). The rate is on the ALLOWANCES, not on the tax saved — a fourfold difference
  > for the same job, and a seed that got it wrong would teach the wrong basis
  > to the first developer who read it.
  >
  > `entity_type` IS `company` ON ALL SIX AND IT AGREES WITH THE ANSWERS.
  > Every seeded assessment answers Q1 "How is the business set up?" as
  > `company`, so anything else here would be a seed contradicting itself —
  > which is the class of defect Phase 106 found in this same file when two
  > source tiers disagreed with the two documents that decided them.
  >
  > `tax_rate` IS DELIBERATELY LEFT NULL, and it is the more interesting half.
  > There is no one marginal rate for a company — 19% under £50,000, 25% over
  > £250,000, an effective 26.5% between — and nothing in this system asks for
  > the profits that would decide it. So the finance view runs the comparison
  > at both ends of CB_RATES' own band and reports both, which is what it will
  > do on real data too. Seeding a rate would hide that behaviour behind a
  > number nobody chose.
  >
  > THE POOL SPLIT IS LEFT NULL FOR THE SAME REASON on four of the six, and
  > set on two, so the seeded data shows both shapes: a bounded range where
  > the split is unknown, and a single determined figure where it is not.

## 6 Sept 2026: no phase named

### `src/core/authz.ts`

- Line 348:

  > ------------------------------------------------------------------ *
  > THE RULE TABLE.
  >
  > Read it as: for this ACTION, these ROLES may act, subject to this test on
  > the specific object. A role absent from an action's row cannot perform it.
  > An action absent from the table cannot be performed by anyone.
  >
  > The three restrictions worth stating out loud, because they are decisions
  > and not oversights:
  >
  >   ACCOUNTING sees invoices and the business they belong to. It does NOT
  >   appear on assessment.*, answer.*, register_record.*, internal_note.* or
  >   surveyor_job.*. That was settled on 6 September 2026 and it is enforced
  >   twice — here, and in the shape of the finance tables, which carry no join
  >   to any of them.
  >
  >   SURVEYING appears on surveyor_job and on the assessment INPUTS it needs to
  >   do the work. It does NOT appear on estimate.read at all. The quarantine in
  >   caprebate-anchor-quarantine.ts is the authority on WHEN that changes, and
  >   payload.ts asks it rather than this table.
  >
  >   CLIENT appears only with ownBusiness, on their own record.
  > ------------------------------------------------------------------

### `src/core/roles.ts`

- Line 1:

  > THE FIVE APPLICATION ROLES — and the two other role vocabularies they are
  > constantly confused with. This file is the only place the three meet.
  >
  > 1. THESE FIVE: Admin, Sales, Accounting, Surveying, Client. Settled
  >    6 September 2026. Who can use the two applications.
  >
  > 2. THE SIX BOARD OWNER TYPES: Claude, CTA, Lakhbir, Surveyor, Solicitor/DPO,
  >    Developer. Who owns a task on the Monday board. NOT modelled here at all —
  >    they describe the project, not the product.
  >
  > 3. THE FIVE ROLES IN caprebate-anchor-quarantine.ts: SURVEYOR, ANALYST,
  >    CLIENT_MANAGER, CTA, CLIENT. That module predates the settled five and has
  >    its own vocabulary. It is the AUTHORITY on the quarantine and is not being
  >    rewritten to match, so the mapping below is what joins them — one place,
  >    tested, rather than a cast at each call site.
  >
  > ACCOUNTING IS CAPREBATE'S OWN FINANCE. It is not the client's accountant, who
  > has no login at all and receives the computation pack offline.

## 7 Sept 2026: no phase named

### `src/integrations/postcodes/postcode-authority.ts`

- Line 39:

  > Established 7 September 2026 by fetching the publisher's own pages and
  > querying its own live service — not assumed, and not inherited from an
  > earlier note. The item had been recorded as blocked on the VOA rating list,
  > which IS licence-gated. This route is not.

### `src/integrations/registers/source-register.ts`

- Line 404:

  > ONS postcode products. DELIBERATELY NOT the shared OGL_V3 entry above,
  > even though the licence itself is the Open Government Licence v3.0.
  >
  > ONS requires THREE attribution lines — its own, Ordnance Survey's and
  > Royal Mail's — because the product is Gridlink-derived. The generic
  > "Contains public sector information..." line that serves Companies House
  > and planning data would UNDER-ATTRIBUTE this source, and under-attributing
  > is a breach of the condition the licence is granted on. Same licence,
  > different obligation, therefore a different entry.
  >
  > cache_max_age_days is 120, not OGL_V3's 180: ONS releases quarterly, so
  > 180 days can serve data two releases old, and 120 keeps us at most one
  > release behind with a month of grace to notice.
  >
  > NORTHERN IRELAND IS NOT COVERED. Commercial use of BT postcodes needs a
  > separate licence from Land and Property Services. Enforced in code at
  > ingest and again at lookup — phase9/caprebate-postcode-authority.ts.
  > Established 7 September 2026 from the publisher's own licence page.

## 8 Sept 2026: Phase 9

### `src/integrations/postcodes/postcode-authority.ts`

- Line 1:

  > Caprebate — Postcode to Billing Authority Resolver (prepared, NOT SHIPPED)
  >
  > Board item 12991298199, "Resolve a property's postcode to its billing
  > authority from the ONS postcode lookup". Phase 9. Built 8 September 2026.
  >
  > WHY THIS EXISTS. LEG-E4 — the regional location factor — consumes a
  > `location_key` and refuses without one. Nothing in this system has ever
  > produced one. That, not the price-book purchase, is the reason LEG-E4 could
  > not ship: buying the book would have bought a table nobody could key into.
  > This module is the missing half.
  >
  > ABSOLUTE RULE, enforced in code and not only in prose: this module never
  > makes a network call. `onsFetchNotWired` — the default, always-on fetcher —
  > throws before doing anything else. Every other function here is a pure
  > parser or a pure lookup over caller-supplied text.
  >
  > AND THE REASON IS NOT A LICENCE. This is the difference between this module
  > and `caprebate-voa-import.ts`, which refuses for a reason that will one day
  > be negotiated away. Here THE LICENCE IS ALREADY CLEARED — see ONS_LICENCE
  > below. The refusal is architectural: the engine makes zero network calls,
  > ingest is a build-time job, and a runtime lookup reads an ingested table.
  > Do not "fix" this by wiring a fetch.
  >
  > THE TABLE SHIPS EMPTY, exactly as every other Phase 9 table does. The
  > mechanism ships; the data does not. Nothing here can return an answer until
  > somebody runs an ingest and hands the result in.
  >
  > Runs on Node >= 22.6 with type stripping (`node --test file.ts`). No enums,
  > no namespaces, no parameter properties — those are not strippable.
  >
  > Run:  cd phase9 && node --test caprebate-postcode-authority.test.ts

## 8 Sept 2026: Phase 103

### `src/core/staff.ts`

- Line 1:

  > THE BACK OFFICE'S ROUTES AND PAGES — settings, filled assessments, the
  > calendar. Block D of the Developer Build Order.
  >
  > IN ITS OWN FILE RATHER THAN IN router.ts, which is already 850 lines and
  > carries the public half. `handleStaff` has the same shape as `portalRoutes`:
  > it returns 'not-mine' for anything it does not own, so nothing is shadowed by
  > accident and the mounting in router.ts is one line.
  >
  > THE THREE RULES FROM router.ts APPLY HERE UNCHANGED and are not restated:
  > authorise on the object on every request, no route maps a path onto the
  > filesystem, and every response is built with the `h` tagged template. The
  > third has one apparent exception — the profile photo, which is bytes rather
  > than markup — and it is the reason `assertNoStaticFileRoute` now reads EVERY
  > file in src/web/ instead of only the router: a rule that was checked in one
  > file stopped being a rule the moment a second file could serve.
  >
  > ───────────────────────────────────────────────────────────────────────────
  > WHAT IS STUBBED HERE, AND IT SAYS SO ON SCREEN
  >
  > Outbound email and calendar invitations. Both write to the `outbox` table
  > from Phase 103 and neither leaves the building. The settings page shows the
  > outbox so that "not sent" is something a person can look at rather than a
  > claim in a footer.

## 8 Sept 2026: no phase named

### `src/integrations/postcodes/postcode-authority.ts`

- Line 153:

  > THREE-LETTER OUTWARD CODES. The general pattern above requires a digit after
  > the one or two leading letters, and these do not have one — so without this
  > list they are reported as malformed, which is wrong and is exactly the
  > failure this module's own rule warns about.
  >
  > FOUND BY RUNNING THE REAL FILE, 8 September 2026. Ingesting NSPL_AUG_2026
  > quarantined 2,418 postcodes as malformed. 2,417 of them were NPT — the
  > historic Newport, Gwent area, superseded by NP but still carried in the ONS
  > table. They are all terminated, so nothing would have resolved them anyway;
  > what would have been wrong is the REASON. A client whose historic address is
  > an NPT postcode should be told it was terminated, not that they have typed
  > something that is not a UK postcode.
  >
  > GIR 0AA (Girobank) is the other, and it is live.
  >
  > This is an allow-list rather than a looser pattern on purpose: relaxing the
  > general rule to admit any three letters would admit real garbage too.

- Line 640:

  > THE INCREMENTAL INGESTER, AND THE REASON IT EXISTS IS NOT ELEGANCE.
  >
  > This module first exposed only `ingestNspl(csvText: string)`. That API
  > cannot read the file it was written for. The real NSPL UK extract is
  > 964 MB of CSV, and Node's maximum string length is about 512 MB, so
  > `readFileSync(path, 'utf8')` throws ERR_STRING_TOO_LONG before a single row
  > is parsed. Found on 8 September 2026 by running the ingest against the real
  > download — every unit test passed, because every fixture was three lines.
  >
  > So the row logic lives here and is fed a line at a time, and `ingestNspl`
  > below is a thin wrapper for small inputs and tests. A caller with the real
  > file streams it; a caller with a fixture does not have to care.

### `src/integrations/registers/source-register.ts`

- Line 890:

  > Board item 12991298199. The thing that produces LEG-E4's `location_key`,
  > which nothing in this system produced until 8 September 2026 — and that,
  > not the price-book purchase, was why LEG-E4 could not ship.
  >
  > NO PERSONAL DATA REACHES THIS SOURCE AT ALL. It maps a postcode to a
  > council area from a static published table. There is no proprietor, no
  > person of significant control, no name anywhere in the product, which is
  > what makes the whitelist below as small as it is.
  >
  > Grade A: a register lookup over a published dataset, which is §0.5's own
  > worked example of an A.

## 9 Sept 2026: Phase 64

### `src/integrations/postcodes/postcode.ts`

- Line 1:

  > POSTCODE LOOKUP, AS THIS APPLICATION CONFIGURES IT.
  >
  > Phase 110, 9 September 2026. Board item 12993800139.
  >
  > The port next door re-exports the phase 9 modules unchanged. This file is
  > the small amount of wiring that is genuinely THIS APPLICATION'S: where the
  > store comes from, which parts of the UK we serve, and the one line that
  > changes when the data protection officer answers.
  >
  > ───────────────────────────────────────────────────────────────────────────
  > THE STORE IS A DEPLOYMENT ARTEFACT AND IS ABSENT BY DEFAULT
  >
  > CAPREBATE_POSTCODE_DB names a SQLite file built by the ingest. There is no
  > default path, no bundled copy and no download-on-first-use: a 75 MB table
  > appearing in a repository or a container image by accident is exactly what
  > the module's own §9 forbids, and a runtime download would be the network
  > call the engine does not make.
  >
  > WITH NO STORE CONFIGURED EVERYTHING STILL WORKS AND NOTHING PRETENDS TO.
  > `postcodeStore()` returns null, every derived answer is withheld with a
  > reason, and no screen shows a council area it did not derive. That is the
  > shipped state today and it is expected to be the shipped state until
  > somebody runs the ingest — which takes an afternoon, costs nothing and
  > needs no licence.
  >
  > ───────────────────────────────────────────────────────────────────────────
  > THE SERVED SET IS READ FROM CB_JURIS AND IS NOT RESTATED
  >
  > `CB_JURIS.SERVED` in the engine is the one place our operational coverage
  > is decided — England and Wales today, Phase 64 — and it is Lakhbir's to
  > flip rather than the tax adviser's. A copy here would be a second place to
  > change and the two would disagree on the day it moved.

## 9 Sept 2026: Phase 110

### `src/integrations/postcodes/location-key.ts`

- Line 1:

  > Caprebate — THE WIRING. Postcode in, location_key out, LEG-E4 still off.
  >
  > Board item 12993800139, Phase 110, 9 September 2026.
  >
  > ─────────────────────────────────────────────────────────────────────────
  > WHAT WAS MISSING, AND IT WAS NOT CODE
  >
  > Two finished modules had never been introduced to each other.
  >
  >   `caprebate-postcode-authority.ts` turns a postcode into a council area,
  >   and then into a `location_key` — 38 assertions, run end to end against
  >   the real 2.7 million-row ONS file on 8 September 2026.
  >
  >   `caprebate-cost-model.cjs` LEG-E4 consumes `input.location_key` and
  >   refuses without one.
  >
  > NOTHING CALLED THE FIRST AND NOTHING SUPPLIED THE SECOND. This file is the
  > seam, and it is the only one: `grep -rn "resolveLocationKey" ` outside the
  > resolver's own tests should return this file and nothing else.
  >
  > ─────────────────────────────────────────────────────────────────────────
  > IT STOPS AT THE PRICE BOOK, ON PURPOSE
  >
  > The chain is postcode -> council area -> the price book's own regional key
  > -> the factor. The LAST link is empty and stays empty: `CB_LAD_TO_LOCATION_KEY`
  > waits on a GBP 330 purchase (board item 12804374406), and the resolver
  > already refuses there with E_LOCATION_KEY_TABLE_NOT_LOADED and a message
  > naming which half is solved. THAT REFUSAL IS NOT RE-IMPLEMENTED HERE. It is
  > called, and its error is allowed out unchanged.
  >
  > `leg_e4_location_and_contract_size` SHIPS FALSE AND STAYS FALSE. This file
  > does not turn it on, cannot turn it on, and has no switch of its own.
  >
  > ─────────────────────────────────────────────────────────────────────────
  > THE ONE THING A WIRING CHANGE COULD BREAK, AND HOW IT IS PREVENTED
  >
  > With the gate off, LEG-E4 returns a factor of 1.0 with `applied: false` —
  > correct, documented, and the whole reason the module is safe to have in the
  > tree. With the gate ON and no location_key, it must REFUSE.
  >
  > A wiring layer is exactly where those two get confused: catch the resolver's
  > refusal, hand the cost model no key, and a gate-on run quietly produces the
  > gate-off answer. A 1.0 nobody chose, in a claim.
  >
  > SO THIS FILE NEVER DECIDES WHICH OF THE TWO IT IS IN. It asks the cost
  > model's own `gateOn` — exported for this, so the opts.gates override every
  > test uses is honoured — and:
  >
  >   gate OFF -> it returns `locationAndContractSizeFactor`'s OWN gate-off
  >               object, produced by that function, unmodified. No postcode is
  >               resolved, because nothing would be done with the answer. The
  >               1.0 comes from the module that owns the rule and this file
  >               cannot have invented it.
  >   gate ON  -> the postcode is resolved and EVERY failure is rethrown. There
  >               is no catch, no fallback and no default key anywhere below.
  >
  > H1 to H4 in the test file hold that down, including by turning the gate on
  > over a fixture and asserting the throw.
  >
  > ─────────────────────────────────────────────────────────────────────────
  > THE JURISDICTION REFUSAL, WHICH IS WHERE OPTION (c) WENT
  >
  > Phase 110's first job offered "trim the table to England and Wales" as a
  > storage option. Measured, it saves 4% of the heap — see
  > caprebate-postcode-store.ts. But the CORRECTNESS point inside it is real
  > and survives: a Scottish postcode must refuse as OUTSIDE THE SERVED
  > JURISDICTION, not as "not in table", because those two sentences send the
  > reader to two different places.
  >
  > So the refusal lives here and the data is left whole. THE SERVED SET IS NOT
  > DEFINED IN THIS FILE. It is passed in, because it already exists exactly
  > once — `CB_JURIS.SERVED` in the engine — and Lakhbir flips it. A copy here
  > would be a second place to change, and the day Scotland is switched on the
  > two would disagree and the client would be refused by the older one.
  >
  > NO SERVED SET SUPPLIED MEANS NO JURISDICTION CHECK, which is deliberate:
  > the resolver's own suite asserts that a Scottish postcode still resolves,
  > because that assertion is about the ONS LICENCE (Scotland is inside the
  > grant; Northern Ireland is not) and has nothing to do with our coverage.
  > The two must not be allowed to become one check.
  >
  > Runs on Node >= 22.6 with type stripping.
  > Run:  cd phase9 && node --test caprebate-location-key.test.ts

### `src/integrations/postcodes/postcode-authority.ts`

- Line 216:

  > NSPL's region code — the nine English regions, and a pseudo-code for
  > Wales, Scotland and Northern Ireland. OPTIONAL, and it is optional for
  > the same reason `country` is: not every NSPL vintage or per-area extract
  > carries the column, and a resolver that refused without it would fail on
  > files that answer the question it was actually asked. Absent means the
  > region is UNKNOWN, never a default region — see caprebate-region.ts,
  > which is the only thing that reads it.
  >
  > ADDED BY PHASE 110. Before it, a surveyor's rate library was keyed on the
  > constant REGION_NOT_CAPTURED across the whole country.

- Line 247:

  > Which header the region code was read from, or null if the file had
  >  none. Phase 110. Recorded for the same reason as lad_column_used, and
  >  null is a normal answer rather than a defect.

- Line 305:

  > WHERE THE ROWS COME FROM, AS A SHAPE RATHER THAN AS A FILE.
  >
  > ADDED BY PHASE 110. The whole UK table is 2.66 million rows and holding it
  > in a JavaScript object costs about 310 MB of heap and 630 MB of resident
  > memory per process — measured, not assumed; see
  > caprebate-postcode-store-costing.cjs. That is a deployment decision, and a
  > deployment decision has no business being hard-coded in a resolver.
  >
  > SO THE RESOLVER TAKES A SOURCE AND NOT A TABLE. `caprebate-postcode-store.ts`
  > supplies two — the object it always had, and a read-only SQLite file at
  > 75 MB on disk and about 11 MB resident — and its `PostcodeStore` is
  > assignable to this. THE TYPE IS DECLARED HERE RATHER THAN IMPORTED so this
  > module depends on nothing: the resolver is the thing every other decision
  > is built on and it must not acquire an import to get a storage choice.

- Line 562:

  > THE REGION COLUMN, ADDED BY PHASE 110 AND NOT VERIFIED AGAINST A REAL
  > FILE — which is why it is treated as optional everywhere below and why
  > this comment says so rather than the name implying otherwise.
  >
  > `rgn` is the historic name and it is versioned the same way the local
  > authority column is, so it gets the same pattern fallback and the ingest
  > records which header it actually used. IF IT IS ABSENT THE INGEST DOES
  > NOT FAIL: every row's region_code is null, the resolver still answers,
  > and only the region lookup refuses — with a message naming this column.
  > A resolver that stopped working because an OPTIONAL column moved would
  > be a worse outcome than the thing it was added for.

### `src/integrations/postcodes/postcode-port.ts`

- Line 1:

  > THE ONE PLACE THIS APPLICATION NAMES THE POSTCODE RESOLVER.
  >
  > Phase 110, 9 September 2026. The same seam, for the same reason, as
  > `upload-handler-port.ts`: `grep -rn "04-phase-work" src/` must return one
  > line per module and each of them must be here.
  >
  > `09-app/backend/src/postcodes/caprebate-postcode-authority.ts` was built on
  > 8 September, proven against the real 2.7 million-row ONS download, and
  > called by NOTHING. This file is where that stops.
  >
  > NOTHING IS RE-EXPORTED WITH A DIFFERENT NAME OR A WIDER TYPE, and no rule
  > is re-implemented on the way through. A shim that "tidied" the port would
  > be a second specification of it.
  >
  > ───────────────────────────────────────────────────────────────────────────
  > WHAT IS DELIBERATELY NOT HERE
  >
  > A TABLE. The store is 75 MB as a SQLite file and 290 MB as JSON, and it is
  > rebuilt from a free quarterly download — it is a DEPLOYMENT ARTEFACT, not
  > something this package carries, and `postcodeStore()` below returns null
  > until one is configured. Everything above it is written so that null is an
  > ordinary answer rather than a failure.
  >
  > A SECOND PERMISSION GATE. Standing rule 13(b): the free-register gate is
  > `CB_REGISTRY.precondition` and there must not be another. Whether it applies
  > to a council-area lookup with no personal data in it is an open question
  > with the data protection officer, and `POSTCODE_GATE` below is the single
  > line that changes when it is answered — either way.

### `src/integrations/postcodes/postcode-store.ts`

- Line 1:

  > Caprebate — WHERE THE POSTCODE TABLE LIVES AT RUNTIME.
  >
  > Board item 12993800139, Phase 110, 9 September 2026.
  >
  > ─────────────────────────────────────────────────────────────────────────
  > THE PROBLEM THIS FILE IS THE ANSWER TO
  >
  > `caprebate-postcode-authority.ts` resolves a postcode to a billing
  > authority by reading `table.byPostcode[postcode]` — a plain JavaScript
  > object holding all 2,657,599 rows. That is the only shape it has ever had,
  > and it is a shape, not a decision: the module was written before anybody
  > had run it on the real file, and the real file turned out to be 292 MB of
  > JSON built by an ingest that needed a 10 GB heap.
  >
  > A 292 MB table cannot go in the repository (md §9) and cannot be an
  > afterthought at deployment either. So this file does two things:
  >
  >   1. it puts a PORT between the resolver and the storage, so the choice can
  >      change without touching a line of the resolver;
  >   2. it implements the two adapters worth having, and records what each one
  >      actually costs — MEASURED, not asserted.
  >
  > ─────────────────────────────────────────────────────────────────────────
  > THE THREE OPTIONS, AND WHAT EACH ONE COSTS
  >
  > Measured by `caprebate-postcode-store-costing.cjs`, on synthetic data at
  > the real shape and scale (2,657,599 postcodes, 352 authorities), macOS
  > arm64, node v24.20.0, 9 September 2026. RE-RUN IT RATHER THAN QUOTING IT.
  >
  >   (a) JSON IN MEMORY
  >         serialised file          290.3 MB
  >         heap held by the table   310.4 MB
  >         process resident set     630.9 MB
  >         lookup                   0.51 us
  >
  >       THE PHASE PROMPT COSTED THIS AT "~292 MB resident per process". That
  >       is the FILE size. The process actually sits at about 630 MB, because
  >       2.66 million string keys and 2.66 million small objects cost more
  >       live than serialised, and building the table churns a multiple of it
  >       again — the real ingest was run with --max-old-space-size=10240 and
  >       needed it. On a small VM this option is not "simplest", it is the
  >       one that decides how much memory the whole application must be
  >       given, per process, forever.
  >
  >   (b) A KEYED STORE — SQLite, built once, opened read-only
  >         database file            74.5 MB
  >         resident, reading        ~11 MB above baseline
  >         lookup                   7.55 us
  >
  >       Fifteen times slower per lookup and the number is still 7.55
  >       MICROseconds. This system does ONE postcode lookup per assessment,
  >       behind a form submission. Twenty-eight times less resident memory
  >       for a cost nothing in this application can perceive.
  >
  >       Most of the disk saving is not SQLite being clever. It is that
  >       2.66 million copies of 352 authority NAMES become 352 rows in a
  >       second table — a redundancy the JSON shape has and nobody noticed
  >       because nobody had measured it.
  >
  >   (c) TRIMMED TO WHAT WE SERVE
  >         kept                     2,444,991 of 2,657,599  (92.0%)
  >         serialised file          267.1 MB   — saves 23.2 MB
  >         heap held by the table   296.8 MB   — saves 13.6 MB
  >
  >       THIS ONE DOES NOT WORK AND THE MEASUREMENT IS WHY. Dropping Scotland
  >       removes 8% of the rows and 4% of the heap. It leaves option (a) at
  >       297 MB of heap against option (b)'s 11 MB. Trimming is not a
  >       storage strategy; it is a rounding error on one.
  >
  > ─────────────────────────────────────────────────────────────────────────
  > THE RECOMMENDATION, AND THE PART OF (c) THAT IS KEPT ANYWAY
  >
  > RECOMMENDED: (b). A separate, read-only SQLite file, built by the ingest
  > and shipped as a deployment artefact.
  >
  > SEPARATE FROM THE APPLICATION DATABASE, and that is the one design point
  > worth arguing. The back end already runs node:sqlite, so "put it in the
  > back end's database" is nearly free — and wrong. This table is PUBLIC
  > REFERENCE DATA that is reproduced in full every quarter from a free
  > download. Putting it in the application database means every backup,
  > every restore and every migration carries 75 MB of data that nobody would
  > miss and anybody could rebuild, and a quarterly refresh becomes a
  > migration against live client data instead of a file swap. A refresh
  > should be: build the new file, point at it, delete the old one.
  >
  > AND (c) IS NOT REJECTED, IT IS RELOCATED. The prompt is right that a
  > Scottish postcode must refuse as OUTSIDE THE SERVED JURISDICTION rather
  > than as "not in table". That is a CORRECTNESS requirement and it is worth
  > having whatever the storage is — so it lives in the resolver, driven by
  > the served set, in `caprebate-location-key.ts`. Buying it by deleting rows
  > would have made the served set a property of a data file: flipping
  > CB_JURIS.SERVED to include Scotland — one boolean, Lakhbir's to flip —
  > would then silently require a re-ingest, and until somebody ran one every
  > Scottish client would be refused by a table that no longer meant to
  > refuse them. The decision belongs in CB_JURIS and nowhere else.
  >
  > ─────────────────────────────────────────────────────────────────────────
  > WHAT THIS FILE MAY NOT DO
  >
  > It may not resolve anything. Normalisation, the Northern Ireland licence
  > refusal, the terminated-postcode rule and the refusal-not-guess discipline
  > all stay in `caprebate-postcode-authority.ts`. A store answers exactly one
  > question — "what row is under this canonical postcode" — and a second
  > implementation of any rule above it is the failure the engine extraction
  > was done to prevent.
  >
  > Runs on Node >= 22.6 with type stripping. No enums, no namespaces.
  > Run:  cd phase9 && node --test caprebate-postcode-store.test.ts

## 9 Sept 2026: Phase 113a

### `src/core/authz.ts`

- Line 489:

  > A CLIENT MOVES THEIR OWN CALL. Phase 113a, 9 September 2026, and it is a
  > DECISION rather than a gap being filled — so it is written here as its own
  > row with its own reasoning, which is the whole reason it did not become
  > `CLIENT: ownBusiness` bolted onto `booking.write` above.
  >
  > WHY NOT LOOSEN `booking.write`. That action means "own and arrange a client
  > call": it decides whose diary a booking may be put into, it is what
  > `bookableUserIds` asks of every staff member to build the diary, and it is
  > the gate on the whole back-office calendar section through the sentinel
  > object. A CLIENT on that row would have appeared in the answer to "who
  > could take this call", which is absurd, and would have passed the section
  > gate, which is a leak. THE ACTIONS ARE GENUINELY DIFFERENT and one of them
  > did not exist until a client needed it.
  >
  > WHAT IT ADMITS, EXACTLY: the CLIENT role alone, on `ownBusiness`, on their
  > own booking object. No staff role is on it — a staff member moving a call
  > is `booking.write`, on the row above, and neither route is the other's back
  > door. Nothing else about a booking changes: reading it is still
  > `booking.read`, and the write path re-checks `isBookable` at the moment of
  > writing exactly as the staff path does.

### `src/shared/localtime.ts`

- Line 1:

  > LOCAL TIME — THE ONLY PLACE IN THIS APPLICATION THAT KNOWS ABOUT A TIMEZONE.
  >
  > Phase 113a, 9 September 2026. Until this file existed every screen printed
  > UTC and said so, which was honest and wrong for eight months of the year:
  > a member of staff who set "09:00 to 17:00" in June was setting 10:00 to 18:00
  > as anybody in Britain would read it, and a client offered "Wednesday at
  > 09:00" would have arrived at ten.
  >
  > ───────────────────────────────────────────────────────────────────────────
  > THE RULE, AND IT IS THE WHOLE DESIGN
  >
  > STORAGE AND COMPARISON STAY IN UTC. Every `starts_at`, `created_at`,
  > `submitted_at` and audit `at` is ISO-8601 UTC and stays that way — they sort,
  > they survive a Postgres port, and they cannot be confused about seconds and
  > milliseconds. Nothing in this file writes to the database and nothing that
  > compares two moments consults it.
  >
  > CONVERSION HAPPENS AT THE EDGES, AND THERE ARE EXACTLY TWO OF THEM:
  >
  >   THE DISPLAY EDGE — a stored instant becomes words a person reads.
  >   `localStamp`, `localWhen`, `localClock`, `localDate`. Everything a screen
  >   prints goes through one of these; nothing formats a time by hand.
  >
  >   THE INPUT EDGE — something a person typed or a day they named becomes an
  >   instant. `instantsForLocalMinute` and `startOfLocalDay` in schedule.ts.
  >   A date in a query string ("?date=2026-09-10") is a LOCAL day, because that
  >   is what the person clicking "next" meant.
  >
  > ───────────────────────────────────────────────────────────────────────────
  > WHY Intl AND NOT AN OFFSET CONSTANT
  >
  > Node carries the full IANA timezone database. A hard-coded `+1` is wrong for
  > four months of the year, a hard-coded `0` is wrong for eight, and a constant
  > that somebody remembers to change twice a year is wrong on the two days it
  > matters most. NOTHING BELOW KNOWS THAT BRITAIN IS EVER ONE HOUR AHEAD — the
  > offset is asked of `Intl` at the instant in question, every time, and the
  > abbreviation printed on screen ("BST" or "GMT") is asked of it too rather
  > than chosen by an `if`.
  >
  > Two tests in test/staff.test.ts pick real dates either side of the 2026
  > transitions — 29 March and 25 October — and would fail on any fixed offset in
  > either direction. One of them asserts a difference of exactly one hour
  > between the same clock time in June and in January, which no constant can
  > satisfy.
  >
  > ───────────────────────────────────────────────────────────────────────────
  > ONE ZONE, NAMED ONCE
  >
  > The business is a UK one, its staff are in Britain and its clients own
  > British property, so there is one zone and it is a constant rather than a
  > per-user setting. If that ever stops being true, this constant is the thing
  > to replace with a lookup, and it is the ONLY thing: no other file names a
  > zone, and none of the functions below reads the host machine's own timezone
  > — a server in Frankfurt must render the same page as a server in Leeds.

## 9 Sept 2026: Phase 132e

### `src/integrations/postcodes/region.ts`

- Line 1:

  > Caprebate — COUNCIL AREA TO REGION, in the price book's own vocabulary.
  >
  > Board item 13004035199 job 3, deferred out of Phase 107a into Phase 110.
  > 9 September 2026.
  >
  > ─────────────────────────────────────────────────────────────────────────
  > THE DEFECT
  >
  > A surveyor rate library entry is keyed on `surveyor :: field :: sector ::
  > region`, because a figure that is right in one part of the country is not
  > automatically right in another. Nothing in this application had a region to
  > give it, so every entry was keyed on the constant `REGION_NOT_CAPTURED` and
  > a surveyor's own figures were proposed back to them ACROSS THE WHOLE
  > COUNTRY. That was on the screen, not hidden, and it was wrong.
  >
  > ─────────────────────────────────────────────────────────────────────────
  > A REGION IS NOT A BILLING AUTHORITY, WHICH IS WHY THIS FILE EXISTS
  >
  > `caprebate-postcode-authority.ts` returns a COUNCIL AREA — 352 of them.
  > Keying a rate library on that grain would mean a surveyor's figure from one
  > job almost never matching the next, which is worse than one national
  > bucket, not better. What is wanted is the grouping rates actually vary by,
  > and there is already a published one in use on this project: the THIRTEEN
  > REGIONS Spon's Architects' and Builders' 2024 uses for its location
  > factors, which the book itself calls "the economic planning regions".
  >
  > ─────────────────────────────────────────────────────────────────────────
  > WHAT IS TAKEN FROM THE PRICE BOOK, AND WHAT IS DELIBERATELY NOT
  >
  > TAKEN: thirteen region NAMES. A vocabulary, so that this project has one
  > regional grouping rather than three.
  >
  > NOT TAKEN: the factors. Not one of the thirteen numbers is in this file or
  > anywhere else in the engine. The three price-book PDFs are under a
  > provenance quarantine — FOR THE SURVEYOR, note of 6 September 2026: every
  > page of one of them prints a path inside the publisher's own corporate
  > storage, nobody has recorded how we came by it, and until that is explained
  > "no figure from any of these three files may reach a claim, a report or the
  > engine". The factors belong to LEG-E4 and to `CB_LOCATION_FACTORS`, which
  > ships empty against a GBP 330 purchase (board item 12804374406).
  >
  > AND THE MEMBERSHIP IS NOT THE BOOK'S EITHER. Which council sits in which
  > region is ONS geography, published under the Open Government Licence, and
  > NSPL carries it on every postcode row. So the mapping below is ONS data
  > wearing the book's thirteen labels — which is the honest description of it,
  > and it is the reason this work needed no purchase at all.
  >
  > THAT LAST POINT IS THE FINDING. Phase 107a deferred this job here on the
  > understanding that a region needed the price book. IT DOES NOT. The book
  > supplies the FACTORS; the region MEMBERSHIP is free. This is the same
  > mistake the postcode resolver itself found about LEG-E4 — an item recorded
  > as blocked on a purchase that was never what was standing in the way.
  >
  > ─────────────────────────────────────────────────────────────────────────
  > LONDON IS NOT RESOLVED, AND IT REFUSES RATHER THAN PICKING ONE
  >
  > Eleven of the thirteen map from ONS geography with no judgement at all.
  > The other two are Inner London and Outer London, and the book states two
  > different factors for them — 1.05 and 1.00, a 5% difference on a whole cost
  > plan. It does not say which boroughs are which, and there are TWO published
  > definitions of Inner London in ordinary use: the London Government Act 1963
  > one (twelve boroughs and the City) and the ONS statistical one (which adds
  > Haringey and Newham). Choosing between them is a valuation judgement worth
  > 5%, and it is a surveyor's, not ours.
  >
  > So a London council refuses with E_LONDON_INNER_OUTER_UNRESOLVED, and the
  > question is in CAPREBATE QUESTIONS. UNKNOWN IS NOT A BRANCH: a default of
  > Outer London would be the cheaper of the two and would look exactly like an
  > answer.
  >
  > Corrected 16 September 2026 (Phase 132e): "adds Haringey and Newham" was
  > half of the difference. The ONS list also LEAVES OUT Greenwich, which the
  > 1963 Act counts as Inner London. Both lists have fourteen names counting
  > the City; they share twelve. See section 2a.
  >
  > ─────────────────────────────────────────────────────────────────────────
  > PHASE 132e, 16 SEPTEMBER 2026 — THE ONS FOURTEEN, BUILT AND SWITCHED OFF
  >
  > Someone typed an answer into the surveyor's answer box: use the ONS list of
  > fourteen. NOBODY SIGNED IT, and it was not written by a professional, so it
  > is an unsigned draft and not the surveyor's answer. Section 2a holds that
  > list behind SURVEYOR_INNER_LONDON_ONS_FOURTEEN, which is OFF. With it off, a
  > London council refuses exactly as it did before this phase, and the tests
  > prove that field by field. Only the surveyor's own answer turns it on.
  >
  > Runs on Node >= 22.6 with type stripping.
  > Run:  cd phase9 && node --test caprebate-region.test.ts

## 10 Sept 2026: no phase named

### `src/core/authz.ts`

- Line 592:

  > --- the CRM backbone. CRM 1 of 10, 10 September 2026 ---------------------
  >
  > EVERY ROW BELOW IS NEW, AND EVERY ROLE NOT NAMED ON A ROW IS REFUSED IT —
  > test/crm.test.ts asserts the refusal for each one, per action, rather than
  > trusting that an absent key means what it should.
  >
  > THE ORGANISATION IS THE `business` OBJECT. It is the same row, extended;
  > a second object type for it would be a second place to authorise one thing.
  > `business.read` above is untouched — it is still the client NAME, for an
  > invoice, and it is what ACCOUNTING holds. `organisation.read` is the whole
  > record, and ACCOUNTING is not on it.
  >
  > CONTACTS ARE ADMIN AND SALES ONLY. They carry people's names, routes and
  > internal notes, and nothing about the survey or the money needs them.
  >
  > PROPERTIES AND CLAIMS ARE REACHABLE BY SURVEYING ONLY `throughAssignedJob`.
  > The section gates `property.enter` and `claim.enter` are their own actions
  > for the reason `surveyor_job.enter` is: a sentinel object cannot satisfy a
  > test on the specific object without being built to pass it.
  >
  > N1 — `claim.read_value` IS ADMIN AND SALES AND NOBODY ELSE. The claim value,
  > the tax benefit and every sealed estimate field hang off it. A claim page
  > built for any other role is built forwards without them, and the payload
  > proof searches the response for all seven.
  >
  > ACCOUNTING READS A CLAIM AS CLIENT, REFERENCE AND MONEY. `claim.read`
  > admits it; src/web/crm.ts builds its view from those three and the money
  > comes through `invoice.read`, which it already holds. No join to the
  > answers, the register data, the notes, the workings or the estimate.
  >
  > CLIENT IS ON NONE OF THEM. The portal is unchanged by this phase.
  > ------------------------------------------------------------------------

- Line 660:

  > --- leads and the pipeline. CRM 2 of 10, 10 September 2026 --------------
  >
  > EVERY ROW BELOW IS NEW AND EVERY ROLE NOT NAMED IS REFUSED — test/
  > pipeline.test.ts asserts the refusal for each one, per action.
  >
  > LEADS ARE ADMIN AND SALES. A lead is a prospect being worked, with the
  > estimate the client was shown beside it; nothing about it is money or
  > survey work, so ACCOUNTING and SURVEYING are on none of these rows.
  >
  > `claim.move` IS A MOVE THROUGH A GATE, and the gate is asked on the server
  > at every write — src/web/pipeline.ts. Holding this action lets a person ASK
  > for a move; it never lets them past a gate that is shut. `claim.reopen`,
  > the one move backwards, is ADMIN alone and needs a reason.
  >
  > THE BOARD IS ADMIN AND SALES. A card's value is still asked per card of
  > `claim.read_value`, so a role added here later would get no value on a
  > card without being added there too.
  > ------------------------------------------------------------------------

### `src/core/seed.ts`

- Line 535:

  > THE CRM BACKBONE — CRM 1 of 10, 10 September 2026. Invented, like everything
  > above, and it carries NO PERSONAL NAMES: a contact is named for its role, the
  > way the users are, and every address is a ZZ postcode.
  >
  > ONE CLAIM PER BUSINESS FIRST, derived exactly as migration 009 backfills an
  > existing database — `backfillClaimFor` is that INSERT, column for column — so
  > a seeded business and a migrated one look the same.
  >
  > THEN THE SHAPE THIS PHASE EXISTS FOR, which a seed of one property per
  > business could not show at all:
  >   · Elverton (b5) has TWO PROPERTIES, and its main site has TWO CLAIMS —
  >     plant and machinery from the funnel, and structures and buildings opened
  >     by staff with no assessment, which no surveyor can reach.
  >   · Dunmarrow (b4) is filled in: legal name, company number, claimant type,
  >     addresses, an owner, two contacts, and a property with its acquisition —
  >     and its prior-claim position recorded as UNKNOWN, while Elverton's main
  >     site was never asked. The two must read the same, and a test says so.
  >   · Brackenfell (b2) has a Companies House register record, so its legal
  >     name and number are DERIVED and the page does not ask for them.
  >   · Fenmoor (b6) is DO_NOT_CONTACT, so the control can be seen refusing.
  >
  > THE ACQUISITION PRICE IS CHOSEN SO THAT NO DIGIT RUN OF IT IS ONE OF THE
  > SEALED ESTIMATE'S SEVEN VALUES. tools/payload-proof.ts searches a surveyor's
  > response for those values as raw text, and a seed that happened to contain
  > one would make the proof fail for a reason that is not a leak.

- Line 774:

  > LEADS — CRM 2 of 10, 10 September 2026. Invented, and carrying no person.
  >
  > EVERY ORGANISATION'S LEAD FIRST, derived exactly as migration 010 backfills an
  > existing database — `backfillLeadFor` is that INSERT — so all six are
  > CONVERTED onto the claim their assessment holds.
  >
  > THEN ONE REFERRAL that has not converted, because a lead list of nothing but
  > conversions shows nothing a lead list is for. Its organisation does not exist
  > yet — a referral arrives before the assessment creates it — and its enquiry
  > checks show the N4 case both ways: two recorded YES, ownership recorded as
  > NOT KNOWN, and the claim-conflict check never asked. The two read the same and
  > neither passes, so the lead cannot be qualified, and a test says so.

### `src/integrations/email/email.ts`

- Line 102:

  > DO_NOT_CONTACT IS A CONTROL, NOT A LABEL. CRM 1 of 10, 10 September 2026.
  >
  > AN ORGANISATION MARKED DO_NOT_CONTACT RECEIVES NOTHING THROUGH THIS BUILD —
  > not a calendar invitation, not a notification, not a password reset for a
  > client login that belongs to it. The check is asked of the message's
  > organisation and of the address itself, because a caller that forgot to say
  > which organisation it was writing to must still be refused.
  >
  > THE SAME FOUR TESTS ARE A TRIGGER ON THE OUTBOX (migration 009), in the same
  > order, for the caller that writes a row without coming through here. This
  > function refuses first so that nothing throws on an ordinary path: a booking
  > moved for a do-not-contact client still moves, and the invitation is simply
  > not queued. A REFUSAL IS NOT AN ERROR, AND IT IS NOT A SILENT SUCCESS EITHER —
  > the caller is told `refused`.

### `src/shared/localtime.ts`

- Line 182:

  > The instant at which the LOCAL day containing `ms` begins.
  >
  > Local midnight, not 00:00Z. On 10 September 2026 that is 2026-09-09T23:00:00Z
  > because Britain is an hour ahead, and a calendar drawn from UTC midnight puts
  > the first hour of every summer day in the wrong column.
  >
  > On the spring-forward day midnight exists as normal (the gap is at 01:00), so
  > the `[0]` below is safe; the `?? ms` is there because a zone that ever
  > abolished its own midnight would otherwise return `undefined` under
  > `noUncheckedIndexedAccess`, and falling back to the instant we were given is
  > the least wrong thing available.

### `src/shared/stages.ts`

- Line 150:

  > ================================================================== *
  > THE OPERATING PROCEDURE'S STAGES — THE CLAIM'S VOCABULARY.
  > CRM 2 of 10, 10 September 2026.
  > ==================================================================

## 11 Sept 2026: no phase named

### `src/core/authz.ts`

- Line 730:

  > --- documents on the claim. CRM 4 of 10, 11 September 2026 ---------------
  >
  > EVERY ROW BELOW IS NEW AND EVERY ROLE NOT NAMED IS REFUSED — test/
  > documents.test.ts asserts the refusal for each one, per action, and
  > `document.read` per role PER READER CLASS.
  >
  > `document.read` IS ASKED OF THE DOCUMENT ITSELF, never of its organisation:
  > `business.read` admits ACCOUNTING to every client's name, and a document
  > authorised that way would have admitted it to every client's lease.
  >
  > `document.read_original` IS THE FILE, AND IT IS NARROWER. The Dashboard Data
  > Specification's access table gives the surveyor and the accountant NO access
  > to the raw document store, and names no Sales row. Under the fail-closed
  > settings there is no original to serve in any case; the route still asks.
  >
  > TYPES ARE ADMIN'S TO CHANGE, AND A REQUEST IS ADMIN'S OR SALES'S TO RAISE.
  > The client reads their own requests in the portal and answers one only by
  > uploading — there is no action for answering, because there is no click that
  > receives a document.
  > ------------------------------------------------------------------------

- Line 780:

  > --- introducers and the referral channel. CRM 5 of 10, 11 September 2026 ---
  >
  > EVERY ROW BELOW IS NEW AND EVERY ROLE NOT NAMED IS REFUSED — test/
  > introducers.test.ts asserts the refusal for each one, per action.
  >
  > AN INTRODUCER IS A FIRM AND NEVER A USER. No row here, and no row anywhere,
  > gives a firm or a person at it a way in: CLIENT and SURVEYING are on none.
  >
  > THE FIRM IS ADMIN'S AND SALES'S TO READ AND KEEP. `introducer.read_value` —
  > the estimated claim value of what it referred — is ADMIN and SALES, as
  > `claim.read_value` is. `introducer.read_money` — the fees invoiced and paid
  > from those claims — is ADMIN and ACCOUNTING, as `invoice.read` is, and
  > ACCOUNTING opens a firm with that alone: src/web/introducers.ts builds its
  > view forwards from the money, with no join to the answers, the register data,
  > the notes, the workings or the estimate.
  >
  > THE CLIENT'S OPT-IN is recorded by ADMIN or SALES, who ask the client.
  >
  > THE REWARD SETTING IS ADMIN'S TO SWITCH, and the switch still refuses while
  > clause 1 of the letter is blank. A model-B fee's disclosure is recorded by the
  > people who talk to the client, ADMIN and SALES; that it was settled with the
  > firm, by the people who keep the money, ADMIN and ACCOUNTING. NOTHING HERE
  > TAKES MONEY: `record_settled` records that Caprebate paid a firm, and
  > test/finance.test.ts still refuses any action named for taking a payment.
  >
  > CONTACT WITH A FIRM IS A STAFF TASK (row E48), so logging or planning it also
  > asks `staff_task.create`, which is ADMIN's and SALES's already.
  > ------------------------------------------------------------------------

### `src/core/seed.ts`

- Line 695:

  > STAFF TASKS AND NEXT ACTIONS — CRM 3 of 10, 11 September 2026. Invented, and
  > naming nobody: every task is about a claim, an organisation, a contact's role
  > or a lead, and is owned by a role's user.
  >
  > THE ONE-NEXT-ACTION RULE, SHOWN BOTH WAYS. Dunmarrow's claim carries the next
  > action CRM 1 of 10 seeded as free text, now a task owned by Sales. Aldergate's
  > is OVERDUE, so the flag can be seen. Corvale's has an owner and NO DUE DATE,
  > and Brackenfell's has NONE AT ALL — both break the rule, and the list of claims
  > breaking it shows them. Elverton's two claims and Fenmoor's keep the rule.
  >
  > AND WORK FOR EVERY STAFF ROLE, so "my tasks" is empty for nobody who opens the
  > back office: the surveyor's task on the job assigned to them, a finance task
  > waiting with Accounting, a follow-up with Dunmarrow's finance contact, and a
  > follow-up on the referral that has not converted.

## 12 Sept 2026: Phase 129

### `src/core/audit.ts`

- Line 287:

  > Phase 129: a disclosure of a client's personal data to a recipient, recorded in the per-disclosure log — which is
  > switched off, so nothing writes this line yet. Codes and a count only: never a recipient's or a client's name.

### `src/core/authz.ts`

- Line 857:

  > --- the compliance registers. CRM 8 of 10, 12 September 2026 ---------------
  >
  > EVERY ROW BELOW IS NEW AND EVERY ROLE NOT NAMED IS REFUSED — test/
  > compliance.test.ts asserts the refusal for each one, per action.
  >
  > NONE OF THIS IS FOR SALES, ACCOUNTING OR SURVEYING, and ADMIN holds it TODAY
  > ONLY because nobody else can. There is no data protection officer role and
  > ADMIN is a super user, not an officer: whether compliance needs a role of its
  > own is Lakhbir's question, "Do we need a compliance role separate from Admin?",
  > and a sixth role is not ENABLED here. Phase 129 DEFINED one and switched it off —
  > `DPO_RULES` and `canAsDpo` below — and while `DPO_ROLE_SWITCH` is off it reaches nothing.
  >
  > THE IDENTITY STORE IS NARROWER THAN EVERYTHING ELSE. `compliance.read` does not
  > reach it and nothing inherits it: a person in S2 is read only through
  > `compliance.identity_read`, by person_ref or by a logged name search, and
  > every read is audited (Dashboard Data Specification, section 7).
  >
  > THE CLIENT'S OWN ROUTE TO THE SHARE-PROGRESS OPT-IN is the one row here for a
  > CLIENT, on their own organisation — withdrawing always, giving only while its
  > switch is on.
  > ------------------------------------------------------------------------

- Line 887:

  > --- the per-disclosure log. Phase 129, 12 September 2026 -------------------
  >
  > BOTH ROWS ARE NEW AND EVERY ROLE NOT NAMED IS REFUSED — test/phase129.test.ts
  > asserts the refusal for each one, per action. The log is switched off
  > (`DISCLOSURE_LOG` in src/web/disclosure-log.ts), so today these rows admit a
  > person to a refusal that says so, and nothing more.
  >
  > RECORDING a disclosure is ADMIN's and SALES's — the people who send a
  > client's papers to a surveyor, a tax adviser or the client's accountant.
  > READING who has received a client's data is a compliance register, ADMIN's
  > alone, as the rights-request register is.
  > ------------------------------------------------------------------------

- Line 1174:

  > ------------------------------------------------------------------ *
  > A DATA PROTECTION OFFICER ROLE — DEFINED, SCOPED, AND SWITCHED OFF.
  > Phase 129, 12 September 2026.
  >
  > WHAT IS BUILT. The rows a DPO would hold: the compliance registers, S2, the
  > per-disclosure log's reading, the back office's front door and their own
  > account — and NOTHING ELSE. Not the audit log, not users and roles, not the
  > admin settings, not a claim, a document, a lead or the money. So a DPO could
  > keep the registers without being able to add a salesperson or read the whole
  > audit log, which is what the question sets out.
  >
  > WHY IT IS OFF. Whether there is a sixth role at all is Lakhbir's question —
  > "Do we need a compliance role separate from Admin?" — and the five-role model
  > is a decision (src/core/roles.ts). So `DPO_ROLE_SWITCH` ships `enabled: false`, the
  > role is not in APP_ROLES, the roles table has no row for it, and `can()` below
  > refuses a DPO actor every action, exactly as it did before this block existed.
  > The table is not consulted for any of the five roles.
  > ------------------------------------------------------------------

- Line 1245:

  > Phase 129: a DPO actor is decided by its own switched-off table and by nothing below. Off, that is a refusal.

### `src/core/roles.ts`

- Line 76:

  > A DATA PROTECTION OFFICER ROLE — DEFINED, AND NOT ENABLED. Phase 129, 12 September 2026.
  >
  > It is NOT one of the five and it is not in APP_ROLES, on purpose: whether compliance needs a role separate from Admin is
  > Lakhbir's question — "Do we need a compliance role separate from Admin?" — and the five-role model is a decision. So:
  >   · `isAppRole('DPO')` is false, and `assignRole` refuses it exactly as it refuses any other word;
  >   · the `roles` table (migration 001) has no DPO row, so the database refuses a user holding it;
  >   · what it WOULD reach — the compliance registers and nothing else — is `DPO_RULES` in src/core/authz.ts, and while
  >     `DPO_ROLE_SWITCH` is off `can()` refuses a DPO actor every action, which is what it did before this existed.
  > Enabling it is three changes, made only once the question is answered: the switch, a migration adding the role row,
  > and the role joining APP_ROLES.

### `src/shared/upload-handler-port.ts`

- Line 96:

  > Phase 129. The legal-form test, the roles that are always a person, and the human-capture rule's role tokens and
  > backstop patterns, AS THE INGESTION MODULE STATES THEM. src/web/conveyancing-strip.ts reads them here and restates none.

## 12 Sept 2026: Phase 153c

### `src/integrations/registers/source-register.ts`

- Line 442:

  > THE ADDRESS LOOKUP. Board item 13003875907. Written 12 September 2026 by
  > Phase 129 from the supplier's OWN PUBLISHED PAGES, read that day:
  >   https://homedata.co.uk/terms            (Terms of Service, "Last updated: November 2024")
  >   https://homedata.co.uk/about            ("Sourced from ... OS AddressBase ...";
  >                                            "Licensed under Open Government Licence and commercial agreements")
  >   https://homedata.co.uk/docs/pricing     ("Address endpoints carry Royal Mail PAF / Ordnance Survey licensing")
  >   https://homedata.co.uk/docs/endpoints   (the uprn is "a public OS AddressBase id")
  >
  > WHAT THE TERMS STATE, AND THIS ENTRY CARRIES AS STATED
  >   §7  data "owned by Homedata or our licensors"; "a limited, non-exclusive
  >       licence to use the data in accordance with your subscription plan".
  >   §4  the customer may not "Resell or redistribute our data without
  >       authorisation" — hence redistribution false on every outward channel.
  >   §6  data "provided 'as is'" with no accuracy guarantee — hence max grade B.
  >
  > WHAT THE SUPPLIER DOES NOT PUBLISH, AND THIS ENTRY REFUSES TO INVENT
  >   - a licence NAME: none. `name` says so.
  >   - ATTRIBUTION WORDING: none. `attribution_text` is a NOT PUBLISHED marker,
  >     never a guessed Royal Mail or OS line. No outward channel is open, so the
  >     marker cannot reach a report without a redistribution breach firing first.
  >   - a CACHE WINDOW: none. `cache_max_age_days` is 0, and 0 IS OUR REFUSAL,
  >     NOT THEIR FIGURE: a returned address is stale the moment it is held and
  >     must be re-fetched before it drives anything. NULL WOULD MEAN "NO LIMIT",
  >     which is an unpublished fact asserted in the permissive direction (N4).
  >   - permission to reproduce in a client report, an accountant pack or an
  >     HMRC pack: none beyond §4's prohibition.
  > The supplier's own contact for these is legal@homedata.co.uk (§13).
  >
  > PHASE 153c, 4 October 2026 — THE KEEP-UNTIL PERIOD IS SEVEN YEARS IN THE TEST SYSTEM (Word question 37). Built
  > on our recommendation, for the officer and Homedata to check: an address and its property number are kept with
  > the claim file for seven years (2,557 days), like the rest of it, so a claim checked years later can still say
  > which building every figure was matched on. It is OUR TEST READING, NOT HOMEDATA'S FIGURE, and it stands only
  > until Homedata answers the drafted email in writing. EVERY OUTWARD CHANNEL STAYS CLOSED: nothing from this source
  > reaches a client, accountant or HMRC report. The same reading covers GoAddress ("Find my address",
  > src/integrations/connectors/address-lookup.ts ADDRESS_KEEP_UNTIL), which publishes no period either.

## 12 Sept 2026: no phase named

### `src/core/authz.ts`

- Line 913:

  > --- dashboards, search, saved views, export and admin settings. CRM 9 of 10, 12 September 2026 ---
  >
  > EVERY ROW BELOW IS NEW AND EVERY ROLE NOT NAMED IS REFUSED — test/dashboard.test.ts
  > asserts the refusal for each one, per action.
  >
  > `dashboard.enter` OPENS THE MANAGEMENT DASHBOARD AND NOTHING INSIDE IT. Every tile
  > asks the actions its own figures already need — `pipeline.read`, `claim.read_value`,
  > `invoice.read`, `claim_figures.read`, `compliance.read` and the rest — so a role that
  > enters sees only the tiles those rows admit, and SURVEYING, which holds none of them,
  > sees its own survey jobs and nothing else. A tile is never a second rule.
  > ------------------------------------------------------------------------

- Line 950:

  > --- the CRM follow-on, 12 September 2026 ------------------------------------
  >
  > EVERY ROW BELOW IS NEW AND EVERY ROLE NOT NAMED IS REFUSED — test/follow-on.test.ts
  > asserts the refusal for each one, per action.
  >
  > THE CLAIM TEAM. Reading the team is the actions its parts already need — `contact.read` for the organisation's
  > accountant and adviser, `claim_figures.read` for the tax adviser's sign-off record — so a surveyor is drawn the
  > owner and the surveyor it already reads and nothing else. LINKING A CONTACT TO A CLAIM, and ending the link, is
  > ADMIN's and SALES's, the people who keep the organisation's contacts. A contact is never a user.
  >
  > THE DOCUMENT CENTRE is a list over every document, and every row on it is still asked of `document.read` on the
  > document itself — so a role that enters sees only the documents that rule admits, and a surveyor the claim evidence
  > of its own jobs. CLIENT is not on it: the portal is the client's list.

### `src/core/search.ts`

- Line 1:

  > GLOBAL SEARCH — LIMITED BY can() INSIDE THE QUERY, NEVER FILTERED AFTERWARDS.
  > CRM 9 of 10, 12 September 2026.
  >
  > The scope is 09-app/CAPREBATE-CRM-DISPOSITION.md, row 16.1, and the decisions
  > this file takes are that table's Part E from E119. The page is
  > src/shared/lists-pages.ts; the proof is test/search.test.ts and
  > tools/payload-proof.ts.
  >
  > ───────────────────────────────────────────────────────────────────────────
  > WHAT "INSIDE THE QUERY" MEANS HERE, EXACTLY
  >
  > For every kind of record, `can()` is asked FIRST, on an object that stands for
  > the whole kind, twice: once as a record no survey job reaches, and once as one
  > the reader's own job reaches. The answer picks one of a small number of FIXED
  > SQL statements — every row, only the rows a job of the reader's reaches, or no
  > statement at all. A role that may not read a kind is never searched against it,
  > so a row it may not read is never fetched to be thrown away. Every row that
  > comes back is then AUTHORISED — `authorise`, which throws — so a statement that
  > ever returned a row its reader may not read fails loudly instead of being
  > quietly filtered, and a test holds that equivalence.
  >
  > NO ROLE NAME IS READ. The scope comes from the rule table itself.
  >
  > ───────────────────────────────────────────────────────────────────────────
  > NEVER SEARCHED, FOR ANY ROLE
  >
  >   the identity store      identity_persons and identity_search_log (migration 017)
  >   the compliance registers rights_requests, complaints, breach_incidents, cdd_checks,
  >                           consent_answers — they keep their own search, searchPerson,
  >                           under compliance.read
  >   document text           no statement here reads a document's content
  >   the estimate            no statement here reads `estimates`
  >   note bodies             for a role without internal_note.read — the kind is not searched
  >
  > `NEVER_SEARCHED` lists them, and test/search.test.ts reads this file's source
  > and fails if any of those tables is named in it, then plants a name in each and
  > searches for it.

### `src/core/seed.ts`

- Line 178:

  > A CLAIM AT THE INVOICE STAGE, READY FOR OUR FEE — the CRM follow-on, 12 September 2026. Invented, like everything here.
  >
  > WHY IT EXISTS. No seeded claim stood at INVOICE, so "Raise our fee" could not be shown in training, and the guide's
  > exercise for it could not be run. This is a second property of Dunmarrow's — a branch surgery, on the organisation whose
  > survey job the surveyor already holds, so the surveyor's reach grows by this claim and by no other organisation — opened
  > by staff and walked to INVOICE with the records every gate on the way reads, so the fee can be raised through the real
  > store and nothing about it is typed:
  >
  >   · a survey job on the claim with the surveyor's commitment, which the sign-off record is made against;
  >   · the tax adviser's sign-off record, recorded after the claim entered the sign-off stage — the figure the fee derives from;
  >   · both reports issued in the deliverables register — the client report and the accountant's computation pack;
  >   · the amendment window open: a company, the branch surgery acquired inside the recorded accounting period;
  >   · the fee trigger reached at its most cautious reading — HMRC has processed the relief — confirmed at INVOICE;
  >   · a next action owned by Accounting, and NO fee invoice, so the finance view counts it as a fee expected.
  >
  > WRITTEN AS ROWS, as every seeded row is, and each passes the database's own triggers. THE FIGURES ARE CHOSEN SO THAT NO
  > DIGIT RUN OF THEM IS ONE OF THE SEALED ESTIMATE'S SEVEN VALUES — tools/payload-proof.ts searches for those as raw text.

### `src/shared/lists-pages.ts`

- Line 1:

  > GLOBAL SEARCH, THE LIST CONTROLS, SAVED VIEWS AND CSV EXPORT — the routes and the
  > blocks. CRM 9 of 10, 12 September 2026.
  >
  > Same shape as every other section: it returns 'not-mine' for anything it does not
  > own. It is mounted in staff.ts BEFORE the CRM and pipeline sections, because the
  > export routes share their prefixes.
  >
  > NOTHING HERE DECIDES ANYTHING. src/core/search.ts and src/shared/lists.ts ask `can()`
  > for every row and every column; this file draws what they return with the `h`
  > tagged template, and serves a CSV body those functions built.

### `src/shared/lists.ts`

- Line 1:

  > THE LISTS — FILTERS, SORTS, SAVED VIEWS AND EXPORT. CRM 9 of 10, 12 September 2026.
  >
  > The scope is 09-app/CAPREBATE-CRM-DISPOSITION.md, rows 16.2 to 16.6, and the
  > decisions this file takes are that table's Part E from E119. The pages are the
  > claims and leads lists (src/web/crm-pages.ts, src/web/pipeline-pages.ts), which
  > draw `listControls` from src/shared/lists-pages.ts; saved views are migration 018.
  >
  > ───────────────────────────────────────────────────────────────────────────
  > A FILTER OR A SORT IS A KEY IN A FIXED TABLE, NEVER SQL. `readParams` reads a
  > request through `CLAIM_FILTERS`, `LEAD_FILTERS` and the two sort tables; an
  > unknown key is dropped and said, and an ORDER BY is never built from a request
  > value — the rule src/web/engaged-pages.ts already follows (row 16.4). The rows
  > are read once, each asked of `can()`, and then filtered and sorted in code.
  >
  > A LIST IS BUILT FORWARDS FOR ITS READER, EXACTLY AS THE LIST BEFORE IT WAS.
  > ACCOUNTING reads a claim as client and reference — the test `claimList` in
  > src/web/crm.ts makes, and the statement it reads carries no join to the
  > property, the lead, the assessment or the estimate. SURVEYING reads the working
  > line and never a value: its statement carries no estimate at all. A filter or a
  > sort on a column the reader does not read is ignored, and the page says which
  > and why. Value is filtered and sorted only where `claim.read_value` says yes,
  > and a claim with no estimate is in no value filter — not known is not below or
  > above a figure (N4).
  >
  > EXPORT IS THE LIST, AS CSV, AUDITED. The columns are the reader's own row shape
  > and no more; the audit line names the list, the columns, the row count, the
  > filter keys and the sort — never a value. Every cell that begins with = + - @, a
  > tab or a carriage return is neutralised against spreadsheet formula injection.
  > No export reaches the compliance registers, S2 or the retention list: nothing
  > here reads them.

## 14 Sept 2026: Phase 132

### `src/core/audit.ts`

- Line 292:

  > Phase 132, 14 September 2026: a sealed case stamped as a deliverable is issued — the engine version, the rulebook
  > versions, every switch and the sign-off references, in `claim_version_stamps` — and a defence pack manifest built,
  > which the generator's switch keeps from happening today. Ids, kinds, counts and hashes only.

### `src/core/authz.ts`

- Line 902:

  > --- the defence pack generator. Phase 132, 14 September 2026 ---------------
  >
  > NEW, AND EVERY ROLE NOT NAMED IS REFUSED — test/phase132-records.test.ts asserts
  > the refusal for each one. The generator is switched off (`DEFENCE_PACK_GENERATOR`
  > in src/web/defence-pack.ts), so today this row admits a person to a refusal that
  > says so. Switched on it builds a manifest from the claim's sealed records and
  > issues nothing: ADMIN and SALES, who hold the claim's figures and its papers, as
  > `claim_figures.read` and `deliverable.record` are. No route asks it yet.
  > ------------------------------------------------------------------------

### `src/shared/engine.ts`

- Line 368:

  > The engine's claimant readings for the window: a company, anyone filing self assessment, or — Phase 132,
  > 14 September 2026 — a partnership or LLP, whose date turns on whether a partner or member is a company.

### `src/shared/upload-handler-port.ts`

- Line 77:

  > Phase 132, 14 September 2026. The host's backup cycle — NOT SET, a named blank on every deletion — the guard that
  > refuses to restore a deleted record without the data protection officer's approval, and RET-3's clock, AS THE
  > INGESTION MODULE STATES THEM. The deletion log in migration 022 and the retention list read them here and restate none.

## 15 Sept 2026: Phase 132

### `src/core/server.ts`

- Line 116:

  > THE CLOCK — Phase 132, 15 September 2026. Absent means the real one, as before. A test whose seed or fixtures
  > carry fixed calendar dates passes a fixed clock, so it reads the same on any day it runs: four tests read the
  > wall clock through here and went red before September 2026, and one again from 31 December 2027.

## 15 Sept 2026: Phase 132e

### `src/integrations/registers/boundary-import.ts`

- Line 536:

  > Phase 132e. Answers "may we use land boundary data for this?" without
  > throwing, so a screen or a back-end route can show the reason to a person.
  > It only reads the permission; it never fetches, stores or changes anything.
  >
  >   - INTERNAL_CALCULATION: permitted when the permission allows internal
  >     calculation (it does, as decided on 15 September 2026).
  >   - CLIENT_REPORT_DISPLAY: permitted only when the permission allows report
  >     reproduction (it does not).
  >   - FETCH: always refused while BOUNDARY_FETCHING_SWITCHED_ON is false,
  >     whatever the permission says. A permission governs what may be done
  >     with boundary data once we have it; it never switches fetching on.
  >   - anything else, including "not sure" and undefined: refused, with the
  >     same answer every time.

## 16 Sept 2026: Phase 132e

### `src/core/audit.ts`

- Line 128:

  > Phase 132e. A call cancelled outright — by the client in the portal. The
  > booking row survives with `cancelled_at` and `cancelled_by` set; the detail
  > says who (CLIENT or STAFF) and never the time.

- Line 134:

  > Phase 132e. The client's own written filing confirmation, where there is no accountant — which answers were a yes, never the text.

- Line 136:

  > Phase 132e. A multi-site discount proposed on a claim's fee — recorded, never applied; the share and state, never the reason.

### `src/core/authz.ts`

- Line 372:

  > THE FIVE ROLES' TABLE. READ_ONLY is excluded from its type on purpose (Phase 132e):
  > the view-only role is decided by `READ_ONLY_RULES` below, one explicit yes or no per
  > action, and never by a key here — so it cannot be given an action by being added to a row.

- Line 849:

  > Phase 132e: recording the client's own written filing confirmation, where the client has no accountant — the
  >      people who hold the claim's papers, as a deliverable is. Nobody else; test/phase132e.test.ts asserts it per role.

- Line 852:

  > Phase 132e: a multi-site discount is proposed by the people who agree terms with a client, and read by them and by
  >      finance. It is a record and is never applied: see src/web/fee-discounts.ts.

- Line 978:

  > ------------------------------------------------------------------ *
  > THE READ-ONLY ROLE — AN EXPLICIT YES OR NO ON EVERY ACTION.
  > Phase 132e, 16 September 2026.
  >
  > Lakhbir: "One main log in for admin/manager/owner, and another log for view
  > only". ADMIN is the main login. READ_ONLY is the view-only one, and it is
  > assigned to nobody (no seed user).
  >
  > WHY A TABLE OF ITS OWN, AND NOT A COLUMN IN `RULES`. A role absent from a row
  > of `RULES` is refused, which is right — but it is refused SILENTLY, and a
  > future row that forgot this role would be decided by forgetting. Here every
  > registered action carries a decision and a reason, and test/authz.test.ts
  > loops over `REGISTERED_ACTIONS`: an action with no entry below fails that
  > test, and every entry that says no is asserted refused.
  >
  > THE PRINCIPLE, DECIDED CONSERVATIVELY:
  >   1. IT WRITES NOTHING. Every action that creates, changes, moves, records,
  >      switches, queues, uploads or assigns is a no. The one exception is
  >      changing its OWN password, which changes no business record and which
  >      every login must be able to do.
  >   2. IT NEVER SEES WHAT IS SEALED. The sealed estimate (`estimate.read`), the
  >      claim value (`claim.read_value`), the claim's figures
  >      (`claim_figures.read`), the facts that feed them (`claim_facts.*`), the
  >      value an introducer referred and the survey workspace — whose payload is
  >      released to any role the quarantine does not name — are all no. So are
  >      the fee and money (`invoice.read`, `introducer.read_money`,
  >      `introducer_fee.read`): our fee is a flat percentage of the allowances
  >      identified, so a fee IS the claim value, divided.
  >   3. IT NEVER READS THE REGISTERS ABOUT PEOPLE OR ABOUT US. The compliance
  >      registers, the identity store, the disclosure log and the audit log are no.
  >   4. IT EXPORTS NOTHING. `list.export` is no: a file leaves the application,
  >      and no rule follows it.
  >   5. WHAT IT READS, IT READS AS SALES WOULD, WITHOUT THE VALUE — the
  >      organisation, its contacts one at a time, properties, claims, leads, the
  >      pipeline, bookings, tasks, the timeline, documents that carry no value,
  >      the deliverables register and the settings screens. Every page is built
  >      forwards from the actions it asks, so a page READ_ONLY opens is drawn
  >      without the parts a "no" below withholds.
  > ------------------------------------------------------------------

- Line 1247:

  > Phase 132e: the view-only role is decided by its own explicit table and by nothing below.

### `src/core/backoffice.ts`

- Line 323:

  > Phase 132e: when the call was cancelled, and by whom. Both null on a call still held.

- Line 364:

  > Phase 132e. CALLS THAT WERE CANCELLED — by the client in the portal — newest
  > first, with who and when. Not filtered by the window, like the queue above:
  > a cancellation is something the person who owned the call needs to see. The
  > enquiry behind each one is still open; nothing here closes it.

- Line 449:

  > Phase 132e: a cancelled call is final on its row (migration 025) — say so rather than let the trigger throw.

- Line 539:

  > Phase 132e: the assign control's list for a reader who may arrange calls, and an empty list for one who may only
  > read the calendar — the view-only login opens the calendar and is never shown the control, instead of being refused
  > the whole page because the control's list asks `booking.write`.

### `src/core/roles.ts`

- Line 25:

  > PHASE 132e, 16 September 2026: A SIXTH ROLE, READ_ONLY — "One main log in for
  > admin/manager/owner, and another log for view only" (Lakhbir). What it may do
  > is an explicit yes or no per action in `READ_ONLY_RULES` (src/core/authz.ts), and
  > it is assigned to nobody. The five below it are unchanged.

- Line 59:

  > Phase 132e: THE CONSERVATIVE MAPPING. READ_ONLY never reaches the quarantine — it is on neither
  >      `estimate.read` nor `surveyor_job.read` — but if a future route ever handed it a survey payload, the
  >      quarantine would withhold the sealed estimate from it as it does from the surveyor.

### `src/core/router.ts`

- Line 1503:

  > Phase 132e: a third verb, `cancel`, on the same route — see cancelOwnBooking in portal.ts.

- Line 2103:

  > MOVING OR CANCELLING YOUR OWN CALL — Phase 113a, revised by Phase 132e.
  >
  > IT DRAWS WHAT THE STORE WOULD ACCEPT, AND NOTHING MORE. Every condition below
  > is asked of the same functions the write path asks: `BOOKING.booksASlot` for
  > whether this channel holds a moment at all, `P.tooSoonForNewTime` for the new
  > time's notice period, and `publicSlots` for the times. THE FORM IS NOT THE
  > CONTROL — a client who posts a time this panel never drew is refused by
  > `isBookable` and the notice period at the moment of writing.
  >
  > PHASE 132e: THE CONTROL IS DRAWN AT ANY TIME, however close or past the call
  > is ("Give the client full control to cancel at any time, and rebook at a time
  > that suits them"). THE ORDER IS THE DECISION: new times first, then "ring me
  > instead", then cancelling outright.

### `src/core/seed.ts`

- Line 576:

  > CAPREBATE'S OWN FINANCE, ON THE CLAIMS — CRM 7 of 10.
  >
  > THREE INVOICES, ONE PER STATE THE MONEY CAN BE IN, each on the organisation's
  > assessed claim: raised and unsent with nothing received; sent with part
  > received, and the bank-details confirmation NEVER ASKED; sent and received in
  > full, confirmed on another channel. £300,000 of allowances, £9,000 of fee —
  > 3% on the allowances, as the reasoning above says. No VAT: the recorded
  > position is not registered. DUE 14 DAYS AFTER THE INVOICE DATE: clause 4's payment terms, completed by Phase 132e.
  >
  > WRITTEN AS ROWS, as every seeded row is — the claims are not at the invoice
  > stage, so the store would rightly refuse to raise them. The numbers come from
  > the series itself, so the seeded invoices are CB-000001 to CB-000003 and the
  > first one anybody raises is the next. The pool split is set on two, so the
  > finance view shows both a bounded and a determined comparison.

- Line 614:

  > Phase 132e: clause 4 now states the payment terms — within 14 days of the date of the invoice.

### `src/integrations/postcodes/postcode-port.ts`

- Line 88:

  > Phase 132f: the region switches (Phase 132e). Passed explicitly by resolveProperty; the Inner London switch is OFF.

### `src/integrations/postcodes/postcode.ts`

- Line 209:

  > PHASE 132f — THE REGION SWITCHES ARE PASSED, NOT DEFAULTED BY OMISSION. Phase 132e gave regionOf a switches
  >        argument (SURVEYOR_INNER_LONDON_ONS_FOURTEEN). This application passes the module's own REGION_SWITCHES,
  >        which ship it OFF: London still refuses, with the same code, message and detail as before. Only the boolean
  >        `true` turns it on, and turning it on is the surveyor's answer, not this file's; `opts.regionSwitches` exists
  >        so a test can prove the argument reaches the module.

### `src/integrations/postcodes/region.ts`

- Line 184:

  > ------------------------------------------------------------------ *
  > 2a. Inner and Outer London — the ONS list, behind a surveyor switch
  >     (Phase 132e, 16 September 2026). OFF.
  > ------------------------------------------------------------------

### `src/integrations/registers/boundary-import.ts`

- Line 1:

  > Caprebate — Land Boundary Import Connector
  > Board item 12830205914: "Pull in land boundary maps to get site size
  > (waiting on the licence)". Phase 9, item 1.
  >
  > STATUS: PREPARED, NOT SHIPPED. No live data has ever been pulled through
  > this module. See caprebate-boundary-import.md for the full specification,
  > the three-outcome licensing design, and every format assumption flagged for
  > verification once the licence lands.
  >
  > WHAT THIS IS. A connector that takes title/parcel boundary geometry (and,
  > separately, a building-footprint geometry) and derives two numbers for the
  > property profile:
  >   - site_area_m2            (new field, area_m2, schema §1.C conventions)
  >   - building_coverage_ratio (new field, decimal 0-1, footprint / site)
  >
  > THE DESIGN CONSTRAINT THAT MATTERS MOST. Licensing has three possible
  > outcomes and the middle one is the likely one:
  >   (a) NOT_CLEARED               — never cleared at all
  >   (b) INTERNAL_CALCULATION_ONLY — compute the numbers, never reproduce the
  >                                   map/geometry in an outgoing report
  >   (c) FULL_REPRODUCTION         — geometry may appear in reports too
  > PHASE 132e (16 September 2026): (b) is now DECIDED, not assumed — by
  > Lakhbir Dhillon, Head of Business Development, answer read 15 September 2026. Fetching is still
  > OFF (§7, §10). Both attribution statements are in the sources note (§12).
  > This module is built so that moving between (a)/(b)/(c) is a change to
  > CURRENT_LICENCE_PERMISSION alone (§7) — no other line changes. The split is
  > structural, not conventional: derived numbers travel as `DerivedScalar<T>`
  > (safe, freely embeddable in any report); geometry travels as an opaque
  > `CartographicArtefact` handle whose actual coordinates live in a
  > module-private WeakMap and can be read out only via
  > `releaseGeometryForReport`, which is the single choke point that checks
  > `allow_report_reproduction` and is capable of refusing (§6, §9).
  >
  > Schema authority: Build-Prep-Consolidated-Schema.md §0.2 (type system),
  > §0.3 (UNKNOWN rule — not engaged here, no GATE fields), §0.4 (provenance
  > codes), §0.5 (confidence grades + grade inheritance), §1.C (property
  > profile — see the note on `gross_internal_area_m2` grade D and this
  > module's reasoning for why a boundary-derived site area is graded
  > differently, in the .md spec).
  >
  > Grade/ProvCode/worstGrade below intentionally MIRROR
  > phase3/caprebate-source-register.ts rather than importing it, so this
  > remains a self-contained, independently reviewable three-file deliverable
  > (see spec, "known duplication").
  >
  > Runs on Node >= 22.6 with type stripping (`node file.ts`). No enums, no
  > namespaces, no parameter properties — those are not strippable.
  >
  > Run the tests:
  >   node --test caprebate-boundary-import.test.ts

- Line 420:

  > Phase 132e. Where the decision was recorded, in plain words, so a reader
  > can go and check it. Optional: the hand-built permissions in the tests
  > (and any older caller) have no record, and that is fine — nothing in this
  > module reads this field to decide anything.

- Line 427:

  > Phase 132e. The date the decision was built into this file (ISO date). Record only, never read to decide anything.

- Line 518:

  > Phase 132e. What someone is asking to do with land boundary data. Only these
  > three exact values are recognised. Anything else — "not sure", undefined,
  > null, an empty string, a misspelling — is treated as unrecognised and
  > REFUSED, identically (rule N4: "not sure" and absent behave the same).

- Line 913:

  > ------------------------------------------------------------------ *
  > 12. Sources note — the two attribution statements (Phase 132e)
  > ------------------------------------------------------------------

### `src/shared/engine.ts`

- Line 58:

  > ================================================================== *
  > THE FEE, WHAT THE CLIENT ACTUALLY GETS BACK, AND THE TWO SWITCHES
  >
  > CB_FEE, CB_BENEFIT and CB_FEEGUARD reach TypeScript as `OpaqueModule`,
  > which is `{ readonly [member: string]: unknown }` — a shape with no members
  > a caller can use without narrowing. The narrowing belongs HERE, in the one
  > bridge file, for the same reason every other engine call does: a `as` cast
  > at each call site is four places for the shape to be described differently.
  >
  > NOTHING BELOW COMPUTES ANYTHING. Each function narrows a type and calls the
  > module. The 3% rate (5% until Phase 132e, 16 September 2026), the basis, the disclosure, the benefit schedule, the
  > three-valued comparison and both switch positions are the engine's, and
  > this file may not "correct" any of them.
  > ==================================================================

- Line 140:

  > CB_FEE.recommendationThreshold's answer — Phase 132e. Transcribed from the module; every field is present on
  > every path. It refuses no work, withholds no quote and moves no figure, and it is AWAITING THE TAX ADVISER'S
  > REVIEW (its own metadata says so).

- Line 214:

  > ================================================================== *
  > THE ENGAGEMENT GATE, WITH ITS COSTING INJECTED — PHASE 132f, 16 September 2026
  >
  > Phase 132e switched CB_GATE_CONFIG on (120 jobs this year), and nothing handed it costs: `costing` ships null, so
  > every assessment came back UNDETERMINED naming "costing" and the gate stopped nothing. The engine says the costing
  > is "injected by whatever runs it", and that the only calculator is
  > 09-app/backend/src/modules/survey/costing/job-economics.cjs `costingForGate`. This is the back end injecting it.
  >
  > SCOPED, NOT PERMANENT. The costing is set on CB_GATE_CONFIG for one synchronous call and put back in `finally`,
  > the mutate-and-restore Suite T of the site harness uses. A permanent injection would change every `feeDisplay`
  > call in this package that ever passes a sector, silently; this way the gate runs where it is asked for by name.
  >
  > NOTHING HERE COMPUTES A COST OR A THRESHOLD. The loaded cost is phase9's, the margin, the volume, the scenario,
  > the comparison and the outcome words are CB_GATE's. The one thing this file adds is a vocabulary join: the engine
  > calls the sector `care_homes` and phase9 calls it `care_home`. Without the join a care home would never be
  > costed (UNDETERMINED for ever — safe, and a gate that stops nothing, which is the defect being fixed).
  > Supported living has NO cost row in phase9, so it stays UNDETERMINED naming `sector` — never a pass, never a
  > refusal. If the phase9 module cannot be loaded the costing is absent and every answer is UNDETERMINED.
  > ==================================================================

- Line 453:

  > CB_FEE.RATE — 3% of the allowances identified. Phase 132e, 16 September 2026: Lakhbir, "yes, flat fee of 3% of the
  > allowances for 1 or more properties", no bands and no minimum. It was 5% (Q55, 3 September 2026). Read, never typed.

- Line 473:

  > CB_FEE.MULTI_SITE_DISCOUNT — Phase 132e. "A further multi-site discount can be applied depending on
  > site/opportunities": discretionary, no fixed tiers, never applied automatically, and the largest discount and who
  > approves it are asked, not invented. Narrowed here and nowhere else; a missing object reads as undecided.

## 16 Sept 2026: Phase 132f

### `src/shared/engine.ts`

- Line 131:

  > Phase 113d, read by the back end from Phase 132f: the engagement gate, assessed on every call.

- Line 133:

  > Phase 132e, read by the back end from Phase 132f: the £1,000 no-claim threshold.

## 16 Sept 2026: Phase 151l

### `src/integrations/registers/boundary-import.ts`

- Line 446:

  > THE ONE SWITCH. To move to outcome (a) or (c), change this constant —
  > nothing else in this file. Every function that needs a permission defaults
  > to reading it here.
  >
  > DECIDED, Phase 132e (built 16 September 2026). Until this phase the value
  > below was the same outcome, but only as an unconfirmed default. It is now a
  > recorded decision:
  >   - Decided by Lakhbir Dhillon, Head of Business Development. His answer "Yes" to "Switch on
  >     automatic site area from the land boundaries, without waiting for
  >     Ordnance Survey?" was read on 15 September 2026 (Phase 132c): internal
  >     calculation only, and boundary maps stay out of client reports.
  >   - Internal calculation: PERMITTED (allow_internal_calculation: true).
  >   - Showing the boundary, a map or its coordinates in a client report:
  >     NOT PERMITTED (allow_report_reproduction: false). HM Land Registry's
  >     published conditions would allow it with both attribution statements,
  >     but that is a separate decision and has not been taken.
  >
  > The fields are written out by name, on purpose, so the permission can be
  > read at a glance. The check straight after this constant makes sure the
  > written-out fields still agree with `permissionFor(outcome)`, so there is
  > still exactly one authoritative knob (the outcome), not two booleans that
  > could drift apart.
  >
  > WHAT THIS DOES NOT DO. It does not switch fetching on. Nothing in this file
  > fetches: DEFAULT_FETCHER still always refuses, and BOUNDARY_FETCHING_SWITCHED_ON
  > (§10) is still false. The real fetcher of HM Land Registry's INSPIRE Index
  > Polygons was built, and left switched off, by Phase 150 (24 September 2026)
  > at 09-app/backend/src/connectors/inspire.ts. The data protection officer's
  > question on small, logged test lookups was answered by Lakhbir on 25
  > September 2026 (yes, on five conditions), and Phase 151l (28 September 2026)
  > built the first download as a test lookup under them: `smoke HMLR_INSPIRE`
  > in the back end, which switches the fetcher on for its one call and never
  > touches this module. Switching fetching on for the application is Lakhbir's
  > decision; a PASS from that test lookup, which proves the file's shape, comes
  > first. Building footprints still wait on Ordnance Survey.

## 16 Sept 2026: no phase named

### `src/integrations/postcodes/region.ts`

- Line 189:

  > WHAT THIS IS, AND WHAT IT IS NOT.
  >
  > It is the Office for National Statistics' split of London's 33 council
  > areas into Inner London (14) and Outer London (19), keyed on the council's
  > GSS code — the code NSPL carries on every postcode row, and the only input
  > this lookup reads. Names are here for a person to read; nothing matches on
  > them, because a name can be spelt three ways and a code cannot.
  >
  > IT IS NOT THE SURVEYOR'S ANSWER. The box under "Which London boroughs count
  > as Inner London?" in CAPREBATE QUESTIONS holds typed text choosing this
  > list. Nobody signed it, it carries no date and no confidence, and it was not
  > written by the surveyor or any other professional. So it is an UNSIGNED
  > DRAFT ANSWER. The list is built so that it is ready; the switch that uses it
  > waits on the surveyor, and nothing in this project may turn it on because
  > the draft exists.
  >
  > WHY THE CHOICE MATTERS. There are two published lists and they disagree on
  > three councils:
  >   - ONS (statistical, used for national and regional accounts and here):
  >     Haringey and Newham ARE Inner London; Greenwich is Outer London.
  >   - London Government Act 1963 (statutory): Greenwich IS Inner London;
  >     Haringey and Newham are Outer London.
  > A property in any of those three lands in a different region depending on
  > which list is used, and the price book prices the two regions differently.
  >
  > NO FIGURE MOVES, EITHER WAY. No regional cost factor is loaded:
  > CB_LOCATION_FACTORS ships empty against a purchase and a provenance
  > question, and not one factor is in this file (R1 asserts it). Turning the
  > switch on would change which region NAME a London job is filed under in
  > the surveyor rate library, and nothing else. Turning it off changes nothing.
  >
  > CHECKED AT ONS, 16 September 2026. Two ONS sources, read that day, agree
  > with each other and with the fourteen below, with no difference:
  >   1. ONS Open Geography Portal, "Local Authority District to Inner and Outer
  >      London (December 2022) Lookup in EN" (item 57d068039d484914991ce8da7cb3ca93)
  >      https://geoportal.statistics.gov.uk/datasets/57d068039d484914991ce8da7cb3ca93_0/about
  >      data: https://services1.arcgis.com/ESMARspQHYMw9BZ9/arcgis/rest/services/LTLA22_IOL22_EN_LU/FeatureServer/0
  >      33 rows: 14 under E13000001 "Inner London", 19 under E13000002
  >      (which ONS spells "Outer london").
  >   2. ONS Open Geography Portal, "Local Authority District (April 2025) to
  >      LAU1 to ITL3 to ITL2 to ITL1 (January 2025) Lookup in the UK"
  >      https://services1.arcgis.com/ESMARspQHYMw9BZ9/arcgis/rest/services/ITL125_ITL225_ITL325_LAU125_LAD25_UK_LU/FeatureServer/0
  >      Inner London is ITL2 TLI3 (Inner London - West) plus TLI4 (Inner
  >      London - East): the same fourteen. TLI5, TLI6 and TLI7 hold the other
  >      nineteen.
  > The codes are stable, but the London list changes only by statute or by an
  > ONS revision. If ONS re-issues the lookup, check it against these two maps.

### `src/integrations/registers/boundary-import.ts`

- Line 917:

  > The sources note for HM Land Registry's INSPIRE Index Polygons. Both
  > statements are copied word for word from HM Land Registry's conditions of
  > use, read on 16 September 2026 at
  > https://use-land-property-data.service.gov.uk/datasets/inspire (the wording
  > matches the reading of 13 and 15 September 2026 in the board item exports).
  >
  > HM Land Registry's statement is needed whenever the data is reused — which
  > includes a site area worked out from a polygon. The Ordnance Survey
  > statement is needed whenever the polygons themselves (their x, y
  > coordinates) are reused; we carry both every time, as the safe course.
  > The "[year of supply or date of publication]" placeholder is HM Land
  > Registry's own; fill it from the month of supply recorded against the figure.
  >
  > Text only. Having this note does not permit showing a boundary in a client
  > report (CURRENT_LICENCE_PERMISSION still says no) and does not switch
  > fetching on.

## 17 Sept 2026: Phase 133

### `src/integrations/registers/boundary-import.ts`

- Line 96:

  > Phase 133 (17 September 2026): translation from the published INSPIRE shape (§13).

- Line 100:

  > Phase 133 (17 September 2026): spatial join, point -> INSPIRE polygon (§14).

- Line 791:

  > PURE. Given a request, decides which datasets would need to be fetched and
  > what they would be fetched from — and returns that decision as inert data.
  > Contains no I/O of any kind. Two calls with the same input always produce
  > the same output.
  >
  > PHASE 133 (17 September 2026) — THE `/title/` LOCATOR BELOW DOES NOT MATCH
  > THE PUBLISHED DATA. HM Land Registry's INSPIRE Index Polygons carry no title
  > number: each polygon has its own Land Registry-INSPIRE ID, and one title can
  > have several polygons (findings: 04-phase-work/phase133/inspire-format-findings.md).
  > A title number cannot be used as a key into that data. The route from a
  > property to its polygon is the spatial join, `findInspirePolygonForPoint`
  > (§14): a British National Grid point inside exactly one polygon. That join is
  > deliberately NOT wired in here or into any fetch path. The locator is left
  > as it was so existing callers and tests are unchanged. Getting the point
  > (from an address lookup or HM Land Registry's own service) is a lookup
  > nobody has allowed.

- Line 949:

  > ------------------------------------------------------------------ *
  > 13. Translation from the PUBLISHED INSPIRE Index Polygon shape
  >     (Phase 133, 17 September 2026)
  >
  > HM Land Registry's own pages were read on 17 September 2026 (findings in
  > 04-phase-work/phase133/inspire-format-findings.md). Three things they say
  > differ from what §4 assumed:
  >
  >   1. Delivery is GML ("The files are published as GML files"; ISO metadata
  >      distribution format "GML 3.2.1"), one file per local authority, not a
  >      ready-made `{ exterior, holes }` record. A polygon on the boundary
  >      between two authorities "will appear in both local authority data
  >      files", so the same polygon can arrive twice.
  >   2. The identifier is the Land Registry-INSPIRE ID, one per polygon, NOT
  >      the title number: "Each registered title will have a single title
  >      number, which may contain several separate polygons. Each individual
  >      polygon will have a separate Land Registry-INSPIRE ID." The INSPIRE
  >      subset carries "the identifier, the create date and the polygon last
  >      updated date" only — no title number.
  >   3. The CRS is British National Grid (EPSG:27700), but HM Land Registry's
  >      published metadata writes it as the OGC URI
  >      `http://www.opengis.net/def/crs/EPSG/0/27700`, which §3 would refuse as
  >      E_UNKNOWN_CRS if passed straight through.
  >
  > WHAT HM LAND REGISTRY DOES NOT STATE on the pages read: the XML element
  > names inside the GML files, the exact srsName string on each feature, or
  > whether interior rings (holes) occur. So this translation starts AFTER XML
  > parsing: it takes one plain record per polygon, with rings as GML 3.2.1
  > `posList` text (space-separated "x y x y ..." pairs — the GML 3.2.1
  > standard encoding, not an HM Land Registry statement). A developer writing
  > the real fetcher must confirm the element names against a file HM Land
  > Registry supplies under the licence, and extract into this record shape.
  >
  > Pure: no I/O, no fetching. It does not switch fetching on — DEFAULT_FETCHER
  > still always throws and BOUNDARY_FETCHING_SWITCHED_ON is still false.
  > Every test fixture for it is invented.
  > ------------------------------------------------------------------

- Line 1130:

  > ------------------------------------------------------------------ *
  > 14. Spatial join: a point -> the INSPIRE polygon containing it
  >     (Phase 133, 17 September 2026). BUILT AND SWITCHED OFF.
  >
  > The published INSPIRE data carries no title number (§13), so a property can
  > only be matched to its polygon spatially: take a British National Grid
  > point for the property (easting, northing — e.g. an address point) and
  > find the polygon that contains it.
  >
  > Rules, all refusals rather than guesses:
  >   - exactly one polygon contains the point strictly inside -> that INSPIRE ID
  >   - none -> E_NO_FREEHOLD_POLYGON (a leasehold-only site, unregistered land,
  >     or the wrong point: the data covers freehold only)
  >   - more than one -> E_AMBIGUOUS_POLYGON, listing the candidates; never
  >     picks one (overlapping polygons exist in HM Land Registry's data)
  >   - the point lies exactly on any ring edge or vertex (a shared edge, an
  >     outer edge, or a hole's edge) -> E_AMBIGUOUS_POLYGON; never silently
  >     assigned to one side
  >   - a point inside a hole (inner ring) is not inside that polygon
  >   - absent, non-number or non-finite easting/northing -> E_INVALID_POINT,
  >     never defaulted to 0 (rule N4)
  >   - polygons not in EPSG:27700 -> E_UNKNOWN_CRS / E_CRS_NOT_PROJECTED, since
  >     the point is in British National Grid
  >
  > PURE: no I/O. NOT wired into planBoundaryFetch, fetchAndImportBoundary or
  > any fetcher. Getting the point itself — from an address lookup's
  > coordinates or from HM Land Registry's own service — is a lookup nobody has
  > allowed. DEFAULT_FETCHER still always throws; BOUNDARY_FETCHING_SWITCHED_ON
  > is still false.
  > ------------------------------------------------------------------

## 17 Sept 2026: Phase 133a

### `src/core/navigation.ts`

- Line 214:

  > Every address a login's menu links to — what the Phase 133a test opens.

### `src/core/router.ts`

- Line 311:

  > PHASE 133a: a signed-in person gets their application's header — the back office's for staff, the portal's for a client.

- Line 315:

  > PHASE 133a — THE REFUSAL, AS A PAGE. Which addresses answer a refusal with a page: the two applications' screens, and
  > not their data addresses, whose readers expect JSON or a file.

- Line 1155:

  > PHASE 133a: the header reads the database, the clock and the address from this context — see src/core/navigation.ts.

### `src/core/search.ts`

- Line 226:

  > PHASE 133a — THE GATE OF THE SEARCH SECTION, EXPORTED FOR THE NAVIGATION. The same call its store function makes first;
  > src/core/navigation.ts asks it to decide whether the section is in a login's menu, and test/phase133a.test.ts opens
  > every menu link for every login, so a gate that drifted from its route fails there.

### `src/core/server.ts`

- Line 268:

  > PHASE 133a: A REFUSED SCREEN IS STILL REFUSED — 403 — BUT AS A PAGE. A person who follows an address they may not

### `src/core/staff.ts`

- Line 171:

  > THE NAVIGATION — PHASE 133a. Until 17 September 2026 this drew the same twenty links for every staff role, on the
  > reasoning that a menu built from permissions puts an authorisation decision in a renderer. Lakhbir asked for "an easy
  > layout for each one of the logins", and the phase brief for a menu that "shows only what the role can open". The
  > reversal, and how it keeps the worry answered, is written at the top of src/core/navigation.ts: the menu asks each
  > section's own gate, and test/phase133a.test.ts opens every link for every login in both directions.

### `src/core/welcome.ts`

- Line 1:

  > THE WELCOME CARD — PHASE 133c, 17 September 2026 (B5).
  >
  > A person who has never seen the system is shown, on Home, the three jobs their login does most — taken from the
  > Phase 133a audit of each login's five most frequent jobs (04-phase-work/phase133a/ui-audit.md) — as buttons, until
  > they hide the card. Hiding it is stored on the user (migration 030) and audited; it never comes back.
  >
  > NOTHING HERE WIDENS WHAT A LOGIN MAY OPEN. Every button is an address that login's own menu already offers, and
  > test/phase133c.test.ts opens each one as that login and requires 200.

### `src/shared/assets.ts`

- Line 22:

  > WHICH TAB OR SECTION IS CURRENT, BY POSITION — PHASE 133b. Phase 133a marked the current record tab by its id (details,
  > related, activity). The five long screens name their own tabs, and admin settings names its sections from its lists, so
  > the current one is marked by POSITION instead: the n-th panel targeted marks the n-th link. One rule per position, up to
  > MAX_TABS in src/shared/components.ts, which refuses to draw more.

### `src/shared/components.ts`

- Line 1:

  > ONE SET OF COMPONENTS — PHASE 133a, 17 September 2026.
  >
  > The building blocks every redesigned screen draws with: a card, a badge, an empty state, a highlights panel, the
  > stage bar, record tabs, the record layout with its right-hand panel, and the pipeline board. Every one is built with
  > `h`, so every value is escaped on output, and every visual is a class in the one served stylesheet — there is no
  > style attribute and no script anywhere in this file.
  >
  > WHAT A COMPONENT NEVER DOES: read the database, or decide what a login may see. It draws what the caller's view
  > already carries, and a field the view does not carry is simply not drawn.

### `src/shared/html.ts`

- Line 98:

  > PHASE 133a: a header that carries its own home (the back office's or the portal's) is drawn as the application

- Line 106:

  > or icon-only mark exists yet (slide 24). Phase 133a's invented "C" square is gone.

### `src/shared/lists-pages.ts`

- Line 173:

  > PHASE 133a — A SORTABLE COLUMN HEADING. A heading is a link to the same list with its order changed and every filter
  > kept, for an order this login may already choose in the form beside the list (`v.sorts`, which leaves out what the
  > login may not read, such as the value). Any other heading is plain words. The current order is said in words.

### `src/shared/lists.ts`

- Line 611:

  > PHASE 133a — THE GATE OF THE CLAIMS LIST, EXPORTED FOR THE NAVIGATION. The same call its store function makes first;
  > src/core/navigation.ts asks it to decide whether the section is in a login's menu, and test/phase133a.test.ts opens
  > every menu link for every login, so a gate that drifted from its route fails there.

## 17 Sept 2026: Phase 133b

### `src/shared/components.ts`

- Line 164:

  > A TAB'S id IS ITS ANCHOR. The four record pages use details, related and activity; Phase 133b's screens name their own
  > (a business page's sources, a survey job's figures, finance's VAT). An id must be unique on its page and must not be an
  > id a form field already uses — the phase133b test opens every tab link and finds its panel.

- Line 188:

  > A SETTINGS SCREEN'S LEFT-HAND SECTION LIST — PHASE 133b. The same mechanism as the record tabs, drawn as a list down the
  > left: each entry links to its section's anchor, the stylesheet shows the targeted section and the first when none is.
  > Without CSS, or without `:has()`, every section shows one after the other under its own heading, so a browser's find
  > still reaches every row. Below 960 px the list sits above the sections.

## 17 Sept 2026: Phase 133c

### `src/core/audit.ts`

- Line 298:

  > Phase 133c, 17 September 2026: a person hid the welcome card on their home page. The user's id only.

### `src/core/help.ts`

- Line 1:

  > HELP, INSIDE THE APP — PHASE 133c, 17 September 2026 (B5).
  >
  > The "Help" link in every header opens the user guide's training section for the screen it was pressed on. The words
  > are the guide's own, copied in by tools/build-help.cjs (src/core/help-content.ts), so the page and the guide cannot
  > say different things. This file only draws them.
  >
  > THE MARKDOWN IS THE GUIDE'S, AND IT IS STILL ESCAPED. The renderer below understands only what Part 3 uses —
  > headings, paragraphs, lists, tables, a rule, bold, italic and code — and builds every piece with `h`, so a character
  > in the guide can never become markup.
  >
  > WHO SEES WHAT. Staff see any training section (the guide is a staff document, and it names no client). The client
  > sees the portal's own section, C6, without its trainer's exercise and self-check.

### `src/core/navigation.ts`

- Line 65:

  > PHASE 133c: A REFUSED FORM KEEPS WHAT WAS TYPED (B6). The router records what a POST carried here, and `problem()` in
  > src/core/staff.ts redraws the page the form was on with those values in it. `rerender` draws a GET of the back office
  > for that. Mutable on purpose: it is this one request's scratch space, and nothing outlives the request.

- Line 74:

  > ------------------------------------------------------------------ *
  > THE NAMES — BUILT, SWITCHED OFF, AND ASKED (PHASE 133c, B7 and B9)
  > ------------------------------------------------------------------

- Line 465:

  > ------------------------------------------------------------------ *
  > HELP — WHICH TRAINING SECTION A SCREEN OPENS (PHASE 133c, B5)
  > ------------------------------------------------------------------

### `src/core/required.ts`

- Line 1:

  > "(REQUIRED)" IN WORDS BESIDE EVERY REQUIRED FIELD — PHASE 133d, 17 September 2026 (D1).
  >
  > Phase 133c wrote "(required)" by hand into three forms (the task, the lead and the enquiry check). Every other form
  > that carries `required` showed nothing a person could read: the browser's own marker only appears after a failed
  > submit, and a screen reader or a printout never sees it. Rather than edit some ninety labels one by one — and miss
  > the next one somebody adds — `page()` in src/shared/html.ts passes every page body through this, as it already passes
  > it through `ukDatesInMarkup`. A test crawls every page every login reaches and fails on a required control whose label
  > does not say so (test/phase133d.test.ts).
  >
  > A CONTROL'S LABEL IS FOUND THE WAY A BROWSER FINDS IT, then one fallback:
  >   1. `<label for="x">` when the control has id="x";
  >   2. the `<label>` the control sits inside;
  >   3. a `<label>` with no `for` that ends immediately before the control (`<label class="fl">Name</label><input …>`),
  >      which is how the account and sign-up forms are drawn.
  > A label that already carries `class="req"` is left alone. Hidden inputs are not fields. The words go inside the label,
  > so they are read with the field's name.

### `src/core/router.ts`

- Line 272:

  > PHASE 133c: what the form carried is kept for this request, so a refusal can put it back where it was typed (B6).

- Line 278:

  > PHASE 133c — A GET OF THE BACK OFFICE, DRAWN INTO A STRING, for `problem()` to redraw the page a refused form was on.
  > It is the ordinary route under the same login, so it shows exactly what that login's GET shows and nothing else.

- Line 496:

  > PHASE 133c: the supplied logo, from memory, like the stylesheet — never from a path on disk.

- Line 1329:

  > PHASE 133c: the client's Help, and hiding the welcome card.

- Line 2276:

  > THE RANGE'S BASIS, FOR THE CLIENT — PHASE 133c. The brand book: "Estimates always render as a range with its basis
  > stated underneath" (slide 49). The same facts as RANGE_QUALIFIER, which the back office still shows, in the client's
  > words and with no build language.

### `src/core/staff.ts`

- Line 190:

  > PHASE 133c (B6): A REFUSED FORM KEEPS WHAT WAS TYPED. Where the request carried a form, the page it was typed on is

- Line 277:

  > ------------------------------------------ PHASE 133c · the welcome card and Help

### `src/shared/assets.ts`

- Line 32:

  > THE CAP REBATE COLOUR TOKENS — PHASE 133c, from the brand book v1.0, slides 31 to 33 and 60.
  >
  > Proportions 60 / 30 / 10: surfaces are white and Mist, type and structure are Cap Ink and Body Grey, and Cap Mint is
  > for emphasis only — the current tab, the current stage, one highlight per layout. Muted grey is for captions and the
  > footer, and only on white (it is exactly 4.50:1 on Mist, which is too close to the line to rely on).
  >
  > THE ACCENT IS NOT CHOSEN YET (slide 31 asks the design team for "one HEX that passes 4.5:1 on white — for links, CTAs
  > and in-app states"). It is ONE token, --accent, set to Cap Ink until then, with --on-accent the text drawn on it.
  > When the accent arrives, it is a one-line change here and test/phase133c.test.ts checks it against white and Mist.

### `src/shared/brand-logo.ts`

- Line 1:

  > THE CAP REBATE LOGO, AS A CONSTANT — PHASE 133c, 17 September 2026.
  >
  > The supplied file, byte for byte: 04-phase-work/phase133c/brand-assets/caprebate_logo_monoink_924.png (the mono-ink
  > stacked lockup, transparent, 924 x 620). The brand book forbids rebuilding the lockup (slide 29), so this is the
  > designer's PNG and not a drawing of it. It is held here as base64 and served from memory, the same way the stylesheet
  > is, so the application still has no route that maps a request onto the filesystem (assertNoStaticFileRoute) and the
  > Content-Security-Policy's img-src 'self' already covers it. test/phase133c.test.ts compares the served bytes with the
  > supplied file.
  >
  > ONLY THE MONO-INK LOCKUP IS SERVED. It is the one for a white ground. The stacked lockup is illegible below 100 px
  > wide, and there is no horizontal lockup or icon-only file yet (slide 24), so the back office shows the name in the
  > heading font instead.

### `src/shared/components.ts`

- Line 143:

  > PHASE 133c — "A STOP IS INFORMATION, NOT A FAILURE" (brand book slide 49). A gate that is not yet open reads "Not ready

- Line 203:

  > The right-hand panel: PHASE 133c puts the next STEP first where the page has one (a claim's move, a lead's checks), then
  > the next action, then quick actions. A quick action is passed only when its form is on the page.

- Line 219:

  > ================================================================== *
  > PHASE 133c — A NEW USER CAN USE IT. 17 September 2026.
  > ==================================================================

### `src/shared/html.ts`

- Line 102:

  > PHASE 133c — THE CAP REBATE BRAND. The name a person reads is "Cap Rebate", two words (brand book slide 1). The

### `src/shared/localtime.ts`

- Line 246:

  > ------------------------------------------------------------------ *
  > UK DATES FOR A PERSON — PHASE 133c, 17 September 2026.
  >
  > Every date a screen shows reads the same way: "24 Sep 2026"; a moment as
  > "24 Sep 2026, 12:32"; a recent moment as "Today, 12:32" or "Yesterday, 12:32";
  > a due date as "Due in 3 days" or "3 days overdue" with the date beside it.
  > STORED VALUES STAY ISO, and `localDate` above still returns ISO, because a
  > date input and every comparison want it. Only the words a person reads change.
  > ------------------------------------------------------------------

- Line 380:

  > THE DISPLAY EDGE FOR A WHOLE PAGE — PHASE 133c. Every date a person reads is in the UK form, on every screen, because
  > page() in src/shared/html.ts passes the page body through this: the text BETWEEN tags goes through `ukDatesIn`. Nothing
  > inside a tag is touched — so an input's value, a link's query string and a date field's ISO value stay ISO — and
  > neither is the text of <code>, <pre>, <textarea>, <script> or <style>, which is typed, copied or read by a machine.

### `src/shared/next-step.ts`

- Line 1:

  > THE NEXT STEP, IN PLAIN WORDS — PHASE 133c, 17 September 2026.
  >
  > A gate's needs are written for the record: "The surveyor’s commitment is recorded, on a survey job on this claim".
  > A person new to the system needs the answer first: what is still needed, and the one thing that fixes it. This file
  > holds that translation, in ONE table, and decides nothing. Whether a gate is open is still `gateOut` in
  > src/web/pipeline.ts, read on the request; a move is still refused on the server when the gate is not open, whatever
  > the card shows.
  >
  > A need this table does not know is shown in its own words, so a new gate can never be hidden by a missing row.
  > test/phase133c.test.ts reads every stage's needs on the seed and requires each to have a plain reading.
  >
  > THE ANCHORS are the claim page's own (src/web/crm-pages.ts): #move, #claim-facts, #claim-documents, #claim-tasks,
  > #add-task, #claim-deliverables, #claim-figures.

### `src/shared/voice.ts`

- Line 1:

  > THE BRAND BOOK'S AVOID LIST, IN ONE PLACE — PHASE 133d, 17 September 2026.
  >
  > Phase 133c wrote this list inside test/phase133c.test.ts. Phase 133d needs the same rules for the public site, the
  > notices page and the complaint form (03-app/caprebate-brand-check.cjs), and for the engagement letter now that the
  > test no longer exempts it, so the list lives here and both import it. Brand book v1.0, slide 15 (and 14 and 52).
  >
  > THREE WORDS ARE ALLOWED IN ONE SENSE ONLY, and each exception is the correct use, not a loosening:
  >  - "capital gains" where the text DISTINGUISHES it — "not capital gains tax", "separate from capital gains tax",
  >    "Is this the same as capital gains tax? No". Slide 15's rule is never to CONFLATE the two; saying they differ is
  >    how a page obeys it, and the engagement letter's "not against capital gains tax" is exactly that.
  >  - "guaranteed-use", the name of the period an NHS premises grant attaches to. It promises nothing.
  >  - "scheme" alone is not listed: on these pages it is a building ("a supported living scheme") or a pension scheme.
  >    What slide 15 forbids is a TAX scheme, so "tax scheme", "avoidance scheme" and "tax avoidance" are listed.

## 17 Sept 2026: Phase 133d

### `src/core/refill.ts`

- Line 1:

  > A REFUSED FORM KEEPS WHAT WAS TYPED — PHASE 133c, 17 September 2026 (B6).
  >
  > Until this phase a refusal landed on a separate "Not saved" page with a "Go back" link, and whatever the person had
  > typed was gone. `problem()` in src/core/staff.ts now redraws the page the form was on — the ordinary GET, under the
  > same login — and this file puts the typed values back into THAT form, puts the refusal's words at the top of it, and
  > opens the <details> and the tab that hold it, so the person sees the message where they typed.
  >
  > IT ONLY EVER WORKS ON MARKUP THIS APPLICATION DREW, and every value it writes is escaped. A password is never written
  > back. When the form cannot be found on the page (the refusal came from somewhere else), it returns null and the caller
  > shows the plain refusal with the typed values listed, so nothing typed is lost either way.
  >
  > THE MESSAGE SITS BESIDE THE FIELD IT IS ABOUT — PHASE 133d (D4). Phase 133c put it at the top of the form, because the
  > stores refused with a sentence and no field name. The ten most-used forms' stores now name the posted field a refusal
  > is about (`field` on the refusal: the task, the next action, a lead, an enquiry check, a claim move, the claim, the
  > organisation, a contact, a property, a document request). Where the form holds that field, the message is drawn
  > straight after it — after its <label> when the field sits inside one — and the field is marked aria-invalid and
  > described by the message. A refusal about no one field (a gate that is not ready, a claim that has closed) and any
  > form whose store does not name one keep the message at the top of the form, as before. Nothing is guessed.

### `src/core/staff.ts`

- Line 189:

  > PHASE 133d (D4): where the refusal names the field it is about, the message is drawn beside that field instead.

### `src/shared/html.ts`

- Line 107:

  > PHASE 133d (D1): every required field says "(required)" in words, put into its label here (src/core/required.ts).

## 17 Sept 2026: Phase 135

### `src/core/navigation.ts`

- Line 1:

  > THE HEADER AND THE NAVIGATION — PHASE 133a, 17 September 2026.
  >
  > Lakhbir: the CRM should "look and work like Salesforce — easy to use, intuitive, an easy layout for each one of the
  > logins". That is a set of layout patterns — a header with search, the user menu and my open work; a row of tabs per
  > login — and nothing of anybody's brand.
  >
  > THE MENU SHOWS ONLY WHAT THE LOGIN CAN OPEN, AND THAT IS A REVERSAL, ON INSTRUCTION. Until this phase the back office
  > drew the same twenty links for every staff role, on the reasoning (src/core/staff.ts, before this phase) that "a menu
  > built from `can()` would put an authorisation decision in a renderer, where the next person to add a section would
  > forget it, and the failure would be silent in both directions". Both halves of that worry are answered here rather
  > than set aside:
  >
  >   · THE MENU ASKS NO RULE OF ITS OWN. Every section names its `gate` — the very function its route's store calls
  >     first (exported beside that store for this purpose). The menu never decides; it asks the section.
  >   · THE FAILURE IS NOT SILENT. test/phase133a.test.ts opens every menu link for every login and requires 200, and
  >     opens every section NOT in a login's menu and requires 403. A section added to a route and not here, or a gate
  >     that drifts from its route, goes red in both directions.
  >
  > A SCREEN A LOGIN MAY NOT OPEN IS STILL REFUSED, NOT MERELY HIDDEN: typing its address answers 403, now as a page.
  >
  > NOTHING HERE READS A FIGURE. The Tasks tab counts my open tasks through `myWork`, which authorises every row it returns.
  >
  > PHASE 135, 21 September 2026 — A MENU IS A LOGIN'S DAILY WORK, NOT EVERYTHING IT MAY OPEN. Lakhbir found tabs repeating
  > each other and a dozen entries under More. Each login's menu is now named in `MENUS`, More holds at most four, and a
  > section off the menu still opens by its address for every login its gate admits. Both halves of the Phase 133a worry
  > still hold: a listed section is still drawn only where its gate admits the login, and test/phase135.test.ts asserts
  > every login's exact menu and every address's answer, so neither a menu nor a permission can drift unseen.

## 18 Sept 2026: Phase 2

### `src/core/navigation.ts`

- Line 134:

  > PHASE 135 — EACH LOGIN'S MENU, BY NAME. Lakhbir, 18 September 2026: the tabs repeated each other, and some logins had a
  > dozen entries under More. A login's menu lists the sections it does its daily job in — being allowed to open a section
  > is not a reason to list it. `test/phase135.test.ts` asserts every menu exactly.
  >
  > UI TIDY PHASE 2, 2 October 2026 — A LEFT-HAND MENU IN GROUPS, AND NO MORE. Lakhbir chose "design 2" from the mock-ups
  > (00-START-HERE/hub/UI-TIDY-PLAN.md): the menu runs down the left in named groups, so nothing is hidden. Admin's Survey
  > jobs, Calendar and Introducers, Sales's Calendar and Accounting's Introducer fees came out of More into their groups;
  > no section joined or left any login's menu. The verdict for every section is the table "The menus" in
  > 09-app/CAPREBATE-DEVELOPER-SPEC.md, section 2.
  >
  > THE MENU NEVER GRANTS OR REMOVES A PERMISSION. A listed section is still drawn only where its gate admits the login,
  > and a section on no menu answers its address exactly as before.

## 18 Sept 2026: Phase 133e

### `src/core/required.ts`

- Line 98:

  > PHASE 133e (D5) — LABELLED BY POSITION IS NOT LABELLED.
  >
  > `requiredWordsInMarkup` above will put "(required)" into a bare `<label>` that merely SITS before a control
  > (route 3), because that is how several of these forms are drawn and the words are worth having either way.
  > A screen reader does not read it that way. Route 3 is a repair, not a join: the label and the field are two
  > unrelated elements, and a person using a screen reader hears "edit text, blank" with the words nowhere near it.
  >
  > So this reports every required control that ONLY route 3 can label — no `for`/`id` pair, and no enclosing
  > `<label>`. Nothing else in this module changes behaviour; this is the thing the test measures.

### `src/core/staff.ts`

- Line 731:

  > PHASE 133e (D4, continued): the only thing a password change can be refused on here is the current one.

## 18 Sept 2026: Phase 133j

### `src/core/audit.ts`

- Line 332:

  > Phase 133j, 18 September 2026: the website's enquiry form received, and Sales opening an enquiry as a lead or
  > closing it; a person asking for their own client login after the assessment, and confirming it from the email.
  > Ids, the sector code and the decision only — never the name, the address or what the person wrote.

### `src/core/router.ts`

- Line 127:

  > PHASE 133j: the site's own address, for a link sent by email (a client's sign-up). CONFIGURED, NEVER TAKEN FROM THE
  > REQUEST'S Host header, which is whatever the sender typed. Absent is http://localhost:8103.

- Line 572:

  > PHASE 133j: THE WEBSITE IS `Caprebate site.html`, served from the one file (src/web/public-site.ts) with its style
  >      and script as two fixed assets. Its "Start your assessment" links come here, to /assessment, and its enquiry form
  >      to /enquiry. With no site file beside the build, `/` is the back end's own home page, as before.

- Line 752:

  > ------------------------------------------ a client's own login (PHASE 133j)

- Line 976:

  > PHASE 133j: the offer of a login for this organisation, made once, here, and only here.

- Line 1008:

  > PHASE 133j: the website's "Log in" button, pressed by somebody already signed in, goes straight to their home.

### `src/core/server.ts`

- Line 122:

  > PHASE 133j: the site's own address, for links sent by email. Absent is CAPREBATE_PUBLIC_ORIGIN, then http://localhost:8103.

### `src/core/signup.ts`

- Line 1:

  > A CLIENT'S OWN LOGIN, CHECKED BY EMAIL — PHASE 133j, 18 September 2026.
  >
  > Until now a client login existed only if somebody created it. A person who finishes the assessment is now offered
  > one on the thank-you page, for the organisation the assessment has just recorded.
  >
  > THREE STEPS, AND EACH IS A CONTROL
  >
  > 1. THE OFFER. `offerSignup` is called once, at the funnel close, and returns a random token that is put into the
  >    thank-you page and nowhere else. Only its hash is stored (migration 031). Whoever holds the page may ask for a
  >    login for THAT organisation and no other, for 24 hours. The organisation is never taken from the form.
  >
  > 2. THE REQUEST. `requestSignup` takes an email address, a name and a password, keeps the password only as its hash,
  >    and sends a single-use link to the address. THE SCREEN SAYS THE SAME THING WHETHER OR NOT THE ADDRESS IS ALREADY A
  >    LOGIN, so the form is not a way to find out who has an account; the address itself is told, by email.
  >
  > 3. THE CONFIRMATION. The link opens a page with a button, and only the button's POST creates the login. A mail
  >    scanner that follows every link in a message therefore cannot create an account on anybody's behalf.
  >
  > THE LINK'S ADDRESS IS CONFIGURED, NEVER TAKEN FROM THE REQUEST. A Host header is whatever the sender typed; a link
  > built from it could send a person's token to somebody else's site.
  >
  > Email is the outbox stub (src/integrations/email/email.ts): the message is written, labelled not sent, and read from there.

### `src/integrations/email/email.ts`

- Line 43:

  > ACCOUNT_VERIFY — Phase 133j: the link that confirms a client's own sign-up. It carries a single-use token.

## 18 Sept 2026: Phase 134

### `src/core/authz.ts`

- Line 652:

  > PHASE 134 — A CLIENT SEES THEIR OWN COMPANY'S CLAIMS: each one's property and how far it has got, in the portal's six
  > client words (src/web/portal.ts). `ownBusiness` on the claim itself, asked of every claim on every request. Nothing
  > else about a claim reaches a client through it: not the ten staff stages, a hold reason, an exit note, a value, a
  > next action or a person. ADMIN and SALES may look at a client's portal, as they may today.

### `src/core/data-borrowed.ts`

- Line 150:

  > PHASE 134: a claim is found by its reference AND by its company's name, and is named by its company and property.

### `src/core/navigation.ts`

- Line 440:

  > The client portal's header — simpler on purpose: their claims, their settings, sign out. PHASE 134: one company may hold
  > many claims, so the one tab is "Your claims", and it is current on every claim's own page too.

### `src/core/router.ts`

- Line 1356:

  > PHASE 134: every claim this company holds, each asked of `claim.progress_read`.

- Line 1425:

  > PHASE 134: ONE CLAIM'S PROGRESS. Looked for only among this company's own claims, so another company's claim and a
  >      claim that does not exist both answer 404 — the same page, naming nothing.

- Line 2496:

  > PHASE 134 — ONE TILE PER CLAIM: the property, its town, how far it has got, and its reference in grey.

- Line 2506:

  > PHASE 134 — ONE CLAIM'S PROGRESS, inside the company's portal. Questions, documents and messages stay on /portal.

### `src/core/search.ts`

- Line 56:

  > Phase 134: the company the hit belongs to, where it has one — a hit whose company's name matches ranks first.

- Line 208:

  > PHASE 134: A COMPANY-NAME MATCH RANKS FIRST — the company itself, then anything whose company's name matches, then the

### `src/core/seed.ts`

- Line 683:

  > PHASE 134 — ONE COMPANY, TWO PROPERTIES, THREE CLAIMS. The annexe gets a claim of its own, so Elverton shows the shape
  >      Lakhbir asked about: one client page, three claim tiles, one timeline, and one portal listing three claims.

### `src/core/staff.ts`

- Line 450:

  > ------------------ SECTION 3 · the one client page, and a claim inside it (Phase 134)

### `src/shared/components.ts`

- Line 36:

  > THE HIGHLIGHTS PANEL: the record type, its name, and the key fields — only those the caller's view carries.
  > PHASE 134: `sub` is one small line under the name — a company's legal name, a claim's property and reference.

- Line 46:

  > ================================================================== *
  > PHASE 134 — THE CLIENT IS THE COMPANY. 18 September 2026.
  >
  > A claim is named for a person by its COMPANY, then its PROPERTY. The claim reference (CR-2026-0001) is a small grey
  > label beside it: never a heading, never the first column, never the words of a link. Every screen that names a claim
  > draws it through these, and test/phase134.test.ts reads every staff screen's HTML to hold that.
  > ==================================================================

### `src/shared/lists.ts`

- Line 83:

  > PHASE 134: the client is the company, so the list reads by company first; the reference is one sort among the rest.

- Line 552:

  > PHASE 134: the company first, the reference last.

## 18 Sept 2026: Phase 151g

### `src/integrations/connectors/smoke.ts`

- Line 47:

  > THE PUBLIC VALUES A SMOKE TEST ASKS ABOUT, and every one of them is a matter of public record that belongs to
  > nobody this business acts for.
  >
  >   · the company is CAP REBATE LTD, 17307313 — our own, confirmed on 18 September 2026;
  >   · the address is 70 Whitehall, London SW1A 2AS — the Cabinet Office, and about as public as a building gets.
  >
  > `--postcode`, `--company-number` and `--company-name` replace them. A CLIENT'S VALUE IS NEVER PASSED, and since
  > Phase 151g the command refuses one: held in CAPREBATE_DB, or, with no database, anything but these without
  > --not-a-client.

## 21 Sept 2026: Phase 135

### `src/core/navigation.ts`

- Line 83:

  > THE SWITCH: ON SINCE 22 SEPTEMBER 2026. Lakhbir answered CAPREBATE QUESTIONS, "The new names and the client's step
  > names - which do we switch on?", in the Phase 144 chat: "Switch on". Clients read "1 Your estimate" to "6 Aftercare".
  > (Shipped OFF by Phase 133c.) A test still passes both positions.
  >
  > PHASE 135 — THE MENU NAMES ARE NO LONGER A SWITCH. Of the three proposed in Phase 133c, "Introducer fees" is now the
  > section's name; "Client files" and "Claims needing an owner" no longer apply, because Engaged clients became the one
  > Clients list and Next actions became a filter on Tasks. The `menu` switch went with them.

- Line 113:

  > EVERY BACK-OFFICE SECTION a menu can name. PHASE 135: a section is listed once. Which login sees it, and where, is
  > `MENUS` below — not this table — and a section on no menu still opens by its address for every login its gate admits.

- Line 284:

  > ------------------------------------------------------------------ *
  > FILTERS — ONE TAB, TWO VIEWS (PHASE 135)
  > ------------------------------------------------------------------

- Line 382:

  > PHASE 135: the open-task count sits on the Tasks tab. The header's "N open tasks" link opened the same page.

### `src/core/router.ts`

- Line 125:

  > PHASE 133c: the portal name switch (the menu switch went in Phase 135). Absent is `NAME_SWITCHES` in src/core/navigation.ts, off.

### `src/core/server.ts`

- Line 114:

  > PHASE 133c: the portal name switch (B9; the menu switch went in Phase 135). Absent is `NAME_SWITCHES`, off. A test passes both positions.

### `src/core/staff.ts`

- Line 291:

  > ------------------------------------------ PHASE 135 · Settings, one page of tiles (Admin)

### `src/shared/assets.ts`

- Line 83:

  > PHASE 135: the Tasks tab's count when a task is overdue.

## 21 Sept 2026: Phase 136

### `src/core/staff.ts`

- Line 298:

  > PHASE 136: the welcome card lives here now, on Help's own landing section, until the person hides it.

- Line 866:

  > ------------------------------------------------------------------ *
  > HOME — PHASE 136: ROWS OF TILES, IN LAKHBIR'S ORDER (src/web/home.ts)
  > ------------------------------------------------------------------

### `src/shared/lists.ts`

- Line 360:

  > PHASE 136: `lead_at` is the lead's own instant, so Home can say how long a new lead has waited.

## 21 Sept 2026: Phase 137

### `src/shared/lists-pages.ts`

- Line 127:

  > PHASE 137: `keep` rides along on every filter (the leads' List view); `noSort` leaves out the order, where a page has its own.

### `src/shared/lists.ts`

- Line 363:

  > PHASE 137: the sector, in words, for the lead's card — the organisation's own, or the one recorded on the lead.

- Line 365:

  > PHASE 137: the lead's owner by id, so the cards can offer "take it" only where there is nobody.

### `src/shared/working-days.ts`

- Line 1:

  > WORKING DAYS, WITH ENGLAND AND WALES BANK HOLIDAYS — PHASE 137, 21 September 2026.
  >
  > ONE RULE FOR "HOW LONG HAS THIS NEW LEAD WAITED". Home's New leads row and the Leads page's New section both read
  > `workingDaysSince` from here, so the two can never disagree about which lead is red.
  >
  > THE LIST IS COPIED FROM GOV.UK (https://www.gov.uk/bank-holidays.json, "england-and-wales"), read on 21 September 2026.
  > gov.uk publishes about two years ahead. `BANK_HOLIDAYS_KNOWN_TO` is the last day the list speaks for; after it, every
  > Monday to Friday counts as a working day again — so a lead turns red a day early after a holiday, never a day late.
  > test/phase137.test.ts fails 90 days before the list runs out, so somebody copies the next year in before it matters.

## 21 Sept 2026: Phase 138

### `src/core/audit.ts`

- Line 300:

  > Phase 138, 21 September 2026: a person kept a page section open or closed for themselves. The section's key only.

### `src/core/sections.ts`

- Line 1:

  > WHICH SECTIONS A PERSON KEEPS OPEN — PHASE 138, 21 September 2026. "Clean-up 5 of 11."
  >
  > The client page and the claim page draw every section with `section` (src/shared/components.ts). A section opens by
  > itself when it is being worked on and closes when it is Done. Under each one a person may press "keep this open for
  > me", "keep this closed for me" or "Let the page decide". The choice is theirs alone, kept on the server (migration 033),
  > so it follows them to any device and is never in the address. The pages run no script, so a form is the only way to
  > say it.
  >
  > WHAT IT NEVER DOES: change what anyone may see. A kept-open section a login may not read is simply not drawn, because
  > the page never builds it. The key is one of a fixed list, the address sent back to is checked against the two page
  > shapes this is offered on and carries nothing but ids, and the write is audited with the key alone.

### `src/core/staff.ts`

- Line 282:

  > ------------------------------------------ PHASE 138 · a person keeps a page section open or closed

### `src/shared/components.ts`

- Line 184:

  > PHASE 138: no hidden heading any more. Each panel carried a visually hidden <h2> with the tab's name AND the panel's own

- Line 340:

  > ================================================================== *
  > PHASE 138 — ONE SECTION, COLOURED, THAT OPENS AND CLOSES. 21 September 2026. "Clean-up 5 of 11."
  >
  > Lakhbir, after using the test site: "The sections within the portal when looking at the clients all seem to blur into
  > one. The different sections should be coloured, in collapsible boxes, and when we are working on a particular section
  > it should show what we are working on, what data is needed and where the data is coming from."
  >
  > EVERY SECTION OF THE CLIENT PAGE AND THE CLAIM PAGE IS DRAWN BY `section`: a coloured band down the left edge, an icon
  > and a word saying what kind of section it is (so colour is never the only signal), a heading, a status chip in words,
  > and the same three lines first — WORKING ON, WE NEED, COMING FROM. It is a <details>, so it opens and closes with no
  > script (the Content-Security-Policy allows none). A Done section starts closed and the section being worked on starts
  > open; a person's own choice, kept on the server per person (src/core/sections.ts), wins over both. Nothing about it is
  > ever in the address.
  >
  > LIKE EVERY COMPONENT HERE IT DECIDES NOTHING ABOUT WHO SEES WHAT: the caller passes only what its view already carries.
  > ==================================================================

## 21 Sept 2026: Phase 139

### `src/core/audit.ts`

- Line 302:

  > Phase 139, 21 September 2026: a fact ticked as checked or the tick taken off; a step told to the client, or taken back
  > by Admin. The fact's reference, the step's key and the claim's id only — never a value, and never the reason, which
  > is in the row the event names.

### `src/core/authz.ts`

- Line 48:

  > Phase 139: what staff have checked for a company and told its client — the approvals and the steps.

- Line 522:

  > PHASE 139 — CHECKED AND APPROVED, AND TELLING THE CLIENT. Ticking a fact as checked, and pressing "Tell the client" on
  > a step, are ADMIN's and SALES's — the people who work the client. TAKING A STEP BACK, after the client has been told,
  > is ADMIN's alone. The client reads what it was told, on its own company, and nothing else: the view model
  > (src/web/approvals.ts, `clientSteps`) carries a step's words and a date, never a fact, a value or a reason.

### `src/core/router.ts`

- Line 1358:

  > PHASE 139: the steps staff have told this client about — words and dates, and nothing behind them.

- Line 2507:

  > PHASE 139: the client's told steps, or none for a login that may not read them. Never a refusal on the portal's own page.

### `src/core/sections.ts`

- Line 30:

  > PHASE 139: checking facts and telling the client, on both pages; and the property page and a lead's page as sections

- Line 42:

  > The page shapes a person is sent back to — the client, a claim, and since Phase 139 a property and a lead. Ids only.

### `src/core/seed.ts`

- Line 503:

  > Phase 139: a property register's record says which property it is about — Dunmarrow's main site, the one it describes.

### `src/integrations/register-ingest.ts`

- Line 46:

  > Phase 139: the company's property a property register's record is about, where the lookup was keyed on one.

## 21 Sept 2026: Phase 140

### `src/core/audit.ts`

- Line 308:

  > Phase 140, 21 September 2026: staff said whether the client can see one of the company's files; a kept original
  > opened by a member of staff; a kept original deleted when its time was up. The document's id and the version's
  > only — never a file name, never what the file says.

### `src/core/authz.ts`

- Line 148:

  > PHASE 140: whether the client may see this file at all — theirs if they sent it, ours only once staff say so. Read by
  > src/web/documents.ts (`shownToClient`). Absent is not true: a client is refused a document that does not say.

- Line 294:

  > PHASE 140: see the `document` object. Absent is not true.

- Line 322:

  > PHASE 140: and never a file staff have not chosen to show them. A file the client sent is shown to them by rule.

- Line 765:

  > PHASE 140: whether the client can see a file — the two roles that upload one. Never the client, never a surveyor.

### `src/core/cli.ts`

- Line 104:

  > PHASE 140. KEEP_ORIGINALS is off, so no original is ever kept and this deletes nothing. It is here so the day the
  >        switch goes on, a scheduled run of this one line is all the hosting needs to add.

### `src/core/navigation.ts`

- Line 488:

  > PHASE 140: a company's files have their own training section, inside the Clients address.

### `src/core/router.ts`

- Line 1532:

  > PHASE 140: THE FILE COMES WITH THE FORM. One step, and exactly the path the upload address takes — the same

### `src/core/server.ts`

- Line 124:

  > PHASE 140: the KEEP_ORIGINALS switch. Absent is `KEEP_ORIGINALS` in src/shared/originals.ts, off. A test passes it on.

- Line 134:

  > PHASE 140: the key a kept original is encrypted with. Absent is CAPREBATE_ORIGINALS_KEY; with neither, nothing is kept.

### `src/core/staff.ts`

- Line 446:

  > ------------------ SECTION 3 · the company's files, in folders, and a staff upload (Phase 140)

### `src/shared/objectstore.ts`

- Line 54:

  > PHASE 140: where a kept original lives — the handler's durable prefix. The retained text beside it is not an original.

- Line 115:

  > PHASE 140: the KEEP_ORIGINALS switch. Absent is the shipped switch, off. A test passes it on.

- Line 117:

  > PHASE 140: the 32-byte key a kept original is encrypted with. Absent or wrong length: no original is ever kept.

- Line 136:

  > PHASE 140: days a kept original lives, or null — KEEP_ORIGINALS is off in one of its three ways. Read by uploads.ts.

- Line 170:

  > The handler's only use of `copy` is promoting an original to durable storage (PROMOTION_RULE). PHASE 140: AN ORIGINAL
  > IS NEVER WRITTEN THERE IN THE CLEAR. It is encrypted on the way, and with no key the copy is refused — the handler's
  > own catch path then deletes the quarantined file, so a missing key can only ever mean less is kept, never more.

- Line 186:

  > PHASE 140: a kept original, decrypted. Only src/web/uploads.ts calls this, after `document.read_original`.

## 21 Sept 2026: Phase 141

### `src/core/audit.ts`

- Line 314:

  > Phase 141, 21 September 2026: a member of staff saved a free-typed email to a company's contact, and Admin changed who
  > every email comes from. Ids, a count of files and whether sending was on — never the subject, the body or an address.

### `src/core/cli.ts`

- Line 303:

  > PHASE 141. EMAIL_SENDING is off, so this sends nothing and says why. The day it is on, a scheduled run of this line
  >        retries anything that could not be sent at the moment it was saved.

### `src/core/staff.ts`

- Line 430:

  > ------------------ SECTION 3 · a free-typed email to a company or a lead (Phase 141)

### `src/integrations/email/email.ts`

- Line 44:

  > FREE_TYPED — Phase 141: an email a member of staff typed themselves, to one of the company's contacts.

- Line 60:

  > PHASE 141 — what a free-typed email also records: the claim it is about (one of the company's own — a trigger holds
  > it), the lead it was written from, the contact it went to, who wrote it, and the company's files it carries.

- Line 131:

  > PHASE 141 — WHO EVERY EMAIL COMES FROM, AS ONE SETTING. The latest row of `email_sender` (migration 036), which Admin
  > changes on the admin settings screen. Migration 036 writes the first: "Cap Rebate", contact@caprebate.co.uk. No
  > address is written in code; a database with no row at all is refused rather than given a default.

- Line 211:

  > PHASE 141 — what a person reads after saving an email while sending is off. Lakhbir's words.

## 21 Sept 2026: Phase 146f

### `src/integrations/email/email-provider.ts`

- Line 1:

  > EMAIL_SENDING — ACTUALLY SENDING AN EMAIL. BUILT, AND SWITCHED OFF. Phase 141, 21 September 2026.
  >
  > ───────────────────────────────────────────────────────────────────────────
  > WHY IT IS OFF
  >
  > Every email this build writes goes to the outbox (src/integrations/email/email.ts), and nothing leaves. Lakhbir wants staff to
  > free-type emails from contact@caprebate.co.uk. Sending them for real needs three things this build cannot decide:
  >
  >   1. an email provider chosen — a supplier, so Lakhbir's decision;
  >   2. that provider named as a processor in the privacy notice AND in clause 7 of the engagement letter — the Phase 115
  >      rule: nothing carries client data through a processor the client was not told about;
  >   3. the contact@caprebate.co.uk mailbox existing, with SPF, DKIM and DMARC set on caprebate.co.uk — without them the
  >      mail is marked as spam or refused, and anyone could send mail that looks like ours.
  >
  > PHASE 151, 24 September 2026: the provider question (Word question 186) is answered and closed - IONOS - and the
  > mailbox exists: contact@caprebate.co.uk, on IONOS, with SPF, DKIM (s1-ionos, s2-ionos) and DMARC (p=none, so reports
  > only) published on caprebate.co.uk, read by DNS that day. What is left before sending is who reads the mailbox (Word
  > question 216) and one test email (Word question 217), whose title is quoted exactly here:
  >   "May we send you one test email from contact@caprebate.co.uk before email sending is switched on?"
  >
  > OFF IS EXACTLY TODAY. With `enabled: false` every email is saved to the outbox with `send_requested = 0`, the screen
  > says "Saved — emails are not being sent yet", and `dispatchOutbox` below returns OFF without opening a connection.
  >
  > ───────────────────────────────────────────────────────────────────────────
  > ON, AND WHAT IS SENT
  >
  > EVERY CONDITION FAILS CLOSED, and not known is not a yes (N4): each of the three facts is a boolean that must be
  > `true`, the provider must be named, and the provider's login must be present in the environment. Any one missing is
  > off. A row saved while sending was off is never sent later — `send_requested` is written once, when the row is.
  >
  > THE ADAPTER BUILT IS SMTP OVER TLS, because the recommendation is to send through the mailbox's own host — IONOS,
  > which the privacy notice already names as "our email" — so condition 2 needs no new processor and every reply lands
  > in the same mailbox. It is a small, dependency-free client (EHLO, AUTH PLAIN, MAIL, RCPT, DATA, QUIT) over
  > `node:tls`, tested against a fake server in test/phase141.test.ts. If Lakhbir picks a service with its own web API
  > instead, that is a second `EmailProvider` beside this one; nothing else changes.
  >
  > PHASE 146f, 22 SEPTEMBER 2026 — POINTED AT IONOS, AND STILL OFF.
  >
  >   · THE LOGIN COMES FROM THE KEY FILE (src/core/secrets.ts), never the environment: IONOS_SMTP_HOST, _PORT, _USER and
  >     _PASSWORD, read only through `loadSecrets().forOwner('IONOS_EMAIL')`. A host that is not an IONOS server is
  >     refused as if there were no login, so a key file cannot quietly point our mail somewhere else.
  >   · EACH CONNECTION WRITES ONE AUDIT ROW, MAIL_SERVER_CONNECTED: the service, what it was for, the outcome, the
  >     server's reply code, how long it took. Never the password, never an address, never the server's words.
  >     SMTP is not fetch, so it stays outside src/integrations/connectors/http.ts, as that file's own rule allows.
  >   · BOUNCES. A refusal while sending is read by its code: 5xx is permanent (HARD) and 4xx is for now (SOFT, tried
  >     again on the next run). A HARD bounce is written to email_bounces and the address to email_suppressions, and
  >     nothing more is sent to it until a member of staff lifts it. A delivery report that arrives later is read by
  >     the mailbox reader (src/web/inbound-email.ts) and recorded the same way — never filed as a reply.
  >   · CALENDAR INVITES AND THE SIGNED LETTER travel as outbox_inline_files, attached like any other file.
  >   · STILL OFF. The mailbox and its SPF, DKIM and DMARC records, and IONOS named in the privacy notice and in
  >     clause 7 of the engagement letter, are not yet true. The invoice and bank-detail refusals in
  >     src/web/free-email.ts are untouched.
  >
  > THE RULES DO NOT MOVE WHEN IT IS ON. A do-not-contact company is asked again at the moment of sending, not only when
  > the email was saved. From and Reply-To come from the stored row, which was stamped from the one sender setting. An
  > attachment is sent only while its original is still kept; one that is gone stops the email, which is left unsent
  > with the reason.
  >
  > 2 OCT 2026 — ONLY THE TEST WEBSITE SENDS (Lakhbir: "yes for now"), as Zoom and WhatsApp: a copy on a computer, reading
  > the real key file, would email real people from contact@caprebate.co.uk. Sending is on only on the deployed test
  > website, or when the copy was started with CAPREBATE_LOCAL_EMAIL=1 (src/integrations/connectors/place.ts). Every screen that asks
  > whether sending is on passes where it runs (`MailWhere`), so it says so in words; and the provider itself refuses to
  > deliver over a real connection from anywhere else. A test's own mail server reaches nobody, so it is never refused.
  > Signing in to check the login (`check`) sends nothing and is left alone.

## 21 Sept 2026: Phase 151

### `src/shared/originals.ts`

- Line 1:

  > KEEP_ORIGINALS — KEEPING THE FILE A CLIENT SENT. BUILT, AND SWITCHED OFF. Phase 140, 21 September 2026.
  >
  > ───────────────────────────────────────────────────────────────────────────
  > WHY IT IS OFF
  >
  > Lakhbir wants staff to "see what the customer has uploaded". Today nobody can: the upload handler reads each file,
  > keeps what it took from it, and deletes the original. That deletion is our data-minimisation promise — the privacy
  > notice and the retention determinations are written on it. Keeping originals is what staff expect, and it changes
  > both documents. That is Lakhbir's decision with the data protection officer, not a build choice, so it is put to him
  > in CAPREBATE QUESTIONS under exactly this title:
  >   "Should we keep the files clients upload, or keep deleting them once read?"
  > PHASE 151, 24 September 2026: ANSWERED — KEEP THEM (Word answer 48, closed). The switch STAYS OFF: keeping needs a
  > keep-until period and a list of who may open them, and the privacy notice must say both first. That is the follow-up,
  > quoted below as KEEP_ORIGINALS_QUESTION: "How long do we keep the files clients upload, and who may open them?"
  >
  > OFF IS EXACTLY TODAY. With `enabled: false` the upload handler runs on FAIL_CLOSED_SETTINGS as it always has, every
  > original is deleted once read, and the three `documents.original_*` columns (migration 035) stay empty.
  >
  > ───────────────────────────────────────────────────────────────────────────
  > ON, AND NOTHING NEW DECIDES WHAT IS KEPT
  >
  > The handler already has the rule for keeping a file: it promotes the original to durable storage, after the strip and
  > never before, where the retention rule outlives the reading of it (PROMOTION_RULE in
  > 09-app/backend/src/modules/claims/documents/upload-handler.ts). This switch only gives it a retention period to read — a number of
  > days after reading — so the handler's own order, its own refusal to promote before the strip and its own quarantine
  > discharge all still run. There is no second path that keeps a file.
  >
  > THREE THINGS MUST ALL BE TRUE, OR IT IS OFF — each fails closed, and not known is not a yes (N4):
  >   1. enabled is true;
  >   2. a retention period in whole days, which the data protection officer approves, is set;
  >   3. a 32-byte encryption key is present (CAPREBATE_ORIGINALS_KEY, base64). The object store will not write an
  >      original without it — see `seal` below and FsObjectStore.copy.
  >
  > A kept original is ENCRYPTED (AES-256-GCM, a fresh nonce per file), OUTSIDE THE WEB ROOT (the store has no route
  > that maps a path onto it), opened only through `document.read_original` — Admin, Sales (on the documents Sales may
  > read) and the data protection officer since 24 September 2026 (Word question 219), and the client on their own — and
  > DELETED when its days are up, by `sweepOriginals`, which runs whenever the folder or the original is opened and from
  > `node src/core/cli.ts sweep-originals`.

## 22 Sept 2026: Phase 113a

### `src/integrations/email/calendar.ts`

- Line 1:

  > CALENDAR INVITATIONS — a standard .ics file on every booked, moved or cancelled call. Phase 146f, 22 September 2026.
  >
  > Lakhbir decided email and calendar invitations go through IONOS. Booking already happens inside the application
  > (the staff calendar, the client's own portal, the funnel's close); what was missing was the invitation itself.
  > `src/integrations/email/email.ts` has said since Phase 105 that an invitation "is an email with an attachment, so it goes down
  > the same path": this builds the attachment, and it rides the same outbox and the same switch (EMAIL_SENDING, off).
  >
  > WHAT IS SENT. One iCalendar object (RFC 5545) with METHOD:REQUEST for a call booked or moved, and METHOD:CANCEL for
  > a call cancelled or a time given back (RFC 5546). Every calendar that reads email reads it — IONOS, Outlook, Apple,
  > Google — with no account of ours in any of them. There is NO TWO-WAY SYNC: nothing reads a calendar, and a reply
  > to the invitation lands in the contact@ mailbox like any other email.
  >
  > ONE UID PER BOOKING, AND A SEQUENCE THAT ONLY GOES UP. The UID is the booking's id; SEQUENCE is how many times the
  > booking has changed (booking_changes). So a moved call replaces the old one in the client's calendar rather than
  > adding a second, and a cancellation removes the right one.
  >
  > TIMES ARE UTC ("Z"). The stored value is UTC; the calendar shows it in the reader's own time. The words in the
  > email body stay UK time (localWhen), as Phase 113a requires.

## 22 Sept 2026: Phase 141

### `src/integrations/email/email-inbound.ts`

- Line 1:

  > INBOUND_EMAIL — READING REPLIES TO contact@caprebate.co.uk. BUILT, AND SWITCHED OFF. Phase 142, 22 September 2026.
  >
  > Phase 141 wrote the design into the Developer Spec (B48, "Where replies to contact@ will land"); this builds it.
  >
  > ───────────────────────────────────────────────────────────────────────────
  > WHY IT IS OFF
  >
  > There is no mailbox to read. contact@caprebate.co.uk has to exist first, with its email security records — a board item
  > for Lakhbir, "Create the contact@caprebate.co.uk mailbox and check its email security records" — and which service
  > hosts it is the same question Phase 141 put to him: "Which email service should send our emails from
  > contact@caprebate.co.uk?". The recommendation there is IONOS, the host the privacy notice already names, so this reader
  > speaks IMAP, which IONOS offers. OFF IS EXACTLY TODAY: `readMailbox` returns OFF without opening a connection.
  >
  > ───────────────────────────────────────────────────────────────────────────
  > ON, AND WHAT IT DOES
  >
  > READ-ONLY. It opens the inbox with EXAMINE, which cannot change a message, and fetches with BODY.PEEK, which does not
  > even mark one read. It never deletes, moves or flags anything: the mailbox stays exactly as the mail program sees it.
  > It remembers the last message number it read in (`inbound_email.mailbox_uid`) and reads only newer ones.
  >
  > WHAT IS KEPT: who it is from, the subject, and THE TEXT PART ONLY. No HTML is kept. A file in the email is counted (its
  > type and size, never its name) and left in the mailbox until a member of staff says what it is — then that one file is
  > read from the mailbox again and goes through the upload path every file takes (src/web/inbound-email.ts).
  >
  > The filing rule lives in src/web/inbound-email.ts: matched by the Message-ID we sent, from one of the company's
  > contacts, or else to a staff queue. Never by the sender's address alone.
  >
  > A small, dependency-free IMAP client over `node:tls`, tested against a fake server in test/phase142.test.ts, in the
  > same way Phase 141's SMTP client is.

## 22 Sept 2026: Phase 142

### `src/core/audit.ts`

- Line 319:

  > Phase 142, 22 September 2026: a message written on a company's "With the client" thread — by staff or by the client —
  > and a reply to contact@caprebate.co.uk read in by the mailbox reader, filed by staff from the queue, or one of its
  > files saved to the company's Files. Ids, the direction, a count of files and the outcome — never the words, never an
  > address. (A "Team only" message is an internal note and keeps its own kind, INTERNAL_NOTE_ADDED.)

### `src/core/authz.ts`

- Line 209:

  > PHASE 142. A message on a company's "With the client" thread — the portal's Messages — and a reply that reached
  > contact@caprebate.co.uk. The "Team only" thread is the company's internal notes and stays `internal_note`: a
  > DIFFERENT object type in a DIFFERENT table, so no rule written for one can reach the other.

- Line 534:

  > PHASE 142 — THE THREAD WITH THE CLIENT. Admin and Sales, who work the client, and the client on its own company. The
  > TEAM thread is `internal_note.*` above, and the client is on neither of its rows. THE SURVEYOR READS THE THREAD
  > WITH THE CLIENT, AND NOTHING MORE: Lakhbir answered "Should the surveyor see a client's chat?" on 22 September 2026 —
  > "With the client" only. A surveyor reads it on a company where they hold an assigned survey job (`throughAssignedJob`,
  > failing closed on an object without the list), never writes on it, and is on no row of the TEAM thread. Accounting is not on them either: its view is invoices, settled 6 September 2026.
  > A REPLY BY EMAIL waits for Admin or Sales, who read the queue and file what the mailbox reader could not.

### `src/core/cli.ts`

- Line 326:

  > PHASE 142. INBOUND_EMAIL is off, so this reads nothing and says why. The day it is on, a scheduled run of this line
  >        files each reply that answers one of our emails onto its company's chat, and queues the rest for staff.

### `src/core/navigation.ts`

- Line 449:

  > PHASE 142: MESSAGES, with how many of ours the client has not read. Only for the client, on their own company.

- Line 483:

  > PHASE 142: email replies to sort are part of the chat's training section.

### `src/core/router.ts`

- Line 1371:

  > PHASE 142: MESSAGES — the thread with the client, and nothing else. `business_id` is the session's for a client, so a
  >      client only ever reads and writes their own company's thread; every read and write is asked of the rule table again.

### `src/core/sections.ts`

- Line 25:

  > PHASE 142: the two chat threads, as one section with two tabs

### `src/core/staff.ts`

- Line 442:

  > ------------------ SECTION 3 · writing to the client on the company's chat, and email replies to sort (Phase 142)

## 22 Sept 2026: Phase 142a

### `src/core/audit.ts`

- Line 326:

  > Phase 142a, 22 September 2026: a run of the message clean-up job (MESSAGE_RETENTION, off) — every id it removed and
  > the counts, never the words; and a new-message alert queued (EMAIL_SENDING, off) — the message, the outbox rows and
  > who was told, by user id, never an address and never the words.

### `src/core/cli.ts`

- Line 118:

  > PHASE 142a. MESSAGE_RETENTION is off, so this deletes nothing and says why. The day the data protection officer
  >        sets the periods and it is switched on, a scheduled run of this one line applies them.

## 22 Sept 2026: Phase 142b

### `src/integrations/email/email-inbound.ts`

- Line 47:

  > PHASE 142b: Lakhbir chose IONOS on 22 September 2026, so the mailbox is read over IMAP. Still off: the mailbox is not ready.

### `src/integrations/email/email-provider.ts`

- Line 103:

  > PHASE 142b: Lakhbir answered the question on 22 September 2026 — IONOS, from the contact@caprebate.co.uk mailbox — so the
  > provider is SMTP through IONOS's own host. Still off: the mailbox and its email security records, and IONOS named in
  > clause 7 of the engagement letter, are not yet true. IONOS is already "our email" in the privacy notice, but that
  > notice is a draft nobody has approved, so `named_in_privacy_notice` stays false until it is published.

## 22 Sept 2026: Phase 143

### `src/core/sections.ts`

- Line 34:

  > PHASE 143: grants and contributions, out of the claim's facts into a section of its own

## 22 Sept 2026: Phase 144

### `src/core/backoffice.ts`

- Line 172:

  > PHASE 144: WHERE IN THE ASSESSMENT A CALL WAS ASKED FOR, IN WORDS. The stored value is a code (bookings.entry_point);
  > a screen shows these words, never the code with its underscores swapped for spaces ("gated exit").

### `src/core/navigation.ts`

- Line 63:

  > PHASE 133c: the two name switches for this request (B7, B9). Absent is `NAME_SWITCHES` (portal steps on since Phase 144).

### `src/core/router.ts`

- Line 1565:

  > PHASE 144: the same plain counts the staff Files folder shows, from the same reader — never the handler's own step log.

- Line 2657:

  > THE CLIENT'S OWN DOCUMENT PAGE. PHASE 144: what we read is said in the same plain counts the staff Files folder shows
  > ("We read 3 pages."), from `readLines` — counts only, never the file's words, a note or a figure. Anything not known yet
  > is said as not known, never left out.

### `src/shared/voice.ts`

- Line 45:

  > THE PLAIN-WORDS LIST — PHASE 144, 22 September 2026.
  >
  > Lakhbir, 18 September 2026: the back office "needs to be readable at a 12-year-old level and to the point". These
  > are words our own design notes used that a person on a screen should never have to read. Each row is
  > [the pattern, the word, what to say instead]. 03-app/caprebate-plain-words-check.cjs reads this list (by parsing
  > this file, so keep each row on the one-line shape below) and fails on any of these words in anything a person reads
  > in src/web/*.ts. Comments, SQL, ids and audit event names are code, not words on a screen, and may keep them.

## 22 Sept 2026: Phase 146b

### `src/core/audit.ts`

- Line 48:

  > Phase 146b, 22 September 2026: one call to an outside service, made through src/integrations/connectors/http.ts — the only
  > way out. The service, the endpoint as a template, the NAMES of the query parameters (never their values), the
  > result, the time taken, the tries, and both gates and the source's switch as they stood. Never a key, never a
  > value typed into a search.

- Line 507:

  > Phase 146b: a supplier key loaded from the key file (src/core/secrets.ts) never reaches the chain, under any key.

### `src/core/secrets.ts`

- Line 1:

  > THE KEY FILE — every supplier key this build can use, read from ONE file OUTSIDE the repository. Phase 146b,
  > 22 September 2026.
  >
  > ───────────────────────────────────────────────────────────────────────────
  > WHERE THE KEYS LIVE, AND WHERE THEY NEVER DO
  >
  > The file named by CAPREBATE_SECRETS, or `~/.caprebate-secrets.env` when that is unset. One `NAME=value` a line; a
  > `#` line is a comment. `secrets.example.env` beside package.json lists every name, with no values.
  >
  > A FILE INSIDE THE REPOSITORY IS REFUSED, not read. The repository is the git working copy this file sits in (the
  > nearest folder above it holding `.git`), and the test is made on real paths, so a link from outside that points in
  > is refused too. A key that could be committed by `git add` is a key that one day will be. The .gitignore is an
  > allow-list and ignores `.env` and `.env.*` as well, but a second line of defence that depends on the first is not a
  > second line.
  >
  > NOTHING HERE THROWS. No file, an unreadable file and a refused file are each a STATE, reported in words, and every
  > connector then reads as NOT_CONFIGURED — which leaves its facts asked (N4). A missing key is never a screen error.
  >
  > ───────────────────────────────────────────────────────────────────────────
  > EACH KEY GOES ONLY TO THE CONNECTOR THAT OWNS IT
  >
  > `SECRET_KEYS` names the owner of every key. `forOwner('EPC')` hands back a reader that answers for the EPC token
  > and returns null for every other name, including a name that IS in the file. So a bug in one connector cannot
  > read another supplier's key, and a test proves it.
  >
  > ───────────────────────────────────────────────────────────────────────────
  > NO KEY IS EVER PRINTED
  >
  > The store prints as a list of NAMES — `String(store)`, `JSON.stringify(store)` and `util.inspect(store)` alike.
  > Every value loaded is registered with `redactSecrets`, which src/integrations/connectors/http.ts runs over every error before it
  > is kept, and src/core/audit.ts refuses any audit detail that carries one — the audit screen refuses rather than redacts,
  > which is its own rule. Nothing here writes to the console.

### `src/integrations/connectors/registers.ts`

- Line 1:

  > THE REGISTER CONNECTORS — the shape every one is built to, the switch each one has, and the two gates.
  > Phase 146b, 22 September 2026, from src/integrations/register-ingest.ts.
  >
  > WHAT MOVED HERE AND WHAT DID NOT. `gateStatus` and `planResearch` moved here unchanged, word for word, and
  > src/integrations/register-ingest.ts re-exports them, so every caller and every existing test reads the same functions.
  > `ingestRegisterRecord` — THE ONE DOOR register data enters the database by — stays in src/integrations/register-ingest.ts,
  > because test/seed.test.ts asserts that file is the only one under src/ that writes register_records, and the
  > phase's rule is that the existing register tests pass unchanged. Two files, one door: this file never writes to the
  > database; it fetches and shapes, and the caller stores through that door, where N2 is checked.
  >
  > ───────────────────────────────────────────────────────────────────────────
  > THE CONNECTOR SHAPE — configured(), fetch(), toBundle()
  >
  >   configured(secrets)  READY, or NOT_CONFIGURED with the missing key NAMES, or SWITCHED_OFF. A state, never a throw.
  >   fetch(ctx, query)    one call through src/integrations/connectors/http.ts — the only way out — which writes the audit row.
  >   toBundle(body, q)    the answer as register records (for the one door) and facts, or null if it cannot be read.
  >
  > `runConnector` puts one through its paces in the only safe order: the gate decision first (made by
  > `stateUnderGates` in src/web/research.ts and passed in — NOT re-decided here, so there is no second gate), then the
  > source's own switch, then its keys, then the call, then the reading. Anything short of a clean reading is a source
  > that did not run or did not work, and its facts stay asked (N4). Nothing refuses and nothing throws.
  >
  > FIXTURE MODE. Every test builds its connector context with `fixtureTransport` (src/integrations/connectors/http.ts): recorded
  > answers shaped from the supplier's published documentation, so every suite passes with no key and no network.
  >
  > ───────────────────────────────────────────────────────────────────────────
  > THE SWITCHES — ONE PER SOURCE, EVERY ONE OFF
  >
  > `REGISTER_SWITCHES` sits beside the free gate (CB_REGISTRY.precondition, read by `registryGate()` in
  > src/shared/engine.ts) and is NOT a second gate. The gates say whether we MAY consult a source for this client — a
  > published privacy notice, a signed engagement. A switch says whether the connector for it is turned on at all —
  > built, checked against the supplier, keys installed, and someone deciding it should run. A source runs only when
  > its gate is open AND its switch is on. With every switch off, "Run the research" contacts nobody, exactly as it
  > did before this phase, and the research panel says "not switched on" beside each lookup.
  >
  > THE TWO GATES ARE STILL REAL AND STILL NOT OURS TO OPEN (the words below are the stub's, kept):
  >
  >   FREE sources are gated on a published privacy notice. CB_REGISTRY.precondition is `enabled:false` and its own
  >   `requires` string says why. Show that state; do not flip it; DO NOT BUILD A SECOND GATE.
  >
  >   PAID sources are gated on a signed engagement asserted SERVER-SIDE, plus one operator click that then fires
  >   everything outstanding. The operator picks the moment, not the calls: there is deliberately no per-source
  >   confirmation.

## 22 Sept 2026: Phase 146c

### `src/integrations/connectors/http.ts`

- Line 1:

  > THE ONE WAY THIS BACK END CALLS OUTSIDE. Phase 146b, 22 September 2026.
  >
  > Every connector — the registers, the paid lookups, the document reader — makes its calls through `callOutside`,
  > and THIS IS THE ONLY FILE UNDER src/ THAT MAY CALL `fetch`. A test walks src/ and fails on any other. So the rules
  > below hold for every call, and a new connector cannot quietly skip one.
  >
  >   · THE ADDRESS COMES FROM src/integrations/connectors/sources.ts. A connector passes a path; the base is looked up. A service
  >     with no confirmed address, a base that is not https, or a region outside the UK and EU without an approved
  >     transfer is REFUSED before anything is sent.
  >   · A TIME LIMIT on every try, per service.
  >   · RETRIES ONLY ON 429 AND 5xx, a bounded number, waiting longer each time (and as long as the service's
  >     Retry-After asks, up to 30 seconds). A 4xx other than 429 is an answer, not a hiccup, and is not retried. A
  >     time-out or a broken connection is not retried either: it is reported, and the source can be tried again from
  >     the research panel, which is where a person decides.
  >   · OUR OWN RATE LIMIT per service, below the publisher's (Companies House: 600 in 5 minutes). Over it, the call
  >     is not made and says so. Phase 146c: two rows can share one window (`rate_bucket` — Companies House's two APIs
  >     share the key's limit), and a row can carry a daily cap as well (`daily_limit` — PlanIt asks for about 300 a day).
  >   · A SIZE CAP on every answer. A larger one is dropped unread past the cap.
  >   · ONE AUDIT ROW PER CALL, whatever happened: the service, the endpoint AS A TEMPLATE ("/company/{number}", never
  >     the number or a name typed into a search), the names of the query parameters but NEVER THEIR VALUES, who
  >     clicked, the claim, the outcome, the time taken, the tries, and both gates and the switch as they stood.
  >   · NOTHING THROWS. Every way a call can go wrong is an outcome. The caller turns a failure into a source that
  >     FAILED, and its facts stay asked (N4) — never a 0, never a guess, never a screen error.
  >   · NO KEY IN ANY RECORD. Error text passes `redactSecrets` before it is kept, and the audit screen refuses a
  >     detail that carries a key.
  >
  > NO LIVE CALL FROM A TEST. Under `node --test` the live transport refuses unless CAPREBATE_LIVE_SMOKE=1, so a suite
  > run without the fixture transport cannot reach the internet by accident. Every test passes `fixtureTransport`.

### `src/integrations/connectors/sources.ts`

- Line 1:

  > WHERE EACH OUTSIDE SERVICE IS, AND HOW HARD WE MAY CALL IT. Phase 146b, 22 September 2026.
  >
  > One row per service a connector calls. src/integrations/connectors/http.ts takes the base address from HERE and from nowhere
  > else: a connector passes a path, never a full address, so no connector can point a call somewhere this list does
  > not name.
  >
  > TIED TO THE SOURCE REGISTER, NOT A SECOND ONE. caprebate-source-register.ts (04-phase-work/phase3) is the register
  > of what we consult and why; its `endpoint` is the publisher's address. A test checks that every row below with a
  > `register_source` sits on the same internet domain as that source's `endpoint`, so the two cannot come apart. The
  > address here is the API's own, which is sometimes a different host on that domain (the energy certificate
  > service's API is api.get-energy-performance-data…, its website get-energy-performance-data…).
  >
  > UK OR EU ONLY, UNLESS A TRANSFER IS APPROVED. `region` is where the service says it holds the data. http.ts refuses
  > a call to any other region unless `international_transfer_approved` is true, and today it is true for none. The
  > Claude API is the only row outside the UK and EU; approving that transfer is the data protection officer's, and
  > Phase 146e carries it.
  >
  > RATE LIMITS are the publisher's own, where it publishes one, and a cautious guess where it does not — said so in
  > `rate_basis`. We stay under the published figure rather than on it. Phase 146c read every figure again from the
  > publishers' pages on 23 September 2026 and wrote down in `rate_basis` what each page does and does not say.

### `src/integrations/register-ingest.ts`

- Line 1:

  > THE ONE DOOR REGISTER DATA ENTERS THE DATABASE BY — and, since Phase 146b (22 September 2026), only that.
  >
  > The connector shape, the per-source switches, `gateStatus` and `planResearch` moved to
  > src/integrations/connectors/registers.ts, and the one way to call outside is src/integrations/connectors/http.ts. They are re-exported
  > below, unchanged, so every caller and every existing test reads the same functions as before.
  >
  > `ingestRegisterRecord` STAYS HERE, and this file keeps its name, because test/seed.test.ts asserts that this is
  > the only file under src/ that writes register_records — one door, so the N2 check below guards every path in.
  >
  > NOTHING FIRES YET. Every connector switch is off (REGISTER_SWITCHES), so no register is contacted by any code
  > path; Phases 146c and 146d build the real connectors behind the shape, switched off.
  >
  > N2 — THE NAME EXCLUSION REGISTER — IS WIRED IN, NOT RESTATED.
  > caprebate-name-exclusion.ts is the rule. Every record passes through
  > `assertNoUnauthorisedName` at the INGESTION boundary, which is where that
  > module says the check belongs: a filter applied at report time would leave
  > the name sitting in storage in between.

## 22 Sept 2026: Phase 146e

### `src/core/app.ts`

- Line 147:

  > THE STUBS, in one list, so "what is not real here" is a question with an
  > answer rather than a search. Everything else is real.
  >
  > IT WAS THREE UNTIL 9 SEPTEMBER 2026 AND IT WAS WRONG, and the way it was
  > wrong is the reason this list exists. The text extractor in
  > src/web/uploads.ts opened with the words "and it is a STUB, declared as one"
  > — it was declared in its own file, in `src/stubs/` in spirit, and named
  > nowhere a reader would look. A stub that declares itself only where it lives
  > is a stub nobody counts. Phase 108 found it while writing the developer
  > spec's stub table and added it here rather than describing the discrepancy.
  >
  > AND ENTRY FOUR GOT SMALLER LATER THE SAME DAY WITHOUT DISAPPEARING, which is
  > the harder discipline. Phase 113c built a real .docx and PDF reader behind
  > that port. OCR and scanned PDFs are still not read, so the entry stays and
  > says exactly what is left — deleting a row to make a list shorter is the
  > failure this list exists to prevent, and a four-line list that has quietly
  > become a three-line one is how a developer comes to believe something works.
  >
  > THE TEST OF WHETHER SOMETHING BELONGS HERE is not "is it in src/stubs/". It
  > is: WOULD A DEVELOPER WHO RAN THIS BUILD BELIEVE THIS PART WORKS? FIVE things
  > fail that test today, and one of them is smaller than it was.
  >
  > AND THE FIFTH WAS ADDED BY PHASE 146g ON 23 SEPTEMBER 2026, for exactly the reason
  > this list exists. Phase 146e built the real reader for a client document and left it
  > with no caller in src/ at all: the upload flow ended at DISCHARGED and never ran steps
  > 8, 9 or 10 of the receipt contract. So a developer who ran this build and watched an
  > upload finish could reasonably have concluded that uploads were read. They were not,
  > they still are not, and now the list says so.

### `src/core/audit.ts`

- Line 55:

  > Phase 146e, 22 September 2026: one reading of a client document by the Claude API (src/integrations/connectors/claude.ts),
  > beside the CONNECTOR_CALLED row of the call itself. The document type, which segments were sent (kind and page,
  > never their words), the model that answered, how much it read and wrote, and how many fields came back.
  > NEVER THE TEXT — not what was sent and not what came back. DOCUMENT_PAGES_READ_BY_MODEL is the same for a scanned
  > PDF's page images turned into text: the page numbers and the counts, never the words or the pictures.

### `src/integrations/connectors/claude.ts`

- Line 1:

  > CLIENT DOCUMENTS READ BY THE CLAUDE API — BUILT REAL, AND SWITCHED OFF. Phase 146e, 22 September 2026.
  >
  > Lakhbir chose the Claude API on 22 September 2026 to read client documents. The document pipeline
  > (09-app/backend/src/modules/claims/documents/document-pipeline.ts) already decides what may leave: `sanitise()` keeps only the
  > segments a document type permits, after the receipt strip and the name exclusion register, and `callModel()`
  > re-checks them at the boundary and records what left. It hands that payload to ONE function, the `ModelFn`, and
  > until this file that function was a stand-in. This file is the real one.
  >
  > ───────────────────────────────────────────────────────────────────────────
  > WHAT IT DOES
  >
  >   ONE CALL PER PERMITTED SEGMENT SET. One document, one payload, one call to the Messages API, asking for the
  >   fields that document type carries and nothing else, as structured output (`output_config.format`, a JSON schema)
  >   that becomes the pipeline's `RawExtraction`. A payload with no segments left is not sent at all.
  >
  >   THROUGH THE ONE WAY OUT. The SDK is handed `fetchThroughCallOutside` (src/integrations/connectors/http.ts) in place of the
  >   platform's fetch, so each call is refused, limited, capped, time-limited and written down exactly like a register
  >   lookup — and the SDK's own retries are off, because http.ts already retries 429 and 5xx.
  >
  >   ONE AUDIT ROW PER READING, beside the call's own row: the document type, which segments were sent (kind and page),
  >   the model that answered, the tokens read and written, and how many fields came back. NEVER THE TEXT.
  >
  >   THE GUARD STILL HOLDS. Before anything is sent, the payload goes through the pipeline's own `callModel()`
  >   boundary check, so a payload holding a segment the strip did not pass — a forbidden kind, or a person's name — is
  >   refused here, before the network, and not only inside `extract()`. And the `ModelFn` this hands back answers only
  >   the payload it was prepared for: `extract()` re-builds the payload, and a different one throws rather than being
  >   given another document's answer.
  >
  > WHY IT IS TWO STEPS. The pipeline's `ModelFn` is synchronous, because `extract()` is, and the SDK is not. So the
  > call is made first (`prepareClaudeModel`, async), and what it returns is a synchronous `ModelFn` holding the answer,
  > which is what `runExtraction()` (step 9 of the receipt contract) is given. The contract's order is unchanged: the
  > strip, then the payload, then the model.
  >
  > ───────────────────────────────────────────────────────────────────────────
  > WHAT HAPPENS WHEN IT DOES NOT WORK — N4
  >
  > Switched off, no key, the transfer not approved, a refusal, a time-out, a 4xx or 5xx, an answer we cannot read, a
  > field with no locator or a confidence outside 0 to 1, a value that looks like a person's name: every one of these
  > gives the pipeline NO VALUE for that field. The field goes to `not_found` and stays ASKED of the client. Never a
  > zero, never a guess, never a screen error. Nothing here throws except the payload guard, which is meant to.
  >
  > ───────────────────────────────────────────────────────────────────────────
  > SCANNED PDFS — THE VISION PATH, SWITCHED OFF ON ITS OWN
  >
  > A scanned PDF has pictures of pages and no text, and src/shared/extract-text.ts returns its marker for one. With
  > `SCANNED_PAGES` on, `readScannedPages` sends the page pictures (JPEGs lifted out of the PDF as they are, never
  > re-drawn) and asks for the text on them, line by line. That text then goes through the SAME strip and the same
  > pipeline as any other document. BUT THE PICTURES THEMSELVES ARE SENT BEFORE THE STRIP — a picture of a page cannot
  > be stripped of a name before something has read it. That is why it has its own switch and its own question for the
  > data protection officer, and why it is off. An encrypted PDF, a PDF whose pages are not JPEG pictures, and every
  > other format the reader cannot read keep the marker, whatever this switch says.
  >
  > ───────────────────────────────────────────────────────────────────────────
  > WHY IT IS OFF, AND WHAT TURNS IT ON
  >
  >   · The CLAUDE_DOCUMENTS row in src/integrations/connectors/sources.ts is region US with international_transfer_approved false,
  >     so http.ts refuses every call. It waits on the Word question "Which AI provider reads client documents, and on
  >     what terms?" — the data protection officer approving the provider and its terms, and a director signing.
  >   · Both switches below are false.
  >   · The key, ANTHROPIC_API_KEY, is read only from the key file (~/.caprebate-secrets.env), through
  >     loadSecrets().forOwner('CLAUDE_DOCUMENTS'). Nothing else here holds it, and no record carries it.
  >   · Lakhbir said on 22 September 2026 "data is stored for 7 years". Whether that means our copy or the provider's is
  >     not confirmed, and the privacy notice still promises uploads are deleted after reading. NO RETENTION SETTING WAS
  >     CHANGED ON THAT SENTENCE; it is a question for Lakhbir in the Word questions document.
  >
  > THE MODEL AND THE SDK USAGE come from the claude-api skill (22 September 2026): `claude-opus-5`, the beta Messages
  > endpoint with the server-side fallback on by default (`fallbacks: "default"`, beta `server-side-fallback-2026-07-01`,
  > so a request the model's safety checks decline is re-run by the provider on its recommended model rather than lost;
  > the audit row records which model actually answered), and structured output through `output_config.format`.

### `src/integrations/connectors/http.ts`

- Line 167:

  > Phase 146e: the body too, so a test can prove what a model was sent — and what it was not.

- Line 571:

  > A `fetch` FOR A SUPPLIER'S LIBRARY THAT GOES THROUGH `callOutside`. Phase 146e, 22 September 2026.
  >
  > The Anthropic SDK makes its own HTTP calls. Handed this in place of the platform's `fetch`, every one of them
  > becomes an ordinary `callOutside` call: the address from src/integrations/connectors/sources.ts (the host the library asked for is
  > thrown away and only the path is kept), refused unless the path is one of `endpoints`, rate-limited, time-limited,
  > capped, retried on 429 and 5xx only, and written to the audit chain like every other call. So the library is given
  > no way out that this file does not control. Give the library NO RETRIES of its own: they would be retries of
  > retries, and each one a second audit row for one decision.
  >
  > An answer, any status, goes back to the library as a Response, and the library reads it as it would. A call that
  > never got an answer (refused, over our limit, timed out, cut off, too large) is thrown as OutsideCallFailed, which
  > the library reports as a connection failure. `onResult` sees every CallResult either way.

### `src/shared/extract-text.ts`

- Line 493:

  > ================================================================== *
  > SCANNED PDFS — THE PAGE PICTURES, FOR THE VISION PATH. Phase 146e.
  >
  > A scanned PDF is a picture per page and no text, so `extractPdf` returns the
  > scan marker for it. The vision path (src/integrations/connectors/claude.ts, switched off on
  > its own) can turn those pictures into text, and this is what hands it the
  > pictures: the JPEG each page shows, LIFTED OUT OF THE FILE AS IT IS — a
  > /DCTDecode image stream is a JPEG file already, so nothing is decoded,
  > re-drawn or guessed.
  >
  > NULL, AND THE MARKER STAYS, WHENEVER THAT IS NOT CLEANLY TRUE: not a PDF, an
  > encrypted one, a page with no JPEG picture on it (a JBIG2 or CCITT fax scan, a
  > picture stored as raw pixels), a picture larger than we send. One page we
  > cannot give is the whole document not given: a reading with a page missing
  > would look complete.
  > ==================================================================

## 22 Sept 2026: Phase 146f

### `src/core/audit.ts`

- Line 71:

  > Phase 146f, 22 September 2026. MAIL_SERVER_CONNECTED is one conversation with the IONOS mail server, sending or
  > reading: the service, what for, the outcome, the reply code, how many messages, how long. Never a password, an
  > address or the server's words. EMAIL_BOUNCED is one email the server would not deliver: HARD or SOFT, and the
  > code. ENGAGEMENT_SIGNED is the built-in signature (src/web/signing.ts): the signature record's own SHA-256, the
  > SHA-256 of the exact letter shown and of the signed PDF, and the session's id. The signer's name, role and
  > address are in the signature record, which this row's hash binds; they are not written here, because no log
  > line carries a name (the rule at the top of this file).

### `src/core/backoffice.ts`

- Line 497:

  > PHASE 146f: the invitation itself, a standard .ics, carried by the same email (src/integrations/email/calendar.ts).

### `src/core/router.ts`

- Line 635:

  > PHASE 146f: the analytics measurement id comes from the key file, not the file (src/integrations/analytics.ts). None, no change.

- Line 1461:

  > PHASE 146f: THE BUILT-IN SIGNATURE (src/web/signing.ts). Every check is there, on the record: the switch
  >      (ENGAGEMENT_SIGNING, off), the letter complete, sent and not yet signed, a full name, a role, the tick, and the
  >      fingerprint of the letter the page drew. A refusal is a page the client reads, with what they typed kept.

- Line 1738:

  > PHASE 146f: A CALL GIVEN A TIME HERE GETS ITS INVITATION TOO, like one given a time by staff or moved by the
  >      client — the same email, the same .ics, the same switch (EMAIL_SENDING, off). With no email address recorded,
  >      nothing is written: the call still stands, and staff reach them the way they asked.

- Line 2541:

  > PHASE 146f: THE ADDRESS A SIGNATURE CAME FROM. The socket's own address; behind a host's proxy, the first address in
  > X-Forwarded-For, but only when CAPREBATE_TRUST_PROXY=1 says a proxy we trust set it — otherwise anyone could type one.

### `src/core/secrets.ts`

- Line 397:

  > PHASE 146f: THE STORE A RUNNING PROCESS USES — the key file, except under the test runner. `node --test` sets
  > NODE_TEST_CONTEXT, and there the answer is the empty store, so no suite ever reads this machine's key file and every
  > suite passes the same with no key and no network (the integration phases' rule 3). CAPREBATE_LIVE_SMOKE=1 is the
  > one way past it, as it is for http.ts.

### `src/core/seed.ts`

- Line 364:

  > PHASE 146f: assertSignedEngagement reads the signature record, so a seeded signed letter carries one — marked SEED.

### `src/core/staff.ts`

- Line 1248:

  > PHASE 146g: AND WHETHER IT BOUNCED. Phase 146f recorded bounces and nothing showed them, so an email the
  >      server would not deliver looked exactly like one that had not been sent yet. The newest bounce for each
  >      message, its kind and the server's CODE — never the server's words.

### `src/integrations/analytics.ts`

- Line 1:

  > GOOGLE ANALYTICS ON THE PUBLIC WEBSITE — THE CONFIGURATION SIDE. Phase 146f, 22 September 2026.
  >
  > The wrapper, the ten call sites and the cookie choice are in `Caprebate site.html` (CB_TRACK and SITE_CONSENT).
  > This file is the back end's half: it reads the measurement id from the key file (GA4_MEASUREMENT_ID, owner
  > GOOGLE_ANALYTICS — public by design, it is printed in the page) and says which Google addresses the served page's
  > content policy must allow once an id is set. With no id, nothing changes: the page carries an empty id, shows no
  > cookie choice and loads nothing, and its policy allows only its own address.
  >
  > WHY THIS FILE IS NOT IN src/web/. The analytics allow-list check (03-app/caprebate-analytics-allowlist-check.cjs)
  > scans every src/web/*.ts view and fails on any mention of Google's tag, because no view may load one. A content
  > policy line naming Google's addresses loads nothing — it only permits what SITE_CONSENT loads after the visitor
  > says yes, and only on the public home page. It lives here so that check keeps meaning exactly what it says.

### `src/integrations/email/email-inbound.ts`

- Line 67:

  > PHASE 146f: the key file's IONOS_IMAP_* names, read only through `loadSecrets().forOwner('IONOS_MAILBOX')`. Port 993
  > by default. A host that is not an IONOS server is refused as if there were no login (IONOS_HOST).

- Line 210:

  > ================================================================== *
  > A DELIVERY REPORT — PHASE 146f
  > ==================================================================

- Line 337:

  > PHASE 146f: one audit row per connection — the outcome and how many messages came back, never the login.

### `src/integrations/email/email-provider.ts`

- Line 155:

  > PHASE 146f: the sending login, from the key file's IONOS_SMTP_* names. Port 465 (TLS from the start) by default.

### `src/integrations/email/email.ts`

- Line 45:

  > SIGNED_LETTER — Phase 146f: the client's own copy of the engagement letter they signed, as a PDF.

- Line 76:

  > PHASE 146f — a file made for this email that is not one of the company's documents: the calendar invitation
  > (.ics, src/integrations/email/calendar.ts) or the signed engagement letter (.pdf). Stored with the email, sent with it.

### `src/integrations/signature.ts`

- Line 1:

  > STUB 2 of 3 — document signature. REPLACED FOR THE ENGAGEMENT LETTER BY PHASE 146f, 22 September 2026.
  >
  > The stub provider that lived here (`stubSignatureProvider`, which contacted nothing and executed nothing) is gone.
  > Lakhbir decided the engagement letter is signed inside the application, so the signature is built in:
  > src/web/signing.ts — the client types their full name and role, ticks that they may sign for the business, and
  > presses Sign; the record, its fingerprint in the audit chain and a signed PDF are kept. It is switched off
  > (ENGAGEMENT_SIGNING) until our solicitor confirms a typed name suits the letter and the letter's open terms are
  > settled.
  >
  > WHAT IS LEFT HERE is the interface, for any other document a signature provider might one day carry, and the
  > built-in provider's description of itself. The surveyor's "commit figures" is not a signature and never was.
  >
  > WHAT MUST NOT BE BUILT ON TOP OF THIS: a signed engagement is what gates the PAID register calls, and that
  > assertion is SERVER-SIDE. `assertSignedEngagement` (src/web/research.ts) reads the engagements table and the
  > signature record; it must never read a value returned to a browser.

### `src/shared/pdf.ts`

- Line 1:

  > A SMALL PDF WRITER — plain text pages, for the signed engagement letter. Phase 146f, 22 September 2026.
  >
  > No dependency. PDF 1.4, A4, the standard Helvetica and Helvetica-Bold fonts (every PDF reader has them, so nothing
  > is embedded), WinAnsi encoding. Text is written as hexadecimal strings, so no character in the letter can end a
  > string early or be read as an operator. A character WinAnsi cannot show becomes "?", and the caller is told how
  > many there were. The output is the same bytes for the same input, so its SHA-256 means something.

## 22 Sept 2026: Phase 146k

### `src/core/secrets.ts`

- Line 95:

  > EVERY KEY NAME PHASES 146b TO 146f NEED. secrets.example.env is checked against this list by a test, name for
  > name, so the two cannot drift.
  >
  > READ FROM EACH SUPPLIER'S PUBLISHED DOCUMENTATION, 22 September 2026:
  >   · Companies House — the key is the user name of HTTP Basic authentication, with an empty password.
  >   · CQC — the syndication API takes a subscription key in the `Ocp-Apim-Subscription-Key` header.
  >   · EPC — the service moved in 2025 from epc.opendatacommunities.org (which now redirects) to
  >     get-energy-performance-data.communities.gov.uk. Its API is api.get-energy-performance-data.communities.gov.uk
  >     and takes ONE bearer token, "found on your my account page when you are logged in to the service" (GOV.UK One
  >     Login). The old service's e-mail-plus-key pair is not needed, so there is one EPC name, not two.
  >   · HM Land Registry Business Gateway — RETIRED BY PHASE 146k (25 September 2026). Lakhbir decided the title register
  >     is looked up by hand, and took its four details out of the key file. Its four names (HMLR_BG_USERNAME,
  >     HMLR_BG_PASSWORD, HMLR_BG_CERT_PATH with the alias HMLR_BG_CERTIFICATE_PATH, HMLR_BG_CERT_PASSPHRASE) are marked
  >     `retired` below and are no longer in secrets.example.env. Nothing a click runs reads them: the connector that
  >     did is kept, retired, in PAID_RETIRED (src/integrations/connectors/paid-registers.ts).
  >   · IONOS — SMTP for sending and IMAP for reading replies, each a host, port, user and password.

## 22 Sept 2026: no phase named

### `src/integrations/analytics.ts`

- Line 24:

  > What Google's own guidance lists for GA4 under a content security policy (checked 22 September 2026).

## 23 Sept 2026: Phase 110

### `src/integrations/connectors/postcode.ts`

- Line 1:

  > THE ONS POSTCODE TABLE — A PROPERTY'S COUNCIL AREA (ITS BILLING AUTHORITY) AND WHICH PART OF THE UK IT IS IN.
  > Phase 146c, 23 September 2026. Switched off: REGISTER_SWITCHES.ONS_POSTCODE is false.
  >
  > NO CALL OUTSIDE. The ONS Postcode Directory is a free quarterly download (August 2026 is the current release,
  > checked 23 September 2026; the address is in the source register's SUPPLIER_DOCS) that the developer loads into a
  > table on this server (Phase 110: src/integrations/postcodes/postcode.ts, CAPREBATE_POSTCODE_DB). This connector reads that table through
  > `resolveProperty`, the one reader, and re-implements nothing: NORTHERN IRELAND IS REFUSED there (a BT postcode needs a
  > separate commercial licence from Land and Property Services), a postcode we do not serve is refused there, and a
  > terminated postcode is refused there. With no table set up, the lookup is not made and says so.
  >
  > It runs FIRST on a click, because its answer — which part of the UK the postcode is in, and the council area's name
  > — is what the energy certificate, sale price and planning lookups need when nobody recorded the nation, and what the
  > care regulator's search needs at all (it cannot be searched by postcode).
  >
  > NOTHING IS STORED IN register_records. The name exclusion register has no entry for this source, and the one door
  > refuses a source it does not know; the council area is recomputed from the table whenever a screen needs it
  > (src/integrations/postcodes/postcode.ts). The research panel keeps the council area's name in its words.

## 23 Sept 2026: Phase 146b

### `src/integrations/connectors/http.ts`

- Line 68:

  > A TRANSPORT THAT PRESENTS A CLIENT CERTIFICATE. Phase 146d, 23 September 2026.
  >
  > WHY IT HAS TO EXIST. HM Land Registry's Business Gateway will not talk to us over an ordinary connection: it needs
  > the client certificate HM Land Registry issues under the network access agreement, presented when the connection is
  > made, as well as a user name and password on every request (its developer pack, read 23 September 2026). `fetch`
  > has no way to present one — there is no option for it in the standard — so a call made with `fetch` cannot reach
  > the Gateway at all, whatever else is right.
  >
  > WHY IT IS IN THIS FILE. Phase 146b's rule is that this is the only file under src/ that may call outside, and a
  > test walks src/ and fails on any other. That rule is worth more than the tidiness of a separate file, so the one
  > place that needs `node:https` is here, beside `fetch`, under the same time limits, the same rate limit, the same
  > size cap and the same audit row. `callOutside` does not know which transport it was handed.
  >
  > THE CERTIFICATE FILE IS NEVER READ INTO THE REPOSITORY AND NEVER PRINTED. The key file holds its PATH and its
  > passphrase (src/core/secrets.ts); the file itself stays where the developer installed it. A missing or unreadable
  > certificate is a STATE, reported in plain words as a refused call — never a throw and never a screen error — and
  > the words name the key by NAME, never a value.
  >
  > IT IS MARKED LIVE, like `liveTransport`, so a suite that reached for it by accident is refused under `node --test`.

### `src/integrations/connectors/sources.ts`

- Line 173:

  > PHASE 146d, 23 September 2026 — THE LIVE BUSINESS GATEWAY. Phase 146b left this row with no address, so every
  >        call was refused. The address is HM Land Registry's own, published in the Business Gateway developer pack
  >        (landregistry.github.io/bgtechdoc, read 23 September 2026) and recorded in SUPPLIER_DOCS. Having the address
  >        does NOT make a call possible: the Gateway needs a user account AND the client certificate HM Land Registry
  >        issues under the network access agreement, both of which are the developer's to obtain and install, and the
  >        switch is off. What it changes is that a refusal now says "no certificate" rather than "no address" — the
  >        first is true and actionable, the second was true only because nobody had looked it up.
  >
  >        THE BASE IS THE HOST ALONE, NOT A SERVICE PREFIX, because the Gateway serves two families on one host and this
  >        connector uses both: the REST services under /bg2 (live) and /bg2test (test), and the SOAP services under
  >        /b2b/BGSoapEngine (live) and /b2b/BGStubService (test). Those four prefixes are published; the WSDL path of
  >        each individual SOAP service is not, and comes with the developer pack under the network access agreement.
  >        src/integrations/connectors/hmlr-title.ts names which of its paths are published and which the developer must confirm.

## 23 Sept 2026: Phase 146c

### `src/core/app.ts`

- Line 38:

  > PHASE 146c: THE KEY FILE, READ ONCE, AT START-UP. `processSecrets()` — the file outside the repository, or the
  > empty store under the test runner — so every connector reads the same store for the life of the process and no
  > request reads the disk. A key changed in the file takes effect on the next start. Nothing prints it: the store
  > prints as names only (src/core/secrets.ts).

- Line 45:

  > PHASE 146c: HOW A CONNECTOR REACHES OUTSIDE — the platform's fetch, through src/integrations/connectors/http.ts, which refuses a
  > live call under the test runner. A test passes recorded answers (fixtureTransport) instead.

### `src/integrations/connectors/http.ts`

- Line 199:

  > Phase 146c: whether a slot is free, without taking it.

- Line 490:

  > Phase 146c: the daily cap first, so a call refused by the short window does not use a day's slot.

### `src/integrations/connectors/matching.ts`

- Line 1:

  > MATCHING A TYPED ADDRESS, OR A TYPED NAME, TO WHAT A REGISTER HOLDS. Phase 146c, 23 September 2026.
  >
  > Built from the S10 Address Matching Spec (08-monday-doc-exports/12819677135__S10-Address-Matching-Spec.md): its
  > normaliser, its Jaro-Winkler and token-set Dice scores, its weights, its two thresholds and its tie rule (Part A.2,
  > A.5 and the Part B code), and the energy certificate profile and address mapper of A.8. The spec's code was never in
  > the repository; this is it, with the one addition the free lookups need — the mapper that splits free address lines
  > into building number, sub-unit and street, so a typed address and a register's lines are split by one rule.
  >
  > ───────────────────────────────────────────────────────────────────────────
  > WHY THIS EXISTS (standing rule 13, "the one open question")
  >
  > Before an engagement there is no UPRN: the paid address lookup never runs before signature. So the free registers are
  > searched on the TYPED postcode and address, and every candidate they return is scored against it. Only an ACCEPT
  > pre-fills anything. REVIEW, REJECT, INSUFFICIENT_INPUT and MATCH_ERROR all end the same way for the client: the fact
  > stays ASKED. Nothing refuses, nothing throws, and no value stands in for the fact (N4).
  >
  > ───────────────────────────────────────────────────────────────────────────
  > THE THRESHOLDS ARE NOT MEASURED, AND THIS FILE SAYS SO
  >
  > `MATCH_THRESHOLDS` holds the spec's provisional 0.90 / 0.70 for every register. The spec's 200-property test (A.4,
  > and A.8 point 10 for the energy certificate register) has not been run, so nobody knows whether 0.90 is good enough,
  > and this file does not assert that it is or that it is not. `THRESHOLDS_MEASURED` is false until it has run; the
  > harness that runs it is tools/match-measure.ts, and it waits on the data protection officer. Until then every
  > accepted match is written at grade B at most (A.6), never A.
  >
  > NO NAME IS SCORED. This file compares address strings and company names. A company name is the identity of a legal
  > entity, not a person (the name exclusion register, CH_COMPANY's note), and nothing here is stored: the caller keeps
  > only the accepted candidate's permitted fields, never the candidate list or a candidate's address lines (A.8 point 8).

### `src/integrations/connectors/nations.ts`

- Line 1:

  > WHAT A FREE LOOKUP IS ASKED ABOUT, AND WHICH PART OF THE UK A PROPERTY IS IN. Phase 146c, 23 September 2026.
  >
  > Its own small file so each connector can read it without importing src/integrations/connectors/free-registers.ts, which imports
  > every connector: one direction only, and no cycle to trip over.

### `src/integrations/connectors/planning.ts`

- Line 1:

  > PLANNING APPLICATIONS AT THE PROPERTY — planning.data.gov.uk, then PlanIt. ENGLAND AND WALES.
  > Phase 146c, 23 September 2026. Switched off: REGISTER_SWITCHES.PLANNING is false.
  >
  > THE HIGHEST-RISK SOURCE IN THE REGISTER (the name exclusion register, PLANNING's note): a planning record can carry
  > applicants, agents, objectors and neighbours, none of whom is our client. So only five fields are ever read — the
  > reference, the decision, the decision date, the date received and the description — and nothing that names a
  > person is read at all, matched or not (the S10 spec, A.6).
  >
  > TWO SERVICES, IN THIS ORDER, both read 23 September 2026 (the addresses and date are in SUPPLIER_DOCS):
  >
  >   1. planning.data.gov.uk — the government's planning data platform, no key: `/entity.json?dataset=planning-
  >      application&q=<postcode>`. ITS OWN DATASET PAGE SAYS it "is incomplete and is not yet ready for use", and local
  >      planning authorities are not yet required to publish to it. So an empty answer there is common and means only
  >      that it has nothing; the lookup goes on.
  >   2. PlanIt (https://www.planit.org.uk/api — never the bare planit.org.uk), a volunteer-run aggregator, no key:
  >      `/api/applics/json?pcode=<postcode>&krad=…`. ITS OWNER ASKS for one request a minute, about 300 a day, and "an
  >      identifier string, including your email, in the User-Agent field" — requests without one are blocked. Our own
  >      limit is exactly that (src/integrations/connectors/sources.ts), and `PLANIT_USER_AGENT` below is the identifier. The owner
  >      also writes that "it would not be wise to base any commercial services on the API"; that is recorded in
  >      SUPPLIER_DOCS for whoever decides whether this switch is ever turned on.
  >
  > MATCHING: each application's address is split and scored against the typed address; applications at the same
  > address count as one candidate, and on a clear ACCEPT every application at that address is kept (the most recent
  > `PLANNING_MAX_KEPT`). Anything short of ACCEPT keeps nothing.

### `src/integrations/connectors/price-paid.ts`

- Line 1:

  > HM LAND REGISTRY PRICE PAID DATA — WHAT A PROPERTY SOLD FOR, AND WHEN. EVERY SECTOR SINCE PHASE 159g.
  > Phase 146c, 23 September 2026. Switched off: REGISTER_SWITCHES.HMLR_PPD is false (on for the test website only).
  >
  > Built against HM Land Registry's published guidance and its linked-data documentation (read 23 September 2026; the
  > addresses and date are in the source register's SUPPLIER_DOCS). No key: the linked-data API at
  > https://landregistry.data.gov.uk, `/data/ppi/transaction-record.json?propertyAddress.postcode=…`.
  >
  > PHASE 159g, 10 October 2026 — ASKED FOR EVERY SECTOR (the Lockwood run, L11). Until now this lookup was made for
  > supported living only, on the reading that a surgery, a care home or a dental practice is commercial and never in
  > the dataset. That was wrong for Lockwood Surgery: HM Land Registry holds 3 Meltham Road, sold 3 June 2020 for
  > £540,000, leasehold, type "Other", category B. Category B is "additional price paid" — sales to companies, buy-to-lets,
  > repossessions, transfers — and a healthcare building that was once a house, or was bought by a company, can be in
  > it. So it is asked for every sector, by postcode and the building's number and street, and the sale's category is
  > kept (`ppd_category`, A or B). A category B sale, or one of type "Other", is a LEAD for the surveyor to confirm and
  > never the price (src/web/who-claims.ts isPricePaidLead; the desk-first reading skips it). A property outside England
  > and Wales, or whose nation nobody has recorded, is still not asked about.
  >
  > THE LOOKUP: every sale at the typed postcode, their addresses split and scored against the typed one; sales at the
  > same address count as one, and the latest is the one kept — the most recent sale is the likeliest to be our
  > client's purchase, and a person confirms it.
  >
  > THE ATTRIBUTION IS PRESCRIBED AND GOES WITH THE FIGURE, WORD FOR WORD, wherever it is shown:
  >   "Contains HM Land Registry data © Crown copyright and database right 2021. This data is licensed under the Open
  >    Government Licence v3.0."
  > It is the HMLR_PPD licence's `attribution_text` in the source register, and `PRICE_PAID_ATTRIBUTION` below reads it
  > from there. Every screen that shows a price paid carries it (test/phase146c.test.ts checks each one).

### `src/integrations/connectors/registers.ts`

- Line 115:

  > ONE SWITCH PER SOURCE THE RESEARCH PANEL LISTS, EVERY ONE OFF. Keyed by the source register's id. A source with no
  > entry here is off (N4: not known is not a yes), and a test checks that every source the panel lists has one.
  > Turning one on is a one-word change and a decision: the connector built (Phases 146c and 146d), tried on public
  > test data, its keys in the key file, and — for any live lookup on a client — the data protection officer's answer
  > to "Can we make a few small, logged test lookups to check a data connector works?".

- Line 290:

  > PHASE 146c: THE WHOLE LOOKUP, which may be several calls — a search, then the one record that matched. A connector
  > that makes one call gets this from `fetch` and `toBundle`; a connector built with `defineSteppedConnector` writes
  > its own. `runConnector` calls this, and only after the gate, the switch and the key.

- Line 298:

  > WHAT A LOOKUP CAME TO. Phase 146c. Five endings, and only READ keeps anything.
  >
  >   READ          the register answered and we could read it: records for the one door, facts for the claim.
  >                 A READ with no record is still a READ — Companies House holding no accounts that can be read by a
  >                 machine is an ordinary answer, not an error.
  >   CALL_FAILED   a call did not come back as an answer we could use (refused, over our limit, timed out, an error).
  >   UNREADABLE    it answered, but not in a form we could read.
  >   NOT_MATCHED   it answered, but nothing matched this client closely enough (src/integrations/connectors/matching.ts), or there
  >                 was nothing to search on. The fact stays asked. NO MATCH IS NOT A SOLE TRADER.
  >   NOT_COVERED   this register does not cover this property — a Scottish address for the energy certificates, a care
  >                 home for residential sale prices — so nothing was sent and the fact is asked.

- Line 370:

  > PHASE 146c: A CONNECTOR WHOSE LOOKUP IS SEVERAL CALLS — a search on the typed postcode or name, a match scored
  > against it, then the one record that matched. Every call still goes through `callOutside` (one audit row each), with
  > this connector's service, and nothing else can be named: `step` takes a path, never an address.
  >
  > `fetch` and `toBundle` are there for the shape's sake: `fetch` makes the lookup's FIRST call, and `toBundle` reads
  > nothing (a stepped connector reads its answers inside `lookup`, where it knows which call each one came from).

- Line 421:

  > Phase 146c: why it FAILED, as a short code the panel keeps (a call's outcome, UNREADABLE, NO_MATCH …); null otherwise.

- Line 423:

  > Phase 146c: when the publisher's answer was read — set on FIRED only, from the clock, never invented.

### `src/integrations/connectors/sources.ts`

- Line 35:

  > Phase 146c: rows that share one published limit count against one window. Companies House's limit is the key's,
  > across its Public Data API and its Document API, so both rows name the bucket COMPANIES_HOUSE. Absent: the row's own.

- Line 40:

  > Phase 146c: a second, daily cap where the publisher asks for one (PlanIt: about 300 a day).

- Line 86:

  > Phase 146c: the Document API, for whether a filing has an iXBRL copy. Same key, same published limit — so the
  >        same bucket as the Public Data API, and the two together never pass 600 in five minutes.

- Line 117:

  > Phase 146c: PlanIt's own guidance, read 23 September 2026 — "you can safely make one request to the
  >        /api/applics endpoint every minute", and "a daily request cap of 300". One try only: a retry inside the minute
  >        would break the first, so a busy answer is reported and a person tries again later.

- Line 125:

  > Phase 146c: planning.data.gov.uk, the government's planning data platform — no key. Its planning application
  >        dataset says of itself, read 23 September 2026, that it "is incomplete and is not yet ready for use", so a lookup
  >        that finds nothing there goes on to PlanIt.

- Line 363:

  > Phase 146c: a source's MAIN service. CH_COMPANY also reads COMPANIES_HOUSE_DOCUMENTS, and PLANNING asks
  >      PLANNING_DATA before PlanIt; ONS_POSTCODE has no service at all — its table is read on this server.

### `src/integrations/registers/source-register.ts`

- Line 205:

  > Phase 146c, 23 September 2026: HM Land Registry's prescribed words, read that day from GOV.UK's "Price Paid Data"
  >        guidance — the year is a fixed 2021, not a placeholder, and the line before this phase left it out.

- Line 808:

  > Phase 146c, 23 September 2026: this was the service's WEBSITE. The API is

- Line 1062:

  > ------------------------------------------------------------------ *
  > 3a. What each supplier publishes, and when we read it — Phase 146c.
  >
  >     Every connector built in Phase 146c (09-app/backend/src/connectors/)
  >     was built against the documentation below, read on the date given.
  >     A connector's fields, paths and limits come from these pages and from
  >     nowhere else; when a supplier changes them, this is the list to re-read
  >     and re-date. `api_base` is every address a connector for the source
  >     calls — 09-app/backend/src/connectors/sources.ts holds one row for each,
  >     and a test checks that every row there is listed here.
  >     `findings` records what the pages DO NOT say as carefully as what they
  >     do: an unpublished limit or term is written as unpublished, never
  >     guessed.
  > ------------------------------------------------------------------

- Line 1224:

  > PHASE 146d adds api.homedata.co.uk as a THIRD address this source can be asked at — built, switched off, and
  >        not chosen. PlanIt remains the source of record; see src/integrations/connectors/homedata-planning.ts for why the choice is
  >        not a build decision. An address listed here is how a service row stays tied to its register source when the
  >        source has more than one publisher, which planning has had since Phase 146c.

## 23 Sept 2026: Phase 146d

### `src/core/secrets.ts`

- Line 72:

  > PHASE 146d: OTHER NAMES THE SAME KEY IS WRITTEN UNDER IN A KEY FILE THAT ALREADY EXISTS.
  >
  > A key file line whose name no connector owns is IGNORED — deliberately, so that a stray line cannot be read as a
  > key — and the ignoring is silent, which is the right behaviour for a stray line and the wrong one for a key
  > somebody typed under a name we did not expect. That happened: the key file on the Mac names the Land Registry
  > certificate HMLR_BG_CERTIFICATE_PATH, the code read HMLR_BG_CERT_PATH, and the line sat there doing nothing
  > while the connector reported that no certificate was installed. Both were right and the two never met.
  >
  > An alias is read as the canonical name. THE CANONICAL NAME IS STILL THE ONE THE CODE ASKS FOR and the one
  > secrets.example.env lists; an alias is a spelling we accept, not a second key. Where a file holds both, the
  > canonical one wins — a file that disagrees with itself is not resolved in favour of the older spelling.

### `src/integrations/connectors/epc.ts`

- Line 95:

  > PHASE 146d, ITEM 9 — THE PAID LOOKUP'S UPRN, WHERE IT RAN FIRST ON THIS CLICK AND MATCHED. Null otherwise, and
  > null is the ordinary case: the paid address lookup is switched off and, even switched on, fires only after a
  > signed engagement. A UPRN turns this lookup's weakest step into its strongest — see `bySearchKey` below.

### `src/integrations/connectors/free-registers.ts`

- Line 1:

  > THE FREE REGISTERS — WHICH CONNECTOR ANSWERS WHICH LOOKUP, WHAT IT IS ASKED, AND WHAT ITS ANSWER MEANS TO THE
  > ESTIMATE. Phase 146c, 23 September 2026.
  >
  > Six connectors, each built against the supplier's own published documentation (the dates and addresses are in the
  > source register, 09-app/backend/src/registers/caprebate-source-register.ts, `SUPPLIER_DOCS`), each tested on recorded
  > answers, and EVERY ONE SWITCHED OFF (REGISTER_SWITCHES in src/integrations/connectors/registers.ts):
  >
  >   CH_COMPANY    Companies House: search, company profile, filing history      src/integrations/connectors/companies-house.ts
  >   CH_PSC        Companies House: people with significant control — ONLY after a signed engagement (CA2)
  >   CQC           the Care Quality Commission: locations and providers (England) src/integrations/connectors/cqc.ts
  >   EPC           energy certificates: non-domestic and display, and domestic for supported living   src/integrations/connectors/epc.ts
  >   HMLR_PPD      HM Land Registry sale prices — residential only, so supported living only          src/integrations/connectors/price-paid.ts
  >   PLANNING      planning.data.gov.uk and PlanIt                                 src/integrations/connectors/planning.ts
  >   ONS_POSTCODE  the ONS postcode table, read on this server — no call outside  src/integrations/connectors/postcode.ts
  >   CIW           Care Inspectorate Wales's directory, imported on this server — no call outside (Phase 155)
  >   CARE_INSPECTORATE  the Care Inspectorate's datastore (Scotland), the same way   src/integrations/connectors/register-files.ts
  >
  > THE GATES ARE NOT HERE. `consultAllowed` in src/web/research.ts hands a connector a lookup only after
  > `stateUnderGates` has allowed it; while CB_REGISTRY.precondition is false that is never. A connector then checks its
  > own switch and its key (`runConnector`), and a typed address or name must MATCH (src/integrations/connectors/matching.ts) before
  > anything is kept. Anything short of that leaves the question asked (N4).
  >
  > NOT BUILT, AND SAYING SO: the valuation office — `NOT_BUILT` below. Its licence restricts its rating list to business
  > rates purposes (read 4 October 2026, Phase 155 line 3). The Welsh and Scottish care regulators were here until
  > Phase 155 built them.
  >
  > THE PAID LOOKUPS ARE NOW BUILT, and they live in their own map: PAID_CONNECTORS in src/integrations/connectors/paid-registers.ts
  > (Phase 146d). `consultAllowed` reads both maps. They are separate because the two tiers are gated differently — a
  > free lookup waits on a published privacy notice, a paid one on a signed engagement and an operator's click — and
  > putting them in one map would make the two look like one kind of thing with a flag on it.

- Line 92:

  > PHASE 146d, item 9: `uprn` is the paid address lookup's, where it ran first on this click and matched — it
  >      turns this lookup's address match into an exact one. It is absent on every click today, because that lookup is
  >      off and waits on a signed engagement in any case.

- Line 122:

  > WHAT THE RESEARCH PANEL SAYS FOR AN ALLOWED LOOKUP WITH NO CONNECTOR IN THIS BUILD. In plain words, because they
  > reach the panel. The paid lookups are not listed: their gate shuts first, and Phase 146d builds them.

### `src/integrations/connectors/hmlr-title.ts`

- Line 72:

  > PHASE 146d, ITEM 15: WHAT THE PENNY PRE-CHECK FOUND, where it ran on this same click. Null when it did not run —
  > and a null is NOT a reason to skip the £7 call. "We did not look" and "we looked and there is no title" are
  > different facts, and only the second one saves money (N4 applied to a spending decision).

### `src/integrations/connectors/homedata.ts`

- Line 1:

  > THE PAID ADDRESS LOOKUP — HOMEDATA. UPRN, ADDRESS, POSTCODE AND COORDINATES, AFTER A SIGNED ENGAGEMENT.
  > Phase 146d, 23 September 2026. Switched off: REGISTER_SWITCHES.HOMEDATA_ADDRESS is false.
  >
  > WHAT IT IS FOR, AND WHAT IT IS NOT FOR. Every free register is matched on a typed address, and a typed address is
  > the weakest key in this system (src/integrations/connectors/matching.ts, at thresholds nobody has measured). A UPRN is the
  > strong one: Ordnance Survey's own identifier for a single addressable property. So this lookup's job is to turn the
  > address somebody typed into a UPRN, and that UPRN then UPGRADES the free registers' fuzzy match — for the energy
  > certificates it becomes an exact key, as a company number already is for Companies House (item 9). It is not a
  > source of facts about the building: its whitelist is four fields wide and holds no floor area, no valuation and no
  > name.
  >
  > ───────────────────────────────────────────────────────────────────────────
  > THE TWO CALLS, AND WHY THEY ARE THOSE TWO
  >
  >   1. GET /address/postcode/{postcode}/            2 tokens   every address at the typed postcode, each with a UPRN
  >   2. GET /property/{uprn}/?with=address,lr_title  6 tokens   the matched one's address fields and coordinates (5),
  >                                                              plus the one-penny title pre-check (1)
  >
  > SLUGS, NEVER TIERS — and there is a test that says so. The supplier also sells the same UPRN as /property/{uprn}/
  > base/, /core/ and /complete/ at 10, 25 and 50 tokens. WE NEVER CALL THOSE, and the reason is not the price. Core
  > returns crime and demographics and Complete adds deprivation; the source register excludes exactly those under
  > `occupier_*` and `resident_*`, so their answers would have to be stripped before they could be kept. A call whose
  > answer must be stripped is worse than a call that is narrow: the data still arrived, still sat in this process, and
  > still has to be got rid of correctly every single time. `?with=` asks for the named slugs and nothing else, and it
  > costs the sum of their published weights — the same 5 tokens for the address, and no crime figures.
  >
  > ───────────────────────────────────────────────────────────────────────────
  > THE ONE-PENNY PRE-CHECK, AND WHY IT IS NOT A REPLACEMENT FOR THE £7 TITLE (item 15)
  >
  > `lr_title` costs 1 token — one penny — and says whether a registered title exists, what its number is and whether it
  > is freehold or leasehold. So the click can find out, for a penny, whether there is a title to buy at all and
  > whether it is the kind we want, before it spends £7 and a Business Gateway round trip on a property that has no
  > registered title or is plainly not the client's.
  >
  > IT CANNOT STAND IN FOR THE TITLE REGISTER, AND NOBODY SHOULD LATER OPTIMISE THE £7 AWAY ON THE STRENGTH OF IT:
  >
  >   · HOMEDATA CARRIES NO COMMERCIAL PRICE PAID. Its sold prices are HM Land Registry's PRICE PAID DATA, and that
  >     dataset is residential sales only — it excludes commercial property entirely. Four of our five sectors are
  >     commercial. Buying the title register is the ONLY way to a price paid for them, and that is the whole reason
  >     the £7 call exists.
  >   · IT CARRIES NO PERSONAL PROPRIETOR. Its fuller title product (`lr_title_full`, 10 tokens) is corporate and
  >     overseas ownership only, so a property held personally — which is exactly the case name exception 2 was written
  >     for — has no proprietor there at all.
  >
  > THE PRE-CHECK IS NEVER STORED. What it returns goes into the run's `facts`, which chain to the next lookup on the
  > same click and are not written to the database; only `records` go through the one door. Storing it under
  > HOMEDATA_ADDRESS would break that source's whitelist, and storing it under HMLR_TITLE would say HM Land Registry
  > told us something a reseller told us. Neither is true, so neither is written.
  >
  > ───────────────────────────────────────────────────────────────────────────
  > THE SHAPES ARE READ FROM THE SUPPLIER'S PROSE, AND THAT IS SAID PLAINLY
  >
  > This phase was told to build from fixtures captured in the supplier's own playground rather than from the prose of
  > its documentation. THE PLAYGROUND TURNED OUT TO NEED AN ACCOUNT: https://homedata.co.uk/developer/playground
  > redirects to a log-in page, and its own live-demo page says "Create an account to run them against your own key"
  > (both read 23 September 2026). Its OpenAPI document IS public — https://api.homedata.co.uk/schema/yaml/, 155 paths
  > — and every path, parameter and weight below is taken from it and from the endpoint reference. BUT THAT DOCUMENT
  > PUBLISHES NO RESPONSE SCHEMAS: every one of its responses reads "200: No response body". So the field NAMES below
  > come from the endpoint reference's prose, the fixtures are shaped from that, and the readers are deliberately
  > tolerant — they accept the answer under any of the containers the prose uses and keep a field only when it is
  > there. A field the answer does not give is not invented and not zeroed; the question stays asked (N4).
  > THE FIRST LIVE CALL MUST CONFIRM THE SHAPE, and that is written down in the source register's findings too.

### `src/integrations/connectors/http.ts`

- Line 265:

  > PHASE 146d: WHAT THIS ONE CALL COST, AND WHETHER ANYBODY CHARGED US FOR IT.
  >
  > `charged` is the boolean item 11 of this phase asks for, and it is there because without it a cost report counts
  > failures and overstates what we spent. A call that was refused before it left, was over our own limit, timed out,
  > or came back 404 or 500 has charged === false, and a report adds nothing for it.
  >
  > `cost_pence` is null ONLY when we genuinely do not know, which is N4 applied to money: a cost nobody reported is
  > not a cost of zero. `cost_basis` says where the figure came from, so the two can never be confused:
  >
  >   'supplier'     the service told us, on this response. Homedata sends X-Tokens-Charged on a wallet key
  >                  (100 tokens = £1, so one token is one penny). This is the only basis that is evidence.
  >   'price_list'   the service served a response and publishes a fixed price for it, which src/connectors/
  >                  sources.ts carries (HM Land Registry: £7 an official copy). Our reading of its price list.
  >   'not_billed'   nothing was served, and the service says it does not bill for that. Homedata: "any 4xx other
  >                  than a 402 and any 5xx is never billed", and a debit taken before a failure is refunded.
  >   'free'         the service does not charge at all (every free register).
  >   'unknown'      a paid service answered and neither told us nor publishes a price. cost_pence is null.

- Line 356:

  > WHAT A RESPONSE SAYS IT COST. Phase 146d.
  >
  > Homedata's authentication page, read 23 September 2026: "Wallet keys receive the X-Tokens-* pair and no rate-limit
  > headers at all; quota keys receive the X-RateLimit-* family instead. You will not see both." SO THE CHARGE HEADER
  > MAY SIMPLY NOT BE THERE, and when it is not, this returns null rather than 0 — a quota key's calls are paid for in
  > a different currency, not for nothing. `x-call-weight` is read as well because that is the header the live service
  > actually sends today on an unauthenticated call; both are the same number of tokens, and one penny each.

- Line 438:

  > PHASE 146d: WHAT IT COST, WORKED OUT ONCE, HERE, FOR EVERY CALL — so no connector can forget to record it and
  >        no two connectors can disagree about how. The supplier's own figure wins wherever it sends one.

- Line 465:

  > Phase 146d, item 11: the charge and the boolean beside it. A cost report reads `charged` first and adds
  >              `cost_pence` only where it is true, so a run of failures reports nothing spent, which is the truth.

### `src/integrations/connectors/registers.ts`

- Line 425:

  > PHASE 146d: WHAT THIS LOOKUP SPENT, in pence, added up from EVERY call it made — not only the last one. A
  > stepped lookup makes several calls and each one may or may not be charged, so the sum has to be taken where the
  > whole list is, which is here. Only a call that says it was charged counts: a refusal, a time-out or an error
  > adds nothing, because the suppliers' own terms are that they do not bill for those. A charge nobody reported is
  > null on the call and is left out rather than counted as free (N4 applied to money).

### `src/integrations/connectors/sources.ts`

- Line 47:

  > PHASE 146d: WHAT ONE CALL COSTS US, IN PENCE, where the publisher prices its calls. Absent on a free service —
  > absent means "this service does not charge", never "we do not know", and a test checks that every PAID row has
  > one. It goes on the audit row (`cost_pence`) beside the charge the supplier reports, so a cost report is built
  > from what was actually spent rather than from a price list somebody retyped.
  >
  > Homedata's is a WEIGHT, not a fixed price: its calls cost a number of tokens that depends on the path and the
  > slugs asked for, at 100 tokens to the pound, so one token is one penny (its pricing page, read 23 September
  > 2026). `cost_pence` here is the cheapest call on the row; the connector works out the real figure per call and
  > puts it on the audit row.

- Line 136:

  > PHASE 146d, 23 September 2026 — SETTLED ON A LIVE RESPONSE, NOT ON THE PROSE, because the supplier's own pages
  >        disagree with each other. Its endpoint reference states "Base URL: https://api.homedata.co.uk/api" while every
  >        worked example on the same page omits the /api. Both forms are routed — a path that cannot exist answers 404
  >        under either, a real one answers 403 for the missing key — so neither a 403 nor a 404 on a metered path settles
  >        it. WHAT SETTLES IT IS THE ONE CALL THAT NEEDS NO KEY: the supplier documents /ping and /health as open, and
  >        GET https://api.homedata.co.uk/ping answered 200 {"status":"ok"} while /api/ping answered 404
  >        RESOURCE_NOT_FOUND. Its published OpenAPI document (https://api.homedata.co.uk/schema/yaml/, also open) declares
  >        all 155 of its paths without the prefix. So the base is the host alone and every path this connector sends
  >        begins "/address/…" or "/property/…". The source register's endpoint was corrected to match.

- Line 146:

  > PHASE 146d: STILL UNPUBLISHED. The supplier's pricing page states only "Rate limits are applied per API key.
  >        Exceeding the limit returns HTTP 429 — requests are not queued, retry with backoff" and "a 429 costs nothing".
  >        No number appears on it, on the authentication page or in the OpenAPI document, all read 23 September 2026, and
  >        the coverage matrix is "available on request". So the cautious 100 in five minutes stays a guess of ours and
  >        says so. The retry does better than a guess: http.ts honours the Retry-After the supplier sends.

- Line 160:

  > PHASE 146d: THE SAME SUPPLIER, THE SAME KEY, A DIFFERENT REGISTER SOURCE. Homedata can answer planning too, by
  >        UPRN, and item 18 of this phase says to build that route, leave it switched off and NOT decide whether it
  >        replaces PlanIt — which stays the source of record. Its own row because `register_source` is what ties a
  >        service to the register of what we consult, and this one is PLANNING; its own bucket is Homedata's, because
  >        one API key is what the supplier limits. 5 tokens: the planning_history slug's published weight.

- Line 195:

  > PHASE 146d: THE VENDOR TEST ENVIRONMENT, which is where this connector is built and proved. Same certificate,
  >        same user account, same shapes, invented titles and no fee. It shares HMLR_TITLE's window so a test run cannot
  >        be used to make more calls than we allow ourselves in all. `cost_pence` is 0 because the test environment
  >        charges nothing — and that is a fact about it, not an unknown.

### `src/integrations/registers/name-exclusion.ts`

- Line 235:

  > PHASE 146d, 23 September 2026 — `price_paid`, `transaction_date` AND `prior_owner_count` ADDED, and their
  >        absence was a real defect rather than a tightening. The whole reason this £7 lookup exists is that HM Land
  >        Registry's FREE sale-price data is residential only, so for a care home, a dental practice, a surgery or a
  >        hospital the official copy of the register is the only source of a price paid there is. The register row
  >        described the lookup without permitting the one field it is bought for: any connector writing it would have
  >        been refused at the one door as an unclassified field. Neither is a name: a price is a sum of money, a date
  >        is a date, and a prior-owner COUNT is a number — the former proprietors' names stay excluded below, and the
  >        count is why it is a count.

- Line 312:

  > Phase 146d adds `planning_uprn`, which the source register has always permitted and this one did not keep —
  >        so a planning record carrying the property's own identifier would have been refused at the one door as an
  >        unclassified field. It is the least personal thing on the row: it names a building.

- Line 319:

  > Phase 146d, 23 September 2026 — see the note. The patterns end in a bare '*' rather than '_*' BECAUSE THE
  >        FIELD PlanIt ACTUALLY SENDS IS `case_officer`, with nothing after it: 'case_officer_*' would have matched
  >        every spelling except the real one. A glob is only as good as the name it was written against.

- Line 388:

  > Board item 13003875907. ADDED BY PHASE 146d, 23 September 2026 — and until it was added, nothing from the paid
  > address lookup could be written at all: `findPolicy` fails closed on a source it does not know, so the one
  > door would have refused every record with E_UNKNOWN_SOURCE. That is the register working as designed, and it
  > is why the entry comes with the connector rather than after it.
  >
  > THE LOWEST-RISK ROW IN THIS REGISTER, and it is worth saying why so that nobody later widens it by analogy.
  > This lookup returns an identifier, an address line, a postcode and a point on the ground. It has no
  > proprietor, no occupier, no resident and no free text of any kind. The supplier sells a great deal more about
  > the same property — who lives in the area, what crime is recorded near it, how deprived the neighbourhood is —
  > and the connector never asks for any of it: it requests named slugs, never the supplier's bundles, and there
  > is a test that it never requests a bundle. The exclusions below are therefore about the SUPPLIER'S catalogue
  > rather than about this endpoint's answer, which is the right way round for a paid reseller whose product may
  > grow between one release and the next.
  >
  > THE ADDRESS LINE IS THE CLIENT'S OWN PROPERTY'S ADDRESS, which we already hold because somebody typed it in.
  > It is not a person's address: this system's clients are trading businesses, and a lookup is only ever made
  > after that business has signed an engagement letter with us.

### `src/integrations/registers/source-register.ts`

- Line 701:

  > PHASE 146d, 23 September 2026 — `price_paid`, `transaction_date` and `prior_owner_count` added. THE ROW
  >        DESCRIBED THIS LOOKUP WITHOUT PERMITTING THE FIELD IT IS BOUGHT FOR. An official copy of the register records
  >        the price paid, or the value stated where no price was paid, for every disposition since April 2000 —
  >        commercial included — and that is the ONLY source of a price paid for four of our five sectors, because HM
  >        Land Registry's free Price Paid Data is residential sales only. Without these three the connector's records
  >        would have been refused at the one door as unclassified fields. The prior-owner CHAIN is kept as a count:
  >        how many earlier proprietors the register records, never who they were — `former_proprietor_*` stays
  >        excluded.

- Line 717:

  > PHASE 146d: the Business Gateway's published live address, from HM Land Registry's own developer pack (read
  >        23 September 2026). The vendor test environment is https://bgtest.landregistry.gov.uk. Reaching either needs
  >        a Business Gateway account AND the client certificate HM Land Registry issues under the network access
  >        agreement, both of which are the developer's to obtain.

- Line 826:

  > HIGHEST RISK SOURCE (subitem 12818304906). The whitelist is deliberately tiny.
  >
  > WHAT THIS COMMENT USED TO SAY, AND WHY IT WAS WRONG (corrected by Phase 146d, 23 September 2026). It said the
  > whitelist "contains no free-text field that could carry a third party's name". IT DOES: `planning_description`
  > is free text, and a planning description routinely carries a surname — "Erection of a rear extension for Mr
  > Smith" is an ordinary way for an authority to write one. A comment that says a risk is absent is worse than no
  > comment at all, because the next reader stops looking.
  >
  > THE FIELD IS KEPT ALL THE SAME, AND HERE IS THE REASONING, so that this is a decision on the record rather
  > than an oversight with a nicer comment on it. The name exclusion register excludes `comment_*` and
  > `correspondence_*` WHOLESALE and states the rule behind it: "the rule for a free-text field that MAY carry a
  > name is exclusion of the whole field, never a best-effort filter." That rule was written about text produced
  > BY third parties ABOUT themselves — objectors and neighbours, people with no connection whatsoever to the
  > client or the claim, in whom no legitimate interest is claimed. A description is a different thing in every
  > respect that matters: it is written by the authority, about the WORKS, on a statutory public register, and —
  > because a planning record is kept only when it matched THE CLIENT'S OWN PROPERTY at ACCEPT — any applicant it
  > names is overwhelmingly the client or their agent, not a stranger. It is also the single most useful planning
  > fact this system has: what was built, and when, is what a capital allowances claim turns on.
  >
  > SO THE POSITION IS: the field stays, the comment tells the truth about it, and the data protection officer is
  > asked to confirm that reading rather than being left to discover it. No best-effort name filter is built, and
  > none should be — that is the one thing the register's own rule forbids outright.
  >
  > `officer*` AND `case_officer*` ARE EXCLUDED (Phase 146d). A case officer is a named council employee who is
  > not our client and has no connection to the claim. Nothing we call today returns one into a kept field, but
  > BOTH candidate suppliers publish one: Homedata's /planning/search/ documents that it returns "case officer
  > details", and PlanIt's own answer carries `case_officer`, `applicant_name`, `agent_name` and `agent_address`
  > inside its `other_fields` object — checked on a live PlanIt response on 23 September 2026, so this is not an
  > assumption that the risk arrived with the paid supplier. It was already there. The connector reads named keys
  > only and never touches `other_fields`, so nothing leaks today; these patterns are the second line, for the day
  > somebody reads one field more.

- Line 871:

  > Phase 146d: a bare '*', because the field PlanIt sends is `case_officer` with nothing after it.

- Line 931:

  > PHASE 146d, 23 September 2026 — LATITUDE AND LONGITUDE ADDED, and it is a fix rather than an extension.
  >
  > The spatial screen (board item 12830181761 — the check that two records are about the same building) is
  > geometry-keyed, and its own specification says the coordinates come from THIS lookup. NOTHING ELSE IN THIS
  > REGISTER SUPPLIES A COORDINATE AT ALL: every other row is an identifier, an area, a date or a status. So while
  > this whitelist stopped at three fields, the screen could not be fed by anything, and a contamination check
  > that cannot run is not a check.
  >
  > A COORDINATE IS NOT PERSONAL DATA HERE. It is a point on the ground identifying a building, which is what this
  > whole register is about; it says nothing about who is inside it. The rows that WOULD say that — `occupier_*`
  > and `resident_*` — are excluded below and are the reason this connector asks for named slugs and never for one
  > of the supplier's bundles.
  >
  > USRN, TOID AND UDPRN ARE DECIDED AND EXCLUDED, rather than left unmentioned. USRN identifies a street, TOID an
  > Ordnance Survey map feature and UDPRN a Royal Mail delivery point. Each is a real identifier and each would be
  > another key we could match on one day — but nothing in this build reads one, an identifier nobody uses is data
  > held for no purpose, and the supplier publishes no permission to hold its identifiers at all. If something
  > later needs one, it is added here with the reason, which is the point of naming them now.

- Line 957:

  > PHASE 146d: CORRECTED FROM https://api.homedata.co.uk/api/address/ ON A LIVE RESPONSE, 23 September 2026. The
  >        supplier's endpoint reference states "Base URL: https://api.homedata.co.uk/api" while every worked example on
  >        the same page omits the /api, so the documentation could not settle it. The open, unauthenticated /ping did:
  >        GET https://api.homedata.co.uk/ping answered 200 and /api/ping answered 404, and the supplier's public
  >        OpenAPI document declares all 155 of its paths without the prefix. The /api form IS still routed — it is an
  >        alias — but the root is the canonical one and is the one we call.

- Line 1252:

  > PHASE 146d, 23 September 2026. `api_base` is the host alone: settled on a LIVE response rather than on the
  >        prose, because the prose contradicts itself.

- Line 1310:

  > PHASE 146d, 23 September 2026. Nothing here can be called without the network access agreement, so every
  >        line below is from HM Land Registry's own public developer pack rather than from a response.

## 23 Sept 2026: Phase 146f

### `src/integrations/connectors/paid-registers.ts`

- Line 1:

  > THE PAID LOOKUPS — WHICH CONNECTOR ANSWERS WHICH, WHAT IT IS ASKED, AND WHAT ONE CLICK OF THEM COSTS.
  > Phase 146d, 23 September 2026. The twin of src/integrations/connectors/free-registers.ts, and every one SWITCHED OFF.
  >
  >   HOMEDATA_ADDRESS   the paid address lookup — a UPRN, an address, a postcode and coordinates, plus the penny
  >                      title pre-check                                          src/integrations/connectors/homedata.ts
  >   HMLR_TITLE         HM Land Registry's title register, about £7 a title      src/integrations/connectors/hmlr-title.ts
  >                      RETIRED FROM THE CLICK BY PHASE 146k (25 September 2026): Lakhbir decided the title register is
  >                      looked up by hand, and took the Business Gateway details out of the key file. It is in
  >                      `PAID_RETIRED` below, not in `PAID_CONNECTORS`, and src/web/title-by-hand.ts is where a person
  >                      records what the official copy says.
  >   HOMEDATA_PLANNING  planning by UPRN — CHOSEN (Phase 156f): after signing it answers the PLANNING row in place of
  >                      the free route, keyed on the UPRN the address lookup found   src/integrations/connectors/homedata-planning.ts
  >   HOMEDATA_BOUNDARY  the site area from the title outline, read off the address lookup's own call (Phase 156f)
  >                                                                               src/integrations/connectors/title-boundary.ts
  >
  > THE ORDER IS NOT A PREFERENCE, IT IS A DEPENDENCY. The address lookup runs first because everything after it is
  > keyed on the UPRN it returns and on the penny pre-check it makes: the title register uses the pre-check to decide
  > whether £7 is worth spending, and the paid planning route has no key at all without a UPRN. A click that runs them
  > in any other order spends more and finds less.
  >
  > THE GATE IS NOT HERE, AND THERE IS NO SECOND ONE. `consultAllowed` in src/web/research.ts hands a connector a
  > lookup only after `stateUnderGates` has allowed it, and for a paid source that means a signed engagement asserted
  > server-side — `assertSignedEngagement`, which since Phase 146f reads the signature RECORD and not merely a letter
  > marked SIGNED. Then the source's own switch, then its key. Every one of those is off or absent today, so a click
  > contacts nobody.

## 23 Sept 2026: Phase 146g

### `src/core/audit.ts`

- Line 63:

  > Phase 146g, 23 September 2026: WHAT LEFT THE BUILDING, once per document, written by the upload flow
  > (src/web/uploads.ts) from the pipeline's own egress record when steps 9 and 10 run. The payload's fingerprint,
  > the KIND and PAGE of each segment sent and each segment the strip dropped with its reason, and the fields asked
  > for. NEVER A WORD OF THE DOCUMENT. It is the answer to "what exactly did you send", and it is the pipeline's
  > record rather than the reader's: the reader's own row is DOCUMENT_READ_BY_MODEL, beside it.

- Line 91:

  > Phase 146g, 23 September 2026. A member of staff said an address that bounced for good works again
  > (src/web/settings.ts). Whether a lift happened, and nothing else: the address itself is the new row in
  > email_suppressions, which carries who lifted it and when. No log line carries an address.

### `src/core/staff.ts`

- Line 1351:

  > ADDRESSES WE CANNOT EMAIL — PHASE 146g, 23 September 2026. Admin only.
  >
  > An address the mail server refused for good is stopped, and nothing more is sent to it. That was built by Phase
  > 146f with no way back: `liftSuppression` existed and no screen called it. This is the screen.
  >
  > A LIFT IS A NEW ROW, not an edit. The bounce stays on record and so does the stop; the lift sits after them with
  > who pressed the button and when. Pressing it for an address that is not stopped is not an error and says so.

## 23 Sept 2026: Phase 146h

### `src/core/audit.ts`

- Line 337:

  > Phase 146h, 23 September 2026: one person resolving one close-but-not-certain register match
  > (src/web/match-review.ts). The lookup, whether anything was chosen, what the matcher scored it, the confidence
  > grade the choice mints, and whether a record was stored. NEVER THE CANDIDATE, NEVER ITS LABEL: what a person
  > read on the way to the decision is the register's own address line, and A.8 point 8 says it is neither stored
  > nor logged. Who made it is the row's own actor.

### `src/integrations/connectors/epc.ts`

- Line 1:

  > ENERGY CERTIFICATES — FLOOR AREA AND BUILDING TYPE FROM THE ENGLAND AND WALES REGISTER.
  > Phase 146c, 23 September 2026. Switched off: REGISTER_SWITCHES.EPC is false.
  >
  > Built against the "Get energy performance of buildings data" service's API documentation and its OpenAPI file
  > (read 23 September 2026; the addresses and date are in the source register's SUPPLIER_DOCS). Base
  > https://api.get-energy-performance-data.communities.gov.uk, a bearer token from the key file's EPC_API_TOKEN, and our
  > own limit half the published 6,000 requests in 5 minutes. The register covers "buildings in England and Wales"
  > only, so a property elsewhere, or one whose nation nobody recorded, is not asked about.
  >
  > ───────────────────────────────────────────────────────────────────────────
  > THE LOOKUP (the S10 spec's energy certificate profile, A.8)
  >
  >   1. /api/non-domestic/search and /api/display/search on the typed postcode — and, for supported living only,
  >      /api/domestic/search too, because those buildings are often dwellings. One search per register, no widening to
  >      a neighbouring postcode. "No certificates found" is a 404, and it means no candidates, not an error.
  >   2. The candidates' four address lines are split by the same mapper as the typed address and scored
  >      (src/integrations/connectors/matching.ts). Certificates at the same address count as one, and the latest is the one fetched.
  >      Only one clear ACCEPT goes on; anything else leaves the questions asked.
  >   3. /api/certificate?certificate_number=… for the accepted one. A search result carries no floor area and no
  >      building type — only the certificate does.
  >
  > ───────────────────────────────────────────────────────────────────────────
  > A UPRN IS AN EXACT KEY, AND A POSTCODE IS NOT (Phase 146d, item 9)
  >
  > Steps 1 and 2 above exist because a postcode search returns every certificate in the postcode and we then have to
  > work out which one is our client's, by splitting addresses and scoring them at thresholds nobody has measured.
  > That is the weakest link in this lookup and it is the reason its grade is capped.
  >
  > The energy certificate service also searches BY UPRN — its own documentation lists `uprn` beside `postcode` and
  > `address` as a search parameter. A UPRN is Ordnance Survey's identifier for one addressable property, so a search
  > on it returns that property's certificates and nobody else's. WHERE WE HAVE ONE, IT IS TREATED AS AN EXACT KEY:
  > no scoring, no threshold, no REVIEW — exactly as a company number already is for Companies House, where a number
  > on the client's record means no name search is made at all. The address is still read, because the certificate is
  > still fetched by its number, but the CHOICE of certificate is no longer a guess.
  >
  > WHERE A UPRN SEARCH FINDS NOTHING, THE LOOKUP DOES NOT FALL BACK TO THE POSTCODE. A UPRN that returns no
  > certificate means this property has none — that is an answer, and a good one. Widening to the postcode after it
  > would be choosing a weaker key because the stronger one told us something we did not want to hear, which is how a
  > neighbour's certificate ends up in a client's claim file.
  >
  > WHAT IS KEPT: the floor area, the building type (a non-domestic certificate's `property_type`, a domestic one's
  > `dwelling_type`), the date it was registered, its number, and — since Phase 146h — the construction age band and
  > the tenure of a DOMESTIC certificate, DECODED. NOT KEPT: any address line (the register's addresses are under an
  > Ordnance Survey and Royal Mail notice), the UPRN and the energy assessor (a person).
  >
  > ───────────────────────────────────────────────────────────────────────────
  > THE DOMESTIC CERTIFICATE'S CODES (Phase 146h, item 2, 23 September 2026)
  >
  > A domestic certificate does not spell out its construction age band or its tenure. It gives each as a CODE: the age
  > band as a letter on each of the certificate's building parts (`sap_building_parts[].construction_age_band`, "M"),
  > the tenure as a number at the top level (`tenure`, 1). A letter is not a fact and a number is not a fact, and until
  > this phase both were simply dropped.
  >
  > THE REGISTER PUBLISHES THE KEY TO THEM, and it is read rather than copied. Its own documentation (read 23 September
  > 2026, in SUPPLIER_DOCS) gives two endpoints:
  >
  >   GET /api/codes                                     the codes it can decode — {"data":["built_form","construction_age_band"]}
  >   GET /api/codes/info?code=&key=&schemaVersion=      what one key means   — {"data":[{"key":"NR","values":[{"value":"Detached",
  >                                                                              "schemaVersion":"RdSAP-Schema-17.0","assessmentType":"RdSAP"}]}]}
  >
  > `code` is required; `key` and `schemaVersion` are optional and both are sent, because the same letter means
  > different things under different schemas — the certificate's own `schema_type` ("RdSAP-Schema-21.0.1") is the
  > version, and sending it is what makes the answer this certificate's rather than some other certificate's.
  >
  > A CODE WE COULD NOT DECODE IS NOT KEPT, IN ANY FORM. Not the letter, not a guess, not a nearest match from another
  > schema version. If /api/codes does not list the code, or /api/codes/info does not answer, or it answers with
  > nothing for this key, the field is left out and the question stays asked (N4). That is a whole step weaker than it
  > sounds like it should be and it is the point: "M" in a claim file is worse than no answer, because it looks like one.
  >
  > NEITHER CALL IS EVER MADE FOR A NON-DOMESTIC OR DISPLAY CERTIFICATE. Those spell their fields out, carry neither
  > code, and a lookup that asked anyway would be spending a call on a question it does not have.
  >
  > ───────────────────────────────────────────────────────────────────────────
  > A PERSON'S PICK (Phase 146h, item 1)
  >
  > A REVIEW-band match still keeps nothing here. What changed is that the ranked list can be handed to the back office
  > — after a signed engagement only — and a person can choose one certificate or none (src/web/match-review.ts). The
  > choice arrives as `chosen`, a certificate NUMBER, and the lookup then reads that certificate exactly as an ACCEPT
  > would. It names a record and not a position in a list, so a list that came back in a different order cannot move
  > the choice onto another building.

### `src/integrations/connectors/matching.ts`

- Line 400:

  > ================================================================== *
  > 6 · A PERSON'S PICK FOR A CLOSE MATCH — the S10 spec, A.2 step 4 and A.8 point 7
  >
  > Phase 146h, 23 September 2026.
  >
  > A.2 step 4 says of the REVIEW band: "never auto-selected. Full candidate list (all postcode-blocked candidates,
  > ranked) is surfaced to ops/surveyor for manual pick. Nothing is written until a human resolves it." Until this
  > phase there was nowhere to surface it to, so a REVIEW ended the lookup and kept nothing.
  >
  > THE BAND IS THE WHOLE RULE, AND IT IS THE ONE THING NOT TO WIDEN. Only a REVIEW is offered and only a REVIEW may be
  > picked from. A REJECT means nothing at the postcode came close and a person choosing from it would be choosing
  > between wrong answers; an ACCEPT is already decided; INSUFFICIENT_INPUT and NOT_COVERED never scored anything. So
  > `applyPick` returns NOT_PICKING for every status but REVIEW, whatever the caller asked for.
  >
  > WHEN IT MAY BE OFFERED AT ALL is not this file's to say. A.8 point 7 rules out showing a prospect other buildings'
  > records, so the pick is a BACK-OFFICE thing and it waits for a signed engagement. That gate is asserted in
  > src/web/match-review.ts, server-side, against the record — the same place and the same way as the paid tier's.
  >
  > NOTHING HERE IS KEPT. The offer is built from `ranked`, which lives for the length of one request. What a pick
  > writes is the chosen candidate's own permitted fields, through the one door, and the choice itself: who, when, and
  > the score. Never the list, never a candidate's address lines (A.8 point 8).
  > ==================================================================

### `src/integrations/registers/source-register.ts`

- Line 1184:

  > PHASE 146h, 23 September 2026 — THE TWO CODE ENDPOINTS, read the same day, which are how the domestic age
  >          band and tenure stop being letters and numbers and become facts.

## 23 Sept 2026: Phase 146i

### `src/core/audit.ts`

- Line 345:

  > Phase 146i, 23 September 2026: one person answering, for one document, whether a name belongs to an
  > organisation rather than to somebody (src/web/document-reading.ts). Two CLIENT_DOC fields are kept on that
  > footing alone and the register cannot check it, because it classifies by field name and never sees a value.
  > The row carries the field, the answer and what it replaced. NEVER THE NAME ITSELF: the answer is about a value
  > this build refuses to log, and the document it came from has already been read and deleted.

### `src/core/authz.ts`

- Line 767:

  > PHASE 146i: saying whether a name on a document belongs to an organisation rather than to somebody. Two
  > CLIENT_DOC fields are kept on that footing alone and it cannot be inferred from the document, so it is a
  > person's answer. THE TWO ROLES THAT WORK THE CLIENT AND NOBODY ELSE — not a surveyor, not Accounting, and
  > never the client, who would be vouching for their own document.

## 23 Sept 2026: Phase 146k

### `src/integrations/connectors/hmlr-title.ts`

- Line 1:

  > THE TITLE REGISTER — HM LAND REGISTRY BUSINESS GATEWAY. ABOUT £7 A TITLE, AFTER A SIGNED ENGAGEMENT, ON A CLICK.
  > Phase 146d, 23 September 2026. Switched off: REGISTER_SWITCHES.HMLR_TITLE is false.
  >
  > WHY THIS ONE IS WORTH £7 WHEN EVERYTHING ELSE HERE IS FREE. The engine needs what the client paid for the building,
  > because the purchase price is the starting point for an apportionment. HM Land Registry's free Price Paid Data
  > answers that for HOMES ONLY — it "includes information on all residential property sales", and it excludes
  > commercial property entirely. Four of our five sectors are commercial: a care home, a dental practice, a surgery, a
  > hospital. For those four THERE IS NO FREE SOURCE OF A PRICE PAID AT ALL, and the official copy of the register —
  > which since April 2000 records the price paid, or the value stated where no price was paid — is the only one there
  > is. That is the whole reason this connector exists, and it is why the penny pre-check in src/integrations/connectors/homedata.ts
  > can narrow the spend but can never replace it.
  >
  > ───────────────────────────────────────────────────────────────────────────
  > WHAT IT ASKS FOR, AND WHAT IT KEEPS
  >
  >   title_number, tenure, price paid or value stated and its date, the restrictions, and the prior-owner chain.
  >   THE PROPRIETOR'S NAME under name exception 2 and no other way: kept only where the property is held PERSONALLY,
  >   because it is then the claimant's own identity rather than a third party's. Where the proprietor is a company the
  >   value is a company name and no exception is engaged at all. The source register carries the exception; this file
  >   does not restate it, and `charge_holder_individual_*` and `former_proprietor_*` are excluded there.
  >
  > THE PRICE PAID WAITS WITH OUR ESTIMATE. It is an amount agreed between a buyer and a seller, so the same rule the
  > sale-price lookup already follows applies: it is withheld from the surveyor's job
  > (REGISTER_AMOUNTS_WITHHELD in src/web/surveyor.ts) so that a surveyor cannot anchor on it. The rest of the record —
  > the tenure, the dates, the title number — goes to them as usual.
  >
  > ONWARD SUPPLY TO THE CLIENT'S ACCOUNTANT — OPEN SINCE PHASE 146m (27 September 2026). The solicitor answered yes,
  > relayed by Lakhbir, and the HMLR_TITLE licence in the source register no longer awaits legal review. The client
  > report stays shut: it was not asked about. The licence is the register's, not a setting here — and since Phase 146k
  > this connector is retired: the copy is bought, typed and uploaded by hand.
  >
  > ───────────────────────────────────────────────────────────────────────────
  > THE THREE STEPS, AND WHICH PATHS ARE PUBLISHED AND WHICH ARE NOT
  >
  >   1. ADDRESS → TITLE NUMBER.  Search by Property Description, a SOAP service. "Use this service to find out the
  >      title number and tenure of a property based on the address supplied" (the Business Gateway service list, read
  >      23 September 2026).
  >   2. IS THERE AN OFFICIAL COPY TO BUY?  GET /{rest}/s1/v1/titles/{title_number}/official-copies/availability —
  >      PUBLISHED, in the REST developer guide, and it "Returns the OC1 document availability (title register and
  >      title plan)". Free to ask, so it is asked before the £7 is spent.
  >   3. THE REGISTER ITSELF.  Official Copy Title Known, a SOAP service: "an official copy of the register". This is
  >      the call that costs about £7.
  >
  > WHAT IS CONFIRMED AND WHAT IS NOT, SAID PLAINLY RATHER THAN GUESSED AT. The four path prefixes are published and
  > are in src/integrations/connectors/sources.ts. The REST path in step 2 is published, word for word, in the REST developer guide.
  > THE TWO SOAP SERVICE PATHS ARE NOT PUBLISHED ANYWHERE PUBLIC: the developer pack that carries each service's WSDL
  > comes with the network access agreement, which is the developer's to sign. `SOAP_PATHS` below is built from the one
  > SOAP address HM Land Registry does publish — its Application Enquiry poll service, at
  > /b2b/BGSoapEngine/{Service}WebService live and /b2b/BGStubService/{Service}WebService on test — and IS MARKED
  > UNCONFIRMED. A question is open with the developer to confirm them from the pack. Nothing turns on the guess today:
  > the switch is off, there is no certificate, and no call can be made.
  >
  > ───────────────────────────────────────────────────────────────────────────
  > THE CERTIFICATE. The Gateway needs a user name and password on every request AND the client certificate HM Land
  > Registry issues under the network access agreement, presented when the connection is made. `fetch` cannot present
  > one, so src/integrations/connectors/http.ts carries `certificateTransport` and this connector is the only thing that asks for
  > it. No certificate, or no passphrase, is a REFUSED call with a sentence naming the key that is missing BY NAME —
  > never a value, never a throw, never a screen error.

## 23 Sept 2026: Phase 151b

### `src/integrations/connectors/companies-house.ts`

- Line 1:

  > COMPANIES HOUSE — THE COMPANY, ITS FILINGS, AND (ONLY AFTER SIGNATURE) ITS PEOPLE WITH SIGNIFICANT CONTROL.
  > Phase 146c, 23 September 2026. Switched off: REGISTER_SWITCHES.CH_COMPANY and .CH_PSC are false.
  >
  > Built against the Companies House Public Data API's published documentation (the address and the date read are in
  > the source register's SUPPLIER_DOCS). The key is the user name of HTTP Basic authentication with an empty password,
  > read only through the key file's COMPANIES_HOUSE_API_KEY. Our own limit is the published 600 requests in 5 minutes.
  >
  > ───────────────────────────────────────────────────────────────────────────
  > THE COMPANY (CH_COMPANY) — up to four calls, in this order
  >
  >   1. /search/companies on the business's name — skipped when the client gave us a company number, which is an
  >      exact key. The results are scored (src/integrations/connectors/matching.ts); only one clear ACCEPT is taken.
  >      NO MATCH ROUTES TO ASK, NEVER TO "SOLE TRADER". A name that does not match is far more often a trading name, a
  >      misspelling or a group company's than an unincorporated business (CB_REGISTRY says so in the same words).
  >   2. /company/{company_number} — the profile. Kept: only the fields the source register permits AND the name
  >      exclusion register keeps — company number, status, SIC codes, accounting year end, incorporation date.
  >   3. /company/{company_number}/filing-history, accounts only — what the latest accounts are.
  >   4. The Document API's metadata for that filing (document-api.company-information.service.gov.uk/document/{id},
  >      the address the filing's own `links.document_metadata` gives): an `application/xhtml+xml` resource means an
  >      iXBRL copy exists, which a machine can read; a PDF alone means a picture.
  >   FILLETED ACCOUNTS (no profit and loss account on the public record) AND ACCOUNTS FILED ONLY AS A PICTURE (not
  >   iXBRL) ARE ORDINARY OUTCOMES, NOT ERRORS: the lookup is still READ, and the panel says in words what the accounts
  >   can and cannot tell us. The published documentation has NO filleted flag, so "filleted" is never asserted: a small
  >   company's accounts type is read as "may leave out the profit and loss account" (null, not known). A failed
  >   filing-history or document call does not undo the profile: the company facts are kept, and the panel says the
  >   filings could not be read.
  >
  > No director or secretary field is read from any of the four answers above, and none is ever kept (the name
  > exclusion register, CH_COMPANY's excluded fields `officer_*`, `director_*`, `secretary_*`).
  >
  > ───────────────────────────────────────────────────────────────────────────
  > THE OFFICERS LIST — READ IN MEMORY, NEVER KEPT. Phase 151b, 25 September 2026.
  >
  > Word question 156, for the data protection officer: "May we briefly check two public register names without saving
  > them?" Answer, closed 24 September 2026: "Yes – best to check who signs and if they have authority". So
  > `companiesHouseOfficers` below reads /company/{company_number}/officers (the published officers list, its address
  > in the source register's SUPPLIER_DOCS) for ONE purpose: does the person who signed our engagement letter appear on
  > it as a current director, or an LLP's designated member? It is handed a test (`isSigner`, from
  > src/integrations/connectors/signatory-check.ts) and asks it of each officer's name; it keeps only the answer, YES or NO and a
  > reason code. NO NAME LEAVES THIS LOOKUP: its bundle has no records (so nothing can reach the one door) and its facts
  > are two codes. The officers endpoint's address is recorded on the audit row as a template, as every call's is.
  > It is CH_COMPANY's switch that turns it on — no switch of its own — so it is off with the lookups.
  >
  > ───────────────────────────────────────────────────────────────────────────
  > PEOPLE WITH SIGNIFICANT CONTROL (CH_PSC) — name exception 1, condition CA2
  >
  > /company/{company_number}/persons-with-significant-control. The name is kept (exception 1: the common-control test
  > for the Annual Investment Allowance), with the kind, the natures of control and the date ceased — never a date of
  > birth or an address. THIS LOOKUP IS NEVER HANDED A CLIENT BEFORE A SIGNED ENGAGEMENT: CB_REGISTRY lists `psc_name` as
  > post-signature, and `stateUnderGates` keeps it NOT_PERMITTED_YET until the signature record says signed. The
  > connector does not re-decide that; it is simply never reached.

## 23 Sept 2026: Phase 151g

### `src/integrations/connectors/smoke.ts`

- Line 1:

  > THE LIVE SMOKE TEST — DOES THIS ACCOUNT, THIS KEY AND THIS ADDRESS ACTUALLY WORK? Phase 146g, 23 September 2026.
  >
  > WHY IT EXISTS. The handover page in the Developer Spec gives every outside service a row, and one column of that
  > row is "the live smoke test that proves it". Before this file there was no such thing: every suite runs on
  > recorded answers with no key and no network (Phase 146b's rule 3), which proves the code and proves nothing at all
  > about an account somebody has just opened. A developer who has just been issued a Companies House key needs one
  > command that says yes or no.
  >
  > WHAT IT IS NOT. It is NOT the application running. It does not open a gate, it does not touch the database, it
  > does not read a client, and it changes no switch that ships: `REGISTER_SWITCHES` stays exactly as it is, and this
  > turns ONE source on for ONE call, in a map of its own, in a command a person typed.
  >
  > PUBLIC TEST DATA ONLY, AND THAT IS THE RULE THIS FILE EXISTS INSIDE. "Can we make a few small, logged test lookups
  > to check a data connector works?" was answered by Lakhbir on 25 September 2026: yes, on five conditions (Word
  > question 170). The defaults below are Caprebate's own company number and a public address that belongs to nobody
  > we act for. SINCE PHASE 151g THE COMMAND ENFORCES THE FIVE CONDITIONS rather than printing a warning: who and why,
  > a log outside the repository, three lookups per switch-on, never a client's values, never a demonstration. That is
  > src/integrations/connectors/test-lookups.ts; this file still makes the one call and says whether it was taken.
  >
  > WHAT A PASS MEANS, EXACTLY. That the service accepted our call: the address in src/integrations/connectors/sources.ts is right,
  > the key is in the key file and the account is live. IT DOES NOT MEAN THE REGISTER HOLDS ANYTHING for the value you
  > passed — "nothing matched" is a PASS, because the account plainly works. The two are reported separately and are
  > never added together.
  >
  > IT WRITES THE SAME AUDIT ROW AS ANY OTHER CALL, because it goes through `callOutside` like everything else. It
  > needs an audit log to write to, and the command gives it one in a database of its own, in memory, which is thrown
  > away with the answer. What lasts is the test lookup log's one line (src/integrations/connectors/test-lookups.ts).

## 23 Sept 2026: Phase 153c

### `src/integrations/connectors/cqc.ts`

- Line 1:

  > THE CARE QUALITY COMMISSION — A PROPERTY'S REGISTERED LOCATION, AND ITS PROVIDER. ENGLAND ONLY.
  > Phase 146c, 23 September 2026. Switched off: REGISTER_SWITCHES.CQC is false.
  >
  > Built against CQC's developer portal (api-portal.service.cqc.org.uk, its published API definition read 23 September
  > 2026; the address and date are in the source register's SUPPLIER_DOCS). Base https://api.service.cqc.org.uk/public/v1.
  > Every call carries the key in the `Ocp-Apim-Subscription-Key` header — never a keyless call, never the old portal's
  > partner code — read only through the key file's CQC_SUBSCRIPTION_KEY.
  >
  > ───────────────────────────────────────────────────────────────────────────
  > THE CURRENT API CANNOT BE SEARCHED BY POSTCODE, AND THIS FILE IS BUILT AROUND THAT
  >
  > The published `/locations` filters are care home, clinical commissioning group, service type, constituency, LOCAL
  > AUTHORITY, inspection directorate and category, rating, region, regulated activity and report type — no postcode.
  > Each item in the list carries only `locationId`, `locationName` and `postalCode`. So a lookup is:
  >
  >   1. /locations?localAuthority=<the council area>, page by page — the council area comes from the ONS postcode
  >      table, which runs first on the same click. No table, no council area: the lookup is not made, and says why.
  >   2. Only the locations whose `postalCode` is the typed postcode are kept (the S10 spec's blocking key). Their
  >      names are never read.
  >   3. /locations/{locationId} for each of those few, and their address lines scored against the typed address.
  >      Only one clear ACCEPT is taken.
  >   4. /providers/{providerId} for the accepted location — read for its Companies House number, which is compared
  >      with ours and never kept.
  >
  > WHAT IS KEPT: the location and provider ids, the registration status and date, the registered beds, the regulated
  > activities, the service types and the specialisms — the fields the source register permits and the name exclusion
  > register keeps. NEVER a location's or provider's name (a sole trader's is their own), a registered manager or a
  > nominated individual.
  >
  > NOT ENGLAND, NOT ASKED. Wales is Care Inspectorate Wales's and Scotland the Care Inspectorate's; neither has a
  > connector in this build, and the research panel says so (`NOT_BUILT` in src/integrations/connectors/free-registers.ts).
  >
  > THE NAMED PEOPLE — READ IN MEMORY, NEVER KEPT. Phase 151b, 25 September 2026. Word question 156, for the data
  > protection officer: "May we briefly check two public register names without saving them?" Answer, closed
  > 24 September 2026: "Yes – best to check who signs and if they have authority". `cqcNamedPeople` below reads a
  > location's registered manager and a provider's nominated individual for ONE question, asked by
  > src/integrations/connectors/signatory-check.ts: is the person who signed our engagement letter one of them? It keeps only YES or
  > NO and a reason code — its bundle has no records, so nothing reaches the one door. It is CQC's own switch that turns
  > it on, so it is off with the lookup above. The lookup above still never reads either name.
  >
  > THE CACHE WINDOW: 30 DAYS IN THE TEST SYSTEM (Phase 153c, 4 October 2026, Word question 201). CQC's licence entry
  > (CQC_SYNDICATION in the source register) held 0 days until the solicitor answered how current CQC data must be when we
  > use it; it now holds 30, on our recommendation, with "Source: Care Quality Commission, Open Government Licence" shown
  > beside each fact, until the terms that come with the key say otherwise.

### `src/integrations/registers/source-register.ts`

- Line 269:

  > 0 WAS OUR REFUSAL, NOT CQC'S FIGURE (Phase 146c, 23 September 2026), until the solicitor answered how current CQC
  >        data must be when we use it.
  >        PHASE 153c, 4 October 2026 — 30 DAYS IN THE TEST SYSTEM, on our recommendation (Word question 201, the director's,
  >        for the solicitor): a fact held up to 30 days, always with its source beside it, unless the terms that come with
  >        the key say otherwise. Test data only. Null would still mean "no limit" and is never used (N4).

## 23 Sept 2026: Phase 156f

### `src/integrations/connectors/homedata-planning.ts`

- Line 1:

  > PLANNING BY UPRN, FROM THE PAID SUPPLIER — BUILT IN PHASE 146d, CHOSEN IN 153b, RUNNING ON THE TEST WEBSITE SINCE 156f.
  > Phase 146d, 23 September 2026. REGISTER_SWITCHES.HOMEDATA_PLANNING is false; TEST_WEBSITE_PAID_LOOKUPS turns it on
  > for the test website only.
  >
  > PHASE 156f, 6 OCTOBER 2026 — LAKHBIR: "planning history - use homedata". The trade below was his to make, and he made
  > it: AFTER SIGNING, Homedata answers the PLANNING row by the property's UPRN (about 5p); BEFORE SIGNING the free route
  > (planning.data.gov.uk, then PlanIt) still answers, so the free estimate keeps planning. Where both have run,
  > Homedata's answer is the one the case uses and shows (`preferHomedataPlanning`): its records are kept under their own
  > entity ids (`homedata:<reference>`), and the free route's earlier records are kept, not shown. The text from here to
  > the next rule is the 146d reasoning, kept as it was written.
  >
  > ───────────────────────────────────────────────────────────────────────────
  > WHAT THIS IS, AND WHY IT IS NOT TURNED ON
  >
  > Planning is the one lookup in this system that is matched on ADDRESS TEXT rather than on an identifier, and it is
  > matched against the messiest addresses of any source we call — a planning register's address lines are typed by
  > hand at 400-odd local authorities. Homedata sells the same applications keyed BY UPRN, and its `planning_history`
  > slug returns all six of the fields the register permits: reference, status, decision date, submitted date,
  > description and the UPRN itself. Keyed on the identifier, planning comes out of the address-matching path
  > altogether.
  >
  > WHAT IT WOULD REPLACE IS WEAK ON BOTH LEGS, and that is on the record rather than an impression:
  >   · PlanIt asks for one request a minute and about 300 a day, and its owner writes that it "would not be wise to
  >     base any commercial services on the API".
  >   · planning.data.gov.uk says of its own planning application dataset that it "is incomplete and is not yet ready
  >     for use".
  >
  > AND YET IT STAYS OFF, AND PLANIT STAYS THE SOURCE OF RECORD. Moving planning here moves it from the FREE tier to
  > the PAID tier, and the two tiers are not a billing detail: a free lookup fires once the client has been told what
  > we do, a paid one only after an engagement letter is signed. So planning would stop firing before signature, and
  > the free estimate — the thing a prospective client sees before they have signed anything — would lose planning
  > entirely. WHETHER THAT TRADE IS WORTH MAKING IS NOT A BUILD DECISION AND IS NOT THIS PHASE'S TO TAKE. It is
  > written up for Lakhbir, with a recommendation, and this connector sits beside PlanIt in the paid map waiting for
  > the answer. Turning it on is one word in REGISTER_SWITCHES.
  >
  > ───────────────────────────────────────────────────────────────────────────
  > THE SLUG, NOT THE SEARCH — AND THAT IS A NAME-LEAK DECISION AS WELL AS A KEYING ONE
  >
  > The supplier sells planning twice. `/planning/search/?postcode=` (5 tokens) searches by postcode and its own
  > documentation says it returns "application status, type, decision dates, and CASE OFFICER DETAILS" — a named
  > council employee who is not our client, has no connection to the claim, and whom the register's whitelist never
  > contemplated. `?with=planning_history` is keyed by UPRN and is documented as the property's own applications.
  > We ask for the slug. The excluded-field list bars `officer_*` and `case_officer_*` either way (that is what the
  > one door checks), but the narrower call is the one that never brings a name into this process to begin with.

## 23 Sept 2026: no phase named

### `src/integrations/connectors/homedata.ts`

- Line 155:

  > The published weight of each slug, in tokens. 100 tokens = £1, so a token is a penny. Read 23 September 2026.

- Line 172:

  > The supplier's own header, and it is NOT `Bearer`. Its authentication page, read 23 September 2026: "Use Api-Key
  > prefix, not Bearer". The key is never put in the query string, which that page also asks us not to do, and which
  > would in any case put it where an audit row records parameter names.

## 24 Sept 2026: Phase 147

### `src/integrations/registers/source-register.ts`

- Line 505:

  > CIBSE PLANT LIVES — the source nobody owned. Board item "CIBSE plant lives"; written 24 September 2026
  > by Phase 147. The research is 04-phase-work/phase3/caprebate-cibse-plant-lives-source-register-row.md.
  >
  > WHAT IT WOULD FEED. CB_CIBSE_PLANT_LIVES in 09-app/backend/src/modules/survey/costing/cost-model.cjs: the expected
  > life of each plant element, read by LEG-E5 (per-element depreciation) and by ATP-F-3 (the crosswalk
  > completeness gate). THAT TABLE STAYS EMPTY AND BOTH GATES STAY OFF. This entry records the terms, not data.
  >
  > WHAT CIBSE PUBLISHES, read 24 September 2026 from its own pages as archived in June and July 2026 (the
  > live site answered 503 and then "HTTP Error 500.30 - ASP.NET Core app failed to start" that morning):
  >   - The tables are "Indicative Economic Life Expectancy (2026)", published June 2026: a zip holding
  >     Guide M11 Appendix 11.A1 (economic life expectancy tables, PDF), Appendix 11.A2 (worked examples,
  >     PDF) and an Excel tool. Standard rate FREE, member rate FREE. It supersedes the January 2020
  >     supplement (Appendix 12.A1 of Guide M 2014), which NBS lists as withdrawn. Lives are "Reference
  >     Service Life" in years, aligned to RICS NRM 3 and SFG20, and healthcare-specific assets appear
  >     for the first time.
  >   - The guide the tables belong to is "Guide M11 Life cycle (2023)", September 2023, 22 pages, ISBN
  >     9781914543746: PDF £20.00 + VAT standard rate, FREE to members; book £25.00 + VAT, £12.50 + VAT
  >     to members.
  >   - The download notice: "supplied by CIBSE for the sole use of the person making the download".
  >   - Knowledge FAQs: downloaded files "are for the use of the downloader only. They may not be
  >     duplicated or circulated in any form for use by others, for re-sale or for any other purpose";
  >     reproducing content "in a text for sale" is allowed "for a cost, and only with our permission",
  >     via PLSclear.
  >   - Website terms: CIBSE material is protected by the Copyright, Designs and Patents Act 1988 AND the
  >     Copyright and Rights in Databases Regulations 1997; written requests go to the Head of Knowledge.
  >
  > WHAT IT DOES NOT PUBLISH, AND THIS ENTRY HOLDS AS A REFUSAL, NEVER A DEFAULT
  >   - whether a report a client pays for is "a text for sale": treated as one, so every outward
  >     channel is false;
  >   - whether using a life in a calculation, without printing the table, is reproduction: treated as
  >     reproduction;
  >   - whether a table loaded into a system that several staff use is "circulated ... for use by
  >     others": treated as circulation, so even INTERNAL is false until CIBSE says otherwise. This is
  >     stricter than BCIS_COMMERCIAL on purpose: BCIS sells a subscription for business use, and CIBSE's
  >     only published grant is to one person;
  >   - the PLSclear price: quoted per request, not published;
  >   - attribution wording: none published. `attribution_text` is a NOT PUBLISHED marker;
  >   - how long a loaded edition may be relied on: none published. 0 days is OUR refusal, not theirs;
  >   - the "CIBSE copyright" section of the Fair Use Policy page the terms point to: READ 24 Sep 2026 by
  >     the sweep, as archived on 29 May 2022 (cibse.org/knowledge/about-knowledge-portal/fair-use-policy).
  >     The live site no longer has the page - it is not in CIBSE's 3,703-page sitemap - though the live
  >     terms still point to it. It CONFIRMS all three readings above and loosens none: downloads are "for
  >     their personal use" and "only for the benefit of the person entitled"; copying up to 10% is allowed
  >     "BUT ONLY for your personal use"; and "use of CIBSE documents for re-use, re-sale or other gain,
  >     promotion or benefit to a third party" is a breach, as is distributing content "in any format or
  >     for any purpose without express permission". A paid report is other gain; staff sharing one
  >     download is distribution. Permission requests go to CIBSE's Knowledge Manager.
  >
  > NO SOURCES ROW YET, ON PURPOSE. In this register every external row is a lookup that the research panel
  > lists and a member of staff fires, and it must carry a tier and a switch. This is a reference table
  > loaded once, under a licence we do not hold. Its SOURCES row is written with its loader, if the table
  > is ever loaded; until then no cell can be minted from it at all.

## 24 Sept 2026: Phase 150

### `src/integrations/connectors/http.ts`

- Line 149:

  > PHASE 150: answer these bytes instead of `body` — a recorded file, which is not text.

- Line 239:

  > PHASE 150: KEEP THE ANSWER AS BYTES. A file (HM Land Registry's INSPIRE .zip) is not text, and turning it into a
  > string would corrupt it. With this set, a successful answer comes back in `bytes` and `body` is '' — never null,
  > because null is how every caller recognises a call that got no answer. Every other rule is unchanged.

- Line 259:

  > PHASE 150: the answer's bytes, only when the request asked `as_bytes` and the answer was read.

### `src/integrations/connectors/inspire-authorities.ts`

- Line 1:

  > THE 318 LOCAL AUTHORITY FILES HM LAND REGISTRY PUBLISHES THE INSPIRE INDEX POLYGONS IN. Phase 150, 24 September 2026.
  >
  > Copied from the links on https://use-land-property-data.service.gov.uk/datasets/inspire/download, read that day
  > (the page says the data was published on 6 September 2026). Each is the file name without ".zip"; the link is
  > /datasets/inspire/download/<name>.zip. src/integrations/connectors/inspire.ts downloads a council's file only when its name is
  > in this list, so a typing mistake or a name from anywhere else is refused before anything is sent.
  >
  > HM Land Registry can add, rename or merge councils (a reorganisation changes the list). When a download answers 404,
  > read the page again and re-date this list; do not guess a new name.

### `src/integrations/connectors/registers.ts`

- Line 155:

  > PHASE 150, 24 September 2026: the land boundary. NOT A SECOND SWITCH — it IS the boundary module's own
  >      BOUNDARY_FETCHING_SWITCHED_ON, read here so the research panel shows the same answer the fetcher obeys
  >      (src/integrations/connectors/inspire.ts). It is false.

### `src/integrations/connectors/sources.ts`

- Line 207:

  > PHASE 150, 24 September 2026 — HM Land Registry's INSPIRE Index Polygons, one .zip of GML per local authority,
  >        from the download page read that day (SUPPLIER_DOCS in the source register). No key. A FILE, NOT A LOOKUP: the
  >        only thing sent is the council's name, never anything about a client, and the polygon is found on our own
  >        server. So the limits are about politeness and size, not cost. The files are not small and their size is not
  >        published: a city council's runs to many megabytes zipped, so the cap is generous and the time limit long.
  >        One download a council a month is all the data ever needs (it is republished on the first Sunday of the month).

### `src/integrations/registers/boundary-import.ts`

- Line 104:

  > Phase 150 (24 September 2026): the real fetcher, 09-app/backend/src/connectors/inspire.ts, built and switched off.

- Line 901:

  > Empty. No data pulled, and none is kept here: the Phase 150 fetcher reads a council's file for one point and keeps only that polygon.

### `src/integrations/registers/source-register.ts`

- Line 218:

  > PHASE 150, 24 September 2026: HM Land Registry's INSPIRE Index Polygons. Both statements are word for word from
  >        its conditions of use, read that day at https://use-land-property-data.service.gov.uk/datasets/inspire (the
  >        same words 09-app/backend/src/registers/caprebate-boundary-import.ts has carried since 16 September). The
  >        "[year of supply or date of publication]" placeholder is HM Land Registry's own. client_report is FALSE
  >        although the licence would allow it with both statements: Lakhbir's decision of 15 September 2026 keeps
  >        boundary maps out of client reports, and the boundary module's CURRENT_LICENCE_PERMISSION holds it there.

- Line 724:

  > PHASE 150, 24 September 2026: the land boundary. One GML file per local authority, downloaded whole, and the
  >        polygon found by a point inside it (findInspirePolygonForPoint in 04-phase-work/phase9/caprebate-boundary-
  >        import.ts). The polygons carry no title number and no name, so nothing personal can arrive from this source.
  >        B, not A: HM Land Registry says the extent of a title "cannot be established" from these polygons. The
  >        fetcher is 09-app/backend/src/connectors/inspire.ts, and it is switched off.

- Line 1339:

  > PHASE 150, 24 September 2026. Pages only: no polygon file, no map and no service was downloaded or called.

## 24 Sept 2026: Phase 151

### `src/core/app.ts`

- Line 125:

  > Phase 151: the roles the super admin made, for can()

### `src/core/audit.ts`

- Line 44:

  > Phase 151: a role the super admin made, changed, or tried to make and was refused (src/web/role-editor.ts).

### `src/core/authz.ts`

- Line 38:

  > Phase 151: a role the super admin made, or 'new' before it exists.

- Line 388:

  > Phase 151: making and changing roles (src/core/custom-roles.ts). The super admin's alone, and never grantable.

- Line 1249:

  > Phase 151: a role the super admin made borrows each rule from a built-in staff role, and is decided by it here.

- Line 1264:

  > PHASE 151: WHETHER A BUILT-IN STAFF ROLE HOLDS AN ACTION. The one fact about this table the role editor needs, so
  > that a made role can only borrow a rule that exists (src/core/custom-roles.ts, roleRefusal).

### `src/core/custom-roles.ts`

- Line 1:

  > ROLES A SUPER ADMIN CAN MAKE. Phase 151, 24 September 2026.
  >
  > WHAT LAKHBIR DECIDED (Word answers 39 and 40, closed 24 September 2026). The super admin must be able to create
  > roles, choose what each can see and do, and give people roles.
  >
  > HOW A ROLE IS MADE, AND WHY THIS SHAPE. A role the super admin makes is a NAME and a LIST OF GRANTS. Each grant is one
  > action the back office knows (src/core/authz.ts, REGISTERED_ACTIONS) together with THE BUILT-IN ROLE WHOSE RULE IT BORROWS
  > — "claim.read, as Sales reads it". So a made role never invents a rule: every yes it can give is a yes one of the four
  > staff roles already gives, with that role's test on the specific object (the assigned surveyor's own job, the owner's
  > own task, the organisation's own documents). Authorisation stays on the server, for each request and each object,
  > exactly as it is for the built-in roles: `can()` in src/core/authz.ts decides a made role by the same table.
  >
  > THE HARD LIMITS. No role editor may break these, and a role that would is REFUSED WITH A PLAIN SENTENCE
  > (`roleRefusal`), never saved in part:
  >   1. THE SURVEYOR NEVER RECEIVES THE ESTIMATE. A role that can survey — any grant borrowed from Surveying, or the
  >      right to sign a survey off — may hold none of the actions that reveal the estimate or the value of a claim
  >      (SEALED_FROM_SURVEY). And a made role is sent to the estimate quarantine AS THE SURVEYOR unless it holds
  >      `estimate.read` itself (src/core/roles.ts, toQuarantineRole), so the survey workspace's payload withholds the sealed
  >      estimate from it; test/phase151.test.ts runs payload-proof's check on such a role.
  >   2. ONLY THE SUPER ADMIN RUNS ACCOUNTS AND ROLES. Creating, changing and disabling users, giving roles, and making
  >      or changing roles (NEVER_GRANTED) cannot be given to a made role.
  >   3. A GRANT MUST BE ONE THE BUILT-IN ROLE ACTUALLY HOLDS. A client's rule is never borrowed: a made role is a staff
  >      role, and the client's own-organisation rule would give a staff member a client's view.
  >   4. EVERY CHANGE IS IN THE AUDIT LOG — made, changed, refused and given (src/web/role-editor.ts).
  >
  > WHERE THEY LIVE. The `custom_roles` and `custom_role_grants` tables (migration 046), and a row in `roles`, so a user
  > holding one is held by the database's own reference. This module keeps the set in memory for `can()`, which is pure;
  > `loadCustomRoles` fills it when the application starts and after every change.
  >
  > THIS FILE IMPORTS NOTHING FROM src/core/authz.ts, on purpose: authz.ts reads it, and the validation is handed the one fact
  > it needs about the built-in table (`holds`) by its caller.

### `src/core/roles.ts`

- Line 67:

  > PHASE 151: A ROLE THE SUPER ADMIN MADE (src/core/custom-roles.ts). It is sent to the quarantine as the SURVEYOR — the
  >      sealed estimate withheld — unless it holds `estimate.read` itself, which a role that can survey never may. So a
  >      made role cannot reach the estimate through the survey workspace's payload that it could not read directly. And a
  >      role nobody knows is the surveyor too: the conservative mapping, as READ_ONLY's is.

- Line 94:

  > Phase 151: a role the super admin made is a staff role; it can never borrow a client's rule.

### `src/core/staff.ts`

- Line 616:

  > PHASE 151 (Word answer 166, closed 24 September 2026): a leaver's photo is deleted when their account is disabled
  >        — the row and the file, by the same clearPhoto a person uses on their own, which fails rather than report a file
  >        gone that is still on disk. Only once the account is disabled: a refused disable deletes nothing.

### `src/integrations/connectors/free-registers.ts`

- Line 135:

  > PHASE 151: the free postcode check belongs to the address question the client answers, not to this button.

### `src/integrations/connectors/postcode-check.ts`

- Line 1:

  > THE FREE POSTCODE CHECK AT THE ADDRESS QUESTION — POSTCODES.IO. Phase 151, 24 September 2026.
  > BUILT FOR REAL AND SWITCHED OFF, BEHIND THE FREE-TIER GATE.
  >
  > WHAT LAKHBIR ASKED (Word answers 16, 17, 35 and 36). Homedata, the paid address lookup, runs after signing, when staff
  > start the research — built (src/integrations/connectors/homedata.ts). At the address question, add a FREE address lookup if one
  > exists. PHASE 151 FOUND NONE THAT A PAID SERVICE MAY USE: getAddress.io stopped trading in February 2026, and every
  > other postcode-to-address list is paid or a trial (the source register, POSTCODES_IO_OPEN; the research is
  > 04-phase-work/phase151/free-address-lookup.md). So this is the best free thing there is: a POSTCODE CHECK. The client
  > types their postcode; this confirms it exists and fills in the council area, the region and the country; the client
  > types the building and the street. No address list, no UPRN.
  >
  > TWO THINGS KEEP IT OFF, AND NEITHER IS A SECOND GATE.
  >   1. THE FREE-TIER GATE — CB_REGISTRY.precondition, "a published privacy notice reachable from the address question".
  >      It is read here through `gateStatus`, exactly as the research panel reads it. Not restated; not duplicated.
  >   2. THIS SWITCH — POSTCODE_CHECK.enabled, false — and `named_in_privacy_notice`, false: the notice must name
  >      Postcodes.io before it is switched on (Lakhbir's instruction for this phase).
  > OFF, NOTHING IS SENT, and the address question works exactly as it does today: the client types the address.
  >
  > WHAT IS SENT: THE POSTCODE, AND NOTHING ELSE. Not a name, not a company, not the rest of the address.
  >
  > N4, AND WHY NOTHING HERE CAN STOP A CLIENT. A postcode this cannot check — the service down, the postcode not found, a
  > Northern Ireland postcode it may not be used for — is NOT_CHECKED, and the client goes on typing their address. A
  > check that did not run is never read as a postcode that does not exist, and never as one that does.
  >
  > NORTHERN IRELAND IS REFUSED BEFORE ANY CALL. Postcodes.io's own licence page: commercial use of BT postcodes needs a
  > licence from Land and Property Services, which we do not hold.

### `src/integrations/connectors/registers.ts`

- Line 159:

  > Phase 151: the postcode check at the address question has its own switch, POSTCODE_CHECK, off. Never run by the button.

### `src/integrations/connectors/sources.ts`

- Line 225:

  > PHASE 151, 24 September 2026 — the free postcode check at the address question (src/integrations/connectors/postcode-check.ts),
  >        BUILT AND SWITCHED OFF behind the free-tier gate. No key. Only a postcode is sent. Its documentation (read that
  >        day, SUPPLIER_DOCS) publishes no rate limit and no hosting location; UK below is the service's own country (Ideal
  >        Postcodes Ltd), and a postcode is not personal data.

### `src/integrations/email/email-provider.ts`

- Line 87:

  > contact@caprebate.co.uk exists and SPF, DKIM and DMARC are set (both true, Phase 151), AND somebody reads it and a test
  >  email has arrived (Word questions 216 and 217). False until all four are.

### `src/integrations/email/email.ts`

- Line 139:

  > PHASE 151: THE NEWEST ROW WINS, BY WHEN IT WAS WRITTEN, NOT BY THE DATE IT CARRIES. A change is a new row and the
  >      table is never edited, so the last row written is the last decision. Ordering on set_at let a migration's dated row
  >      (044, 24 September 2026) outrank a change an administrator made later on a server whose clock read earlier.

### `src/integrations/registers/source-register.ts`

- Line 318:

  > BCIS — THE COST SOURCE, INSTEAD OF SPON'S. Lakhbir chose BCIS over the Spon's price books (Word answers 6 and 8,
  > closed 24 September 2026); no Spon's book is bought, and the three Spon's PDFs in
  > 07-reference-and-benchmarks/price-books stay where they are, unused. Rewritten 24 September 2026 by Phase 151
  > in the shape of CIBSE_KNOWLEDGE below. The research is 04-phase-work/phase3/caprebate-bcis-source-register-row.md.
  >
  > WHAT IT WOULD FEED. The LEG-E4 tables in 09-app/backend/src/modules/survey/costing/cost-model.cjs - CB_LOCATION_FACTORS,
  > CB_CONTRACT_SIZE_ADJUSTMENT, CB_PRICE_SOURCES - and the bcis_* fields of the BCIS source row. ALL STAY EMPTY AND
  > THE GATE STAYS OFF until Word question 218 ("Which BCIS product did you agree to, and does its licence let our
  > software use its rates?") is answered with the product and its order form. This entry records the terms.
  >
  > WHAT BCIS PUBLISHES, read 24 September 2026 from bcis.co.uk/terms-conditions-of-sale/ (last updated 9 April
  > 2026), Annex One "Special Conditions for BCIS Subscription", which covers every BCIS data product (CapX, OpX,
  > TotX, ProtX, location factors, tender price indices, average prices) except Rebuild Plus (Annex Two). The
  > archived BCIS Online terms of 17 June 2024 match it on every point below. The licensor is Building Cost
  > Information Service Ltd, not RICS itself.
  >   - cl. 2.1: a non-exclusive, non-transferable, revocable licence for the Subscription Term.
  >   - cl. 2.1(b)-(c): the Data and edited copies may be stored on the subscriber's own systems and shared with its
  >     licensed users there. cl. 2.3(a),(b),(d),(e): each user is a named employee with their own login, no more
  >     users than the order states, working from the office on the order. cl. 2.3(j): no automated harvesting.
  >   - cl. 2.1(d): extracts of the Data may be sent to the subscriber's customers or clients, where they relate to
  >     projects created in the service and are reasonably necessary to advise in the normal course of business.
  >     cl. 2.2 and 2.3(h): nothing else is redistributed.
  >   - cl. 7.3: any display credits BCIS "wherever technically and commercially feasible". No wording is given.
  >     cl. 7.4 adds Ordnance Survey and Royal Mail copyright notices without saying whether output must carry them.
  >   - cl. 9.1-9.2: the term is 12 months unless the order says otherwise, renewing unless either side gives 30
  >     days' notice; on expiry the Data and edited copies are deleted immediately, except Derived Data (data changed
  >     so far it cannot be traced back to BCIS or used in its place).
  >   - cl. 4.1 audit for a year after expiry; cl. 8.1 the Data is confidential, disclosable where law or a regulator
  >     requires (cl. 8.2(c)); general terms cl. 13.6: the services are for information only and "should not be
  >     used as conclusive, complete or authoritative".
  >
  > WHAT IT DOES NOT PUBLISH, AND THIS ENTRY HOLDS AS A REFUSAL, NEVER A DEFAULT
  >   - attribution wording: none. `attribution_text` is a NOT PUBLISHED marker;
  >   - the client's accountant: the grant is to "customers or clients" only, so accountant_report is false;
  >   - HMRC: not mentioned. Only disclosure the law requires (cl. 8.2(c)) is possible, and nothing permits a
  >     voluntary pack, so hmrc_pack is false;
  >   - whether a figure our engine computes from BCIS rates and prints in a client's report is an "extract ...
  >     relating to projects created in the service": treated as NOT, so client_report is false until BCIS
  >     confirms it in writing, and a figure carried to a report must be Derived Data or not carry at all;
  >   - whether staff who can see a BCIS figure in the back office are all named licensed users: INTERNAL IS TRUE
  >     ONLY ON THAT CONDITION, which the order form (question 218) must show before anything is loaded;
  >   - an API or data-feed licence: none published (the developer portal says only to email for access), so the
  >     BCIS source row keeps `endpoint: null` and nothing is fetched;
  >   - any freshness period for a loaded edition: none. 365 days is the published subscription term, not a
  >     freshness rule, and expiry means deletion, not staleness;
  >   - prices: none published; BCIS sells by demonstration and quote. Permissions and licensing:
  >     contactbcis@bcis.co.uk; API access: api@bcis.co.uk.

- Line 580:

  > POSTCODES.IO — THE FREE CHECK AT THE ADDRESS QUESTION. Phase 151, 24 September 2026 (Word answers 16, 17, 35 and
  > 36). The research is 04-phase-work/phase151/free-address-lookup.md.
  >
  > NO FREE ADDRESS LIST EXISTS FOR A COMMERCIAL SERVICE. Read that day: getAddress.io ceased on 4 February 2026 after
  > losing a High Court database-right case, and its lookup returns 404; Ideal Postcodes' free credits are "for testing
  > and evaluation" only; OS Places counts nothing towards the OS Data Hub's free allowance and its trial excludes live
  > use; Loqate and findAddress.io are trials. So the free thing at the address question is a POSTCODE CHECK, not an
  > address list: the client types their postcode, this confirms it exists and gives the council area, region and
  > country, and the client types the building and street themselves. The paid address lookup (Homedata) still runs
  > after signing, when staff start the research.
  >
  > WHAT IT PUBLISHES (postcodes.io/docs/overview and /docs/licences, read 24 Sep 2026): no key; GB data under the OS
  > OpenData licence and the Open Government Licence; for Northern Ireland "BT" postcodes "Commercial use requires a
  > licence from NI Land & Property Services" — SO THE CONNECTOR REFUSES A BT POSTCODE; the attribution lines below.
  > WHAT IT DOES NOT PUBLISH: a rate limit, a service level, or where it is hosted. Only a postcode is ever sent.

- Line 1047:

  > Phase 151, 24 September 2026. The free postcode check at the address question. See POSTCODES_IO_OPEN.

## 24 Sept 2026: Phase 151a

### `src/core/cli.ts`

- Line 289:

  > PHASE 151a. A kept council file is deleted when it is next asked for after its time; this deletes the ones
  >        nobody asks for again, so none outlives the licence's days. With no store set up, nothing is kept and nothing is
  >        deleted. A daily scheduled run of this one line is all the hosting needs to add.

### `src/integrations/connectors/homedata.ts`

- Line 240:

  > PHASE 151a: THE SAME POINT IN BRITISH NATIONAL GRID, where the answer gives it. Homedata's schema publishes `easting` and
  >      `northing` (property_lite); the land boundary lookup (src/integrations/connectors/site-area.ts) needs exactly that, and Homedata
  >      labels its latitude and longitude WGS84, which Ordnance Survey's exact conversion does not take. Kept only as a
  >      pair, and only inside Great Britain's national grid; whether the address slug carries them, the first allowed
  >      lookup will show.

### `src/integrations/connectors/inspire-councils.ts`

- Line 1:

  > FROM A COUNCIL'S ONS CODE TO HM LAND REGISTRY'S FILE NAME. Phase 151a, 24 September 2026.
  >
  > The ONS postcode table gives a property's local authority as a code ('E07000223'); HM Land Registry publishes the
  > INSPIRE Index Polygons as one file per council under its own spelling of the council's name
  > ('Adur_District_Council'). This table joins the two, and it is DERIVED FROM THE TWO PUBLISHED LISTS, NEVER GUESSED:
  >
  >   · HM Land Registry's 318 file names — src/integrations/connectors/inspire-authorities.ts, read 24 September 2026 from
  >     https://use-land-property-data.service.gov.uk/datasets/inspire/download (published 6 September 2026);
  >   · ONS's "Local Authority Districts (April 2025) Names and Codes in the UK" — the feature service
  >     LAD_APR_2025_UK_NC_v2 on the ONS Open Geography Portal, read 24 September 2026. Its England and Wales rows
  >     (codes beginning E and W) number 318, the same as HM Land Registry's files. No newer names-and-codes list was
  >     published on the portal that day.
  >
  > HOW A ROW IS DERIVED. `fileForOnsName` below is the rule: both names are lower-cased, punctuation dropped, and the
  > file name may add a prefix ("London Borough of", "Royal Borough of", "City of" …) and a suffix ("District Council",
  > "Borough Council", "Council" …) around the ONS name — never change a word of it. 310 of the 318 pair that way, each
  > to exactly one file. THE OTHER EIGHT are the eight files and the eight councils the rule leaves over, and they are
  > written out by hand in NAMED_PAIRS, each with the reason, because HM Land Registry names those councils differently
  > from ONS ("Hull_City_Council" for "Kingston upon Hull, City of"). They pair one to one: after the rule, eight files
  > and eight codes are left, and each file carries the council's own distinctive word. test/phase151a.test.ts re-runs
  > the rule over this table with no network and fails if any row is not what the rule and the named pairs say.
  >
  > A COUNCIL WITH NO ROW IS REFUSED (`inspireFileForLad`), never matched to the nearest name. ONS codes change when
  > councils are reorganised: a code this table does not hold means the lists have moved, and the fix is to read both
  > again with tools/inspire-council-table.ts, not to guess.
  >
  > A PROPERTY ON A COUNCIL BOUNDARY CAN BE IN TWO FILES. HM Land Registry: "If a polygon is on the boundary between
  > local authorities, it will appear in both local authority data files" (SUPPLIER_DOCS, HMLR_INSPIRE). The postcode
  > table gives one council per postcode, so src/integrations/connectors/site-area.ts reads that council's file and any council a
  > person adds, and says which it read.

### `src/integrations/connectors/inspire-store.ts`

- Line 1:

  > ONE FILE A COUNCIL A MONTH — KEEPING HM LAND REGISTRY'S LAND BOUNDARY FILES ON OUR OWN SERVER. Phase 151a.
  >
  > HM Land Registry republishes the INSPIRE Index Polygons "on the first Sunday of each month" (SUPPLIER_DOCS,
  > HMLR_INSPIRE), one file per council. So one download serves every property in that council until the next
  > release, and this store keeps it: KEYED BY COUNCIL AND RELEASE MONTH, and KEPT NO LONGER THAN THE LICENCE ROW'S
  > cache_max_age_days (35, in the source register's HMLR_INSPIRE licence), counted from the day it was downloaded.
  >
  > WHERE. A directory named by CAPREBATE_INSPIRE_STORE_DIR, OUTSIDE THE REPOSITORY. A directory inside the git working
  > copy is refused, so a council's file can never be committed by accident (it is also far too large). Absent, nothing
  > is kept and every lookup downloads its council's file afresh — slower, never wrong.
  >
  > WHAT IS KEPT. The .zip exactly as downloaded, and beside it a small note: when it was downloaded, its size and its
  > SHA-256. A file whose bytes no longer match its note, whose note cannot be read, or that is past its days, is
  > deleted and treated as not kept. The polygons are never unpacked into the store and nothing about a client or a
  > property is written here — only the council's name, which is also the file's published name.

### `src/integrations/connectors/inspire.ts`

- Line 75:

  > Phase 151a. Where a council's file is kept for the month (src/integrations/connectors/inspire-store.ts). Given, a kept copy of
  > this council's current release is read instead of downloading again, and a fresh download is kept. Absent or
  > null, every lookup downloads. Consulted only after every refusal above has passed, so it cannot fire anything.

- Line 125:

  > PHASE 151a: ONE FILE A COUNCIL A MONTH. A kept copy of this council's current release serves every property in
  >        it; only a miss downloads, and a download that opens is kept. A kept file that will not open is dropped.

### `src/integrations/registers/name-exclusion.ts`

- Line 412:

  > Phase 151a: easting and northing, the supplier's British National Grid point for the same building.

- Line 424:

  > PHASE 151a, 24 September 2026 — HM LAND REGISTRY'S LAND BOUNDARY (INSPIRE Index Polygons). Without an entry the
  > one door would refuse the site area with E_UNKNOWN_SOURCE, so the entry comes with the function that writes it
  > (09-app/backend/src/connectors/site-area.ts), as HOMEDATA_ADDRESS's did.
  >
  > NOTHING PERSONAL CAN ARRIVE. The polygons carry no title number and no name — only an INSPIRE ID and a shape
  > (SUPPLIER_DOCS, HMLR_INSPIRE). What is kept is the area worked out from the shape, its confidence grade, and the
  > polygon's identifier. The shape itself, a map of it and its coordinates are never kept: the boundary module's
  > CURRENT_LICENCE_PERMISSION keeps them out of every report, and nothing writes them here.

### `src/integrations/registers/source-register.ts`

- Line 735:

  > Phase 151a: site_area_m2_grade — the area's confidence grade, stored beside it, never better than max_grade.

- Line 951:

  > Phase 151a: easting and northing, published in Homedata's own schema (property_lite, read 24 September 2026). They
  >        are the British National Grid point the land boundary lookup needs, with no conversion — Homedata labels its
  >        latitude and longitude WGS84, which the exact conversion (OSTN15, from ETRS89) does not take.

- Line 1347:

  > Phase 151a, the same day: the two lists the council table is derived from, and Ordnance Survey's conversion.

## 24 Sept 2026: Phase 151b

### `src/core/authz.ts`

- Line 625:

  > PHASE 151b — THE CLIENTS AREA, AS ACCOUNTING READS IT. Word answer 40 (closed 24 September 2026): Accounting should
  > see the clients area, so it is told to raise the invoice, chases it and records payment. NOT `organisation.read`:
  > the whole record carries the notes, the research, the answers and where the client came from, and opening it to
  > Accounting failed fifteen tests that guard those boundaries. This is the billing view of the same area
  > (src/web/billing.ts): each client's name, the people to chase and how to reach them, the claims waiting for an
  > invoice, and the invoices with every chase. Read only.

### `src/core/navigation.ts`

- Line 156:

  > PHASE 151b (Word answer 40, closed 24 September 2026): Clients, as the brief asked — Accounting's billing view of it:

### `src/shared/upload-handler-port.ts`

- Line 87:

  > Phase 132. The deletion clock itself — and its rule that where two clocks are known the LATER governs (Word answer
  > 173, 24 September 2026; it was the earlier until Phase 151b) — as the ingestion module states it, so the RET-7
  > dates src/web/documents.ts reads can be proved against the one function that
  > would turn them into a date. Nothing in src/ calls it: RET-7 is not approved.

## 24 Sept 2026: Phase 151c

### `src/integrations/connectors/ostn15.ts`

- Line 1:

  > LATITUDE AND LONGITUDE TO BRITISH NATIONAL GRID, EXACTLY — OR NOT AT ALL. Phase 151a, 24 September 2026.
  >
  > The land boundary files are in British National Grid (EPSG:27700), metres. A point given as latitude and longitude
  > must be converted before it can be looked for, and HM Land Registry warns that a rough conversion can move features
  > by up to 15 metres (04-phase-work/phase133/inspire-format-findings.md) — enough to put a property in the wrong
  > parcel. Ordnance Survey's own guide says a Helmert-type conversion is good to "only about 3 metres". So this file
  > does ONE conversion, the one Ordnance Survey defines as exact for this purpose, OSTN15, and refuses otherwise.
  >
  > OSTN15, AS ORDNANCE SURVEY PUBLISHES IT ("A guide to coordinate systems in Great Britain", docs.os.uk, read
  > 24 September 2026, and the OSTN15 developer pack):
  >   1. the ETRS89 latitude and longitude are projected with the National Grid's Transverse Mercator projection on
  >      the GRS80 ellipsoid (true origin 49°N 2°W, scale 0.9996012717, false origin 400 km west and 100 km north);
  >   2. "the grids of northing and easting shifts between ETRS89 and OSGB36 cover Britain at a resolution of one
  >      kilometre": the four grid points around the projected point give its shift "by a bilinear interpolation";
  >   3. the shift is added. The result is the OSGB36 National Grid easting and northing — EPSG:27700.
  >
  > WHAT IS REFUSED, AND WHY EACH IS A REFUSAL RATHER THAN A ROUGHER ANSWER:
  >   · no grid file on this server — the shifts ARE the conversion; without them there is only an approximation;
  >   · a datum that is not stated as ETRS89. OSTN15 converts ETRS89. WGS84 drifts away from ETRS89 by about 2.5 cm a
  >     year (around a metre by 2026), and a supplier that does not say which it gives is not assumed to give either;
  >   · a point outside the grid, or where any of the four surrounding grid points is missing or marked outside the
  >     transformation's area (datum flag 0) — the interpolation would then be from shifts OSTN15 does not vouch for.
  >
  > THE GRID FILE is Ordnance Survey's OSTN15_OSGM15_DataFile.txt from the free developer pack (BSD licence), kept on
  > this server OUTSIDE the repository and named by CAPREBATE_OSTN15_FILE — like the ONS postcode table, a deployment
  > artefact, absent by default. ABSENT, every latitude and longitude is refused and nothing else changes. The first
  > copy put on a server must be checked against the pack's own test points (tools/ostn15-verify.ts) before it is
  > trusted. No file was downloaded by the phase that built this. Phase 151a's addendum (24 September 2026) put OS's full
  > developer pack on the Mac, in ~/caprebate-data/ostn15/, outside the repository, and the check passed on all forty
  > test points. Phase 151c: the demo launcher names that file when it is there (tools/demo-server.cjs).

## 24 Sept 2026: Phase 151h

### `src/integrations/connectors/identity-check.ts`

- Line 1:

  > AN ONLINE IDENTITY CHECK FOR THE MONEY-LAUNDERING RULES — DIDIT. Phase 151, 24 September 2026, built for Veriff;
  > Phase 151f, 25 September 2026, SWITCHED TO DIDIT on Lakhbir's instruction. BUILT FOR REAL AND SWITCHED OFF.
  >
  > WHY DIDIT (Lakhbir, 25 September 2026, in chat: "switch to Didit", after asking for a free alternative with an API).
  > Didit's own pages, read 25 September 2026: 500 full checks a month free, permanently, with no card (ID document,
  > passive liveness, face match and an IP check), then US$0.33 a check; one POST that returns a hosted link; a result
  > webhook SIGNED with HMAC-SHA256; data processed and stored in the EU (AWS) by default; retention set by us, from one
  > month to ten years. What its pages did NOT show: certification under the UK digital identity trust framework
  > (Veriff states it has one). The money-laundering rules do not require that certification as far as we know, and
  > whether we are supervised at all is Word question 10; the officer and the solicitor see this change in their register.
  > Veriff, Credas and APLYiD were compared on 24 September 2026 (04-phase-work/phase151/identity-check-providers.md);
  > Didit's page reads are in 04-phase-work/phase151f/didit.md.
  >
  > WHY IT IS OFF, AND WHAT TURNS IT ON. `IDENTITY_CHECK.enabled` ships false. `identityCheckMissing` lists what must be
  > true first, in plain words, and every one is a person's decision, not Claude's:
  >   1. the provider chosen — Didit, Lakhbir's choice of 25 September 2026;
  >   2. the provider named as a processor in the privacy notice AND in clause 7 of the engagement letter (the Phase 115
  >      rule: nothing carries client data through a processor the client was not told about);
  >   3. its key, its webhook secret and the id of the check we set up in its console (the "workflow") in the key file
  >      (DIDIT_API_KEY, DIDIT_WEBHOOK_SECRET, DIDIT_WORKFLOW_ID), never in code;
  >   4. then the switch.
  > Identity is checked whether or not money-laundering supervision applies (Word question 10, recorded 24 September
  > 2026), so nothing here reads AML_IN_SCOPE.
  > OFF, NOTHING LEAVES THIS SERVER: `startIdentityCheck` refuses before any call, any audit row of a call, anything.
  >
  > SWITCHED ON FOR TESTING — Phase 151h, 25 September 2026, Lakhbir in chat: "switch it on we are still in a testing
  > enviroment". The Didit account is live and its three entries are in the key file. The officer approved the Didit
  > entry of the privacy notice the same day (relayed by Lakhbir), BUT THE PAPERS ARE NOT DONE: the notice is still a
  > draft, not published, and clause 7 of the engagement letter names Didit only in a comment. So `enabled` is true, the
  > two `named_in_*` flags stay FALSE because they are false, and `papers_waived_for_testing` records the decision to
  > test before the papers are done, with who and when in `waiver_record`. While it is waived and the papers are not
  > done, every screen that can send a check says, in words, that it is for testing only and never for a client
  > (`identityTestingWarning`), and every check sent is audited as sent under the waiver.
  > BEFORE A REAL CLIENT IS CHECKED: publish the notice naming Didit, put Didit into clause 7, set both `named_in_*` to
  > true, and set `papers_waived_for_testing` to false. The waiver is never a substitute for the papers.
  >
  > WHAT IS SENT. The check we set up (its workflow id), an opaque reference to our check, and the first and last name
  > of the person, as the name Didit should expect to find on the document. Never an address, a company, a claim, a
  > figure, an email or a phone number. The client's documents and selfie go from their phone to Didit, never through us.
  >
  > WHAT COMES BACK, AND N4. Didit's result arrives by webhook, at the address set in its console. It is believed ONLY
  > when a signature holds - X-Signature-V2 (the HMAC of the sorted, compact JSON, Didit's recommended one) or
  > X-Signature (the HMAC of the exact bytes) - AND its X-Timestamp is within five minutes. Only these map to an answer:
  > Approved -> PASS; Declined -> FAIL; In Review, Resubmitted and Kyc Expired -> REFER; Expired and Abandoned ->
  > NOT_COMPLETED. Not Started, In Progress and Awaiting User are the check still under way: acknowledged, and NOT kept as
  > a result. ANY OTHER STATUS, A MISSING ONE, OR A BAD SIGNATURE IS NEVER A PASS: an unknown status is REFER, for a person
  > to look at, and an unsigned or stale body is refused outright. A webhook about anything but a session's status is
  > acknowledged and ignored.
  >
  > WHAT IT DOES NOT DO. It never finishes a check on its own. A PASS is recorded on the check as evidence of how
  > identity was verified; a person still completes the check (`completeCheck` in src/web/compliance-aml.ts), as today.
  > And we keep our own record of the decision, whatever retention is set in Didit's console: the money-laundering
  > rules ask us to keep our evidence for five years.

## 24 Sept 2026: Phase 151l

### `src/integrations/connectors/inspire.ts`

- Line 1:

  > THE LAND BOUNDARY FETCHER — HM LAND REGISTRY'S INSPIRE INDEX POLYGONS. Phase 150, 24 September 2026.
  > BUILT FOR REAL AND SWITCHED OFF.
  >
  > WHAT IT IS. The real `BoundaryFetcher` that 09-app/backend/src/registers/caprebate-boundary-import.ts has waited for since
  > Phase 78. That module's DEFAULT_FETCHER always throws, and it still does: this fetcher is used only when a caller
  > injects it into `fetchAndImportBoundary`, and since Phase 151a exactly one does — src/integrations/connectors/site-area.ts, which
  > works out a property's site area from it, switched off by the same word. Given a council's file and a British
  > National Grid point for the property, it:
  >
  >   1. refuses at once while BOUNDARY_FETCHING_SWITCHED_ON is false — before any call, any audit row, anything;
  >   2. refuses a building footprint (that is Ordnance Survey's, not HM Land Registry's), a council that is not in the
  >      published list (src/integrations/connectors/inspire-authorities.ts), and a point with no usable easting and northing;
  >   3. downloads that ONE council's .zip through src/integrations/connectors/http.ts, the only way out — so the rate limit, the
  >      size cap, the time limit and the audit row are the same as every other connector's;
  >   4. opens the zip on this server (one .gml inside, checked against its own CRC), reads each polygon, keeps only
  >      those whose box could hold the point, and hands them to the module's own spatial join,
  >      `findInspirePolygonForPoint`, which refuses rather than guesses;
  >   5. returns the one polygon that contains the point, as the module's `RawBoundaryPayload`, graded no better than B.
  >
  > WHY A WHOLE FILE. HM Land Registry publishes INSPIRE as one file per local authority and offers no lookup by point
  > or by title (its dataset and download pages, read 24 September 2026; SUPPLIER_DOCS in the source register). So the
  > only thing that leaves this server is the council's NAME. No address, no postcode, no client and no point is ever
  > sent. The polygons carry no title number and no name.
  >
  > WHAT IS NOT PUBLISHED, AND SO IS READ TOLERANTLY. HM Land Registry does not publish the element names inside its
  > GML. The reader therefore accepts a feature wrapped in <…:featureMember> or <…:member>, an identifier in any
  > element whose name is INSPIREID, and one gml:Polygon with posList rings. It is STRICT about everything else: a
  > feature it cannot read makes the whole file unreadable, because a polygon we skipped could be the one that holds
  > the point, and "exactly one polygon contains it" would then be a guess. THE FIRST ALLOWED DOWNLOAD MUST CONFIRM
  > THE SHAPE. "Can we make a few small, logged test lookups to check a data connector works?" was answered by Lakhbir on
  > 25 September 2026 (yes, on five conditions), and Phase 151l (28 September 2026) built the download as a test lookup
  > under them: `smoke HMLR_INSPIRE`, src/integrations/connectors/boundary-test-lookup.ts. Until a person runs it, no file has been
  > downloaded, and every test here runs on an invented fixture with no network.
  >
  > NOTHING HERE DECIDES WHAT THE AREA MAY BE USED FOR. The module's CURRENT_LICENCE_PERMISSION does: our own checks
  > only, and no boundary, map or coordinate in a client report (Lakhbir, 15 September 2026).

### `src/integrations/connectors/site-area.ts`

- Line 1:

  > A PROPERTY'S SITE AREA FROM HM LAND REGISTRY'S LAND BOUNDARY — WIRED, AND SWITCHED OFF. Phase 151a, 24 Sep 2026.
  >
  > THE ONE BACK-END FUNCTION, `siteAreaFromLandBoundary`, that joins what Phase 150 built to a stored fact:
  >
  >   1. the switch. While BOUNDARY_FETCHING_SWITCHED_ON (09-app/backend/src/registers/caprebate-boundary-import.ts) is false it
  >      returns SWITCHED_OFF before anything else — nothing read, nothing sent, nothing stored;
  >   2. the use. `checkBoundaryUse('INTERNAL_CALCULATION')` must say yes. The boundary is for our own checks only
  >      (CURRENT_LICENCE_PERMISSION, Lakhbir, 15 September 2026);
  >   3. the point. A British National Grid easting and northing — one a person enters, or one a supplier gives in that
  >      grid — or an ETRS89 latitude and longitude, converted by Ordnance Survey's exact method (src/connectors/
  >      ostn15.ts) and refused rather than approximated. NO POINT, NO LOOKUP (N4): the site area stays asked;
  >   4. the council's file. Each council code (the postcode's council from the ONS table, then any a person adds) is
  >      turned into HM Land Registry's file name by src/integrations/connectors/inspire-councils.ts; a code with no entry is refused.
  >      A property on a council boundary can sit in two files, so every council given is read, and the answer says
  >      which were;
  >   5. the boundary. `inspireBoundaryFetcher` — one per council, with the month's kept file where there is one
  >      (src/integrations/connectors/inspire-store.ts) — is injected into `fetchAndImportBoundary`, and the module works out the
  >      area of the one polygon that holds the point;
  >   6. the fact. site_area_m2 is stored through the one door, `ingestRegisterRecord`, under source HMLR_INSPIRE, at
  >      grade B at best (the source register's max_grade for HMLR_INSPIRE), with the polygon's INSPIRE ID. A record
  >      already held for the property is kept as it was, as research does (Phase 139).
  >
  > WHAT NEVER LEAVES THIS FUNCTION: the polygon, a map of it, and its coordinates. The outcome carries a number, a
  > grade, the councils read and the reason — nothing else — and the stored record carries the area, its grade and the
  > polygon's identifier. The boundary module's CURRENT_LICENCE_PERMISSION keeps a boundary out of every client report
  > and this function gives no way round it.
  >
  > ITS ONE CALLER IS THE RESEARCH RUN AFTER SIGNING (Phase 151c, src/web/site-area-run.ts): "Run the research" works
  > out each property's site area on the same click, passing the postcode's council, any neighbouring council a person
  > added, and the point a person entered or Homedata's own easting and northing. NOTHING CAN FIRE IT TODAY: the switch
  > is false. Turning it on is the one word in the boundary module, and it is Lakhbir's. "Can we make a few small, logged
  > test lookups to check a data connector works?" was answered on 25 September 2026, and the first download, as a test
  > lookup under its five conditions, is `smoke HMLR_INSPIRE` (Phase 151l, src/integrations/connectors/boundary-test-lookup.ts).

### `src/integrations/registers/boundary-import.ts`

- Line 827:

  > Phase 132e. A named, readable statement that fetching is OFF, read by
  > checkBoundaryUse's reason.
  >
  > PHASE 150 (24 September 2026) MADE IT A REAL SWITCH. The real fetcher,
  > 09-app/backend/src/connectors/inspire.ts, reads this constant before it does
  > anything, and while it is false it refuses (E_FETCHING_SWITCHED_OFF) with
  > nothing sent. DEFAULT_FETCHER below is unchanged and still always throws, so
  > with no fetcher injected, setting this true would still fetch nothing.
  > Turning fetching on is this one word plus injecting that fetcher. "Can we
  > make a few small, logged test lookups to check a data connector works?" was
  > answered on 25 September 2026; the first download runs as a test lookup
  > (Phase 151l, `smoke HMLR_INSPIRE`), and turning this on is Lakhbir's.

## 24 Sept 2026: no phase named

### `src/core/authz.ts`

- Line 757:

  > 24 September 2026, Word question 219: Sales, Admin and the data protection officer may open a kept original. Sales
  >      on the same documents it may read, never the fee invoice. Kept originals exist only while KEEP_ORIGINALS is on.

- Line 1211:

  > 24 September 2026, Word question 219: the officer may open a kept original.

### `src/integrations/connectors/identity-check.ts`

- Line 87:

  > The question that chose a provider, closed 24 September 2026 (Veriff), and reopened by Lakhbir's switch to Didit on
  > 25 September 2026, recorded under it in the closed questions document. Quoted by its title, which did not change.

### `src/integrations/connectors/site-area.ts`

- Line 69:

  > WHICH DATUM HOMEDATA'S LATITUDE AND LONGITUDE ARE IN. Homedata's own schema (https://api.homedata.co.uk/schema/yaml/,
  > read 24 September 2026) labels them "WGS84" — not ETRS89, which is what Ordnance Survey's exact conversion takes, and
  > the two differ by about a metre today. So a Homedata latitude and longitude is refused (DATUM_NOT_ETRS89). The same
  > schema publishes `easting` and `northing`, and the connector now keeps them: those are used instead, unconverted. Set
  > this to 'ETRS89' only on the supplier's written word that its figures are ETRS89.

### `src/integrations/email/email-inbound.ts`

- Line 57:

  > True since 24 September 2026: contact@ exists and Sadique Maskeen reads it (Word questions 216 and 217, closed).
  >      Reading replies stays OFF until its IMAP login is in the key file and the switch is turned on.

### `src/integrations/email/email-provider.ts`

- Line 99:

  > The title of the open question under Lakhbir in the Word questions document (217). Quoted, not paraphrased. The provider
  >  question it replaced (186) was answered - IONOS - and closed on 24 September 2026.

### `src/integrations/registers/name-exclusion.ts`

- Line 583:

  > both as uploads (Word question 223, 24 September 2026), and until the officer says otherwise they are treated

### `src/shared/originals.ts`

- Line 54:

  > 24 September 2026, Lakhbir in chat (Word question 219, recorded; still open for the data protection officer to
  >    approve): keep them 7 years, and Sales, Admin and the data protection officer may open them. 7 years from the day
  >    the file was read is 2,557 days (two leap days in any seven years from 2026). THE SWITCH STAYS OFF until the officer
  >    approves and the privacy notice says both; `keptDays` reads no period while it is off.

## 25 Sept 2026: Phase 146h

### `src/core/audit.ts`

- Line 358:

  > Phase 146j, 25 September 2026: the two one-way doors of Phases 146h and 146i, given a way back, each with its own
  > kind beside the one that opened it. REGISTER_MATCH_TAKEN_BACK: a person's pick for a close match taken back — the
  > lookup, the reason in their own words, that the one record the pick wrote was removed, and what must be looked at
  > again as kinds and counts. DOCUMENT_FIELD_VOUCH_WITHDRAWN: a 'yes' about a name on a client document taken back —
  > the field, the reason, and how many records the field was taken out of. NEVER THE ENTRY, THE NAME OR THE VALUE,
  > and the reason passes the same screen as every other detail (src/web/take-back.ts refuses one that would not).

## 25 Sept 2026: Phase 146i

### `src/integrations/register-ingest.ts`

- Line 56:

  > ------------------------------------------------------------------ *
  > AND THE ONE DOOR OUT — Phase 146j, 25 September 2026.
  >
  > Two decisions a person makes put register data in: choosing one entry from a close-match list (Phase 146h) and
  > saying a name on a client document belongs to an organisation (Phase 146i). Both can now be taken back, and taking
  > one back takes out what it put in — so, like the way in, the way out is in this file and nowhere else, and
  > test/phase146j.test.ts asserts it. Neither function decides WHETHER something may be removed: that is the caller's,
  > who has already checked that nobody approved it and that this decision is what wrote it. These only do it, and
  > refuse to do more than they were asked.
  > ------------------------------------------------------------------

## 25 Sept 2026: Phase 146k

### `src/core/audit.ts`

- Line 367:

  > Phase 146k, 25 September 2026: HM Land Registry's title register is looked up by hand (src/web/title-by-hand.ts).
  > TITLE_RECORDED_BY_HAND: a person recorded what the official copy says — the property, and WHICH facts were given,
  > never their values. TITLE_BY_HAND_TAKEN_BACK: that entry taken back, with the reason and what to look at again.

### `src/core/secrets.ts`

- Line 86:

  > PHASE 146k: THE PHASE THAT RETIRED THIS KEY, where one did. A retired key is not asked for — secrets.example.env
  > leaves it out, and a test holds that — because nothing a click runs reads it. It stays in this list only so that
  > the retired connector that owned it (PAID_RETIRED in src/integrations/connectors/paid-registers.ts) still reads its own key in
  > its recorded-answer tests, and so reversing the decision is deleting this one word, not re-typing four keys.

### `src/integrations/connectors/paid-registers.ts`

- Line 99:

  > PHASE 146k — RETIRED, NOT DELETED. HM Land Registry's title register is looked up BY HAND (Lakhbir, 25 September
  > 2026), and the Business Gateway user name, password and certificate are no longer in the key file or in
  > secrets.example.env. So no click runs this, and switching `REGISTER_SWITCHES.HMLR_TITLE` on changes nothing: a source
  > in neither map has no connector in this build. The code and its recorded-answer tests stay, so that reversing the
  > decision is putting this entry back in the map above and the four key names back in src/core/secrets.ts — not a rewrite.

### `src/integrations/connectors/registers.ts`

- Line 138:

  > PHASE 146k: RETIRED. The title register is looked up by hand (src/web/title-by-hand.ts); its connector is in
  >      PAID_RETIRED, in no map a click reads, so this switch turns nothing on. It stays so a case stamp reads as before.

## 25 Sept 2026: Phase 151

### `src/integrations/connectors/sources.ts`

- Line 261:

  > PHASE 151f, 25 September 2026 — Didit, the online identity check for the money-laundering rules
  >        (src/integrations/connectors/identity-check.ts), BUILT AND SWITCHED OFF, in place of Veriff (Phase 151) on Lakhbir's
  >        instruction. A PROCESSOR, not a register source, like the Claude API: it holds the client's ID and selfie for us.
  >        Processed and stored in the EU (AWS) by default, docs.didit.me/getting-started/security-compliance. Its address,
  >        the session call and its rate limit are from docs.didit.me/sessions-api/create-session (all read 25 Sep 2026).
  >        ITS PRICE IS IN US DOLLARS: the first 500 full checks a month are free, then US$0.33 a check
  >        (didit.me/pricing). 33 below is that published figure in US CENTS, not pence, and it is the price AFTER the
  >        free 500: a cost read from here overstates a month under 500, never understates one.

## 25 Sept 2026: Phase 151b

### `src/core/audit.ts`

- Line 373:

  > Phase 151b, 25 September 2026: the online identity check (src/web/identity-checks.ts). A check sent, or not sent and
  > why in words; the outside service's signed result received, or refused because its signature did not hold or it
  > named no check we sent. Ids, the outcome and the service's status word only — NEVER a name, a document number, a
  > date of birth or an image. What the service tells us is kept in the check's own row, not here.

- Line 422:

  > Phase 151b: Accounting recording that it chased an unpaid invoice — the invoice, the day and how. Never the words.

- Line 424:

  > Phase 151b (Word answer 156): whether the person who signed the engagement letter appears on a public register as
  > able to act for the client. The source and YES, NO or NOT_CHECKED only — never a name read from the register.

- Line 429:

  > Phase 151b (Word answer 180): a person chose to answer the property questions themselves instead of the lookups.

### `src/core/navigation.ts`

- Line 120:

  > PHASE 151b: the whole record (Admin, Sales, read-only) or Accounting's billing view of it (src/web/billing.ts).

- Line 480:

  > PHASE 151b: the roles the super admin makes, before '/staff/admin' so the longer address wins.

### `src/core/router.ts`

- Line 647:

  > PHASE 151b: THE IDENTITY CHECK'S SIGNED RESULT. The service has no login, so this sits outside it — and believes
  >      nothing it is sent unless the signature holds (src/web/identity-checks.ts). A bad signature is refused and audited.
  >      The answer is a status and nothing else: the service reads no page, and a refusal says nothing about why.

- Line 965:

  > PHASE 151b (Word answer 180): the client asked us to leave the lookups alone. Kept with their organisation.

### `src/core/sections.ts`

- Line 38:

  > PHASE 151b: the online identity check, on the client page (Admin, who keeps the registers)

### `src/core/staff.ts`

- Line 426:

  > ------------------------------------------------ PHASE 151b · Accounting's clients area, and chasing an invoice

- Line 548:

  > ------------------------------------------------ PHASE 151b · SUPER ADMIN ONLY · the roles they make

- Line 1433:

  > PHASE 151b: the roles the super admin made are offered beside the built-in ones, by their own names.

### `src/integrations/connectors/companies-house.ts`

- Line 340:

  > ------------------------------------------------------------------ the officers, read in memory only (Phase 151b)

### `src/integrations/connectors/cqc.ts`

- Line 209:

  > ------------------------------------------------------------------ the named people, read in memory only (Phase 151b)

### `src/integrations/connectors/signatory-check.ts`

- Line 1:

  > WHO SIGNED, AND WHETHER THE PUBLIC REGISTER SAYS THEY MAY SIGN — CHECKED IN MEMORY, KEPT AS YES OR NO.
  > Phase 151b, 25 September 2026. Switched off WITH THE LOOKUPS: no switch of its own.
  >
  > ───────────────────────────────────────────────────────────────────────────
  > THE DECISION
  >
  > Word question 156, for the data protection officer: "May we briefly check two public register names without saving
  > them?" The background: we want to know that the person who signed the engagement letter really represents the
  > business, and two free public sources can say — the Companies House officers list, and the care regulator's (CQC's)
  > named people, the registered manager and the nominated individual. The suggestion was to read only the names,
  > compare them in memory and throw them away, keeping a yes or no and the source; never to store an officer's name;
  > to record "not found" as just that, never as a risk; and never to show it to the client.
  >
  > ANSWER, closed 24 September 2026: "Yes – best to check who signs and if they have authority". The action plan:
  > "check who signs and whether they have authority against the public register, reading names in memory and keeping
  > only yes or no; switched off with the lookups."
  >
  > ───────────────────────────────────────────────────────────────────────────
  > WHAT IT DOES
  >
  > `checkSignatory` takes the name the signer typed on the engagement letter (engagement_signatures.signer_name,
  > migration 040 — read by src/web/research.ts on the server, never from a form), the client's company number and care
  > regulator ids that we already hold, and the client's claimant type. For each of the two registers it gives:
  >
  >   YES          the register names them in a role that can sign: a CURRENT director (or an LLP's designated
  >                member) at Companies House; the registered manager or the nominated individual at CQC.
  >   NO           the register answered and does not name them so: not listed, listed only as having left, or
  >                listed in a role that cannot sign (a secretary, an ordinary LLP member). NOT A RISK AND NOT A
  >                WARNING: it is what the register shows, and the words say so and nothing more.
  >   NOT_CHECKED  with a reason code: switched off, free lookups not open, the letter not signed, no key, no name, no
  >                company number or care registration, a sole trader or partnership (the register does not apply),
  >                the register did not answer, could not be read, or listed too many people to read.
  >
  > NAMES NEVER LEAVE: the signer's name is held in the closure of `signerTest` and nowhere else; the register's names
  > are read inside the connectors (src/integrations/connectors/companies-house.ts `companiesHouseOfficers`, src/integrations/connectors/cqc.ts
  > `cqcNamedPeople`) and dropped there. The outcome carries a source, a result, a reason CODE and the words for it. No
  > name is in the outcome, the stored row (migration 050 has no name column, and its reason is a closed list of codes),
  > the audit row (SIGNATORY_CHECKED: source and result), a log line or an error. Nothing here throws, and nothing
  > here writes: src/web/research.ts stores the outcome.
  >
  > ───────────────────────────────────────────────────────────────────────────
  > THE GATES AND THE SWITCHES — THE LOOKUPS' OWN, NOT NEW ONES
  >
  > Both registers are free, so the check waits on the free gate (CB_REGISTRY.precondition, read by research.ts's
  > `freeGate` and passed in here). It also waits on the signed engagement, asserted server-side by
  > `assertSignedEngagement`, because until the letter is signed there is no signer to check. Then the SOURCE'S OWN
  > SWITCH: Companies House's is CH_COMPANY, the care regulator's is CQC (REGISTER_SWITCHES, both false). Then the key.
  > Each is checked through `runConnector`, the same path every lookup takes, so a call is made only after all four.
  >
  > ───────────────────────────────────────────────────────────────────────────
  > HOW TWO NAMES ARE COMPARED — `sameName`
  >
  > matching.ts scores addresses and company names; a person's name needs a stricter rule, so it is written here and
  > tested. Both names are put in capitals, accents dropped, full stops and apostrophes removed, and titles (Dr, Mr, Mrs,
  > Prof …) and letters after a name (OBE, Jr, PhD …) dropped. Companies House writes "SURNAME, Forenames"; a name with
  > a comma is read that way round. A name with no comma is tried at every split, so an unhyphenated double surname
  > still matches. A hyphen inside a surname is ignored ("Smith-Jones" = "Smith Jones"). Then:
  >   · the surnames must be the same;
  >   · the FIRST forename must be the same, in full — an initial alone is never enough;
  >   · middle names are optional on either side, but where both give them they must agree, in order, in full or as an
  >     initial ("Joseph A" matches "Joseph Andrew"; "Joseph Brian" does not).
  > Anything short of that is not the same name. A false NO costs a person a look; a false YES would be a check that
  > lied, so the rule leans to NO. Nicknames are not guessed.

### `src/integrations/registers/name-exclusion.ts`

- Line 582:

  > PHASE 151b, 25 September 2026 — THE TAX RETURN AND THE TAX COMPUTATION. The data protection officer said yes to

### `src/integrations/registers/source-register.ts`

- Line 1093:

  > Phase 151b (Word answer 156, read 25 September 2026): names read in memory for the signatory check, never kept

### `src/shared/engine.ts`

- Line 155:

  > Phase 151b — what the test took off the relief: the fee, plus VAT only where VAT is counted. Null where not known.

- Line 157:

  > Phase 151b — how VAT on our fee was treated in this reading, and why.

- Line 168:

  > PHASE 151b, 25 September 2026 — VAT IN THE NO-CLAIM TEST (Word question 61, Lakhbir, closed 24 September 2026:
  > "The relief is calculated over the 5 years – and must include VAT"). Transcribed from CB_FEE's `vat` report.
  > VAT is on OUR fee and exists only once we are VAT-registered; it is counted only where the client cannot reclaim
  > it; a client whose position is not known ("not sure" and absent alike) is UNDETERMINED, never told not to claim.

- Line 192:

  > PHASE 151b — the client's VAT position ON OUR FEE: 'can_reclaim' or 'cannot_reclaim'. Anything else, absent
  > included, is not known, and the engine treats them all alike (N4). Data the caller passes, not a question.

- Line 310:

  > CB_FEE.NO_CLAIM_THRESHOLD's line, read. NaN where the engine does not carry it — never a default.
  >
  > PHASE 151b — and CB_FEE.NO_CLAIM_VAT, read the same way: registered only where the engine says `true` (an absent
  > setting is not a registration), the rate only where it is a positive number (null otherwise, never 0). Read, not
  > decided: whether VAT is counted for a given client is the engine's, on each reading.

## 25 Sept 2026: Phase 151c

### `src/core/audit.ts`

- Line 431:

  > Phase 151c: a person entering, on the property page, the point the site area is looked for at (a British National
  > Grid easting and northing), or a neighbouring council whose land boundary file must also be read. The property,
  > the kind, and for a council its ONS code. The point's figures are kept in site_area_inputs, not here.

### `src/core/navigation.ts`

- Line 490:

  > PHASE 151c: THE SAME ADDRESS, A DIFFERENT SCREEN. A login that reads the billing view of the Clients tab rather than
  >      the client record (Accounting, src/web/billing.ts) is trained in B55, not B5 — so the link asks who is looking, not
  >      only where. The same question the Clients tab itself asks (`billingViewFor`), never a role name.

### `src/integrations/connectors/free-registers.ts`

- Line 130:

  > PHASE 150: the land boundary has its own connector, src/integrations/connectors/inspire.ts, which reads a whole council's file
  >      for one point. PHASE 151c: this button now runs it, as its own step for each property (src/web/site-area-run.ts),
  >      not as one lookup for the client — so this row points at the site area lines, which say what happened.

### `src/integrations/connectors/site-area.ts`

- Line 204:

  > EVERY CHECK BEFORE THE DOWNLOAD, AND NOTHING ELSE. Phase 151c split this out of `siteAreaFromLandBoundary`, unchanged
  > and in the same order, so the research panel can say what the next click would do without sending anything: the
  > switch, the use, the property, the point, the councils, and a site area already held. It reads the database and
  > nothing outside it. An outcome is a reason to stop; `ready` is everything the download needs.

### `src/integrations/registers/boundary-import.ts`

- Line 583:

  > PHASE 151c, 25 September 2026. This said "a site area worked out from it may be reported", while the
  >              source register's HMLR_INSPIRE licence row says client_report false for everything from this source,
  >              the site area included. Lakhbir's decision of 15 September 2026 (decision_record above) settles the
  >              map — it stays out — and "internal calculation only"; it does not say whether the NUMBER may go in a
  >              client report. So both now say the same, the safe way round, and the number waits on his answer to the
  >              Word question "May the site area we work out from a land boundary go in a client's report?".

### `src/integrations/registers/source-register.ts`

- Line 236:

  > PHASE 151c, 25 September 2026: the boundary module's checkBoundaryUse said the site AREA "may be reported"
  >        while this row says client_report false for the whole source. Lakhbir's decision of 15 September settles the
  >        map, not the number, so the number stays in with everything else here — for our own checks — until he answers
  >        the Word question "May the site area we work out from a land boundary go in a client's report?". Both now say so.

## 25 Sept 2026: Phase 151e

### `src/core/app.ts`

- Line 87:

  > PHASE 151e (line 4): a remote database's token (src/core/db.ts). The caller reads it from settings; absent for memory and file.

### `src/core/db.ts`

- Line 123:

  > A libsql row made to read as node:sqlite's does, which is what every caller and test was written against. Proved by
  > running the whole back end's suite on libsql (Phase 151e): the two differences found are both here.
  >   - libsql adds a `_metadata` field (the query's duration) to each row. It is not a column, and it is dropped.
  >   - libsql gives a BLOB as an ArrayBuffer; node:sqlite gives a Uint8Array. It is given as a Uint8Array.

### `src/core/router.ts`

- Line 1688:

  > PHASE 151e (line 6): the person's own contact holds the address they typed, at the funnel close too. It was

### `src/core/secrets.ts`

- Line 352:

  > PHASE 151e (line 3), 25 September 2026: THE TEST WEBSITE'S KEYS, FROM ITS OWN SETTINGS. The test deployment on
  > Vercel has no key file and cannot have one; its settings arrive as environment variables. This reads ONLY the names
  > it is given, from those variables, and nothing else in the environment. It is called by the test deployment's entry
  > point (api/index.mjs), and only when that deployment has a password of its own; a live server reads the key file.

### `src/core/server.ts`

- Line 86:

  > PHASE 151e (line 4): the token of a remote database named by `location` (src/core/db.ts). Absent for memory and file.

## 25 Sept 2026: Phase 151f

### `src/core/audit.ts`

- Line 419:

  > Phase 151f: a signed word from the service that the check is still under way, or about something other than a
  >  check's status. Acknowledged and not kept as a result. The status word and why only.

### `src/core/router.ts`

- Line 716:

  > PHASE 151f: Didit signs with two headers and dates the result; any may be missing, and then nothing is believed.

### `src/integrations/connectors/identity-check.ts`

- Line 285:

  > OUR OWN COPY OF A RESULT — Phase 151b, 25 September 2026; Didit's shape since Phase 151f. The decision's own fields
  > and nothing about the person: the session's status, when it was decided, whether the document, the liveness and
  > the face match each passed, and the TYPE and issuing COUNTRY of the document checked. Never a name, a date of birth,
  > a document number, an address, an image or a media link. Read only from a body whose signature has already held
  > (`readIdentityDecision`); an unreadable body gives an empty copy. Migrations 047 and 053 refuse a copy that carries
  > a person, a name, a date of birth or a document number, so this reader cannot quietly widen.

## 25 Sept 2026: Phase 151h

### `src/integrations/connectors/postcode-check.ts`

- Line 40:

  > TESTING ONLY, as the identity check's (src/integrations/connectors/identity-check.ts, Phase 151h): a person's decision to send
  > before the notice is published and names the service. It never makes `named_in_privacy_notice` true. Absent is false.

### `src/integrations/email/email-provider.ts`

- Line 91:

  > TESTING ONLY, as the identity check's (Phase 151h): a person's decision to send before the privacy notice and the
  > engagement letter name IONOS. It never makes either `named_in_*` true. Absent is false.

## 25 Sept 2026: no phase named

### `src/integrations/connectors/identity-check.ts`

- Line 192:

  > Didit's session statuses, exactly as its webhook documents them (case-sensitive, read 25 September 2026).

## 27 Sept 2026: Phase 146l

### `src/integrations/registers/name-exclusion.ts`

- Line 593:

  > PHASE 146l, 27 September 2026 — THE OFFICIAL COPY OF THE TITLE REGISTER, read by a person (HUMAN_CAPTURE_SPECS).

## 27 Sept 2026: Phase 151e

### `src/core/db.ts`

- Line 24:

  > PHASE 151e (line 4), 27 September 2026 — WHERE THE DATABASE IS, AS THE SERVER ITSELF KNOWS IT.
  >
  >   memory   ':memory:' — this process only. Gone when the process ends, and never seen by a second copy of it. The
  >            test website runs this way until a lasting database is set (api/index.mjs), and a page that must warn
  >            about it reads `kind` here: never a setting and never a flag a page sends.
  >   file     a SQLite file on this machine: lasts, but only this machine reaches it.
  >   remote   a libSQL database reached over the network (Turso, a native Vercel Marketplace integration), by a
  >            libsql:// or https:// address and a token. Every copy of the server reaches the same one.
  >
  > WHY libSQL AND NOT POSTGRES. Everything in this back end calls run / get / all and gets its answer back at once. The
  > `libsql` package answers the same way (better-sqlite3's API, synchronous, the same SQL dialect, STRICT tables
  > included), so nothing above this class changes. A Postgres driver answers later (a promise), and would change
  > every one of those calls. The package is loaded only when it is asked for, so memory and file never touch it.

## 28 Sept 2026: Phase 151e

### `src/core/audit.ts`

- Line 546:

  > PHASE 151i, 28 September 2026 — TWO COPIES ON ONE DATABASE. The test website's copies share one lasting database
  >        (Phase 151e), so two can append at once. Until today this read the last hash and then, in a SECOND statement,
  >        the next number: a row written between the two gave a new row the right number and the wrong previous hash (a
  >        broken chain), and a row written between the reads and the write took this row's number, so the insert hit
  >        seq's key and the request was lost. Now ONE statement reads both from the same row, and a clash on seq —
  >        another copy got there first — is read again and retried. The key on seq is what keeps the chain from forking:
  >        two rows can never claim the same place. What a hash covers is unchanged.

### `src/core/db.ts`

- Line 263:

  > All-or-nothing. A partial write of an audited action is worse than none.
  >
  > PHASE 151i, 28 September 2026: IMMEDIATE, so the write lock is taken FIRST. With a plain BEGIN, a transaction
  > that read the audit chain's end and then wrote could meet a row another copy of the server had added in between
  > (the test website's copies share one database since Phase 151e): on a file its write fails, and the whole
  > audited action is lost. Holding the lock from the start, every other writer waits until this one commits, and
  > reads what it wrote. libSQL's own client asks for a write transaction the same way.

### `src/core/router.ts`

- Line 1618:

  > PHASE 151e (line 6), 28 September 2026 — THE FUNNEL'S CLOSE NEEDS A WAY TO REACH THE PERSON, on the channel they chose:
  > an email address for email, a telephone number for a call or a text. Blank, or not one, is refused in words, and
  > nothing is saved. "We must get contact details, it is a non negotiable" (Lakhbir).

- Line 1640:

  > PHASE 151e (line 6): contact details are not optional (Lakhbir, 28 Sep 2026). No way to reach them, no client.

### `src/core/seed.ts`

- Line 157:

  > PHASE 151e (line 7), 28 September 2026 — EVERY INVENTED CLIENT HAS A CONTACT WE CAN REACH. Contact details are not
  > optional (line 6), so a client with none is flagged; Lakhbir asked for one invented contact on each seeded client
  > that had none, so the demo and the test website show clients as they should be. Dunmarrow keeps its two. A CHANNEL,
  > not a person, as everywhere in this file: a role name and a role mailbox, and a number in Ofcom's drama range.

## 28 Sept 2026: Phase 151g

### `src/core/cli.ts`

- Line 343:

  > ------------------------------------------------------------------ *
  > PHASE 146g — THE LIVE SMOKE TEST. Does this account, this key and this address actually work?
  >
  > Every suite runs on recorded answers with no key and no network, which proves the code and proves nothing about
  > an account somebody has just opened. This makes ONE real call to ONE service and says whether the service took
  > it. The handover page in the Developer Spec names this command in every row.
  >
  > IT NEEDS CAPREBATE_LIVE_SMOKE=1, the same shape as the seed's own confirmation: a live call is not something to
  > make by mistyping a command. It opens no gate and changes no switch that ships.
  >
  > PHASE 151g, 28 September 2026: IT NOW KEEPS LAKHBIR'S FIVE CONDITIONS (Word question 170, answered 25 September
  > 2026) as refusals, not as a printed warning — who and why required, a log outside the repository that keeps only
  > the connector, the time, PASS or NO, who and why, three lookups per connector each time it is switched on, never
  > a client's values, and never a demonstration. src/integrations/connectors/test-lookups.ts does all of it; this hands it the
  > live transport and the key file.
  > ------------------------------------------------------------------

- Line 366:

  > PHASE 151g. A person records that a connector has been switched on: one line in the test lookup log, and the only
  >      way that connector's count of three test lookups starts again. It makes no call and changes no switch.

### `src/integrations/connectors/boundary-test-lookup.ts`

- Line 1:

  > THE LAND BOUNDARY'S TEST LOOKUP — ONE COUNCIL'S FILE, UNDER LAKHBIR'S FIVE CONDITIONS. Phase 151l, 28 September 2026.
  >
  > WHY IT EXISTS. The land boundary fetcher (src/integrations/connectors/inspire.ts, Phase 150) is built and switched off, and HM Land
  > Registry does not publish the element names inside its GML, so its reader was written tolerantly and the one page
  > says "the first allowed download must confirm the shape". Word question 170 was answered on 25 September 2026 (yes,
  > on five conditions), and Phase 151g built the conditions into the smoke command, which did not cover a download. This
  > file is the download, as a test lookup: `smoke HMLR_INSPIRE`.
  >
  > WHY THE SMOKE COMMAND AND NOT A COMMAND OF ITS OWN. So the five conditions are the SAME CODE, not a copy: the notice,
  > CAPREBATE_LIVE_SMOKE=1, --who and --why, the log outside the repository, the count of three from a
  > `smoke-switched-on HMLR_INSPIRE` line, the never-a-client check against CAPREBATE_DB or --not-a-client, and the one
  > line written PASS or NO whatever happens — all of it is runSmokeCommand's (src/integrations/connectors/test-lookups.ts), and only
  > the values asked about and the call itself are this file's.
  >
  > PUBLIC VALUES ONLY. The default point is the Treasury Buildings, whose Whitehall address is 70 Whitehall — the
  > Cabinet Office, the same building as SMOKE_DEFAULTS. Its British National Grid reference, TQ 30120 79956, is published
  > by Historic England in the National Heritage List for England, list entry 1267063 ("Treasury Buildings (Cabinet Office
  > and Privy Council Office)", Grade I, district City of Westminster), read 28 September 2026: easting 530120, northing
  > 179956 in metres (the TQ square begins at 500000 east, 100000 north). ONLY THE COUNCIL'S NAME LEAVES THIS SERVER, as
  > the file name in the download's address; the point stays here, and the polygon is found on this server.
  >
  > WHAT A PASS MEANS, AND NOTHING MORE. The council's file downloaded; every polygon in it read by the existing reader,
  > which refuses the whole file on one it cannot read — the shape check the one page asks for; and the one polygon
  > holding the point found. A NO says how far it got. THE FILE AND THE POLYGON ARE THROWN AWAY: no file store is given
  > (so nothing is kept in CAPREBATE_INSPIRE_STORE_DIR), nothing is stored through the one door, and the answer carries a
  > stage and a sentence, never the polygon, its identifier or a coordinate.
  >
  > THE SWITCH STAYS FALSE. BOUNDARY_FETCHING_SWITCHED_ON is read nowhere here and changed nowhere: this turns the fetcher
  > on for ONE call, in a command a person typed, the way smokeOne turns one register on in a map of its own. Both gates
  > are reported shut on the audit row, because a test lookup opens neither. test/phase151l.test.ts proves the shipped
  > constant is untouched, and test/phase150.test.ts allows this file, and only this file besides the site area function,
  > to name the fetcher.

## 28 Sept 2026: Phase 151i

### `src/core/app.ts`

- Line 99:

  > PHASE 151i follow-up 5: 'apply' (absent) builds the tables, as always. 'require-built' builds nothing and refuses a
  > database with a migration left (code E_NOT_BUILT): how a copy of the test website opens its lasting database, which
  > only the deploy's build step builds (api/index.mjs, prepareLasting).

### `src/core/audit.ts`

- Line 520:

  > PHASE 151i: how many times an append reads the chain again after another copy took its number.

### `src/core/db.ts`

- Line 40:

  > PHASE 151i: how long a handle on a file waits for another handle's write lock.

- Line 183:

  > PHASE 151i: a second handle on the same file waits this long for another's write lock, rather than failing at

- Line 302:

  > PHASE 151i follow-up 5, 28 September 2026: the migrations NOT yet applied here, read and never written. A copy of the
  > test website opens its lasting database with `schema: 'require-built'` (src/core/app.ts) and refuses one with any left,
  > because on 28 Sep 2026 two copies building one empty database at once left it half built, twice.

### `src/core/server.ts`

- Line 94:

  > PHASE 151i follow-up 5: see BuildOptions.schema. Absent builds the tables, as always.

- Line 102:

  > PHASE 151i: ONE PRIVATE STORE FOR EVERY COPY, instead of `documentRoot`. Absent is the folder, as before. Only
  > api/index.mjs passes it, and only when the lasting database is in use and a Blob store is connected
  > (src/shared/shared-objectstore.ts says why and how it stays private).

### `src/shared/objectstore.ts`

- Line 336:

  > ------------------------------------------------ where the bytes go
  > PHASE 151i, 28 September 2026. Everything above decides WHAT happens to a document: the key checked, an original
  > sealed before it is kept and refused without a key, a deletion proved, a write capability scoped to one key. The
  > four steps below are only WHERE the bytes go, and they are all a store may change. Here it is a folder on this
  > machine, exactly as before; src/shared/shared-objectstore.ts puts them in a private Vercel Blob store every copy of the
  > test website reaches, and inherits every rule above unchanged. Each step is given a key the public method above
  > has already checked.

## 28 Sept 2026: Phase 151j

### `src/core/audit.ts`

- Line 35:

  > Phase 151j: the steps between a right password and a session (src/core/sign-in.ts), and the super user's part.

### `src/core/auth.ts`

- Line 54:

  > PHASE 151j — WHO MUST GIVE A SECOND FACTOR. Lakhbir, 28 September 2026: every staff login; a client may choose to.
  >   STAFF   the rule, and the default: a staff login with no second factor set up must set one up at sign-in.
  >   OFF     no second step for anyone, and a temporary password is not asked to change - the setting the older
  >           test files pass, each saying so, because they test other things through a password sign-in. Never set
  >           in src/, api/ or a tool a person runs to use the system.
  >   STAFF_EXCEPT_INVENTED   (29 September 2026, Lakhbir: "stop it for the @example.invalid emails") STAFF for every
  >           login, except that one whose address is at the reserved domain example.invalid asks for no second step.
  >           That domain can never receive mail (RFC 2606), so only the invented seed logins carry it. Set by the test
  >           website ONLY (api/index.mjs), never by default and never for production. A temporary password is still
  >           asked to change.

- Line 80:

  > PHASE 151j. Absent is STAFF: the safe reading of a Deps built by hand.

- Line 133:

  > PHASE 151j: a password alone never skips a step. Only src/core/sign-in.ts walks them (the website and the JSON API).

- Line 162:

  > PHASE 151j — WHAT IS STILL TO DO BEFORE A SESSION, for a person whose password was right.
  >   NEW_PASSWORD   their password is a temporary one the super user gave them
  >   SETUP          they must give a second factor and have none set up (every staff login, under STAFF)
  >   VERIFY         they have one: an emailed code, or their authenticator app
  >   null           nothing: a session may be issued
  > A temporary password past its date is refused outright, with its own words: the password was right, so this
  > answers nothing about who has an account.

- Line 390:

  > PHASE 151j: a password the person chose replaces a temporary one. The second factor stays as it was.

### `src/core/mfa-seal.ts`

- Line 1:

  > THE AUTHENTICATOR APP'S SECRET, SEALED AT REST. Phase 151k, 28 September 2026.
  >
  > Phase 151j kept the shared secret of a person's authenticator app as text: `users.mfa_secret`, and while they set it
  > up `sign_in_steps.pending_secret`. Anybody who could read the database could then make that person's codes. So the
  > secret is now SEALED with AES-256-GCM under a key read the way every other key is read (src/core/secrets.ts): the name
  > CAPREBATE_MFA_KEY in the key file outside the repository (never a key file inside it), or on the test website its
  > own settings (api/index.mjs, TEST_DEPLOY_KEYS). The key is 32 bytes, written as base64:
  >     node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"
  >
  > THREE STATES, AND NOTHING SET UP TODAY STOPS WORKING:
  >   NONE   no key set. A new secret is kept as text, exactly as before this phase, and a text one is read.
  >   KEY    a good key. A new secret is sealed. A text one is still read - and sealed the next time it is used to sign
  >          in (src/core/sign-in.ts), or all at once by `node src/core/cli.ts seal-app-secrets`.
  >   BAD    a key is set but is not 32 bytes of base64. Nothing new is written with it, and it opens nothing: it refuses
  >          in words, because keeping a secret as text while somebody believes it is sealed is worse than saying so.
  > A SEALED SECRET WITHOUT ITS KEY IS REFUSED IN WORDS (the key removed, or changed): never read as text, never a crash.
  >
  > WHAT IT LOOKS LIKE: `cbmfa1:` then base64 of a 12-byte nonce, the 16-byte tag and the sealed bytes. The person's id
  > is bound in as additional data, so a sealed secret copied onto another person's row does not open. A text secret is
  > base32 and can never start with `cbmfa1:`, so the two forms are told apart without a column saying which.

### `src/core/router.ts`

- Line 1015:

  > PHASE 151j: the password first, then the steps it still needs - a session only when none is left.

- Line 1034:

  > PHASE 151j — THE STEPS BETWEEN A RIGHT PASSWORD AND A SESSION (src/core/sign-in.ts).

- Line 1075:

  > PHASE 151j — A FORGOTTEN PASSWORD: an emailed link, single-use, 30 minutes (src/core/auth.ts). The page says the same
  >      thing whether or not the address has an account, so it cannot be used to find out who has one.

- Line 1110:

  > PHASE 151j — A PERSON'S OWN SECOND STEP: set it up, change it, or (a client only) turn it off. A client's page is
  >      under /portal and a member of staff's under /staff, so each header links only inside its own application.

- Line 2161:

  > PHASE 151j: the cookies of a sign-in - the part-way step's, and the session's.

### `src/core/server.ts`

- Line 92:

  > PHASE 151j: see BuildOptions.twoFactor. Absent is 'staff'.

### `src/core/staff.ts`

- Line 559:

  > PHASE 151j (Lakhbir, 28 Sep 2026): the system makes a TEMPORARY password, shown once, here, to hand over. The
  >        person chooses their own at their first sign-in, and sets up their second step. Nobody types a password here.

- Line 581:

  > PHASE 151j: the super user gives somebody a new temporary password (a forgotten one, or none to hand), or clears
  >      their second step (a lost phone). Either ends their sessions.

- Line 1389:

  > PHASE 151j: the temporary password, shown ONCE, to be handed over by the super user. Never stored in clear.

### `src/core/totp.ts`

- Line 1:

  > AUTHENTICATOR-APP CODES — RFC 6238 (TOTP) over RFC 4226 (HOTP). Phase 151j, 28 September 2026.
  >
  > The standard every authenticator app speaks (Google Authenticator, Microsoft Authenticator, 1Password and the rest):
  > a shared secret, HMAC-SHA1, a 30-second step, six digits. Written here on node:crypto rather than taken from a
  > package, because it is thirty lines and the RFC's own test vectors (in test/phase151j.test.ts) prove it.
  >
  >   newSecret        20 random bytes, base32 - what the person's app is given, by QR code or typed in
  >   otpauthUri       the address a QR code carries: otpauth://totp/<issuer>:<account>?secret=...&issuer=...
  >   codeAt           the six digits for one time step
  >   verifyCode       a code checked against the step before, the step now and the step after (a phone's clock may
  >                    be up to thirty seconds out), and NEVER a step at or before the last one accepted, so a code
  >                    seen over someone's shoulder cannot be used again. Returns the step it matched, or null.

## 28 Sept 2026: Phase 151k

### `src/core/audit.ts`

- Line 38:

  > PHASE 151k: `node src/core/cli.ts seal-app-secrets` sealed the app secrets still kept as text - a count, never a secret.

### `src/core/auth.ts`

- Line 1:

  > Authentication: login, sessions, logout, password change, password reset.
  >
  > THE RULES THIS FILE EXISTS TO KEEP, each of which has a test:
  >
  >   A password is never logged, never returned, never stored in clear.
  >   Sessions are httpOnly, secure, sameSite, ROTATED ON PRIVILEGE CHANGE, and
  >     revocable server-side — which is real revocation, not an expiry wish.
  >   Login and reset are rate-limited.
  >   FAILURE MESSAGES ARE GENERIC. "those details did not match", never "no such
  >     user" — the second is an account-enumeration oracle, and so is a login
  >     that returns faster for an unknown address than for a wrong password.
  >   A reset token is single-use and expiring, and only its HASH is stored.
  >   PHASE 151j: A PASSWORD ALONE NEVER OPENS A STAFF ACCOUNT. `login` issues a session only when nothing is left to
  >     do; a temporary password, or a second factor to set up or give, is a step, and `login` refuses with
  >     E_SECOND_STEP rather than skip it. The steps are walked only by src/core/sign-in.ts - by the website and, since
  >     Phase 151k, by the JSON API's /api/login and /api/login/step routes (src/core/server.ts), on the same functions.

### `src/core/cli.ts`

- Line 251:

  > PHASE 151k. The key comes from the key file (src/core/secrets.ts), never from this command line. With no key set nothing
  >        changes; a key that is not right changes nothing and says so. Never prints a secret or the key.

### `src/core/secrets.ts`

- Line 44:

  > PHASE 151k: not a connector - the sign-in's own key, which seals each person's authenticator app secret.

### `src/core/sign-in.ts`

- Line 193:

  > PHASE 151k: the new secret is sealed before it is written, where a key is set; a key that is set and not right refuses.

- Line 235:

  > PHASE 151k: the app's secret, opened BEFORE a code is counted - a server that cannot open it is not the person's

- Line 273:

  > PHASE 151k: a secret kept as text from before a key was set is sealed now, on the one occasion it is in hand.

### `src/integrations/email/email-provider.ts`

- Line 549:

  > PHASE 151k — A SIGN-IN CODE OR A RESET LINK IS NOT KEPT ONCE IT HAS GONE. Until it is sent its body is the email; once
  > it has really been sent (this file, `dispatchOutbox`, which only runs while EMAIL_SENDING is on) the code or the link
  > in it would otherwise sit in `outbox.body` for good, readable by anybody who can read the database. So the body of a
  > SENT email of these kinds is replaced by this one sentence, and who it went to, when, the subject and the kind stay.
  > Migration 058 lets exactly this edit through the outbox's never-edited rule and no other.
  > WHILE SENDING IS OFF NOTHING HERE RUNS: a row saved then is never sent, and on the test website it is the only way to
  > read a sign-in code or a reset link (api/index.mjs prints the outbox to the function log). The Developer Spec says so.

### `src/integrations/email/email.ts`

- Line 46:

  > SIGN_IN_CODE — Phase 151k: a six-digit sign-in code (src/core/sign-in.ts). With PASSWORD_RESET, its words are taken
  >  out of the outbox once it has really been sent (src/integrations/email/email-provider.ts, blankSentSecrets).

## 28 Sept 2026: Phase 151l

### `src/integrations/connectors/test-lookups.ts`

- Line 1:

  > THE TEST LOOKUPS LAKHBIR ALLOWED, AND THE FIVE CONDITIONS HE ALLOWED THEM ON. Phase 151g, 28 September 2026.
  >
  > Word question 170, "Can we make a few small, logged test lookups to check a data connector works?", was answered
  > on 25 September 2026 by Lakhbir Dhillon, Head of Business Development (the director is Jalil Ahmed; corrected
  > 4 October 2026, Phase 153c): yes, on five conditions, in his words —
  >
  >   1. no more than three lookups per connector each time it is switched on;
  >   2. never a client's property;
  >   3. keep only pass or fail, the time and the connector;
  >   4. log who ran it and why;
  >   5. never use it to show the product to clients.
  >
  > Until this file the smoke test (src/integrations/connectors/smoke.ts, Phase 146g) enforced none of them: it printed a warning,
  > kept its audit row in a database in memory that vanished with the run, and would take a client's postcode if one
  > were typed. This file is what the `smoke` command now runs, and each condition is a REFUSAL, not a sentence:
  >
  >   WHO AND WHY        --who and --why are required; an empty one, or one that is really the next flag, is refused.
  >   A LOG THAT LASTS   one JSON line per lookup in a file OUTSIDE the repository — CAPREBATE_TEST_LOOKUP_LOG, or
  >                      ~/.caprebate-test-lookups.jsonl — refused inside the tree the way src/core/secrets.ts refuses a key
  >                      file there. A line holds the connector, the time, PASS or NO, who and why — and, where it was
  >                      given, that --not-a-client was. NEVER THE VALUES ASKED, NEVER THE ANSWER: `lookupLine` builds
  >                      every line from those fields and nothing else.
  >   THREE PER SWITCH-ON  a connector's lookup lines are counted from its last "switched on" line, and a fourth is
  >                      refused. `smoke-switched-on` is the only thing that writes a "switched on" line, and so the only
  >                      way the count starts again. A connector with no "switched on" line has not been switched on,
  >                      and its first lookup is refused until a person records that it was.
  >   NEVER A CLIENT     with CAPREBATE_DB set, a postcode, company number or company name matching any business,
  >                      property or lead held there is refused; the refusal names the field, never the value. Without
  >                      it, anything but SMOKE_DEFAULTS is refused unless --not-a-client is given, and the line says so.
  >   NOT A DEMONSTRATION  said on every run, before anything else, and the why is on every line.
  >
  > A LOOKUP THAT CANNOT BE LOGGED IS NOT MADE. The log is read, and opened for appending, before the call; a log that
  > cannot be read line for line (so the count cannot be known) refuses, because an unknown count is not a count under
  > three. A lookup that throws is still logged, as NO, before the error goes on.
  >
  > PHASE 151l, 28 SEPTEMBER 2026: THE LAND BOUNDARY IS A SOURCE HERE TOO. `smoke HMLR_INSPIRE` downloads one council's
  > file under the same five conditions, on the same log, through the same refusals below — only the values asked about
  > (a point and a council, not a company and a postcode) and the call itself are src/integrations/connectors/boundary-test-lookup.ts's.
  > `smoke-switched-on HMLR_INSPIRE` starts its count of three like any other connector's.
  >
  > NOTHING HERE READS THE KEY FILE OR REACHES THE NETWORK. The caller hands in the transport and the key store:
  > src/core/cli.ts hands in the live ones, and the tests hand in recorded answers.

- Line 85:

  > EVERY CONNECTOR A TEST LOOKUP CAN BE RUN FOR: the registers the smoke test knows, and (Phase 151l) the land boundary
  > download. One list, so `smoke` and `smoke-switched-on` can never disagree about what a connector is.

## 28 Sept 2026: Phase 151m

### `src/core/audit.ts`

- Line 40:

  > PHASE 151m: recovery codes made (a count and why, never a code), and one used (how many are left, never the code).

### `src/core/recovery-codes.ts`

- Line 1:

  > RECOVERY CODES: TEN ONE-USE CODES, SO A PERSON WHO LOSES THEIR PHONE CAN STILL SIGN IN. Phase 151m, 28 September 2026.
  >
  > Lakhbir, 28 September 2026 (Word question 232, closed): yes. Until now a person who lost their phone had to ask the
  > super user to reset their second step.
  >
  > WHAT A CODE IS. Ten characters from a set of 32 with no look-alikes (no 0/O, no 1/I/L, one case only, so it can be
  > read out and typed either way), in two groups of five: 50 bits each. Ten are made at a time.
  >
  > HOW IT IS KEPT. Only as a hash, in `recovery_codes` (migration 059): scrypt of the code, salted with the person's own
  > id, so a code's hash means nothing on another login and a copy of the database is no quicker to try than the
  > sign-in page. A code is never kept as text, never written to a log line or an audit row, and never emailed: it is
  > shown once, on the page (or in the API's answer) that made it.
  >
  > WHO CALLS THIS. Only src/core/sign-in.ts, whose functions the website (src/core/router.ts) and the JSON API
  > (src/core/server.ts) both call. There is no second implementation.

### `src/core/router.ts`

- Line 1036:

  > PHASE 151m: ?use=recovery draws the VERIFY step as the recovery-code form.

- Line 1053:

  > PHASE 151m: a second step just set up shows its recovery codes, once, here - they are kept nowhere as text, so

- Line 1120:

  > PHASE 151m: "Make new recovery codes" - ten new ones, shown once on this answer, and every unused old one gone.

- Line 2218:

  > PHASE 151m: the recovery codes - how many are left, a warning with two or fewer, and a button for new ones.

### `src/core/server.ts`

- Line 277:

  > PHASE 151k — THE JSON API WALKS THE SAME STEPS AS THE WEBSITE, through the same functions (src/core/sign-in.ts).
  >        The password answers 202 with what is still to do and a step token, NEVER a session; each step is a POST to
  >        /api/login/step/<new-password | method | code | resend> carrying that token in the body (never the address);
  >        POST /api/login/step with only the token says where the step stands. A session - the cookie and 200 - comes only
  >        when the last step is done. The limits are the website's, because they are the same rows: 15 minutes a sign-in,
  >        5 wrong codes, a code once.
  >        PHASE 151m — RECOVERY CODES, on the same functions. The answer to the step that sets a second step up carries
  >        `recovery_codes` ONCE (ten; nothing keeps them as text, so they cannot be asked for again); a session's answer
  >        carries `recovery_codes_left` for a person with a second step. At the VERIFY step a recovery code goes to its own
  >        route, POST /api/login/step/recovery with `step_token` and `code` - not /code, so a six-digit code and a recovery
  >        code are never guessed apart. It shares the 5 wrong codes. Signed in, POST /api/account/recovery-codes makes ten
  >        new ones (every unused old one thrown away) and answers them once.

- Line 346:

  > PHASE 151m: the same function as the website's button

### `src/core/sign-in.ts`

- Line 1:

  > SIGNING IN: THE STEPS BETWEEN A RIGHT PASSWORD AND A SESSION. Phase 151j, 28 September 2026.
  >
  > WHAT LAKHBIR DECIDED, 28 September 2026:
  >   - the super user creates a person's account with a TEMPORARY password, shown once, good for seven days; at the
  >     first sign-in the person chooses their own password and sets up a second factor;
  >   - EVERY STAFF LOGIN gives a second factor at every sign-in; a client may choose to;
  >   - the second factor is a CODE BY EMAIL or an AUTHENTICATOR APP (no text messages);
  >   - a forgotten password is reset by an emailed link;
  >   - the super user can give someone a new temporary password, or clear their second factor so they set it up again.
  >
  > HOW. The password is checked by `verifyPassword` (src/core/auth.ts), which issues nothing. `nextSignInStep` says what is
  > left. If something is, a row in `sign_in_steps` holds the sign-in part way, and the browser holds a random token for
  > it in an httpOnly cookie (only its hash is stored). Each step is short-lived, counts its wrong codes, and finishes
  > once. Only a finished step issues a session (`startSession`). `login` itself refuses while a step is left, so the
  > JSON API cannot be used to go round this.
  >
  > WHAT IS NEVER KEPT OR PRINTED: a password, a code, a token or an app's secret, in any log line or audit row. An
  > emailed code is kept only as a hash, for ten minutes. The app's secret is shown to the person once, as a QR code
  > and as text, while they set it up.
  >
  > PHASE 151k, 28 September 2026:
  >   - THE JSON API WALKS THE SAME STEPS. `/api/login` and `/api/login/step/...` (src/core/server.ts) call these same
  >     functions, with the step's token in the request body instead of the `cb_step` cookie; `describeStep` says what a
  >     step needs, for the page and for the API alike. There is no second implementation.
  >   - THE APP'S SECRET IS SEALED where a key is set (src/core/mfa-seal.ts, CAPREBATE_MFA_KEY): in `pending_secret` while
  >     it is set up and in `users.mfa_secret` after. A text secret from before still works, and is sealed the next time
  >     it signs somebody in.
  >   - A SIGN-IN CODE'S EMAIL HAS ITS OWN KIND, SIGN_IN_CODE, so that once it has really been sent its words can be
  >     taken out of the outbox (src/integrations/email/email-provider.ts, blankSentSecrets).
  >
  > PHASE 151m, 28 September 2026 — RECOVERY CODES (src/core/recovery-codes.ts; Lakhbir, Word question 232, closed):
  >   - TEN ARE MADE WHEN A SECOND STEP IS SET UP, and the answer to that step carries them ONCE (`recovery_codes` on
  >     SESSION or ACCOUNT_DONE), for the page and the API to show. "Make new recovery codes" (`makeNewRecoveryCodes`)
  >     makes ten more and throws every old one away. Only a hash of each is kept.
  >   - AT THE VERIFY STEP a recovery code is taken in place of the app or email code (`submitRecoveryCode`): it counts
  >     toward the same five wrong codes, works once, is audited as RECOVERY_CODE_USED with how many are left (never the
  >     code), and the person is emailed that one was used and how many remain (kind RECOVERY_CODE_USED, which carries
  >     no code, so it is not one of the kinds blankSentSecrets empties).
  >   - WHAT CLEARS THEM: setting up a new second step, the super user's "Reset second step", and a client turning
  >     theirs off. A new temporary password does not.

- Line 76:

  > PHASE 151m: `recovery_codes` is set ONCE, on the answer to the step that set a second step up - the only time they
  > exist as text. `recovery_left` is how many unused codes a person with a second step has, after a sign-in.

- Line 151:

  > After a step: the next one, or the end. PHASE 151m: `codes` are the recovery codes a SETUP just made, passed on once.

- Line 213:

  > ONE TRY AT A CODE, COUNTED - an app or email code, or (Phase 151m) a recovery code: they share the five. Past the
  > fifth, the sign-in ends and the answer is GONE.

- Line 266:

  > PHASE 151m: a new second step, new recovery codes - every old one goes, and the ten new ones are shown once.

- Line 282:

  > PHASE 151m — A RECOVERY CODE, IN PLACE OF THE APP OR EMAIL CODE, at the VERIFY step only (setting a step up needs the
  > step itself). It counts toward the same five wrong codes and works once. The audit row and the email say how many
  > are left, and never the code.

- Line 325:

  > PHASE 151m: no second step, no recovery codes

- Line 331:

  > PHASE 151m — "MAKE NEW RECOVERY CODES", from the person's own account: ten new ones, shown once, and every unused old
  > one thrown away. Only for a person who has a second step.

- Line 344:

  > PHASE 151m: how many unused recovery codes this person has.

- Line 395:

  > PHASE 151m: the reset takes the recovery codes with it

- Line 409:

  > PHASE 151k — WHAT A STEP NEEDS NEXT, ONCE, for the page below and for the JSON API (src/core/server.ts). Undefined when the
  > token opens no step. `needs` is what the person does now:
  >   CHOOSE_PASSWORD   type a password of their own, twice
  >   CHOOSE_METHOD     choose EMAIL or APP
  >   ADD_APP           add the key to their app (shown here, once, while they set it up), then give a code from it
  >   GIVE_CODE         give the code from their email or their app
  > `refused` is set when the app's secret cannot be opened on this server (src/core/mfa-seal.ts); it is said in words.
  > PHASE 151m: `recovery_code` is true where a recovery code may be given instead (the VERIFY step): the page's "Use a
  > recovery code instead", the API's /api/login/step/recovery.

- Line 453:

  > PHASE 151m: `use` 'recovery' draws the VERIFY step as the recovery-code form ("Use a recovery code instead").

- Line 520:

  > PHASE 151m — THE RECOVERY CODES, SHOWN ONCE: on the page after a second step is set up, and after "Make new recovery
  > codes". Nothing keeps them as text, so this page cannot be drawn again: the person saves or prints it now.

- Line 541:

  > PHASE 151m: how many recovery codes are left, in words, for "Your second step" and the page after sign-in.

### `src/integrations/email/email.ts`

- Line 50:

  > RECOVERY_CODE_USED — Phase 151m: a recovery code was used to sign in, and how many are left. It carries NO code, so
  >  it is not one of the kinds blankSentSecrets empties: its words stay, as every other email's do.

## 28 Sept 2026: Phase 152

### `src/core/db.ts`

- Line 313:

  > Migrations, applied in filename order and recorded so they run once.
  >
  > Deliberately dumb: no down-migrations, no checksums-with-auto-repair. A
  > migration that has run is recorded; a new one runs; anything else is a
  > person's decision, not a framework's.
  >
  > PHASE 152 (the sweep, 28 September 2026): A FILE AND ITS RECORD LAND TOGETHER OR NOT AT ALL. Until now a file ran,
  > and THEN its schema_migrations row was written, so a start cut off between the two left the file's tables made and
  > unrecorded - and every later start failed on them ("table claim_facts already exists", the test website's first
  > start on Turso, 28 Sep 2026, stopped by a 30-second limit). Now the record is written inside the same transaction as
  > the file's own statements, so a cut-off start leaves either both or neither, and the next start finishes the job.
  > Two shapes, and only two:
  >   - a PLAIN file: it and its record run in one transaction here (Db.tx);
  >   - a file that RUNS ITS OWN TRANSACTION (007, 011, 014, 016 to 019, 049, 053, 054, 056): `PRAGMA foreign_keys = OFF;`,
  >     a line `BEGIN;`, its body, a line `COMMIT;`, `PRAGMA foreign_keys = ON;`. The pragma cannot change inside a
  >     transaction and a transaction cannot begin inside another, so it is split at its own BEGIN and COMMIT: the pragma
  >     runs outside, the body AND the record run in one transaction, and the closing pragma always runs after.
  > Anything else - two BEGINs, a COMMIT with no BEGIN, a transaction statement in a plain file, anything but the one
  > pragma around a file's own transaction - is REFUSED with a sentence, never guessed at.

### `src/integrations/email/email-provider.ts`

- Line 558:

  > Phase 152 (the sweep, 28 September 2026): ACCOUNT_VERIFY too. The email that confirms a new client login carries a
  >    link that works once and for 24 hours (src/core/signup.ts), the same sort of secret; only its hash is kept in
  >    client_signups, so the link still works after its words leave the outbox. The sentence now names all three.
  >    Migration 060 lets this sentence through for the three kinds; a row 058 blanked keeps 058's sentence for good.

## 28 Sept 2026: Phase 153

### `src/shared/components.ts`

- Line 228:

  > PHASE 153 (28 September 2026) - THE PRIVACY NOTICE AT THE ADDRESS QUESTION, BUILT AND SWITCHED OFF.
  > The free register lookups rest on legitimate interests, and CB_REGISTRY.precondition says they wait on "a published
  > privacy notice reachable from the address question". This is that link. It is drawn only while that same switch is
  > on - there is no second gate - and it informs; it asks nothing (no tick box: the basis is legitimate interests, not
  > consent - standing rule 13(b)). The site file's funnel draws the same words (noticeAtAddress, harness Suite Q7).

## 28 Sept 2026: Phase 161a

### `src/shared/shared-objectstore.ts`

- Line 1:

  > PHASE 151i, 28 September 2026 — THE DOCUMENT STORE EVERY COPY OF THE TEST WEBSITE REACHES. BUILT AND SWITCHED OFF.
  >
  > Phase 151e gave the test website one lasting database (Turso) for every copy of it. Its uploaded documents still went
  > to a folder on each copy's temporary disk, so a document uploaded through one copy was missing from the next while its
  > row said it was there. This store keeps them in ONE PRIVATE VERCEL BLOB STORE instead. api/index.mjs uses it only when
  > the lasting database is in use AND a Blob store is connected (`sharedDocumentStore` there); anything less keeps the
  > temporary folder, exactly as before.
  >
  > WHAT CHANGES AND WHAT DOES NOT. `SharedObjectStore` IS an `FsObjectStore`: every caller keeps the type it was written
  > against, and every rule stays where it was — the key checked, an original sealed (AES-256-GCM) before it is kept and
  > refused with no key, a deletion proved, a write capability scoped to exactly one key. It replaces only the four
  > steps that say where the bytes go (`readBytes`, `writeBytes`, `copyBytes`, `removeProven`). The port
  > (`ObjectStore` in the upload handler) already answers with promises, so no caller changed to suit a store.
  >
  > PRIVATE, NEVER A PUBLIC ADDRESS. Read from Vercel's docs, 28 Sep 2026 (vercel.com/docs/vercel-blob/private-storage):
  > a private store's objects "require authentication for all read and write operations"; its address,
  > https://<store>.private.blob.vercel-storage.com/<path>, "is not publicly accessible". And here:
  >   - every call says access: 'private' — a PUBLIC store refuses it, so a store created public by mistake fails closed;
  >   - the address Blob gives back on a write is thrown away, never stored, logged or sent;
  >   - a document leaves only through the routes that already authorise each request (the kept original's download,
  >     the photograph), which read it here server-side. The upload link is still OURS (`/upload/put?token=…`), never
  >     a Blob address, and still scoped to one key;
  >   - every read skips Blob's cache (useCache: false) — the latest bytes, and nothing served from a copy on the way;
  >   - every write says application/octet-stream, so nothing is ever rendered as a page, and the least cache time
  >     Blob allows (60 seconds). Blob's docs: a deleted object "may take up to one minute" to leave its cache. That
  >     cache is behind the same authentication; the Developer Spec's "Built by Phase 151i" section says so plainly.
  >
  > ONE UPLOAD LINK SECRET FOR EVERY COPY. A link issued by one copy is sent back to whichever copy Vercel picks. With a
  > secret made fresh in each process, the second copy refuses a good link. So the shared store signs links with a secret
  > derived (HKDF-SHA256) from the lasting database's token, which every copy already holds and nothing else sees. A new
  > database token ends links issued before it — they last fifteen minutes anyway.
  >
  > THE BLOB CLIENT IS A PORT, LIKE THE STORE. `BlobClient` is the four things this store asks of Blob, in our words.
  > `vercelBlobClient` is the real one: @vercel/blob, loaded only when the store is switched on, so the memory and folder
  > modes never load it. PHASE 161a, 4 Nov 2026 (the ITRoadway audit): the back end lists @vercel/blob for the tests only,
  > so the live install (npm ci --omit=dev) does not contain it; the root package.json, which builds only the test
  > website, keeps it; and api/index.mjs keeps the folder, and says why, if a store is set but the package is missing. The tests hand in a client that answers as Blob's documented SDK does, with no network.

## 29 Sept 2026: Phase 151j

### `src/core/app.ts`

- Line 93:

  > PHASE 151j: who must give a second factor. Absent is 'staff', the rule. 'off' is for the older tests only.
  >  'staff-except-invented' (29 Sep 2026) is for the test website only: see TwoFactorPolicy in src/core/auth.ts.

## 29 Sept 2026: Phase 153b

### `src/integrations/connectors/company-search.ts`

- Line 1:

  > "FIND MY COMPANY" AT THE START OF THE ASSESSMENT — a search of Companies House by name. 29 September 2026.
  >
  > Lakhbir: "with the am i eligible we should be asking for address and company name", and, for the first screen,
  > the company name with a search. The person types their business's name and presses "Find my company"; the SERVER
  > asks Companies House (its public search, /search/companies) and the page lists up to eight companies to choose from,
  > or "none of these". The page itself makes no call: every search is a form sent to this server, so the key stays here.
  >
  > WHAT IS KEPT FROM A RESULT, AND ONLY THAT: the company's name, its number, its status, its registered office's
  > POSTCODE and (Phase 159g) the type of its latest accounts — the source register's permitted fields for CH_COMPANY (company_number, company_status,
  > registered_office_postcode), and the name the person is choosing as their own. Never an officer, a director or an
  > address line. THE COMPANY'S TYPE ONLY WITH COMPANY_TYPE_FROM_REGISTER ON (below, Phase 153b, Word question 198): the
  > register now lists `company_type` as a PROPOSED permitted field for the data protection officer to agree, and while
  > the switch is off it is not kept and the assessment asks the legal form, exactly as before.
  >
  > SWITCHED OFF, LIKE THE POSTCODE CHECK (postcode-check.ts), until three things are true: the free-tier gate is open
  > (the privacy notice published and linked), Companies House is named in that notice for THIS use (a visitor's own
  > search, before any engagement), and this switch is on. And the key must be in the key file. Until then the screen
  > has no "Find" button and the name is typed; nothing is sent.

## 29 Sept 2026: no phase named

### `src/core/audit.ts`

- Line 438:

  > 29 Sep 2026: an enquiry refused by the contact form's security check (src/integrations/connectors/turnstile.ts). Nothing kept.

### `src/core/router.ts`

- Line 167:

  > STRESS TEST, 29 SEP 2026: the addresses where a HEAD is answered as a GET, because their GET changes nothing.

- Line 309:

  > 29 Sep 2026: the public header says what the home page's button says (Lakhbir: "Am I eligible?").

- Line 347:

  > STRESS TEST, 29 SEP 2026: A HEAD asks for a GET's headers without its body (Node drops the body itself). Link
  >      checkers, uptime monitors and link previews send it, and got a 401. Answered as a GET only where a GET changes
  >      nothing: the home page, the files, sign-in, the notices. Anywhere else a HEAD meets the page for unknown addresses.

- Line 500:

  > STRESS TEST, 29 SEP 2026: the house mark as the browser tab's icon. A browser asked for /favicon.ico on every page

- Line 504:

  > STRESS TEST, 29 SEP 2026: THE PRIVACY NOTICE AND THE PUBLIC NOTICES ARE NOT PUBLISHED YET (03-app's notices page is a
  >      draft with facts not set, and the privacy notice waits on the data protection officer), but every page links to them
  >      and the links answered 401. Until they are published, a page that says so and how to reach us - nothing more.

- Line 568:

  > STRESS TEST, 29 SEP 2026: the enquiry's thank-you page, reloaded or bookmarked, is a GET; it goes back to the form.

- Line 1248:

  > STRESS TEST, 29 SEP 2026: AN ADDRESS NOBODY OWNS. It fell through to the JSON API, which asked for a login and
  >      answered 401 "those details did not match" to a person who had only mistyped an address. A GET or HEAD outside
  >      /api now gets a page that says so. The JSON API keeps its own answers: every one of its addresses is under /api.

- Line 1647:

  > 29 Sep 2026: the box is filled from the first screen; left empty, the first screen's name stands.

- Line 2551:

  > STRESS TEST, 29 SEP 2026: every enquiry answered 500 on the test website, and nothing else there differs from a
  >      local run but the request. The address is now read so that a request with no socket cannot throw.

### `src/core/secrets.ts`

- Line 46:

  > 29 Sep 2026: the contact form's security check (src/integrations/connectors/turnstile.ts).

### `src/core/server.ts`

- Line 224:

  > STRESS TEST, 29 SEP 2026: SAID IN THE LOG, which no 500 was before, so a fault on the test website can be found.
  >          The kind of error and the line of code only: never its message, which could carry what a person typed.

- Line 431:

  > 29 Sep 2026: the contact form's security check, said at start-up

### `src/integrations/connectors/turnstile.ts`

- Line 1:

  > THE CONTACT FORM'S SECURITY CHECK, ON THE SERVER — Cloudflare Turnstile. 29 September 2026.
  >
  > The home page (Caprebate/09-app/site/home.html) runs Cloudflare's check in the visitor's browser and posts its answer
  > with the enquiry as `cf-turnstile-response`. A check that runs only in the browser stops nothing: a script posts to
  > /enquiry without ever loading the page. So before an enquiry is kept, this asks Cloudflare whether that answer is
  > real (its "siteverify" call), through src/integrations/connectors/http.ts like every other outside call.
  >
  > THREE STATES, EACH SAID IN WORDS:
  >   · NO SECRET KEY in the key file (TURNSTILE_SECRET_KEY): nothing is checked and the enquiry is kept as before. The
  >     start-up log says so, and the enquiry's audit line records "not_checked".
  >   · A KEY, BUT THE TRANSFER IS NOT APPROVED. Cloudflare is a US company, and src/integrations/connectors/sources.ts refuses a call
  >     outside the UK and EU until the data protection officer approves it (`international_transfer_approved`). Until
  >     then nothing is sent, nothing is checked, the enquiry is kept, and the log and the audit line say why. Approving
  >     it is one word in sources.ts, and it is Sadique's decision, not a build one.
  >   · A KEY AND APPROVAL: the answer is checked. No answer, an answer Cloudflare rejects, or no reply from Cloudflare
  >     each REFUSES the enquiry: nothing is kept, the audit says which, and the person is told in plain words.
  >
  > THE SITE KEY (TURNSTILE_SITE_KEY) is public by design — it is printed in the page — and is put into the home page's
  > script when it is served (src/web/home-site.ts). Without one, the page keeps Cloudflare's published TEST key.
  > No key is ever printed: the secret goes only into the call's body, which no record keeps.

## 30 Sept 2026: Phase 156

### `src/integrations/connectors/zoom.ts`

- Line 1:

  > VIDEO CALLS THROUGH ZOOM — a meeting made for each call, and joined inside our own pages. 30 September 2026.
  >
  > Lakhbir: "with the video call link this should be sent automatically, and i feel zoom would be best for this as we
  > can run it via our platform, is there a way to have zoom embeded on our back end so its done though there?"
  >
  > TWO ZOOM APPS, BOTH MADE IN THE ZOOM APP MARKETPLACE ON OUR OWN ACCOUNT (developers.zoom.us, read 30 Sep 2026):
  >   · a SERVER-TO-SERVER OAUTH app — ZOOM_ACCOUNT_ID, ZOOM_CLIENT_ID, ZOOM_CLIENT_SECRET. The server swaps them for an
  >     hour's token and makes, moves and cancels the meeting for each video call, and asks for the host's start token
  >     (ZAK) when a member of staff opens the call. Scopes: meeting:write:meeting:admin, meeting:update:meeting:admin,
  >     meeting:delete:meeting:admin, and user:read:token:admin — the first live call (30 Sep 2026) showed the start token
  >     needs that one ("user:read:zak:admin" is not enough: Zoom answered 4711).
  >     PHASE 153f, 4 Oct 2026: to read how long a call lasted and who came, two more - added by Lakhbir and used by
  >     zoomPastCall since PHASE 156d, 5 Oct 2026:
  >     meeting:read:past_meeting:admin (GET /v2/past_meetings/{meetingId}: its duration) and
  >     meeting:read:list_past_participants:admin (GET /v2/past_meetings/{meetingId}/participants). Phase 156 A6.
  >     EACH CALL HAS ITS OWN HOST (Phase 153f): the meeting is made under the assigned member of staff's email, which
  >     must be a user on our Zoom account (a paid licence each, for calls over 40 minutes).
  >   · a MEETING SDK app — ZOOM_SDK_CLIENT_ID, ZOOM_SDK_CLIENT_SECRET. Its secret signs each join ON THIS SERVER (a JWT,
  >     HMAC-SHA256: appKey, mn, role, iat, exp, tokenExp), so the meeting runs inside our page with Zoom's own Web SDK.
  >     Meetings on our own account need no Zoom review; since 2 March 2026 only joining OTHER accounts' meetings does.
  > The host is a user on our account (ZOOM_HOST_EMAIL, else the account's owner). Calls are booked for an hour
  > (SLOT_MINUTES). A FREE Zoom plan stops a meeting at 40 minutes, and for testing that is accepted (Lakhbir, 30 Sep
  > 2026: "leave the time for having it free at 40 mins but each appointment should be 1 hour"); a paid licence lifts it.
  >
  > PHASE 156d, 5 October 2026 — THE FREE ZOOM PLAN, ON PURPOSE. Lakhbir: "yes change 156d so i dont pay", and "right now
  > i dont need to add additonal staff contact@caprebate is enough". So every call is hosted by contact@ (ZOOM_HOST_EMAIL),
  > a call stops at 40 minutes, and Zoom keeps no recording. ZOOM_PLAN says which plan we are on: absent, or anything but
  > "pro" (or "paid", "business"), is the free plan (`zoomPlanIsFree`). On the free plan a walkthrough call does not ask
  > Zoom to record to its cloud, and the screens and the invitation say the 40 minutes plainly. Setting ZOOM_PLAN=pro, when
  > a paid licence is bought, brings the cloud recording back and takes the 40-minute line away.
  >
  > NOTHING HAPPENS UNTIL BOTH ARE TRUE, each said in words by `zoomMissing`: the five keys are in the key file, and
  > the transfer is approved (sources.ts, ZOOM_OAUTH and ZOOM_API: Zoom is a US company). The transfer was approved for
  > testing on 30 September 2026 (Sadique Maskeen, relayed by Lakhbir). Without the keys no meeting is made, the booking
  > stands, and the back office says "send them a link", as before.
  >
  > 1 OCT 2026 — ONLY THE TEST WEBSITE CALLS ZOOM. A copy on Lakhbir's Mac (a demo server reading the real key file) booked
  > a test call from the Communication tab and made a REAL meeting on our Zoom account. So a third thing must be true,
  > said in words by `zoomPlaceRefusal`: the app is the deployed test website (Vercel says so: VERCEL=1, VERCEL_ENV
  > production or preview, and VERCEL_URL set), OR the copy was started with CAPREBATE_LOCAL_ZOOM=1, for when Lakhbir
  > really wants to try Zoom on his own computer. A test's recorded answers reach nobody, so they are never refused.
  >
  > WHAT IS SENT TO ZOOM: the time, the length and the words "Cap Rebate call". Never the client's name, email or number.
  > No key is ever printed, logged or put in a page; a join signature and a ZAK go only to the one person joining.

## 30 Sept 2026: no phase named

### `src/core/app.ts`

- Line 130:

  > 30 Sep 2026: sending is asked at the moment each email is saved, of the switch and of THIS app's key store (read

### `src/core/audit.ts`

- Line 380:

  > 30 Sep 2026: WhatsApp with each client (src/web/whatsapp.ts). Sent, or not sent and why; received and filed (or left
  > for a person to file); a webhook body refused because Meta's signature did not hold; filed by hand. Ids, counts and
  > outcomes only — NEVER a number or the words.

### `src/core/backoffice.ts`

- Line 453:

  > 30 Sep 2026: a video call holds a time too (booksATime), so one where no time suited can be given one.

- Line 501:

  > 30 Sep 2026: a VIDEO call's invitation is sent by the route once its Zoom meeting is made, so it carries the link.

### `src/core/router.ts`

- Line 390:

  > 30 Sep 2026: the join pages' one script (src/web/video-call-script.ts).

- Line 434:

  > 30 Sep 2026: THE CLIENT'S JOIN PAGE, /call/<token>. The token is the only key: 64 hex characters, made when the
  >      meeting was made and sent only to the client. It opens from half an hour before the call until an hour after.

- Line 661:

  > 30 SEP 2026: WHATSAPP — THE ADDRESS META CALLS (src/web/whatsapp.ts). No login: Meta has none. GET is Meta checking
  >      the address with our verify word; POST carries messages and statuses, believed only under Meta's signature.

- Line 782:

  > 30 Sep 2026: the assessment opens on stage 1 of the four-stage funnel (src/web/funnel4.ts).

- Line 871:

  > 30 Sep 2026: a four-stage draft sees its figure only when stage 3 is done.

- Line 923:

  > 30 Sep 2026: a video call with a time gets its Zoom meeting now, and its invitation carries the link.

- Line 1360:

  > 30 Sep 2026: each video call with a meeting gets its join link on the portal.

- Line 1515:

  > 30 Sep 2026: a video call's Zoom meeting follows the change (moved, or deleted when cancelled or given back).

- Line 1681:

  > 30 Sep 2026: false for the second and later businesses of one enquiry — the person, not a second call.

- Line 1741:

  > 30 Sep 2026: a VIDEO call's invitation waits for its meeting, so it carries the link (sendVideoInvite, below).

- Line 1838:

  > ------------------------------------------------ 30 Sep 2026: the four-stage funnel's pages

- Line 2061:

  > 30 Sep 2026: the four-stage funnel shows "up to" a figure, not a range, so the thank-you says what was shown.

- Line 2063:

  > 30 Sep 2026: a video call with a time: its join page when the meeting was made, else null (the link will follow).

- Line 2065:

  > 30 Sep 2026: whether emails are being sent, so the page does not say an invitation is unsent when it is going.

### `src/core/secrets.ts`

- Line 48:

  > 30 Sep 2026: video calls - a meeting made for each, and joined inside the back office (src/integrations/connectors/zoom.ts).

- Line 50:

  > 30 Sep 2026: WhatsApp with each client from the back office (src/integrations/connectors/whatsapp.ts).

### `src/core/staff.ts`

- Line 100:

  > 30 Sep 2026: the site's address, for a video call's join page in its invitation.

- Line 342:

  > 30 Sep 2026: a video call's Zoom meeting is made (or moved) for the time, and its invitation carries the link.

- Line 353:

  > 30 Sep 2026: A VIDEO CALL, JOINED INSIDE THE BACK OFFICE. Those who arrange calls start it as the host (Zoom's start
  >      token, asked for now and put only in this page, which is never cached); anyone else who may see the call joins it.

- Line 408:

  > 30 Sep 2026: a video call says whether its Zoom meeting is ready to join, and if not why.

### `src/integrations/connectors/company-search.ts`

- Line 35:

  > SWITCHED ON FOR TESTING, 30 September 2026 (Lakhbir: "switch on companies house and postcodes.io"), under the same
  > recorded waiver as the postcode check. The key is still needed: in the key file locally, and on the test website
  > COMPANIES_HOUSE_API_KEY in its settings (api/index.mjs reads it behind the test password). Without it there is no
  > "Find my company" button and the name is typed, as before.

### `src/integrations/connectors/http.ts`

- Line 185:

  > 30 Sep 2026: a 204 (Zoom's answer to a move or a cancel) carries no body at all; a Response refuses one.

- Line 235:

  > 30 Sep 2026: PATCH and DELETE for Zoom, to move and cancel a video call's meeting (src/integrations/connectors/zoom.ts).

### `src/integrations/connectors/postcode-check.ts`

- Line 49:

  > SWITCHED ON FOR TESTING, 30 September 2026 (Lakhbir: "switch on companies house and postcodes.io"). The build-then-check
  > rule: built and on in the test website, then Sadique (DPO) is asked whether it is viable. `named_in_privacy_notice`
  > stays FALSE because it is false. Before real visitors: publish the notice naming Postcodes.io, set that true, and
  > set `papers_waived_for_testing` to false.

### `src/integrations/connectors/sources.ts`

- Line 299:

  > THE TRANSFER: Approved 30 September 2026 by Sadique Maskeen (data protection officer), as relayed by Lakhbir in the chat with Claude: "saqiue approves". A test build; the approval is for testing and is to be confirmed before real clients.

- Line 311:

  > THE TRANSFER: approved with ZOOM_OAUTH, 30 September 2026 (Sadique Maskeen, relayed by Lakhbir).

- Line 325:

  > THE TRANSFER: approved for testing on 30 September 2026 by Sadique Maskeen (data protection officer), relayed by
  >        Lakhbir in chat: "Sadique approves WhatsApp, the contact box is enough for testing". To be confirmed before real
  >        clients.

### `src/integrations/connectors/whatsapp.ts`

- Line 1:

  > WHATSAPP THROUGH META'S WHATSAPP CLOUD API. 30 September 2026.
  >
  > Lakhbir: "the ability to use whats app directly using our back end portal the idea is each client when we view back
  > end has full communication via email or whats app".
  >
  > WHAT IT NEEDS (developers.facebook.com, WhatsApp Cloud API, read 30 Sep 2026; Graph API v25.0):
  >   · a Meta business account with a WhatsApp Business account and our number on it, and an app in Meta for
  >     Developers with the WhatsApp product. From there, in the key file:
  >       WHATSAPP_ACCESS_TOKEN      a system user's permanent token (secret)
  >       WHATSAPP_PHONE_NUMBER_ID   the id Meta gives our number (not the number itself)
  >       WHATSAPP_APP_SECRET        the app's secret, which signs every message Meta sends us (X-Hub-Signature-256)
  >       WHATSAPP_VERIFY_TOKEN      a word we choose and type into Meta's webhook settings, so Meta can check the address
  >       WHATSAPP_OPENING_TEMPLATE  the name of our approved opening message (a "utility" template with one {{1}} for
  >                                  the person's first name), and WHATSAPP_TEMPLATE_LANGUAGE (en_GB if empty)
  >   · the webhook address set in Meta: <our site>/hooks/whatsapp, subscribed to "messages".
  >
  > WHATSAPP'S OWN RULE — THE 24-HOUR WINDOW. We may write freely only within 24 hours of the person's last message to us.
  > Outside it, WhatsApp allows only a message template Meta has approved. So outside the window the back office offers
  > one thing: our opening message, which asks them to reply; once they do, the window opens.
  >
  > THE TRANSFER. Meta Platforms keeps Cloud API messages in its own data centres (the United States unless a local
  > storage region is set up), so the row is US and NOT APPROVED until the data protection officer approves it
  > (sources.ts, WHATSAPP_CLOUD). Until then nothing is sent, and the back office says so. Receiving needs no call.
  >
  > 2 OCT 2026 — ONLY THE TEST WEBSITE SENDS (Lakhbir: "yes for now"), as Zoom: a copy on a computer, reading the real
  > key file, would message a real person from our number. It sends only on the deployed test website, or when started
  > with CAPREBATE_LOCAL_WHATSAPP=1 (src/integrations/connectors/place.ts). Receiving is not touched.
  >
  > No key is ever printed or logged. What is sent to Meta is the number and the words staff typed, nothing else.

### `src/integrations/connectors/zoom.ts`

- Line 59:

  > The Web SDK the join pages load, from Zoom's own address (checked on 30 Sep 2026: every file answers 200).

- Line 346:

  > The Meeting SDK's join signature (developers.zoom.us/docs/meeting-sdk/auth, read 30 Sep 2026): a JWT, HMAC-SHA256
  > with the SDK app's secret, carrying appKey, mn, role (0 a participant, 1 the host), iat, exp and tokenExp. It lasts
  > two hours (Zoom's floor is 30 minutes, its ceiling 48 hours). WebRTC video is asked for, so the page needs no
  > cross-origin isolation.

### `src/integrations/email/email-inbound.ts`

- Line 48:

  > SWITCHED ON FOR TESTING, 30 September 2026 (Lakhbir: the IONOS_IMAP_* login added, "lets work on this" — reading
  > clients' email replies into their conversation). Read-only (EXAMINE, BODY.PEEK): nothing in the mailbox is changed or
  > deleted. The first read starts from the inbox as it stands (migration 064), so mail already there is never brought in.
  > The privacy notice is a draft: it is to name this before real clients.

- Line 248:

  > 30 Sep 2026: the inbox's highest message number (0 when empty), without reading any message. Read-only.

### `src/integrations/email/email-provider.ts`

- Line 109:

  > SWITCHED ON FOR TESTING, 30 September 2026 (Lakhbir: "swithc on sending emails", and "again remeber this is all a test
  > and not the final version - the idea is we build what we can and then ask for approval"). Under a recorded waiver:
  > the privacy notice and clause 7 are still drafts that do not name IONOS, so both `named_in_*` stay FALSE. Sending
  > also needs the IONOS login: in the key file locally, and on the test website its settings (behind the test password).
  > An invented address (@example.invalid, example.com) is never sent to (src/integrations/email/email.ts, isInventedAddress).

### `src/integrations/email/email.ts`

- Line 186:

  > 30 Sep 2026: THE SENTENCES THAT SAY AN EMAIL WAS NOT SENT, written into bodies while sending was off. Taken out of an
  > email that is going, so nobody receives "Not sent yet".

- Line 201:

  > 30 Sep 2026: an address nobody can receive at — the reserved test names (RFC 2606 and 6761).

## 1 Oct 2026: no phase named

### `src/core/audit.ts`

- Line 386:

  > 1 Oct 2026: a person blocking off, or freeing, time in their own diary (src/web/time-blocks.ts).

- Line 388:

  > 1 Oct 2026: Admin saved a key's new value (sealed), or went back to the key file's (src/core/saved-keys.ts). The name only.

- Line 390:

  > 1 Oct 2026: the Communication tab — a Zoom call staff started or booked, a telephone call staff logged, a video call

- Line 405:

  > 1 Oct 2026: a surveyor changed the survey pack (src/web/survey-pack.ts): what, which line, which fields — never a value.

### `src/core/db.ts`

- Line 273:

  > 1 Oct 2026: a transaction whose connection was dropped is begun again once, from the start (see droppedConnection).

### `src/core/navigation.ts`

- Line 367:

  > 1 OCT 2026 — ADMIN'S VIEWS IN THE TOP BAR. Lakhbir: "i want the sales, accounting, survayor, admin these tabs to be
  > shifted next to the search box in the white space from logo to search box". Admin's choice of Home dashboard, on every
  > back-office page; the one Home is showing is marked. Nobody else has them (src/web/staff-dashboard.ts, dashView).

### `src/core/router.ts`

- Line 695:

  > 1 OCT 2026: THE REPLY TIMER (src/web/inbound-email.ts, timerMayRead). No login: an outside timer calls it, with its
  >      word in the Authorization header. Counts only in the answer.

- Line 1363:

  > 1 Oct 2026: the top of the portal as a dashboard (src/web/portal-dashboard.ts).

### `src/core/saved-keys.ts`

- Line 1:

  > API KEYS, CHANGED FROM HOME'S ADMIN TAB. 1 October 2026 (migration 067).
  >
  > Lakhbir: Admin's tab is "back end access … update the API keys and save them". Until now a key could only be changed
  > in the key file on the server, or in the test website's settings on Vercel.
  >
  > WHAT IS SHOWN: each key's name, what it is for, and where its value comes from — saved here (when, and by whom), the
  > key file or the website's settings, or not set. NEVER A VALUE, NOT EVEN A PART OF ONE, ONCE SAVED.
  > SAVING: Admin only, with their own password typed again. The value is sealed with AES-256-GCM under CAPREBATE_MFA_KEY
  > (the key that already seals each person's authenticator secret, src/core/mfa-seal.ts), with the key's name bound in so a
  > sealed value copied onto another name does not open. Without a good CAPREBATE_MFA_KEY nothing is saved: a key kept as
  > text in the database is refused, not quietly allowed. CAPREBATE_MFA_KEY itself is not offered (it cannot seal itself),
  > nor a retired key. The audit line names the key, never the value.
  > READING: the newest row for a name wins over the key file or the settings; "Use the key file again" adds a row with no
  > value. Every request checks one number (the newest row) and rebuilds the keys only when it has moved, so a key saved on
  > one copy of the website is read by every copy at its next request.

- Line 106:

  > 1 OCT 2026 — IS THE SERVICE THAT USES THIS KEY SWITCHED ON? Lakhbir: "not set = red, active = green, set but not
  > active = amber". Each service's own switch or readiness check, read as it stands now; the words say what is off.

### `src/core/secrets.ts`

- Line 54:

  > 1 Oct 2026: the outside timer that wakes the website to read email replies (POST /hooks/read-replies).

- Line 333:

  > 1 OCT 2026: THE SAME KEYS, WITH SOME REPLACED — the keys Admin saved on Home's Admin tab (src/core/saved-keys.ts), over
  > the key file or the website's settings. Every key is read from `base` by its own owner, so nothing crosses owners.

### `src/core/server.ts`

- Line 205:

  > 1 Oct 2026: a key Admin saved on another copy of the website is read here from this request on (src/core/saved-keys.ts).

### `src/core/staff.ts`

- Line 251:

  > 1 Oct 2026: Home is a dashboard, in the shape of the login's role; Admin has a tab for each (src/web/staff-dashboard.ts).

- Line 253:

  > 1 Oct 2026: the inbox is read first (at most every two minutes), so "new messages" counts a reply that just came.

- Line 259:

  > ------------------------------------------ 1 OCT 2026 · blocking off time in your own diary

- Line 366:

  > 1 Oct 2026: the first time a host opens the call, it is marked started — the Communication tab shows it.

- Line 465:

  > 1 Oct 2026: the survey pack — the sums, the surveyor's stamped changes (src/web/survey-pack-pages.ts).

- Line 608:

  > 1 Oct 2026: "Archive" on Home's Admin tab posts here too, and goes back there.

- Line 630:

  > ------------------------------------------ 1 OCT 2026 · Admin saves an API key, sealed (src/core/saved-keys.ts)

### `src/integrations/connectors/http.ts`

- Line 57:

  > 1 OCT 2026: WHETHER A TRANSPORT REALLY REACHES OUTSIDE — the platform's fetch, or the certificate one. A test's
  > recorded answers (fixtureTransport) reach nobody, so a guard that keeps a local copy from calling a real service
  > (Zoom: src/integrations/connectors/zoom.ts, zoomPlaceRefusal) leaves them alone.

### `src/integrations/connectors/zoom.ts`

- Line 112:

  > 1 Oct 2026: the setting that lets a copy that is not the test website call Zoom. Off unless it is exactly "1".

- Line 115:

  > 1 Oct 2026: why THIS copy may not call Zoom, in words, or null when it may. Only a live transport is ever refused:
  > a test's recorded answers reach nobody.

### `src/integrations/email/email-inbound.ts`

- Line 250:

  > 1 Oct 2026: the numbers of the messages that answer an email whose Message-ID ends "@domain" — replies to ours,
  >  whenever they arrived. A read-only search of one header; nothing is fetched.

### `src/integrations/email/email-provider.ts`

- Line 246:

  > 1 Oct 2026: a reply's In-Reply-To and References — Message-IDs without the angle brackets.

- Line 349:

  > 1 Oct 2026: say WHY it closed — "wrong version number" is how a secure connection to the wrong port shows itself.

- Line 368:

  > 1 OCT 2026 — PORT 587 SPEAKS PLAIN FIRST. IONOS takes mail on 465, secure from the first byte, and on 587, where the
  > conversation starts in plain text and becomes secure with STARTTLS before anything private is said. Until today the
  > adapter opened every port as 465, so a key file saying 587 met a server that hung up before its greeting ("0 the
  > connection closed"). Now 465 is secure from the start, and any other port says EHLO, STARTTLS, and only then — on the
  > secure connection — EHLO again and the login. A server that will not go secure is refused: the password is never sent
  > in plain text. A test's own connector is used as it is.

- Line 405:

  > 1 Oct 2026: sign in and out again, sending nothing — "does our login work?".

- Line 429:

  > 1 Oct 2026: an invented address (example.invalid, example.com …) never reaches the real mail server, whichever

### `src/integrations/email/email.ts`

- Line 69:

  > 1 OCT 2026 — A REPLY JOINS ITS CHAIN (migration 065): the chain's key, and the Message-IDs it answers (without the
  > angle brackets), sent as In-Reply-To and References. A new email has none.

## 2 Oct 2026: Phase 1

### `src/core/look.ts`

- Line 1:

  > THE SHARED LOOK — UI TIDY PHASE 1, 2 October 2026.
  >
  > Lakhbir chose "design 2" from the mock-ups (https://claude.ai/artifact/G74T4SbqtQLJX7AeamdgBW) and asked for colours
  > and darker boxes, so a busy person reads a page at a glance. The plan is 00-START-HERE/hub/UI-TIDY-PLAN.md. This module
  > draws the pieces every tidied page shares; the colours are tokens in src/shared/assets.ts, each pairing checked at 4.5:1
  > by test/phase133c.test.ts, and the pieces are proved in test/ui-tidy-look.test.ts.
  >
  > - **A colour for each group of claim stages.** The ten steps of the procedure and Closed fall into five groups. A stage
  >   that is not a step (on hold, or one of the ways a claim ends) has no group and is drawn in the plain badge.
  > - **Solid number boxes** at the top of a page: what is late in red, what nobody owns in brown, money in green, a total
  >   in black with its figure in mint.
  > - **A bar of the groups**, each as wide as its count.
  >
  > Nothing here decides what a person may see: a page passes in only what its own gates already let it show.

### `src/shared/assets.ts`

- Line 56:

  > UI TIDY PHASE 1, 2 October 2026: one colour for each group of claim stages (src/core/look.ts), from the mock-ups

- Line 85:

  > UI TIDY PHASE 1: the stage groups (a label on its tint, white on its solid band), the solid number boxes, the black

## 2 Oct 2026: Phase 2

### `src/core/navigation.ts`

- Line 223:

  > ------------------------------------------------------------------ *
  > A MENU THAT OPENS OUT — UI TIDY PHASE 2
  > ------------------------------------------------------------------

## 2 Oct 2026: Phase 3

### `src/integrations/registers/source-register.ts`

- Line 1:

  > Caprebate — Source Register & Provenance Cells
  > Board item 12830181420. Phase 3, item 1.
  >
  > Every field written anywhere in the system carries three things with it:
  >   publisher, licence, retrieval timestamp.
  > Not a log alongside the data — provenance attached to the value itself.
  >
  > Schema authority: Build-Prep-Consolidated-Schema.md §0.3 (UNKNOWN rule),
  > §0.4 (provenance codes), §0.5 (confidence grades, grade inheritance I-2).
  > Name policy: board item 12818313893 (name exclusion register).
  >
  > Runs on Node >= 22.6 with type stripping (`node file.ts`). No enums, no
  > namespaces, no parameter properties — those are not strippable.

## 2 Oct 2026: Phase 4

### `src/core/staff.ts`

- Line 888:

  > UI TIDY PHASE 4: a dashboard draws its own heading, with the day and what is late beside it (src/web/staff-dashboard.ts).

## 2 Oct 2026: Phase 5

### `src/integrations/registers/name-exclusion.ts`

- Line 1:

  > Caprebate — Name Exclusion Register & Automated Assertion
  > Board item 12818313893. Phase 5, item 7.
  >
  > The rule, in one sentence: no register ingestion may write a natural
  > person's name to storage except the two documented exceptions (Companies
  > House PSC, and an individual HM Land Registry proprietor). Everything
  > else — assessor names, registered managers, nominated individuals,
  > responsible individuals, directors, secretaries, trustees, applicants,
  > agents, objectors, neighbours, ratepayers, registered persons — is
  > retrieved (where the source API forces it) and never recorded.
  >
  > This module is the single typed source of the source-by-source register
  > documented on the board item. The Monday doc's Part A is generated FROM
  > this data, not written alongside it, so the register and the code cannot
  > drift apart: change the KEEP/EXCLUDE list here and the documentation is
  > wrong until someone updates both, which is the same discipline the
  > source register (caprebate-source-register.ts, board 12830181420)
  > already applies to provenance. The two modules are deliberately
  > independent: that file governs what a source may write about a BUILDING
  > (provenance, licence, grade); this one governs what a source may write
  > about a PERSON (a name, or a field that identifies one). A field could
  > pass one and fail the other, and both must be checked.
  >
  > Fail-closed is the load-bearing property, not a footnote. A source that
  > is not in NAME_EXCLUSION_POLICY cannot write anything at all — not
  > because its fields have been checked and found safe, but because nobody
  > has looked yet. The same rule applies field-by-field on a REGISTERED
  > source: a field that is neither on the KEEP list, the EXCLUDE list, nor
  > one of the two named exceptions is UNCLASSIFIED and is refused, on the
  > ground that an uncatalogued field might be exactly the personal-name
  > field nobody has added to the policy yet. A new source or a new field
  > must earn its way onto a list before it can be written; it is never
  > assumed innocent by default.
  >
  > LIA cross-reference: board doc id 46389172 (item 5). This module is what
  > safeguards S1 and S11 refer to (LIA §7.3 table). The LIA supplies the
  > lawful-basis balancing test; this module supplies, and enforces, the
  > field-level rule the LIA depends on. Do not restate the balancing test
  > here — read it there.
  >
  > Runs on Node >= 22.6 with type stripping (`node file.ts`). No enums, no
  > namespaces, no parameter properties — those are not strippable.

## 2 Oct 2026: no phase named

### `src/core/audit.ts`

- Line 407:

  > 2 Oct 2026: the surveyor approved a version of the survey pack (src/web/pack-approve.ts): the version and its fingerprint.

- Line 409:

  > 2 Oct 2026: the survey report emailed to the client's accountant for sign-off; their answer by the private link
  >  (src/web/report-signoff.ts). Ids, the version and the outcome — never the link, never a figure.

- Line 412:

  > 2 Oct 2026: a client's photo for the survey checklist (src/web/survey-evidence.ts). The photo's id and item only.

- Line 414:

  > 2 Oct 2026: photos sent in one go put under checklist items by Admin or Sales, or taken back. Counts only.

- Line 416:

  > 2 Oct 2026: a site plan fetched for a survey job's report (src/web/site-plan.ts): how many buildings, and how the
  >  client's was picked. Never the postcode, never a coordinate.

### `src/core/cli.ts`

- Line 308:

  > 2 Oct 2026: only the test website sends (src/integrations/connectors/place.ts), unless started with CAPREBATE_LOCAL_EMAIL=1.

### `src/core/multipart.ts`

- Line 168:

  > 2 Oct 2026: SEVERAL PHOTOS IN ONE FORM — the client's "send lots of photos at once" (src/web/evidence-pages.ts).
  > The same ungenerous reader; every file part is returned, in order, up to `max` of them (the parts cap above still
  > holds). A form that posts more than `max` is refused, not cut short.

### `src/core/router.ts`

- Line 410:

  > 2 Oct 2026: the photo page's one script (src/web/photo-upload-script.ts).

- Line 650:

  > 2 OCT 2026: THE ACCOUNTANT'S PRIVATE SIGN-OFF LINK (src/web/report-pages.ts). No login: the link is the key, kept only
  >      as its SHA-256, answered once, for 30 days.

- Line 706:

  > 2 Oct 2026: the same wake clears photo uploads never finished within a day (src/web/photo-upload.ts).

- Line 1364:

  > 2 Oct 2026: the survey report's card leads, once a tax adviser's sign-off has released it (src/web/report-pages.ts).

- Line 1373:

  > 2 OCT 2026: "SHOW US YOUR BUILDING" — the photo checklist and the recorded walkthrough call (src/web/evidence-pages.ts).

- Line 1379:

  > 2 OCT 2026: THE CLIENT'S SURVEY REPORT — only the version a tax adviser's sign-off has released (src/web/report-pages.ts).

### `src/core/saved-keys.ts`

- Line 131:

  > 2 Oct 2026: the report's site plan (src/web/site-plan.ts), fetched on the test website only, for now.

### `src/core/secrets.ts`

- Line 52:

  > 2 Oct 2026: the building outlines for the report's site plan, from Ordnance Survey's free maps (src/integrations/connectors/os-buildings.ts).

### `src/core/staff.ts`

- Line 468:

  > 2 Oct 2026: the approved report, its PDF, and sending it for sign-off (src/web/report-pages.ts).

- Line 474:

  > 2 Oct 2026: the client's photos, the walkthrough call and how the surveyor inspected (src/web/evidence-pages.ts).

### `src/integrations/connectors/os-buildings.ts`

- Line 1:

  > THE BUILDING OUTLINES FOR THE REPORT'S SITE PLAN — Ordnance Survey's free maps. 2 October 2026, the survey pack, stage 6.
  >
  > Lakhbir, 1 Oct 2026: the report's cover shows the building from Ordnance Survey's free building outlines, and never the
  > site boundary (INSPIRE, src/integrations/connectors/inspire.ts, which stays on our own sums only). 2 Oct 2026, asked how the
  > client's building is chosen: "Automatic" — the building the postcode's point falls in, else the nearest one.
  >
  > TWO CALLS, AND WHAT EACH SENDS:
  >   1. postcodes.io (POSTCODES_IO, already used by the postcode check): the postcode, and nothing else. Back: the
  >      postcode's point on the British National Grid (easting and northing, in metres).
  >   2. Ordnance Survey's Features API (OS_FEATURES): a square of map around that point. Back: the outlines of the
  >      buildings in it, from OS Open Zoomstack (open data, Open Government Licence). Never a name or an address.
  >
  > Nothing here decides whether the calls may be made: the caller (src/web/site-plan.ts) asks that first. Every call is
  > one audit row (src/integrations/connectors/http.ts). A call that does not work comes back as words, never a guess.

### `src/integrations/connectors/place.ts`

- Line 1:

  > WHERE THE APP RUNS DECIDES WHETHER IT MAY REACH A REAL PERSON. 1–2 October 2026.
  >
  > 1 Oct: a copy on Lakhbir's Mac, reading the real key file, made a real Zoom meeting (src/integrations/connectors/zoom.ts).
  > 2 Oct, Lakhbir: WhatsApp and IONOS email get the same guard "for now" (src/integrations/connectors/whatsapp.ts,
  > src/integrations/email/email-provider.ts). So a service that reaches a real person is called only when the app is the deployed
  > test website (Vercel says so: VERCEL=1, VERCEL_ENV production or preview, and VERCEL_URL set), OR the copy was started
  > with that service's own setting = 1, for when Lakhbir really wants to try it on his own computer.
  >
  > Only a live connection is ever refused: a test's recorded answers, or its own mail server, reach nobody.

### `src/integrations/connectors/whatsapp.ts`

- Line 57:

  > 2 Oct 2026: the setting that lets a copy that is not the test website send WhatsApp messages. Off unless exactly "1".

- Line 60:

  > 2 Oct 2026 (Lakhbir: "yes for now"): why THIS copy may not send WhatsApp messages, in words, or null when it may —
  > as Zoom (src/integrations/connectors/place.ts). Only a live transport is ever refused.

### `src/integrations/connectors/zoom.ts`

- Line 203:

  > 2 Oct 2026: `record` — a survey walkthrough call (src/web/survey-evidence.ts) is recorded to Zoom's cloud.

- Line 238:

  > 2 Oct 2026: a walkthrough call's cloud recording, as Zoom describes it (GET /v2/meetings/{meetingId}/recordings,
  > developers.zoom.us, read 2 Oct 2026). Only its sharing link, passcode, length and start are read; the video stays
  > with Zoom. Needs the Server-to-Server app's recording scope, and cloud recording on our Zoom plan.

### `src/integrations/email/email-provider.ts`

- Line 189:

  > 2 Oct 2026: the setting that lets a copy that is not the test website send email. Off unless exactly "1".

- Line 203:

  > 2 Oct 2026: why THIS copy may not send email, in words, or null when it may.

- Line 432:

  > 2 Oct 2026: never a real delivery from a copy that is not the test website (unless started to on purpose).

- Line 562:

  > 2 Oct 2026: REPORT_FOR_SIGNOFF too — the accountant's one-use sign-off link (src/web/report-signoff.ts); migration 073.

### `src/integrations/email/email.ts`

- Line 48:

  > REPORT_FOR_SIGNOFF — 2 Oct 2026: the client's survey report sent to their accountant, the PDF attached, with a
  >  private link that works once (src/web/report-signoff.ts). Its words leave the outbox once sent, like a sign-in code's.

### `src/shared/objectstore.ts`

- Line 89:

  > 2 Oct 2026: where survey photos are kept, each sealed (`putSealed`).

- Line 91:

  > 2 Oct 2026: where a photo LOCKED ON THE PHONE waits (src/web/photo-upload.ts) until the server opens, cleans and seals
  >  it. Only locked bytes are ever here, and each is removed once it is dealt with.

- Line 94:

  > 2 Oct 2026: where a client's video is kept, in pieces, each sealed (src/web/survey-video.ts).

- Line 210:

  > 2 OCT 2026: A SURVEY PHOTO (src/web/survey-evidence.ts) — kept ENCRYPTED with the same key as a kept original, under
  > its own prefix, and refused with no key: a photo of the inside of a client's building is never written in the clear.

- Line 223:

  > 2 Oct 2026: a small secret encrypted with the same key, to keep in the database (a one-time lock's private half).

- Line 241:

  > ------------------------------------- 2 Oct 2026: photos sent straight here

- Line 256:

  > 2 Oct 2026: a piece of a video that was never kept (refused or abandoned) is removed. Only under survey-videos/.

### `src/shared/pdf-canvas.ts`

- Line 1:

  > A PDF THAT IS DRAWN, NOT ONLY WRITTEN — boxes, lines, bars and text placed exactly, for the client's survey report.
  > 2 October 2026 (Lakhbir: the client "would want something visually appealing"; the design approved as a mock-up).
  >
  > Like src/shared/pdf.ts, which writes the signed engagement letter: no dependency, PDF 1.4, A4, the standard fonts every
  > reader has (nothing embedded), WinAnsi text written as hexadecimal strings so no character can end a string early or be
  > read as an operator, and the same bytes for the same input — so the PDF of an approved version is the same file
  > every time it is made, and needs no keeping. What it adds: a filled or outlined box (square or rounded), a line
  > (solid or dashed), a filled circle, a shape of straight sides (2 Oct 2026, the site plan), text in Helvetica, Helvetica-Bold or Times-Bold in any colour, set left, right or
  > centred, and the exact width of a piece of text (src/shared/pdf-metrics.ts), so prose wraps and figures line up.
  >
  > Positions are in points from the TOP-LEFT of the page (text at its baseline), as a page is read; the writer turns them
  > the other way up, as PDF wants.

- Line 26:

  > 2 Oct 2026: a shape of straight sides — the site plan's buildings. Rings of [x, y] points; holes drawn even-odd.

### `src/shared/pdf-metrics.ts`

- Line 1:

  > THE WIDTH OF EVERY CHARACTER IN THE THREE PDF FONTS THE REPORT USES — so a line can be wrapped, and a figure set flush
  > right, exactly. 2 October 2026, for src/shared/pdf-canvas.ts.
  >
  > Helvetica, Helvetica-Bold and Times-Bold are three of the fourteen fonts every PDF reader has, so nothing is embedded.
  > Their widths, in thousandths of the font size, for WinAnsi codes 32 to 255 (index 0 is the space). Read on 2 Oct 2026
  > from Liberation Sans, Liberation Sans Bold and Liberation Serif Bold, which are made to the same widths as Helvetica
  > (Arial) and Times, character for character; the first ones were checked against Adobe's published figures (space 278,
  > quotation mark 355, apostrophe 191 in Helvetica; space 250 in Times-Bold). A code WinAnsi does not use is 0.

### `src/shared/shared-objectstore.ts`

- Line 66:

  > 2 Oct 2026: a one-time address the PHONE sends one object to, straight to the store (a presigned PUT): only this
  > pathname, only until `validUntil`, at most `maximumSizeInBytes`, private. With the headers it must send.

- Line 128:

  > 2 Oct 2026: a photo locked on the phone is sent straight to the store, never through a copy of the website.

- Line 179:

  > 2 Oct 2026, for a presigned PUT (@vercel/blob 2.8). Absent in an older SDK: then photos go through our own route.

## 3 Oct 2026: Phase 9

### `src/integrations/postcodes/postcode-authority.ts`

- Line 254:

  > EMPTY BECAUSE NOBODY HAS RUN AN INGEST YET — not because anything forbids
  > it. This is the only empty table in Phase 9 whose licence is already
  > cleared, and it is the cheapest of them all to fill: one 176.5 MB download,
  > no counterparty, no fee.

## 3 Oct 2026: Phase 13

### `src/core/staff.ts`

- Line 1027:

  > UI TIDY PHASE 13 — THE CALENDAR, 3 October 2026. The page opens with what it is showing ("Friday 2 Oct 2026"), the
  > buttons to move (Earlier, Today, Later) and to switch between the day and the week, and four boxes counting the calls
  > held in the window and the three lists below. The week is seven boxes side by side on a laptop — each day's calls, or
  > "Nothing booked" — instead of seven headings; the day is one table. A call with nobody on it says "Nobody yet" in
  > amber; a cancelled call says so in red. The work queue keeps its words and its order (asked for a call, then
  > cancelled, then another way); each row's link says what it does, "Give it a time" for a login that may arrange calls
  > and "Open" for any other. The cancelled calls fold away, with how many. The sections are in the left-hand menu.

## 3 Oct 2026: Phase 15

### `src/core/staff.ts`

- Line 1409:

  > UI TIDY PHASE 15: where Add a user lands — the form, opened. Home's "Add a person" card links here too.

- Line 1412:

  > UI TIDY PHASE 15: the counts over the users list. "Staff" leaves out client logins; turned off accounts count apart.

- Line 1424:

  > UI TIDY PHASE 15 — USERS AND ROLES, 3 October 2026. Was 5,000 px: a block of six role buttons for every person, then
  > the create form. Now: a header with Make or change a role and Add a user, four boxes, and one table that stacks on a
  > phone — each person's name over their username, their role as a label, Active in green or Turned off in red, and their
  > actions: the three that were there, and Change role, folded in their own row, a list of the roles instead of six
  > buttons. Add a user is folded until its button, a link to it, or a refusal opens it. Nobody's own row offers a role.

## 3 Oct 2026: Phase 16

### `src/core/navigation.ts`

- Line 448:

  > UI TIDY PHASE 16: on the claims page, its sections open out under Your claims (the page names them, `setSubMenu`).

### `src/core/router.ts`

- Line 2316:

  > UI TIDY PHASE 16: the page's parts open out under Your claims in the left-hand menu.

- Line 2329:

  > PHASE 133c (B9): THE PORTAL, IN THE ORDER A CLIENT NEEDS IT. At the top, how to reach us and book a call; then where
  >        the claim is; the range with its basis underneath; what we need from you; then everything else. The long step
  >        explanations sit behind "What happens at each step". Every section Phase 133a drew is still on the page.
  >        UI TIDY PHASE 16 (3 October 2026): the header also offers Send us a document; the questions and the documents asked
  >        for are drawn only when there is one (the "What we need from you" card already says when nothing is); How to
  >        contact us moves to the end, its words unchanged; the parts are listed under Your claims in the left-hand menu.

## 3 Oct 2026: Phase 18

### `src/core/navigation.ts`

- Line 246:

  > UI TIDY PHASE 18: a page inside another's frame adds its own parts under the entry marked current — a claim's sections
  > under that claim, in its client's menu. With no menu set yet, they become the menu, under `title`.

### `src/shared/components.ts`

- Line 408:

  > UI TIDY PHASE 18: where given, only these sections open by their status; the rest start closed (a change just made,
  >  or the person's own choice, still opens one). The claim page passes its stage, so it no longer opens 10,000 px.

## 3 Oct 2026: no phase named

### `src/core/auth.ts`

- Line 274:

  > FASTER CLICKS 2, 3 October 2026: "last seen" is written at most once a minute, not twice a click (the server and the

### `src/core/db.ts`

- Line 49:

  > FASTER CLICKS, part 2 (3 October 2026): a file on this machine that keeps a LOCAL COPY of the remote database. Reads
  > are answered from it; writes go to the remote database (libSQL's "embedded replica"), and `refresh()` — at the start
  > of every click — brings in what any copy of the website wrote since. Remote databases only, and only when the
  > website's settings ask for it (api/index.mjs, CAPREBATE_DB_LOCAL_COPY=on). With `openEngine` (tests) the engine
  > given is the copy.

### `src/core/server.ts`

- Line 198:

  > FASTER CLICKS, 3 Oct 2026: each request remembers its own reads until anything is written (src/core/db.ts withReadMemo).

## 4 Oct 2026: Phase 153

### `src/core/router.ts`

- Line 862:

  > PHASE 153f, 4 October 2026: the six screens of the first funnel are retired; an old link opens the four-stage funnel.
  >      Nothing they recorded is changed or deleted. Any request, GET or POST, with or without a draft, is sent to stage 1:
  >      no draft is made, read, saved or removed here. The privacy-notice link of Phase 153, which sat on the old address
  >      screen (Q2), is drawn on the four-stage address screen ("details") instead, under the same switch.

## 4 Oct 2026: Phase 153a

### `src/shared/next-step.ts`

- Line 32:

  > Phase 153a (src/web/grant-checks.ts): the grant papers or the tax adviser's view; the client's check with the payer.

## 4 Oct 2026: Phase 153b

### `src/integrations/connectors/company-search.ts`

- Line 86:

  > PHASE 153b, 4 October 2026 — WORD QUESTION 198 ("When Companies House says a client is an LLP, what kind of business
  > should our estimate treat it as?"), for the accountant, with the data protection officer's one-line change to the
  > permitted fields. Built on our recommendation and SWITCHED OFF until both have answered:
  >   "ltd" and "plc"  -> a company ("Limited company"), filled in for the person, who can still change it;
  >   "llp"            -> an LLP, taxed like a partnership — NEVER filled in silently: the person is asked to confirm it;
  >   anything else    -> asked, as today (an unlimited company, a guarantee company, a Scottish partnership …).
  > A type not known — absent, blank, or the switch off — is asked (N4). Off, nothing is kept and nothing changes.

### `src/integrations/connectors/registers.ts`

- Line 163:

  > WHICH ROUTE IS CHOSEN WHERE A REGISTER SOURCE HAS TWO. PHASE 153b, 4 October 2026 — Word question 202 ("Should we pay
  > for planning history, or keep the free one that asks us to go slowly?"), Lakhbir's, built on our recommendation for
  > him to confirm. Planning history can come from PlanIt (free, one volunteer, about 300 searches a day, asks not to be
  > built on for a paid service) or from Homedata (paid, by the property's own number, so fewer wrong matches). Homedata
  > is the chosen route and PlanIt the built fallback. Choosing switches NOTHING on: HOMEDATA_PLANNING above stays false
  > until the Homedata account is open, and as a paid lookup it runs only after a signed engagement either way.

### `src/integrations/email/email.ts`

- Line 85:

  > Phase 153b (migration 079): the return-entries spreadsheet beside a survey report's PDF.

### `src/integrations/registers/source-register.ts`

- Line 646:

  > PHASE 153b, 4 October 2026 (Word question 198): the company's TYPE ("ltd", "plc", "llp" ...), a fact about the

### `src/shared/engine.ts`

- Line 114:

  > PHASE 153b (Word question 59) — present ONLY where CB_FEEGUARD.fee_comparison_counts_vat is on AND we are
  > VAT-registered: how VAT on our fee was treated, and the fee the verdicts were taken on. Absent today.

- Line 334:

  > PHASE 153b (Word question 226) — what a session's works-VAT answer tells us about the client's VAT on OUR fee:
  > 'can_reclaim' or 'cannot_reclaim' only for the same business with nothing changed, and null (not known) otherwise.
  > The engine's rule (CB_FEE.clientVatFromWorks), narrowed here; null where the engine does not carry it.

## 4 Oct 2026: Phase 153c

### `src/core/audit.ts`

- Line 265:

  > Phase 153c (Word question 181): the restricted names list — a name added, the list read, a read refused.

### `src/core/authz.ts`

- Line 153:

  > PHASE 153c: the client's owners — read by `document.read_original` for Sales. Absent is nobody.

- Line 296:

  > PHASE 153c, 4 October 2026 (Word question 219): the staff who own this client — the organisation's owner and the
  > owner of each of its claims. Read only by `document.read_original` for Sales. Absent is nobody (N4).

- Line 759:

  > PHASE 153c, 4 October 2026 (Word question 219, "only Sales on their own clients"): Sales opens a kept original only
  >      on a client it owns — the organisation's owner, or the owner of one of its claims. Another salesperson's client is
  >      refused, and an owner not recorded admits nobody (N4). Reading the document itself (`document.read`) is unchanged.

- Line 882:

  > Phase 153c (Word question 181): the restricted breach names list. ADMIN here only as the door: src/web/breach-names.ts
  >      lets an Admin through only when they are the deputy named in breach_names_deputies (migration 080).

### `src/core/cli.ts`

- Line 132:

  > PHASE 153c (Word question 222). ENQUIRY_RETENTION is off, so this deletes nothing and says why.

- Line 146:

  > PHASE 153c (Word question 183). Business name, address, sector and source only; a name that may be a person's is
  >        held back. Nothing reads the list to contact anyone.

### `src/integrations/connectors/address-lookup.ts`

- Line 51:

  > PHASE 153c, 4 October 2026 — HOW LONG THE PICKED ADDRESS IS KEPT (Word question 37). Built on our recommendation, for
  > the officer to check: seven years with the claim file, in the test system. Homedata publishes no period, so this is
  > OUR TEST READING, awaiting its written answer; and nothing from it reaches a client, accountant or HMRC report (the
  > source register keeps those channels closed: HOMEDATA_TERMS).

### `src/integrations/connectors/claude.ts`

- Line 122:

  > PHASE 153c, 4 October 2026 — WHICH KINDS OF DOCUMENT MAY HAVE THEIR SCANNED PAGES SENT WHOLE (Word question 193,
  > Sadique's: "Can a scanned page be sent to the AI company whole, before we remove anyone's details?"). Built on our
  > recommendation for him to check: only kinds that rarely hold anyone's personal details — a contractor's cost
  > breakdown, an operation and maintenance manual, a building regulations completion certificate. EVERY OTHER KIND IS
  > REFUSED, a fire risk assessment, a lease and planning papers among them, and so is a document whose kind is not
  > known (N4). This narrows SCANNED_PAGES; it switches nothing on, and SCANNED_PAGES stays off.

- Line 419:

  > Phase 153c: the kind decides first. A kind not on the list never reaches the switch or the key.

### `src/integrations/registers/source-register.ts`

- Line 265:

  > PHASE 153c, 4 October 2026 (Word question 201): the words shown beside each CQC fact. CQC's "Using CQC data"
  >        page puts the data under the Open Government Licence and asks users to acknowledge they use CQC information.

### `src/shared/originals.ts`

- Line 64:

  > PHASE 153c, 4 October 2026 — ON FOR THE TEST WEBSITE ONLY (Word question 219, built on Lakhbir's recorded answer of
  > 24 September and his "Keep them, test only" of 2 October for the survey photos, for the data protection officer to
  > check). Only api/index.mjs passes this, and only the test website runs that file; `KEEP_ORIGINALS` above, the default
  > everywhere else, stays off. The test website holds invented files only. A kept original still needs its key
  > (CAPREBATE_ORIGINALS_KEY in the website's settings): without it nothing is kept, whatever this says.

## 4 Oct 2026: Phase 153d

### `src/core/router.ts`

- Line 132:

  > PHASE 153d: the test-only letter (src/web/letter.ts, TEST_LETTER_PATH). Absent is the real letter. Only the test website passes it.

### `src/core/server.ts`

- Line 126:

  > PHASE 153d: show the TEST-ONLY engagement letter (test defaults, never signed). Absent is the real letter. api/index.mjs alone passes it.

## 4 Oct 2026: Phase 153e

### `src/core/cli.ts`

- Line 235:

  > PHASE 153e (Word question 138). Reads the approved survey packs and proposes a range per sector, supported living
  >        per trigger. It changes no band: a person changes the engine, with the surveyor's agreement.

### `src/integrations/connectors/homedata.ts`

- Line 80:

  > PHASE 153e: TESTS ONLY. Absent, HOMEDATA_DIMENSIONS governs, and it is off.

- Line 98:

  > PHASE 153e, 4 October 2026 (Word question 203, the surveyor's) — HOMEDATA'S `dimensions` ITEM (1 token, a penny), BEHIND
  > ITS OWN SWITCH, OFF. A floor area worked out from the building's outline and height, for a building with no energy
  > certificate. It is NOT a measurement, so it is never stored as a register fact and is always labelled "estimated from
  > the building's shape". Before it is relied on, it is compared on five homes whose floor areas are known
  > (`compareEstimatedAreas`), and the surveyor says when a real measurement must replace it. The field names below are
  > the ones we read; they are checked against the first real response before the switch goes on.

- Line 395:

  > Phase 153e: only with the dimensions switch on, and never a register fact: labelled as the estimate it is.

### `src/shared/finding-source.ts`

- Line 1:

  > SEEN ON SITE, OR FROM DOCUMENTS — PHASE 153e, 4 October 2026 (Word question 150, the surveyor's).
  >
  > Lakhbir answered "No": whether old equipment was swapped for the same kind cannot be told from a visit alone. The
  > draft in the answer box: reports should separate what was seen on site from what documents showed. Built on our
  > recommendation, for the surveyor to check: every finding (a survey pack line) carries one of two labels.
  >   SEEN ON SITE — the surveyor inspected the building on site (chapter 2 says so) AND set this line's figures or pool
  >                  themselves. Anything less is not "seen on site".
  >   FROM DOCUMENTS — everything else: records, our draft, the client's papers; with "and the client's photos" where the
  >                  client photographed it. A video or photos are not a visit.
  > N4: no inspection basis recorded reads as not seen on site.

## 4 Oct 2026: Phase 153f

### `src/core/audit.ts`

- Line 393:

  > PHASE 153f: a video call made under the shared Zoom host because its member of staff has no Zoom user.

- Line 397:

  > PHASE 153f: a file someone sent us on WhatsApp, fetched from Meta and kept sealed (or not, and why in words on the page).

### `src/core/router.ts`

- Line 1692:

  > PHASE 153f (migration 086): the funnel's optional "you may also message me on WhatsApp" box, kept on the contact.

### `src/core/staff.ts`

- Line 370:

  > PHASE 153f: the start token of the Zoom user the meeting was made under (the assigned member of staff, else the shared host).

### `src/integrations/connectors/sources.ts`

- Line 249:

  > PHASE 153f, 4 October 2026 — A FILE SOMEONE SENT US ON WHATSAPP (src/integrations/connectors/whatsapp.ts, fetchWhatsAppMedia).
  >        Meta gives each photo, voice note or document an address on its own file host for a few minutes; we fetch it there
  >        with our WhatsApp token, only when a member of staff presses "Get it". The same processor and the same transfer
  >        as WHATSAPP_CLOUD (approved for testing on 30 September 2026), so the same answer here. Nothing is sent but the
  >        token; the file comes back. A GET, so a second try is safe. Our own limit on size: 16 MB.

### `src/integrations/connectors/whatsapp.ts`

- Line 159:

  > PHASE 153f: what Meta's webhook says about an attachment. The file itself is fetched later, by a person (fetchWhatsAppMedia).

- Line 190:

  > PHASE 153f: a file Meta holds for us (a photo, video, voice note, document or sticker) can be fetched here.

- Line 222:

  > PHASE 153f, 4 October 2026 — FETCH A FILE SOMEONE SENT US (developers.facebook.com, WhatsApp Cloud API, "Media",
  > read 4 Oct 2026). Two calls, both with our token: GET /v25.0/{media-id} answers the file's address on Meta's file host
  > (lookaside.fbsbx.com, valid for a few minutes), its type, size and SHA-256; then GET that address answers the bytes.
  > Refused, in words, when WhatsApp is not on here, when the address is not Meta's file host, when it is larger than
  > 16 MB, or when the bytes do not match Meta's SHA-256. Never throws; nothing is kept here (the caller seals it).

### `src/integrations/connectors/zoom.ts`

- Line 188:

  > PHASE 153f: true when the host asked for is not a Zoom user on our account.

- Line 190:

  > PHASE 153f, 4 October 2026 — ZOOM'S "NO SUCH USER". A meeting made, or a start token asked for, under an email that
  > is not a user on our Zoom account answers 404, or an error carrying code 1001 ("User does not exist") or 1120.

- Line 204:

  > PHASE 153f, 4 October 2026: `host` — the email of the member of staff the call is assigned to, so each call has its
  > own Zoom host and two calls at the same time can both run (one Zoom user hosts one meeting at a time). Absent: the
  > shared host (ZOOM_HOST_EMAIL, else the account's owner). A host who is not a user on our account is NOT_MADE with
  > `host_unknown`, so the caller can say so and use the shared host instead.

- Line 332:

  > The host's start token (ZAK), so a member of staff starts the call as its host inside our page. Null if refused.
  > PHASE 153f: `host` — the email the meeting was made under (src/web/video-calls.ts, meetingHost); absent, the shared host.

### `src/shared/objectstore.ts`

- Line 96:

  > PHASE 153f, 4 Oct 2026: a file someone sent us on WhatsApp, fetched from Meta and kept sealed (src/web/whatsapp.ts).

## 4 Oct 2026: Phase 154a1

### `src/core/router.ts`

- Line 205:

  > PHASE 154a1 (line 3), 4 October 2026 — A REFUSED BODY CLOSES ITS CONNECTION, CLEANLY. The 3 October sweep found that
  > after a 413 on a kept-alive connection the next request on it hung about 6 s and was reset: reading stopped part-way,
  > the rest of the body was left in the connection, and the connection was kept. Now the rest of a body over its cap is
  > read and dropped - up to DRAIN_MAX more, so the sender is never cut off mid-send and sees the answer - and the 413
  > says "Connection: close", so the connection ends when the answer has gone and nothing left in it is taken for the
  > next request. A body more than DRAIN_MAX over its cap is refused at once and the connection closed under it.
  > server.ts tells this file which response each request is answered on.

- Line 270:

  > PHASE 154a1 (line 9): invisible characters out on the way in (src/core/typed.ts).

### `src/core/server.ts`

- Line 61:

  > a cap is a control. PHASE 154a1 (line 3): the web half's reader, so a body over it is a 413 that closes its

### `src/core/typed.ts`

- Line 1:

  > PHASE 154a1 (line 9), 4 October 2026 — INVISIBLE CHARACTERS ARE TAKEN OUT OF WHAT PEOPLE TYPE, ON THE WAY IN.
  >
  > The 3 October sweep typed a null and a right-to-left override into a claim note and a portal message, and both were
  > stored and shown back as typed. A direction override can make "gnp.exe" read as "exe.png" and a null can cut a value
  > short in another program, so neither belongs in anything a person typed. Taken out:
  >   - control characters, except the tab and the two line endings, which keep a note's lines as typed;
  >   - the direction marks, embeddings, overrides and isolates (U+061C, U+200E, U+200F, U+202A-U+202E, U+2066-U+2069).
  > Everything else - accents, dashes, any language's letters, emoji - is kept. Read by every form the web half reads
  > (src/core/router.ts form(), src/core/multipart.ts, src/web/messages-pages.ts); a password is never changed (KEEP_AS_SENT).

## 4 Oct 2026: Phase 155

### `src/core/cli.ts`

- Line 171:

  > PHASE 155 (lines 1-2). The Welsh or Scottish care regulator's downloaded list into a table on this server
  >        (src/web/register-files.ts). Importing switches nothing on: each lookup stays behind its own switch, off.

- Line 201:

  > PHASE 155 (line 4). The BCIS index from a file Lakhbir downloads, kept OUTSIDE the repository (src/web/bcis-index.ts).

### `src/integrations/connectors/free-registers.ts`

- Line 58:

  > What to ask, from the client's record and what earlier lookups on this click found. Phase 155: and the database,
  >  for the registers imported on this server.

- Line 104:

  > PHASE 155: the Welsh and Scottish care regulators, read from their imported lists on this server.

- Line 127:

  > PHASE 155 (line 3): read at last. Not "we do not hold it" — the licence itself does not allow our use.

- Line 159:

  > PHASE 155: the Scottish datastore's beds, where it states them, are the same fact as CQC's registered beds. Its
  >      "Registered_Places" and CIW's "Maximum no. of places" are NOT mapped: a place is not always a bed (a day service, a
  >      care at home service), and the derivation layer reads a bed count. Its service words are each regulator's own
  >      vocabulary, which derive() does not read either, so they are kept and not mapped.

### `src/integrations/connectors/register-files.ts`

- Line 1:

  > THE WELSH AND SCOTTISH CARE REGULATORS — A PROPERTY'S REGISTERED SERVICE, ITS PLACES AND ITS PROVIDER.
  > Phase 155 (lines 1 and 2), 4 October 2026. Switched off: REGISTER_SWITCHES.CIW and REGISTER_SWITCHES.CARE_INSPECTORATE.
  >
  > THE SAME SHAPE AS THE ENGLISH ONE (src/integrations/connectors/cqc.ts) — registration, places, provider — and the same match:
  > the services at the typed postcode, scored on their address lines against the typed address, and only one clear
  > ACCEPT taken (or a person's pick of a close one). BUT NOTHING IS SENT OUTSIDE. Neither regulator has an API; each
  > publishes a downloadable list, which a person imports into a table on this server (src/web/register-files.ts,
  > `node src/core/cli.ts import-register`). This reads that table, as the ONS postcode lookup reads its own. No list
  > imported, no lookup: it says so, and the fact stays asked (N4).
  >
  >   CIW                Wales only (CB_JURIS: regulator_social "CIW"). Places = "Maximum no. of places".
  >   CARE_INSPECTORATE  Scotland only (CB_JURIS: regulator_social "CARE_INSPECTORATE"). Places = "Registered_Places",
  >                      and beds where the datastore states them (TotalBeds).
  >
  > WHAT IS KEPT: the regulator's own references for the service and its provider, the kind of service, the places, the
  > registration date the file gives (the Scottish service's; the Welsh file has only the provider's), the council
  > area and the UPRN where stated — the fields the source register permits. NEVER a name: the import never read one.
  > A service the Scottish datastore lists as Inactive is kept with that status, so a person sees it is not active.

### `src/integrations/connectors/registers.ts`

- Line 126:

  > PHASE 155 (line 1): BUILT — Care Inspectorate Wales's directory, imported on this server (src/integrations/connectors/register-files.ts). Still off.

- Line 128:

  > PHASE 155 (line 2): NEW — the Care Inspectorate (Scotland), its datastore imported on this server the same way. Off.

- Line 132:

  > PHASE 155 (line 3): NOT BUILT, AND NOT BUILDABLE AS THINGS STAND — the VOA's licence restricts its rating list to
  >      business rates purposes (the source register's VOA_RATING_LIST). The switch stays so a case stamp reads as before.

### `src/integrations/registers/name-exclusion.ts`

- Line 470:

  > Subitem 16. PHASE 155 (line 1), 4 October 2026 — Care Inspectorate Wales, BUILT AT LAST, so it needs its own
  > entry: the one door writes under the SOURCE REGISTER's id, CIW, and subitem 2 (CARE_REGULATORS_DEVOLVED) is a
  > policy written before any of the three devolved regulators had a connector, under an id nothing writes. It stays,
  > for RQIA (Northern Ireland), which has none still. CIW's directory download (SUPPLIER_DOCS, CIW) names each
  > service's Responsible Individuals and Registered Persons, and gives the provider's NAME — which for a sole trader
  > or a partnership is a person's. None is read: the import reads named columns only (09-app/backend/src/web/
  > register-files.ts), and these are excluded here as the second line.

- Line 494:

  > Subitem 17. PHASE 155 (line 2), 4 October 2026 — the Care Inspectorate (Scotland), built the same way. Its
  > datastore names a manager and gives a telephone number and an email for each service, and names the provider:
  > none is read.

### `src/integrations/registers/source-register.ts`

- Line 293:

  > PHASE 155 (line 3), 4 October 2026 — READ, AND IT DOES NOT ALLOW OUR USE. This row said "VOA_OPEN" and the Open
  >        Government Licence; neither was ever true. The VOA's bulk rating list download page
  >        (voaratinglists.blob.core.windows.net/html/rlidata.htm, read 4 October 2026, an "I Agree" before any file) says
  >        "An open government licence does not apply", and its terms (tax.service.gov.uk/view-my-valuation/terms-and-
  >        conditions) say "Publication of this information and its use is restricted to Non Domestic Rating (NDR) purposes
  >        only": for interested persons, councils, their representatives and those who serve them, passed on only for the
  >        same purposes, deleted when no longer needed for them. A capital allowances claim is not a rating purpose. So
  >        every channel is FALSE — internal too — and nothing is imported (Phase 155 line 3; the phase9 importer
  >        04-phase-work/phase9/caprebate-voa-import.ts stays unshipped). Only the VOA could permit our use.
  >        SCRAPPED, the same day: Lakhbir, "scrap the VOA rating". Not to be reopened (ACTION-PLAN COORDINATES,
  >        "DECIDED - DO NOT REOPEN"). The row stays so the panel can say why it is not used.

- Line 757:

  > PHASE 155 (line 1), 4 October 2026: built — a downloaded file, imported on this server (09-app/backend/src/web/
  >        register-files.ts), never a call per client. CIW publishes its whole directory as one CSV; there is no API. Its
  >        file has no registration status and no service registration date (only the provider's), so neither is kept.
  >        BULK, not API: the file is downloaded by a person. The named Responsible Individuals and Registered Persons are
  >        in the file and are never read.

- Line 775:

  > PHASE 155 (line 2), 4 October 2026: the Care Inspectorate, Scotland's care regulator — new. Its datastore is a
  >        monthly CSV of every registered care service, under the Open Government Licence; there is no API. Imported on
  >        this server like CIW's. Its file names a manager and gives a telephone number and an email for each service:
  >        none is ever read.

- Line 1115:

  > PHASE 155, 4 October 2026 — three sources read for their terms before any code (the phase's own rule).

## 4 Oct 2026: Phase 156f

### `src/integrations/connectors/registers.ts`

- Line 142:

  > PHASE 146d, item 18: the paid planning route, built beside PlanIt. It is not a row on the research panel — the
  >      register source it reads for is PLANNING — so it is a switch with no catalogue entry.
  >      PHASE 153b, 4 October 2026 (Word question 202, Lakhbir's): CHOSEN, on our recommendation — Homedata, by the
  >      property's own number, about 5p on the same click as the address lookup, after the engagement letter is signed;
  >      PlanIt kept built as the free fallback. See PLANNING_ROUTE below. STILL OFF until the Homedata account is open.
  >      PHASE 156f, 6 October 2026: the account is open (Lakhbir: "planning history - use homedata"). Still false here, for
  >      real clients; on for the test website only, through TEST_WEBSITE_PAID_LOOKUPS below.

## 5 Oct 2026: Phase 156a

### `src/integrations/connectors/smoke.ts`

- Line 72:

  > PHASE 156a: the part of the UK, when the person running the test says it (--nation). Otherwise the ONS table.

- Line 74:

  > PHASE 156a: the council area, when the person running the test says it (--council). CQC searches by council.

- Line 93:

  > Left unsaid unless the person running the test says it (--nation, Phase 156a): the ONS lookup is what says which

- Line 165:

  > PHASE 156a: a council area the person typed stands where the ONS table's answer would (CQC searches by council).

### `src/integrations/connectors/test-lookups.ts`

- Line 66:

  > PHASE 156a: the Ordnance Survey building outlines (the report's site plan). Only ever at the public test point.

- Line 470:

  > PHASE 156a: ONE square of map round the public test point (70 Whitehall, Historic England's grid reference, the
  >        same point the land boundary test uses). No point, postcode or address may be typed, so no client's can be.

- Line 523:

  > PHASE 156a: the person running it may say which part of the UK the address is in. Never assumed.

## 5 Oct 2026: Phase 156c

### `src/core/audit.ts`

- Line 399:

  > PHASE 156c: a chat exported on the WhatsApp phone, uploaded for checking, then saved to the record (counts only).

### `src/core/router.ts`

- Line 394:

  > PHASE 156c: the WhatsApp pages' one script, which opens an exported chat on the person's computer.

### `src/core/staff.ts`

- Line 434:

  > ------------------ SECTION 3 · a WhatsApp chat exported on the phone, added by hand (Phase 156c)

### `src/integrations/connectors/whatsapp-export.ts`

- Line 1:

  > PHASE 156c, 5 October 2026 — READING A CHAT EXPORTED FROM THE WHATSAPP PHONE. No network, no Meta.
  >
  > Lakhbir chose a manual upload (5 Oct 2026: "go with manual upload, keep photos"): staff talk to clients on the
  > WhatsApp phone, and to keep a conversation they export that one chat (Export chat > Attach media) and upload the
  > .zip on the client's WhatsApp page. This file turns the export's text into messages; src/web/whatsapp-import.ts
  > checks them with a person and saves them.
  >
  > THE TWO LAYOUTS (read from a real iPhone export's 5 October lines only, every word masked, used with consent; and
  > WhatsApp's documented Android form):
  >   iPhone   [05/10/2026, 13:36:43] Name: text           (24-hour; or 1:36:43 PM, with a narrow space before PM)
  >   Android  05/10/2026, 13:36 - Name: text              (no seconds)
  > Lines without a date belong to the message above. Messages are separated by CRLF on the iPhone, while a message's
  > own line breaks are a bare LF; both are read the same way here. A U+200E (left-to-right mark) may stand before the
  > line, before an attachment and before WhatsApp's own words; it is never part of what a person wrote.
  >
  > WHAT IS RECOGNISED: an attachment ("<attached: FILE>" on the iPhone, "FILE (file attached)" on Android, with any
  > words before it kept as its caption); a file left out of the export ("<Media omitted>", "image omitted"); a deleted
  > message ("This message was deleted." / "You deleted this message."), kept as WhatsApp wrote it; an edit
  > ("<This message was edited>"), marked; WhatsApp's own notices (end-to-end encryption, joined, changed number…),
  > skipped. An empty message is skipped.
  >
  > DATES are read day first (UK). If no day number in the file is above 12, month first would also make sense, and
  > the check step says so. TIMES are UK local time (Europe/London), turned into an exact moment across the clock
  > change; the export carries no time zone.

### `src/shared/objectstore.ts`

- Line 98:

  > PHASE 156c, 5 Oct 2026: a WhatsApp chat exported on the phone and uploaded for checking — its text, and a small .zip
  >  whole (src/web/whatsapp-import.ts). Kept sealed, like the files themselves.

### `src/shared/zip.ts`

- Line 77:

  > PHASE 156c: THE NAMES IN A ZIP, in the order its central directory lists them. The same walk as above, reading names
  > only; nothing is inflated. Throws like the reader when the file is not a zip.

## 5 Oct 2026: Phase 156d

### `src/core/audit.ts`

- Line 395:

  > PHASE 156d: how long a video call lasted, asked of Zoom by a member of staff. The state only, never Zoom's answer.

### `src/core/cli.ts`

- Line 1:

  > The documented commands. A clean checkout runs these and nothing else.
  >
  >   npm install
  >   npm run migrate      create or update caprebate.db
  >   npm run seed         invented data + one user per role
  >   npm run verify-audit recompute the audit log's hash chain; exit 1 if it is broken
  >   node src/core/cli.ts sweep-originals   delete every kept original whose time is up (KEEP_ORIGINALS; off, so none)
  >   node src/core/cli.ts send-outbox       send every email saved while sending was on (EMAIL_SENDING; off, so none)
  >   node src/core/cli.ts read-mailbox      read new replies to contact@caprebate.co.uk, read-only (INBOUND_EMAIL; off, so none)
  >   node src/core/cli.ts sweep-messages    delete every chat message past its period (MESSAGE_RETENTION; off, so none)
  >   node src/core/cli.ts sweep-enquiries   delete every closed website enquiry past its period (ENQUIRY_RETENTION, Phase 153c; off, so none)
  >   node src/core/cli.ts import-premises <CQC_CARE_DIRECTORY|NHS_ODS_DENTAL|NHS_ODS_GP> <file> --by <user id>   healthcare premises, no names (Phase 153c)
  >   node src/core/cli.ts sector-ranges     propose each sector's range from approved survey packs; changes nothing (Phase 153e)
  >   node src/core/cli.ts sweep-land-boundaries   delete every kept land boundary file past the licence's 35 days
  >   node src/core/cli.ts seal-app-secrets  seal every authenticator app secret still kept as text (CAPREBATE_MFA_KEY, Phase 151k)
  >   CAPREBATE_LIVE_SMOKE=1 node src/core/cli.ts smoke <SOURCE> --who W --why Y   one logged test lookup (Phase 151g)
  >   node src/core/cli.ts smoke-switched-on <SOURCE> --who W --why Y   record a switch-on; the count of three starts again
  >   CAPREBATE_LIVE_SMOKE=1 node src/core/cli.ts smoke HMLR_INSPIRE --who W --why Y   one council's land boundary file, the same way (Phase 151l)
  >   CAPREBATE_LOCAL_ZOOM=1 node src/core/cli.ts zoom-call-length <meeting id>   ask Zoom how long one call lasted (Phase 156d)
  >   npm start            the server
  >   npm run check        lint:sql, typecheck, tests

- Line 374:

  > PHASE 156d, 5 October 2026. Ask Zoom how long ONE call lasted and how many joined: Phase 156d's step B1, to learn
  >      whether our free Zoom plan gives it. Read only; it makes, moves and keeps nothing, and prints two numbers or Zoom's
  >      own code and words, never a name or an email. Like every Zoom call from a copy that is not the test website, it
  >      needs CAPREBATE_LOCAL_ZOOM=1 (src/integrations/connectors/zoom.ts, zoomPlaceRefusal). The audit line goes to a scratch log.

### `src/core/staff.ts`

- Line 346:

  > PHASE 156d: booked over another video call on the same Zoom user: the call's own page says so. A warning only.

- Line 387:

  > PHASE 156d: ask Zoom how long a video call lasted and how many joined. Those who arrange calls, after it began.

- Line 412:

  > PHASE 156d: the free plan's 40 minutes, a call booked over another on the same Zoom user, and how long it lasted.

- Line 1148:

  > PHASE 156d: what the call's page says about Zoom beyond the join button.

### `src/integrations/connectors/zoom.ts`

- Line 65:

  > PHASE 156d: the words that say a paid plan is in use. Anything else, or nothing, is the free plan.

- Line 68:

  > PHASE 156d: true unless ZOOM_PLAN says a paid plan. The free plan is the default, on purpose (5 Oct 2026).

- Line 73:

  > PHASE 156d: the free plan's limit, said plainly where a video call is booked and in its invitation.

- Line 218:

  > PHASE 156d: the free plan has no cloud recording, so only a paid plan is asked to record a walkthrough there.

- Line 262:

  > PHASE 156d, 5 October 2026 — HOW LONG A CALL LASTED, AND HOW MANY JOINED. GET /v2/past_meetings/{meetingId} gives the
  > last time the meeting ran: its length in minutes ("duration") and how many joined ("participants_count");
  > where it does not say how many, GET .../participants with page_size 1 gives the count ("total_records"). Scopes
  > meeting:read:past_meeting:admin and meeting:read:list_past_participants:admin (added by Lakhbir on 5 Oct 2026).
  > Only two numbers are kept: never a name, an email or anything else from the answer.
  > Zoom may keep this from a free plan; then the screens say "not shown on our Zoom plan", so nobody thinks it broke.

## 5 Oct 2026: Phase 156e

### `src/core/router.ts`

- Line 398:

  > PHASE 156e: the Connections page's one script, which trims a care regulator's list on the Admin's computer.

### `src/core/staff.ts`

- Line 438:

  > ------------------ PHASE 156e · every outside service on one page, and the care regulators' lists (Admin)

### `src/integrations/connectors/sources.ts`

- Line 349:

  > THE TRANSFER: Approved FOR TESTING on 5 October 2026 - Sadique Maskeen (data protection officer) approved Anthropic
  >        as the document reader and the director signed, as relayed by Lakhbir in the chat with Claude (Phase 156e A2):
  >        "Yes, for testing". Invented documents only. This opens the transfer and nothing else: both reading switches
  >        (src/integrations/connectors/claude.ts, CLAUDE_SWITCHES) stay OFF, and ANTHROPIC_API_KEY is in the key file only, not in
  >        Vercel and not in TEST_DEPLOY_KEYS, so the test website reads nothing. To be confirmed before real clients.

### `src/integrations/connectors/test-lookups.ts`

- Line 69:

  > PHASE 156e, 5 October 2026 (B1): THE DOCUMENT READER, ONE READ OF ONE INVENTED PAGE. Anthropic was approved for
  > testing that day (src/integrations/connectors/sources.ts, CLAUDE_DOCUMENTS). The page is a contractor's cost breakdown made up
  > here, with no name, address or number of anyone: it goes through the pipeline's own strip (`sanitise`) and its guard,
  > exactly as a client's would. The reading switch is turned on FOR THIS ONE CALL ONLY, in this process; the switch that
  > ships stays off. Nothing is kept: the answer is counted and thrown away.

## 5 Oct 2026: no phase named

### `src/integrations/connectors/sources.ts`

- Line 284:

  > THE TRANSFER: Approved 5 October 2026 by Sadique Maskeen (data protection officer), as relayed by Lakhbir in the chat with Claude: "cloud fare - its approved". A test build; the approval is for testing and is to be confirmed before real clients. From now on the server checks each enquiry's answer with Cloudflare, and an enquiry whose answer is missing or rejected is refused.

### `src/integrations/connectors/whatsapp-export.ts`

- Line 61:

  > WhatsApp's own words about the chat itself, never a person's: skipped. Kept narrow on purpose (5 Oct 2026: a broad
  >  "… added …" pattern swallowed 212 view-once notices in a real export, because their wording contains "added").

## 6 Oct 2026: Phase 156f

### `src/core/router.ts`

- Line 402:

  > PHASE 156f: the assessment's address box's one script (src/web/address-lookup-script.ts).

- Line 793:

  > PHASE 156f (B1): THE ADDRESS BOX'S LIST, FOR THE PAGE'S SCRIPT. The postcode a person has typed on "Your details",
  >      once it is a complete UK postcode: the addresses there, as JSON, through the same search (and the same £1 a day
  >      cap) as the "Find my address" button. Only for an assessment already at that screen.

- Line 1843:

  > "Find my address" (Homedata since Phase 156f): its switch, its key and its outside-call row.

- Line 1859:

  > PHASE 156f (B1): ONE SEARCH FOR THE ADDRESS BOX, for the button and the page's script alike. A postcode already searched
  > in this assessment is not searched again (the list stands, and narrowing it is free); otherwise Homedata is asked once,
  > inside the £1 a day cap (today's searches from the audit log, and this visitor's from the draft).

- Line 1879:

  > PHASE 156f: the funnel's pages, with the address box's one script on "Your details" while "Find my address" is on.

### `src/core/saved-keys.ts`

- Line 118:

  > Phase 156f: the same key answers "Find my address" at the assessment (ADDRESS_LOOKUP), in place of GoAddress.

### `src/core/secrets.ts`

- Line 118:

  > Phase 156f: the same key answers "Find my address" at the assessment (src/integrations/connectors/address-lookup.ts), since GoAddress was removed.

### `src/integrations/connectors/address-lookup.ts`

- Line 1:

  > "FIND MY ADDRESS" — A POSTCODE TO THE ADDRESSES THERE, THROUGH HOMEDATA. Phase 156f, 6 October 2026.
  >
  > Lakhbir, 6 October 2026: "one address box on Homedata, with GoAddress removed - yes". Until then the box used
  > GoAddress (30 Sep 2026), whose answer carried no UPRN and listed one hospital five times under different spellings;
  > its free 100 lookups were used up and its paid plan was never taken. Homedata gives every address at a postcode with
  > its UPRN — Ordnance Survey's number for one addressable property — so the address the client picks is the exact key
  > the paid research step after signing starts from (src/integrations/connectors/homedata.ts checks it still belongs to the address
  > and postcode the client gave, and goes back to the postcode search when it does not). GoAddress is removed: its
  > connector, its key, its outside-call row, its tests and its Connections row (PHASE-HISTORY, Phase 156f).
  >
  > THE CALL: GET https://api.homedata.co.uk/address/postcode/{postcode}/ with "authorization: Api-Key <key>"
  > (HOMEDATA_API_KEY, never Bearer). 2 tokens = 2p. WHAT IS SENT: THE POSTCODE, AND NOTHING ELSE. The person picks their
  > address from the list, or says it is not there and types it; nothing is chosen for them. The answer, as the live
  > service gives it (read 6 Oct 2026): every address at the postcode with uprn, address, building_name,
  > building_number, sub_building, street and town. Anything unreadable is "not found", never a guess.
  >
  > WHAT IS NOT A BUILDING IS NOT SHOWN (`NOT_A_BUILDING`): a postcode's list holds advertising rights, moored vessels and
  > development sites beside the buildings (St Thomas' Hospital's postcode, 6 Oct 2026). "My address is not in the list"
  > is always offered.
  >
  > THE CAP — £1 A DAY (Lakhbir, 6 Oct 2026: "yes please"). The assessment is public, so a robot can press the box. At
  > most 50 postcode searches a calendar day, UK time (50 × 2p = £1), counted from the audit log's CONNECTOR_CALLED rows
  > for this service, and at most 5 for one visitor (one assessment). Past either, the box says to type the address and
  > nothing is sent. A postcode already searched in the same assessment is not searched again: narrowing the list is free.
  >
  > SWITCHED ON FOR TESTING under a recorded waiver (the privacy notice is unpublished and does not name Homedata yet).
  > Homedata holds its data in the UK, so no transfer approval is needed; naming it in the privacy notice is, for real
  > clients. Needs the key.

### `src/integrations/connectors/free-registers.ts`

- Line 109:

  > The order a click runs the lookups in: the postcode table, then (PHASE 156f) the paid address lookup and the site
  > boundary read off it — so a click after signing hands the property's UPRN to the energy certificates and to Homedata
  > planning — then FREE_CONNECTORS's order, then everything else as the catalogue lists it.

### `src/integrations/connectors/homedata-planning.ts`

- Line 68:

  > PHASE 156f: the entity id prefix of a planning record Homedata answered.

- Line 71:

  > PHASE 156f (B3): HOMEDATA'S PLANNING ANSWER IS THE ONE THE CASE USES AND SHOWS. True once Homedata has answered this
  > client's PLANNING row (research_sources.route, migration 092) — even with no applications, which is an answer too.
  > Then a screen that lists register records leaves out the free route's planning records (kept, not shown).

- Line 104:

  > PHASE 156f: the live answer (6 Oct 2026, 10 Downing Street) names it `proposal`; `description` is the prose's name.

- Line 150:

  > PHASE 156f: the live answer says of each application whether its postcode matches the property's. One that says
  >          it does not is left out: it is not known to be this building's (N4).

- Line 155:

  > PHASE 156f: its own entity ids, so a reference the free route already holds is kept beside it, not skipped.

### `src/integrations/connectors/homedata.ts`

- Line 82:

  > PHASE 156f (B4): ask for the title outline too (`title_boundary`, 5 tokens) on the same property call. Set from the
  > HOMEDATA_BOUNDARY switch (paid-registers.ts and research.ts); absent or false, the slug is not asked for.

- Line 111:

  > The slugs for one lookup: the two always asked, `dimensions` only with its switch on, and (Phase 156f) the title
  >  outline only with HOMEDATA_BOUNDARY on.

- Line 214:

  > PHASE 156f: the names the live answer uses (read 6 Oct 2026 at a public postcode): sub_building, building_name,
  >      building_number, street, town. The older names from the supplier's prose are still read.

- Line 265:

  > PHASE 156f: the live answer (6 Oct 2026, 10 Downing Street) names it `title_no`, and gives no `tenure` but a
  >      `title_class` ("Absolute freehold title"). Until then this read only the prose's names and said "no registered
  >      title" for a property that has one.

- Line 285:

  > PHASE 156f (B1): DOES THE UPRN THE CLIENT PICKED BELONG TO THE ADDRESS AND POSTCODE THEY GAVE? The property call's own
  > answer is read back: its postcode must be the property's, and its address must match the one typed at the EPC
  > threshold (accept, not review). Anything less is a mismatch, and the lookup goes back to the postcode search.

- Line 326:

  > 0 · PHASE 156f (B1): THE UPRN THE CLIENT PICKED AT THE ASSESSMENT, so the 2p postcode search is not made again. It
  >        is used only when its own answer belongs to the address and postcode they gave (uprnBelongs); a mismatch goes
  >        back to the postcode search below. A back-office pick (`chosen`, `review`) is about the search's list, so a
  >        click carrying one goes straight to the search.

- Line 387:

  > PHASE 156f (B4): the title outline's area, worked out here and handed on in the facts; the HOMEDATA_BOUNDARY
  >      lookup on the same click keeps it (paid-registers.ts). The outline itself goes no further than this function.

### `src/integrations/connectors/nations.ts`

- Line 24:

  > PHASE 156f: the UPRN the client picked from the Homedata list at the assessment (migration 092), or null. A
  > client's pick, not a register fact: the paid address lookup checks it belongs to this address before it uses it.

### `src/integrations/connectors/paid-registers.ts`

- Line 68:

  > PHASE 156f: what the address lookup worked out from the title outline on this click, if it asked for it.

- Line 77:

  > PHASE 156f: the title outline is asked for on the same call when HOMEDATA_BOUNDARY is on. A click passes its own
  >        switches (src/web/research.ts sets `boundary` from them); this default reads the copy's own.

- Line 82:

  > PHASE 156f (B4): no call of its own. Its 5p is the title_boundary slug on the address lookup's call, counted here so
  >      the figure before the click includes it only when this switch is on.

- Line 89:

  > PHASE 156f (B3): CHOSEN AND RUNNABLE (Lakhbir, 6 Oct 2026: "planning history - use homedata"). It is not a row of
  >      its own: after signing it answers the PLANNING row in place of the free route (src/web/research.ts,
  >      planningRoute), keyed on the UPRN the address lookup found and checked on this click.

- Line 114:

  > BUILT AND NOT CHOSEN. Empty since Phase 156f (6 October 2026), when Homedata planning was chosen and moved into the
  > map above. Kept so a route built and not chosen has one place to wait, as Homedata planning did from 146d to 156f.

- Line 130:

  > PHASE 156f: Homedata planning answers the PLANNING row after signing, so its 5p counts when PLANNING is asked and
  >      its own switch is on.

### `src/integrations/connectors/registers.ts`

- Line 150:

  > PHASE 156f (B4), 6 October 2026 — THE SITE BOUNDARY FROM HOMEDATA (Lakhbir: "site boundary - use home data"). The
  >      title outline (`title_boundary`, 5p) on the paid address lookup's own property call, kept as one area under its own
  >      source (src/integrations/connectors/title-boundary.ts). A paid lookup: after signing, on the click. False here; on for the test
  >      website only, through TEST_WEBSITE_PAID_LOOKUPS.

- Line 177:

  > PHASE 156f, 6 October 2026: confirmed by Lakhbir ("planning history - use homedata") and built to run. Before the
  >      letter is signed the free route answers; after it, Homedata by the property's number, and its answer is the one used
  >      and shown (src/integrations/connectors/homedata-planning.ts, preferHomedataPlanning).

- Line 219:

  > 6 OCTOBER 2026 — THE PAID HOMEDATA LOOKUPS, SWITCHED ON FOR THE TEST WEBSITE ONLY. Lakhbir opened the Homedata account
  > (a card added, 6 Oct 2026), put HOMEDATA_API_KEY into Vercel and asked for it to work on the test website; a logged
  > test lookup passed the same morning (5p). Kept apart from TEST_WEBSITE_LOOKUPS on purpose: THIS LIST WAIVES NOTHING.
  > It only turns the switch on where the waiver holds. A paid lookup still runs only for a client whose engagement letter
  > is signed and only when a person clicks "Run the research" (on the test website, the seeded invented clients), and it
  > still needs its key. PHASE 156f, the same day: planning from Homedata (HOMEDATA_PLANNING, in place of the free route
  > after signing) and the site boundary (HOMEDATA_BOUNDARY), from Lakhbir's decisions in the chat.

### `src/integrations/connectors/smoke.ts`

- Line 76:

  > PHASE 156f: a public property's UPRN, standing where the paid address lookup's would (Homedata planning is keyed on it).

### `src/integrations/connectors/sources.ts`

- Line 335:

  > PHASE 156f, 6 OCTOBER 2026 — "Find my address" at the assessment (src/integrations/connectors/address-lookup.ts), in place of
  >        GoAddress (removed the same day). Homedata's postcode search: GET /address/postcode/{postcode}/, 2 tokens (2p).
  >        What is sent: a postcode, nothing else. UK, so no transfer. Its own row, not HOMEDATA_ADDRESS's, because it is not
  >        a register lookup for a signed client: it runs on the public assessment, before anything is signed, and nothing
  >        from it is stored as a register fact. It shares Homedata's bucket (one API key is what the supplier limits).
  >        Past our own £1 a day cap (ADDRESS_SEARCH_CAP) the box makes no call at all.

### `src/integrations/connectors/test-lookups.ts`

- Line 284:

  > PHASE 156f: a property number is never a default, so it always needs --not-a-client.

- Line 333:

  > PHASE 156f: a transport that also writes each answer's body to a file in `dir` (one per call, numbered, named by the
  > path without its query). The key is in a header and is never written; the path and the body are.

- Line 508:

  > PHASE 156f: --save-answers <folder> keeps each answer's body, as the service sent it, in a folder OUTSIDE the
  >        repository, so a person can make a recorded answer (a test fixture) from a real one. Public values only, as every
  >        smoke test; the log line is the same. The folder is the person's to read and then delete.

- Line 530:

  > PHASE 156f: --uprn, for Homedata planning, which is keyed on the property's number. A public property's only.

### `src/integrations/connectors/title-boundary.ts`

- Line 1:

  > PHASE 156f, 6 October 2026 — THE SITE AREA FROM HOMEDATA'S TITLE OUTLINE (B4). Lakhbir: "site boundary - use home data".
  >
  > Homedata sells the outline of the property's registered title as the `title_boundary` slug (5 tokens, 5p), on the same
  > /property/{uprn}/ call the paid address lookup already makes after signing (src/integrations/connectors/homedata.ts). This file
  > turns that outline into ONE number, `site_area_m2`, with the area code the land boundary already uses: the boundary
  > module's `parseBoundaryGeometry` and `computeSiteArea` (09-app/backend/src/registers/caprebate-boundary-import.ts), the same
  > pair src/integrations/connectors/site-area.ts reaches through `fetchAndImportBoundary`. Nothing here measures an area itself.
  >
  > THE COORDINATES. The boundary module computes an area only in British National Grid (EPSG:27700) and refuses degrees.
  > A GeoJSON outline is normally longitude and latitude. So a ring in degrees is put onto the National Grid's own
  > projection (Transverse Mercator on GRS80, `projectNationalGrid` in src/integrations/connectors/ostn15.ts) WITHOUT Ordnance Survey's
  > OSTN15 shifts. Those shifts move a whole site by up to about 100 metres and barely bend it, so the AREA is the same to
  > well under one square metre in ten thousand; the POSITION would not be, which is why nothing here keeps a position.
  > A ring already in metres (an easting and northing) is used as it is. Anything else is refused, never guessed (N4).
  >
  > WHAT IS KEPT: the area, its grade and the UPRN it is for. NEVER the outline, a map of it, or any coordinate from it.
  > The boundary module's CURRENT_LICENCE_PERMISSION (internal calculation only) is checked by `parseBoundaryGeometry`
  > itself, and HOMEDATA_TERMS (the source register) keeps every report channel closed until Homedata's terms for title
  > outlines are confirmed. So the figure is for our own checks, as the INSPIRE one is.

### `src/integrations/registers/name-exclusion.ts`

- Line 448:

  > Subitem 18. PHASE 156f, 6 October 2026 — THE SITE AREA FROM HOMEDATA'S TITLE OUTLINE (Lakhbir: "site boundary - use
  > home data"). Without an entry the one door would refuse the area with E_UNKNOWN_SOURCE, so the entry comes with the
  > code that writes it (09-app/backend/src/connectors/title-boundary.ts), as HMLR_INSPIRE's did.
  >
  > The answer Homedata sends (read live on a public address, 6 Oct 2026) is a title number and a polygon. The title
  > number is excluded for the reason HMLR_INSPIRE gives: it leads straight to the register's proprietor. The polygon
  > is turned into one area and never kept. What is kept is the area, its grade and the property's UPRN.

### `src/integrations/registers/source-register.ts`

- Line 966:

  > PHASE 156f (B4), 6 October 2026 — THE SITE AREA FROM THE TITLE OUTLINE, VIA HOMEDATA. Lakhbir: "site boundary - use
  > home data". Homedata's `title_boundary` slug (5 tokens) on the paid address lookup's own property call; the outline
  > is turned into one area by the boundary module (09-app/backend/src/connectors/title-boundary.ts) and THE OUTLINE IS
  > NEVER KEPT. Its own source, so nobody reads the area as HM Land Registry's own file (HMLR_INSPIRE) or as an address
  > fact (HOMEDATA_ADDRESS). Grade B at best, as HMLR_INSPIRE: a reseller's copy of HM Land Registry's index polygon,
  > which "cannot" establish the extent of a title. HOMEDATA_TERMS keeps every report channel closed: internal only,
  > as the INSPIRE area is, until Homedata's terms for title outlines are confirmed.

## 6 Oct 2026: Phase 157

### `src/core/audit.ts`

- Line 202:

  > Phase 157: a firm's signature of our introducer terms recorded (migration 094).

## 6 Oct 2026: Phase 157c

### `src/core/audit.ts`

- Line 81:

  > PHASE 157c: the engagement letter sent (or sent again) to the client's logins; whether it was a re-send, and how many.

### `src/core/authz.ts`

- Line 517:

  > PHASE 157c: prepare the engagement letter and send it to the client's logins (src/web/engagement-send.ts).

### `src/core/multipart.ts`

- Line 134:

  > PHASE 157c (the Friary House run, F17): a file that was chosen but holds nothing arrives with its name and no bytes;

- Line 185:

  > PHASE 157c (the Friary House run, F17): a file that was chosen but holds nothing arrives with its name and no bytes;

### `src/core/router.ts`

- Line 406:

  > PHASE 157c: the engagement letter's signing pad (src/shared/signature-pad-script.ts).

- Line 1452:

  > PHASE 157c: the signed copy - the letter, the signature page and the certificate of completion - for the client.

- Line 2347:

  > PHASE 157c (the Friary House run, F13): the assessment shows a ceiling, "up to £X", and never a low end, so
  >            this says the same. It said "£127,500 to £255,000", a range the client was never shown.

- Line 2515:

  > PHASE 157c (F8): the town only where the property's words do not already carry it.

- Line 2556:

  > PHASE 157c: the letter page. While the letter can be signed (the signing form, and its pad, are on the page), every
  > page's policy plus OUR OWN script, the signing pad's. Otherwise exactly every page's policy, with no script at all.

- Line 2612:

  > PHASE 157c: the pad, and its one script, only while the letter can be signed

### `src/integrations/connectors/nations.ts`

- Line 74:

  > PHASE 157c: the nation from the postcode check's country (postcodes.io: "England", "Wales", "Scotland", "Northern
  > Ireland"). Anything else - the Channel Islands, the Isle of Man, a blank - is not a nation we cover, so null (N4).

### `src/shared/pdf.ts`

- Line 12:

  > PHASE 157c, 6 October 2026 — A DRAWN SIGNATURE. Strokes as points from 0 to 1000 across and down a box, drawn as
  > plain vector lines (no image), so the same strokes always give the same bytes. `width` and `height` are the box's
  > size in points. A line with ink has no text; it takes the box's height on the page.

### `src/shared/signature-pad-script.ts`

- Line 1:

  > THE SIGNING PAD'S ONE SCRIPT — served at /assets/signature-pad.js, and named only by the engagement letter page while
  > the letter can be signed (src/core/router.ts, letterPage). PHASE 157c, 6 October 2026.
  >
  > Lakhbir: "cant it be a docusign style document which captures a signed digital copy?" The client draws their
  > signature in a box with a finger, a pen or a mouse. The strokes go back with the form as numbers from 0 to 1000
  > across and down the box (signature_strokes), and the signed PDF draws them as lines (src/shared/pdf.ts, Ink). Nothing
  > is sent anywhere else, and nothing is kept in the browser.
  >
  > IF IT CANNOT RUN (no script, an old browser), the box says so and the client can still sign with their typed name,
  > by ticking "Use my typed name as my signature" (src/web/signing.ts accepts one or the other, never neither). It sets
  > no style and no HTML from anything typed: it only draws on its own canvas and fills its own hidden field.

## 6 Oct 2026: Phase 157d

### `src/core/audit.ts`

- Line 83:

  > PHASE 157d: staff recorded who must sign the letter

### `src/core/router.ts`

- Line 436:

  > PHASE 157d: SIGNING FROM THE LINK IN THE LETTER EMAIL — no login. The link is the key: single use, out of date
  >      after SIGN_LINK_DAYS, one login's, one letter's. Opening it (a GET, which email scanners also make) signs nothing and
  >      uses nothing; only the signed form uses the link. Off unless the signing setting says `links`.

- Line 1541:

  > PHASE 157d (F18): the same file sent before — the day only, which says nothing about anyone.

- Line 2570:

  > PHASE 157d: where the form posts (the portal, or a signing link), whether this signer has signed, and the steps so far.

- Line 2629:

  > PHASE 157d: the letter page's second-signer facts — whether this login has signed, and the steps so far.

### `src/core/staff.ts`

- Line 102:

  > PHASE 157d: the signing setting this copy runs under (src/web/signing.ts), for the letter's links.

### `src/integrations/registers/name-exclusion.ts`

- Line 599:

  > PHASE 157d, 6 October 2026 — four more types (the Friary House run, F16). Dates, sums, lists of figures and room

## 6 Oct 2026: no phase named

### `src/core/router.ts`

- Line 134:

  > 6 Oct 2026: signing on for testing (ENGAGEMENT_SIGNING_TEST, the test copy only). Absent is ENGAGEMENT_SIGNING, off.

### `src/core/server.ts`

- Line 132:

  > 6 Oct 2026: signing on for testing — the test copy of the letter only (ENGAGEMENT_SIGNING_TEST). Needs testLetter. api/index.mjs passes it; locally CAPREBATE_SIGNING_TEST=1.

- Line 418:

  > 6 Oct 2026: CAPREBATE_SIGNING_TEST=1 runs this copy with the test letter and signing on for testing (the test copy only).

### `src/integrations/connectors/address-lookup.ts`

- Line 71:

  > THE CAP, ONE NAMED CONSTANT. 50 searches a UK calendar day at 2p each is £1 (Lakhbir, 6 Oct 2026); 5 for one visitor,
  > which is one assessment (a draft).

## 7 Oct 2026: Phase 158a

### `src/integrations/connectors/homedata-planning.ts`

- Line 138:

  > PHASE 158a (F25, the Friary House run): a property with no applications was called "not in a form we could
  >          read", after a charged call. A count of 0 is an answer: none. An answer with no history at all says nothing
  >          either way, so the question stays asked - in those words, not "unreadable".

## 7 Oct 2026: Phase 158b

### `src/core/audit.ts`

- Line 85:

  > PHASE 158b: staff opened a survey job on a claim (src/web/survey-open.ts); whether an estimate was sealed with it. No figure.

### `src/core/router.ts`

- Line 2285:

  > PHASE 158b (F30, the Friary House run): once a register has answered, "No property registers have been checked yet"
  > is no longer true of the client's claim, though it is still true of the figure. So the note says both.

- Line 2632:

  > PHASE 158b (F22): the client's kind of business, properties, the date sent and the figure shown, for the letter.

### `src/integrations/connectors/matching.ts`

- Line 100:

  > PHASE 158b (F29, the Friary House run): "St Judes" read as STREET JUDES. A street word comes after the name, so an
  >        ST that opens a name of more than one word is a saint, whether or not the saint is on the list.

### `src/shared/html.ts`

- Line 87:

  > PHASE 158b (F32, the Friary House run): the staff footer said "no signature provider is connected" after signing was
  > built in house (157c) and switched on for the test copy (PR 32). What stays true: nothing is paid, and no real
  > contract can be signed - the test copy is never one.

## 7 Oct 2026: Phase 158c

### `src/core/audit.ts`

- Line 87:

  > PHASE 158c: a client accepted the survey report released to them (src/web/report-accept.ts). The version, never a figure.

### `src/core/authz.ts`

- Line 512:

  > PHASE 158c (F39): the client accepts the survey report released to them, in their portal (src/web/report-accept.ts). Their own act.

### `src/core/router.ts`

- Line 1380:

  > PHASE 158c (F39): the client accepts the released report (src/web/report-accept.ts).

### `src/shared/next-step.ts`

- Line 35:

  > Phase 158c: the surveyor's own approval of the survey pack (F34, F35), the client's acceptance in their portal (F39),

## 9 Oct 2026: Phase 158d

### `src/core/router.ts`

- Line 656:

  > PHASE 158d (F46): the client's accountant confirms for themselves, by the link alone (src/web/accountant-confirm-pages.ts).

### `src/core/staff.ts`

- Line 471:

  > PHASE 158d (F46): email the client's accountant a link to confirm for themselves (src/web/accountant-confirm-pages.ts).

### `src/shared/next-step.ts`

- Line 45:

  > Phase 158d (F46): the accountant answers through their own link; nobody here ticks it.

## 9 Oct 2026: Phase 159a

### `src/integrations/connectors/http.ts`

- Line 45:

  > PHASE 159a: 'manual' hands a redirect back unfollowed, for callOutside to judge; absent, every redirect is refused.

- Line 388:

  > PHASE 159a (the Lockwood run, L1): ONE REQUEST, FOLLOWING AT MOST `max` REDIRECTS — to the same host, carrying back
  > the cookies it set, or to a host the service's row names (`redirect_hosts`), carrying none. With `max` 0 the
  > transport refuses every redirect itself, exactly as before this phase. A redirect anywhere else, to http, or past
  > the limit is refused in words and nothing more is sent. The headers the caller set (a key, say) go to the same host
  > only. It is all one call: the caller writes one audit row for it, whatever happened in between.

### `src/integrations/connectors/sources.ts`

- Line 59:

  > PHASE 159a (the Lockwood run, L1, 9 Oct 2026): HOW MANY SAME-HOST REDIRECTS A CALL MAY FOLLOW, carrying back the
  > cookie each one sets. Absent or 0: none, and every redirect is refused, as before. Only HM Land Registry's INSPIRE
  > download carries one: it answers with a 302 to the same address and an AccessToken cookie it expects back.

- Line 65:

  > PHASE 159a: OTHER HOSTS A REDIRECT MAY LEAD TO, by name, https only, counted in the limit above. No cookie is ever
  > carried to one. HM Land Registry's INSPIRE download, read live on 9 Oct 2026: a 302 to the same address setting an
  > AccessToken cookie, then, with the cookie, a 302 to a signed address on its own file store
  > (datapub-prd-s3-bucket.s3.amazonaws.com), which carries its own permission in the address.

- Line 219:

  > PHASE 159a (L1): the download now answers 302 to the same address with an AccessToken cookie, then 302 to a signed

### `src/shared/engine.ts`

- Line 409:

  > PHASE 159a (C2): THE LAST DAY IS A WHOLE UK DAY. The engine compares the moment it is handed with the deadline's
  >      midnight, so at 09:00 on the last day it read the window as closed. Handed the start of today's UK date, its
  >      comparison is a comparison of UK dates: open all of the last day, closed from the next one.

### `src/shared/shown-range.ts`

- Line 53:

  > The figure the client was shown, as one line: "up to £X".
  >
  > THE HIGH END IS THE FIGURE. `CB_FUNNEL.figure` produces a CEILING and the
  > client's screen says so in terms — "A ceiling, not a forecast … researching
  > the property will move it DOWN, not up". So this renders "up to £X" and not a
  > bare number, because a bare number is the one thing that phrasing exists to
  > prevent.
  >
  > PHASE 159a (E3; Lakhbir, 9 October 2026: "always show the up to number"): AND
  > NEVER A RANGE. The client is shown "up to £X" alone, so the lead, the claim
  > record, the staff assessment pages and the portal show that too. They showed
  > "£130,000 to £260,000", a low end the client never saw, and one the engine's own
  > low did not support. The stored low stays where it is, an internal reading for
  > the reconciliation; it is not drawn on any screen through here.

## 9 Oct 2026: Phase 159c

### `src/core/audit.ts`

- Line 401:

  > PHASE 159c: a person added an event to a building on its claim (src/web/property-events.ts): ids and the kind — never a cost.

### `src/core/router.ts`

- Line 2281:

  > PHASE 159b (item 8): "move it down, not up" stops being true once later works are measured (Phase 159c), so it says what is.

### `src/core/sections.ts`

- Line 36:

  > PHASE 159c: what happened to the building, event by event, each with its own figure and documents

## 9 Oct 2026: Phase 159d

### `src/core/router.ts`

- Line 1436:

  > PHASE 159d (item 6): which way each part of the claim goes in — the claim the portal has already authorised.

### `src/shared/next-step.ts`

- Line 50:

  > PHASE 159d: the route each part of the claim takes (src/web/claim-route.ts), and a legal deadline read again.

## 10 Oct 2026: Phase 159f

### `src/core/cli.ts`

- Line 202:

  > PHASE 159f: --tpi names it BCIS's All-in Tender Price Index, the series the pack's drafts are indexed by.

- Line 217:

  > PHASE 159f. BCIS's exports — the average prices by building function (required), the elemental analyses and the
  >        location factors — kept OUTSIDE the repository (src/web/bcis-data.ts). The pack drafts its rates from them.

### `src/shared/next-step.ts`

- Line 38:

  > PHASE 159f (item 3): every rate sourced, read from the approved version.

## 10 Oct 2026: Phase 159g

### `src/integrations/connectors/companies-house.ts`

- Line 191:

  > PHASE 159g (L2): the latest accounts' type and the day they were made up to, from the profile. A dormant company
  >      carries on no trade and no property business, so it has no tax for allowances to relieve.

- Line 201:

  > PHASE 159g (L2): true only where the register says the latest accounts are dormant accounts. Not known is not dormant.

- Line 280:

  > PHASE 159g (L2): the filing history's type is the newer reading where it was read.

### `src/integrations/connectors/company-search.ts`

- Line 54:

  > PHASE 159g (L2): the type of its latest accounts, from its profile ("dormant", "micro-entity" ...). Null when none
  >  is filed or the profile could not be read — not known, never "not dormant" (N4).

- Line 59:

  > PHASE 159g, 10 October 2026 — THE LOCKWOOD RUN, L2. "Find this company" offered LOCKWOOD SURGERY PRIME HEALTH LTD
  > first: the right name and postcode, but it files DORMANT accounts, so it has no tax for allowances to relieve, and
  > nothing on the screen said so. Each match now shows its status AND its accounts type, read from its profile
  > (/company/{company_number}: accounts.last_accounts.type), and a dormant company is flagged at once. One profile call
  > per match, at most eight, under the same key, switch and recorded waiver as the search, inside Companies House's
  > published 600 in five minutes. A profile that cannot be read leaves the accounts type not known, and the match is
  > still offered.

- Line 174:

  > PHASE 159g (L2): each match's accounts type, from its profile, one call each.

### `src/integrations/connectors/price-paid.ts`

- Line 55:

  > PHASE 159g: A, a standard sale at full market value; B, "additional price paid". Null when it is not stated.

- Line 124:

  > PHASE 159g (L11): no sector is left out. A category B or "Other" sale is kept as a lead, never the price.

### `src/integrations/registers/name-exclusion.ts`

- Line 180:

  > PHASE 159g, 10 October 2026 (the Lockwood run, L2): the latest accounts' type and their date. Facts about the

- Line 246:

  > PHASE 159g, 10 October 2026 (item 6): YES or NO — the person the register names as owner is one of the
  >          client's own people (a sole trader, or a partner). Asked when a person types the official copy in, against the
  >          client's contacts, in memory; THE NAME ITSELF IS NEVER KEPT (title-by-hand.ts has no box that keeps one), as
  >          the officers check keeps only its answer (Word answer 156). A yes or no is not a name.

- Line 282:

  > PHASE 159g (L11): and the sale's category, A or B. A category B sale is a lead for the surveyor, never the price.

### `src/integrations/registers/source-register.ts`

- Line 651:

  > PHASE 159g, 10 October 2026 (the Lockwood run, L2): the type of the latest accounts ("dormant", "micro-entity",

- Line 682:

  > PHASE 159g, 10 October 2026 (the Lockwood run, L11): `ppd_category` — A, a standard sale at full market value, or
  >        B, "additional price paid" (a sale to a company, a buy-to-let, a repossession, a transfer). A category B sale, or
  >        one of type "Other", is a lead for the surveyor to confirm and never the price. Price Paid is now asked for every
  >        sector: a surgery that was once a house, or was bought by a company, can be in it.

- Line 712:

  > PHASE 159g (item 6): YES or NO, the owner named is one of the client's own people; the name is never kept.

## 10 Oct 2026: Phase 159i

### `src/core/audit.ts`

- Line 403:

  > PHASE 159i: a person recorded an event's VAT on its claim: the event and the field — never an amount.

### `src/shared/money-readings.ts`

- Line 1:

  > THE MONEY READINGS, SWITCHED ON IN TEST — PHASE 159i, 10 October 2026.
  >
  > Lakhbir, 29 September 2026: "anything you need signing off we build it, we then ask ... if its viable" — and 9 October
  > 2026, the target: "the highest figure we can defend". Each reading below is built in the survey pack, ON on the test
  > system (the test website, or a copy started with CAPREBATE_COST_MODEL_TEST=1, as the BCIS test figures are) and OFF
  > everywhere else, and each is a viability question to the tax adviser in the Word questions document (273-277):
  >
  >   grant_untraced_full     (Rulebook F, F-R12) a grant not traced to the items it paid for comes off in full, not as an
  >                           equal share of the price; a traced one comes off its items (grant_traced_to_elements)
  >   transaction_tax_in_base (#11) the stamp duty or land transaction tax paid is part of the price shared out
  >   legal_fees_in_base      (#13) the legal and other acquisition fees are part of the price shared out
  >   s185_plus_own_s25       (#1)  the buyer's own alterations to install plant (s.25) are claimed on top of the cap
  >   vat_shared_with_land    (C12) irrecoverable VAT, and those costs, are shared between the land and the building
  >
  > The public estimate's own switches (CB_CTA, in the site file) are not touched: the site harness asserts them off, and
  > they move the figure every visitor sees. The pack reads these instead, as arguments, so both ways are tested.

## 10 Oct 2026: Phase 159j

### `src/core/audit.ts`

- Line 353:

  > Phase 159j (item 5), 10 October 2026: a document tied to the piece of work on a building it proves, or untied —
  > the event it now names and the one it named before (ids only), so each event counts its own documents.

### `src/shared/money-readings.ts`

- Line 53:

  > PHASE 159j (Lockwood finding L14), 10 October 2026: THE TAX ADVISER'S SWITCHES AS THE SURVEY PACK READS THEM. The pack
  > applies the readings above on the test system, but the claim page's facts panel and the sign-off form read the public
  > estimate's own switches (CB_CTA), which stay off, so a person signing off read "Off ... not added" beside a figure that
  > had added the stamp duty. Each CB_CTA switch the pack honours from these readings reads ON here when the pack applies
  > it; every other switch reads as CB_CTA says. Nothing here changes CB_CTA.

## 10 Oct 2026: Phase 159k

### `src/integrations/registers/name-exclusion.ts`

- Line 610:

  > PHASE 159k, 10 October 2026 — the seller's structures allowance statement: two dates and a sum, no name.

### `src/shared/money-readings.ts`

- Line 27:

  > PHASE 159k (item 2): plant with an expected life of 25 years or more goes to the special rate pool where a year's
  >  long-life spend passes £100,000 (s.90-104; src/web/allowances.ts).

- Line 30:

  > PHASE 159k (item 2): removing asbestos that was there when a company acquired the land is land remediation relief, a
  >  150% deduction (CTA 2009 Part 14), shown in the return entries — never an allowance.

- Line 33:

  > PHASE 159k (item 2, #20): repairs to an integral feature that pass half its replacement cost in twelve months are
  >  capital (s.33B), read across the building's pieces of work (src/web/survey-pack.ts).

- Line 63:

  > PHASE 159k

## 10 Oct 2026: Phase 159l

### `src/shared/money-readings.ts`

- Line 66:

  > PHASE 159l (item 8): the engine's switches the pack's legal check holds on for itself (pack-legal.ts
  >  withLegalEngineReadings, LEGAL_READINGS #9 and #10). They read ON here, as the pack the adviser signs reads them.

## 10 Oct 2026: Phase 160

### `src/integrations/registers/source-register.ts`

- Line 375:

  > PHASE 160 (the sweep), 10 October 2026: OPENED ON BCIS'S OWN ANSWER. Lakhbir, 9 Oct 2026: "we spoke to BCIS and they
  >        said its fine for us to do what we are doing" — loading BCIS's data, drafting the pack's rates from it and showing
  >        them in our reports (Word question 218, closed 10 Oct 2026). Those reports go to the client, into the accountant's
  >        pack and into the defence pack, so all three are opened, as the solicitor's answer opened HMLR_TITLE's. The rate
  >        TABLE itself is still never reproduced (cl. 2.2), and the data is still never committed (src/web/bcis-index.ts).

## 19 Oct 2026: Phase 160a

### `src/core/navigation.ts`

- Line 333:

  > PHASE 160a: THE BACK OFFICE'S TOP BAR, drawn by `page()` above the page once it knows the page's title — the trail
  > that ends on that title, Admin's views, the search, Help and the user menu. Absent for the portal, which keeps its look.
  > `own` is the trail a page drew for itself (`breadcrumb` in src/shared/components.ts), moved up here unchanged so a page
  > never shows two.

- Line 408:

  > PHASE 160a, 19 October 2026 — THE SIDEBAR LAYOUT LAKHBIR CHOSE (the Cap Rebate Simple CRM design). The menu down the
  >      left holds only the login's own sections, each with its icon; the search, Help, the user menu and Admin's views move
  >      to the top bar over the page, after the trail of where the person is. Which sections a login sees is still `tabsFor`.

- Line 419:

  > PHASE 160a — WHERE YOU ARE: "Cap Rebate / the section / the page". "Cap Rebate" is a link drawn before the trail (so it
  > also leads a trail a page drew for itself); the section is the one the menu marks as current; the page is the page's
  > own title, left out where it only repeats the section (Leads on the Leads list). The last step is the page itself, so
  > it is words, not a link.

- Line 435:

  > PHASE 160a/160b: the first step of every trail, a link to the login's own home.

- Line 455:

  > PHASE 160b, 19 October 2026 — THE PORTAL IN THE SAME LAYOUT AS THE BACK OFFICE (Phase 160a). The menu down the left
  >      holds the logo and the client's two screens; Help and the user menu move to the top bar, after the trail.

### `src/shared/assets.ts`

- Line 64:

  > PHASE 160a, 19 October 2026: the back office in the layout Lakhbir chose (the Cap Rebate Simple CRM design): a light

- Line 91:

  > PHASE 160a: the grey page, the column headings and the blue label (its navy pairings went with the navy in 160c).

- Line 103:

  > PHASE 160a — THE MENU'S ICONS, one per section, by the address its link opens: a plain character drawn before the words
  > (the design's own icons are characters too). Nothing is fetched (the stylesheet holds no url(), test/phase133a), the
  > menu's markup is unchanged, and the icon is never read out ("/ ''" is its empty spoken text; the words name the section).

### `src/shared/html.ts`

- Line 94:

  > PHASE 160a: the trail a page drew for itself (`breadcrumb`, src/shared/components.ts) — its first one only.

- Line 119:

  > PHASE 160a, 19 October 2026: THE BACK OFFICE'S TOP BAR (src/core/navigation.ts, Shell.bar) — where you are, then the

## 19 Oct 2026: Phase 160b

### `src/shared/assets.ts`

- Line 121:

  > PHASE 160b: the client portal's two screens.

### `src/shared/html.ts`

- Line 121:

  > PHASE 160b: the client portal's too (where you are, Help and the user menu; the portal has no search).

## 19 Oct 2026: Phase 160c

### `src/shared/assets.ts`

- Line 65:

  > page (page), fine rules (rule) and grey column headings (thead). Its navy went in Phase 160c, for the home page's ink.

- Line 67:

  > PHASE 160c, 19 October 2026: the home page's own colours replace 160a's navy (Lakhbir: "ensure our branding from the

- Line 93:

  > PHASE 160c: the home page's ink menu, its ivory and mint words on it, and ink words on the mint buttons.

### `src/shared/html.ts`

- Line 114:

  > PHASE 160c, 19 October 2026: the back office and the portal wear the home page's mark and wordmark (still, not

- Line 130:

  > PHASE 160c, 19 October 2026: no long dashes in the words a person reads (src/shared/plain-dashes.ts).

## 19 Oct 2026: Phase 160d

### `src/integrations/email/email.ts`

- Line 166:

  > PHASE 160d, 19 October 2026: no long dash in the words we send (src/shared/plain-dashes.ts, line by line), in the

### `src/shared/plain-dashes.ts`

- Line 1:

  > NO EM DASHES ON SCREEN — PHASE 160c, 19 October 2026.
  >
  > Lakhbir: "remove the — AI uses". The house rule is that copy a person reads never uses the long dash; it uses a comma,
  > a colon or a full stop. There are well over a thousand in the screens' words and in the names records carry ("Company —
  > main site"), so rather than rewrite each, `page()` (src/shared/html.ts) passes every finished page through this, the way it
  > already passes dates and "(required)" through theirs. It changes only the words a person reads:
  >
  >   · text between tags, and the four attributes a person reads or hears (title, alt, placeholder, aria-label);
  >   · never inside a script, a style, a text box (what someone typed stays as they typed it), pre or code, nor inside an
  >     element marked `data-as-made` (Phase 160d: an older approved report, drawn in the words it was made in);
  >   · never an attribute a form sends back (value, name, href), so nothing a form posts is changed on its way round.
  >
  > THE RULES, for each long dash in a run of words (a spaced "a — b" or an unspaced "a—b"):
  >   1. a dash standing alone in a cell or a label, meaning "nothing here", becomes "None";
  >   2. two dashes around an aside in one sentence ("a — the aside — b") become two commas;
  >   3. before "or", "and", "but", "so", "not", "which" and the other joining words, or before a number, a comma;
  >   4. (none: a "short ending takes a comma" rule was dropped the same day, because it made one name read two ways,
  >      "Company, main site" in a heading and "Company: main site" in the page's title);
  >   5. where the sentence already has a colon before it, a comma;
  >   6. at the very end of a run (the words go on after a tag), a colon;
  >   7. otherwise a colon ("Tax return — a document we need" reads "Tax return: a document we need").
  >
  > The signed and kept documents (the engagement letter, the reports, the PDFs) and the emails are NOT drawn by `page()`
  > and are not changed here: their versions are fixed. They have a phase of their own (see ACTION-PLAN.md).

- Line 74:

  > PHASE 160d: an element marked `data-as-made` (an approved report's older version) keeps its words exactly, however

- Line 99:

  > PHASE 160d, 19 October 2026 — PLAIN TEXT, LINE BY LINE: an email's subject and body, a task's title, an export's
  > column name. Each line is one run of words for the rules above, so a dash in one paragraph never pairs with one in
  > another.

## 19 Oct 2026: Phase 160e

### `src/core/auth.ts`

- Line 104:

  > PHASE 160e, 19 October 2026: FROM ONE NETWORK ADDRESS, as well as per email. The stress test sent 100 wrong sign-ins
  > on 100 different addresses from one machine and none was slowed (one password tried on many logins). These count
  > every try from one address in the window, whatever the email; an office of a dozen people signing in is far below.

- Line 194:

  > PHASE 160e: the network address first, hashed like the email (it too is personal data). Absent: not counted.

- Line 348:

  > PHASE 160e: many addresses' resets asked from one network address are slowed too, so nobody can fill inboxes.

### `src/core/multipart.ts`

- Line 148:

  > PHASE 160e: A FORM WHOSE FILE WAS SENT FIRST IN PIECES (src/core/upload-pieces.ts) — no file in it, and the send's id
  > in a field named `pieces`. Its text fields and that id; null for any other form, which is then read as before.

### `src/core/router.ts`

- Line 189:

  > PHASE 160e: a page with an upload form gets the script that sends a big file in pieces (src/core/upload-pieces.ts).

- Line 356:

  > PHASE 160e, 19 October 2026: A FORM SENT FROM ANOTHER WEBSITE IS REFUSED. The session cookie is SameSite=Lax, which
  >      stops a browser sending it with another site's form; this is the second lock. Browsers mark every request with
  >      where it came from (Sec-Fetch-Site), and no page of ours posts from elsewhere. The Origin header cannot be used
  >      for this here: under our no-referrer policy a browser sends "Origin: null" even on our own forms. A service calling
  >      us (a webhook) sends no Sec-Fetch-Site, so it is not affected.

- Line 414:

  > PHASE 160e: the upload forms' one script (src/core/upload-pieces-script.ts), which sends a big file in pieces.

- Line 418:

  > PHASE 160e: A FILE SENT IN PIECES (src/core/upload-pieces.ts) - Vercel takes at most 4.5 MB a request. JSON for the
  >      page's script only; any signed-in person, for their own send only. The form that sends the file takes it.

### `src/core/sign-in.ts`

- Line 145:

  > PHASE 160e: and from one network address

### `src/core/staff.ts`

- Line 114:

  > PHASE 160e: a page with an upload form also names the script that sends a big file in pieces.

### `src/core/upload-pieces-script.ts`

- Line 1:

  > THE UPLOAD FORMS' ONE SCRIPT — served at /assets/upload-pieces.js, and named only by a page with a form marked
  > `data-pieces` (`piecesPage` in src/core/upload-pieces.ts). PHASE 160e, 19 October 2026.
  >
  > A chosen file at or under the size Vercel takes in one request goes with the form, whole, as it always did. A bigger
  > one is sent in pieces first (`startPieces`, `putPiece`), and the form is then sent as before with the file box
  > emptied and the send's id in a field named `pieces`; the form's own handler takes the file from the pieces. With no
  > script (or an old browser) the form sends the file whole, exactly as before this phase.
  >
  > It sets no HTML from anything: it reads the chosen file's size, sends its bytes, and writes its own words into the
  > form's own note. Nothing is kept in the browser.

### `src/core/upload-pieces.ts`

- Line 1:

  > A FILE SENT IN PIECES — PHASE 160e, 19 October 2026.
  >
  > The stress test of 19 October 2026 sent a 6 MB document to the test website: Vercel refused it before the website saw
  > it, with its own page ("Request Entity Too Large"). Vercel takes at most 4.5 MB a request, and every document form
  > sent its file whole, while the portal says "The most we take is 50 MB". Photos and videos already go round the limit
  > (src/web/photo-upload.ts, src/web/survey-video.ts); documents did not.
  >
  > HOW. The page's script (src/core/upload-pieces-script.ts) sees a chosen file over `PIECED_ABOVE`, asks to START
  > (`startPieces`: the size, so the server says how many pieces), sends each piece of at most `PIECE_BYTES` (`putPiece`),
  > then sends the form exactly as before with the file box emptied and the start's id in a field named `pieces`. The
  > form's own handler reads the file from the pieces (`takePieces`, through `readUpload` in client-files-pages.ts and
  > `readPortalSend` in messages-pages.ts) and does everything it always did with it: the same type, size and damage
  > checks, the same `receiveFile`. Nothing a document goes through changed; only how its bytes arrive.
  >
  > WHERE THE PIECES WAIT. In the store's incoming area (the private Blob store on the test website), SEALED with the
  > store's key where it has one, so a piece is never readable at rest. They are removed when the form takes them, and
  > the SWEEP (`sweepPieces`) removes any not taken within a day.
  >
  > WHO. Only the person who started a send may add to it or take it. A send is one file, taken once.

### `src/shared/lists-pages.ts`

- Line 40:

  > PHASE 160e: a page with an upload form also names the script that sends a big file in pieces.

## 20 Oct 2026: Phase 160f

### `src/core/audit.ts`

- Line 257:

  > PHASE 160f: a complaint sent through the public notices page's form (src/web/notices-site.ts).

### `src/core/router.ts`

- Line 136:

  > PHASE 160f: the public notices page and its complaint form (src/web/notices-site.ts). Only the test website passes it.

- Line 507:

  > PHASE 160f, 20 October 2026: ON THE TEST WEBSITE, THE NOTICES PAGE ITSELF (src/web/notices-site.ts) - a draft,
  >      its proposed facts marked - with its style as a file and its complaint form working. Anywhere else, as before.

### `src/core/server.ts`

- Line 128:

  > PHASE 160f: the public notices page and its complaint form (src/web/notices-site.ts). api/index.mjs passes it; nothing else does.

## 20 Oct 2026: Phase 160h

### `src/core/router.ts`

- Line 369:

  > PHASE 160h, 20 October 2026: THE COOKIE BANNER (src/web/legal-pages.ts), on the test website with the notices. A
  >      visitor who is not signed in and has not answered gets it at the foot of any page of ours: two buttons of the same
  >      size, no script. It is added as the page leaves, so every page writer (page(), the home page, the notices page)
  >      carries it without knowing about it.

- Line 559:

  > PHASE 160h: away from the test website the legal pages are not served yet; their addresses say so, as the notices'
  >      do, rather than answer "unknown page" to a footer link.

## 20 Oct 2026: Phase 160i

### `src/core/staff.ts`

- Line 924:

  > PHASE 160i — ONE CLIENT'S AUDIT LOG, from the claim page. Who did what and when, in plain words, newest first. Nothing
  > on it changes an entry: the log refuses any change or deletion (migration 001), and each entry is chained to the one
  > before it, so a change would show.

## 20 Oct 2026: Phase 160j

### `src/core/audit.ts`

- Line 259:

  > PHASE 160j: staff checked what a client sent through their portal (src/web/client-checks.ts): accepted, or asked

## 21 Oct 2026: Phase 160k

### `src/core/router.ts`

- Line 594:

  > PHASE 160k, 21 OCTOBER 2026: THE NEW PUBLIC WEBSITE. The home page's head script, the five sector landing pages
  >      and their assets, and the self-hosted fonts. Every name is checked against a fixed list; no path reaches the disk.

## 4 Nov 2026: Phase 160e

### `src/core/form-token.ts`

- Line 1:

  > PHASE 161b, 4 November 2026 — A SECURITY TOKEN ON EVERY FORM THAT CHANGES SOMETHING, AS WELL AS THE BROWSER CHECK.
  >
  > The ITRoadway technical audit (2 Nov 2026), section 4, row 3 (Medium): "Forms are protected by browser settings only,
  > with no extra check on sensitive actions such as payments and admin changes. Add a one-time security token to those
  > forms." Until today a form sent from another website was stopped by two browser settings only: the session cookie's
  > SameSite, and the browser's Sec-Fetch-Site mark (Phase 160e, src/core/router.ts). A browser that sends neither got
  > through. Now every request that would change something for a signed-in person must also carry a token of ours.
  >
  > THE FORM TOKEN. One per session, worked out from the session cookie (HMAC-SHA256, keyed by the cookie), so:
  >   - another website cannot know it: the cookie is HttpOnly and never leaves the browser's own requests to us;
  >   - every copy of the website gets the same answer with nothing shared or stored (the server works it out again);
  >   - a new session is a new token, so it changes at sign-in and whenever the session rotates (a privilege change).
  > It goes in a hidden field, `cb_form`, that is added to every <form method="post"> of ours as the page leaves the
  > server (`withFormTokens`), so no page can forget it; the page's scripts send it in the `x-cb-form` header, read from
  > <meta name="cb-form"> in the page.
  >
  > THE SINGLE-USE TOKEN. For the actions in SENSITIVE (money, roles and staff logins, settings and switches, keys and
  > connections, holds and data rights), the form also gets `cb_once`: a random number, the time it was made, and an HMAC
  > of both keyed by the session. It is good once, within ONCE_MAX_AGE_MS: the server keeps every one it has accepted
  > (form_tokens_used, migration 120) and refuses one it has seen. So a sensitive form cannot be sent twice, even by
  > going back and pressing the button again: the page has to be opened afresh.
  >
  > WHERE IT IS CHECKED. In src/core/server.ts, at the top of the one handler every request goes through, BEFORE any route
  > runs: a request that is not GET or HEAD, from a signed-in person, on an address not in EXEMPT. A refusal changes
  > nothing, answers "This form has expired", and is written to the audit log (FORM_TOKEN_REFUSED).
  >
  > WHEN IT IS OFF. Only when createApp is told `formTokens: 'off'`, or, with no word either way, inside Node's own test
  > runner (`testRunner()`), as Django's test client does: the existing tests post forms without tokens, and the tests of
  > this file turn it on. Every real start says `formTokens: 'on'` in so many words (src/core/server.ts's own start and
  > api/index.mjs), so the default never decides a real website.

## 4 Nov 2026: Phase 161b

### `src/core/audit.ts`

- Line 442:

  > PHASE 161b, 4 Nov 2026: a signed-in person's form refused for a missing, wrong or used token (src/core/form-token.ts).

### `src/core/form-token-check.ts`

- Line 1:

  > PHASE 161b, 4 November 2026 — THE FORM-TOKEN CHECK, RUN BEFORE ANY ROUTE (src/core/server.ts), AND THE PAGE STEP THAT
  > PUTS THE TOKENS IN. What the tokens are, and why, is in src/core/form-token.ts.

### `src/core/router.ts`

- Line 224:

  > PHASE 161b, 4 November 2026: A BODY IS READ ONCE AND KEPT FOR ITS REQUEST. The form-token check (src/core/server.ts,
  > src/core/form-token.ts) reads a form before any route does; the route then reads the same bytes from here, with the
  > token's fields taken out (`keepBody`). A kept body still meets the route's own cap.

### `src/core/server.ts`

- Line 136:

  > PHASE 161b, 4 Nov 2026: the form tokens (src/core/form-token.ts). Every real start says 'on'. With no word, they
  > are on, except inside Node's test runner, where the existing tests post forms without them.

- Line 249:

  > PHASE 161b, 4 November 2026 (the ITRoadway audit): A SIGNED-IN PERSON'S FORM CARRIES OUR TOKEN, checked here,
  >        before any route, for every request that would change something (src/core/form-token.ts says what and why). And
  >        every page this request answers with gets the tokens put into its forms as it leaves.

- Line 350:

  > PHASE 161b: a single-use token for the JSON API's sensitive actions (x-cb-once), one per ask.

- Line 358:

  > PHASE 161b: the form token the JSON API sends in x-cb-form (src/core/form-token.ts).

- Line 427:

  > PHASE 161b: a real start says the form tokens are on, in so many words.

## 4 Nov 2026: Phase 161c

### `src/core/cli.ts`

- Line 54:

  > PHASE 161c: the same start-up check as the server, so a command run by a timer on the live server will not read a
  >      key file others could open either. A warning anywhere else.

### `src/core/secrets.ts`

- Line 241:

  > PHASE 161c, 4 November 2026 (the ITRoadway audit, section 4 row 2): THE LIVE SERVER'S KEY STORE IS SYSTEMD'S.
  >
  > On the live server the unit file says `LoadCredential=caprebate-secrets:/etc/caprebate/caprebate-secrets` (the
  > runbook has the steps). systemd then reads that root-only file when the service starts, puts a copy in a folder of
  > its own that only this service can open (in memory, never swapped to disk), and names the folder in
  > CREDENTIALS_DIRECTORY. WHEN THAT FOLDER HOLDS `caprebate-secrets`, IT IS THE KEY FILE, ahead of CAPREBATE_SECRETS and
  > the home-folder file. Anywhere else - the Mac, the test website - nothing sets CREDENTIALS_DIRECTORY, and the key file
  > is found exactly as before.

- Line 418:

  > ------------------------------------------------------------------ PHASE 161c: the start-up check

- Line 420:

  > PHASE 161c, 4 November 2026 (the ITRoadway audit, section 4 row 2): A KEY FILE OTHERS CAN OPEN STOPS A LIVE START.
  >
  > THE PRODUCTION SETTING is CAPREBATE_PRODUCTION=1, set by the live server's unit file and by nothing else (the Mac and
  > the test website never set it). On a start with it set, a key file that anyone but the app's own user could read or
  > change (any permission wider than 600), or that belongs to another user, STOPS THE START with a plain message naming
  > the file and what is wrong. Without it the same message is a warning and the app starts, as it always has.
  >
  > WHAT IS NOT CHECKED, AND WHY. A key file in systemd's credentials folder is systemd's: the folder is the service's
  > own, and systemd usually grants the read with an access list on a file root owns, which shows as a wider mode and
  > another owner although nobody else can open it. So that copy is not judged here; the file systemd copies it from is
  > root's, mode 600, as the runbook sets it. No key file at all is not this check's business: every service then reads
  > as not set up, as before (N4). The message carries the file's name and its permissions, NEVER a word of what is in it.

### `src/core/server.ts`

- Line 236:

  > PHASE 161c, 4 November 2026 (the ITRoadway audit, section 4 row 4): THE STATUS PAGE SAYS ONLY "OK". It answers
  >        {"ok":true} when the database answers, and 503 {"ok":false} when it does not - nothing else, so it tells nobody
  >        which parts are built or switched on. It is answered first, before any sign-in is read, so an uptime check sees
  >        the database and nothing in front of it. The list of what is built and switched off (STUBS) is for Admin only,
  >        at /staff/connections/switches.json (src/web/connections.ts).

- Line 420:

  > PHASE 161c: a key file others could open stops a live start (CAPREBATE_PRODUCTION=1) and is a warning anywhere
  >      else. The words name the file and its permissions, never a key.

## 4 Nov 2026: Phase 161d

### `src/shared/upload-handler-port.ts`

- Line 1:

  > THE ONE PLACE THIS APPLICATION NAMES THE UPLOAD HANDLER.
  >
  > `09-app/backend/src/modules/claims/documents/upload-handler.ts` is 945 lines, has 38
  > tests, obeys the twelve-step RECEIPT_CONTRACT order — and until Phase 104
  > NOTHING HAD EVER CALLED IT. Its own header is blunt about what that means:
  > every control on client documents was dormant "in the precise sense that no
  > code path reached any of them".
  >
  > This file is the seam. Everything the web half needs from the handler and
  > from the ingestion module comes through here, so:
  >
  >   · the handler is imported from this file only (it lived in 04-phase-work/phase3 until Phase 161d moved it
  >     into src/documents/; tools/lint-paths.cjs now keeps src/ from loading anything outside 09-app);
  >   · THE HANDLER IS IMPORTED, NOT COPIED. There is no second implementation
  >     of the contract order in this package and there must never be one;
  >   · if the handler moves, one path changes.
  >
  > NOTHING IS RE-EXPORTED WITH A DIFFERENT NAME OR A WIDER TYPE. A shim that
  > "tidied" the port would be a second specification of it, which is the exact
  > failure the extraction of the engine was done to prevent.

## 5 Nov 2026: Phase 161g

### `src/core/audit.ts`

- Line 444:

  > PHASE 161g, 5 Nov 2026: an admin recorded a solicitor's or the DPO's approval of a legal page's version (src/web/legal-approvals.ts).

- Line 446:

  > PHASE 161g: a client ticked that they have read the portal terms, the website terms and the privacy policy; the versions are kept.

### `src/core/form-token.ts`

- Line 133:

  > PHASE 161g: an approval of a legal page is never changed or deleted once recorded, so it is sent once.

### `src/core/router.ts`

- Line 138:

  > PHASE 161g, 5 Nov 2026: THE LEGAL SETTING, for the live website. The legal pages, the notices page, the cookie
  > banner and the client's tick are served wherever it is on, as on the test website, but each page carries its Draft
  > line until our solicitor and our data protection officer have both approved its version (src/web/legal-approvals.ts).
  > Off unless CAPREBATE_LEGAL_PAGES=on (src/core/server.ts). With it and `notices` both off, nothing changes.

- Line 353:

  > PHASE 161g: the legal pages are served on the test website (`notices`) or wherever the `legal` setting is on.

- Line 510:

  > PHASE 160h: the website's other legal pages, the banner's styles, and the answer (src/web/legal-pages.ts).
  >        PHASE 161g: also wherever the `legal` setting is on; each page says Draft until both approvals are recorded.

- Line 534:

  > PHASE 161g: the privacy policy is its own page now; the notices page is for people who are not our clients.

- Line 636:

  > PHASE 161g: AND ONLY AFTER A CLICK ON "Accept all". The page is given the id, and its policy names Google, only

- Line 1145:

  > PHASE 161g: the legal pages' approvals (src/web/legal-approvals.ts). Admins only; recorded once, never changed.

- Line 1170:

  > PHASE 161g: A CLIENT AGREES TO THE CURRENT TERMS BEFORE THE PORTAL OPENS, where the legal pages are served. The
  >        sign-up's tick usually covers it; this asks a client who signed up before, was given a login, or when a version
  >        changes. Their own second step stays open, so they are never locked out of keeping their login safe.

- Line 2067:

  > PHASE 161g: where the legal pages are served, the sign-up asks for the tick that the person has read them.

- Line 2572:

  > PHASE 161g: where the legal pages are served, the signing screen links the client's terms, the website terms and the privacy policy.

### `src/core/server.ts`

- Line 130:

  > PHASE 161g: the legal pages for the live website, each a Draft until approved (src/web/legal-approvals.ts). Off unless CAPREBATE_LEGAL_PAGES=on.

- Line 143:

  > PHASE 161g: the `legal` setting, read from CAPREBATE_LEGAL_PAGES. Only the word "on" switches it on.

- Line 422:

  > PHASE 161g: CAPREBATE_LEGAL_PAGES=on serves the legal pages (each a Draft until approved). Anything else: off.

### `src/core/signup.ts`

- Line 60:

  > Step 2. PHASE 161g: `terms` is the version of each document the person must tick that they have read (the portal
  > terms, the website terms, the privacy policy), where the legal pages are served; null where they are not. The tick
  > is kept with the request, with its date, and copied to the login when it is made (step 3).

### `src/integrations/analytics.ts`

- Line 46:

  > PHASE 161g, 5 November 2026 — GOOGLE ANALYTICS ONLY AFTER A CLICK (Lakhbir: "Google Analytics only after a click").
  >
  > The served site page, for one visitor. `accepted` is `optionalAllowed` (src/web/legal-pages.ts): true only when the
  > visitor's `cb_cookies` answer is "all", which only a click on "Accept all" sets. Until then the page is given NO
  > measurement id and its policy names no Google address, so nothing of Google's can load and no request can go to
  > Google, whatever the page's script does: not on a page view, a scroll, a timer or an earlier visit with no answer.
  > The page's own answer meta (cb-cookie-choice) says "all" only then, and SITE_CONSENT starts nothing without it.
  > `csp` is null when the page's ordinary policy stands.

### `src/integrations/outside-services.ts`

- Line 1:

  > EVERY OUTSIDE SERVICE THAT CAN RECEIVE PERSONAL DATA — PHASE 161g, 5 November 2026.
  >
  > Lakhbir, 5 Nov 2026: the privacy policy "names every outside service that receives personal data, from the
  > connectors and SECRET_KEYS owners ... what is sent, why, and where it is held. Where it is held outside the UK, the
  > transfer basis is written 'to be confirmed by our DPO', never guessed. A test ties the list to SECRET_KEYS, so a new
  > connector cannot be added without a line."
  >
  > So: one entry for EVERY owner in SECRET_KEYS (src/core/secrets.ts), even the ones that receive nothing (they say so), and
  > one for each service that needs no key (the hosting company, the database, the document store, the free public
  > registers). test/phase161g.test.ts fails on a key owner with no entry, on an entry naming an owner that no longer
  > exists, and on any place outside the UK (or not yet known) whose transfer basis is not exactly TRANSFER_TO_CONFIRM.
  >
  > The privacy policy (src/web/privacy-policy.ts) draws its table from this list, and the review pack's "outside
  > services" attachment is printed from it. A FACT WE DO NOT HAVE IS NEVER MADE UP: where we do not know where a
  > service holds data, `where` says so and `outsideUk` is 'unknown'.
  >
  > Kept outside src/web/ on purpose, like src/integrations/analytics.ts: the analytics allow-list check scans every src/web view for
  > Google's tag names, and this list names Google.

## 7 Nov 2026: Phase 133c

### `src/shared/assets.ts`

- Line 1:

  > The assets this application serves, AS CONSTANTS.
  >
  > PHASE 161i, 7 November 2026: the stylesheet is the one exception, and only in where its text is kept. It is read once,
  > when this module loads, from a fixed file the code names (src/styles/site.css), never from anything a request says;
  > so there is still no route that maps a request onto the filesystem. Everything else below is as it was.
  >
  > They are not read from disk, and that is deliberate rather than lazy: requirement
  > DB-W1 says client documents must live where no web-server route can reach them
  > by path, and the cleanest way to guarantee that is for the application to
  > have NO route that maps a request onto the filesystem at all.
  > `assertNoStaticFileRoute()` in objectstore.ts checks exactly that, and it can
  > only stay true if assets work this way. PHASE 133c added the supplied logo the
  > same way — a base64 constant in src/shared/brand-logo.ts, served under img-src 'self'.
  >
  > There is also no inline style anywhere, because the CSP has no
  > `unsafe-inline` and a single style attribute is what quietly brings it back.

## 7 Nov 2026: Phase 161h

### `src/core/backup.ts`

- Line 1:

  > THE NIGHTLY BACKUP, AND ITS RESTORE. Phase 161h, 7 November 2026 (the developer question pack, D8; Word question 155).
  >
  > WHAT IT COPIES, EVERY NIGHT (the live website's "backup" timer, src/core/timers.ts, 02:00 UTC):
  >   - THE DATABASE, whole, as one SQLite file (VACUUM INTO, which writes a clean, complete copy while the website keeps
  >     running), to database/<date>.db.cbbk. On Turso the file is first brought down as a local copy of the live database
  >     (libsql's own replica), then written out the same way.
  >   - THE DOCUMENT STORE, what is new or changed since the last night, each object exactly as stored (a sealed photo stays
  >     sealed), to documents/<key>.cbbk; and a small state file saying what was copied when.
  > WHAT IT LEAVES OUT, ON PURPOSE: the holding places, where an upload waits unredacted for up to an hour before the names
  > we may not keep are removed (quarantine/), and where a phone's locked photo or a file's pieces wait (survey-incoming/).
  > A backup that copied them would keep those files far longer than we say (Word question 155). And the reference
  > database (the postcode table and the grid): it holds no personal data and is rebuilt from two free downloads.
  >
  > LOCKED BEFORE IT LEAVES. Every file is gzipped and encrypted with AES-256-GCM under CAPREBATE_BACKUP_KEY (32 bytes,
  > base64), which only the live project's settings and the password manager hold. The second place stores bytes it cannot
  > read, and a file changed there fails to open (GCM's tag) rather than restoring something altered.
  >
  > HOW LONG IT IS KEPT: BACKUP_KEEP_DAYS. A night's database file is deleted by the bucket's own lifecycle rule after that
  > many days (LIVE-RUNBOOK.md sets it). A document deleted from the website is deleted from the backup once it has been
  > gone that long (the state file counts the days), so a deletion we promise reaches the backup within that time.
  >
  > SWITCHED OFF UNTIL SET UP: with no key, or nowhere to copy to, nothing is copied and the line says which setting is
  > missing (names only). Nothing here prints a key, an address or a file's contents.

### `src/core/cli.ts`

- Line 268:

  > PHASE 161h: changing CAPREBATE_MFA_KEY. The OLD key in CAPREBATE_MFA_KEY_OLD and the NEW one in CAPREBATE_MFA_KEY,
  >        each 32 bytes as base64, both from the environment of this one command; the database from CAPREBATE_DB (with
  >        CAPREBATE_DB_TOKEN for the live Turso database). All or nothing. Never prints a secret or a key.

### `src/core/live-website.ts`

- Line 1:

  > THE LIVE WEBSITE ON VERCEL — how it starts. Phase 161h, 7 November 2026 (Lakhbir, 6 Nov 2026: "lets keep it as
  > vercel"; the runbook is 09-app/deploy/LIVE-RUNBOOK.md).
  >
  > ONE ENTRY, TWO PROJECTS. Vercel runs api/index.mjs for both the test website (project caprebate-test) and the live one
  > (its own project). The entry decides from its OWN SETTINGS: CAPREBATE_PRODUCTION=1 starts the live website through this
  > file; anything else starts the test website exactly as before. The live project sets it; the test project never does.
  >
  > WHAT THE LIVE WEBSITE NEVER HAS (each is set in api/index.mjs for the test website only, and never here):
  >   no invented seed (and a database holding one is refused), no demo logins, no test password, no test letter, no test
  >   signing, no notices test banner, no STAFF_EXCEPT_INVENTED (every staff login gives a second step: the default), no
  >   memory database (a database that cannot be opened stops the website, it never falls back), and form tokens on.
  > A test-only setting found in the live project's settings stops the start, so one copied across by mistake is seen.
  >
  > THE KEYS are the project's encrypted settings (Vercel, "Sensitive"), read through secretsFromEnvironment with the live
  > list, LIVE_KEYS: every key in SECRET_KEYS that is not retired. A key for an outside service that is missing leaves that
  > service "not set up", as always (N4). A setting the website cannot run safely without, LIVE_REQUIRED, STOPS THE START
  > with a plain message naming it, never its value; every request then answers 503 "not available".

### `src/core/mfa-seal.ts`

- Line 97:

  > PHASE 161h, 7 November 2026: CHANGING THE KEY (LIVE-RUNBOOK.md, "Rotate a key"). Every sealed secret is opened with the
  > old key and sealed again with the new one, ALL OR NOTHING: if any one will not open with the old key, nothing changes
  > and it says how many would not, so nobody is locked out of their app by a half-done change. Text secrets are sealed
  > with the new key on the way. Never prints a secret or a key.

### `src/core/router.ts`

- Line 677:

  > PHASE 161h, 7 NOV 2026: THE LIVE WEBSITE'S OWN TIMERS (src/core/timers.ts). No login: Vercel Cron calls them, with the
  >      project's word (CRON_SECRET) in the Authorization header. Refused without it, and answered with counts only.

### `src/core/secrets.ts`

- Line 56:

  > PHASE 161h, 7 Nov 2026: the live website's own timers (Vercel Cron), GET /hooks/timer/<job> (src/core/timers.ts).

- Line 58:

  > PHASE 161h: the nightly backup - its encryption key and the second place it is copied to (src/core/backup.ts).

- Line 60:

  > PHASE 161h: the reference database - the ONS postcode table and Ordnance Survey's OSTN15 grid (src/integrations/postcodes/reference-db.ts).

- Line 154:

  > PHASE 161h, 7 November 2026: the live website on Vercel (its runbook: 09-app/deploy/LIVE-RUNBOOK.md).

### `src/core/timers.ts`

- Line 1:

  > THE LIVE WEBSITE'S OWN TIMERS — every scheduled job, woken by Vercel Cron. Phase 161h, 7 November 2026 (the developer
  > question pack, D11: "Vercel Cron on the Pro plan for the live website, each call carrying its own secret word and
  > writing a log line").
  >
  > THE JOBS, LISTED FROM THE CODE (src/core/cli.ts's scheduled commands, and what the reply timer's call already did):
  >   every-five-minutes  read email replies (at most once every two minutes, as the reply timer does); clear photo and
  >                       video uploads never finished within a day, and upload pieces never taken; try again any email
  >                       that could not be sent at the moment it was saved (retryUnsent, below).
  >   nightly             the clean-up jobs: kept originals past their time (sweep-originals), messages and closed
  >                       enquiries past theirs (each switched off until the data protection officer sets the periods,
  >                       and then it says so), and the audit chain checked end to end.
  >   backup              the nightly backup (src/core/backup.ts): the database and the document store, locked, to the second
  >                       place. Its own call, so its time limit is its own.
  > The land boundary sweep (sweep-land-boundaries) is not here: the live website keeps no land boundary file (no
  > CAPREBATE_INSPIRE_STORE_DIR; LIVE-RUNBOOK.md says why), so it has nothing to sweep.
  >
  > THE WORD. Vercel Cron calls GET <path> with "Authorization: Bearer <CRON_SECRET>", CRON_SECRET being one setting of
  > the project (vercel.com/docs/cron-jobs/manage-cron-jobs, read 7 Nov 2026). Vercel sends that ONE word with every job:
  > a word per job, which the phase asked for, is not something Vercel Cron can send, so every job's call carries the
  > project's word and is refused without it. Compared in constant time; 32 characters or more, or every call is refused.
  > The answer carries counts only, never an address, a name or a word of any email.
  >
  > A LOG LINE EACH RUN: "timer <job>: ..." with the same counts, so the function log shows every run and what it did.

### `src/integrations/connectors/http.ts`

- Line 42:

  > PHASE 161h: bytes too - the nightly backup's locked file (src/integrations/connectors/s3-backup.ts).

- Line 168:

  > PHASE 161h: a body of bytes (a backup file) is kept as base64, so `seen` stays text for every other test.

### `src/integrations/connectors/ostn15.ts`

- Line 102:

  > PHASE 161h: any column that answers by point number - the arrays a file is read into, or the reference database's
  >      table read a point at a time (src/integrations/postcodes/reference-db.ts, ostn15GridFromDatabase).

### `src/integrations/connectors/s3-backup.ts`

- Line 1:

  > THE BACKUP'S SECOND PLACE — a storage bucket at another provider, reached the way S3 is (AWS's Signature Version 4).
  > Phase 161h, 7 November 2026 (the developer question pack, D8: "a nightly encrypted copy ... to a second provider in
  > the UK").
  >
  > OUR RECOMMENDATION is an Amazon S3 bucket in London (eu-west-2): in the UK, a different company from Vercel and Turso,
  > with its own lifecycle rule to delete each copy after a set time (LIVE-RUNBOOK.md). Any service that speaks S3 works the
  > same way, so the developer may choose another; the four BACKUP_S3_* settings say which. Switched off until they are
  > set: the backup then says it has nowhere to go, and keeps nothing.
  >
  > WHAT GOES. Only files the backup has already locked with our own key (src/core/backup.ts): the provider stores bytes it
  > cannot read. The user whose key this is may only add, read and delete files in that one bucket (the runbook's policy).
  >
  > THROUGH src/integrations/connectors/http.ts's transport, the one way this application reaches outside. The signing is ours (about
  > forty lines, checked against AWS's own published example in test/phase161h.test.ts) because AWS's SDK would add some
  > hundred packages for four calls.

### `src/integrations/outside-services.ts`

- Line 115:

  > PHASE 161h, 7 Nov 2026: the live website's timers, its backup and its reference database.

- Line 129:

  > PHASE 161h, 7 Nov 2026: where the live website keeps data, as the phase decided it (Word question 291 asks the
  >      developer and the data protection officer to agree). Vercel and Turso are US companies; Vercel's own records of each
  >      request, and Turso's database in Ireland, are outside the UK, so their safeguard is the DPO's to confirm.

### `src/integrations/postcodes/postcode.ts`

- Line 101:

  > PHASE 161h, 7 November 2026: THE LIVE WEBSITE READS THE TABLE FROM THE REFERENCE DATABASE (src/integrations/postcodes/reference-db.ts),
  >      because a Vercel function has no disk to keep a 75 MB file on. Unset, null as before. If it cannot be opened just
  >      now, this lookup has no store and says why (N4), and the next one tries again: a failure is not remembered.

### `src/integrations/postcodes/reference-db.ts`

- Line 1:

  > THE REFERENCE DATABASE — the ONS postcode table and Ordnance Survey's OSTN15 grid, where the live website can read
  > them. Phase 161h, 7 November 2026 (the live website on Vercel; the developer question pack, D12).
  >
  > WHY A DATABASE OF ITS OWN. A Vercel function has no disk that lasts and cannot carry a 75 MB table in its bundle, so
  > the two big files that used to sit on a server's disk (CAPREBATE_POSTCODE_DB and CAPREBATE_OSTN15_FILE) live in ONE
  > read-only Turso database instead. It is built as an ordinary SQLite file on a computer each quarter, by the ingest the
  > postcode module already had plus tools/build-reference-db.ts, and uploaded whole (turso db create --from-file). It is
  > kept APART from the client database on purpose: loading 2.7 million rows into the client database over the network
  > would take hours, every nightly backup would carry 75 MB of free public data, and a quarterly refresh would write to
  > the database that holds clients' records. This one holds no personal data at all, is never backed up (it is rebuilt
  > from two free downloads) and is opened with a read-only token.
  >
  > WHERE. CAPREBATE_REFERENCE_DB_URL: a libsql:// or https:// address (with CAPREBATE_REFERENCE_DB_TOKEN), or the path of
  > the same file on this computer. Unset, nothing changes: no postcode store and no grid, exactly as before, and every
  > answer that needs them is withheld with its reason (N4).
  >
  > WHAT IT HOLDS. The tables SQLITE_SCHEMA names (postcode_authority, authority_name, table_meta), as the ingest writes
  > them, and OSTN15_SCHEMA's one table, ostn15_grid: one row per kilometre point of OSTN15, keyed by k = i + j * 701.

### `src/shared/objectstore.ts`

- Line 344:

  > ---------------------------------------------------------------- PHASE 161h: for the backup only (src/core/backup.ts)

### `src/shared/shared-objectstore.ts`

- Line 64:

  > PHASE 161h: every object under `prefix`, with when it was written, a page at a time. For the backup only.

- Line 147:

  > PHASE 161h: every object of ours in the Blob store, for the backup. A client that cannot list lists nothing, and the backup says so.

- Line 176:

  > PHASE 161h, for the backup: @vercel/blob's list (prefix, cursor, limit; private stores too).

## 7 Nov 2026: Phase 161i

### `src/core/index.ts`

- Line 1:

  > THE CORE'S FRONT DOOR (Phase 161i, 7 Nov 2026; 09-app/ARCHITECTURE.md rule 1): the server and router shell, the database gate, sign-in, permissions, the audit log and the keys. Another area imports the core only from this file; what it may use is listed here, and nothing else of the core is reachable from outside.
  > Generated from the imports other areas made on that day, and kept by hand since: add a name here when another area
  > needs it, never a whole file.

### `src/integrations/index.ts`

- Line 1:

  > THE OUTSIDE SERVICES' FRONT DOOR (Phase 161i, 7 Nov 2026; 09-app/ARCHITECTURE.md rule 1): every connector, the email sender and reader, the register intake, the postcode and grid lookups, and the outside services list. Another area imports them only from this file; only connectors/http.ts calls the network.
  > Generated from the imports other areas made on that day, and kept by hand since: add a name here when another area
  > needs it, never a whole file.

### `src/shared/assets.ts`

- Line 127:

  > THE STYLESHEET IS A REAL FILE: src/styles/site.css (Phase 161i, 7 November 2026; the ITRoadway audit's regroup). It was
  > held here as text until then; the file is that text, byte for byte, as it was served (test/phase161i.test.ts holds its
  > SHA-256). Edit the CSS there. The parts made from code above (the brand tokens, the two font stacks, the menu's icons
  > and the current-tab selectors) must still be in it exactly as the code makes them: assertCssCarriesParts checks that when
  > this module loads, so a colour changed in one place and not the other stops the application from starting.

### `src/shared/index.ts`

- Line 1:

  > THE SHARED PARTS' FRONT DOOR (Phase 161i, 7 Nov 2026; 09-app/ARCHITECTURE.md rule 1): page templates and components, dates and working days, PDF and ZIP, the document store, plain words, and the claim calculator's adapter. No business rule lives in shared/. Another area imports it only from this file.
  > Generated from the imports other areas made on that day, and kept by hand since: add a name here when another area
  > needs it, never a whole file.

## 8 Nov 2026: Phase 161i1

### `src/core/data-borrowed.ts`

- Line 1:

  > BORROWED: SQL ON OTHER AREAS' TABLES, RUN FROM THE CORE (Phase 161i1, 8 Nov 2026; 09-app/ARCHITECTURE.md rules 3
  > and 4). These statements were in core's page and logic files, which may not run SQL (rule 4). They read or write
  > tables a business area owns, so they still go against rule 3 (each counted against the table's owner), and Phase
  > 161l (the tangle undone) moves each one to its owner's data file, reached through that owner's front door or an
  > event. Nothing new belongs here: this file only gets shorter. Text unchanged from the caller.

### `src/core/data.ts`

- Line 1:

  > THE CORE'S DATA FILE (Phase 161i1, 8 Nov 2026; 09-app/ARCHITECTURE.md rule 3). The only file that runs SQL on the
  > tables architecture/tables.json gives the core (users, sessions, the audit log, roles and the rest). Every other file
  > asks through these functions: inside the core from here, from another area through the core's front door.
  > Each statement is the one its caller ran before, moved here with its text unchanged; a caller's row type stays with
  > the caller (the type argument).

### `src/integrations/data-borrowed.ts`

- Line 1:

  > BORROWED: SQL ON OTHER AREAS' TABLES, RUN FROM THE INTEGRATIONS (Phase 161i1, 8 Nov 2026; 09-app/ARCHITECTURE.md rules 3
  > and 4). These statements were in integrations's page and logic files, which may not run SQL (rule 4). They read or write
  > tables a business area owns, so they still go against rule 3 (each counted against the table's owner), and Phase
  > 161l (the tangle undone) moves each one to its owner's data file, reached through that owner's front door or an
  > event. Nothing new belongs here: this file only gets shorter. Text unchanged from the caller.

### `src/integrations/data.ts`

- Line 1:

  > THE OUTSIDE SERVICES' DATA FILE (Phase 161i1, 8 Nov 2026; 09-app/ARCHITECTURE.md rule 3). The only file that runs
  > SQL on the tables architecture/tables.json gives the outside services: the outbox and the mailbox, the register
  > records and research runs, WhatsApp and video meetings. Every other file asks through these functions, from another
  > area through the outside services' front door. Each statement is the one its caller ran before, text unchanged.

### `src/shared/data-borrowed.ts`

- Line 1:

  > BORROWED: SQL ON OTHER AREAS' TABLES, RUN FROM THE SHARED (Phase 161i1, 8 Nov 2026; 09-app/ARCHITECTURE.md rules 3
  > and 4). These statements were in shared's page and logic files, which may not run SQL (rule 4). They read or write
  > tables a business area owns, so they still go against rule 3 (each counted against the table's owner), and Phase
  > 161l (the tangle undone) moves each one to its owner's data file, reached through that owner's front door or an
  > event. Nothing new belongs here: this file only gets shorter. Text unchanged from the caller.

## Date not recorded: Phase 40

### `src/integrations/registers/name-exclusion.ts`

- Line 518:

  > CLIENT SENDS IN, and it is here for a reason stated in Phase 40 (item

- Line 531:

  > controls, and Phase 40 §3.2 establishes that every one of them sits

- Line 615:

  > EXIST on the face of the documents (Phase 40 §4.2 works them through type

- Line 617:

  > one to a spec believing it harmless. Ordered as Phase 40 orders them:

- Line 626:

  > The three that are ALWAYS natural persons — Phase 40 §4.3

- Line 635:

  > Class D — no lawful basis is claimed for any of these. Phase 40 §4.5

## Date not recorded: Phase 41

### `src/integrations/registers/name-exclusion.ts`

- Line 513:

  > Subitem 13. Added by Phase 41 (board item 12928074627). Subitem 12 is

## Date not recorded: Phase 104

### `src/core/server.ts`

- Line 1:

  > The HTTP surface. ONE PROCESS SERVING BOTH APPLICATIONS.
  >
  > Node's own http server, no framework — the routing table is small enough to
  > read in one screen, and a reviewer can see that every route that touches an
  > object goes through `authorise` before it touches it.
  >
  > THE SHAPE THAT MATTERS: a handler receives the ACTOR and the OBJECT, and
  > calls authorise(actor, action, object). It never asks "what is this user's
  > role" and branches. A role check at the top of a handler is how the fourth
  > one gets forgotten.
  >
  > WHAT WAS NOT HERE, AND NOW IS. Phase 103 built the enforcement and said
  > "Phases 104 to 107 build what sits on it". Phase 104 built the first of
  > them — the public site, the assessment, the login and the client portal —
  > and it is mounted BEFORE the JSON API below, in src/core/router.ts.
  >
  > ONE PROCESS, ONE SESSION STORE, ONE `can()`. The web half does not get its
  > own authentication, its own authorisation or its own database handle; it is
  > handed this application. That is the whole reason it is mounted here rather
  > than run as a second server.

## Date not recorded: Phase 105

### `src/core/seed.ts`

- Line 283:

  > WORKING TIMES FIRST, THEN BOOKINGS — the same order Phase 105 builds in, and
  > for the same reason: a booking that does not fall inside somebody's hours is
  > a booking the calendar could not have made, and a seed that contained one
  > would be demonstrating a state the application refuses to produce.
  >
  > MONDAY TO FRIDAY, 09:00 TO 17:00 UTC, for ADMIN, SALES AND ACCOUNTING —
  > AND ONLY TWO OF THOSE THREE PRODUCE A BOOKABLE SLOT. That is the point of
  > seeding all three.
  >
  > SETTING WORKING TIMES AND BEING BOOKABLE ARE DIFFERENT PERMISSIONS. Everybody
  > on the staff has hours; only ADMIN and SALES are on `booking.write`, so only
  > their diaries are offered for a client call. `bookableUserIds` in
  > src/web/schedule.ts asks the rule table rather than carrying a list, and the
  > finance user is here so that a developer can see the distinction working
  > instead of reading about it. Until it existed, an unassigned booking was
  > auto-assigned to whoever's hours covered the slot — and on this very data
  > that was the finance user, which is what a screenshot of the calendar showed.
  >
  > SURVEYING GETS NO HOURS AT ALL. Not an omission: the surveyor's diary is a
  > different calendar with a different owner — CB_BOOKING says so where it
  > explains why video was removed — and giving them client-call hours here would
  > invite the next reader to book a sales call into a survey slot.

- Line 322:

  > ONE BOOKING PER BUSINESS, THROUGH THE CHANNEL THEY CHOSE, AND NO TIMES.
  >
  > Every one lands with `starts_at` NULL, which is exactly what the funnel
  > close writes when a client asks for a call without picking a moment — so
  > the seeded back office opens on a real work queue rather than on a diary
  > that somebody has already tidied. Booking one of these in and watching it
  > appear in the client's own portal is the demonstration Phase 105's brief
  > asks for, and it cannot be demonstrated on data that arrived pre-booked.

### `src/integrations/email/email.ts`

- Line 17:

  > CALENDAR_INVITE IS THE SECOND STUBBED TRANSPORT AND IT IS NOT A SECOND STUB.
  >
  > Phase 105's brief names two things as stubbed: outbound email AND calendar
  > invitations, and says both write to this table. An invitation is an email
  > with an attachment, so it goes down the same path rather than acquiring an
  > interface of its own — one thing to replace, and one row shape a screen can
  > label "not sent" without asking which kind it was.
  >
  > WHAT IS NOT REAL, PRECISELY: no message leaves the building and no iCalendar
  > object is generated. `sent_at` stays NULL on every row, which is how a screen
  > knows rather than how it guesses.

### `src/shared/objectstore.ts`

- Line 439:

  > THE PATTERNS MUST NOT MATCH THEIR OWN SOURCE, and one of them did.
  >
  > Phase 105 widened this scan from `router.ts` alone to every file in
  > src/web/ — necessary, because `staff.ts` serves the profile photograph and
  > a check scoped to one file stops being a check the moment a second file can
  > answer with bytes. The wider scan then failed on THIS FILE, because the
  > bare `/serve-static/` matched the literal in the list below.
  >
  > A self-match is not a false positive to be excluded away: excluding
  > `objectstore.ts` would exempt the one file that actually holds the store.
  > So the two library patterns now require an IMPORT CONTEXT, which is the
  > only way either of them can serve anything anyway. Every file in src/web/
  > is scanned, this one included.

## Date not recorded: Phase 106

### `src/core/seed.ts`

- Line 408:

  > Phase 106 this was five hand-written pairs, and by the time that phase

### `src/core/staff.ts`

- Line 454:

  > ------------------------------ SECTION 3 · engaged clients (Phase 106)

### `src/shared/stages.ts`

- Line 1:

  > THE STAGE VOCABULARY — one list, and it is not a new one.
  >
  > The client portal has to say where a claim is "in their words". Two
  > vocabularies already existed when this phase started and neither was a list
  > a screen could read:
  >
  >   · `businesses.stage` (migration 002, Phase 103) carries MACHINE KEYS —
  >     ASSESSMENT_SUBMITTED, RESEARCH_PART_RUN, ENGAGEMENT_SIGNED, AT_SURVEY,
  >     INVOICED, PAID. Phase 106 sorts the engaged-client list on them.
  >
  >   · `caprebate-business-flow-v2.html` carries the CLIENT-FACING WORDING as
  >     eleven step titles across two named parts — "The funnel" and "Building
  >     the defensible figure". Those are the words a person wrote for a person.
  >
  > SO THIS FILE MAPS; IT DOES NOT INVENT. Every `label` below is the business
  > flow's own `title`, transcribed rather than improved, and every `key` is a
  > value migration 002 already stores. Writing a third set of words here — even
  > better ones — is exactly what the phase brief forbids, because the client
  > would then read one thing, the staff list would sort on another, and the
  > document that defined the process would agree with neither.
  >
  > THE BUSINESS FLOW IS ARCHIVED BY THIS PHASE. Its content did not vanish; the
  > eleven titles are here, and that is the only place a screen reads them from.

## Date not recorded: Phase 107

### `src/core/audit.ts`

- Line 97:

  > Phase 107. Two events that had no honest kind before it, and were nearly
  > logged as DOCUMENT_ACCESSED for want of one — which would have made the
  > document-access record, the one requirement DB-W1-T6 is about, unreadable.
  >
  > SURVEYOR_COMMITTED is the moment a surveyor's own figures are recorded and
  > our estimate is released to them. It is the identity log's note of it; the
  > evidential record is the anchor log, which is hash-chained per the
  > quarantine module's own scheme and carries the figures themselves.
  >
  > INVOICE_UPDATED covers Caprebate's own finance. NEVER AN AMOUNT — the
  > detail screen would not refuse one, because a fee is not personal data,
  > but an audit line is a record that something happened and the invoice row
  > is the record of what it says.

### `src/core/seed.ts`

- Line 460:

  > TWO SURVEY JOBS, BOTH ASSIGNED, AND NEITHER COMMITTED.
  >
  > Until Phase 107 there was one, unassigned — and an unassigned job belongs
  > to NOBODY, because `assignedSurveyor` says so. So the surveying user
  > signed in, opened the section and correctly saw an empty list, which reads
  > exactly like a broken screen. A seed whose only demonstration of a feature
  > is a refusal is a seed that teaches the wrong thing.
  >
  > BOTH ARE SEALED. That is the state the whole block is about: the estimate
  > exists, it is quarantined, and committing figures is what releases it.
  > Seeding one already committed would hand a developer the released case
  > without ever showing them the withheld one, which is the case that matters.
  >
  > TWO RATHER THAN ONE, so the rate library has somewhere to be proposed back
  > INTO. A surveyor's first job in a sector shows empty rate fields and their
  > second shows their own figures returned to them, labelled as theirs — and
  > that is only demonstrable with two jobs. They are in different sectors, so
  > the two room schedules are both reachable.

### `src/core/server.ts`

- Line 390:

  > CORRECTED 9 SEPTEMBER 2026 (Phase 108). THIS RETURNED 501 AND SAID
  >          "the surveyor workspace is Phase 107". Phase 107 built it on
  >          9 September, and a route that still announces the feature as future
  >          work is a stub that lies about the state of the system — which is
  >          precisely what the developer spec's stub table exists to prevent.
  >
  >          IT SERVES THE SAME OBJECT THE SCREEN SERVES, THROUGH THE SAME
  >          ASSEMBLER. `payloadFor` calls `loadJob`, which authorises on the
  >          specific job, and then `assembleSurveyorPayload`, which builds the
  >          surveyor's object FORWARDS from what the quarantine released. There is
  >          no second assembly path and no second rule — N1 holds here because it
  >          is the same code, not because this route repeats the precaution.

### `src/core/staff.ts`

- Line 460:

  > ------------------------- SECTION 4 · the surveyor workspace (Phase 107)

- Line 478:

  > ------------------------------ SECTION 5 · Caprebate's finance (Phase 107)

## Date not recorded: Phase 108

### `src/core/authz.ts`

- Line 447:

  > MAY YOU OPEN THE BACK OFFICE AT ALL.
  >
  > The one place this application comes close to a role question, and it is
  > here in the table rather than at the top of a handler for exactly that
  > reason. It gates the back office's own landing page and decides where a
  > successful sign-in lands — nothing more: every section behind it authorises
  > its own objects, and a role that passes this and fails those sees a list of
  > sections it cannot open rather than a page it should not have.
  >
  > ACCOUNTING HAS SOMETHING TO OPEN SINCE 9 SEPTEMBER 2026. This comment read
  > "has nothing to open yet. Its view is Phase 107" until Phase 108; Phase 107
  > built /staff/finance the same week, so the note outlived its own fact. The
  > row is unchanged and was always right — what changed is only that the
  > landing page now leads somewhere.

## Date not recorded: Phase 113a

### `src/core/audit.ts`

- Line 114:

  > Phase 113a. A call being given a time, moved to another, or released back
  > to us with no time at all. It was being logged as USER_UPDATED, which was
  > the nearest honest kind available and was not honest enough: nothing about
  > a user changes, and an audit whose kinds do not name what happened is read
  > by nobody twice.
  >
  > ONE KIND FOR BOTH ROUTES. A staff member moving a call and a client moving
  > their own are the same event about the same object; WHO did it is
  > `actor_id` and `actor_role`, which is where that belongs. The detail
  > carries whether it was a first scheduling, a move or a release — never the
  > time itself, because `booking_changes` is the record of what it says.

### `src/core/backoffice.ts`

- Line 141:

  > How they asked to be reached.
  >
  > THE BOOKING IS THE AUTHORITY, AND SINCE PHASE 113a IT IS THE ONLY SOURCE.
  > It is the record CB_BOOKING produces at the funnel close and it carries the
  > entry point and the variant as well as the channel.
  >
  > THERE USED TO BE A FALLBACK HERE, reading `businesses.preferred_contact` when
  > no booking existed. That column was ended by migration 004 — every value set
  > to NULL and two triggers refusing any new one — and REMOVED by migration 007,
  > so the fallback had been reading a guaranteed NULL for four days and reading
  > a column that no longer exists after that. It is gone with the column.
  >
  > WHAT REPLACES IT IS THE SENTENCE THAT WAS ALREADY THERE. "Nobody asked, or
  > they did not say" was the answer whenever the copy was NULL, which was always;
  > it is now simply the answer whenever there is no booking. NOTHING IS LOST —
  > N4 in miniature: an absent fact stays absent and does not acquire a default.

- Line 492:

  > AND SINCE PHASE 113a IT IS UK TIME, NOT UTC. This message is addressed to

### `src/core/router.ts`

- Line 1487:

  > THE CLIENT MOVES THEIR OWN CALL — Phase 113a. One route, two verbs, and the
  > decision about which is a radio button rather than two forms that could
  > disagree about which booking they are addressing.
  >
  > EVERY CHECK IS IN portal.ts, on the object: this reads a form and renders
  > an answer. There is no role test here, no "is it too late" arithmetic here
  > and no slot list built here — a control in a handler is a control that the
  > next handler will not have.

- Line 1768:

  > A moment, spelled out, IN UK TIME — "Wednesday 2026-06-10 at 10:00 BST".
  >
  > ONE OF THE FOUR DISPLAY EDGES (Phase 113a). It used to print UTC and the
  > callers appended the word, which was honest and an hour wrong for eight
  > months of the year: a client offered "Wednesday at 09:00" in June would have
  > turned up at ten. The stored value is untouched; localtime.ts converts, and
  > the abbreviation comes from Intl rather than from an `if`.
  >
  > THE ZONE IS PART OF THE STRING because everything this renders is a moment a
  > CLIENT is going to keep. A terse cell in a staff table uses `stamp` instead.

### `src/core/staff.ts`

- Line 148:

  > A STORED TIMESTAMP, FOR A PERSON.
  >
  > `2026-09-08T18:52:26.289Z` is what the database holds and it is right that it
  > does — ISO-8601 UTC sorts, survives a Postgres port and cannot be confused
  > about seconds and milliseconds. It is also unreadable in a table a person is
  > scanning, and printing it raw is how six of them become one grey block. The
  > stored value is unchanged; this is a rendering.
  >
  > SINCE PHASE 113a IT IS ALSO A CONVERSION, and this is one of the four places
  > that does one. The database keeps UTC; a person reads UK time. See
  > localtime.ts, which is the only file in the application that names a zone.

## Date not recorded: Phase 113c

### `src/shared/extract-text.ts`

- Line 1:

  > READING TEXT OUT OF AN UPLOADED DOCUMENT — AND REFUSING TO INVENT ANY.
  >
  > This is the module behind the `TextExtractor` port. Before Phase 113c the
  > port was filled by a reader that handled text-bearing uploads honestly and
  > returned ONE MARKER LINE for everything else — so the receipt strip, on a
  > PDF or a .docx, ran over a marker rather than over the document. Two of
  > those three cases are now real:
  >
  >   .docx  — read through the ONE zip reader this project has (`zip.ts`),
  >            the same one the engagement letter uses. Nearly free.
  >   PDF    — uncompressed and FlateDecode content streams, text pulled from
  >            the Tj, TJ, ' and " operators. This is the real work, IT WILL NOT
  >            READ EVERY PDF, AND IT IS NOT SUPPOSED TO.
  >   text   — unchanged, and still the honest reading it always was.
  >
  > ═══ THE RULE THIS FILE IS BUILT AROUND, AND IT IS N4 ═══
  >
  > EVERY PATH THAT CANNOT READ A DOCUMENT RETURNS THE MARKER. Not a guess, and
  > — this is the half that is easy to get wrong — NOT AN EMPTY PAGE. An
  > encrypted PDF, a scanned one, an unsupported filter, a malformed zip, an
  > .xlsx where a .docx was expected: all marker.
  >
  > The reason is the whole reason the stub was written the way it was. A fake
  > that invented plausible page text would be worse than useless: the receipt
  > strip would be stripping content nobody uploaded, and the `document_events`
  > trail would record a strip that never touched a real name. AND AN EMPTY PAGE
  > IS THE SAME LIE IN A QUIETER VOICE — downstream, zero segments reads as "we
  > looked and there was nothing to redact", which is exactly the favourable
  > branch N4 forbids an unknown from taking. `markerPages()` is therefore the
  > only failure return in this file, and every `catch` and every empty result
  > funnels into it.
  >
  > NO NEW RUNTIME DEPENDENCY. node:zlib does the inflating. The back end still
  > has exactly one (@node-rs/argon2).
  >
  > WHAT IS STILL NOT READ, and it is why row 4 of the spec's stub table changes
  > wording rather than disappearing: a SCANNED PDF (page images, no text
  > operators — OCR, which is a library and a decision, not a gap), an ENCRYPTED
  > PDF, LZW/ASCII85/JBIG2/CCITT-filtered content, .doc (the pre-2007 binary
  > format), .xlsx and .pptx.

### `src/shared/zip.ts`

- Line 1:

  > ONE ZIP READER, AND THE PROJECT NOW HAS EXACTLY ONE.
  >
  > This is `letter.ts`'s central-directory walk, lifted here unchanged so that
  > the upload text extractor can use it. IT WAS NOT REWRITTEN AND IT WAS NOT
  > COPIED — `letter.ts` now imports it. Phase 113c's brief is explicit about
  > that: "DO NOT WRITE A SECOND ZIP READER", because a second one would be a
  > second place for the two traps below to be got wrong.
  >
  > TRAP ONE — A DOCX ZIP IN THIS CORPUS USES BACKSLASH ENTRY PATHS. Looking up
  > "word/document.xml" returns nothing and reads EXACTLY like a corrupt file.
  > The engagement letter really does store `word\document.xml`, the first
  > version of that reader shelled out to `unzip -p` asking for the
  > forward-slash name and got "filename not matched", and the COORDINATES block
  > in the action plan carries the warning to this day. `docxDocumentXml` below
  > tries both spellings, so no caller has to remember.
  >
  > TRAP TWO — NO EXTERNAL BINARY, AND NO NEW RUNTIME DEPENDENCY. Shelling out
  > to `unzip` made the portal depend on a tool that is not on a stock Windows
  > machine, in a back end whose whole claim is one runtime dependency
  > (@node-rs/argon2). node:zlib does the inflating; this file adds nothing to
  > package.json.

## Date not recorded: Phase 146g

### `src/core/router.ts`

- Line 1226:

  > PHASE 146g: `reading` carries the process's key store and transport to steps 9 and 10 of the receipt contract,
  >        which nothing in src/ reached until this phase. It switches nothing on — CLAUDE_SWITCHES.DOCUMENT_READING is
  >        false — and with it off a finished upload behaves exactly as it did before. The document's own business is
  >        whose gates the reading's audit row records; `P.document` above has already authorised this actor on it.

### `src/core/staff.ts`

- Line 640:

  > ---------------------------------- PHASE 146g · addresses we cannot email

## Date not recorded: Phase 146h

### `src/integrations/connectors/companies-house.ts`

- Line 232:

  > PHASE 146h: the REVIEW band's list to the back office, or a person's choice back, keyed on the COMPANY
  >          NUMBER — which is what this lookup reads a profile by, so a choice names a company and not a row.

### `src/integrations/connectors/cqc.ts`

- Line 173:

  > PHASE 146h: a REVIEW's ranked list goes to the back office, or a person's choice comes back in it, keyed on
  >        the location id — the key this lookup reads a registration BY. Outside the REVIEW band this does nothing.

### `src/integrations/connectors/epc.ts`

- Line 283:

  > PHASE 146h: the REVIEW band's list goes to the back office, or a person's choice comes back in it. Outside
  >          that band this does nothing at all, and the four lines below are what they were.

- Line 306:

  > PHASE 146h, ITEM 2 — THE TWO CODED FIELDS, DECODED THROUGH THE REGISTER'S OWN CODE LISTS, or left out.
  >        Domestic certificates only: nothing else carries either code, so nothing else spends a call asking.

### `src/integrations/connectors/homedata.ts`

- Line 354:

  > PHASE 146h: the REVIEW band's list to the back office, or a person's choice back, keyed on the UPRN — the key
  >        the detail call is made BY. This lookup is paid and already waits on a signed engagement, which is the same
  >        gate the pick waits on, so nothing here widens when the pick may be offered.

### `src/integrations/connectors/matching.ts`

- Line 268:

  > PHASE 146h: what a person reads to tell this candidate from the next one, where the register's own address lines
  > are not what distinguishes them — a company name, for instance. Absent, `candidateLabel` writes the address out.
  > IT IS NEVER STORED AND NEVER LOGGED: it exists for the back-office pick, which holds it for one request (A.8
  > point 8), and for nothing else.

- Line 288:

  > PHASE 146h: EVERY SCORED CANDIDATE, BEST FIRST. IN MEMORY ONLY, exactly as `top` is, and for one more reader:
  > the back-office pick (src/web/match-review.ts), where a person chooses one of them or none. No connector keeps
  > it, nothing writes it to the database, and no audit row carries it — a candidate's address lines are the
  > register's, under its own notice, and A.8 point 8 says they are not stored or logged.

### `src/integrations/connectors/planning.ts`

- Line 101:

  > PHASE 146h: `took` is the candidate we are keeping and `why` says how we came by it — an ACCEPT's own words, or a
  > person's pick. It used to take the whole match and read `m.best`, which could only ever be an ACCEPT.

- Line 123:

  > PHASE 146h: THE TWO SERVICES ARE ASKED IN ORDER AND A PICK BELONGS TO ONE OF THEM. A choice made from
  > planning.data.gov.uk's list must not be looked for in PlanIt's, so the pick is applied per service and a key that
  > is not in THIS service's list is simply not a choice here — the next service is asked as it always was. Only when
  > a choice was made and neither service holds it does the lookup report that it has gone.

### `src/integrations/connectors/price-paid.ts`

- Line 146:

  > PHASE 146h: the REVIEW band's list to the back office, or a person's choice back, keyed on the transaction id
  >        — HM Land Registry's own key for one sale. Outside that band this does nothing.

## Date not recorded: Phase 161l

### `src/core/backup.ts`

- Line 44:

  > Read when used, not while this file loads (Phase 161i: the areas' front doors load whole, and the code still loops between areas until Phase 161l).

### `src/core/upload-pieces.ts`

- Line 33:

  > Read when used, not while this file loads (Phase 161i: the code still loops between areas until Phase 161l).

### `src/integrations/email/email-inbound.ts`

- Line 60:

  > Read when used, not while this file loads (Phase 161i: the areas' front doors load whole, and the code still loops between areas until Phase 161l).

### `src/shared/objectstore.ts`

- Line 56:

  > Read when used, not while this file loads (Phase 161i: the areas' front doors load whole, and the code still loops between areas until Phase 161l).

## Date not recorded: no phase named

### `src/core/app.ts`

- Line 53:

  > 29 SEPTEMBER 2026: why this server keeps its records where it does, when the caller knows - the test website sets
  > it from its database choice (api/index.mjs, openLasting's `why`). Never an address and never a token. Absent, the
  > pages say only that the records are in memory.

- Line 59:

  > 29 SEPTEMBER 2026: TESTS ONLY - the contact form security check's call policy with some values changed (the
  > transfer to Cloudflare approved), so a test can reach the recorded answers. Never set by a running server.

- Line 64:

  > 30 SEPTEMBER 2026: TESTS ONLY - Zoom's two call policies with some values changed (the transfer approved), so a test
  > can reach the recorded answers (src/integrations/connectors/zoom.ts). Never set by a running server.

- Line 69:

  > 30 SEPTEMBER 2026: TESTS ONLY - WhatsApp's call policy with the transfer approved (src/integrations/connectors/whatsapp.ts).

- Line 71:

  > 30 SEPTEMBER 2026: TESTS ONLY - a recorded inbox and the reading switch, for reading replies when staff look.

- Line 74:

  > 30 SEPTEMBER 2026: TESTS ONLY - "Find my address" switched and approved as a test needs (src/integrations/connectors/address-lookup.ts).

- Line 76:

  > 30 SEPTEMBER 2026: TESTS ONLY - how the server reaches the mail server (a fake one). Never set by a running server.

- Line 78:

  > 29 SEPTEMBER 2026: TESTS ONLY - the assessment's first screen's two lookups (Companies House, Postcodes.io) with
  > their gate and switches set, so a test can reach the recorded answers. Never set by a running server.

### `src/core/db.ts`

- Line 59:

  > 1 OCTOBER 2026 — A CONNECTION TURSO DROPPED IS OPENED AGAIN. The test website's build empties and refills its lasting
  > database; on 1 Oct 2026 every refill stopped part way with Turso's "stream not found" (a connection the server no
  > longer holds), so the database was left half filled and every copy of the website ran on its own memory — replies
  > never met the emails they answered, and sign-ins did not last. Now a call that meets a dropped connection opens it
  > again and is made once more; a transaction that meets one is begun again from the start (the server undid it when the
  > connection went, so nothing of it is kept). Only for a remote database: a file or memory has no connection to lose.

- Line 72:

  > FASTER CLICKS, 3 OCTOBER 2026 — ONE ANSWER PER QUESTION, PER CLICK. Lakhbir: "The back end is really slow to react to
  > clicks." On the test website every query is a trip over the network to the lasting database (Turso), and a click on
  > Home asked 467 to 737 of them — the same "which surveyor is on this claim?" 165 times — so a page that takes 0.03 s on
  > the Mac took 4 to 10 s there. While one click is answered (`withReadMemo`, wrapped round every request in
  > src/core/server.ts), a read asked again with the same SQL and the same values is answered from what this click already
  > has. It is safe because it can never be out of date:
  >   - ANY WRITE, by this click or any other one in this process, forgets everything remembered, at once (`#epoch`);
  >   - INSIDE A TRANSACTION nothing is remembered or reused: a transaction reads the database itself;
  >   - each caller gets its OWN COPY of the rows, so one that changes a row it was given changes nobody else's;
  >   - a value that is not plain text, a number or nothing (a file's bytes) is never remembered;
  >   - outside a click (start-up, the seed, the timers) nothing is remembered.
  > A second copy of the website writing meanwhile is seen on the next click, as before: one click reads one moment.

### `src/core/router.ts`

- Line 583:

  > 29 SEPTEMBER 2026: THE NEW HOME PAGE (src/web/home-site.ts), its style, its script and GSAP, when the file is beside
  >      the build. Without it, `/` is `Caprebate site.html` as below.

- Line 727:

  > 29 SEPTEMBER 2026: THE SECURITY CHECK, ON THE SERVER (src/integrations/connectors/turnstile.ts). Without a secret key, or before
  >        the transfer to Cloudflare is approved, nothing is checked and the enquiry is kept as before. With both, an answer
  >        that is missing, rejected or unanswered refuses the enquiry: nothing is kept, and the audit says which.

- Line 786:

  > 30 SEPTEMBER 2026: the first screen of 29 September (the company and the property up front) is retired: the four-stage
  >      funnel asks for them per building, at stage 3. An old link to it opens stage 1.

- Line 790:

  > 30 SEPTEMBER 2026: THE FOUR-STAGE FUNNEL (src/web/funnel4.ts). Buildings, then the checks per building, then who
  >      owns each and where, then the figure. The server keeps a person on the first screen that is not complete, and a
  >      follow-up that does not apply is not kept.

- Line 902:

  > 30 SEPTEMBER 2026: THE FOUR-STAGE CLOSE. First name, surname, position; then telephone (a time and the number),
  >          video call (a time and an email address) or email. One organisation per business that owns a building, each
  >          with its own lead, linked as one enquiry; the person is the contact on each; one booking, on the first.

- Line 2240:

  > 29 SEPTEMBER 2026 — WHY A SIGN-IN STEP IS LOST, SAID WHERE IT HAPPENS. A step lives in the database (sign_in_steps).
  > On a database kept in memory, each copy of the website has its own, so a step begun on one copy is not there when the
  > next request reaches another, and it reads as "timed out" at once. Reproduced that day with two copies on memory.
  > The test website runs on memory whenever its lasting database is not in use (api/index.mjs, lastingDatabase).

### `src/core/secrets.ts`

- Line 409:

  > 30 SEPTEMBER 2026: THE TEST WEBSITE HAS NO KEY FILE; its keys are its settings, read behind the test password
  > (api/index.mjs, configureTestDeploy). Screens that ask `processSecrets()` for the email login (a staff email, a message
  > alert, the settings page) would find none there, so the website hands its store here once it has read it. Never used
  > under the test runner, and a running server with a key file never calls it.

### `src/core/server.ts`

- Line 168:

  > 30 SEPTEMBER 2026: EMAILS SAVED TO BE SENT ARE SENT BEFORE THE ANSWER FINISHES. Sending is on for testing
  >      (EMAIL_SENDING); before, only `node src/core/cli.ts send-outbox` could send, and nothing ran it. The answer's end is held
  >      until every email this request saved to be sent - by any part of the site: an invitation, a staff email, a message
  >      alert - has been tried once through IONOS, then released; so the test website's copy, frozen once it has answered,
  >      still sends. Each row is claimed first (last_error set while it goes), so two copies never send one email twice. An
  >      invented address (@example.invalid, example.com: the seed's and the tests') is never sent to. A failure is kept on the
  >      row and never stops the answer. The same checks as the command line: do not contact, a bounced address, a lost file.

### `src/integrations/connectors/registers.ts`

- Line 191:

  > 2 OCTOBER 2026 — THE FREE LOOKUPS, SWITCHED ON FOR THE TEST WEBSITE ONLY (the survey pack, stage 6).
  >
  > Lakhbir, asked which lookups to switch on for the test website: "All the free ones" — the energy certificate (EPC),
  > the Land Registry's price paid (HMLR_PPD), planning applications (PLANNING) and the care regulator (CQC). The paid
  > ones (Homedata, the land boundary) stay off, and so does every switch above: REGISTER_SWITCHES is unchanged.
  >
  > WHAT IT WAIVES, ON THE TEST WEBSITE AND NOWHERE ELSE: for these four sources only, the free-tier gate (a published
  > privacy notice, CB_REGISTRY.precondition, and with it CA7's match measurement) and the five conditions of the test
  > lookups (src/integrations/connectors/test-lookups.ts): they run for the test website's own clients, which are invented. It waives
  > nothing else: a lookup that needs the signed engagement (CA2) still waits for it, a client who chose to answer the
  > questions themselves is still not looked up, and each source still needs its key. As the postcode check's waiver
  > (src/integrations/connectors/postcode-check.ts): before real visitors, publish the notice, then take this waiver out.
  >
  > WHERE IT HOLDS: on the deployed test website (Vercel says so: src/integrations/connectors/place.ts), or a copy started with
  > CAPREBATE_LOOKUPS_HERE=1. A copy on a computer, and every test that does not say otherwise, sees the switches above.

### `src/integrations/connectors/sources.ts`

- Line 236:

  > 2 OCTOBER 2026 — the building outlines for the report's site plan (the survey pack, stage 6;
  >        src/integrations/connectors/os-buildings.ts). Ordnance Survey's Features API, on the free OS OpenData plan, serving OS Open
  >        Zoomstack's local buildings: open data under the Open Government Licence, shown with "Contains OS data © Crown
  >        copyright and database right". Only a small square of map around the postcode's point is
  >        asked for, never a name or an address. Ordnance Survey is in Southampton, so UK. Its key is a project key from
  >        osdatahub.os.uk. The OS Data Hub's open plan publishes 600 transactions a minute; ten a minute is ours.

- Line 276:

  > 29 SEPTEMBER 2026 — the home page contact form's security check (src/integrations/connectors/turnstile.ts). A PROCESSOR, not a
  >        register source: the server sends Cloudflare the widget's answer and the visitor's address, and Cloudflare says
  >        whether the answer is real. Address and call from developers.cloudflare.com/turnstile/get-started/server-side-
  >        validation (read 29 Sep 2026). Cloudflare, Inc. is a US company with a global network; it publishes no region
  >        for this call, so the row says US. Until the data protection officer approved the transfer, nothing was sent and
  >        every enquiry was kept unchecked (src/integrations/connectors/turnstile.ts says which in the log). The widget in the visitor's
  >        browser already talks to Cloudflare, so the privacy notice needs a line either way.
  >        ONE TRY: an answer is good once, so a retry would be refused as a duplicate. Turnstile is free.

- Line 292:

  > 30 SEPTEMBER 2026 — video calls (src/integrations/connectors/zoom.ts). A PROCESSOR. Zoom's Server-to-Server OAuth: the server
  >        swaps its app's id and secret for an hour's access token. Address from developers.zoom.us (read 30 Sep 2026).
  >        Zoom Video Communications, Inc. is a US company, so the row says US and the transfer is NOT APPROVED: until the
  >        data protection officer approves it, no meeting is made, and the team sends a link as before. What is sent is
  >        the time of the call and the words "Cap Rebate call"; no client's name, email or number. The call itself (the
  >        client's voice and picture) runs through Zoom whichever way it is joined, which is what the approval is about.
  >        ONE TRY for the token: a refused secret stays refused.

- Line 307:

  > 30 SEPTEMBER 2026 — make, move and cancel a video call's meeting, and the host's start token (ZAK), through
  >        api.zoom.us (developers.zoom.us, read 30 Sep 2026). US, not approved, as ZOOM_OAUTH. ONE TRY: making a meeting is
  >        not safe to repeat (a retry after a lost answer makes two). Zoom's plans allow about a hundred meetings made a day
  >        per user; twenty a minute is OUR cautious limit.

- Line 319:

  > 30 SEPTEMBER 2026 — WhatsApp with each client from the back office (src/integrations/connectors/whatsapp.ts). A PROCESSOR:
  >        Meta's WhatsApp Cloud API, graph.facebook.com (developers.facebook.com, read 30 Sep 2026; Graph API v25.0). Meta
  >        keeps Cloud API messages in its data centres, in the United States unless a local storage region is set up, so
  >        the row is US and the transfer is NOT APPROVED: until the data protection officer approves it, nothing is sent
  >        and the back office says so. What is sent: the number and the words staff typed. ONE TRY: a retry after a lost
  >        answer would send the message twice. Meta's limit for a new number is far above ours; sixty a minute is OURS.

### `src/integrations/connectors/test-lookups.ts`

- Line 92:

  > Condition 1, in Lakhbir's number.

- Line 197:

  > A lookup line, built from the fields Lakhbir named and from nothing else.

### `src/integrations/email/email-provider.ts`

- Line 81:

  > The provider chosen, by the id of its adapter. Null until Lakhbir chooses.

- Line 121:

  > TRUE SINCE 24 SEPTEMBER 2026 (the afternoon): the mailbox exists, its SPF, DKIM and DMARC records are published,
  >      Sadique Maskeen reads it (Word question 216, closed), and the one test email (Word question 217, closed) was sent
  >      by smtpProvider to Lakhbir and arrived. It landed in junk at first: a new domain, and whether IONOS signs with DKIM
  >      is still to be checked in its control panel. Sending stays OFF: the privacy notice and the engagement letter must
  >      name IONOS first, and then the switch.

### `src/integrations/postcodes/postcode-authority.ts`

- Line 533:

  > ASSUMPTION A-1 — CHECKED ON 8 SEPTEMBER 2026, AND IT WAS WRONG.
  >
  > This module first shipped assuming `pcds`, `doterm` and `laua`, the
  > documented historic layout, with a note saying nobody had opened the CSV.
  > Somebody then opened it: NSPL_AUG_2026.zip was downloaded and its real
  > header read. Two of the three names were right and one was not.
  >
  >   pcds    correct
  >   doterm  correct
  >   laua    WRONG. The real column is `lad26cd`.
  >
  > AND THE INTERESTING PART IS NOT THAT IT WAS WRONG, IT IS THAT IT MOVES.
  > The local-authority column is VERSIONED BY RELEASE YEAR — `lad26cd` in the
  > August 2026 CSV, `LAD25CD` on the live feature service, `laua` historically.
  > A hard-coded name is therefore not merely wrong today, it is a thing that
  > breaks every time ONS publishes. Since ONS publishes quarterly and this
  > table is refreshed quarterly, a hard-coded name would fail on roughly the
  > fourth refresh and look like a corrupt download.
  >
  > So the default is the VERIFIED name, and `resolveColumn` below falls back to
  > the versioned pattern and RECORDS which column it actually used, rather than
  > either failing or silently guessing.

### `src/integrations/registers/source-register.ts`

- Line 647:

  > company and not about a person. PROPOSED, for the data protection officer (Sadique Maskeen) to agree — the

- Line 648:

  > corrections of 3 October said "change the permitted fields first (and ask Sadique), then map". Nothing reads

### `src/shared/assets.ts`

- Line 57:

  > Lakhbir chose. Each group has a solid colour (white text on it), a light tint, and the darker text drawn on the tint.

### `src/shared/engine.ts`

- Line 465:

  > NOT DECIDED — a named null until Lakhbir answers.

- Line 467:

  > NOT DECIDED — a named null until Lakhbir answers.

### `src/shared/html.ts`

- Line 109:

  > 29 SEPTEMBER 2026: the public pages (the assessment, sign-in, the enquiry's thank-you) wear the new home page's

- Line 110:

  > colours and its mark — the calculator drawn as a house, with the name beside it (Lakhbir: "when someone clicks am i

- Line 115:

  > animated), with a line under the name saying which side this is (Lakhbir: "ensure our branding from the home page

### `src/shared/originals.ts`

- Line 51:

  > The title of the question under Lakhbir in CAPREBATE QUESTIONS. Quoted, not paraphrased.
