# Caprebate — VOA Bulk Data Import Connector (Specification)

**Board item 12830205481** — "Pull in the government valuation database (waiting on the licence)". Phase 9, item 1.

> **This is prepared and NOT SHIPPED.** No live data has ever been pulled — not one network call, not one test call, not even a format-check request. Every fixture in `caprebate-voa-import.test.ts` is a hand-written literal string. The reference-table stubs this connector produces today are empty and carry `loaded: false`. The container is built; the contents wait for the VOA bulk-data licence to clear.

## 0. What this document is

The specification for `caprebate-voa-import.ts` — the nightly-watcher connector, parser and incremental-update logic for the VOA's published bulk rating/valuation list data. It records the file-format **assumptions** the code is written against, flagged individually for verification once the licence lands, because the format has been *designed to be plausible*, not confirmed against a real file. Do not treat any column name, delimiter or pragma line below as a fact about the real VOA product until it has been checked against an actual licensed file.

Governed by `Build-Prep-Consolidated-Schema.md` §0 (conventions), §0.4 (provenance code `API`), §0.5 (confidence grade). Field ids reuse the `voa_*` whitelist already registered in `phase3/caprebate-source-register.ts` (`SOURCES` → `VOA`, licence `VOA_OPEN`).

## 1. The four list years

VOA business-rates rating lists are periodically revalued; a closed list stays live indefinitely because a capital-allowances claim reasons about the rateable value **in force at the effective date of the works**, which may be years in the past. This connector tracks four coexisting lists:

| List year | Status assumed today (27 Aug 2026) |
|---|---|
| `2010` | Historic — closed to new proposals, retained for effective-date lookups |
| `2017` | Historic — closed to new proposals, retained for effective-date lookups |
| `2023` | Current list |
| `2026` | Next revaluation — placeholder, not yet in force |

**Assumption A-1 (needs verification):** the exact set of live/queryable list years and their VOA-side identifiers (VOA may key lists by a different label than the plain year, e.g. a list "reference" rather than a bare year) is not confirmed. The code treats `VoaListYear` as a closed four-member union (`'2010' | '2017' | '2023' | '2026'`) precisely so that adding, removing or renaming a list year is a deliberate, reviewed code change — not a silent runtime surprise.

**A record is only ever valid within its list year.** `VoaRegister` holds one snapshot per list year and every read/write method takes an explicit `year` parameter; there is no method that operates on "the" data without naming which list. Crossing years is refused with a thrown, coded error:

- Loading an epoch file whose own `#LIST_YEAR` pragma disagrees with the year it is being loaded into → `E_LIST_YEAR_MISMATCH`.
- Applying a change file whose `#LIST_YEAR` pragma disagrees with the target snapshot's year → `E_LIST_YEAR_MISMATCH`.
- Naming a year outside the tracked four → `E_UNKNOWN_LIST_YEAR`.
- `lookupAcrossYears(ba_reference)` — the one function that legitimately looks across all four lists at once — returns a `Map<VoaListYear, VoaBulkRecord>` keyed by year, never a single merged record, so even a BA reference that happens to recur across two lists is reported distinctly per year (tested in T18).

## 2. The documented file format (assumptions, flagged)

**Assumption A-2 (needs verification, the biggest one):** the real VOA bulk-data product is very likely to be a fixed-width or differently-delimited flat file (VOA's historical compiled-list bulk extracts have used other conventions), not the pipe-delimited layout with `#`-pragma preamble lines described below. That layout is this connector's own design choice, made so there is something concrete to parse, test and reason about ahead of the licence — **it must be revalidated against a real sample file before this connector is ever pointed at production data.**

### 2.1 Epoch (full snapshot) file

- Plain UTF-8 text, `\n` or `\r\n` line endings.
- A preamble of one or more `#PRAGMA value` lines, at minimum `#LIST_YEAR <year>` stating which list this file is a full snapshot of.
- Followed by exactly one column-header line, pipe (`|`)-delimited, that must match `VOA_EPOCH_COLUMNS` verbatim:

  ```
  BA_REFERENCE|UARN|DESCRIPTION|ADDRESS_LINE_1|ADDRESS_LINE_2|ADDRESS_LINE_3|ADDRESS_LINE_4|POSTCODE|EFFECTIVE_DATE|RATEABLE_VALUE|SCAT_CODE|COMPOSITE_INDICATOR|LISTING_DATE|TOTAL_AREA_M2
  ```

- One data row per property thereafter, same 14 pipe-delimited columns, no header repeated.

**Assumption A-3:** `BA_REFERENCE` (billing authority reference) is treated as the natural key within a list year. **Needs verification** — the real product may key on UARN (unique address reference number) instead, or require the *pair* of the two. The parser carries both fields through regardless, so re-keying is a contained change if A-3 turns out wrong.

**Assumption A-4:** `RATEABLE_VALUE` is a non-negative whole-pound integer with no thousands separator or currency symbol (matches how real VOA figures are always published — whole pounds, never pence) — low risk, but unverified against the bulk product specifically. `COMPOSITE_INDICATOR` is assumed to be a bare `Y`/`N` flag (composite hereditaments mix domestic and non-domestic use) — **needs verification** of both the flag's meaning here and its literal encoding.

**Assumption A-5:** dates (`EFFECTIVE_DATE`, `LISTING_DATE`) are assumed pre-normalised to ISO-8601 (`YYYY-MM-DD`) by whatever fetches the file. The real VOA product likely uses `DD-MM-YYYY` or similar — this connector deliberately treats a non-ISO date as a quarantinable format error rather than guessing a locale, so the real normalisation step (wherever it lives) is forced to be explicit and visible, not silently absorbed into this parser.

**Assumption A-6 (flagged explicitly in code, `toSchemaCells`):** `TOTAL_AREA_M2` is included as an optional trailing column because phase 3's source register already whitelists `voa_total_area_m2` for source_id `VOA`. **This is very likely wrong or over-optimistic** — the standard VOA compiled-list bulk product is not known to publish floor area; area figures more plausibly come from a separate "summary valuation" / detailed-valuation product, if from VOA at all. Until this is verified, every parsed record is allowed to carry `total_area_m2: null`, and `toSchemaCells` reports the field as `present: false` with a note pointing back to this assumption rather than silently treating absence as zero.

### 2.2 Change (incremental) file

Same preamble-plus-header-plus-rows shape, with two differences:

- The preamble additionally carries `#SEQ <n>` — the file's own position in a strictly increasing, per-list-year sequence of change files. **Assumption A-7 (needs verification):** that VOA change files are numbered at all, and that the numbering is a simple monotonic integer per list year rather than, say, a date-stamped filename convention. If the real product ships dated files instead, the sequence number this code relies on must be derived by whatever fetches the file (e.g. from a manifest), and handed to this connector as if it were `#SEQ`.
- The header line carries one extra leading column, `CHANGE_TYPE`, one of `ADD`, `AMEND`, `DELETE`:

  ```
  CHANGE_TYPE|BA_REFERENCE|UARN|DESCRIPTION|ADDRESS_LINE_1|ADDRESS_LINE_2|ADDRESS_LINE_3|ADDRESS_LINE_4|POSTCODE|EFFECTIVE_DATE|RATEABLE_VALUE|SCAT_CODE|COMPOSITE_INDICATOR|LISTING_DATE|TOTAL_AREA_M2
  ```

  A `DELETE` row only needs `CHANGE_TYPE` and `BA_REFERENCE` populated; the remaining columns must still be present (empty) to keep the column count uniform — a convention of this connector, not a claim about the real file.

**Assumption A-8 (needs verification):** that `ADD` / `AMEND` / `DELETE` are VOA's own change semantics at all, as opposed to (for example) VOA publishing only full re-snapshots, or a different vocabulary (e.g. "insert/update/remove", or list-maintenance codes tied to appeal/proposal events). If VOA's real change vocabulary differs, the mapping onto these three verbs is a contained change in `parseChangeFile`; the ordering and quarantine machinery around it does not need to move.

## 3. Epoch/change merge semantics

1. **An epoch file replaces the whole snapshot** for its list year and resets `last_applied_change_seq` to `0`. Loading a new epoch is how this connector recovers from a corrupted or hopelessly out-of-sequence change chain — treated as "start this list year over", not merged with whatever was there before.
2. **Change files apply strictly in order.** `VoaRegister.applyChange(year, text, retrievedAt)`:
   - Throws `E_EPOCH_NOT_LOADED` if no epoch exists yet for that year — there is nothing to apply a delta on top of.
   - Throws `E_SEQUENCE_GAP` if the file's `#SEQ` is more than one ahead of `last_applied_change_seq` — a missing file in between is refused outright, never silently skipped, because skipping it would leave the snapshot permanently and invisibly wrong.
   - Treats `#SEQ <= last_applied_change_seq` as a no-op (`{ applied: false, reason: 'ALREADY_APPLIED' }`) — this is what makes **re-applying the same change file idempotent**: a nightly run that crashes after fetching but before advancing its own bookkeeping can safely retry the same file next time without double-applying it.
   - Otherwise applies the file's rows to a fresh copy of the record map and advances `last_applied_change_seq` to the new `#SEQ`.
3. **Row-level application is per-row, not per-file.** Within an otherwise-valid, in-sequence change file:
   - `ADD` onto a BA reference that already exists is quarantined (`E_ADD_ALREADY_EXISTS`), not applied and not thrown.
   - `AMEND` of a BA reference with no existing record is quarantined (`E_AMEND_MISSING_RECORD`).
   - `DELETE` of a BA reference with no existing record is quarantined (`E_DELETE_MISSING_RECORD`).
   - Every other row in the same file still applies. One bad row inside a correctly-sequenced file does not block its siblings, and does not cause the file's `#SEQ` to be rejected.
4. **Malformed rows never poison the batch and are never silently dropped.** Every row — in an epoch file or a change file — that fails column-count, required-field, date, numeric or enum validation is recorded in the `quarantined` list with a `code` and a human-readable `reason`, the parse continues, and the caller sees exactly what was rejected and why (`caprebate-voa-import.test.ts` T8, T13, T29).

## 4. The nightly-watcher scheduling surface — pure, and gated

`planNightlyFetch(statuses)` is a pure function: given the current `VoaListStatus` (per list year: is an epoch loaded, what's the last applied change seq, how many records) it returns a plain-data decision — one `VoaFetchPlan` per list year, either `{ kind: 'EPOCH' }` for a list with no baseline yet, or `{ kind: 'CHANGE', next_change_seq }` for a list that already has one. It never fetches, never awaits, has no side effects, and is trivially unit-testable with hand-built `VoaListStatus` literals (T19, T20).

The actual fetch is the one I/O boundary in the module, an injected `VoaFetcher = (plan) => Promise<string>`. The default, `voaFetchNotCleared`, **throws `E_LICENCE_NOT_CLEARED` before doing anything else** — no DNS lookup, no socket open, no filesystem read. This is deliberate and load-bearing: without a hand-supplied replacement fetcher, `runNightlyWatch` is structurally incapable of reaching the network, today, by accident. `runNightlyWatch` also treats a fetch failure on one list year as independent of the others — one blocked list does not stop the remaining three plans from being attempted (T24), and with the default fetcher every one of the four comes back `FETCH_FAILED` / `E_LICENCE_NOT_CLEARED` while the register itself is left completely untouched (T22).

Once the licence clears, wiring this up to a real fetch means supplying a real `VoaFetcher` — a small, reviewable change at the one place network access is allowed to happen. Nothing else in the module needs to change.

## 5. Confidence grade — reasoning, not assertion

Per `Build-Prep-Consolidated-Schema.md` §0.4, everything this connector produces is provenance **`API`** (third-party register, independently verifiable) — it is a mechanical read of a published government dataset, never a client assertion, never a surveyor or CTA judgement.

Per §0.5, the grade for an `API` field is **A** — "deterministic, a register lookup ... fully automated" is §0.5's own worked example, and it is exactly what parsing a published VOA list is. There is no automation boundary here for AI-extraction thresholds (§0.5 grade B) to apply to, because nothing is being read by an extractor from an unstructured document — the bulk file is already structured data. Every `VoaSchemaCell` in `toSchemaCells()` therefore carries `grade: 'A'` unconditionally, matching the `max_grade: 'A'` phase 3 already set for `source_id: 'VOA'` in `caprebate-source-register.ts`.

The one caveat is not a grade problem but a presence problem: `voa_total_area_m2` may simply not exist in the real product (Assumption A-6). Absence is modelled as `present: false`, not as a lower grade and not as a zero — a field the source doesn't publish is a different fact from a field the source publishes as `UNKNOWN`, and neither should be confused with a false `0`.

## 6. Field mapping

| This connector's field | Consolidated-schema field id | Type | Prov | Grade |
|---|---|---|---|---|
| `ba_reference` | `voa_ba_reference` | `ref` | `API` | A |
| `rateable_value` | `voa_summary_valuation` | `currency_gbp` | `API` | A |
| `scat_code` | `voa_scat_code` | `text` (code) | `API` | A |
| `effective_date` | `voa_effective_date` | `date` | `API` | A |
| `total_area_m2` | `voa_total_area_m2` | `area_m2` | `API` | A, if present — see Assumption A-6 |

These five field ids are exactly the `permitted_fields` whitelist phase 3 already registered for `source_id: 'VOA'` under licence `VOA_OPEN`. This connector does not introduce new schema-level field ids; it is the thing that would eventually populate the ones already reserved.

## 7. What is deliberately not built here

- **No network client of any kind.** No `fetch`, no `http`/`https` module import, no file-download logic. The only I/O seam is the injected `VoaFetcher` type, and its shipped default refuses to run.
- **No real reference data.** `emptyReferenceTables()` and `VoaRegister.referenceTable(year)` return `loaded: false` stubs until `loadEpoch` is actually called with real text — which, today, only a hand-written test fixture ever supplies.
- **No attribution/redistribution/staleness wiring into phase 3's `ProvenanceStore`.** `toSchemaCells()` stops at producing `{ field_id, value, prov, grade }` tuples in the right shape to feed into `record()` from `caprebate-source-register.ts`; wiring that call is a follow-on integration step once real data exists to write, not before.
- **No assumption about VOA's actual delivery mechanism** (SFTP, HTTPS bulk download, an API with pagination, a manifest file listing available epochs/changes) — `VoaFetcher` is deliberately shaped as "give me the text for this plan" so that whatever the real mechanism turns out to be sits entirely inside the one function this module refuses to run today.

## 8. Assumptions requiring verification once the licence lands — summary

| # | Assumption | Where |
|---|---|---|
| A-1 | The four list years and their exact identifiers/labels | §1 |
| A-2 | Pipe-delimited text with `#`-pragma preamble, rather than fixed-width or another convention entirely | §2, biggest open item |
| A-3 | `BA_REFERENCE` (not `UARN`, or not both) is the natural key | §2.1 |
| A-4 | `RATEABLE_VALUE` whole-pound integer; `COMPOSITE_INDICATOR` bare `Y`/`N` | §2.1 |
| A-5 | Dates arrive pre-normalised to ISO-8601 | §2.1 |
| A-6 | `TOTAL_AREA_M2` exists in the bulk product at all | §2.1, §5, §6 |
| A-7 | Change files carry a simple monotonic per-list `#SEQ`, not a date-stamped filename scheme | §2.2 |
| A-8 | `ADD` / `AMEND` / `DELETE` are the real change vocabulary | §2.2 |

## 9. Test coverage

`caprebate-voa-import.test.ts`, run with:

```
cd "C:\Users\L.Dhillon\OneDrive - IT Roadway\Desktop\Caprebate\04-phase-work\phase9"
"C:\Users\L.Dhillon\node-portable\node-v24.16.0-win-x64\node.exe" --test caprebate-voa-import.test.ts
```

29 tests, all green, covering: four-list-year isolation and cross-year refusal (T2–T5, T18); clean epoch load (T6–T7); malformed-row quarantine without batch poisoning (T8); in-sequence change application (T9, T12); gap refusal (T10); idempotent re-apply (T11); per-row ADD/AMEND/DELETE quarantine (T13); schema field mapping and the area-absence note (T14–T15); the empty reference-table stub before and after load (T16–T17); the pure nightly-fetch planner (T19–T20); the licence-gated default fetcher (T21–T22); a hand-written mock fetcher driving a full four-list load (T23); fetch-failure isolation across lists (T24); and structural file-format refusals (T25–T28, T29 for an unrecognised change type).
