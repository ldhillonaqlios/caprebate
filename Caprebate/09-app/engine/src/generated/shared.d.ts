/* Declarations for the generated shared layer.
   HAND-WRITTEN, unlike shared.js itself, and deliberately CONSERVATIVE: a
   member is declared here only where this phase read the implementation and
   can say what it means. Everything else stays `unknown`, which forces the
   caller to narrow instead of trusting a type nobody checked. Phases 103+
   should widen this file from the code as they come to use each module. */

import type {
  Session, CtaSwitches, RegistryPrecondition, PoolBasis, PoolSplit,
  CashRoute, MaybeRange,
} from "../types.js";

export interface CashModule {
  readonly ROUTE: {
    readonly AMEND: "W1"; readonly CURRENT_YEAR: "W2";
    readonly WDA_FORWARD: "W3"; readonly LOSS_CARRYBACK: "W4";
  };
  readonly deriveAmendmentWindow: (s: Session) => { readonly known: boolean; readonly inTime?: boolean } & Record<string, unknown>;
  readonly computeCashBenefit: (
    s: Session, tsLo: number, tsHi: number, pushFlag: (f: string) => void,
  ) => {
    readonly cash: MaybeRange;
    readonly route: CashRoute | null;
    readonly blocked: boolean;
    readonly gate: Record<string, boolean | null>;
  };
  readonly ctDeadline: (...a: readonly unknown[]) => unknown;
  readonly saDeadline: (...a: readonly unknown[]) => unknown;
}

export interface PoolModule {
  readonly BASIS: { readonly MEASURED: "measured"; readonly INDICATIVE: "indicative"; readonly UNKNOWN: "unknown" };
  readonly basisOf: (s: Session) => PoolBasis;
  readonly split: (s: Session, qeLo: number, qeHi: number, assumptions: string[]) => PoolSplit;
  readonly poolOfRow: (...a: readonly unknown[]) => unknown;
  readonly electionSplitSafe: (...a: readonly unknown[]) => unknown;
}

/* ---------------------------------------------------------------------------
   WIDENED BY PHASE 106, 9 September 2026 — the registry derivation layer.

   This file's own header asks for exactly this: "Phases 103+ should widen this
   file from the code as they come to use each module." Phase 106 is the first
   consumer of CB_REGISTRY.derive and CB_REGISTRY.FIELDS — the engaged-client
   business page derives "what is still missing" from them rather than keeping
   a checklist — so they stop being `unknown` here rather than being cast at the
   call site.

   STILL CONSERVATIVE. Every member below was read out of the implementation in
   "Caprebate site.html". `values` and the bundle stay `unknown`-valued because
   a register field's type depends on the publisher, and inventing one would be
   a type nobody checked. Nothing here changes behaviour.
   --------------------------------------------------------------------------- */

/** One field the derivation layer can retire, and the question it retires. */
export interface RegistryField {
  /** The SOURCES key that would supply it: 'epc', 'cqc', 'hmlr', … */
  readonly source: string;
  /** The CB_JURIS dataset this depends on, or null where it is UK-wide. */
  readonly jurisdictional: string | null;
  /** True where the dataset holds residential property only. */
  readonly residentialOnly?: boolean;
  /** The question this fact makes unnecessary, in the words a client would hear. */
  readonly retires: string;
  /** The confirmation sentence, with {v} standing for the value. */
  readonly confirm: string;
}

/** One publisher the derivation layer reads. `gate` names a blocker, or is null. */
export interface RegistrySource {
  readonly label: string;
  /** 'licence' where we do not hold the licence. null where nothing blocks it. */
  readonly gate: string | null;
  readonly fields: readonly string[];
  readonly personal: readonly string[];
  readonly permitted: readonly string[];
  /**
   * The fields on this source retrieved only AFTER a signed engagement (CA2,
   * Phase 132c). A FIELD list, not a `gate`: the back end reads `gate` as a
   * licence blocker. Every catalogued source carries one, empty where nothing
   * on it waits on signature. Declared by Phase 132f, 16 September 2026.
   */
  readonly postSignature: readonly string[];
}

/* ---------------------------------------------------------------------------
   WIDENED BY PHASE 132f, 16 September 2026 — classifyField and its engagement.

   Phase 132c added `SOURCES[].postSignature` and a third argument to
   classifyField in the site, and this file (hand-written: the extractor writes
   shared.js, the sector modules, manifest.json and session.d.ts, nothing else)
   was not widened, so classifyField fell through to the `unknown` index
   signature and the engagement argument was untyped. Read from `classifyField`
   in shared.js, not from its name.

   N4. The engagement record is OPTIONAL and nullable, and `signed` is `unknown`:
   only `signed === true` opens a post-signature field, and an absent record,
   null, undefined, `signed:false` and a "yes" or "not sure" typed anywhere all
   leave it shut. None of them throws, so none of them is a type error either.
   --------------------------------------------------------------------------- */

/** What the server's assertSignedEngagement hands in. Only `signed === true` counts. */
export interface EngagementRecord {
  readonly signed?: unknown;
  readonly [member: string]: unknown;
}

/** classifyField's answer. A state, not a throw. */
export type FieldClassification =
  | { readonly ok: true }
  | {
      readonly ok: false;
      readonly code: "E_UNKNOWN_SOURCE" | "E_PERSONAL_FIELD_NOT_PERMITTED" | "E_UNCLASSIFIED_FIELD";
      readonly why: string;
    }
  | {
      readonly ok: false;
      /** A permitted field waiting on a signed engagement. Not a refusal. */
      readonly code: "NOT_PERMITTED_YET";
      readonly postSignature: true;
      readonly why: string;
    };

/**
 * What derive() returns. `ask` is the list this build actually uses: every
 * field that is still a question, whatever the reason. With the precondition
 * disabled it is EVERY field, and `why.__layer` says so — which is the honest
 * state today and not an error condition.
 */
export interface RegistryDerivation {
  readonly enabled: boolean;
  readonly values: Readonly<Record<string, unknown>>;
  readonly provenance: Readonly<Record<string, { source: string; label: string; confirm: string }>>;
  readonly ask: readonly string[];
  readonly refused: readonly { field: string; code: string; why: string }[];
  readonly gated: readonly string[];
  readonly notCovered: readonly string[];
  /** Per field, plus `__layer` for a reason that applies to all of them. */
  readonly why: Readonly<Record<string, string>>;
}

export interface RegistryModule {
  /** enabled:false. See THE STANDING BUSINESS RULES — this is not a build gate to open. */
  readonly precondition: RegistryPrecondition;
  readonly SOURCES: Readonly<Record<string, RegistrySource>>;
  readonly FIELDS: Readonly<Record<string, RegistryField>>;
  readonly RESIDENTIAL_SECTORS: readonly string[];
  /**
   * One field of one source: may it be taken? `engagement` may be omitted,
   * undefined or null, and all three read exactly as an unsigned engagement.
   */
  readonly classifyField: (
    sourceId: string,
    field: string,
    engagement?: EngagementRecord | null | undefined,
  ) => FieldClassification;
  /**
   * Facts in, questions out. `bundle` is what connectors returned, keyed by
   * SOURCES id — and it is empty in this build, because the connectors do not
   * exist. An empty bundle is handled by asking for everything; it is not a
   * special case and it does not throw.
   */
  readonly derive: (
    bundle: Readonly<Record<string, Readonly<Record<string, unknown>>>>,
    opts?: { readonly nation?: string; readonly sector?: string | null },
  ) => RegistryDerivation;
  readonly retired: (d: { values?: Readonly<Record<string, unknown>> }) => readonly string[];
  readonly sectorFromServiceType: (t: string | null | undefined) => {
    readonly sector: string | null; readonly derivable: boolean; readonly why: string;
  };
  readonly [member: string]: unknown;
}

/** A CB_ module this phase did not read. Narrow before use. */
export type OpaqueModule = Readonly<Record<string, unknown>>;

/* ===========================================================================
   WIDENED BY PHASE 104, 8 September 2026 — the four funnel modules.

   This file's own header asks for exactly this: "Phases 103+ should widen this
   file from the code as they come to use each module." Phase 104 is the first
   consumer of CB_FUNNEL, CB_FRONTDOOR, CB_BOOKING and CB_BAND — it draws the
   six-screen front door out of them — so the four stop being OpaqueModule here
   rather than being cast at every call site in the web half.

   STILL CONSERVATIVE, AND DELIBERATELY SO. A member is declared below only
   where this phase read the implementation in "Caprebate site.html" and can
   say what it means. Return shapes that vary by branch are declared as their
   known fields plus an index signature, so a caller must still narrow rather
   than trust a type nobody checked. Nothing here changes behaviour: these are
   declarations for a generated .js file that is a byte-for-byte slice.
   =========================================================================== */

/** A property as CB_FUNNEL models it. Every field starts null — see N4. */
export interface FunnelProperty {
  address: string | null;
  sector: string | null;
  entity_type: string | null;
  trigger: string | null;
  spend: number | null;
  spend_unknown: boolean;
  date: string | null;
  date_unknown: boolean;
  lease_start_year: string | null;
  works: string | null;
  works_type: string | null;
  works_spend: number | null;
  works_spend_unknown: boolean;
  works_year: string | null;
  works_year_unknown: boolean;
  [member: string]: unknown;
}

/** The funnel's whole state. Nothing personal is set until the funnel close. */
export interface FunnelState {
  own_prior_claim: string | null;
  previous_owner_claimed: string | null;
  is_uk_taxpayer: string | null;
  current_year_position: string | null;
  trigger_default: string | null;
  properties: FunnelProperty[];
  contact: Record<string, unknown>;
  account: Record<string, unknown>;
  [member: string]: unknown;
}

/** One line of the combined ceiling. A property with no ceiling is marked, not dropped. */
export interface FigureBreakdownRow {
  address: string | null;
  sector: string | null;
  ceiling: number | null;
  low?: number;
  high?: number;
  incomplete?: boolean;
  why?: string;
  [member: string]: unknown;
}

export interface FunnelFigure {
  total: number;
  count: number;
  breakdown: readonly FigureBreakdownRow[];
  incompleteProperties?: readonly FigureBreakdownRow[];
  unpricedProperties?: readonly FigureBreakdownRow[];
  terminalProperties?: readonly FigureBreakdownRow[];
  condition?: unknown;
  [member: string]: unknown;
}

export interface FunnelModule {
  /** The six screens before the figure. The harness asserts its length. */
  readonly SCREENS: readonly string[];
  readonly SECTOR_LABEL: Readonly<Record<string, string>>;
  readonly TRIGGER_LABEL: Readonly<Record<string, string>>;
  readonly ENTITY_LABEL: Readonly<Record<string, string>>;
  /** [value, label] pairs, in the order the site renders them. */
  readonly ROLES: readonly (readonly [string, string])[];
  readonly blankProperty: () => FunnelProperty;
  readonly blankState: () => FunnelState;
  readonly figure: (state: FunnelState) => FunnelFigure;
  /** Travels with the figure on every render; it is the guard on the headline. */
  readonly assumptions: (state: FunnelState) => readonly string[];
  readonly [member: string]: unknown;
}

/**
 * What Q1b's gate returns — every field read from `gateQ1b` in shared.js, not
 * from its name. A reasoned negative, not an error.
 *
 * `gated` IS THE ONLY FIELD THAT STOPS THE FUNNEL. Until 11 September 2026 this
 * declaration named a field `stop`, which the engine has never returned. The
 * renderer read `stop`, the compiler agreed with it, and the gate never fired:
 * a business with no UK tax bill went on to a figure. This file is hand-written
 * beside the generated slice (09-app/engine/EXTRACTION.md) — the extractor
 * writes shared.js, the sector modules, manifest.json and session.d.ts, and
 * nothing else — so the fix is here, and the engine is untouched.
 */
export interface Q1bGate {
  /** true for "no" and "charity" only. "not sure" and never-asked are both false (N4). */
  gated: boolean;
  /** NO_TAX_TO_RELIEVE when gated; TAX_STATUS_UNKNOWN for "not sure" or never-asked; null for "yes". */
  code: string | null;
  /** The gate's reason, in words, when gated; otherwise null. */
  message: string | null;
  offerCall: boolean;
  /** Carried on the face of the figure where the tax position is unknown; otherwise null. */
  condition: string | null;
  askProfit: boolean;
  /** CONFIRM_TAX_STATUS_ON_CALL, on the unknown reading only. */
  flag?: string;
  [member: string]: unknown;
}

/** The spend fields a trigger asks for, or null where it asks for none. */
export interface SpendFields {
  label: string;
  dateLabel: string;
  date?: string;
  extra?: string;
  [member: string]: unknown;
}

export interface WorksHeading {
  heading: string;
  sub?: string;
  [member: string]: unknown;
}

export interface FrontDoorModule {
  readonly QUESTIONS: readonly Readonly<Record<string, unknown>>[];
  readonly gateQ1: (state: FunnelState) => Readonly<Record<string, unknown>>;
  readonly gateQ1b: (state: FunnelState) => Q1bGate;
  readonly TRIGGERS: unknown;
  readonly spendFieldsFor: (trigger: unknown) => SpendFields | null;
  readonly worksHeadingFor: (trigger: unknown) => WorksHeading;
  readonly propertyDefaults: (index: number, state: FunnelState) => Readonly<Record<string, unknown>>;
  readonly combineCeilings: (parts: readonly FigureBreakdownRow[]) => FunnelFigure;
  readonly [member: string]: unknown;
}

/** CB_BOOKING's channels. THREE of them — video was removed on 3 Sep 2026. */
export interface BookingChannel {
  id: string;
  label: string;
  primary?: boolean;
  booksASlot?: boolean;
  capture?: string;
  variants?: readonly string[];
  /** A channel with a third-party processor MUST NOT render until it is declared. */
  processor?: boolean;
  note?: string;
}

export interface BookingOffer {
  offer: boolean;
  why?: string;
  prominence?: string;
  skippable?: boolean;
  heading?: string;
  body?: string;
  channels?: readonly BookingChannel[];
  consents?: readonly Readonly<Record<string, unknown>>[];
  identity?: readonly string[];
  persistsLead?: boolean;
  persistsAssessment?: boolean;
  persistsEstimate?: boolean;
  [member: string]: unknown;
}

export interface BookingModule {
  readonly CHANNELS: readonly BookingChannel[];
  /** Captured PER CHANNEL, never once globally. */
  readonly CONSENTS: readonly Readonly<Record<string, unknown>>[];
  readonly IDENTITY_FIELDS: readonly string[];
  readonly ENTRY_POINTS: readonly string[];
  readonly offerAt: (point: string, ctx?: Readonly<Record<string, unknown>>) => BookingOffer;
  readonly processorChannels: () => readonly string[];
  /** Returns the list rather than a boolean, so the caller has to look at it. */
  readonly renderableChannels: (declaredProcessors?: readonly string[]) => readonly BookingChannel[];
  readonly booksASlot: (channelId: string) => boolean;
}

export interface BandModule {
  readonly BANDS: Readonly<Record<string, unknown>>;
  readonly bandKey: (sector: unknown, trigger: unknown) => string | null;
  readonly bandFor: (sector: unknown, trigger: unknown) => Readonly<Record<string, unknown>> | null;
  readonly rangeFor: (
    sector: unknown, trigger: unknown, spend: number,
  ) => { low: number; high: number } | null;
  readonly [member: string]: unknown;
}

export declare const CB_PLANT: OpaqueModule;
export declare const CB_CTA: CtaSwitches;
export declare const CB_CTAQ: OpaqueModule;
export declare const CB_POOL: PoolModule;
export declare const CB_S25: OpaqueModule;
export declare const CB_ELECTION: OpaqueModule;
export declare const CB_JURIS: OpaqueModule;
export declare const CB_ACQ: OpaqueModule;
export declare const CB_RATES: OpaqueModule;
export declare const CB_TAXPOS: OpaqueModule;
export declare const CB_CASH: CashModule;
export declare const CB_S187A: OpaqueModule;
export declare const CB_REGISTRY: RegistryModule;
export declare const CB_FRONTDOOR: FrontDoorModule;
export declare const CB_FEE: OpaqueModule;
export declare const CB_FEEGUARD: OpaqueModule;
export declare const CB_BENEFIT: OpaqueModule;
/* PHASE 113d — the engagement gate. CB_GATE_CONFIG is the switch and the three
   inputs the gate cannot invent; CB_GATE is the decision layer over
   04-phase-work/phase9/caprebate-job-economics.cjs, which stays the only
   calculator. `costing` is INJECTED and is null as shipped, so assess()
   returns UNDETERMINED until a host wires it. */
export interface GateConfig {
  readonly enabled: boolean;
  readonly requires: string;
  readonly delivery_scenario: string;
  /** The current year's ACTUAL job volume. null as shipped, and never 100. */
  readonly jobs_per_year: number | null;
  readonly target_margin: number;
  readonly costing:
    | ((sector: string, scenario: string, jobsPerYear: number) =>
        { known: boolean; loaded?: number | null; parameter?: string | null;
          overhead_is_placeholder?: boolean })
    | null;
  readonly [member: string]: unknown;
}

export interface GateDecision {
  readonly outcome: "PASS" | "FIRE" | "UNDETERMINED";
  readonly determined: boolean;
  readonly why: string;
  /** The first missing input, or null when determined. */
  readonly parameter: string | null;
  readonly missing: readonly string[];
  readonly expected_fee: number | null;
  readonly loaded_cost: number | null;
  readonly threshold: number | null;
  readonly shortfall: number | null;
  readonly sector: string | null;
  readonly delivery_scenario: string | null;
  readonly jobs_per_year: number | null;
  readonly target_margin: number | null;
  readonly cost_basis_is_a_placeholder: boolean | null;
  readonly routes_to: string | null;
  readonly enabled: boolean;
  /** The single boolean a renderer acts on. Never re-derive the conjunction. */
  readonly withholds_quote: boolean;
}

export interface GateModule {
  readonly assess: (input: { fee?: unknown; sector?: unknown }) => GateDecision;
  readonly COME_BACK: string;
  readonly OUTCOMES: Readonly<Record<string, string>>;
  readonly [member: string]: unknown;
}

export declare const CB_GATE_CONFIG: GateConfig;
export declare const CB_GATE: GateModule;
export declare const CB_BOOKING: BookingModule;
export declare const CB_BAND: BandModule;
export declare const CB_FUNNEL: FunnelModule;
