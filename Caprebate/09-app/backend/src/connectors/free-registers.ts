/**
 * THE FREE REGISTERS — WHICH CONNECTOR ANSWERS WHICH LOOKUP, WHAT IT IS ASKED, AND WHAT ITS ANSWER MEANS TO THE
 * ESTIMATE. Phase 146c, 23 September 2026.
 *
 * Six connectors, each built against the supplier's own published documentation (the dates and addresses are in the
 * source register, 04-phase-work/phase3/caprebate-source-register.ts, `SUPPLIER_DOCS`), each tested on recorded
 * answers, and EVERY ONE SWITCHED OFF (REGISTER_SWITCHES in src/connectors/registers.ts):
 *
 *   CH_COMPANY    Companies House: search, company profile, filing history      src/connectors/companies-house.ts
 *   CH_PSC        Companies House: people with significant control — ONLY after a signed engagement (CA2)
 *   CQC           the Care Quality Commission: locations and providers (England) src/connectors/cqc.ts
 *   EPC           energy certificates: non-domestic and display, and domestic for supported living   src/connectors/epc.ts
 *   HMLR_PPD      HM Land Registry sale prices — residential only, so supported living only          src/connectors/price-paid.ts
 *   PLANNING      planning.data.gov.uk and PlanIt                                 src/connectors/planning.ts
 *   ONS_POSTCODE  the ONS postcode table, read on this server — no call outside  src/connectors/postcode.ts
 *
 * THE GATES ARE NOT HERE. `consultAllowed` in src/web/research.ts hands a connector a lookup only after
 * `stateUnderGates` has allowed it; while CB_REGISTRY.precondition is false that is never. A connector then checks its
 * own switch and its key (`runConnector`), and a typed address or name must MATCH (src/connectors/matching.ts) before
 * anything is kept. Anything short of that leaves the question asked (N4).
 *
 * NOT BUILT, AND SAYING SO: the Welsh care regulator (Care Inspectorate Wales) and the Scottish one (the Care
 * Inspectorate) — `NOT_BUILT` below; and the valuation office, which we hold no licence for.
 *
 * THE PAID LOOKUPS ARE NOW BUILT, and they live in their own map: PAID_CONNECTORS in src/connectors/paid-registers.ts
 * (Phase 146d). `consultAllowed` reads both maps. They are separate because the two tiers are gated differently — a
 * free lookup waits on a published privacy notice, a paid one on a signed engagement and an operator's click — and
 * putting them in one map would make the two look like one kind of thing with a flag on it.
 */

import type { RegisterConnector, Bundle } from './registers.ts';
import type { PostcodeStore } from '../web/postcode-port.ts';
import { nationOf, type ResearchSubject } from './nations.ts';
import { companiesHouse, companiesHousePsc, type CompanyQuery, type PscQuery } from './companies-house.ts';
import { cqc, type CqcQuery } from './cqc.ts';
import { epc, type EpcQuery } from './epc.ts';
import { pricePaid, type PricePaidQuery } from './price-paid.ts';
import { planning, type PlanningQuery } from './planning.ts';
import { onsPostcode, type PostcodeQuery } from './postcode.ts';

/* ================================================================== *
 * 1 · WHAT A LOOKUP IS ASKED ABOUT
 * ================================================================== */

export { researchSubject, nationOf, jurisSource, type Nation, type TypedProperty, type ResearchSubject } from './nations.ts';

/* ================================================================== *
 * 2 · THE CONNECTOR FOR EACH LOOKUP, AND ITS QUERY
 * ================================================================== */

type Built<Q> = {
  readonly connector: RegisterConnector<Q>;
  /** What to ask, from the client's record and what earlier lookups on this click found. */
  readonly query: (subject: ResearchSubject, earlier: ReadonlyMap<string, Bundle>, store: PostcodeStore | null) => Q;
};

function built<Q>(b: Built<Q>): Built<unknown> { return b as unknown as Built<unknown>; }

/**
 * EVERY FREE LOOKUP WITH A CONNECTOR, IN THE ORDER A CLICK RUNS THEM: the postcode table first, because its answer says
 * which part of the UK a property is in when nobody recorded it; Companies House's company before its people with
 * significant control, because the second needs the first's company number.
 */
export const FREE_CONNECTORS: Readonly<Record<string, Built<unknown>>> = Object.freeze({
  ONS_POSTCODE: built<PostcodeQuery>({ connector: onsPostcode, query: (s, _e, store) => ({ postcode: s.property?.postcode ?? null, store }) }),
  CH_COMPANY: built<CompanyQuery>({ connector: companiesHouse, query: (s) => ({ name: s.name, company_number: s.company_number }) }),
  CH_PSC: built<PscQuery>({
    connector: companiesHousePsc,
    query: (s, e) => {
      const found = e.get('CH_COMPANY')?.facts['company_number'];
      return { company_number: s.company_number ?? (typeof found === 'string' ? found : null) };
    },
  }),
  CQC: built<CqcQuery>({
    connector: cqc,
    query: (s, e) => {
      const council = e.get('ONS_POSTCODE')?.facts['ons_lad_name'];
      const found = e.get('CH_COMPANY')?.facts['company_number'];
      return {
        property: s.property, nation: nationOf(s, e), sector: s.sector,
        council: typeof council === 'string' ? council : null,
        company_number: s.company_number ?? (typeof found === 'string' ? found : null),
      };
    },
  }),
  /* PHASE 146d, item 9: `uprn` is the paid address lookup's, where it ran first on this click and matched — it
     turns this lookup's address match into an exact one. It is absent on every click today, because that lookup is
     off and waits on a signed engagement in any case. */
  EPC: built<EpcQuery>({
    connector: epc,
    query: (s, e) => {
      const found = e.get('HOMEDATA_ADDRESS')?.facts['uprn'];
      return { property: s.property, nation: nationOf(s, e), sector: s.sector, uprn: typeof found === 'string' ? found : null };
    },
  }),
  HMLR_PPD: built<PricePaidQuery>({ connector: pricePaid, query: (s, e) => ({ property: s.property, nation: nationOf(s, e), sector: s.sector }) }),
  PLANNING: built<PlanningQuery>({ connector: planning, query: (s, e) => ({ property: s.property, nation: nationOf(s, e) }) }),
});

/** The order a click runs the lookups in: FREE_CONNECTORS's order first, then everything else as the catalogue lists it. */
export function runOrder(source_ids: readonly string[]): string[] {
  const first = Object.keys(FREE_CONNECTORS);
  return [...source_ids].sort((a, b) => {
    const ia = first.indexOf(a); const ib = first.indexOf(b);
    return (ia === -1 ? first.length : ia) - (ib === -1 ? first.length : ib);
  });
}

/**
 * WHAT THE RESEARCH PANEL SAYS FOR AN ALLOWED LOOKUP WITH NO CONNECTOR IN THIS BUILD. In plain words, because they
 * reach the panel. The paid lookups are not listed: their gate shuts first, and Phase 146d builds them.
 */
export const NOT_BUILT: Readonly<Record<string, string>> = Object.freeze({
  CIW: 'allowed, but there is no connector for the Welsh care regulator in this build, and none for the Scottish one. ' +
    'Neither publishes an API like the English regulator’s, so we ask the client instead. Nothing was contacted',
  VOA: 'allowed, but there is no connector for the valuation office in this build, because we do not hold its licence. ' +
    'Nothing was contacted',
  /* PHASE 150: the land boundary has its own connector, src/connectors/inspire.ts, which reads a whole council's file
     for one point. PHASE 151c: this button now runs it, as its own step for each property (src/web/site-area-run.ts),
     not as one lookup for the client — so this row points at the site area lines, which say what happened. */
  HMLR_INSPIRE: 'allowed. The land boundary is read for each property by its own step of this button, and the site area ' +
    'lines above say what happened. It is switched off. Nothing was contacted',
  /* PHASE 151: the free postcode check belongs to the address question the client answers, not to this button. */
  POSTCODES_IO: 'allowed, but the postcode check is made at the address question, when the client types their postcode, ' +
    'not by this button. It is switched off. Nothing was contacted',
});

/* ================================================================== *
 * 3 · WHAT A REGISTER'S FIELDS MEAN TO derive()
 *
 * `register_records` keeps each register's fields under the SOURCE REGISTER's names (epc_total_floor_area_m2 …);
 * CB_REGISTRY.derive() reads its own (floor_area_m2 …). This is the one table between them, and it maps ONLY a field
 * both sides permit: the left side is on the source's `permitted_fields` (and the name exclusion register keeps it),
 * the right side is on CB_REGISTRY.SOURCES[…].fields. test/phase146c.test.ts checks both, for every row.
 *
 * NOT MAPPED, ON PURPOSE: "what kind of business are you" (entity_type). Companies House says a company's type, but the
 * source register keeps no company-type field, so it stays asked. And a PSC's name feeds nothing here.
 * ================================================================== */

export const DERIVE_FIELD_OF: Readonly<Record<string, Readonly<Record<string, string>>>> = Object.freeze({
  EPC: Object.freeze({
    epc_total_floor_area_m2: 'floor_area_m2', epc_construction_age_band: 'construction_age_band', epc_property_type: 'building_type',
  }),
  CQC: Object.freeze({ service_types: 'service_type', beds_registered: 'bed_count' }),
  CH_COMPANY: Object.freeze({ incorporation_date: 'incorporation_date', accounts_year_end: 'year_end' }),
  HMLR_PPD: Object.freeze({ price_paid: 'price_paid', transaction_date: 'completion_date', tenure: 'tenure' }),
});
