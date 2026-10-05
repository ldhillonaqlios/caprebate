/**
 * THE PAID LOOKUPS — WHICH CONNECTOR ANSWERS WHICH, WHAT IT IS ASKED, AND WHAT ONE CLICK OF THEM COSTS.
 * Phase 146d, 23 September 2026. The twin of src/connectors/free-registers.ts, and every one SWITCHED OFF.
 *
 *   HOMEDATA_ADDRESS   the paid address lookup — a UPRN, an address, a postcode and coordinates, plus the penny
 *                      title pre-check                                          src/connectors/homedata.ts
 *   HMLR_TITLE         HM Land Registry's title register, about £7 a title      src/connectors/hmlr-title.ts
 *                      RETIRED FROM THE CLICK BY PHASE 146k (25 September 2026): Lakhbir decided the title register is
 *                      looked up by hand, and took the Business Gateway details out of the key file. It is in
 *                      `PAID_RETIRED` below, not in `PAID_CONNECTORS`, and src/web/title-by-hand.ts is where a person
 *                      records what the official copy says.
 *   HOMEDATA_PLANNING  planning by UPRN — built beside PlanIt, not chosen, and not a row on the research panel
 *                                                                               src/connectors/homedata-planning.ts
 *
 * THE ORDER IS NOT A PREFERENCE, IT IS A DEPENDENCY. The address lookup runs first because everything after it is
 * keyed on the UPRN it returns and on the penny pre-check it makes: the title register uses the pre-check to decide
 * whether £7 is worth spending, and the paid planning route has no key at all without a UPRN. A click that runs them
 * in any other order spends more and finds less.
 *
 * THE GATE IS NOT HERE, AND THERE IS NO SECOND ONE. `consultAllowed` in src/web/research.ts hands a connector a
 * lookup only after `stateUnderGates` has allowed it, and for a paid source that means a signed engagement asserted
 * server-side — `assertSignedEngagement`, which since Phase 146f reads the signature RECORD and not merely a letter
 * marked SIGNED. Then the source's own switch, then its key. Every one of those is off or absent today, so a click
 * contacts nobody.
 */

import type { RegisterConnector, Bundle } from './registers.ts';
import { CALL_POLICIES } from './sources.ts';
import { nationOf, type ResearchSubject } from './nations.ts';
import { homedataAddress, homedataCostPence, homedataSlugs, type HomedataQuery } from './homedata.ts';
import { hmlrTitle, type TitleQuery } from './hmlr-title.ts';
import { homedataPlanning, PLANNING_HISTORY_TOKENS, type HomedataPlanningQuery } from './homedata-planning.ts';

type Built<Q> = {
  readonly connector: RegisterConnector<Q>;
  readonly query: (subject: ResearchSubject, earlier: ReadonlyMap<string, Bundle>) => Q;
  /**
   * WHAT ONE RUN OF THIS LOOKUP COSTS BEFORE IT IS MADE, in pence — the figure the screen shows BEFORE the click.
   * It is a price list, and it is labelled as one: the figure shown AFTER the click is the supplier's own, off the
   * response (`cost_pence` with `cost_basis: 'supplier'` on the audit row), never this number carried forward.
   */
  readonly before_pence: number;
};

function built<Q>(b: Built<Q>): Built<unknown> { return b as unknown as Built<unknown>; }

/** The UPRN the paid address lookup found on this click, if it ran and matched. */
export function uprnFrom(earlier: ReadonlyMap<string, Bundle>): string | null {
  const v = earlier.get('HOMEDATA_ADDRESS')?.facts['uprn'];
  return typeof v === 'string' && v !== '' ? v : null;
}

/** What the penny pre-check found on this click, if it ran. Null means it did not — which is not "no title". */
export function preCheckFrom(earlier: ReadonlyMap<string, Bundle>): { has_title: boolean; title_number: string | null } | null {
  const v = earlier.get('HOMEDATA_ADDRESS')?.facts['title_pre_check'];
  if (v === null || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  return {
    has_title: o['has_title'] === true,
    title_number: typeof o['title_number'] === 'string' ? o['title_number'] : null,
  };
}

export const PAID_CONNECTORS: Readonly<Record<string, Built<unknown>>> = Object.freeze({
  HOMEDATA_ADDRESS: built<HomedataQuery>({
    connector: homedataAddress,
    query: (s) => ({ property: s.property }),
    before_pence: homedataCostPence(homedataSlugs()),
  }),
});

/**
 * PHASE 146k — RETIRED, NOT DELETED. HM Land Registry's title register is looked up BY HAND (Lakhbir, 25 September
 * 2026), and the Business Gateway user name, password and certificate are no longer in the key file or in
 * secrets.example.env. So no click runs this, and switching `REGISTER_SWITCHES.HMLR_TITLE` on changes nothing: a source
 * in neither map has no connector in this build. The code and its recorded-answer tests stay, so that reversing the
 * decision is putting this entry back in the map above and the four key names back in src/secrets.ts — not a rewrite.
 */
export const PAID_RETIRED: Readonly<Record<string, Built<unknown>>> = Object.freeze({
  HMLR_TITLE: built<TitleQuery>({
    connector: hmlrTitle,
    query: (s, e) => ({ property: s.property, nation: nationOf(s, e), pre_check: preCheckFrom(e) }),
    before_pence: CALL_POLICIES['HMLR_TITLE']?.cost_pence ?? 0,
  }),
});

/**
 * BUILT, SWITCHED OFF, AND DELIBERATELY NOT IN THE MAP ABOVE.
 *
 * `PAID_CONNECTORS` is what a click runs. This one is not in it because PlanIt remains the source of record for
 * planning and a click must not run two connectors for one register source — that would buy an answer we already
 * have for nothing, and write two provenance records for one fact. It is exported so that turning it on is a real
 * one-line change rather than a rewrite, and so a test can prove it is built and off.
 */
export const PAID_NOT_CHOSEN: Readonly<Record<string, Built<unknown>>> = Object.freeze({
  HOMEDATA_PLANNING: built<HomedataPlanningQuery>({
    connector: homedataPlanning,
    query: (s, e) => ({ nation: nationOf(s, e), uprn: uprnFrom(e) }),
    before_pence: PLANNING_HISTORY_TOKENS,
  }),
});

/** The order a click runs the paid lookups in. The address lookup first; everything else is keyed on what it found. */
export const PAID_ORDER: readonly string[] = Object.freeze(Object.keys(PAID_CONNECTORS));

/**
 * WHAT THE WHOLE CLICK WOULD COST, IN PENCE, BEFORE IT IS MADE — for the sources named, counting only the ones that
 * are switched on, because a lookup that is off spends nothing. Item 3 of this phase: show the total before the
 * click. The figure after it comes from the calls themselves.
 */
export function totalBeforePence(source_ids: readonly string[], on: (source_id: string) => boolean): number {
  return source_ids.reduce((n, id) => {
    const b = PAID_CONNECTORS[id];
    return b === undefined || !on(id) ? n : n + b.before_pence;
  }, 0);
}

/** Pence as a person reads it: "8p", "£7.00", "£7.08". */
export function pounds(pence: number): string {
  return pence < 100 ? `${pence}p` : `£${(pence / 100).toFixed(2)}`;
}
