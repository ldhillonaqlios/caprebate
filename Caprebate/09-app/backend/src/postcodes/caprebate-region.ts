/**
 * Caprebate — COUNCIL AREA TO REGION, in the price book's own vocabulary.
 *
 * Board item 13004035199 job 3, deferred out of Phase 107a into Phase 110.
 * 9 September 2026.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * THE DEFECT
 *
 * A surveyor rate library entry is keyed on `surveyor :: field :: sector ::
 * region`, because a figure that is right in one part of the country is not
 * automatically right in another. Nothing in this application had a region to
 * give it, so every entry was keyed on the constant `REGION_NOT_CAPTURED` and
 * a surveyor's own figures were proposed back to them ACROSS THE WHOLE
 * COUNTRY. That was on the screen, not hidden, and it was wrong.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * A REGION IS NOT A BILLING AUTHORITY, WHICH IS WHY THIS FILE EXISTS
 *
 * `caprebate-postcode-authority.ts` returns a COUNCIL AREA — 352 of them.
 * Keying a rate library on that grain would mean a surveyor's figure from one
 * job almost never matching the next, which is worse than one national
 * bucket, not better. What is wanted is the grouping rates actually vary by,
 * and there is already a published one in use on this project: the THIRTEEN
 * REGIONS Spon's Architects' and Builders' 2024 uses for its location
 * factors, which the book itself calls "the economic planning regions".
 *
 * ─────────────────────────────────────────────────────────────────────────
 * WHAT IS TAKEN FROM THE PRICE BOOK, AND WHAT IS DELIBERATELY NOT
 *
 * TAKEN: thirteen region NAMES. A vocabulary, so that this project has one
 * regional grouping rather than three.
 *
 * NOT TAKEN: the factors. Not one of the thirteen numbers is in this file or
 * anywhere else in the engine. The three price-book PDFs are under a
 * provenance quarantine — FOR THE SURVEYOR, note of 6 September 2026: every
 * page of one of them prints a path inside the publisher's own corporate
 * storage, nobody has recorded how we came by it, and until that is explained
 * "no figure from any of these three files may reach a claim, a report or the
 * engine". The factors belong to LEG-E4 and to `CB_LOCATION_FACTORS`, which
 * ships empty against a GBP 330 purchase (board item 12804374406).
 *
 * AND THE MEMBERSHIP IS NOT THE BOOK'S EITHER. Which council sits in which
 * region is ONS geography, published under the Open Government Licence, and
 * NSPL carries it on every postcode row. So the mapping below is ONS data
 * wearing the book's thirteen labels — which is the honest description of it,
 * and it is the reason this work needed no purchase at all.
 *
 * THAT LAST POINT IS THE FINDING. Phase 107a deferred this job here on the
 * understanding that a region needed the price book. IT DOES NOT. The book
 * supplies the FACTORS; the region MEMBERSHIP is free. This is the same
 * mistake the postcode resolver itself found about LEG-E4 — an item recorded
 * as blocked on a purchase that was never what was standing in the way.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LONDON IS NOT RESOLVED, AND IT REFUSES RATHER THAN PICKING ONE
 *
 * Eleven of the thirteen map from ONS geography with no judgement at all.
 * The other two are Inner London and Outer London, and the book states two
 * different factors for them — 1.05 and 1.00, a 5% difference on a whole cost
 * plan. It does not say which boroughs are which, and there are TWO published
 * definitions of Inner London in ordinary use: the London Government Act 1963
 * one (twelve boroughs and the City) and the ONS statistical one (which adds
 * Haringey and Newham). Choosing between them is a valuation judgement worth
 * 5%, and it is a surveyor's, not ours.
 *
 * So a London council refuses with E_LONDON_INNER_OUTER_UNRESOLVED, and the
 * question is in CAPREBATE QUESTIONS. UNKNOWN IS NOT A BRANCH: a default of
 * Outer London would be the cheaper of the two and would look exactly like an
 * answer.
 *
 * Corrected 16 September 2026 (Phase 132e): "adds Haringey and Newham" was
 * half of the difference. The ONS list also LEAVES OUT Greenwich, which the
 * 1963 Act counts as Inner London. Both lists have fourteen names counting
 * the City; they share twelve. See section 2a.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * PHASE 132e, 16 SEPTEMBER 2026 — THE ONS FOURTEEN, BUILT AND SWITCHED OFF
 *
 * Someone typed an answer into the surveyor's answer box: use the ONS list of
 * fourteen. NOBODY SIGNED IT, and it was not written by a professional, so it
 * is an unsigned draft and not the surveyor's answer. Section 2a holds that
 * list behind SURVEYOR_INNER_LONDON_ONS_FOURTEEN, which is OFF. With it off, a
 * London council refuses exactly as it did before this phase, and the tests
 * prove that field by field. Only the surveyor's own answer turns it on.
 *
 * Runs on Node >= 22.6 with type stripping.
 * Run:  cd phase9 && node --test caprebate-region.test.ts
 */

import type { BillingAuthority } from './caprebate-postcode-authority.ts';

/* ------------------------------------------------------------------ *
 * 1. The vocabulary — thirteen names, no numbers
 * ------------------------------------------------------------------ */

/**
 * The thirteen, exactly as Spon's Architects' and Builders' 2024 prints them
 * in its Location Factors table. NAMES ONLY. Nothing in this project may add
 * a factor column to this list; the factors live in CB_LOCATION_FACTORS and
 * that table is empty against a purchase and a provenance question.
 *
 * "Yorkshire and Humberside" is the book's spelling; ONS calls the same
 * region "Yorkshire and The Humber". The book's spelling is kept because the
 * whole purpose of borrowing the vocabulary is that there is exactly one of
 * it, and REGION_ALIASES below records that they are the same region.
 */
export const PRICE_BOOK_REGIONS = [
  'Inner London',
  'Outer London',
  'South East',
  'South West',
  'East of England',
  'East Midlands',
  'West Midlands',
  'North East',
  'North West',
  'Yorkshire and Humberside',
  'Wales',
  'Scotland',
  'Northern Ireland',
] as const;

export type PriceBookRegion = (typeof PRICE_BOOK_REGIONS)[number];

/** The one place the two spellings of the same region are reconciled. */
export const REGION_ALIASES: Readonly<Record<string, PriceBookRegion>> = Object.freeze({
  'yorkshire and the humber': 'Yorkshire and Humberside',
  'yorkshire & humberside': 'Yorkshire and Humberside',
  'east': 'East of England',
});

/**
 * A SENTINEL, NOT A REGION. Kept in this module rather than in the web layer
 * so that "we do not know" has exactly one spelling everywhere it can be
 * stored, and so a `region` column can be searched for it.
 */
export const REGION_NOT_CAPTURED = 'region-not-captured';

/* ------------------------------------------------------------------ *
 * 2. ONS region codes -> the vocabulary
 * ------------------------------------------------------------------ */

/**
 * The nine English regions, by GSS code.
 *
 * NOT YET CHECKED AGAINST A REAL NSPL FILE ON THIS MACHINE, and that is
 * stated rather than glossed. The codes are stable published geography and
 * this is what they are; what has not happened is somebody opening the August
 * 2026 extract and confirming the column carries them in this form.
 *
 * THE SAFETY NET IS THAT AN UNRECOGNISED CODE REFUSES. `regionOf` below
 * throws E_REGION_CODE_UNRECOGNISED naming the code it was given, so a
 * mismatch surfaces as a refusal on the first postcode rather than as a
 * plausible wrong region on a surveyor's screen. THE REFRESH PROCEDURE SAYS
 * TO READ THE `region column` LINE THE INGEST PRINTS, for the same reason it
 * says to read the `lad column` line.
 */
export const ONS_REGION_TO_PRICE_BOOK: Readonly<Record<string, PriceBookRegion | 'LONDON'>> =
  Object.freeze({
    E12000001: 'North East',
    E12000002: 'North West',
    E12000003: 'Yorkshire and Humberside',
    E12000004: 'East Midlands',
    E12000005: 'West Midlands',
    E12000006: 'East of England',
    E12000007: 'LONDON',
    E12000008: 'South East',
    E12000009: 'South West',
  });

/**
 * The country codes NSPL uses where a region does not apply, in both the
 * shapes it uses them: the country code proper (`ctry`) and the region
 * column's pseudo-code. Wales, Scotland and Northern Ireland are each one
 * region in the book, so the country IS the region there.
 */
export const COUNTRY_TO_PRICE_BOOK: Readonly<Record<string, PriceBookRegion>> = Object.freeze({
  W92000004: 'Wales',      W99999999: 'Wales',      W: 'Wales',
  S92000003: 'Scotland',   S99999999: 'Scotland',   S: 'Scotland',
  N92000002: 'Northern Ireland', N99999999: 'Northern Ireland', N: 'Northern Ireland',
});

/* ------------------------------------------------------------------ *
 * 2a. Inner and Outer London — the ONS list, behind a surveyor switch
 *     (Phase 132e, 16 September 2026). OFF.
 * ------------------------------------------------------------------ */

/**
 * WHAT THIS IS, AND WHAT IT IS NOT.
 *
 * It is the Office for National Statistics' split of London's 33 council
 * areas into Inner London (14) and Outer London (19), keyed on the council's
 * GSS code — the code NSPL carries on every postcode row, and the only input
 * this lookup reads. Names are here for a person to read; nothing matches on
 * them, because a name can be spelt three ways and a code cannot.
 *
 * IT IS NOT THE SURVEYOR'S ANSWER. The box under "Which London boroughs count
 * as Inner London?" in CAPREBATE QUESTIONS holds typed text choosing this
 * list. Nobody signed it, it carries no date and no confidence, and it was not
 * written by the surveyor or any other professional. So it is an UNSIGNED
 * DRAFT ANSWER. The list is built so that it is ready; the switch that uses it
 * waits on the surveyor, and nothing in this project may turn it on because
 * the draft exists.
 *
 * WHY THE CHOICE MATTERS. There are two published lists and they disagree on
 * three councils:
 *   - ONS (statistical, used for national and regional accounts and here):
 *     Haringey and Newham ARE Inner London; Greenwich is Outer London.
 *   - London Government Act 1963 (statutory): Greenwich IS Inner London;
 *     Haringey and Newham are Outer London.
 * A property in any of those three lands in a different region depending on
 * which list is used, and the price book prices the two regions differently.
 *
 * NO FIGURE MOVES, EITHER WAY. No regional cost factor is loaded:
 * CB_LOCATION_FACTORS ships empty against a purchase and a provenance
 * question, and not one factor is in this file (R1 asserts it). Turning the
 * switch on would change which region NAME a London job is filed under in
 * the surveyor rate library, and nothing else. Turning it off changes nothing.
 *
 * CHECKED AT ONS, 16 September 2026. Two ONS sources, read that day, agree
 * with each other and with the fourteen below, with no difference:
 *   1. ONS Open Geography Portal, "Local Authority District to Inner and Outer
 *      London (December 2022) Lookup in EN" (item 57d068039d484914991ce8da7cb3ca93)
 *      https://geoportal.statistics.gov.uk/datasets/57d068039d484914991ce8da7cb3ca93_0/about
 *      data: https://services1.arcgis.com/ESMARspQHYMw9BZ9/arcgis/rest/services/LTLA22_IOL22_EN_LU/FeatureServer/0
 *      33 rows: 14 under E13000001 "Inner London", 19 under E13000002
 *      (which ONS spells "Outer london").
 *   2. ONS Open Geography Portal, "Local Authority District (April 2025) to
 *      LAU1 to ITL3 to ITL2 to ITL1 (January 2025) Lookup in the UK"
 *      https://services1.arcgis.com/ESMARspQHYMw9BZ9/arcgis/rest/services/ITL125_ITL225_ITL325_LAU125_LAD25_UK_LU/FeatureServer/0
 *      Inner London is ITL2 TLI3 (Inner London - West) plus TLI4 (Inner
 *      London - East): the same fourteen. TLI5, TLI6 and TLI7 hold the other
 *      nineteen.
 * The codes are stable, but the London list changes only by statute or by an
 * ONS revision. If ONS re-issues the lookup, check it against these two maps.
 */
export const SURVEYOR_INNER_LONDON_ONS_FOURTEEN = 'SURVEYOR_INNER_LONDON_ONS_FOURTEEN' as const;

export type RegionSwitches = {
  readonly [SURVEYOR_INNER_LONDON_ONS_FOURTEEN]?: unknown;
};

/**
 * THE DEFAULT, AND IT IS OFF. Only the boolean `true` turns the switch on.
 * N4: "not sure", "true", 1, null, an absent key and an absent object all
 * mean nobody has decided, and all behave exactly as off.
 *
 * A caller that passes its own switches object replaces this default whole;
 * it is not merged with it.
 */
export const REGION_SWITCHES: Readonly<Required<Record<typeof SURVEYOR_INNER_LONDON_ONS_FOURTEEN, boolean>>> =
  Object.freeze({ [SURVEYOR_INNER_LONDON_ONS_FOURTEEN]: false });

/** The fourteen, as ONS gives them (E13000001 Inner London). */
export const INNER_LONDON_ONS_FOURTEEN: Readonly<Record<string, string>> = Object.freeze({
  E09000001: 'City of London',
  E09000007: 'Camden',
  E09000012: 'Hackney',
  E09000013: 'Hammersmith and Fulham',
  E09000014: 'Haringey',
  E09000019: 'Islington',
  E09000020: 'Kensington and Chelsea',
  E09000022: 'Lambeth',
  E09000023: 'Lewisham',
  E09000025: 'Newham',
  E09000028: 'Southwark',
  E09000030: 'Tower Hamlets',
  E09000032: 'Wandsworth',
  E09000033: 'Westminster',
});

/** The other nineteen, as ONS gives them (E13000002 Outer London). */
export const OUTER_LONDON_ONS_NINETEEN: Readonly<Record<string, string>> = Object.freeze({
  E09000002: 'Barking and Dagenham',
  E09000003: 'Barnet',
  E09000004: 'Bexley',
  E09000005: 'Brent',
  E09000006: 'Bromley',
  E09000008: 'Croydon',
  E09000009: 'Ealing',
  E09000010: 'Enfield',
  E09000011: 'Greenwich',
  E09000015: 'Harrow',
  E09000016: 'Havering',
  E09000017: 'Hillingdon',
  E09000018: 'Hounslow',
  E09000021: 'Kingston upon Thames',
  E09000024: 'Merton',
  E09000026: 'Redbridge',
  E09000027: 'Richmond upon Thames',
  E09000029: 'Sutton',
  E09000031: 'Waltham Forest',
});

/**
 * Where the list came from and what standing it has, in one place a screen or
 * a register check can read. STATUS IS NOT AN ANSWER.
 */
export const INNER_LONDON_LIST_STATUS = Object.freeze({
  status: 'UNSIGNED_DRAFT_ANSWER' as const,
  question: 'Which London boroughs count as Inner London?',
  waits_on: 'the chartered surveyor',
  definition: 'ONS statistical Inner London (E13000001), the same fourteen as ITL2 TLI3 plus TLI4',
  checked_at_ons: '16 September 2026',
  sources: Object.freeze([
    'https://geoportal.statistics.gov.uk/datasets/57d068039d484914991ce8da7cb3ca93_0/about',
    'https://services1.arcgis.com/ESMARspQHYMw9BZ9/arcgis/rest/services/ITL125_ITL225_ITL325_LAU125_LAD25_UK_LU/FeatureServer/0',
  ]),
  regional_cost_factor_loaded: false,
});

/** The ways a form records "I don't know". Same list as the cost model's N4. */
const NOT_KNOWN_MARKERS = ['unsure', 'not sure', 'unknown', 'not known', "don't know", 'dont know'];

/** True only for the boolean `true`. Everything else is off (N4). */
function innerLondonSwitchOn(switches: RegionSwitches | null | undefined): boolean {
  const s = switches ?? REGION_SWITCHES;
  return s[SURVEYOR_INNER_LONDON_ONS_FOURTEEN] === true;
}

/** A council code is stated only if it is a non-empty string that is not a
    way of saying "I don't know". An absent code and "not sure" are one fact. */
function statedCode(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  if (t === '' || NOT_KNOWN_MARKERS.includes(t.toLowerCase())) return null;
  return t.toUpperCase();
}

export type RegionErrorCode =
  | 'E_REGION_NOT_IN_SOURCE'
  | 'E_REGION_CODE_UNRECOGNISED'
  | 'E_LONDON_INNER_OUTER_UNRESOLVED'
  | 'E_LONDON_BOROUGH_UNRECOGNISED';

/**
 * ITS OWN ERROR CLASS, RATHER THAN WIDENING THE RESOLVER'S.
 *
 * The resolver's code union is its contract and a caller switches on it. A
 * region failure is not a postcode failure — the postcode resolved perfectly
 * and it is the grouping above it that is missing — so putting these three
 * codes in that union would make every exhaustive switch over it wrong,
 * silently, at a `default` branch.
 */
export class RegionError extends Error {
  code: RegionErrorCode;
  detail: Record<string, unknown>;
  constructor(code: RegionErrorCode, message: string, detail: Record<string, unknown> = {}) {
    super(`[${code}] ${message}`);
    this.name = 'RegionError';
    this.code = code;
    this.detail = detail;
  }
}

/* ------------------------------------------------------------------ *
 * 3. The lookup
 * ------------------------------------------------------------------ */

/**
 * Council area -> one of the thirteen. Refuses at each of the three ways it
 * can fail, with a different code for each, because they need three different
 * people to do three different things:
 *
 *   E_REGION_NOT_IN_SOURCE            re-run the ingest against a file that
 *                                     has the region column  (an operator)
 *   E_REGION_CODE_UNRECOGNISED        ONS has changed the codes; correct the
 *                                     map above                (a developer)
 *   E_LONDON_INNER_OUTER_UNRESOLVED   answer the Inner London question
 *                                                              (the surveyor)
 *
 * And a fourth, which can only happen with the surveyor's switch ON:
 *
 *   E_LONDON_BOROUGH_UNRECOGNISED     the council code is missing, "not
 *                                     sure", or not one of London's 33
 *                                                  (an operator or a developer)
 *
 * `switches` is optional, and leaving it out uses REGION_SWITCHES, which is
 * off. With the switch off, London refuses exactly as it did before Phase
 * 132e: same code, same message, same detail.
 */
export function regionOf(authority: Pick<BillingAuthority,
  'region_code' | 'country_code' | 'lad_code' | 'lad_name' | 'postcode'>,
  switches?: RegionSwitches | null): PriceBookRegion {
  const country = (authority.country_code || '').trim();

  /* Wales, Scotland and Northern Ireland are decided by country and need no
     region column at all — which matters, because a per-country NSPL extract
     may not carry one. */
  const byCountry = COUNTRY_TO_PRICE_BOOK[country];
  if (byCountry !== undefined) return byCountry;

  const rgn = (authority.region_code || '').trim();
  if (rgn === '') {
    throw new RegionError(
      'E_REGION_NOT_IN_SOURCE',
      `no region code for ${authority.lad_name} (${authority.lad_code}). The postcode ` +
        'table was built from a file with no region column, so the region is unknown ' +
        'rather than absent — refusing rather than proposing a national figure. ' +
        'Re-run the ingest against an NSPL extract carrying `rgn`.',
      { lad_code: authority.lad_code, postcode: authority.postcode },
    );
  }

  const mapped = ONS_REGION_TO_PRICE_BOOK[rgn];
  if (mapped === undefined) {
    throw new RegionError(
      'E_REGION_CODE_UNRECOGNISED',
      `region code '${rgn}' is not one this build knows. ONS versions its geography ` +
        'codes and this map has not been checked against the release the table was ' +
        'built from. Refusing rather than guessing which of the thirteen regions it is.',
      { region_code: rgn, lad_code: authority.lad_code },
    );
  }

  if (mapped === 'LONDON' && innerLondonSwitchOn(switches)) {
    /* ON: the ONS fourteen are Inner London, the other nineteen Outer. An
       unknown or unstated council does NOT fall to Outer London — that would
       be the cheaper default this file exists to refuse. */
    const code = statedCode(authority.lad_code);
    if (code !== null && INNER_LONDON_ONS_FOURTEEN[code] !== undefined) return 'Inner London';
    if (code !== null && OUTER_LONDON_ONS_NINETEEN[code] !== undefined) return 'Outer London';
    if (code === null) {
      throw new RegionError(
        'E_LONDON_BOROUGH_UNRECOGNISED',
        'this postcode is in London but no council code was given for it, so it ' +
          'cannot be placed in Inner or Outer London. Refusing rather than taking ' +
          'the cheaper of the two. Resolve the postcode to its council first.',
        { lad_code: null, reason: 'not_stated', postcode: authority.postcode },
      );
    }
    throw new RegionError(
      'E_LONDON_BOROUGH_UNRECOGNISED',
      `council code '${code}' is in the London region but is not one of the 33 ` +
        'London councils in the ONS list this build holds. ONS may have changed the ' +
        'codes. Refusing rather than taking the cheaper of Inner and Outer London.',
      { lad_code: code, reason: 'not_in_ons_list', postcode: authority.postcode },
    );
  }

  if (mapped === 'LONDON') {
    throw new RegionError(
      'E_LONDON_INNER_OUTER_UNRESOLVED',
      `${authority.lad_name} is in London, and the price book splits London into Inner ` +
        '(1.05) and Outer (1.00) — a 5% difference on a whole cost plan. It does not ' +
        'say which boroughs are which, and there are two published definitions of ' +
        'Inner London in ordinary use. That is a surveyor\'s judgement and it has been ' +
        'asked; refusing until it is answered rather than taking the cheaper of the two.',
      { lad_code: authority.lad_code, lad_name: authority.lad_name },
    );
  }

  return mapped;
}

/**
 * The same lookup for a caller that has to put SOMETHING in a column — the
 * surveyor rate library, whose context is `sector :: region` and which cannot
 * simply not have one.
 *
 * IT RETURNS THE SENTINEL, NOT A REGION, and it returns the REASON with it so
 * the screen can say which of the three things is missing instead of printing
 * "region-not-captured" and leaving a surveyor to wonder. A caller that wants
 * a refusal uses `regionOf`; a caller that wants a key uses this. Neither
 * ever produces a region nobody derived.
 *
 * `switches` is passed straight to `regionOf`, and leaving it out is off.
 */
export function regionKeyOf(
  authority: Parameters<typeof regionOf>[0] | null,
  switches?: RegionSwitches | null,
): { readonly region: string; readonly derived: boolean; readonly why: string } {
  if (authority === null) {
    return {
      region: REGION_NOT_CAPTURED, derived: false,
      why: 'no postcode has been resolved for this job, so there is no council area ' +
           'to take a region from.',
    };
  }
  try {
    return { region: regionOf(authority, switches), derived: true, why: '' };
  } catch (e) {
    const err = e as { code?: string; message?: string };
    return {
      region: REGION_NOT_CAPTURED, derived: false,
      why: err.message ?? 'the region could not be derived.',
    };
  }
}
