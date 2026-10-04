/* =============================================================================
   @caprebate/engine — THE TYPED SURFACE                     Phase 102, Block A

   WHAT IS HAND-WRITTEN HERE AND WHAT IS NOT
     `generated/session.d.ts` carries the ~40 session facts whose value sets are
     read straight off the five Q arrays. This file carries the rest: the facts
     no option list describes, the result shape, and the module surfaces.

   THE RULE THIS FILE EXISTS TO ENFORCE — non-negotiable N4
     A fact the client was never asked is ABSENT. A fact they answered "not
     sure" to is UNSURE. Neither may become 0, a limit, or a pass, and neither
     may open a gate that would relieve the client. Every relieving fact below
     is therefore OPTIONAL and, where the engine distinguishes it, carries
     "unsure" as a value of its own. A type that collapses those two states is
     how a tax answer changes without anybody editing a tax rule.

   WHY SO MUCH IS `unknown`
     About 190 distinct facts can appear on a session. The ones typed below are
     the ones whose meaning was READ OUT OF THE ENGINE for this phase. The rest
     reach you as `unknown` through the index signature, which forces a narrow
     before use. That is deliberate and it is the honest position: a type
     invented for a fact nobody checked is worse than no type, because it reads
     as evidence. Phases 103 to 107 should type each one as they come to need
     it, from the code rather than from the name.
   ============================================================================= */

import type { DerivedSessionFacts } from "./generated/session.js";

/* ------------------------------------------------------------------- ranges */

/** A low/high pair the engine is sure of. */
export type Range = readonly [number, number];

/** A low/high pair where `null` means "not established" — never zero. */
export type MaybeRange = readonly [number | null, number | null];

/* ------------------------------------------------------- the critical union

   `aia_headroom` HAS FOUR STATES AND GATE 2 OF THE CASH GATES TELLS THEM APART.
   Read the branch in CB_CASH before you change this type:

     "none"      the client HAS no headroom left    -> no AIA modelled, stated
     a number    a headroom amount was stated       -> AIA applied, capped
     "unsure"    they were asked and did not know   -> no AIA modelled, flagged
     absent      nobody ever asked                  -> identical to "unsure"

   NARROWING THIS TO `number | undefined` WOULD LOSE THE FIRST AND THIRD, and
   giving it a DEFAULT would turn "we do not know" into a favourable answer.
   Suite S in the regression harness asserts all four and has been proved able
   to fail. If Suite S goes red, this type is the first place to look. */
export type AiaHeadroom = "none" | "unsure" | number;

/** The trigger question is MULTI-select, so this is always an array. */
export type TriggerKind =
  | "conversion" | "equipment" | "extension" | "fitout"
  | "new_build" | "purchase" | "refurb";

/* ------------------------------------------------------------------ session */

/**
 * One client's answers. Facts in, estimate out — a Session holds no identifiers,
 * no documents and no credentials, and the engine never persists it.
 *
 * Every fact is optional. `runEngine` mutates the four working fields below, so
 * a caller passes a session it is willing to have written to; see `newSession`.
 */
export interface Session extends DerivedSessionFacts {
  /* -- the working fields runEngine reads and writes ---------------------- */

  /** What happened to the property. Multi-select; empty is read as a purchase. */
  trigger?: readonly TriggerKind[];
  /** Referral reasons pushed by `pushFlag`. A non-empty list makes the outcome a referral. */
  flags?: string[];
  /** Plain-English caveats the estimate is subject to. */
  assumptions?: string[];
  /** Land Remediation Relief seen during the run. */
  lrr?: boolean;

  /* -- the N4-critical relieving facts ------------------------------------ */

  /** See {@link AiaHeadroom}. Four states, and they are not interchangeable. */
  aia_headroom?: AiaHeadroom;
  /** Whether AIA is already spoken for elsewhere this period. */
  aia_used_elsewhere?: "yes" | "no" | "unsure";
  /** Which pool the AIA is allocated against. Absent means both orderings are modelled. */
  aia_allocation?: "main_first" | "special_first";
  /** Whether there are profits for relief to bite on. Gate 1 of the cash gates. */
  sufficient_profit?: "yes" | "no" | "unsure";
  /** Whether the return is filed. Absent is NOT "no". */
  return_filed?: "yes" | "no" | "unsure";
  /** Whether the return is still in time to amend. `true`/`false` when known. */
  return_in_time?: boolean;

  /* -- the money ---------------------------------------------------------- */

  /** The expenditure the band is applied to. */
  base_amount?: number;
  purchase_price?: number;
  price_paid?: number;
  /** Fractions in 0..1, not percentages. */
  grant_fraction?: number;
  landlord_contrib_fraction?: number;
  residential_fraction?: number;

  /* -- jurisdiction ------------------------------------------------------- */

  /**
   * Scottish income-tax bands apply to unincorporated claimants. Absent means
   * NOT ESTABLISHED — CB_JURIS reads it and nothing in two of the five sector
   * flows ever sets it, which is a known finding and not this type's job to fix.
   */
  is_scotland?: boolean;

  /* -- everything else ----------------------------------------------------
     Reaches you as `unknown` on purpose. Narrow it, or type it properly in the
     phase that needs it — see the header note. */
  [fact: string]: unknown;
}

/* ------------------------------------------------------------------- result */

/** `referral` means the flags list is non-empty and a human must look. */
export type Outcome = "estimate" | "referral";

/** The claim route, in Rulebook A's meaning (s.4). `null` when none is
 *  established. Corrected 12 September 2026: until then these four codes
 *  carried the engine's own cash mechanisms instead. W4 is never derived
 *  today, because no question captures an open enquiry. */
export type CashRoute =
  | "W1" /** amend: inside the amendment window */
  | "W2" /** current-period pooling: window closed, property still owned */
  | "W3" /** closed: window closed, property sold - nil */
  | "W4" /** enquiry open: the window is extended */;

/**
 * One cash gate. `true` open, `false` shut, and `null` NOT ESTABLISHED — which
 * is the state that must never be read as either of the other two.
 */
export type GateState = boolean | null;

export interface CashGates {
  readonly profits: GateState;
  readonly aiaHeadroom: GateState;
  readonly poolBalances: GateState;
  readonly priorClaims: GateState;
}

/** How the main-rate / special-rate split was arrived at. */
export type PoolBasis = "measured" | "indicative" | "unknown";

export interface PoolSplit {
  readonly basis: PoolBasis;
  /** `false` when the split could not be determined; `main` and `special` are then null pairs. */
  readonly determined: boolean;
  readonly main: MaybeRange;
  readonly special: MaybeRange;
  readonly flagCode?: string | null;
}

export interface EngineResult {
  readonly outcome: Outcome;
  /** Qualifying expenditure, low and high. */
  readonly QE: Range;
  /** Tax saving, low and high. */
  readonly TS: Range;
  /** Near-term cash. `null` entries mean not established — not nil. */
  readonly cash: MaybeRange;
  readonly cashRoute: CashRoute | null;
  readonly cashBlocked: boolean;
  readonly cashGates: CashGates;
  readonly pool: PoolSplit;
  readonly flags: readonly string[];
  readonly assumptions: readonly string[];
  /** Plain-English note on how fast the relief arrives. Empty when nothing to say. */
  readonly speed: string;
  readonly lrr: boolean;
  /**
   * `true` when a grant or subsidy share was actually DEDUCTED from the base on
   * this run. The result screen's "Shown net of the grant" panel is gated on it.
   * All five sector engines return it, on their one and only return path, so it
   * is declared required rather than optional (Phase 113i).
   *
   * `false` MEANS NOTHING WAS DEDUCTED. IT DOES NOT MEAN "NO GRANT". A client who
   * answered "not sure" is flagged for referral, never assumed grant-free; and
   * with supported living's F-3 switch on, an untraced scheme-wide grant is left
   * in the base on purpose and disclosed as not deducted. Do not read `false`
   * as evidence that the spend was unfunded.
   */
  readonly grant: boolean;
}

/* ------------------------------------------------------------------ sectors */

export type SectorId =
  | "care_homes" | "dental" | "supported_living" | "gp" | "private_hospital";

/** A question in a sector flow. The predicates take the session and read it only. */
export interface Question {
  readonly id: string;
  readonly group?: string;
  readonly type?: string;
  readonly ask?: string;
  readonly help?: string;
  readonly opts?: ReadonlyArray<readonly [string, string]>;
  readonly showIf?: (s: Session) => boolean;
  readonly onSet?: (s: Session, v: string) => void;
  readonly gate?: (s: Session) => unknown;
}

export interface SectorEngine {
  readonly sector: SectorId;
  /** Facts in, estimate out. Mutates `flags` and `assumptions` on the session it is given. */
  readonly runEngine: (s: Session) => EngineResult;
  readonly Q: readonly Question[];
  readonly YIELD_BAND: Readonly<Record<string, Readonly<Record<string, Range>>>>;
  readonly pushFlag: (s: Session, flag: string) => void;
}

/* --------------------------------------------------------- the CTA switches

   TWELVE readings that are coded, tested and INERT (eleven until Phase 113j
   added grant_after_ceilings on 10 September 2026 - and that "twelve" is prose,
   so check it against the verifier's count rather than trusting it). Each one is
   a question the chartered tax adviser has not answered yet; each is built and
   switched off so that the answer is a one-line change rather than a proposal.
   They are counted at runtime by the verifier, never quoted. NOTHING IN THIS
   PACKAGE MAY SET ONE TO TRUE — turning one on is the tax adviser's decision,
   not a build step. */
export interface CtaSwitches {
  readonly s185_plus_own_s25: boolean;
  readonly urenco_provision_of: boolean;
  readonly specialised_supported_housing: boolean;
  readonly trade_not_s35: boolean;
  readonly s187a_needs_entitled_owner: boolean;
  readonly grant_traced_after_dwelling: boolean;
  readonly connected_contributor_no_reduction: boolean;
  readonly s538_carveout: boolean;
  readonly s187a_6b_statements_route: boolean;
  readonly fvr_requires_past_owner_claim: boolean;
  readonly transaction_tax_in_base: boolean;
  /** GC-1 (Phase 113j): the grant's share comes off AFTER the election, disposal-value
      and s.187A ceilings rather than off the spend before them. The only switch that
      can only make a claim smaller, and only where a ceiling binds. */
  readonly grant_after_ceilings: boolean;
  /** F-15's remainder (Phase 153a, 4 October 2026): a grant matched to named fixture-list rows comes off only those
      rows' qualifying spend. Read by the back end's survey pack, never by the public estimate. */
  readonly grant_traced_to_elements: boolean;
}

/** The gate on the free register lookups. `enabled` is false and is not ours to flip. */
export interface RegistryPrecondition {
  readonly enabled: boolean;
  readonly requires: string;
}
