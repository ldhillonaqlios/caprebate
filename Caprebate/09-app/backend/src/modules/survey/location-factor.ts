/**
 * LEG-E4, GIVEN A POSTCODE: THE SURVEY'S COST MODEL FED A LOCATION KEY. Moved from
 * src/integrations/postcodes/location-key.ts, text unchanged: the outside services resolve the postcode
 * (locationKeyFor) and this file, beside the cost model (./costing/cost-model.cjs), owns the gate and the factor. Read
 * the header of location-key.ts before changing anything here.
 */
import COST_MODEL from './costing/cost-model.cjs';
import { locationKeyFor, ONS_TABLE_STALE_FLAG, type ResolveDeps } from '../../integrations/index.ts';

/* ------------------------------------------------------------------ *
 * The LEG-E4 seam
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
