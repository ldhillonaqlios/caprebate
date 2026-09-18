/* =============================================================================
   @caprebate/engine — PUBLIC API                            Phase 102, Block A

   Block A of the Developer Build Order. The estimate engine, lifted out of the
   740KB site file so that the website, the back end and the developer spec can
   all use the same one.

   WHAT THIS IS
     Facts in, estimate out. No network, no DOM, no storage, no secrets — those
     are requirements, they are asserted by tools/verify-extraction.cjs, and the
     regression harness runs against this package and against the site file and
     must produce the same totals from both.

   WHAT THIS IS NOT
     It is not a rewrite. The tax logic in src/generated/ is a byte-for-byte
     slice of "Caprebate site.html". To change a tax answer, change the site and
     re-run tools/extract.cjs — never edit the generated files.

   THE TWO GATES ARE SHUT AND STAY SHUT
     Free register lookups wait on a published privacy notice
     (CB_REGISTRY.precondition.enabled === false). Paid lookups wait on a signed
     engagement asserted server-side plus one operator click. Neither belongs to
     this package: it makes no calls at all. Do not open either to make a screen
     flow work.
   ============================================================================= */

import * as SHARED from "./generated/shared.js";

/* -----------------------------------------------------------------------------
   WHY DEFAULT IMPORTS AND NOT `import x = require(...)`   (Phase 104, 8 Sep 2026)

   These five lines used TypeScript's import-equals form. It type-checked, and
   tools/verify-extraction.cjs was green, because NOTHING HAD EVER IMPORTED THIS
   PACKAGE AT RUNTIME — the same shape of defect as the upload handler that had
   38 passing tests and no consumer. Phase 104 is the first caller, and Node
   refused the package outright:

     SyntaxError [ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX]:
     TypeScript import equals declaration is not supported in strip-only mode

   Every other package here runs .ts directly under Node's type stripping
   (`node src/server.ts`, `node --test test/*.test.ts`), so a package consumable
   only after a tsc build is a package the back end cannot use.

   A DEFAULT IMPORT WORKS IN BOTH WORLDS and is the smallest change that does.
   The generated files are CommonJS with `module.exports = {...}` and their
   hand-written .d.ts files use `export =`; under `esModuleInterop` tsc resolves
   a default import of those to the exported object, and Node resolves the
   default export of a CommonJS module to `module.exports`. Same object either
   way. Nothing in src/generated/ is touched — it stays the byte-for-byte slice.
   ----------------------------------------------------------------------------- */
import careHomes from "./generated/sector-care_homes.js";
import dental from "./generated/sector-dental.js";
import supportedLiving from "./generated/sector-supported_living.js";
import gp from "./generated/sector-gp.js";
import privateHospital from "./generated/sector-private_hospital.js";

import type {
  Session, SectorId, SectorEngine, EngineResult, Question,
} from "./types.js";

export type {
  Session, SectorId, SectorEngine, EngineResult, Question,
  AiaHeadroom, TriggerKind, Range, MaybeRange, Outcome, CashRoute,
  GateState, CashGates, PoolBasis, PoolSplit, CtaSwitches,
  RegistryPrecondition,
} from "./types.js";
export type { DerivedSessionFacts } from "./generated/session.js";

/** The five sector engines, by id. */
export const SECTORS: Readonly<Record<SectorId, SectorEngine>> = Object.freeze({
  care_homes: careHomes,
  dental: dental,
  supported_living: supportedLiving,
  gp: gp,
  private_hospital: privateHospital,
});

/** Every sector id, in the order the flows were built. */
export const SECTOR_IDS: readonly SectorId[] = Object.freeze([
  "care_homes", "dental", "supported_living", "gp", "private_hospital",
] as const);

/** The shared CB_ layer, as the site declares it. */
export const CB = SHARED;

/**
 * A session with only the four working fields the engine writes to.
 *
 * IT SETS NO FACTS. Not one. Every fact starts ABSENT, because absent is what
 * "nobody asked" has to look like — see non-negotiable N4. A convenience that
 * seeded `aia_headroom` or `sufficient_profit` with a plausible default would
 * hand the client a favourable answer nobody established.
 */
export function newSession(sector: SectorId): Session {
  return { sector, trigger: [], flags: [], assumptions: [], lrr: false };
}

/** Look a sector engine up by id. Throws on an unknown id rather than guessing one. */
export function getSector(sector: SectorId): SectorEngine {
  const engine = SECTORS[sector];
  if (!engine) {
    throw new Error(
      "@caprebate/engine: no such sector " + JSON.stringify(sector) +
      ". Known sectors: " + SECTOR_IDS.join(", "),
    );
  }
  return engine;
}

/**
 * Run the estimate for one session.
 *
 * The sector comes from the ARGUMENT, not from `session.sector`: the two can
 * legitimately disagree while a flow is re-routing a client from one sector to
 * another, and silently preferring one over the other would pick a sector for
 * reasons the caller cannot see.
 */
export function estimate(sector: SectorId, session: Session): EngineResult {
  return getSector(sector).runEngine(session);
}

/** The question list for one sector, in flow order. */
export function questions(sector: SectorId): readonly Question[] {
  return getSector(sector).Q;
}
