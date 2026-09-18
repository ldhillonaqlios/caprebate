/**
 * Caprebate — THE WIRING. Postcode in, location_key out, LEG-E4 still off.
 *
 * Board item 12993800139, Phase 110, 9 September 2026.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * WHAT WAS MISSING, AND IT WAS NOT CODE
 *
 * Two finished modules had never been introduced to each other.
 *
 *   `caprebate-postcode-authority.ts` turns a postcode into a council area,
 *   and then into a `location_key` — 38 assertions, run end to end against
 *   the real 2.7 million-row ONS file on 8 September 2026.
 *
 *   `caprebate-cost-model.cjs` LEG-E4 consumes `input.location_key` and
 *   refuses without one.
 *
 * NOTHING CALLED THE FIRST AND NOTHING SUPPLIED THE SECOND. This file is the
 * seam, and it is the only one: `grep -rn "resolveLocationKey" ` outside the
 * resolver's own tests should return this file and nothing else.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * IT STOPS AT THE PRICE BOOK, ON PURPOSE
 *
 * The chain is postcode -> council area -> the price book's own regional key
 * -> the factor. The LAST link is empty and stays empty: `CB_LAD_TO_LOCATION_KEY`
 * waits on a GBP 330 purchase (board item 12804374406), and the resolver
 * already refuses there with E_LOCATION_KEY_TABLE_NOT_LOADED and a message
 * naming which half is solved. THAT REFUSAL IS NOT RE-IMPLEMENTED HERE. It is
 * called, and its error is allowed out unchanged.
 *
 * `leg_e4_location_and_contract_size` SHIPS FALSE AND STAYS FALSE. This file
 * does not turn it on, cannot turn it on, and has no switch of its own.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * THE ONE THING A WIRING CHANGE COULD BREAK, AND HOW IT IS PREVENTED
 *
 * With the gate off, LEG-E4 returns a factor of 1.0 with `applied: false` —
 * correct, documented, and the whole reason the module is safe to have in the
 * tree. With the gate ON and no location_key, it must REFUSE.
 *
 * A wiring layer is exactly where those two get confused: catch the resolver's
 * refusal, hand the cost model no key, and a gate-on run quietly produces the
 * gate-off answer. A 1.0 nobody chose, in a claim.
 *
 * SO THIS FILE NEVER DECIDES WHICH OF THE TWO IT IS IN. It asks the cost
 * model's own `gateOn` — exported for this, so the opts.gates override every
 * test uses is honoured — and:
 *
 *   gate OFF -> it returns `locationAndContractSizeFactor`'s OWN gate-off
 *               object, produced by that function, unmodified. No postcode is
 *               resolved, because nothing would be done with the answer. The
 *               1.0 comes from the module that owns the rule and this file
 *               cannot have invented it.
 *   gate ON  -> the postcode is resolved and EVERY failure is rethrown. There
 *               is no catch, no fallback and no default key anywhere below.
 *
 * H1 to H4 in the test file hold that down, including by turning the gate on
 * over a fixture and asserting the throw.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * THE JURISDICTION REFUSAL, WHICH IS WHERE OPTION (c) WENT
 *
 * Phase 110's first job offered "trim the table to England and Wales" as a
 * storage option. Measured, it saves 4% of the heap — see
 * caprebate-postcode-store.ts. But the CORRECTNESS point inside it is real
 * and survives: a Scottish postcode must refuse as OUTSIDE THE SERVED
 * JURISDICTION, not as "not in table", because those two sentences send the
 * reader to two different places.
 *
 * So the refusal lives here and the data is left whole. THE SERVED SET IS NOT
 * DEFINED IN THIS FILE. It is passed in, because it already exists exactly
 * once — `CB_JURIS.SERVED` in the engine — and Lakhbir flips it. A copy here
 * would be a second place to change, and the day Scotland is switched on the
 * two would disagree and the client would be refused by the older one.
 *
 * NO SERVED SET SUPPLIED MEANS NO JURISDICTION CHECK, which is deliberate:
 * the resolver's own suite asserts that a Scottish postcode still resolves,
 * because that assertion is about the ONS LICENCE (Scotland is inside the
 * grant; Northern Ireland is not) and has nothing to do with our coverage.
 * The two must not be allowed to become one check.
 *
 * Runs on Node >= 22.6 with type stripping.
 * Run:  cd phase9 && node --test caprebate-location-key.test.ts
 */

import {
  resolveBillingAuthority,
  resolveLocationKey,
  PostcodeAuthorityError,
} from './caprebate-postcode-authority.ts';
import type {
  BillingAuthority,
  ResolverOptions,
} from './caprebate-postcode-authority.ts';
import { freshnessOf, ONS_TABLE_STALE_FLAG } from './caprebate-postcode-store.ts';
import type { Freshness, PostcodeStore } from './caprebate-postcode-store.ts';
import COST_MODEL from './caprebate-cost-model.cjs';

/* ------------------------------------------------------------------ *
 * 1. The served set — supplied, never defined here
 * ------------------------------------------------------------------ */

/**
 * The four nations, keyed the way CB_JURIS keys them. A caller builds this
 * from `CB_JURIS.SERVED` and passes it; see `09-app/backend/src/web/postcode.ts`,
 * which is the only place in the application that does.
 */
export type ServedSet = {
  readonly england: boolean;
  readonly wales: boolean;
  readonly scotland: boolean;
  readonly ni: boolean;
};

export type Nation = keyof ServedSet;

const NATION_LABEL: Readonly<Record<Nation, string>> = Object.freeze({
  england: 'England', wales: 'Wales',
  scotland: 'Scotland', ni: 'Northern Ireland',
});

/**
 * The first letter of a GSS code is the country, and it is the same letter
 * whether it arrives as a country code (`E92000001`), a region pseudo-code
 * (`S99999999`) or a bare `E`. That is why the resolver keeps `country_code`
 * even when NSPL gives no country column: it falls back to the first letter
 * of the local authority code, which carries the same fact.
 */
export function nationOf(authority: Pick<BillingAuthority, 'country_code' | 'lad_code'>): Nation | null {
  const letter = ((authority.country_code || authority.lad_code || '').trim()[0] || '').toUpperCase();
  if (letter === 'E') return 'england';
  if (letter === 'W') return 'wales';
  if (letter === 'S') return 'scotland';
  if (letter === 'N') return 'ni';
  return null;
}

export type LocationKeyErrorCode =
  | 'E_OUTSIDE_SERVED_JURISDICTION'
  | 'E_NATION_NOT_DERIVABLE'
  | 'E_ONS_TABLE_EXPIRED';

export class LocationKeyError extends Error {
  code: LocationKeyErrorCode;
  detail: Record<string, unknown>;
  constructor(code: LocationKeyErrorCode, message: string, detail: Record<string, unknown> = {}) {
    super(`[${code}] ${message}`);
    this.name = 'LocationKeyError';
    this.code = code;
    this.detail = detail;
  }
}

/* ------------------------------------------------------------------ *
 * 2. Resolving, with the jurisdiction and the staleness policy applied
 * ------------------------------------------------------------------ */

export type ResolveDeps = ResolverOptions & {
  /** From CB_JURIS.SERVED. Omitted = no jurisdiction check; see the header. */
  served?: ServedSet;
  /** For the staleness policy. Omitted = the policy does not run. */
  asAt?: Date;
};

/**
 * Postcode -> council area, with the two things the raw resolver deliberately
 * does not know about: whether we serve that part of the UK, and whether the
 * table is too old to be relied on.
 *
 * THE ORDER OF THE REFUSALS IS THE DESIGN.
 *
 *   1. Expiry, BEFORE the lookup. An expired table can name a council that no
 *      longer exists, and it does it with no error at all — so the check has
 *      to come before an answer is produced rather than as a flag on one.
 *   2. Everything the resolver already does: the Northern Ireland licence
 *      refusal (which is about the LICENCE, not our coverage), normalisation,
 *      the table lookup, the terminated-postcode rule.
 *   3. Jurisdiction, AFTER the lookup, because it needs the council area to
 *      know which nation the property is in. A postcode-prefix guess would be
 *      a second geography and would be wrong at the borders.
 *
 * STALENESS IS A FLAG, NOT A REFUSAL, and it travels in the same `flags`
 * array the terminated-postcode flag uses — so it reaches whatever consumes
 * the answer by the same route the ONS attribution lines do, rather than
 * sitting in a log nobody reads.
 */
export function resolveServedAuthority(
  rawPostcode: unknown,
  deps: ResolveDeps = {},
): { authority: BillingAuthority; freshness: Freshness | null; nation: Nation } {
  const store = deps.store as PostcodeStore | undefined;

  let freshness: Freshness | null = null;
  if (deps.asAt !== undefined && store !== undefined) {
    freshness = freshnessOf(store, deps.asAt);
    if (freshness.state === 'expired') {
      throw new LocationKeyError('E_ONS_TABLE_EXPIRED', freshness.message, {
        verified_at: freshness.verified_at, age_days: freshness.age_days,
        release: freshness.release,
      });
    }
  }

  const resolved = resolveBillingAuthority(rawPostcode, deps);

  const nation = nationOf(resolved);
  if (nation === null) {
    throw new LocationKeyError(
      'E_NATION_NOT_DERIVABLE',
      `resolved '${resolved.postcode}' to ${resolved.lad_name} (${resolved.lad_code}), but ` +
        'the code does not begin E, W, S or N so which part of the UK it is in cannot ' +
        'be derived. Refusing rather than assuming England.',
      { postcode: resolved.postcode, lad_code: resolved.lad_code },
    );
  }

  if (deps.served !== undefined && deps.served[nation] !== true) {
    const servedNames = (Object.keys(deps.served) as Nation[])
      .filter((n) => deps.served![n]).map((n) => NATION_LABEL[n]);
    throw new LocationKeyError(
      'E_OUTSIDE_SERVED_JURISDICTION',
      `'${resolved.postcode}' is in ${NATION_LABEL[nation]}, which is OUTSIDE THE PART OF ` +
        'THE UK THIS SERVICE COVERS' +
        (servedNames.length ? ` (currently ${servedNames.join(', ')})` : '') +
        '. This is not a gap in the postcode table — the postcode resolved perfectly, to ' +
        `${resolved.lad_name}. It is a statement about our own coverage, it lives in ` +
        'CB_JURIS, and capital allowances are a UK-wide tax so the claim itself is just ' +
        'as real there. Route the client rather than telling them we have no record.',
      { postcode: resolved.postcode, nation, lad_name: resolved.lad_name, served: servedNames },
    );
  }

  const authority: BillingAuthority = freshness !== null && freshness.flags.length > 0
    ? { ...resolved, flags: [...resolved.flags, ...freshness.flags] }
    : resolved;

  return { authority, freshness, nation };
}

/**
 * The full chain, ending where the price book begins.
 *
 * The last link is `resolveLocationKey`'s and it is CALLED, not copied — so
 * E_LOCATION_KEY_TABLE_NOT_LOADED comes out of the module that owns it, with
 * the message that already names which half of LEG-E4 is solved and which
 * half is a purchase order.
 */
export function locationKeyFor(
  rawPostcode: unknown,
  deps: ResolveDeps = {},
): { location_key: string; authority: BillingAuthority; freshness: Freshness | null } {
  const { authority, freshness } = resolveServedAuthority(rawPostcode, deps);
  const { location_key } = resolveLocationKey(authority.postcode, deps);
  return { location_key, authority, freshness };
}

/* ------------------------------------------------------------------ *
 * 3. The LEG-E4 seam
 * ------------------------------------------------------------------ */

type CostModel = {
  gateOn: (name: string, opts?: unknown) => boolean;
  locationAndContractSizeFactor: (input: unknown, opts?: unknown) => Record<string, unknown>;
};
const CM = COST_MODEL as unknown as CostModel;

export const LEG_E4_GATE = 'leg_e4_location_and_contract_size';

/**
 * LEG-E4, given a postcode instead of a location_key. THIS IS THE WIRING.
 *
 * Read the header before changing anything here. The gate-off branch returns
 * the cost model's own object and resolves nothing; the gate-on branch
 * resolves and rethrows every failure. There is no third branch and there must
 * not be one — a `try` round the resolution would be exactly the bug the
 * header describes.
 */
export function locationFactorForPostcode(
  rawPostcode: unknown,
  input: Record<string, unknown> = {},
  deps: ResolveDeps & { gates?: Record<string, boolean>; tables?: unknown } = {},
): Record<string, unknown> {
  if (!CM.gateOn(LEG_E4_GATE, deps)) {
    /* The gate-off answer, produced by the module that owns the rule. The
       postcode is not resolved: with the gate off the answer is 1.0 whatever
       it says, and resolving it anyway would be a lookup done for nothing. */
    return CM.locationAndContractSizeFactor({ ...input, location_key: undefined }, deps);
  }
  const { location_key, authority, freshness } = locationKeyFor(rawPostcode, deps);
  const factor = CM.locationAndContractSizeFactor({ ...input, location_key }, deps);
  return {
    ...factor,
    postcode: authority.postcode,
    lad_code: authority.lad_code,
    lad_name: authority.lad_name,
    attribution: authority.attribution,
    flags: ([] as string[]).concat(
      (factor.flags as string[]) || [],
      authority.flags.includes(ONS_TABLE_STALE_FLAG) ? [ONS_TABLE_STALE_FLAG] : [],
    ),
    ons_release: freshness === null ? null : freshness.release,
  };
}

/* ------------------------------------------------------------------ *
 * 4. Saying WHY, without producing a factor
 * ------------------------------------------------------------------ */

/**
 * FOR A SCREEN, AND IT CANNOT BE MISTAKEN FOR AN ANSWER.
 *
 * The back office needs to show an operator why LEG-E4 is off and which of
 * the several things standing in the way applies to THIS property. That is a
 * real need and it is also how a "helpful" catch gets written into the wiring
 * above. So the explanation is a separate function that returns prose and a
 * code and NEVER a factor, a key or a number.
 */
export function explainLocationKey(
  rawPostcode: unknown,
  deps: ResolveDeps = {},
): { readonly ok: boolean; readonly code: string | null; readonly message: string } {
  try {
    const { location_key } = locationKeyFor(rawPostcode, deps);
    return { ok: true, code: null, message: `resolves to location key '${location_key}'.` };
  } catch (e) {
    if (e instanceof LocationKeyError || e instanceof PostcodeAuthorityError) {
      return { ok: false, code: e.code, message: e.message };
    }
    throw e;
  }
}
