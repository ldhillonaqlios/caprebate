# Caprebate — Document/Property Match (Specification)

**Board item 12902224596** — "Pipeline defect — no extraction spec verifies an uploaded document relates to the subject property." Phase 3, item 7. Wraps `caprebate-document-pipeline.ts` (12830166311).

## 0. What this document is

Records what was built for the document_property_match check, the seams it touches, the test results, and the gaps the item's comment did not anticipate. Governed by the item comment in full (Monday update 5493226898, posted 26 Aug 2026) — that comment is the specification; this document does not repeat it, only what followed from building it.

## 1. What was built

`phase3/caprebate-document-property-match.ts` — a shared check applied to every `DocType`, not a per-spec addition. Three files touched to wire it in:

| File | Change |
|---|---|
| `caprebate-document-property-match.ts` | **New.** The check itself: `matchProperty`, `propertyReviewTask`, `extractWithPropertyGate`, `stampPropertyMatch`. |
| `caprebate-source-register.ts` | Added optional `Retrieval.property_match?: 'MATCH' \| 'MISMATCH' \| 'NOT_STATED'`. Additive — every existing cell has it `undefined`, which behaves exactly as before. |
| `caprebate-document-pipeline.ts` | Added the same optional field to `ClaimSpec.retrieval`, structurally matching the `Retrieval` change so a claim's marker survives the trip into `record()` unmodified. |
| `caprebate-reconciliation.ts` | `areIndependent()` now refuses independence for either side of a pair where that cell's `retrieval.property_match` is `NOT_STATED` or `MISMATCH`. This is the actual behavioural fix — everything else is plumbing to get the marker to this one function. |

### 1.1 The three outcomes

`matchProperty(doc_id, subject, mentions)` takes the job's subject property (Land Registry title address, UPRN, primary name, known alternative names) and a list of `PropertyMention`s — property identifiers as extracted from the document itself. It is deliberately decoupled from the pipeline's segmentation/model machinery (see §3.1) — it does not care how the mentions were produced, only what they say.

- **Zero mentions → `NOT_STATED`.** Never coalesced into `MATCH`.
- **At least one mention, none matching the subject → `MISMATCH`.**
- **At least one matching mention → `MATCH`.** If the document also names other properties, `portfolio_scoping_risk: true` is set — the sub-problem is flagged, not solved (§4).

### 1.2 Matching logic

`mentionMatchesSubject()` in decreasing order of trust:

1. **UPRN**, where both sides have one — decisive either way, since it is a unique identifier rather than a fuzzy signal.
2. **A known alternative name** (`subject.primary_name` or `subject.alternative_names`, normalised) — decisive on its own, because a site legitimately trades under a name its own postal address will never contain.
3. **Postcode**, where both sides have one — a differing postcode is treated as real evidence of a different building even where address words coincide (two homes on the same road is exactly the scenario this check exists for), unless the name hit above already fired.
4. **Address-line token overlap**, normalised (see below) — used as the fallback when postcode is absent on either side. Requires the mention's own significant tokens to be *fully* covered by the subject's, not merely overlapping, so `"2 Chapel Lane"` does not match `"14 Chapel Lane"` on the strength of sharing "Chapel Lane".

Normalisation expands common abbreviations (`Rd`→`Road`, `St`→`Street`, `Ave`→`Avenue`, `Ln`→`Lane`, `Cl`→`Close`, `Hse`→`House`, etc.), strips punctuation, and excludes a short list of generic words (`Care`, `Home`, `House`, `Lodge`, `Court`, `Manor`, `Group`, `Ltd`) from the token-overlap test, so two different homes sharing only "Care Home" in their names don't manufacture a false match.

### 1.3 GATE consequence (0.95)

Reuses `THRESHOLD_BY_CONSEQUENCE.GATE` from the pipeline module directly (`GATE_THRESHOLD`, exported) rather than a private constant, so the two cannot drift apart. It is applied to the *confidence of the property identification itself*: a `MATCH` whose best matching mention scored below 0.95 sets `low_confidence: true` and gets its own CTA review task (distinct from the `MISMATCH` review task), on the same logic the pipeline already applies to every other GATE-consequence field — a confident wrong number is more dangerous than a flagged one.

### 1.4 Where the check runs

`extractWithPropertyGate()` is the one call site, and it runs the match **before** extraction, not beside it:

- **`MISMATCH`** — the model is never called. No segments are sent, nothing is extracted, so there is no wrong-property content to filter back out downstream. `claims: []`, and the single review task carries every other property the document did name, so a human isn't asked to open the file to find out what went wrong.
- **`MATCH` / `NOT_STATED`** — `extract()` and `toClaims()` run exactly as before; the only change is that every resulting `ClaimSpec.retrieval.property_match` is stamped with the outcome.

This "skip the model on mismatch" behaviour is an implementation choice, not something the item comment mandated — it was the safer and cheaper of the two options (the alternative being: extract anyway, then discard). Flagged in case a future job number needs to see model spend that would happen at extraction even when the claims are discarded — that data would not be produced by this design.

## 2. Test results

### 2.1 `phase3/*.test.ts` (`node --test`)

Before this item: 179 assertions across the phase3 suite (source register, reconciliation, reconciliation-assertion, anchor-quarantine, document-pipeline, surveyor-crm, name-exclusion).

After: **189 pass, 0 fail** — the 10 new assertions in `caprebate-document-property-match.test.ts`, covering the four named scenarios (T1-T4) plus:

- T2b — the corroboration-blocking assertion, run directly through `record()`/`areIndependent()`/`reconcileField()`, including a control case showing a *matched* `CLIENT_DOC` claim still corroborates normally (the fix is scoped to `NOT_STATED`/`MISMATCH`, not to `CLIENT_DOC` generally).
- Generic-word decoy (a document sharing only "Care Home"/"Court" does not falsely match).
- A differing UPRN is decisive even against heavy address-text overlap.
- The low-confidence-MATCH review path (§1.3).
- `stampPropertyMatch` touches only `retrieval.property_match`.

No existing assertion changed behaviour. The `areIndependent()` change is additive-only in effect: every pre-existing fixture has `property_match: undefined`, which is neither `'NOT_STATED'` nor `'MISMATCH'`, so `propertyMatchBlocksCorroboration()` is `false` for all of them and the function falls through to its original logic unchanged.

### 2.2 `caprebate-regression.cjs` (new Suite J)

| | Before | After |
|---|---|---|
| pass | 216 | 227 |
| fail | 0 | 0 |
| xfail | 14 | 14 |

Suite J requires `caprebate-document-property-match.ts`, `caprebate-reconciliation.ts` and `caprebate-source-register.ts` directly (Node 24's `require()` support for `.ts` files under type stripping, confirmed working — the same approach considered and *not* taken for the Phase 9 cost model, which was written as `.cjs` specifically to sidestep it; here it was verified to work first). J1-J4 restate the four named scenarios as `check()` assertions against the live module, and J2b restates the corroboration-blocking assertion. This suite does not duplicate the phase3 unit tests' depth (normalisation edge cases, the control case, the low-confidence path) — those stay in `caprebate-document-property-match.test.ts`, run separately, per the item's own instruction ("Add assertions to caprebate-regression.cjs... matching the conventions of the modules already there" — Suite I's own header states the same division of labour for the cost model).

## 3. Found while building — not anticipated by the item's comment

### 3.1 The segmenter can drop the very text this check needs

`caprebate-document-pipeline.ts`'s `segment()` classifies any *unheaded* leading text as `UNCLASSIFIED`, which is on `NEVER_TO_MODEL` and is dropped before a payload is ever built (`sanitise()`). In real documents, the property address or site name commonly sits in exactly that position — an unheaded title block or letterhead on page 1, not under a heading like "FINDINGS" or "SURVEY RESULTS". As shipped, a naive wiring that tried to extract `PropertyMention`s through the existing `sanitise()`/`callModel()` path, scoped to a `DocSpec`'s `permitted_segments`, would frequently find nothing to extract from — not because the document doesn't state its property, but because the segmenter filed the one paragraph that says so under "unclassified" and refused to send it anywhere.

This is why `matchProperty()` and `extractWithPropertyGate()` take `PropertyMention[]` as a plain input rather than doing their own segmentation and model call. The check itself is segmentation-agnostic and fully tested in isolation. **What is not built here, and needs its own decision:** the upstream step that turns a document's raw pages into `PropertyMention[]` in the first place. It cannot simply reuse a `DocType`'s `permitted_segments` list unmodified, because the property statement is frequently outside all of them under the current heading rules. Options for that follow-on item: (a) always additionally send the first page's unheaded/title-block text to a dedicated property-identification prompt, narrowly scoped and audited the same way `sanitise()` is; or (b) extend `classifyHeading()`/`HEADING_RULES` with a `PROPERTY_HEADER` kind matched positionally (first block of the document) rather than by heading text, and add it to every `DocSpec.permitted_segments`. Both are new surface area on the L1-L4 defence in `caprebate-document-pipeline.ts` and deserve their own review, not a decision folded into this item.

### 3.2 The corroboration fix is symmetric, not one-directional

The comment's example (`"An insurance reinstatement valuation for another property enters as an independent claim... and then either agrees with our model, which is worse, or creates a spurious conflict"`) describes the marked claim acting as the corroborator of something else. `areIndependent()` was changed to block in **both** directions: a `NOT_STATED`/`MISMATCH`-marked cell cannot corroborate another claim, and (symmetrically) another claim cannot be treated as corroborating it either. This is a broader generalisation than the one direction named in the comment, made because the alternative (asymmetric blocking) would need to special-case which side of the pair is "the marked one" inside `cluster()`'s representative-selection logic for no clear benefit, and because the same justification — unverified provenance isn't independent evidence — applies whichever side of the pair it sits on. Flagged as a considered choice, not an oversight, in case it turns out too broad for a scenario not yet in a fixture.

### 3.3 `ClaimSpec` → `Cell` conversion is not built in this codebase yet

`toClaims()` in `caprebate-document-pipeline.ts` produces `ClaimSpec[]`, but nothing in `phase3/` converts a `ClaimSpec` into a `record()` call against a live `SourceRegister` — that conversion lives wherever the actual ingestion service is built (not checked into this repository slice). `ClaimSpec.retrieval` and `Retrieval` (source-register.ts) were kept structurally identical on the new field specifically so that whichever code performs that conversion carries `property_match` through as a pass-through field with no redesign required — but this final leg could not be tested end-to-end here, only the two halves independently (T2 proves the claim carries the marker; T2b proves a hand-built cell carrying the marker blocks corroboration).

## 4. Known limitation — flagged, not solved

Where a document names several properties and the subject is among them (`portfolio_scoping_risk: true`), `MATCH` is the correct outcome for THIS check, but it is not sufficient on its own: the extraction that follows still needs to be scoped to the subject's own section of the document, or a group-wide FRA covering six homes will contribute another home's fire-safety plant to this claim. `matchProperty()` surfaces the risk on every `PropertyMatchResult` (T3); nothing in this item resolves it. The natural next step is section-aware extraction — passing `matched_mentions[0]`'s page/location to the pipeline so segmentation can be scoped to the region around it — but that is real design work belonging to its own item, not a corollary of this one.
