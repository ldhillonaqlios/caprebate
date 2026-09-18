/**
 * THE SURVEYOR PAYLOAD — non-negotiable N1, enforced HERE and not later.
 *
 * Our estimate must not be in the data a surveyor's session receives. Not
 * hidden. Not greyed out. NOT PRESENT IN THE RESPONSE. A screen that omits a
 * field is presentation; this is the store refusing it.
 *
 * caprebate-anchor-quarantine.ts IS THE RULE and is not re-implemented here.
 * This module does two things and no more:
 *   1. asks the quarantine whether this viewer may open the estimate, and
 *   2. builds the response object WITHOUT the estimate when the answer is no —
 *      by never reading it, rather than by reading and then deleting it.
 *
 * WHY "NEVER READ IT" IS THE DESIGN AND NOT PEDANTRY. A build-then-strip
 * assembler is one forgotten key, one new field, or one `...spread` away from
 * leaking. Building the surveyor's object from the RELEASED list forwards means
 * a new estimate field is absent by default, which is the only direction that
 * fails safe. Phase 107 proves it by inspecting the payload; this makes it true.
 *
 * INPUTS FLOW FREELY. The client's own answers, their documents and the
 * register data are what the survey is FOR — withholding them would degrade
 * the work without protecting anything. What anchors is our NUMBER, and
 * everything our number can be reconstructed from.
 */

import {
  AnchorQuarantine, QuarantineError,
  RELEASED_TO_SURVEYOR_ALWAYS,
  type EstimateOutputs, type Viewer,
} from '../../../04-phase-work/phase3/caprebate-anchor-quarantine.ts';
import { toQuarantineRole, type AppRole } from './roles.ts';
import { can, type Actor, type Obj } from './authz.ts';

/** The parts of a job that are inputs, and are released to everyone always. */
export type JobInputs = {
  readonly job_id: string;
  readonly business_id: string;
  readonly business_name: string;
  readonly sector: string;
  readonly answers: readonly {
    readonly ord: number;
    readonly question_id: string;
    readonly question_text: string;
    /** ANSWERED / DONT_KNOW / SKIPPED. A skipped question is a fact, not a blank. */
    readonly state: string;
    readonly value: string | null;
  }[];
  readonly register_records: readonly { readonly source_id: string; readonly fields: unknown }[];
  readonly properties: readonly { readonly label: string; readonly postcode: string | null }[];
};

export type SurveyorPayload = JobInputs & {
  readonly quarantine: {
    readonly state: 'SEALED' | 'COMMITTED_AND_RELEASED';
    readonly notice: string;
    readonly released_always: readonly string[];
  };
  /**
   * PRESENT ONLY AFTER COMMITMENT. Optional in the type for exactly that
   * reason: a caller cannot read `payload.estimate.qualifying_pct` without
   * first narrowing, and a narrow is a place a reviewer can look.
   */
  readonly estimate?: EstimateOutputs;
};

export const QUARANTINE_NOTICE =
  'Our estimate is withheld until your own figures are committed. Commit them and it is ' +
  'released automatically — there is no queue and nobody to ask.';

/**
 * Build what this viewer may receive.
 *
 * For a quarantined viewer before commitment the returned object has NO
 * `estimate` key at all — `'estimate' in payload` is false, and JSON.stringify
 * of it contains none of the figures.
 */
export function assembleSurveyorPayload(
  actor: Actor, inputs: JobInputs, quarantine: AnchorQuarantine,
): SurveyorPayload {
  const base: SurveyorPayload = {
    ...inputs,
    quarantine: {
      state: quarantine.state,
      notice: QUARANTINE_NOTICE,
      released_always: RELEASED_TO_SURVEYOR_ALWAYS,
    },
  };

  const viewer: Viewer = { user_id: actor.id, role: toQuarantineRole(actor.role) };

  let estimate: EstimateOutputs;
  try {
    // The quarantine decides. A refusal here is not an error condition to be
    // handled around — it is the control working, and it writes its own
    // ACCESS_DENIED entry, which is evidence in its own right.
    estimate = quarantine.openEstimate(viewer);
  } catch (e) {
    if (e instanceof QuarantineError) return base; // no `estimate` key. This is the point.
    throw e;
  }

  return { ...base, estimate };
}

/**
 * The second gate, for callers that are not the surveyor workspace: a role that
 * has no `estimate.read` rule at all never reaches the quarantine.
 *
 * BOTH are needed. can() answers "may this role ever see an estimate"; the
 * quarantine answers "may this surveyor see it YET". Neither subsumes the other,
 * and a build that kept only one would pass a careless review.
 */
export function mayReadEstimate(actor: Actor, estimate_ref: Extract<Obj, { type: 'estimate' }>): boolean {
  return can(actor, 'estimate.read', estimate_ref);
}

/**
 * Every key and every value the quarantine covers, for the payload test.
 *
 * Exported because the test must not maintain its own copy: a list that drifts
 * from EstimateOutputs would go on passing while a new field leaked. Derived
 * from the object, so a field added to the estimate is covered the day it
 * appears.
 */
export function quarantinedKeysAndValues(e: EstimateOutputs): { keys: string[]; values: (string | number)[] } {
  const keys: string[] = [];
  const values: (string | number)[] = [];
  const walk = (o: Record<string, unknown>): void => {
    for (const [k, v] of Object.entries(o)) {
      keys.push(k);
      if (typeof v === 'number' || typeof v === 'string') values.push(v);
      else if (v !== null && typeof v === 'object') walk(v as Record<string, unknown>);
    }
  };
  walk(e as unknown as Record<string, unknown>);
  return { keys, values };
}

/* ------------------------------------------------------------------ *
 * CRM 6 of 10 — THE CLAIM'S FACTS, RELEASED TO A SURVEYOR
 * ------------------------------------------------------------------ */

/**
 * THE INPUTS A SURVEYOR ON AN ASSIGNED JOB MAY RECEIVE FROM THE FACTS PANEL, AND
 * NOTHING ELSE. Each is a fact about the property or the transaction the survey
 * needs to be right: who the claimant is, the nation, when it was bought, whether
 * an election fixes what passes and over which fixtures, who owned it before and
 * whether they claimed, whether a grant met the spend and against which
 * elements, and whether the buyer altered it to install plant.
 *
 * NOT ON IT, AND SO NEVER READ FOR A SURVEYOR: any amount — the election's value,
 * a grant's amount, the pool split, the transaction tax, the alterations' cost,
 * the structures allowance figure — the amendment window, the profit position,
 * the allowance headroom, and every figure in the four figures. An amount agreed
 * between buyer and seller is a number a surveyor could anchor on as readily as
 * our own, so it waits with our estimate.
 */
export const RELEASED_FACTS_TO_SURVEYOR = Object.freeze([
  'claimant_type', 'jurisdiction', 'acquisition_date',
  'election_exists', 'election_section', 'election_notified_on', 'election_elements', 'prior_owner_chain',
  'grants_exist', 'grants_traced', 'buyer_alterations',
] as const);

export type ReleasedFactKey = (typeof RELEASED_FACTS_TO_SURVEYOR)[number];

export type ReleasedFacts = {
  readonly released_to_surveyor: true;
  readonly notice: string;
  readonly facts: Readonly<Record<ReleasedFactKey, unknown>>;
};

export const RELEASED_FACTS_NOTICE =
  'The claim’s facts that your survey needs. Every amount, the tax position and our figures are not part of it.';

/**
 * BUILT FORWARDS FROM THE RELEASED LIST. `read` is asked for each released key
 * and for nothing else, so a fact added to the panel later is absent here by
 * default — the only direction that fails safe. Refused, it returns nothing at
 * all rather than an empty object that looks like a facts panel with no facts.
 */
export function assembleReleasedFacts(
  actor: Actor, obj: Extract<Obj, { type: 'claim_facts' }>, read: (key: ReleasedFactKey) => unknown,
): ReleasedFacts | null {
  if (!can(actor, 'claim_facts.read_released', obj)) return null;
  const facts = {} as Record<ReleasedFactKey, unknown>;
  for (const key of RELEASED_FACTS_TO_SURVEYOR) facts[key] = read(key);
  return { released_to_surveyor: true, notice: RELEASED_FACTS_NOTICE, facts };
}

/** True when `role` is one the quarantine withholds from. */
export function isQuarantinedRole(role: AppRole): boolean {
  return toQuarantineRole(role) === 'SURVEYOR';
}
