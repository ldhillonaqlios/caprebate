/**
 * THE ONE PLACE THIS APPLICATION NAMES THE POSTCODE RESOLVER.
 *
 * Phase 110, 9 September 2026. The same seam, for the same reason, as
 * `upload-handler-port.ts`: `grep -rn "04-phase-work" src/` must return one
 * line per module and each of them must be here.
 *
 * `04-phase-work/phase9/caprebate-postcode-authority.ts` was built on
 * 8 September, proven against the real 2.7 million-row ONS download, and
 * called by NOTHING. This file is where that stops.
 *
 * NOTHING IS RE-EXPORTED WITH A DIFFERENT NAME OR A WIDER TYPE, and no rule
 * is re-implemented on the way through. A shim that "tidied" the port would
 * be a second specification of it.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * WHAT IS DELIBERATELY NOT HERE
 *
 * A TABLE. The store is 75 MB as a SQLite file and 290 MB as JSON, and it is
 * rebuilt from a free quarterly download — it is a DEPLOYMENT ARTEFACT, not
 * something this package carries, and `postcodeStore()` below returns null
 * until one is configured. Everything above it is written so that null is an
 * ordinary answer rather than a failure.
 *
 * A SECOND PERMISSION GATE. Standing rule 13(b): the free-register gate is
 * `CB_REGISTRY.precondition` and there must not be another. Whether it applies
 * to a council-area lookup with no personal data in it is an open question
 * with the data protection officer, and `POSTCODE_GATE` below is the single
 * line that changes when it is answered — either way.
 */

export {
  ONS_LICENCE,
  PostcodeAuthorityError,
  normalisePostcode,
  resolveBillingAuthority,
  resolveLocationKey,
  attributionFor,
  tableIsStale,
  ONS_TABLE_MAX_AGE_DAYS,
} from '../../../../04-phase-work/phase9/caprebate-postcode-authority.ts';

export type {
  BillingAuthority,
  PostcodeAuthorityRow,
  PostcodeAuthorityTable,
  PostcodeSource,
  ResolverOptions,
} from '../../../../04-phase-work/phase9/caprebate-postcode-authority.ts';

export {
  inMemoryPostcodeStore,
  sqlitePostcodeStore,
  buildSqliteStore,
  freshnessOf,
  ONS_TABLE_EXPIRY_DAYS,
  ONS_TABLE_STALE_FLAG,
} from '../../../../04-phase-work/phase9/caprebate-postcode-store.ts';

export type {
  PostcodeStore,
  Freshness,
  SqliteOpen,
} from '../../../../04-phase-work/phase9/caprebate-postcode-store.ts';

export {
  resolveServedAuthority,
  locationKeyFor,
  locationFactorForPostcode,
  explainLocationKey,
  nationOf,
  LocationKeyError,
  LEG_E4_GATE,
} from '../../../../04-phase-work/phase9/caprebate-location-key.ts';

export type {
  ServedSet,
  Nation,
  ResolveDeps,
} from '../../../../04-phase-work/phase9/caprebate-location-key.ts';

export {
  PRICE_BOOK_REGIONS,
  REGION_NOT_CAPTURED,
  RegionError,
  regionOf,
  regionKeyOf,
  /* Phase 132f: the region switches (Phase 132e). Passed explicitly by resolveProperty; the Inner London switch is OFF. */
  REGION_SWITCHES,
  SURVEYOR_INNER_LONDON_ONS_FOURTEEN,
} from '../../../../04-phase-work/phase9/caprebate-region.ts';

export type {
  PriceBookRegion,
  RegionErrorCode,
  RegionSwitches,
} from '../../../../04-phase-work/phase9/caprebate-region.ts';
