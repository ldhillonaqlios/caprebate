/**
 * THE ENGAGEMENT GATE, RUN WITH THE JOB COST MODEL'S COSTING. Moved from src/shared/engine.ts in Phase 161l, text
 * unchanged, with the job cost model it injects (src/modules/assessment/costing/job-economics.cjs, from the survey's
 * costing folder, where nothing read it): the shared parts load nothing of a business module, and the assessment, the
 * lowest module, is the one that asks the gate (vat.ts) and the one the claims below the CRM can reach.
 */
import { createRequire } from 'node:module';
import { FEE, GATE, GATE_CONFIG, type BenefitContext, type FeeDisplay, type GateDecision } from '../../shared/index.ts';

/* ================================================================== *
 * THE ENGAGEMENT GATE, WITH ITS COSTING INJECTED
 *
 * CB_GATE_CONFIG was switched on (120 jobs this year), and nothing handed it costs: `costing` ships null, so
 * every assessment came back UNDETERMINED naming "costing" and the gate stopped nothing. The engine says the costing
 * is "injected by whatever runs it", and that the only calculator is
 * 09-app/backend/src/modules/assessment/costing/job-economics.cjs `costingForGate`. This is the back end injecting it.
 *
 * SCOPED, NOT PERMANENT. The costing is set on CB_GATE_CONFIG for one synchronous call and put back in `finally`,
 * the mutate-and-restore Suite T of the site harness uses. A permanent injection would change every `feeDisplay`
 * call in this package that ever passes a sector, silently; this way the gate runs where it is asked for by name.
 *
 * NOTHING HERE COMPUTES A COST OR A THRESHOLD. The loaded cost is phase9's, the margin, the volume, the scenario,
 * the comparison and the outcome words are CB_GATE's. The one thing this file adds is a vocabulary join: the engine
 * calls the sector `care_homes` and phase9 calls it `care_home`. Without the join a care home would never be
 * costed (UNDETERMINED for ever — safe, and a gate that stops nothing, which is the defect being fixed).
 * Supported living has NO cost row in phase9, so it stays UNDETERMINED naming `sector` — never a pass, never a
 * refusal. If the phase9 module cannot be loaded the costing is absent and every answer is UNDETERMINED.
 * ================================================================== */

type GateCosting = (sector: string, scenario: string, jobsPerYear: number) =>
  { known: boolean; loaded?: number | null; parameter?: string | null; overhead_is_placeholder?: boolean };

/** Engine sector ids that phase9 spells differently. A join, not a rule. */
export const ECONOMICS_SECTOR_OF: Readonly<Record<string, string>> = Object.freeze({ care_homes: 'care_home' });

const JOB_ECONOMICS_COSTING: GateCosting | null = (() => {
  try {
    const m = createRequire(import.meta.url)('./costing/job-economics.cjs') as { costingForGate?: unknown };
    const f = m.costingForGate;
    if (typeof f !== 'function') return null;
    const costing = f as GateCosting;
    return (sector: string, scenario: string, jobs: number) => costing(ECONOMICS_SECTOR_OF[sector] ?? sector, scenario, jobs);
  } catch {
    return null;
  }
})();

/** Whether phase9's costing loaded. False means every gate reading is UNDETERMINED, which is honest. */
export function gateCostingLoaded(): boolean {
  return JOB_ECONOMICS_COSTING !== null;
}

/**
 * The placeholder caveat, ON EVERY ANSWER — determined or not. The engine's own requires: string says "STILL AN
 * ESTIMATE" and that every answer the gate gives says so; the loaded cost rests on the overhead placeholder and on
 * estimated, not quoted, surveyor and tax adviser fees.
 */
export const GATE_PLACEHOLDER_CAVEAT =
  'An estimate, not a measured cost. Our overheads in it are a guess for now. ' +
  'The surveyor and tax adviser fees are estimates, not quotes. It assumes the number of jobs the owner gave ' +
  'for this year. If we do fewer jobs than that, some jobs that lose money will pass.';

export type FeeGateReading = GateDecision & { readonly placeholder_caveat: string; readonly costing_loaded: boolean };

/** For a test, or a what-if: stand-ins for the config the gate reads. Absent keys leave the shipped value. */
export type GateOverrides = { readonly jobs_per_year?: unknown; readonly enabled?: unknown };

function withGateCosting<T>(over: GateOverrides, fn: () => T): T {
  const cfg = GATE_CONFIG as unknown as Record<string, unknown>;
  const keep = { costing: cfg['costing'], jobs_per_year: cfg['jobs_per_year'], enabled: cfg['enabled'] };
  cfg['costing'] = JOB_ECONOMICS_COSTING;
  if (Object.hasOwn(over, 'jobs_per_year')) cfg['jobs_per_year'] = over.jobs_per_year;
  if (Object.hasOwn(over, 'enabled')) cfg['enabled'] = over.enabled;
  try {
    return fn();
  } finally {
    cfg['costing'] = keep.costing; cfg['jobs_per_year'] = keep.jobs_per_year; cfg['enabled'] = keep.enabled;
  }
}

/**
 * CB_GATE.assess on the fee that would actually go out, with phase9's costing injected. `fee` in POUNDS.
 * A fee that is not a positive number ("not sure" and absent alike), an unknown sector, supported living and an
 * unusable volume all come back UNDETERMINED, by the engine's own lines. Never throws.
 */
export function feeGate(fee: unknown, sector: unknown, over: GateOverrides = {}): FeeGateReading {
  const g = withGateCosting(over, () => GATE.assess({ fee, sector }));
  return { ...g, placeholder_caveat: GATE_PLACEHOLDER_CAVEAT, costing_loaded: gateCostingLoaded() };
}

/**
 * CB_FEE.display with the sector and the costing — the engine's whole quote: `render` false and `reason` the
 * engine's "we will come back to you with a price" where the gate withholds it, the gate, and the no-claim threshold.
 */
export function feeQuote(
  allowances: number | null, taxRate: number | null, ctx: BenefitContext & { sector?: unknown }, over: GateOverrides = {},
): FeeDisplay & { readonly placeholder_caveat: string } {
  const fn = (FEE as { display?: unknown }).display as
    (a: number | null, t: number | null, c: BenefitContext & { sector?: unknown }) => FeeDisplay;
  return { ...withGateCosting(over, () => fn(allowances, taxRate, ctx)), placeholder_caveat: GATE_PLACEHOLDER_CAVEAT };
}

/** The disposal fee as the job cost model states it (`disposalFee`), read when asked: the claim record names it
 *  (src/modules/claims/claim-record.ts, DISPOSAL_FEE) and restates nothing. */
export function jobEconomicsDisposalFee(): unknown {
  return (createRequire(import.meta.url)('./costing/job-economics.cjs') as { disposalFee: () => unknown }).disposalFee();
}
