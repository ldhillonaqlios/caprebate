# The Calibration Instrument — v1, built empty

**Monday item:** 12830166861
**Version:** 1.0 · 31 August 2026
**Prepared by:** Claude (Phase 52), Caprebate
**Code:** `phase3/caprebate-surveyor-crm.ts` §8–§10 · tests `caprebate-surveyor-crm.test.ts` D1–D24

---

## 0. What this is, and what it is not

**It is still true that no document can produce calibration data.** The 28 August confirmation on
this item was right: the input is a chartered surveyor's decision to accept or override a pre-fill,
on a real property, on a real job, and nothing substitutes for that.

**What was wrong was the conclusion drawn from it** — that because the *data* cannot be produced,
nothing can be built. The **instrument** can be built, and it has to be built before the first job
rather than after, because three of its parts cannot be retrofitted:

| Part | Why it cannot be added later |
|---|---|
| **The blank-field control** | A control needs an unanchored comparison arm. Every job run before the control starts has already seen a pre-fill and cannot serve as either arm. Start at job 20 and the first 19 are unusable. |
| **Acceptance versus never-looked** | The distinction has to be captured at the moment, from a positive confirmation in the surveyor's flow. It cannot be inferred afterwards from data that records both as "the value did not change". |
| **Which meaning of adoption is being measured** | Within-surveyor trust and cross-surveyor consensus produce an identical-looking number, and afterwards it is not recoverable which one a given figure was. |

So: **this instrument is built, it is empty, and every reading it produces today says
`INSUFFICIENT_DATA`.** That is the correct output of a correctly built instrument with nothing in
it, and it is a different thing from having no instrument at all.

**The item stays blocked on real jobs.** Nothing here changes that. What changes is that the first
engagement fills the instrument rather than designing it.

---

## 1. What was already built, so nobody rebuilds it

`caprebate-surveyor-crm.ts` (item 12818968809, Done) already implements more than the calibration
protocol assumed. Recorded here because the 28 August note read as if only a pipe existed.

| Already built | What it does |
|---|---|
| `PrefillEvent` | One record per pre-filled field per job: the pre-filled value, the final value, the outcome, the signed relative delta, the reason, the origin, and the anchor verdict |
| `classifyOutcome` | Splits an override into `ADJUSTED` (below the field's materiality) and `REPLACED` (at or above it), because "nudged 2%" and "halved" are different evidence about the same pre-fill |
| Reason discipline | A reason is **required** above materiality and **optional** below. A mandatory note on every 1% nudge trains people to type "n/a", which destroys the data |
| Origin stratification | Only `PLATFORM_DEFAULT` pre-fills count toward calibration. Accepting your own library figure is self-consistency, not endorsement |
| Anchor quarantine integration | Events from jobs the quarantine did not mark `CLEAN` are excluded and the exclusion is **counted**, not silently dropped |
| `adoption()` | Per-field: n, untouched / adjusted / replaced, adoption rate, **median signed delta**, and a verdict |
| Verdicts | `GOOD` / `UNBIASED_IMPRECISE` / `BIASED_HIGH` / `BIASED_LOW` / `INSUFFICIENT_DATA`. Adoption rate alone cannot tell a biased estimate from an imprecise one; direction can |
| `divergences()` | A surveyor who disagrees with the cohort, surfaced **without a verdict on them** — they may be right |
| `selfConsistency()` | Reported separately, never mixed into adoption |
| Thresholds | `MIN_N_FOR_RATE = 7`, `ADOPTION_GOOD = 0.5`, `BIAS_THRESHOLD = 0.05`, `MIN_SURVEYOR_OBS_FOR_DIVERGENCE = 3` — all re-derived against the ad-hoc engagement model |

**`MIN_N_FOR_RATE = 7` answers §4.2 of the 28 August note** ("the sample size at which a pre-fill
stops being assessed"), which that note recorded as undecided. It was decided; it is 7; it is
provisional and reasoned rather than fitted, and it is written down.

---

## 2. What this phase added

### 2.1 Acceptance is not silence — `NOT_REVIEWED`

An `UNTOUCHED` pre-fill and a pre-fill nobody opened produce identical data: the final value equals
the pre-filled value. **They mean opposite things.** Pooled together, a 90% adoption rate could mean
the pre-fills are excellent or that nobody is checking them.

```
Outcome = 'UNTOUCHED' | 'ADJUSTED' | 'REPLACED' | 'NOT_REVIEWED'
RecordInput.reviewed?: boolean          // defaults true
```

- `reviewed` defaults to **true**, so every existing call site and every event already recorded
  keeps its current meaning. Until the confirmation step exists in the surveyor's UI, `true` means
  *"we did not ask"*, and `not_reviewed` will read 0 because nothing can yet set it.
- `NOT_REVIEWED` events are **counted and reported but kept out of `n`** — they can neither inflate
  the adoption rate nor be mistaken for agreement.
- `AdoptionStats` gains `not_reviewed` and `unreviewed_rate`. **A high `unreviewed_rate` is a
  warning about the capture flow, not about the estimates** — it means the adoption rate is being
  computed on a small self-selected subset.
- `reviewed: false` **plus a changed value** is refused (`E_UNREVIEWED_BUT_CHANGED`). A field nobody
  opened cannot have been edited; that is a contradiction in the capture flow, not something to
  resolve silently one way.

**What this needs from the product, and it is a real UI change:** a positive confirmation step per
pre-filled field. Not a "reviewed everything" checkbox at the end — that reintroduces exactly the
ambiguity it exists to remove.

### 2.2 Drift — `adoption()` is a snapshot and a snapshot hides a crossover

A field whose first ten jobs ran 8% high and whose last ten run 8% low reports a pooled median near
zero and looks perfectly calibrated. It is not; it has crossed over, and the pooled figure has
hidden the only thing that mattered.

```
drift(store, field_id) -> {
  cohorts: [{ index, n, from_at, to_at, median_signed_delta, adoption_rate }],
  discarded_tail, delta_shift,
  verdict: INSUFFICIENT_DATA | STABLE | DRIFTING_HIGH | DRIFTING_LOW
}
```

- **Ordered cohorts, not calendar buckets.** Under ad-hoc engagement, jobs arrive irregularly — three
  in a week, then nothing for two months — so monthly buckets are mostly empty. Fixed-size cohorts
  of consecutive observations keep every bucket comparable in weight, which is what a comparison
  between buckets requires.
- `DRIFT_COHORT_SIZE = 4`, deliberately **smaller** than `MIN_N_FOR_RATE`: a cohort is not asked to
  support a standalone verdict, only to be compared with the one before it. Setting it at 7 would
  mean no drift reading until 14 observations exist on one field, which on ad-hoc engagement is a
  long way off.
- `MIN_COHORTS_FOR_DRIFT = 3`. Two cohorts is a difference; three is the minimum that can
  distinguish a trend from a single step.
- `DRIFT_THRESHOLD = BIAS_THRESHOLD` (0.05), deliberately equal: a movement large enough to have
  flipped the bias verdict is the movement worth naming.
- Ordered by the event's own `at`, not by insertion order, because jobs get written up late.
- A trailing incomplete cohort is **dropped and the drop is counted** (`discarded_tail`).

### 2.3 The blank-field control

The single most valuable line in the Calibration Research Protocol (§7), and the one that only works
if it starts at job one.

```
BLANK_CONTROL_EVERY_N        = 10       // one job in ten, per field
BLANK_CONTROL_DIVERGENCE_PP  = 3        // protocol §7's retirement threshold
isBlankControl(job_id, field_id)        // deterministic, reconstructable
ControlStore / ControlObservation       // what a surveyor put in an EMPTY field
blankControlComparison(store, controls, field_id)
```

**What it detects that adoption cannot.** A high adoption rate is consistent with two opposite
worlds: our pre-fill is accurate, or our pre-fill is an anchor that surveyors drift toward.
`adoption()` cannot separate them, because both worlds produce the same data. The control can: **if
unanchored surveyors land somewhere materially different, the adoption rate was measuring the
anchor.**

Design decisions worth stating:

- **Deterministic assignment, not random.** FNV-1a over `job_id::field_id`. The same job is always
  in the same arm however often it is evaluated, and the arm can be reconstructed from the job id
  alone when the data is audited later. **An unreconstructable control arm is not a control.**
- **Per field, not per job.** A job can be a control for one field and not another, which stops a
  single job losing every pre-fill it would otherwise contribute.
- **A `ControlObservation` is deliberately not a `PrefillEvent`.** There was no pre-fill, so there is
  no relative delta and no outcome. Forcing it into that shape would invent a comparison the
  observation does not contain.
- **A control observation from an anchored job is refused** (`E_CONTROL_NOT_CLEAN`). An anchored
  control arm measures nothing.

**The unit problem, stated rather than papered over.** The protocol's "three percentage points" was
written for the land-value field, which is a percentage. Six of the ten tracked fields are
percentages and it transfers directly. Two are `GBP/m2`, where "percentage points" is meaningless
and nobody has set an equivalent. Rather than invent one — a relative 3%? an absolute £3/m²? they
differ by two orders of magnitude — those fields return `THRESHOLD_NOT_DEFINED_FOR_UNIT` with both
medians and the gap still reported. **The comparison stays visible; only the pass/fail call is
withheld.** Open question, §5 below.

### 2.4 Which meaning of adoption is being measured — stamped, not inferred

The board confirmed on 28 August that engagements are **ad-hoc one-offs with no retained surveyor**.
That changes what the adoption rate *means* without changing what it *looks like*:

| Mode | The question it answers | Property |
|---|---|---|
| `WITHIN_SURVEYOR` | Does this surveyor keep accepting our number as they get used to it? | Contains an anchoring / familiarity component |
| `CROSS_SURVEYOR` | Do independent professionals, each seeing the field cold, land where we said they would? | **Stronger calibration evidence** (less anchoring in it) and **a worse product** (it removes the returning surveyor's own library the CRM was built to offer back) |

`CALIBRATION_MODE = 'CROSS_SURVEYOR'`, stamped on every generated instrument. **The two produce an
identical number and it is not recoverable afterwards which one a given figure was**, which is why
it is recorded now rather than reasoned about later.

### 2.5 The assembled instrument

```
calibrationInstrument(store, controls, now) -> {
  generated_at, mode,
  feed:     CalibrationFeed          // adoption per field
  drift:    Drift[]                  // per field
  controls: ControlComparison[]      // per field
  empty:    boolean                  // true until the first usable observation
  method_note
}
```

`empty` is deliberately a first-class field. **An instrument over nothing reports `empty: true`, not
"healthy".** And an unreviewed-only store still reads empty — silence is not data (test D24).

---

## 3. The register — what is recorded, per pre-fill

This is the row layout the first engagement fills. Nothing in it is optional.

| Field | Type | Why it is captured |
|---|---|---|
| `job_id` | string | Also the control-arm assignment key |
| `surveyor_id` | string | Divergence and self-consistency; never used to judge a surveyor |
| `field_id` | string | One of the ten tracked rate fields |
| `context.sector` | enum | Density and rates vary by sector; pooling across sectors would hide that |
| `context.region` | string | Location factors are regional |
| `prefilled_value` | number | What we showed them |
| `prefill_origin` | enum | **`PLATFORM_DEFAULT` is the only origin that tells us about our estimates** |
| `final_value` | number | What they left |
| `reviewed` | boolean | **Did they actually open it** — §2.1 |
| `outcome` | enum | Derived: `UNTOUCHED` / `ADJUSTED` / `REPLACED` / `NOT_REVIEWED` |
| `relative_delta` | number | Derived, **signed** — direction is the calibration signal |
| `reason` | string \| null | Required above materiality, optional below |
| `at` | ISO date | Drift cohorts order on this, not on insertion |
| `anchor_verdict` | enum | `CLEAN` / `EXPOSED` / `INCOMPLETE` / `CHAIN_BROKEN` — anything but `CLEAN` is excluded and counted |

**And per blank-field control observation** — a shorter row, because there is less to record when
there was nothing to react to:

| Field | Type |
|---|---|
| `job_id`, `surveyor_id`, `field_id`, `context`, `at` | as above |
| `value` | number — what they put in an empty field |
| `anchor_verdict` | must be `CLEAN`, or the observation is refused |

A CSV header for the register, ready to be exported into:

```csv
job_id,surveyor_id,field_id,sector,region,prefilled_value,prefill_origin,final_value,reviewed,outcome,relative_delta,reason,at,anchor_verdict
```

```csv
job_id,surveyor_id,field_id,sector,region,value,at,anchor_verdict
```

**Both files are empty. That is the deliverable.**

---

## 4. How each reading is defined, once, so it is not re-argued per job

| Reading | Definition | Reported when |
|---|---|---|
| **Adoption rate** | `untouched / n`, where `n` counts only `PLATFORM_DEFAULT` pre-fills from `CLEAN` jobs that were actually reviewed | `n ≥ 7` |
| **Unreviewed rate** | `not_reviewed / (n + not_reviewed)` | whenever anything was captured |
| **Bias** | median **signed** relative delta. Negative = surveyors revise our figure down = **we are running high** | `n ≥ 7`, called at \|median\| > 0.05 |
| **Verdict** | bias is checked **before** adoption: a biased field is called biased even if adoption is high | `n ≥ 7` |
| **Drift** | last cohort median minus first cohort median, over cohorts of 4 | ≥ 3 complete cohorts, called at \|shift\| > 0.05 |
| **Divergence** | one surveyor's median delta against the cohort's, gap ≥ 0.05 | that surveyor has ≥ 3 observations |
| **Self-consistency** | acceptance of the surveyor's **own** library figure. **Never mixed into adoption** | `n ≥ 7` on that surveyor |
| **Control gap** | median of unanchored values minus median of anchored final values | ≥ 3 in each arm |
| **Retirement** | control gap > 3 percentage points → **retire the pre-fill** | percentage fields only |

**What counts as adoption, stated in one sentence:** a chartered surveyor, on a real job, shown *our*
figure on a job where they had not already seen our estimate, opened that field and left it alone.
Anything short of all five of those is not adoption and is not counted as it.

---

## 5. What is still open, and who owns it

| # | Open item | Owner | Note |
|---|---|---|---|
| ~~**O-1**~~ | ~~The positive-confirmation step in the surveyor's flow~~ | ~~Developer + Lakhbir~~ | **CLOSED 9 September 2026, Phase 107.** The capture exists: the surveyor workspace at `/staff/survey/<job>` puts an *"I looked at this field"* box against every one of the ten tracked rate fields, and its answer is written to `surveyor_rate_events.reviewed` through the module's own `OverrideStore.record`. `NOT_REVIEWED` can now fire, and `record` refuses the contradiction — a field marked not reviewed whose value moved. This row said *"the type exists; the capture does not"*, and that has not been true since Phase 107 shipped. |
| **O-2** | Serving the blank-field control in the UI — one job in ten must actually be shown an empty field | Developer + Lakhbir | `isBlankControl()` decides which. Something has to honour it. |
| **O-3** | The retirement threshold for non-percentage fields (`GBP/m2`) | **Surveyor** | Escalated to item 12933605005. We are not inventing one. |
| **O-4** | Every threshold in the file is provisional | Surveyor, after data | `MIN_N_FOR_RATE`, `ADOPTION_GOOD`, `BIAS_THRESHOLD`, `DRIFT_COHORT_SIZE`, `DRIFT_THRESHOLD`. Reasoned, not fitted. |
| **O-5** | Whether the ten tracked rate fields are the right ten | **Surveyor** | They were chosen from the residual model's own parameters. A surveyor may say a different set carries the risk. |
| **O-6** | A signed client, a completed job, and a surveyor forming a view | Lakhbir + time | Unchanged. The instrument does not shorten this. |

**On the owner type.** The 28 August note observed that this item is owner-typed to Claude and that
nothing Claude produces can move it. That was true of the *data* and is still true. It was not true
of the instrument, which is now built. **The remaining work is O-2 alone, and the remaining decisions
(O-3, O-5) are a surveyor's.** Re-typing the item is a call for Lakhbir; flagged rather than changed.

> **Correction, 9 September 2026 (Phase 107a).** The sentence above used to read *"the remaining work
> (O-1, O-2) is a developer's"*. **O-1 was built by Phase 107 and this document did not know**, which
> is the exact shape of staleness this project keeps finding: a register of open items that nobody
> closes when the item is closed. **O-2 — actually serving the blank-field control in the interface,
> one job in ten shown an empty box — is still open and is still a developer's**, and it is now the
> only build task on this list.
>
> **One consequence of Phase 107a worth recording here, because it changes what this instrument
> measures over.** `PrefillOrigin` gained a fifth value, `NOTHING_PROPOSED`, for a field where the
> surveyor was shown an empty box because **Caprebate holds no platform default rates at all**.
> Every metric in the module excludes it — `adoption` now counts it separately at
> `excluded_nothing_proposed` rather than merging it with the other exclusions. **Read that counter
> before reading an adoption rate:** while it is high and `n` is low, this instrument is not
> measuring our estimates, it is recording that we are not making any. That is the true state until
> the price books at item 12804374406 are lawfully held.

---

## 6. Three things that must not happen to this instrument

1. **Do not report an adoption rate below `MIN_N_FOR_RATE`.** A rate on four observations is an
   anecdote with a decimal point. The code returns `null` and the verdict `INSUFFICIENT_DATA`;
   nothing downstream may substitute a figure for it.
2. **Do not start the blank-field control late.** It is the one part of this that genuinely cannot be
   retrofitted, and it is the only part that can tell an accurate pre-fill from a persuasive one.
3. **Do not let a high adoption rate be reported without its `unreviewed_rate`.** The two together
   are informative; the first alone is exactly the ambiguity §2.1 exists to remove.

And the standing one, from **R-B9**: *"a model whose parameters were back-solved from a single case
will reproduce that case whatever the inputs, and will look like corroboration while providing
none."* **The temptation to advance calibration on paper is the same error this item exists to
detect.** Building the instrument is not calibrating; it is making calibration possible to do
honestly when the data arrives.

---

## 7. Tests

`caprebate-surveyor-crm.test.ts` D1–D24, all passing. Suite total 25 → **49**. Phase 3 total
**311 pass / 0 fail**.

| Group | Asserts |
|---|---|
| D1–D5 | Acceptance is not silence: `NOT_REVIEWED` is distinct, `reviewed` defaults true, unreviewed-plus-changed is refused, unreviewed events cannot inflate a rate, and a field nobody opened reports no rate at all |
| D6–D10 | Drift: insufficient data is named rather than read as stability; a stable field is `STABLE`; **a crossover that the pooled median reports as perfectly calibrated is caught by the cohort series**; ordering is by date not insertion; the incomplete tail is dropped and counted |
| D11–D19 | The control: deterministic and reconstructable; per field not per job; roughly 1 in 10; a nonsensical rate is refused; an anchored control observation is refused; a far-landing unanchored arm retires the pre-fill; a close one supports it; a thin arm reports insufficient data; **a non-percentage field reports the gap and withholds the verdict** |
| D20–D24 | The assembled instrument reads `empty`, not healthy; it stamps its mode; it covers every field not a sample; one usable observation ends `empty`; an unreviewed-only store does not |

---

## Sources

`Caprebate-Calibration-Research-Protocol-v1.md` (attached to this item) §3, §4, §5, §7, §8, §10 —
in particular §7's blank-field control and its three-percentage-point retirement threshold.
`phase3/caprebate-surveyor-crm.ts` and its tests (item 12818968809).
`phase3/caprebate-anchor-quarantine.ts` (item 12830183464) — the `CLEAN` verdict this instrument
depends on. Board items 12818992229 (every pre-filled rate carrying its source), 12818132946 (the
ad-hoc engagement decision, 28 August 2026), 12830205481 (the Developer Handoff Pack).
`Caprebate-Engine-Remediation-Register-v2.md` **R-B9**.

**No calibration data exists. No job has been run. No surveyor has seen a pre-fill.** Every reading
this instrument produces today is `INSUFFICIENT_DATA`, and that is what it is supposed to say.
