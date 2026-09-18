# Caprebate — Postcode to Billing Authority Resolver

**Board item 12991298199 · Phase 9 · built 8 September 2026 · prepared, NOT SHIPPED**

> **PHASE 110, 9 SEPTEMBER 2026 — THIS MODULE IS NOW CALLED BY SOMETHING, AND THE TABLE HAS SOMEWHERE TO LIVE.**
> Section 10 is the whole of what changed. In short: the resolver reads a **store** behind an
> interface rather than a JavaScript object, and the recommended store is a **75 MB read-only
> SQLite file** rather than 290 MB of JSON — measured, not assumed. It is **wired to LEG-E4**,
> which **remains off**. An out-of-date table now **does** something. And the council area it
> returns is mapped to a **region**, which is what the surveyor's rate library needed.
> Sections 1 to 9 below are unchanged and still true; **§9's command has moved on** and §10.6
> gives the current one.

| | |
|---|---|
| Module | `caprebate-postcode-authority.ts` |
| Tests | `caprebate-postcode-authority.test.ts` — **38 pass / 0 fail**. Phase 110 adds 52 more across three new files; the folder total is **324 pass / 0 fail** (re-derived 9 Sep 2026 after Phase 113d added Suite H, the engagement gate's cost input — run it, do not quote it). |
| Run | `cd phase9 && node --test` |
| Ships | Two empty tables, for two different reasons. Nothing can resolve until an ingest is run. |
| Proven | **Run end to end against the real 964 MB ONS download on 8 September 2026** — 2,657,599 postcodes, 352 authorities. See §5. |

---

## 1. Why this exists, and why it was the real blocker

LEG-E4 — the regional location factor — consumes a `location_key` and refuses without one.
**Nothing in this system has ever produced one.**

That is worth stating plainly because the board said something else for weeks. The item was
recorded as blocked on the Valuation Office rating list, which is genuinely licence-gated. Then it
was corrected to "blocked on a resolver that does not exist", which was right. **Nobody had checked
whether a free alternative existed.** It does, and this module is it.

The consequence of the old framing: buying the price book would have bought a table nobody could
key into. **The purchase was never sufficient on its own, and nothing said so.**

---

## 2. The licence — checked against the publisher, not assumed

Established 7 September 2026 by reading the publisher's own licence page and querying its own live
service. Recorded in `ONS_LICENCE`, and in the phase 3 source register as `ONS_POSTCODE_OGL`.

| | |
|---|---|
| Publisher | Office for National Statistics, Open Geography Portal |
| Product | National Statistics Postcode Lookup (the ONS Postcode Directory is the same licence) |
| Licence | **Open Government Licence v3.0 — no negotiation, no counterparty, no fee** |
| Bulk file | `NSPL_AUG_2026.zip`, **176.5 MB** (185,109,467 bytes), CSV, no key and no account |
| Cadence | Quarterly — February, May, August, November |
| Coverage | 2,726,477 postcodes |
| The field | The local authority district code, which at England-and-Wales level **is** the billing authority for non-domestic rates |

**Proved rather than assumed.** The ONS live service was queried and returned `CF10 3NB → W06000015`
(Cardiff), `SW1A 1AA → E09000033` (Westminster), `M1 1AE → E08000003` (Manchester). Those three are
the shape check in the test file.

### 2.1 Three attribution lines, and why this is not the shared OGL entry

ONS requires all three of these, because the product is Gridlink-derived:

```
Contains OS data © Crown copyright and database right [year]
Contains Royal Mail data © Royal Mail copyright and database right [year]
Source: Office for National Statistics licensed under the Open Government Licence v.3.0
```

The source register already had an `OGL_V3` licence entry serving Companies House and planning data,
whose attribution is the generic *"Contains public sector information licensed under the Open
Government Licence v3.0."* **Reusing it here would under-attribute, and under-attribution breaches
the condition the licence is granted on.** Same licence, different obligation, therefore a separate
entry. `resolveBillingAuthority` returns the three lines on every answer, with the year substituted,
so an output cannot carry the figure without carrying the attribution.

### 2.2 The one carve-out, and it is not "Great Britain only"

**Northern Ireland is excluded** from the OGL grant for commercial use; BT postcodes need a separate
licence direct from Land and Property Services.

**Scotland is not excluded.** This distinction is commercial, not pedantic: widening the business to
Scotland is free, and widening it to Northern Ireland costs a licence somebody has to buy. A blanket
"Great Britain only" reading would have wrongly blocked Scotland as well, so the code excludes the
`BT` area specifically and a test asserts that a Scottish postcode still resolves.

**Enforced twice, and the ingest one is the real control.** Northern Ireland rows are dropped **at
ingest**, so the table never holds data we are not licensed to use commercially. The lookup refuses
BT as well, but that is belt and braces — keeping the rows and refusing later would be holding the
data, which is the thing the carve-out forbids. The lookup refusal is also ordered **before** the
table is read, so it cannot start silently succeeding the day somebody ingests a table.

---

## 3. What ships, and what does not

Two empty tables. **They are empty for completely different reasons and the licence strings say so —
a reader who conflates them will think buying the price book is enough.**

| Table | Empty because | Cleared by |
|---|---|---|
| `CB_ONS_POSTCODE_AUTHORITY` | **an ingest nobody has run.** The licence is cleared and the file is free | one download, this afternoon, by anyone |
| `CB_LAD_TO_LOCATION_KEY` | **a purchase nobody has made.** The price book keys its factors on its own regional naming, which is invisible until the book is bought | board item 12804374406, about £330 |

`resolveLocationKey` chains the two and **fails with a different error code at each link**, so the
message tells you which of the two things is missing rather than reporting a generic failure.

### 3.1 The honest limit

**This module does not turn LEG-E4 on.** It removes one of the two things standing in the way. The
other is the purchase, and `E_LOCATION_KEY_TABLE_NOT_LOADED` says so in terms:

> resolved 'CF10 3NB' to Cardiff (W06000015), but the map from local authority to the price book's
> own regional key is empty because the price book has not been bought. The postcode half of LEG-E4
> is solved; the purchase half is not.

---

## 4. The rules this module obeys

**It never makes a network call**, and the reason is *not* a licence. `onsFetchNotWired` is the
default and only fetcher and throws `E_NO_NETWORK_CALL_IN_ENGINE` before doing anything. This is the
one place it differs from `caprebate-voa-import.ts`, which refuses for a licence reason that will one
day be negotiated away. **Here the licence is already cleared — the refusal is architectural.** The
engine makes zero network calls; ingest is an out-of-band job whose output is handed to `ingestNspl`
as text. Do not "fix" this by wiring a fetch.

**No second permission gate.** The standing rule says free calls fire once the client has given
permission, and that `CB_REGISTRY.precondition` is already that gate — *"DO NOT BUILD A SECOND
GATE."* So this module has no gate of its own. It is inert because its table is empty, and the
caller is the gate. See §6 for the open question about whether that gate should even apply here.

**Unknown is not a branch.** Every refusal is a refusal. An unlisted postcode does not fall back to a
nearby authority; an unmapped local authority does not fall back to the national mean; a terminated
postcode does not silently resolve. Each is a question, and each has its own error code.

**The pattern decides shape; the table decides existence.** Postcode validation is deliberately
permissive. A regex that rejects a postcode the ONS table actually contains is a client who cannot be
served, reported as "malformed" rather than as our bug — so the pattern catches obvious garbage and
the ingested table is the authority on what exists. `GIR 0AA` is admitted by shape and refused by the
table, which is the right division of labour and is asserted as such.

---

## 5. What running the real file found — three defects the tests could not see

The module was written, tested green at 30 assertions, and **then run against the actual 176.5 MB
download**. That run found three things, and it is worth being blunt about why: every fixture in the
test file was three lines long, and all three defects are invisible at three lines.

### 5.1 Assumption A-1 was wrong, and the interesting part is that it MOVES

The module shipped assuming `pcds`, `doterm` and `laua`. Two of the three were right.

**The local-authority column is `lad26cd`.** And it is *versioned by release year* — `lad26cd` in the
August 2026 CSV, `LAD25CD` on the live feature service, `laua` historically. A hard-coded name is not
merely wrong today: **it breaks every time ONS publishes**, which is quarterly, which is exactly the
cadence at which this table is refreshed. It would have failed on roughly the fourth refresh and
presented as a corrupt download.

The default is now the verified name, with a fallback to the versioned pattern `lad<year>cd|laua`,
and the table records `lad_column_used` so it says what it was actually built from. Tested across
four vintages (E5b).

### 5.2 The module could not read the file it was written for

`ingestNspl(csvText: string)` was the only entry point. **The real UK extract is 964 MB of CSV and
Node's maximum string length is about 512 MB**, so `readFileSync(path, 'utf8')` throws
`ERR_STRING_TOO_LONG` before a single row is parsed.

The row logic now lives in `createNsplIngest`, fed a line at a time; `ingestNspl` is a thin wrapper
for fixtures and for the per-area extracts. The runner streams with `readline`. H1–H3 hold it down,
including that the streaming core and the whole-file wrapper agree.

### 5.3 2,417 real postcodes were being called malformed

The first real ingest quarantined 2,418 postcodes as `E_MALFORMED_POSTCODE`. **2,417 of them were
`NPT`** — historic Newport, Gwent, superseded by `NP` but still carried in the ONS table. The general
pattern requires a digit after the leading letters and `NPT 0AD` has none.

All 2,417 are terminated, so nothing would have resolved them anyway. **What would have been wrong is
the reason.** A client whose historic address is an NPT postcode would have been told they had typed
something that is not a UK postcode. This module's own rule — a pattern that rejects a real postcode
is a client who cannot be served, reported as *malformed* rather than as our bug — was being broken
by the module itself.

`GIR` and `NPT` are now an explicit allow-list of three-letter outward codes. Deliberately an
allow-list and not a looser pattern: admitting any three letters would admit real garbage, and
`ZZZ 0AA` is still refused.

### 5.4 The real numbers

| | |
|---|---|
| Lines read | 2,729,091 |
| **Postcodes loaded** | **2,657,599** |
| Distinct billing authorities | 352 |
| Northern Ireland rows dropped at ingest | 63,293 |
| No local-authority code in the source | 8,198 |
| Malformed | **0** |

**A real coverage limit, recorded rather than smoothed over.** About 880 *live* GB postcodes carry no
local-authority code in this release at all — roughly **0.03%**. They are refused, not guessed. If a
client's property is one of them the answer is "we cannot derive your council area", which is correct
and is the whole discipline of this module.

---

## 6. Remaining assumptions

**Assumption A-2 — LAD equals billing authority.** True for England and Wales, where the billing
authority for non-domestic rates is the district, unitary, London borough or the City. Recorded here
because if the served jurisdiction ever changes, this is the sentence to re-check.

**Assumption A-3 — postcode centroids are good enough.** A postcode unit can straddle a boundary;
ONS assigns it by mean grid reference. For a regional cost factor that is immaterial, but the answer
is a **best fit, not a certainty**, and should be recorded as derived rather than asserted as fact.

**Assumption A-4 — the authority names are a release behind the codes.** The names-and-codes file
inside `NSPL_AUG_2026.zip` is `LAD Local Authority District names and codes UK as at 04_25.csv`,
i.e. 2025 vintage, against a `lad26cd` column. Codes absent from the names file fall back to the GSS
code itself, which is correct but unreadable in a surveyor's report. Worth checking on each refresh.

---

## 7. Open, and routed

**Does the registry permission gate apply to this lookup at all?** `CB_REGISTRY.precondition` is
justified on the grounds that those lookups process information about *identifiable people* — the
proprietor at HM Land Registry, persons of significant control at Companies House. **This lookup
processes none.** It maps the client's own postcode to a council area from a static published table,
with no external call and no third party's data anywhere in it.

**STILL OPEN ON 9 SEPTEMBER 2026, AND THE BUILD IS WRITTEN SO EITHER ANSWER IS ONE LINE.**
`POSTCODE_GATE.gated` in `09-app/backend/src/web/postcode.ts` is a single boolean saying whether
this lookup sits **behind the existing registry gate**. It does not add one — standing rule 13(b),
and there is a test asserting the registry gate is still shut.

There is a reasonable argument that it therefore needs no gate. **That is a data protection judgement
and not one to make in a code comment**, so it is asked rather than assumed — routed to the data
protection officer in CAPREBATE QUESTIONS. Until it is answered the module stays inert, which costs
nothing because the table is empty anyway.

---

## 8. Test map

| Group | What it holds down |
|---|---|
| **A1–A3** | Both tables ship empty and say why in *different* terms; the shipped table refuses; the fetcher refuses and not on licence grounds |
| **B1–B5** | Canonical normalisation; all six UK postcode shapes accepted; garbage refuses; `GIR 0AA` is the parser/table division of labour |
| **C1–C7** | The three verified postcodes resolve; unlisted refuses; terminated refuses then flags; **Northern Ireland refuses on licence grounds before the table is read**; Scotland is *not* excluded; attribution travels with every answer |
| **D1–D4** | The chain refuses at the *purchase* link with a distinct code, and the message names what it did resolve |
| **E1–E7** | Ingest: good file loads; bad rows quarantine with line numbers and reasons; NI rows dropped at ingest; terminated rows kept; bad file throws and names assumption A-1; columns are an argument |
| **F1–F2** | Staleness tracks the quarterly cadence plus a month, not the OGL default of 180 days |
| **G1–G2** | The licence record states in data that nothing needs negotiating, and that the generic OGL line is not used |
| **H1–H5** | The three defects §5 found: incremental ingest and the 512 MB string limit; a row before a header refuses; streaming and whole-file agree; three-letter outward codes are real; an NPT postcode reports *terminated*, not *malformed* |

**Two mutation checks were run rather than assumed**, on the two behaviours that would fail
silently. Reading the table before the Northern Ireland check fails **C4 alone**. Making an unlisted
postcode fall back to a default fails **C2 and B4**. Both were restored immediately.

---

## 9. To actually fill the table

**This was done once already, on 8 September 2026, and it worked.** These are the steps that were
actually run, not a plan.

1. Download the National Statistics Postcode Lookup from the ONS Open Geography Portal — 176.5 MB,
   no key, no account. The zip holds the single UK CSV, per-area CSVs, the names-and-codes lookups
   and the user guide.
2. Unzip `Data/NSPL_<REL>_UK.csv` and
   `Documents/LAD Local Authority District names and codes UK as at <date>.csv`.
3. Run the ingest:

```bash
node --max-old-space-size=10240 --experimental-strip-types \
  caprebate-postcode-authority-ingest.ts \
  --csv NSPL_AUG_2026_UK.csv \
  --names "LAD Local Authority District names and codes UK as at 04_25.csv" \
  --release AUG_2026 --out cb-ons-postcode-authority.json
```

4. **Check the `lad column` line in the output.** If it is not the default, ONS has renamed it again
   and `NSPL_COLUMNS_VERIFIED` should be updated to match.
5. Hand the JSON to `resolveBillingAuthority` as an injected table. Re-run quarterly;
   `tableIsStale` reports at 120 days.

**The output is about 292 MB of JSON and MUST NOT be committed to this repository.** The repository
holds the mechanism; the deployment holds the table. Every other Phase 9 table follows that rule for
licence reasons — this one follows it for size, and the rule is the same either way.

None of it needs a licence, an email, or a purchase order.

---

## 10. What Phase 110 did — 9 September 2026, board item 12993800139

Three jobs were asked for and a fourth was carried in from Phase 107a. All four were built.

### 10.1 Where a 292 MB table lives at runtime — the numbers, not the argument

The choice was costed by **running it**, not by reasoning about it:
`caprebate-postcode-store-costing.cjs`, on synthetic data at the real shape and scale
(2,657,599 postcodes, 352 authorities). **Re-run it rather than quoting this table.**

| | (a) JSON in memory | (b) SQLite, read-only | (c) trimmed to England and Wales |
|---|---|---|---|
| File on disk | 290.3 MB | **74.5 MB** | 267.1 MB |
| Held in the heap | 310.4 MB | — | 296.8 MB |
| Process resident set | 630.9 MB | **~11 MB above baseline** | 618 MB |
| One lookup | 0.51 µs | 7.55 µs | 0.51 µs |
| Rows kept | all | all | 2,444,991 of 2,657,599 |

**Three things in that table are worth saying out loud.**

**The phase prompt costed option (a) at "~292 MB resident per process". That is the FILE size.**
The process actually sits at about **630 MB**, and the ingest that builds the file needed
`--max-old-space-size=10240`. On a small server, (a) is not "the simplest option" — it is the
option that decides how much memory the whole application is given, per process, forever.

**Option (b) is fifteen times slower per lookup and the number is still 7.55 microseconds.**
This system does one postcode lookup per assessment, behind a form submission. Twenty-eight times
less memory for a cost nothing here can perceive.

**Option (c) does not work, and the measurement is why.** Dropping Scotland removes 8% of the rows
and **4% of the heap**. It leaves option (a) at 297 MB against option (b)'s 11 MB. Trimming is not
a storage strategy; it is a rounding error on one.

**RECOMMENDED AND BUILT: (b), as a SEPARATE read-only file, not a table in the application
database.** The back end already runs `node:sqlite`, so putting it there is nearly free — and
wrong. This is public reference data rebuilt in full every quarter from a free download. Inside
the application database, every backup and restore carries 75 MB nobody would miss, and a
quarterly refresh becomes a migration against live client records instead of a file swap.

**Both adapters ship, behind `PostcodeStore`** in `caprebate-postcode-store.ts`. The in-memory one
is still right for a fixture, for a per-area extract and for all 38 of this module's own
assertions. K3 asserts the resolver behaves **identically over either adapter, including how it
fails** — which is the acceptance test for the port.

### 10.2 And the part of option (c) that was kept anyway

Trimming was rejected as storage. The **correctness** point inside it was not: a Scottish postcode
must refuse as **outside the served jurisdiction**, not as "not in table", because those two
sentences send the reader to two different places.

So the refusal lives in `caprebate-location-key.ts` and the data is left whole. **The served set is
passed in, from `CB_JURIS.SERVED`, and is not restated anywhere.** Trimming would have made our
coverage a property of a data file: flipping `SERVED` to include Scotland — one boolean, Lakhbir's
to flip — would then have silently required a re-ingest, and until somebody ran one every Scottish
client would have been refused by a table that no longer meant to refuse them.

The message a Scottish client's postcode produces says, in terms, that the postcode resolved
perfectly, that this is about our coverage and not their address, and that capital allowances are
a UK-wide tax so their claim is just as real. O2 asserts every one of those clauses.

### 10.3 Wired to LEG-E4, and LEG-E4 is still off

`leg_e4_location_and_contract_size` **ships false and stays false.** N1 asserts it, and asserts
that `CB_LOCATION_FACTORS` is still empty, so even a gate flipped by hand could not produce a
figure from a price book nobody has bought.

**The chain still stops at the purchase**, with `E_LOCATION_KEY_TABLE_NOT_LOADED` and the message
that names which half is solved. That refusal was already built and tested and **is called, not
re-implemented**.

**The one thing a wiring change could break, and what stops it.** With the gate off, LEG-E4 returns
1.0 with `applied: false`. With the gate on and no key it must refuse. A wiring layer is exactly
where those two get confused — catch the resolver's refusal, hand the cost model no key, and a
gate-on run quietly produces the gate-off answer: a 1.0 nobody chose, in a claim.

So the wiring **never decides which of the two it is in**. It asks the cost model's own `gateOn`
(exported by Phase 110 for this, so the `opts.gates` override every test uses is honoured), and:

- **gate off** → it returns `locationAndContractSizeFactor`'s own object, produced by that
  function, unmodified, and resolves no postcode at all;
- **gate on** → it resolves, and **every** failure is rethrown. There is no `try` anywhere below.

**Proved by breaking it.** Three mutations were introduced deliberately and each was caught:
wrapping the resolution in a `try` that falls back — **3 failures**; disabling the jurisdiction
check — **1**; making an expired table serve instead of refuse — **1**. Restored to 23/0.

### 10.4 What a stale table does — decided and built

`tableIsStale()` had existed since 8 September and **nothing read it**. A staleness report nobody
consumes is a comment with a return type.

The policy is **serve with a flag, then refuse**, and it has two thresholds because two different
things go wrong as the table ages and only one is dangerous:

- **new postcodes are missing** — already refused, loudly and correctly. Age makes it more common,
  not wrong. Nothing needed to change.
- **a reorganised council resolves to its old name** — silent, and into a surveyor's report.
  Reorganisations take effect on 1 April.

| Age | Behaviour |
|---|---|
| under 120 days | normal |
| 120 days – 1 year | **answers, carrying `ONS_TABLE_STALE`** in the same `flags` array the terminated-postcode flag uses, so it travels with the answer exactly as the attribution does |
| over 1 year | **refuses** — a table this old has been through an April |

**Never-ingested is not stale** and uses a different message, because it is a different job for a
different person.

**And the duty is written down.** `00-START-HERE/Caprebate-ONS-Postcode-Table-Refresh-Procedure-v1.md`:
who, when, the exact command, the two column-name lines that must be read on every refresh, what
happens if nobody does it, and a log. A quarterly duty that lives only in a code comment is a duty
nobody performs.

### 10.5 The region — Phase 107a's job 3, and it needed no purchase

Board item 13004035199. A surveyor rate library entry is keyed on
`surveyor :: field :: sector :: region`, and every entry was keyed on the constant
`REGION_NOT_CAPTURED`, so a surveyor's own figures were proposed back to them **across the whole
country**.

`caprebate-region.ts` maps the council area to one of the **thirteen regions Spon's Architects' and
Builders' 2024 uses** — the vocabulary this project already had, rather than a third one.

**NOT ONE PRICE-BOOK FIGURE IS IN IT, and R1 asserts that mechanically** rather than leaving it to
inspection: a decimal appearing anywhere in the region vocabulary fails the test. The thirteen
*factors* are quarantined data belonging to LEG-E4 and to a purchase nobody has made.

**THE FINDING: this was never blocked on the price book.** Phase 107a deferred it here on the
understanding that a region needed the book. It does not. The book supplies the **factors**; the
region **membership** is ONS geography, published under the Open Government Licence, and NSPL
carries it on every postcode row. This is the same mistake the resolver itself found about
LEG-E4 — an item recorded as blocked on a purchase that was never what stood in the way.

**Eleven of the thirteen map with no judgement at all.** The other two are Inner and Outer London,
which the book prices differently — 1.05 against 1.00, a 5% difference on a whole cost plan —
without saying which boroughs are which, and there are two published definitions of Inner London
in ordinary use. **A London council refuses**, and the question is with the surveyor. Unknown is
not a branch, and Outer London is the cheaper of the two, so a default would have looked exactly
like an answer and would have been the answer that suits us.

**Updated 16 September 2026 by Phase 132e — the ONS list is built, and switched off.** Someone typed
an answer into the surveyor's box choosing the Office for National Statistics list of fourteen:
the City of London, Camden, Hackney, Hammersmith and Fulham, Haringey, Islington, Kensington and
Chelsea, Lambeth, Lewisham, Newham, Southwark, Tower Hamlets, Wandsworth and Westminster. **Nobody
signed it, so it is an unsigned draft and not the surveyor's answer.** The list was checked at ONS
that day against two of its lookups (Inner and Outer London, December 2022; and the council to
International Territorial Levels lookup, April 2025), which agree. It sits in `caprebate-region.ts`
behind `SURVEYOR_INNER_LONDON_ONS_FOURTEEN`, which is **off**: a London council still refuses
exactly as before, and the tests compare every field of the refusal with the pre-change module's.
Switched on, those fourteen are Inner London and the other nineteen are Outer London; a council
code that is missing, "not sure" or not one of the 33 refuses rather than falling to Outer London.
**Why the choice matters:** the London Government Act 1963 list counts Greenwich as Inner London
and Haringey and Newham as Outer — the earlier sentence here said only that ONS "adds" two, which
was half of it. **No figure moves either way**, because no regional cost factor is loaded.

**On the screen, the constant is still what a surveyor sees today** — the table is a deployment
artefact and nobody has built one. What changed is that the page now says **which** of the four
things is missing rather than printing `region-not-captured` and leaving them to guess.

### 10.6 Two defects found on the way, and the current command

**The ingest runner crashed on its own usage message.** It printed `NSPL_COLUMNS_ASSUMED` without
importing it, so running it with no arguments died with a `ReferenceError` instead of telling the
operator what to do. Fixed.

**`--out` had a default.** A run that wanted only the SQLite file also wrote 290 MB of JSON nobody
asked for. It is now required to name at least one output.

**THE CURRENT COMMAND — this supersedes §9 step 3:**

```bash
node --max-old-space-size=10240 --experimental-strip-types \
  caprebate-postcode-authority-ingest.ts \
  --csv NSPL_AUG_2026_UK.csv \
  --names "LAD Local Authority District names and codes UK as at 04_25.csv" \
  --release AUG_2026 --sqlite cb-ons-postcode-authority.sqlite
```

**Read the `lad column` AND `region column` lines it prints.** Both are versioned by release year,
both fall back to a pattern rather than failing, and those two lines are the only place the run
says what it actually read. `region column  NONE FOUND` is **not fatal** — every postcode still
resolves and only the region is lost.

**Proven end to end on 9 September 2026** on a six-row file of the real shape: ingest → SQLite →
resolve → region → LEG-E4 seam. Cardiff resolved to Wales, Manchester to North West, Westminster
refused as the open London question, Edinburgh refused as outside our coverage, Belfast refused on
the licence, a terminated postcode refused as terminated, and the LEG-E4 chain refused at the
purchase link with the gate forced on. **Not the 2.7 million-row file** — that was 8 September, and
this run tested the wiring rather than the data.

### 10.7 What Phase 110 deliberately did not do

**It did not make the site engine consume the cost model.** Suite I's I6–I8 are `xfail`s that go
loudly red the day it does, and that is intended — it means the prepared work has shipped and the
suite must be converted. Wiring the postcode half in is not that day.

**It did not fill either table.** Both still ship empty, still for two different reasons, and the
licence strings still say which is which.

**It did not answer the data protection question.** See §7.
