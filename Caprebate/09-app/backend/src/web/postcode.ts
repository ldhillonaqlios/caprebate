/**
 * POSTCODE LOOKUP, AS THIS APPLICATION CONFIGURES IT.
 *
 * Phase 110, 9 September 2026. Board item 12993800139.
 *
 * The port next door re-exports the phase 9 modules unchanged. This file is
 * the small amount of wiring that is genuinely THIS APPLICATION'S: where the
 * store comes from, which parts of the UK we serve, and the one line that
 * changes when the data protection officer answers.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * THE STORE IS A DEPLOYMENT ARTEFACT AND IS ABSENT BY DEFAULT
 *
 * CAPREBATE_POSTCODE_DB names a SQLite file built by the ingest. There is no
 * default path, no bundled copy and no download-on-first-use: a 75 MB table
 * appearing in a repository or a container image by accident is exactly what
 * the module's own §9 forbids, and a runtime download would be the network
 * call the engine does not make.
 *
 * WITH NO STORE CONFIGURED EVERYTHING STILL WORKS AND NOTHING PRETENDS TO.
 * `postcodeStore()` returns null, every derived answer is withheld with a
 * reason, and no screen shows a council area it did not derive. That is the
 * shipped state today and it is expected to be the shipped state until
 * somebody runs the ingest — which takes an afternoon, costs nothing and
 * needs no licence.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * THE SERVED SET IS READ FROM CB_JURIS AND IS NOT RESTATED
 *
 * `CB_JURIS.SERVED` in the engine is the one place our operational coverage
 * is decided — England and Wales today, Phase 64 — and it is Lakhbir's to
 * flip rather than the tax adviser's. A copy here would be a second place to
 * change and the two would disagree on the day it moved.
 */

import { CB } from './engine.ts';
import {
  sqlitePostcodeStore,
  resolveServedAuthority,
  explainLocationKey,
  regionKeyOf,
  REGION_NOT_CAPTURED,
  REGION_SWITCHES,
} from './postcode-port.ts';
import type {
  PostcodeStore, ServedSet, BillingAuthority, SqliteOpen, RegionSwitches,
} from './postcode-port.ts';

/* ================================================================== *
 * 1. The served set, read from the engine
 * ================================================================== */

const NATIONS = ['england', 'wales', 'scotland', 'ni'] as const;

/**
 * CB_JURIS reaches TypeScript as `OpaqueModule` — a shape with no members —
 * which is the engine package's honest description of a module generated from
 * a browser IIFE. So it is read defensively and, if it cannot be read, THE
 * ANSWER IS THAT NOTHING IS SERVED rather than that everything is.
 *
 * Failing closed here is the right way round: a served set that wrongly said
 * "yes" would run a client through an assessment we cannot actually deliver
 * on, while one that wrongly said "no" shows them the referral screen, which
 * is a route rather than a refusal and is recoverable in one message.
 */
export function servedSet(): ServedSet {
  const j = CB.CB_JURIS as unknown as { SERVED?: Record<string, unknown> } | undefined;
  const served = j && typeof j === 'object' ? j.SERVED : undefined;
  const out = { england: false, wales: false, scotland: false, ni: false };
  if (served && typeof served === 'object') {
    for (const n of NATIONS) out[n] = (served as Record<string, unknown>)[n] === true;
  }
  return out;
}

/* ================================================================== *
 * 2. The store
 * ================================================================== */

let cached: PostcodeStore | null | undefined;

/**
 * Opened once and kept, because opening a SQLite file per request is the one
 * way to make a 7.5-microsecond lookup expensive.
 *
 * `open` is injected so a test can supply node:sqlite without this module
 * importing it, and so the store can be swapped for the in-memory adapter
 * without touching a caller.
 */
export function postcodeStore(
  env: Record<string, string | undefined> = process.env,
  open?: SqliteOpen,
): PostcodeStore | null {
  if (cached !== undefined) return cached;
  const path = env.CAPREBATE_POSTCODE_DB;
  if (path === undefined || path.trim() === '' || open === undefined) {
    cached = null;
    return null;
  }
  cached = sqlitePostcodeStore(open, path);
  return cached;
}

/** For tests, and for a deployment that swaps the file. */
export function setPostcodeStore(store: PostcodeStore | null): void { cached = store; }
export function resetPostcodeStore(): void { cached = undefined; }

/* ================================================================== *
 * 3. The gate, and the one line that changes
 * ================================================================== */

/**
 * DOES THE PERMISSION GATE APPLY TO THIS LOOKUP AT ALL?
 *
 * OPEN WITH THE DATA PROTECTION OFFICER, and it is not this file's to decide.
 * The question is in CAPREBATE QUESTIONS under the solicitor and DPO, with
 * our recommendation and the reasoning behind it.
 *
 * THE ARGUMENT FOR "NO GATE": `CB_REGISTRY.precondition` is justified on the
 * grounds that those lookups process information about IDENTIFIABLE PEOPLE —
 * the proprietor at HM Land Registry, persons of significant control at
 * Companies House. This one makes no external call at all, consults a static
 * published table, and reads the client's own postcode to derive a council
 * area. There is no third party's data anywhere in it.
 *
 * THERE IS NO SECOND GATE HERE AND THERE MUST NOT BE ONE. Standing rule
 * 13(b) is explicit. `POSTCODE_GATE.gated` is a single boolean that says
 * whether this lookup sits BEHIND the existing registry gate; it does not add
 * one. Answer "it is gated" and it flips to true and the lookup waits on the
 * published notice with everything else. Answer "it is not" and it stays
 * false. Either answer is this line.
 */
export const POSTCODE_GATE = Object.freeze({
  gated: false,
  question:
    'Does the permission gate apply to a council-area lookup with no personal data in it?',
  answered: false,
  note:
    'OPEN with the data protection officer. Until it is answered this stays false, ' +
    'which costs nothing: the table is not configured, so the lookup is inert either ' +
    'way. This is NOT a second gate — the only gate is CB_REGISTRY.precondition, and ' +
    'this boolean says whether this lookup sits behind it.',
});

/* ================================================================== *
 * 4. What the application actually asks for
 * ================================================================== */

export type ResolvedProperty = {
  readonly postcode: string | null;
  readonly authority: BillingAuthority | null;
  /** One of the thirteen price-book regions, or REGION_NOT_CAPTURED. */
  readonly region: string;
  readonly region_derived: boolean;
  /** Plain English. Empty when the region was derived. */
  readonly why: string;
};

/**
 * A property's postcode -> its council area and its region, or a reason.
 *
 * NEVER THROWS AND NEVER GUESSES. Every screen that wants this wants to
 * render something, and a resolver failure is information rather than an
 * error — "we do not serve Scotland yet" and "the table has not been
 * ingested" are both answers a person can act on, and neither is a region.
 */
export function resolveProperty(
  postcode: string | null,
  opts: { store?: PostcodeStore | null; asAt?: Date; regionSwitches?: RegionSwitches | null } = {},
): ResolvedProperty {
  const store = opts.store === undefined ? postcodeStore() : opts.store;
  if (postcode === null || postcode.trim() === '') {
    return {
      postcode: null, authority: null, region: REGION_NOT_CAPTURED, region_derived: false,
      why: 'no postcode is recorded for this property.',
    };
  }
  if (store === null) {
    return {
      postcode, authority: null, region: REGION_NOT_CAPTURED, region_derived: false,
      why: 'the ONS postcode table is not configured on this deployment, so a council ' +
           'area cannot be derived. The licence is cleared and the download is free — ' +
           'see the ONS postcode table refresh procedure.',
    };
  }
  if (POSTCODE_GATE.gated) {
    return {
      postcode, authority: null, region: REGION_NOT_CAPTURED, region_derived: false,
      why: 'this lookup is held behind the published-notice permission gate.',
    };
  }
  try {
    /* asAt is spread in only when supplied. Passing `asAt: undefined`
       explicitly is not the same as omitting it — the resolver treats an
       absent clock as "the staleness policy does not run", and under
       exactOptionalPropertyTypes the two are different types as well. */
    const { authority } = resolveServedAuthority(postcode, {
      store, served: servedSet(),
      ...(opts.asAt === undefined ? {} : { asAt: opts.asAt }),
    });
    /* PHASE 132f — THE REGION SWITCHES ARE PASSED, NOT DEFAULTED BY OMISSION. Phase 132e gave regionOf a switches
       argument (SURVEYOR_INNER_LONDON_ONS_FOURTEEN). This application passes the module's own REGION_SWITCHES,
       which ship it OFF: London still refuses, with the same code, message and detail as before. Only the boolean
       `true` turns it on, and turning it on is the surveyor's answer, not this file's; `opts.regionSwitches` exists
       so a test can prove the argument reaches the module. */
    const k = regionKeyOf(authority, opts.regionSwitches === undefined ? REGION_SWITCHES : opts.regionSwitches);
    return {
      postcode: authority.postcode, authority,
      region: k.region, region_derived: k.derived, why: k.why,
    };
  } catch (e) {
    return {
      postcode, authority: null, region: REGION_NOT_CAPTURED, region_derived: false,
      why: (e as Error).message,
    };
  }
}

/**
 * The LEG-E4 chain, for a screen that has to say why it is off. Re-exported
 * rather than re-implemented, with this application's store and served set
 * applied — and it returns prose and a code, never a factor.
 */
export function explainLocationFor(
  postcode: string | null,
  opts: { store?: PostcodeStore | null } = {},
): { readonly ok: boolean; readonly code: string | null; readonly message: string } {
  const store = opts.store === undefined ? postcodeStore() : opts.store;
  if (postcode === null || store === null) {
    return {
      ok: false, code: store === null ? 'E_TABLE_NOT_CONFIGURED' : 'E_NO_POSTCODE',
      message: store === null
        ? 'the ONS postcode table is not configured on this deployment.'
        : 'no postcode is recorded for this property.',
    };
  }
  return explainLocationKey(postcode, { store, served: servedSet() });
}
