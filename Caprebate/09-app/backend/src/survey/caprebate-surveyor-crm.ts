/**
 * Caprebate — Surveyor CRM: rate library and adoption metric
 * Board item 12818968809. Phase 3, item 6.
 *
 * When a surveyor overrides one of our pre-filled rates, that override is kept
 * and becomes part of that surveyor's own rate library, offered back to them on
 * later jobs. And we track the adoption rate per field — how often our pre-fill
 * survives untouched.
 *
 * THE POINT OF THE ADOPTION RATE. It is the only honest evidence we will ever
 * have about whether our estimates are any good. Nobody grades our pre-fills;
 * a chartered surveyor either leaves them alone or does not, on real jobs, with
 * their own signature at the end of it. That is a revealed preference, and it
 * is worth more than any amount of internal review.
 *
 * WHICH IS WHY IT MUST BE MEASURED HONESTLY. Two disciplines do most of the work:
 *
 *   1. STRATIFY BY WHAT WAS SHOWN. If we pre-fill from the surveyor's OWN
 *      library and they accept it, that is not evidence our estimate is good —
 *      it is evidence they agree with themselves. Only PLATFORM_DEFAULT
 *      pre-fills count toward calibration.
 *
 *   2. DIRECTION BEATS MAGNITUDE. Overrides scattered symmetrically around zero
 *      mean our central estimate is right and our precision is poor. Overrides
 *      that all go one way mean we are biased, which is a different and more
 *      fixable problem. Report both.
 *
 * Feeds the blocked calibration item 12830166861.
 */

/* ------------------------------------------------------------------ *
 * 1. Fields and context
 * ------------------------------------------------------------------ */

export type Sector = 'CARE_HOMES' | 'DENTAL' | 'SUPPORTED_LIVING' | 'GP_PRIMARY_CARE' | 'PRIVATE_HOSPITALS';

export type Context = { sector: Sector; region: string };

export type RateField = {
  field_id: string;
  unit: string;
  /**
   * Below this relative change an override is an ADJUSTMENT; at or above it,
   * a REPLACEMENT. The split matters because "nudged by 2%" and "halved" are
   * different pieces of evidence about the same pre-fill.
   */
  materiality: number;
  /** Above materiality, a reason is required. Below, it is not — see §4. */
  consequence: 'APPORTIONMENT' | 'TAXONOMY';
};

export const RATE_FIELDS: readonly RateField[] = [
  { field_id: 'qualifying_pct_sanitary', unit: '%', materiality: 0.10, consequence: 'APPORTIONMENT' },
  { field_id: 'qualifying_pct_electrical', unit: '%', materiality: 0.10, consequence: 'APPORTIONMENT' },
  { field_id: 'qualifying_pct_floor_finishes', unit: '%', materiality: 0.10, consequence: 'APPORTIONMENT' },
  { field_id: 'qualifying_pct_internal_doors', unit: '%', materiality: 0.10, consequence: 'APPORTIONMENT' },
  { field_id: 'qualifying_pct_external_windows', unit: '%', materiality: 0.10, consequence: 'APPORTIONMENT' },
  { field_id: 'prelims_pct', unit: '%', materiality: 0.05, consequence: 'APPORTIONMENT' },
  { field_id: 'professional_fees_pct', unit: '%', materiality: 0.05, consequence: 'APPORTIONMENT' },
  { field_id: 'bcis_rate_substructure', unit: 'GBP/m2', materiality: 0.10, consequence: 'APPORTIONMENT' },
  { field_id: 'bcis_rate_services', unit: 'GBP/m2', materiality: 0.10, consequence: 'APPORTIONMENT' },
  { field_id: 'land_value_pct_of_base', unit: '%', materiality: 0.10, consequence: 'APPORTIONMENT' },
];

export function fieldSpec(field_id: string): RateField {
  const f = RATE_FIELDS.find((x) => x.field_id === field_id);
  if (!f) throw new CrmError('E_UNKNOWN_FIELD', `'${field_id}' is not a tracked rate field`);
  return f;
}

export class CrmError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(`[${code}] ${message}`);
    this.name = 'CrmError';
    this.code = code;
  }
}

/* ------------------------------------------------------------------ *
 * 2. Pre-fill origin — the stratification that makes the metric honest
 * ------------------------------------------------------------------ */

export type PrefillOrigin =
  /** Our number. The ONLY origin that tells us anything about our estimates. */
  | 'PLATFORM_DEFAULT'
  /** This surveyor's own earlier override. Accepting it is self-consistency, not endorsement. */
  | 'SURVEYOR_LIBRARY'
  /** A sector aggregate. Informative, but not our estimate either. */
  | 'SECTOR_BENCHMARK'
  /** Carried from an earlier job on the same property. */
  | 'PRIOR_JOB_SAME_PROPERTY'
  /**
   * NOTHING WAS PROPOSED. The surveyor was shown an empty box and typed their
   * own figure into it. Added Phase 107a, 9 September 2026.
   *
   * ───────────────────────────────────────────────────────────────────────
   * WHY THE OTHER FOUR COULD NOT COVER THIS, AND HOW IT WAS FOUND
   *
   * Every one of the four above is a thing WE PUT IN FRONT OF THE SURVEYOR.
   * The type had no way to say that we put nothing there — and until a
   * workspace existed, nothing ever did.
   *
   * Phase 107 built the workspace and hit it immediately. Caprebate holds no
   * platform default rates at all: the only price books on the disk are
   * quarantined pending an explanation of their provenance, so a surveyor's
   * FIRST figure for a field in a sector is always entered against a blank.
   * The only origin that could be recorded was PLATFORM_DEFAULT, which is
   * FALSE — and, being false, it was also UNTOUCHED (the prefilled and final
   * values are the same number, because they are both the surveyor's), which
   * `RateLibrary.learn` correctly refuses. THE CONSEQUENCE WAS THAT THE
   * LIBRARY COULD NEVER ACQUIRE A FIRST ENTRY, so no surveyor's figures were
   * ever proposed back to them.
   *
   * ───────────────────────────────────────────────────────────────────────
   * WHAT EVERY METRIC DOES WITH IT — worked out before it was added, because
   * an origin no metric knows about is worse than no origin at all.
   *
   *   adoption()        EXCLUDES it, and counts it separately at
   *                     `excluded_nothing_proposed`. There was no number of
   *                     ours to adopt or reject, so it is evidence about our
   *                     estimates in neither direction. It is NOT merged into
   *                     `excluded_not_platform_default`, because "they used
   *                     their own library figure" and "we offered nothing"
   *                     are different facts about the capture flow.
   *   selfConsistency() EXCLUDES it. It counts acceptance of the surveyor's
   *                     OWN library figure; accepting nothing is not that.
   *   drift()           EXCLUDES it. Drift is measured on PLATFORM_DEFAULT
   *                     pre-fills only, and this is definitionally not one.
   *   divergences()     EXCLUDES it, for the same reason.
   *   controlComparison() EXCLUDES it — the blank-field control's whole point
   *                     is to compare a pre-filled arm against a blank one,
   *                     and a NOTHING_PROPOSED event is already blank.
   *
   * ALL FIVE EXCLUDE IT BY CONSTRUCTION rather than by a new clause: each
   * already filters POSITIVELY on `CALIBRATION_ORIGIN` or `SURVEYOR_LIBRARY`.
   * That is why this addition is safe, and it is the reason the value was
   * chosen to sit outside both rather than to shadow either.
   *
   * ───────────────────────────────────────────────────────────────────────
   * ITS OUTCOME IS `UNTOUCHED`, AND THAT WORD IS MISLEADING ON ITS OWN.
   *
   * `classifyOutcome` compares prefilled against final, and on one of these
   * they are the same number, so it returns UNTOUCHED. Nothing was touched
   * because nothing was there. READ THE OUTCOME ONLY TOGETHER WITH THE
   * ORIGIN: no metric reads the outcome of a NOTHING_PROPOSED event, because
   * all five exclude it first, so nothing downstream is misled — but a person
   * reading a row in the table would be.
   */
  | 'NOTHING_PROPOSED';

/** Only this origin counts toward calibration. Stated once, asserted in tests. */
export const CALIBRATION_ORIGIN: PrefillOrigin = 'PLATFORM_DEFAULT';

/**
 * NOT_REVIEWED added in Phase 52 (calibration instrument, item 12830166861).
 *
 * UNTOUCHED and NOT_REVIEWED look identical in the data — in both cases the
 * final value equals the pre-filled value — and they mean opposite things. One
 * is a surveyor who looked at our number and agreed with it; the other is a
 * surveyor who never looked. Pooled together, a high adoption rate could mean
 * the pre-fills are good OR that nobody is checking them, which are opposite
 * conclusions from the same number.
 *
 * The distinction cannot be inferred after the fact. It has to come from a
 * positive confirmation step in the surveyor's own flow, which is why
 * RecordInput carries `reviewed` rather than this being derived here.
 *
 * `reviewed` defaults to true, so every existing call site and every event
 * already recorded keeps its current meaning. That default is a compatibility
 * choice, not a claim: until the confirmation step exists in the UI, `true`
 * means "we did not ask", and adoptionStats.not_reviewed will read 0 because
 * nothing is yet able to set it.
 */
export type Outcome = 'UNTOUCHED' | 'ADJUSTED' | 'REPLACED' | 'NOT_REVIEWED';

export type PrefillEvent = {
  job_id: string;
  surveyor_id: string;
  field_id: string;
  context: Context;
  prefilled_value: number;
  prefill_origin: PrefillOrigin;
  /** What the surveyor left in place. Equal to prefilled_value where untouched. */
  final_value: number;
  outcome: Outcome;
  /** (final - prefilled) / prefilled. Signed: the direction is the calibration signal. */
  relative_delta: number;
  reason: string | null;
  at: string;
  /**
   * The anchor-quarantine verdict for this job (item 12830183464). An EXPOSED
   * job's overrides are contaminated — the surveyor had seen our estimate before
   * committing — and are excluded from calibration.
   */
  anchor_verdict: 'CLEAN' | 'EXPOSED' | 'INCOMPLETE' | 'CHAIN_BROKEN';
};

export type RecordInput = {
  job_id: string;
  surveyor_id: string;
  field_id: string;
  context: Context;
  prefilled_value: number;
  prefill_origin: PrefillOrigin;
  final_value: number;
  reason?: string;
  at: string;
  anchor_verdict: PrefillEvent['anchor_verdict'];
  /**
   * Did the surveyor positively confirm they looked at this field? Defaults to
   * true so existing call sites are unchanged. Set false where the flow can
   * tell that the field was never opened — see the Outcome doc comment.
   */
  reviewed?: boolean;
};

export function classifyOutcome(spec: RateField, prefilled: number, final: number): { outcome: Outcome; relative_delta: number } {
  if (prefilled === final) return { outcome: 'UNTOUCHED', relative_delta: 0 };
  if (prefilled === 0) throw new CrmError('E_ZERO_PREFILL', `cannot express a change from zero as a relative delta on '${spec.field_id}'`);
  const rel = (final - prefilled) / Math.abs(prefilled);
  return { outcome: Math.abs(rel) >= spec.materiality ? 'REPLACED' : 'ADJUSTED', relative_delta: rel };
}

/* ------------------------------------------------------------------ *
 * 3. The rate library
 * ------------------------------------------------------------------ */

export type LibraryEntry = {
  surveyor_id: string;
  field_id: string;
  context: Context;
  value: number;
  /** How many times this surveyor has landed on this figure in this context. */
  observations: number;
  first_set_at: string;
  last_confirmed_at: string;
  source_jobs: string[];
};

export type Proposal = {
  field_id: string;
  value: number;
  origin: PrefillOrigin;
  /**
   * Shown to the surveyor verbatim. A pre-fill whose origin is hidden is the
   * anchoring problem from 12830183464 in miniature: they should always know
   * whether they are looking at our number or their own.
   */
  label: string;
  observations: number;
  age_days: number | null;
};

const key = (s: string, f: string, c: Context) => `${s}::${f}::${c.sector}::${c.region}`;

export class RateLibrary {
  #entries = new Map<string, LibraryEntry>();

  /**
   * An override becomes a library entry. Repeating the same figure strengthens it.
   *
   * TWO ORIGINS MAY BE LEARNED FROM AN UNTOUCHED EVENT, AND THE DIFFERENCE
   * BETWEEN THEM IS THE WHOLE GUARD.
   *
   *   SURVEYOR_LIBRARY  — they were shown their own earlier figure and left it.
   *                       Already theirs; re-confirming strengthens it.
   *   NOTHING_PROPOSED  — they were shown an EMPTY BOX and typed a figure.
   *                       Entirely theirs; there was nothing of ours to accept.
   *
   * Everything else that comes back UNTOUCHED is a number of OURS that the
   * surveyor left alone, and learning it would launder a platform default into
   * a surveyor library entry and quietly destroy the stratification in §5.
   */
  learn(e: PrefillEvent): LibraryEntry {
    const theirOwn = e.prefill_origin === 'SURVEYOR_LIBRARY' || e.prefill_origin === 'NOTHING_PROPOSED';
    if (e.outcome === 'UNTOUCHED' && !theirOwn) {
      throw new CrmError('E_NOT_AN_OVERRIDE', `job ${e.job_id}: an untouched platform default is not a surveyor's own figure`);
    }
    const k = key(e.surveyor_id, e.field_id, e.context);
    const prev = this.#entries.get(k);
    const same = prev && prev.value === e.final_value;
    const entry: LibraryEntry = {
      surveyor_id: e.surveyor_id,
      field_id: e.field_id,
      context: e.context,
      value: e.final_value,
      observations: same ? prev!.observations + 1 : 1,
      first_set_at: same ? prev!.first_set_at : e.at,
      last_confirmed_at: e.at,
      source_jobs: same ? [...prev!.source_jobs, e.job_id] : [e.job_id],
    };
    this.#entries.set(k, entry);
    return entry;
  }

  get(surveyor_id: string, field_id: string, c: Context): LibraryEntry | null {
    return this.#entries.get(key(surveyor_id, field_id, c)) ?? null;
  }

  forSurveyor(surveyor_id: string): readonly LibraryEntry[] {
    return [...this.#entries.values()].filter((e) => e.surveyor_id === surveyor_id);
  }
}

export type PlatformDefaults = (field_id: string, c: Context) => number | null;

/**
 * What to pre-fill on the next job.
 *
 * A library entry is offered after ONE observation, not after N. Waiting for
 * repetition withholds the surveyor's own considered figure from them for no
 * benefit — but the label always says how many observations it rests on and how
 * old it is, so a single stale data point is visible as exactly that. Ageing
 * entries are still offered, with their age stated: suppressing them loses the
 * value, and hiding the age would be dishonest.
 */
export function propose(
  lib: RateLibrary,
  defaults: PlatformDefaults,
  surveyor_id: string,
  field_id: string,
  c: Context,
  now: string,
): Proposal | null {
  const own = lib.get(surveyor_id, field_id, c);
  if (own) {
    const age = Math.floor((Date.parse(now) - Date.parse(own.last_confirmed_at)) / 86_400_000);
    return {
      field_id,
      value: own.value,
      origin: 'SURVEYOR_LIBRARY',
      label:
        `Your figure for ${field_id} in ${c.sector} / ${c.region}: ${own.value}. ` +
        `${own.observations} observation${own.observations === 1 ? '' : 's'}, last confirmed ` +
        `${age === 0 ? 'today' : `${age} day${age === 1 ? '' : 's'} ago`} (job ${own.source_jobs[own.source_jobs.length - 1]}).`,
      observations: own.observations,
      age_days: age,
    };
  }
  const d = defaults(field_id, c);
  if (d === null) return null;
  return {
    field_id,
    value: d,
    origin: 'PLATFORM_DEFAULT',
    label: `Caprebate default for ${field_id} in ${c.sector}: ${d}. Not your figure — override freely.`,
    observations: 0,
    age_days: null,
  };
}

/* ------------------------------------------------------------------ *
 * 4. Recording — and when a reason is required
 *
 * A mandatory note on every 1% nudge trains people to type "n/a", which
 * destroys the data the note exists to capture. So: required at or above
 * materiality, optional below. Same argument as the capture-list flooding
 * problem in 12830181808 §4.
 * ------------------------------------------------------------------ */

export class OverrideStore {
  #events: PrefillEvent[] = [];

  record(input: RecordInput): PrefillEvent {
    const spec = fieldSpec(input.field_id);
    for (const [k, v] of [['prefilled_value', input.prefilled_value], ['final_value', input.final_value]] as const) {
      if (typeof v !== 'number' || !Number.isFinite(v)) throw new CrmError('E_BAD_VALUE', `${k} is not a finite number`);
    }
    const classified = classifyOutcome(spec, input.prefilled_value, input.final_value);
    const relative_delta = classified.relative_delta;
    /* A field that was never opened cannot have been changed. If a caller says
       both "not reviewed" and "the value moved", that is a contradiction in the
       capture flow, not something to silently resolve one way. */
    if (input.reviewed === false && classified.outcome !== 'UNTOUCHED') {
      throw new CrmError(
        'E_UNREVIEWED_BUT_CHANGED',
        `'${input.field_id}' is marked not reviewed but the value moved by ` +
          `${(relative_delta * 100).toFixed(1)}%. A field nobody opened cannot have been edited`,
      );
    }
    const outcome: Outcome = input.reviewed === false ? 'NOT_REVIEWED' : classified.outcome;
    if (outcome === 'REPLACED' && (!input.reason || input.reason.trim().length === 0)) {
      throw new CrmError(
        'E_REASON_REQUIRED',
        `'${input.field_id}' was changed by ${(relative_delta * 100).toFixed(1)}%, at or beyond the ` +
          `${(spec.materiality * 100).toFixed(0)}% materiality threshold. A material override must state why`,
      );
    }
    const e: PrefillEvent = {
      job_id: input.job_id,
      surveyor_id: input.surveyor_id,
      field_id: input.field_id,
      context: input.context,
      prefilled_value: input.prefilled_value,
      prefill_origin: input.prefill_origin,
      final_value: input.final_value,
      outcome,
      relative_delta,
      reason: input.reason?.trim() || null,
      at: input.at,
      anchor_verdict: input.anchor_verdict,
    };
    this.#events.push(e);
    return e;
  }

  events(): readonly PrefillEvent[] {
    return [...this.#events];
  }
}

/* ------------------------------------------------------------------ *
 * 5. The adoption metric
 * ------------------------------------------------------------------ */

/**
 * Below this an adoption rate is not a rate, it is an anecdote.
 *
 * RE-DERIVED against the AD-HOC engagement model (item 12927112944, Phase 10
 * finding: MIN_N_FOR_RATE and selfConsistency() were both set assuming repeat
 * engagements with the same surveyor). Raised from 5 to 7. This constant gates
 * the POOLED, cross-surveyor adoption()/divergences() cohort signal, which was
 * never itself repeat-engagement-dependent — `adoption()` already pools across
 * ALL_SURVEYORS by default. What ad-hoc engagement changes is the composition
 * of that pool: instead of a handful of repeat observations from one surveyor
 * whose personal calibration is already known, each observation now comes from
 * a different, unfamiliar surveyor. That adds a between-surveyor variance
 * component (differing house style, risk appetite, familiarity with a platform
 * seen for the first time) on top of the estimate error the metric exists to
 * measure, so more observations are needed before the pooled median is a
 * trustworthy signal rather than noise from whichever surveyors happened to be
 * in the sample. Still provisional — a reasoned adjustment for a changed
 * assumption, not a value fitted to real ad-hoc data, because none exists yet.
 */
export const MIN_N_FOR_RATE = 7;

/**
 * The minimum number of a SINGLE surveyor's own observations before
 * divergences() will consider flagging them as an outlier against the cohort.
 * Named here (was previously an inline `3` in divergences()) because the
 * ad-hoc engagement model makes it load-bearing in a way it was not before:
 * under repeat engagement a regular surveyor would clear this within one
 * pilot; under ad-hoc, most surveyors will contribute exactly one job each,
 * so divergences() returning nothing most of the time is the EXPECTED
 * behaviour of a correctly-guarded function, not evidence it is broken or
 * that the threshold is wrong. Not raised further: a genuine per-surveyor
 * pattern (as opposed to noise) is exactly what 3 independent, comparable
 * observations from that surveyor is the minimum for — raising it higher
 * would make the ad-hoc case return nothing except from the rare surveyor
 * seen many times, and lowering it below 3 would flag a single stranger's
 * single disagreement as if it were a "pattern".
 */
export const MIN_SURVEYOR_OBS_FOR_DIVERGENCE = 3;

export type Verdict =
  | 'INSUFFICIENT_DATA'
  | 'GOOD'                 // high adoption, no systematic direction
  | 'UNBIASED_IMPRECISE'   // overrides scatter both ways: centre right, spread wide
  | 'BIASED_HIGH'          // surveyors consistently revise our figure DOWN
  | 'BIASED_LOW';          // surveyors consistently revise our figure UP

/**
 * Provisional. These are reasoned starting points, not findings — they cannot
 * be set properly until real jobs exist. Open item O-4.
 *
 * RE-DERIVED against the AD-HOC engagement model (item 12927112944).
 *
 * ADOPTION_GOOD lowered 0.6 -> 0.5. Under repeat engagement, a high adoption
 * rate partly reflects accumulated TRUST — a surveyor who has seen our
 * pre-fills before and found them reliable touches them less over time. Under
 * ad-hoc, every surveyor meets a given pre-fill cold, with no accumulated
 * familiarity to build that trust discount. Ordinary professional due
 * diligence on an unfamiliar platform's figures will produce more touches
 * even where the underlying number is accurate, so holding a population of
 * strangers to the same 60% bar as a panel that has learned to trust the
 * platform conflates unfamiliarity with inaccuracy. 0.5 keeps the bar
 * meaningful (a coin-flip adoption rate is still not "good") without
 * penalising the platform for a trust-building loop that ad-hoc engagement
 * structurally cannot run.
 *
 * BIAS_THRESHOLD widened 0.03 -> 0.05. The same pooling-across-strangers
 * effect that motivated raising MIN_N_FOR_RATE also raises the variance of
 * any individual relative_delta observation, because the deltas now mix
 * genuine estimate error with between-surveyor style differences that a
 * same-surveyor repeat panel would not contribute. A 3% band was already tight
 * against a stable panel; against a heterogeneous, one-off population it would
 * read ordinary cross-sectional noise as BIASED_HIGH/BIASED_LOW more often
 * than the underlying model actually is. 5% trades some sensitivity to a
 * genuinely small bias for a real reduction in false bias calls — a
 * deliberate choice given verdictFor() checks bias BEFORE adoption, so a
 * too-tight threshold here would misclassify an unbiased-but-noisy field as
 * biased before ADOPTION_GOOD is ever consulted.
 */
export const ADOPTION_GOOD = 0.5;
export const BIAS_THRESHOLD = 0.05;

export type AdoptionStats = {
  field_id: string;
  scope: 'ALL_SURVEYORS' | string;
  n: number;
  untouched: number;
  adjusted: number;
  replaced: number;
  /**
   * Pre-fills the surveyor never opened. Counted and reported, never included
   * in n — silence is not agreement (Phase 52, item 12830166861 §4.3).
   */
  not_reviewed: number;
  /**
   * not_reviewed / (n + not_reviewed). Null where nothing was captured at all.
   * A high number here is a warning about the CAPTURE FLOW, not about the
   * estimates: it means most pre-fills are passing through unexamined, and the
   * adoption rate below is being computed on a small self-selected subset.
   */
  unreviewed_rate: number | null;
  /** untouched / n. Null below MIN_N_FOR_RATE. */
  adoption_rate: number | null;
  /** Signed. Negative means surveyors revise our figure downward. Null below MIN_N. */
  median_signed_delta: number | null;
  verdict: Verdict;
  /**
   * Pre-fills that were not OURS — the surveyor's own library figure, a sector
   * benchmark, a figure carried from an earlier job on the same property.
   * DOES NOT INCLUDE the "we proposed nothing" case, which is counted below.
   */
  excluded_not_platform_default: number;
  /**
   * Fields where the surveyor was shown an EMPTY BOX (Phase 107a). Excluded
   * because there was no number of ours to adopt or reject, and counted
   * separately because it measures something quite different from the line
   * above: `excluded_not_platform_default` says the pre-fill came from
   * somewhere else, this says THERE WAS NO PRE-FILL. A high number here means
   * we are not putting our own figures in front of the surveyor at all, which
   * is the state Caprebate is actually in — no licensed price book, so no
   * platform defaults — and it should be visible rather than folded into a
   * count that reads as "they preferred another source".
   */
  excluded_nothing_proposed: number;
  excluded_anchor_exposed: number;
};

function median(xs: readonly number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function verdictFor(n: number, adoption: number, med: number): Verdict {
  if (n < MIN_N_FOR_RATE) return 'INSUFFICIENT_DATA';
  if (Math.abs(med) > BIAS_THRESHOLD) return med < 0 ? 'BIASED_HIGH' : 'BIASED_LOW';
  return adoption >= ADOPTION_GOOD ? 'GOOD' : 'UNBIASED_IMPRECISE';
}

/**
 * Adoption for one field.
 *
 * THREE exclusions, all deliberate and all counted so the exclusion is visible:
 *   - anything not a PLATFORM_DEFAULT pre-fill (it tells us about the surveyor,
 *     not about our estimate);
 *   - anything where NOTHING WAS PROPOSED at all — an empty box the surveyor
 *     filled in themselves. Added Phase 107a and counted on its own line,
 *     because "they used a different source" and "we offered nothing" are
 *     different facts and merging them hides which one we are looking at;
 *   - anything from a job the anchor quarantine did not mark CLEAN (the surveyor
 *     had already seen our estimate, so their figure is contaminated).
 */
export function adoption(
  store: OverrideStore,
  field_id: string,
  opts: { surveyor_id?: string } = {},
): AdoptionStats {
  const all = store.events().filter((e) => e.field_id === field_id && (!opts.surveyor_id || e.surveyor_id === opts.surveyor_id));
  const nothingProposed = all.filter((e) => e.prefill_origin === 'NOTHING_PROPOSED').length;
  const notDefault = all.filter(
    (e) => e.prefill_origin !== CALIBRATION_ORIGIN && e.prefill_origin !== 'NOTHING_PROPOSED',
  ).length;
  const onDefault = all.filter((e) => e.prefill_origin === CALIBRATION_ORIGIN);
  const exposed = onDefault.filter((e) => e.anchor_verdict !== 'CLEAN').length;
  const clean = onDefault.filter((e) => e.anchor_verdict === 'CLEAN');

  /* A pre-fill nobody opened is not evidence either way. It is counted and
     surfaced, and it is kept out of n so it can neither inflate the adoption
     rate nor be mistaken for agreement. */
  const not_reviewed = clean.filter((e) => e.outcome === 'NOT_REVIEWED').length;
  const usable = clean.filter((e) => e.outcome !== 'NOT_REVIEWED');

  const untouched = usable.filter((e) => e.outcome === 'UNTOUCHED').length;
  const adjusted = usable.filter((e) => e.outcome === 'ADJUSTED').length;
  const replaced = usable.filter((e) => e.outcome === 'REPLACED').length;
  const n = usable.length;
  const enough = n >= MIN_N_FOR_RATE;
  const rate = enough ? untouched / n : null;
  const med = enough ? median(usable.map((e) => e.relative_delta)) : null;

  return {
    field_id,
    scope: opts.surveyor_id ?? 'ALL_SURVEYORS',
    n,
    untouched,
    adjusted,
    replaced,
    not_reviewed,
    unreviewed_rate: (n + not_reviewed) > 0 ? not_reviewed / (n + not_reviewed) : null,
    adoption_rate: rate,
    median_signed_delta: med,
    verdict: enough ? verdictFor(n, rate!, med!) : 'INSUFFICIENT_DATA',
    excluded_not_platform_default: notDefault,
    excluded_nothing_proposed: nothingProposed,
    excluded_anchor_exposed: exposed,
  };
}

/**
 * Self-consistency: how often a surveyor accepts THEIR OWN library figure.
 * Reported separately and never mixed into adoption. A high number here says
 * the library is working; it says nothing whatever about our estimates.
 *
 * AD-HOC ENGAGEMENT NOTE (item 12927112944): this function inherently needs
 * repeat jobs from the SAME surveyor_id to ever clear MIN_N_FOR_RATE. Under
 * ad-hoc engagement, most surveyors will be seen once, so this will mostly
 * report `rate: null` — not because the metric is broken, but because
 * self-consistency measures something (a surveyor's consistency with their
 * own past library entries) that ad-hoc engagement structurally has little
 * opportunity to generate. MIN_N_FOR_RATE was NOT lowered to make this
 * function produce numbers sooner: a lower n here would not make a single
 * surveyor's one or two jobs into evidence of anything, it would just relabel
 * noise as a rate. Treat this function's near-permanent silence under ad-hoc
 * engagement as an accepted, documented limitation, not an open item to solve
 * by weakening the threshold.
 */
export function selfConsistency(store: OverrideStore, surveyor_id: string): { n: number; untouched: number; rate: number | null } {
  const es = store.events().filter((e) => e.surveyor_id === surveyor_id && e.prefill_origin === 'SURVEYOR_LIBRARY');
  const untouched = es.filter((e) => e.outcome === 'UNTOUCHED').length;
  return { n: es.length, untouched, rate: es.length >= MIN_N_FOR_RATE ? untouched / es.length : null };
}

/* ------------------------------------------------------------------ *
 * 6. Divergence — a surveyor who disagrees with everyone else
 * ------------------------------------------------------------------ */

export type Divergence = {
  field_id: string;
  surveyor_id: string;
  surveyor_median_delta: number;
  cohort_median_delta: number;
  gap: number;
  /** Not a verdict on the surveyor. They may be right and the cohort wrong. */
  note: string;
};

/**
 * A field with good aggregate adoption but one surveyor always overriding is
 * either that surveyor being wrong, or that surveyor knowing something the
 * others do not. Averaging it away loses the signal either way, so it is
 * surfaced without a judgement attached.
 */
export function divergences(store: OverrideStore, field_id: string, minGap = 0.05): Divergence[] {
  const usable = store.events().filter(
    (e) => e.field_id === field_id && e.prefill_origin === CALIBRATION_ORIGIN && e.anchor_verdict === 'CLEAN',
  );
  if (usable.length < MIN_N_FOR_RATE) return [];
  const cohort = median(usable.map((e) => e.relative_delta));
  const bySurveyor = new Map<string, number[]>();
  for (const e of usable) bySurveyor.set(e.surveyor_id, [...(bySurveyor.get(e.surveyor_id) ?? []), e.relative_delta]);

  const out: Divergence[] = [];
  for (const [sid, deltas] of bySurveyor) {
    if (deltas.length < MIN_SURVEYOR_OBS_FOR_DIVERGENCE) continue;
    const m = median(deltas);
    const gap = m - cohort;
    if (Math.abs(gap) >= minGap) {
      out.push({
        field_id,
        surveyor_id: sid,
        surveyor_median_delta: Math.round(m * 1000) / 1000,
        cohort_median_delta: Math.round(cohort * 1000) / 1000,
        gap: Math.round(gap * 1000) / 1000,
        note:
          `${sid} revises ${field_id} by a median ${(m * 100).toFixed(1)}% against a cohort median of ` +
          `${(cohort * 100).toFixed(1)}%. Worth asking why — they may be right.`,
      });
    }
  }
  return out.sort((a, b) => Math.abs(b.gap) - Math.abs(a.gap));
}

/* ------------------------------------------------------------------ *
 * 7. The calibration feed — what goes to 12830166861
 * ------------------------------------------------------------------ */

export type CalibrationFeed = {
  generated_at: string;
  min_n: number;
  fields: AdoptionStats[];
  /** Fields with enough data to say something. */
  actionable: AdoptionStats[];
  /** Fields still waiting for evidence, named so the gap is visible. */
  awaiting_data: string[];
  method_note: string;
};

export function calibrationFeed(store: OverrideStore, now: string): CalibrationFeed {
  const fields = RATE_FIELDS.map((f) => adoption(store, f.field_id));
  return {
    generated_at: now,
    min_n: MIN_N_FOR_RATE,
    fields,
    actionable: fields.filter((f) => f.verdict !== 'INSUFFICIENT_DATA'),
    awaiting_data: fields.filter((f) => f.verdict === 'INSUFFICIENT_DATA').map((f) => f.field_id),
    method_note:
      'Adoption is computed only on PLATFORM_DEFAULT pre-fills from jobs the anchor quarantine ' +
      '(12830183464) marked CLEAN. Acceptance of a surveyor\'s own library figure is self-consistency ' +
      'and is reported separately. A rate on fewer than ' + MIN_N_FOR_RATE + ' observations is not ' +
      'reported at all. Direction (median signed delta) is the calibration signal; adoption rate alone ' +
      'cannot distinguish a biased estimate from an imprecise one.',
  };
}

/* ------------------------------------------------------------------ *
 * 8. Drift — is the pre-fill getting better, worse, or neither?
 *
 * Added Phase 52 (calibration instrument, item 12830166861).
 *
 * adoption() is a SNAPSHOT. It pools every observation ever recorded and
 * reports one median. That is the right shape for "is this pre-fill any good",
 * and the wrong shape for "is it drifting" — a field whose first ten jobs ran
 * 8% high and whose last ten run 8% low reports a pooled median near zero and
 * looks perfectly calibrated. It is not; it has crossed over, and the pooled
 * figure has hidden exactly the thing that matters.
 *
 * Drift is measured over ORDERED COHORTS, not over calendar time. Under ad-hoc
 * engagement, jobs arrive irregularly — three in a week, then nothing for two
 * months — so a monthly bucket is mostly empty buckets. Fixed-size cohorts of
 * consecutive observations keep every bucket comparable in weight, which is
 * what a comparison between buckets requires.
 * ------------------------------------------------------------------ */

/**
 * Observations per drift cohort. Provisional, and deliberately smaller than
 * MIN_N_FOR_RATE: a cohort is not asked to support a standalone verdict, only
 * to be compared with the cohort before it. Setting it at MIN_N_FOR_RATE would
 * mean no drift reading at all until 14 observations exist on a single field,
 * which on ad-hoc engagement is a long way off.
 */
export const DRIFT_COHORT_SIZE = 4;

/**
 * At least this many complete cohorts before a direction is reported. Two
 * cohorts is a difference; three is the minimum that can distinguish a trend
 * from a single step.
 */
export const MIN_COHORTS_FOR_DRIFT = 3;

/**
 * Change in median signed delta between the first and last cohort, above which
 * the field is called as drifting. Set equal to BIAS_THRESHOLD deliberately:
 * a movement large enough to have flipped the bias verdict is the movement
 * worth naming. Provisional, like every constant in this file — a reasoned
 * starting point, not a value fitted to data that does not exist.
 */
export const DRIFT_THRESHOLD = BIAS_THRESHOLD;

export type DriftCohort = {
  index: number;
  n: number;
  from_at: string;
  to_at: string;
  median_signed_delta: number;
  adoption_rate: number;
};

export type Drift = {
  field_id: string;
  cohorts: DriftCohort[];
  /** Complete cohorts only; a trailing partial cohort is dropped, and counted. */
  discarded_tail: number;
  /** last cohort median minus first cohort median. Null below MIN_COHORTS_FOR_DRIFT. */
  delta_shift: number | null;
  verdict:
    | 'INSUFFICIENT_DATA'
    | 'STABLE'
    /** Our figure is increasingly too high — surveyors revise down more than they used to. */
    | 'DRIFTING_HIGH'
    /** Our figure is increasingly too low. */
    | 'DRIFTING_LOW';
  note: string;
};

/**
 * Drift for one field, over the same usable population adoption() uses:
 * PLATFORM_DEFAULT pre-fills, anchor verdict CLEAN, reviewed.
 *
 * Ordering is by the event's own `at`, not by insertion order, because events
 * can be recorded out of sequence when a job is written up late.
 */
export function drift(store: OverrideStore, field_id: string): Drift {
  const usable = store
    .events()
    .filter(
      (e) =>
        e.field_id === field_id &&
        e.prefill_origin === CALIBRATION_ORIGIN &&
        e.anchor_verdict === 'CLEAN' &&
        e.outcome !== 'NOT_REVIEWED',
    )
    .sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));

  const cohorts: DriftCohort[] = [];
  const full = Math.floor(usable.length / DRIFT_COHORT_SIZE);
  for (let i = 0; i < full; i++) {
    const slice = usable.slice(i * DRIFT_COHORT_SIZE, (i + 1) * DRIFT_COHORT_SIZE);
    cohorts.push({
      index: i,
      n: slice.length,
      from_at: slice[0].at,
      to_at: slice[slice.length - 1].at,
      median_signed_delta: median(slice.map((e) => e.relative_delta)),
      adoption_rate: slice.filter((e) => e.outcome === 'UNTOUCHED').length / slice.length,
    });
  }
  const discarded_tail = usable.length - full * DRIFT_COHORT_SIZE;

  if (cohorts.length < MIN_COHORTS_FOR_DRIFT) {
    return {
      field_id,
      cohorts,
      discarded_tail,
      delta_shift: null,
      verdict: 'INSUFFICIENT_DATA',
      note:
        `${cohorts.length} complete cohort(s) of ${DRIFT_COHORT_SIZE}; ${MIN_COHORTS_FOR_DRIFT} are ` +
        `needed before a direction is reported. Drift is not "no drift" — it is not yet measurable.`,
    };
  }

  const shift = cohorts[cohorts.length - 1].median_signed_delta - cohorts[0].median_signed_delta;
  let verdict: Drift['verdict'] = 'STABLE';
  if (Math.abs(shift) > DRIFT_THRESHOLD) verdict = shift < 0 ? 'DRIFTING_HIGH' : 'DRIFTING_LOW';

  return {
    field_id,
    cohorts,
    discarded_tail,
    delta_shift: Math.round(shift * 1000) / 1000,
    verdict,
    note:
      verdict === 'STABLE'
        ? `Median signed delta moved ${(shift * 100).toFixed(1)}% across ${cohorts.length} cohorts, ` +
          `within the ${(DRIFT_THRESHOLD * 100).toFixed(0)}% threshold.`
        : `Median signed delta moved ${(shift * 100).toFixed(1)}% across ${cohorts.length} cohorts. ` +
          `Surveyors are revising '${field_id}' ${shift < 0 ? 'downward' : 'upward'} more than they ` +
          `were. A pooled adoption figure will understate this — check the cohort series, not the total.`,
  };
}

/* ------------------------------------------------------------------ *
 * 9. The blank-field control
 *
 * Added Phase 52. Specified in the Calibration Research Protocol v1 §7 and
 * named there as the single most valuable line in it: issue one case in N with
 * the field BLANK and no peer figure shown, and compare where those surveyors
 * land against the pre-filled population.
 *
 * WHY IT MUST START AT JOB ONE. A control needs an uncontaminated comparison
 * population. Start it at job twenty and the first nineteen are already
 * anchored and cannot serve as either arm. This is the whole reason it is built
 * now, before any job exists, rather than when there is data to analyse.
 *
 * WHAT IT DETECTS THAT ADOPTION CANNOT. A high adoption rate is consistent with
 * two opposite worlds: our pre-fill is accurate, or our pre-fill is an anchor
 * that surveyors drift toward. adoption() cannot separate them, because both
 * worlds produce the same data. The control can: if unanchored surveyors land
 * somewhere materially different, the adoption rate was measuring the anchor.
 * ------------------------------------------------------------------ */

/** One job in this many is issued with the controlled field blank. Protocol §7. */
export const BLANK_CONTROL_EVERY_N = 10;

/** Protocol §7: "divergence beyond three percentage points retires the pre-fill". */
export const BLANK_CONTROL_DIVERGENCE_PP = 3;

/**
 * PHASE 153e, 4 October 2026 (Word question 149, the surveyor's): the limit for a GBP/m2 field, a TEST DEFAULT built on
 * the answer typed under the question ("For price-per-square-metre figures, use a 10% tolerance as the initial
 * threshold … flagged for review rather than automatically treated as a failure"). Relative to the pre-filled median.
 * Outside it the field is FLAGGED FOR REVIEW, never retired automatically. For the surveyor to confirm.
 */
export const BLANK_CONTROL_RELATIVE_LIMIT_GBP_M2 = 0.10;

/**
 * Deterministic assignment, so the same job is always in the same arm however
 * many times this is evaluated, and so the arm can be reconstructed from the
 * job id alone when the data is audited later. A random draw would be
 * unreconstructable, and an unreconstructable control arm is not a control.
 *
 * FNV-1a over `job_id::field_id` — a job may be a control for one field and
 * not for another, which is what keeps a single job from losing every pre-fill
 * it would otherwise contribute.
 */
export function isBlankControl(job_id: string, field_id: string, everyN = BLANK_CONTROL_EVERY_N): boolean {
  if (!Number.isInteger(everyN) || everyN < 2) {
    throw new CrmError('E_BAD_CONTROL_RATE', `blank-control rate must be an integer of at least 2, got ${everyN}`);
  }
  const s = `${job_id}::${field_id}`;
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h % everyN === 0;
}

/**
 * What a surveyor put in a field that was shown to them EMPTY. Deliberately not
 * a PrefillEvent: there was no pre-fill, so there is no relative_delta and no
 * outcome, and forcing it into that shape would invent a comparison the
 * observation does not contain.
 */
export type ControlObservation = {
  job_id: string;
  surveyor_id: string;
  field_id: string;
  context: Context;
  value: number;
  at: string;
  anchor_verdict: PrefillEvent['anchor_verdict'];
};

export class ControlStore {
  #obs: ControlObservation[] = [];

  record(o: ControlObservation): ControlObservation {
    fieldSpec(o.field_id);
    if (typeof o.value !== 'number' || !Number.isFinite(o.value)) {
      throw new CrmError('E_BAD_VALUE', `control value for '${o.field_id}' is not a finite number`);
    }
    /* A control observation from a job where the surveyor had already seen our
       estimate is not a control observation at all — it is the thing the
       control exists to be free of. */
    if (o.anchor_verdict !== 'CLEAN') {
      throw new CrmError(
        'E_CONTROL_NOT_CLEAN',
        `control observation on '${o.field_id}' comes from a job the anchor quarantine marked ` +
          `${o.anchor_verdict}. An anchored control arm measures nothing`,
      );
    }
    this.#obs.push(o);
    return o;
  }

  observations(): readonly ControlObservation[] {
    return [...this.#obs];
  }
}

export type ControlComparison = {
  field_id: string;
  unit: string;
  control_n: number;
  prefilled_n: number;
  /** Median of what unanchored surveyors put in the empty field. */
  control_median: number | null;
  /** Median of what anchored surveyors left in the pre-filled field. */
  prefilled_median: number | null;
  /** control_median - prefilled_median, in the field's own unit. */
  gap: number | null;
  verdict:
    | 'INSUFFICIENT_DATA'
    /** Unanchored surveyors land where the anchored ones do. The pre-fill is not merely an anchor. */
    | 'PREFILL_SUPPORTED'
    /** They land somewhere else. The adoption rate was measuring the anchor. Retire the pre-fill. */
    | 'RETIRE_PREFILL'
    /** The threshold is expressed in percentage points and this field is not a percentage (no test limit for its unit). */
    | 'THRESHOLD_NOT_DEFINED_FOR_UNIT'
    /** Phase 153e: a GBP/m2 field within the test limit of 10%. */
    | 'WITHIN_TEST_LIMIT'
    /** Phase 153e: a GBP/m2 field more than 10% apart. Flagged for the surveyor's review, not a fail. */
    | 'FLAG_FOR_REVIEW';
  note: string;
};

/**
 * Compare the two arms for one field.
 *
 * THE UNIT PROBLEM, STATED RATHER THAN PAPERED OVER. The protocol's "three
 * percentage points" was written for the land-value field, which is a
 * percentage. Six of the ten tracked fields are percentages and the threshold
 * transfers directly. Two are GBP/m2, where "percentage points" is meaningless
 * and no equivalent threshold has been set by anyone. Rather than invent one —
 * a relative 3%? an absolute £3/m2? they differ by two orders of magnitude —
 * those fields return THRESHOLD_NOT_DEFINED_FOR_UNIT with both medians and the
 * gap still reported, so the comparison is visible and only the pass/fail call
 * is withheld. Open question for the surveyor, recorded on item 12933605005.
 */
export function blankControlComparison(
  store: OverrideStore,
  controls: ControlStore,
  field_id: string,
  minPerArm = MIN_SURVEYOR_OBS_FOR_DIVERGENCE,
): ControlComparison {
  const spec = fieldSpec(field_id);
  const ctl = controls.observations().filter((o) => o.field_id === field_id);
  const pre = store
    .events()
    .filter(
      (e) =>
        e.field_id === field_id &&
        e.prefill_origin === CALIBRATION_ORIGIN &&
        e.anchor_verdict === 'CLEAN' &&
        e.outcome !== 'NOT_REVIEWED',
    );

  const control_median = ctl.length ? median(ctl.map((o) => o.value)) : null;
  const prefilled_median = pre.length ? median(pre.map((e) => e.final_value)) : null;
  const gap = control_median !== null && prefilled_median !== null
    ? Math.round((control_median - prefilled_median) * 1000) / 1000
    : null;

  const base = {
    field_id,
    unit: spec.unit,
    control_n: ctl.length,
    prefilled_n: pre.length,
    control_median,
    prefilled_median,
    gap,
  };

  if (ctl.length < minPerArm || pre.length < minPerArm) {
    return {
      ...base,
      verdict: 'INSUFFICIENT_DATA',
      note:
        `${ctl.length} control and ${pre.length} pre-filled observation(s); ${minPerArm} are needed in ` +
        `each arm. At a 1-in-${BLANK_CONTROL_EVERY_N} control rate this arrives slowly by construction — ` +
        `that is the cost of the control, not a fault in it.`,
    };
  }

  // PHASE 153e: a GBP/m2 field has a test limit now: 10% of the pre-filled median, as a flag, never a retirement.
  if (spec.unit === 'GBP/m2' && prefilled_median !== null && prefilled_median !== 0 && gap !== null) {
    const rel = Math.abs(gap) / Math.abs(prefilled_median);
    const pct = Math.round(rel * 1000) / 10;
    return {
      ...base,
      verdict: rel > BLANK_CONTROL_RELATIVE_LIMIT_GBP_M2 ? 'FLAG_FOR_REVIEW' : 'WITHIN_TEST_LIMIT',
      note: `Gap is ${gap} ${spec.unit}, ${pct}% of the pre-filled median. The test limit is ` +
        `${BLANK_CONTROL_RELATIVE_LIMIT_GBP_M2 * 100}% (a test default, for the surveyor to confirm): ` +
        (rel > BLANK_CONTROL_RELATIVE_LIMIT_GBP_M2 ? 'flagged for review, not a fail.' : 'within it.'),
    };
  }

  if (spec.unit !== '%') {
    return {
      ...base,
      verdict: 'THRESHOLD_NOT_DEFINED_FOR_UNIT',
      note:
        `Gap is ${gap} ${spec.unit}. The protocol's retirement threshold is ` +
        `${BLANK_CONTROL_DIVERGENCE_PP} percentage points, which has no meaning for a ${spec.unit} ` +
        `field. Both medians are reported; the pass/fail call is withheld until a threshold is set ` +
        `for this unit rather than invented here.`,
    };
  }

  const retire = Math.abs(gap!) > BLANK_CONTROL_DIVERGENCE_PP;
  return {
    ...base,
    verdict: retire ? 'RETIRE_PREFILL' : 'PREFILL_SUPPORTED',
    note: retire
      ? `Surveyors shown '${field_id}' blank land a median ${gap} percentage points from those shown ` +
        `our pre-fill, beyond the ${BLANK_CONTROL_DIVERGENCE_PP}pp retirement threshold. The adoption ` +
        `rate on this field has been measuring the anchor, not the estimate. Retire the pre-fill.`
      : `Surveyors shown '${field_id}' blank land a median ${gap} percentage points from those shown ` +
        `our pre-fill, within the ${BLANK_CONTROL_DIVERGENCE_PP}pp threshold. The pre-fill is doing ` +
        `more than anchoring.`,
  };
}

/* ------------------------------------------------------------------ *
 * 10. What is being measured — recorded before the first job, not after
 *
 * The board confirmed (item 12818132946, 28 Aug 2026) that engagements are
 * ad-hoc one-offs with no retained surveyor. That changes what the adoption
 * rate MEANS without changing what it looks like:
 *
 *   WITHIN_SURVEYOR   does this surveyor keep accepting our number as they get
 *                     used to it? Contains an anchoring/familiarity component.
 *   CROSS_SURVEYOR    do independent professionals, each seeing the field for
 *                     the first time, land where we said they would? Stronger
 *                     calibration evidence, because there is less anchoring in
 *                     it — and a worse product, because it removes the returning
 *                     surveyor's own library the CRM was built to offer back.
 *
 * The two produce an identical-looking number and it is NOT recoverable
 * afterwards which one a given figure was. So it is stamped on the feed now.
 * ------------------------------------------------------------------ */

export type CalibrationMode = 'WITHIN_SURVEYOR' | 'CROSS_SURVEYOR';

/** Set to match the ad-hoc engagement model confirmed on 28 August 2026. */
export const CALIBRATION_MODE: CalibrationMode = 'CROSS_SURVEYOR';

/**
 * The whole instrument in one object: what adoption says, whether it is
 * drifting, and whether the control says the adoption figure means anything.
 *
 * Every field will read INSUFFICIENT_DATA until real jobs exist. That is the
 * correct output of a correctly-built instrument with nothing in it, and it is
 * the difference between "we have not measured this" and "we have no way to".
 */
export type CalibrationInstrument = {
  generated_at: string;
  mode: CalibrationMode;
  feed: CalibrationFeed;
  drift: Drift[];
  controls: ControlComparison[];
  /** True until the first usable observation lands on any field. */
  empty: boolean;
  method_note: string;
};

export function calibrationInstrument(
  store: OverrideStore,
  controls: ControlStore,
  now: string,
): CalibrationInstrument {
  const feed = calibrationFeed(store, now);
  return {
    generated_at: now,
    mode: CALIBRATION_MODE,
    feed,
    drift: RATE_FIELDS.map((f) => drift(store, f.field_id)),
    controls: RATE_FIELDS.map((f) => blankControlComparison(store, controls, f.field_id)),
    empty: feed.fields.every((f) => f.n === 0),
    method_note:
      `Calibration mode: ${CALIBRATION_MODE}. Under ad-hoc engagement the adoption rate is a ` +
      `cross-surveyor consensus signal, not a within-surveyor trust signal; the two produce the same ` +
      `number and cannot be told apart afterwards, so the mode is stamped here at generation. ` +
      `Adoption counts only PLATFORM_DEFAULT pre-fills from CLEAN jobs that the surveyor actually ` +
      `opened. Drift is measured over ordered cohorts of ${DRIFT_COHORT_SIZE}, because a pooled ` +
      `median hides a crossover. The blank-field control runs at 1 in ${BLANK_CONTROL_EVERY_N} from ` +
      `job one — it cannot be retrofitted, because a control needs an unanchored comparison arm and ` +
      `every job run before it starts is already anchored.`,
  };
}
