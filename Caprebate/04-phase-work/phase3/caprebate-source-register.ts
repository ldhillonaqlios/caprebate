/**
 * Caprebate — Source Register & Provenance Cells
 * Board item 12830181420. Phase 3, item 1.
 *
 * Every field written anywhere in the system carries three things with it:
 *   publisher, licence, retrieval timestamp.
 * Not a log alongside the data — provenance attached to the value itself.
 *
 * Schema authority: Build-Prep-Consolidated-Schema.md §0.3 (UNKNOWN rule),
 * §0.4 (provenance codes), §0.5 (confidence grades, grade inheritance I-2).
 * Name policy: board item 12818313893 (name exclusion register).
 *
 * Runs on Node >= 22.6 with type stripping (`node file.ts`). No enums, no
 * namespaces, no parameter properties — those are not strippable.
 */

import { createHash } from 'node:crypto';

/* ------------------------------------------------------------------ *
 * 1. Types
 * ------------------------------------------------------------------ */

/** Schema §0.4. */
export type ProvCode = 'CA' | 'CD' | 'API' | 'SV' | 'DR' | 'CTA';

/** Schema §0.5. A is best, E is worst (most human-dependent). */
export type Grade = 'A' | 'B' | 'C' | 'D' | 'E';

const GRADE_ORDER: Record<Grade, number> = { A: 0, B: 1, C: 2, D: 3, E: 4 };

/** Worst-of, per invariant I-2 (derived grade = worst input grade). */
export function worstGrade(grades: readonly Grade[]): Grade {
  if (grades.length === 0) throw new ProvenanceError('E_NO_INPUTS', 'worstGrade needs at least one grade');
  return grades.reduce((a, b) => (GRADE_ORDER[b] > GRADE_ORDER[a] ? b : a));
}

/**
 * Three-state, per schema §0.3.
 *   VALUE   — we have it
 *   UNKNOWN — asked, the answer is genuinely not known
 * The third state, "not yet asked", is the ABSENCE of a cell. It is never
 * representable inside a cell, which is what stops it being coalesced.
 */
export type CellState = 'VALUE' | 'UNKNOWN';

export type Channel = 'client_report' | 'accountant_report' | 'hmrc_pack' | 'internal';

export type Licence = {
  licence_id: string;
  name: string;
  publisher_of_licence: string;
  attribution_required: boolean;
  /** Verbatim attribution line a report must carry. Null iff attribution_required is false. */
  attribution_text: string | null;
  /** Which of our outputs this data may be reproduced in. */
  redistribution: Record<Channel, boolean>;
  /** Beyond this age the cached value must be re-fetched before it may drive a gate. Null = no limit. */
  cache_max_age_days: number | null;
  /** True where the licence has not yet been read and confirmed by the solicitor/DPO. */
  legal_review_required: boolean;
  notes: string;
};

export type Source = {
  source_id: string;
  publisher: string;
  dataset: string;
  licence_id: string;
  default_prov: ProvCode;
  /**
   * The best grade this source can ever mint. A client answer cannot produce an A
   * however confident the caller is. Structural, not advisory.
   */
  max_grade: Grade;
  /**
   * WHITELIST of field ids this source may write. '*' means unrestricted.
   * Supports one leading or trailing '*'. This is the primary name-exclusion
   * control: a field not named here cannot be written from this source at all.
   */
  permitted_fields: readonly string[];
  /** BLACKLIST, checked even when permitted_fields is ['*']. Belt and braces. */
  excluded_fields: readonly string[];
  /** Documented personal-name exceptions (board 12818313893). Empty = no names, ever. */
  personal_name_exceptions: readonly string[];
  endpoint: string | null;
};

/** Where the value physically came from, on this occasion. */
export type Retrieval = {
  /** ISO-8601 UTC. Not optional, not defaulted, not inferred. */
  retrieved_at: string;
  method: 'API' | 'BULK' | 'MANUAL' | 'UPLOAD' | 'FORM' | 'SURVEY' | 'COMPUTED';
  /** The specific thing read: a URL, a title number, a filename + page, a question id. */
  locator: string;
  /** For CD (client document) extraction: which stored file, which page/box. */
  extract_ref?: string;
  /** For CD/B-grade fields: the extractor's own confidence 0..1. */
  extraction_confidence?: number;
  /**
   * For CD extraction only: the outcome of the document_property_match check
   * (board item 12902224596) — whether the uploaded document was itself
   * verified as being about this job's subject property. MISMATCH is never
   * written (that document contributes no claims); NOT_STATED means the
   * document named no property at all. Carried on the retrieval, not the
   * value, because it is a fact about the SOURCE, like extraction_confidence.
   */
  property_match?: 'MATCH' | 'MISMATCH' | 'NOT_STATED';
};

export type Provenance = {
  source_id: string;
  publisher: string;
  licence_id: string;
  prov: ProvCode;
  grade: Grade;
  retrieval: Retrieval;
  /** When we wrote it. Distinct from retrieved_at, which is when the publisher's value was read. */
  recorded_at: string;
  /** Record ids of the cells this one was computed from. Empty unless prov === 'DR'. */
  derived_from: readonly string[];
  /** Human-readable statement of the computation, for the evidence trail. */
  computation: string | null;
  /**
   * Oldest retrieved_at in the whole input chain. A derived figure is exactly as
   * stale as its stalest input; this is what staleness is measured against.
   */
  effective_retrieved_at: string;
  /**
   * Strictest cache window in the whole input chain, in days. Null = no limit anywhere.
   * The cache window inherits exactly as the grade does: a computation over a
   * 30-day CQC field is a 30-day figure, even though the computation itself is
   * our own work product and our own licence caps nothing.
   */
  effective_cache_max_age_days: number | null;
};

declare const CELL_BRAND: unique symbol;

/**
 * A value and its provenance as one indivisible record.
 * The brand cannot be produced outside this module, so `store.put(1200)` and
 * `store.put({ value: 1200 })` are compile errors, not runtime hopes.
 */
export type Cell<T> = {
  readonly [CELL_BRAND]: 'caprebate.cell.v1';
  readonly record_id: string;
  readonly entity_id: string;
  readonly field_id: string;
  readonly state: CellState;
  /** Null if and only if state === 'UNKNOWN'. */
  readonly value: T | null;
  readonly prov: Provenance;
  /** sha256 over the canonical form of everything above. Detects detachment/tampering. */
  readonly integrity: string;
};

export type AnyCell = Cell<unknown>;

export type ProvenanceErrorCode =
  | 'E_UNKNOWN_SOURCE'
  | 'E_UNKNOWN_LICENCE'
  | 'E_NO_RETRIEVED_AT'
  | 'E_BAD_TIMESTAMP'
  | 'E_FUTURE_TIMESTAMP'
  | 'E_FIELD_NOT_PERMITTED'
  | 'E_FIELD_EXCLUDED'
  | 'E_GRADE_EXCEEDS_SOURCE'
  | 'E_STATE_VALUE_MISMATCH'
  | 'E_NO_INPUTS'
  | 'E_INTEGRITY'
  | 'E_NOT_A_CELL';

export class ProvenanceError extends Error {
  code: ProvenanceErrorCode;
  detail: Record<string, unknown>;
  constructor(code: ProvenanceErrorCode, message: string, detail: Record<string, unknown> = {}) {
    super(`[${code}] ${message}`);
    this.name = 'ProvenanceError';
    this.code = code;
    this.detail = detail;
  }
}

/* ------------------------------------------------------------------ *
 * 2. Licence catalogue
 * ------------------------------------------------------------------ */

export const LICENCES: readonly Licence[] = [
  {
    licence_id: 'OGL_V3',
    name: 'Open Government Licence v3.0',
    publisher_of_licence: 'The National Archives',
    attribution_required: true,
    attribution_text: 'Contains public sector information licensed under the Open Government Licence v3.0.',
    redistribution: { client_report: true, accountant_report: true, hmrc_pack: true, internal: true },
    cache_max_age_days: 180,
    legal_review_required: false,
    notes: 'Default for Companies House, planning.data.gov.uk, ODS, CIW.',
  },
  {
    licence_id: 'HMLR_PPD',
    name: 'HM Land Registry Price Paid Data licence',
    publisher_of_licence: 'HM Land Registry',
    attribution_required: true,
    /* Phase 146c, 23 September 2026: HM Land Registry's prescribed words, read that day from GOV.UK's "Price Paid Data"
       guidance — the year is a fixed 2021, not a placeholder, and the line before this phase left it out. */
    attribution_text:
      'Contains HM Land Registry data © Crown copyright and database right 2021. ' +
      'This data is licensed under the Open Government Licence v3.0.',
    redistribution: { client_report: true, accountant_report: true, hmrc_pack: true, internal: true },
    cache_max_age_days: 90,
    legal_review_required: false,
    notes: 'Attribution wording is prescribed by HMLR and must appear verbatim, 2021 included. The address fields are ' +
      'Royal Mail and Ordnance Survey data, which HMLR says may be used "to display for the purpose of providing ' +
      'residential property price information services" — we use them to match an address and keep none of them.',
  },
  {
    /* PHASE 150, 24 September 2026: HM Land Registry's INSPIRE Index Polygons. Both statements are word for word from
       its conditions of use, read that day at https://use-land-property-data.service.gov.uk/datasets/inspire (the
       same words 04-phase-work/phase9/caprebate-boundary-import.ts has carried since 16 September). The
       "[year of supply or date of publication]" placeholder is HM Land Registry's own. client_report is FALSE
       although the licence would allow it with both statements: Lakhbir's decision of 15 September 2026 keeps
       boundary maps out of client reports, and the boundary module's CURRENT_LICENCE_PERMISSION holds it there. */
    licence_id: 'HMLR_INSPIRE',
    name: 'Open Government Licence v3.0, with HM Land Registry and Ordnance Survey attribution (INSPIRE Index Polygons)',
    publisher_of_licence: 'HM Land Registry',
    attribution_required: true,
    attribution_text:
      'This information is subject to Crown copyright and database rights [year of supply or date of publication] ' +
      'and is reproduced with the permission of HM Land Registry. The polygons (including the associated geometry, ' +
      'namely x, y co-ordinates) are subject to Crown copyright and database rights [year of supply or date of ' +
      'publication] Ordnance Survey AC0000851063.',
    redistribution: { client_report: false, accountant_report: false, hmrc_pack: false, internal: true },
    cache_max_age_days: 35,
    legal_review_required: false,
    /* PHASE 151c, 25 September 2026: the boundary module's checkBoundaryUse said the site AREA "may be reported"
       while this row says client_report false for the whole source. Lakhbir's decision of 15 September settles the
       map, not the number, so the number stays in with everything else here — for our own checks — until he answers
       the Word question "May the site area we work out from a land boundary go in a client's report?". Both now say so. */
    notes: 'Free under the OGL. Republished on the first Sunday of each month, showing the previous month, so a copy ' +
      'is kept no longer than about five weeks. Freehold only. A site area worked out from a polygon is for our own ' +
      'checks, and so stays out of every outgoing report with the polygon, a map of it and its coordinates, until ' +
      'Lakhbir decides whether the number itself may go in a client report.',
  },
  {
    licence_id: 'HMLR_TITLE',
    name: 'HM Land Registry official copy / title register',
    publisher_of_licence: 'HM Land Registry',
    attribution_required: true,
    attribution_text: 'Contains HM Land Registry data © Crown copyright and database right.',
    redistribution: { client_report: false, accountant_report: true, hmrc_pack: true, internal: true },
    cache_max_age_days: 30,
    legal_review_required: false,
    notes:
      'Purchased official copies. Onward supply to a third party is restricted. CLEARED 27 September 2026: the ' +
      'solicitor answered yes — a figure from an official copy may go in the pack for the client\'s own accountant ' +
      '(relayed by Lakhbir; register entry SDP-L22). Since Phase 146k/146l the copy is bought, typed and uploaded ' +
      'by hand; the licence is the same. Not in the client report: that channel was not asked and stays shut.'
  },
  {
    licence_id: 'CQC_SYNDICATION',
    name: 'CQC syndication / API terms of use',
    publisher_of_licence: 'Care Quality Commission',
    attribution_required: true,
    /* PHASE 153c, 4 October 2026 (Word question 201): the words shown beside each CQC fact. CQC's "Using CQC data"
       page puts the data under the Open Government Licence and asks users to acknowledge they use CQC information. */
    attribution_text: 'Source: Care Quality Commission, Open Government Licence',
    redistribution: { client_report: true, accountant_report: true, hmrc_pack: true, internal: true },
    /* 0 WAS OUR REFUSAL, NOT CQC'S FIGURE (Phase 146c, 23 September 2026), until the solicitor answered how current CQC
       data must be when we use it.
       PHASE 153c, 4 October 2026 — 30 DAYS IN THE TEST SYSTEM, on our recommendation (Word question 201, the director's,
       for the solicitor): a fact held up to 30 days, always with its source beside it, unless the terms that come with
       the key say otherwise. Test data only. Null would still mean "no limit" and is never used (N4). */
    cache_max_age_days: 30,
    legal_review_required: true,
    notes: 'FLAG: the syndication terms were thought to carry a currency obligation; the solicitor/DPO confirms the cache ' +
      'window, and until then it is 0. Read 23 Sep 2026: the current developer portal publishes no terms for the API ' +
      '(its product lists none), and CQC\'s "Using CQC data" page says the data is under the Open Government Licence, ' +
      'is "updated daily", and asks users to "acknowledge on your site or service that you are using CQC information".',
  },
  {
    licence_id: 'EPC_ENGLAND_WALES',
    name: 'EPC Open Data licence (England & Wales)',
    publisher_of_licence: 'MHCLG',
    attribution_required: true,
    attribution_text: 'Contains EPC data © Crown copyright, licensed under the Open Government Licence v3.0.',
    redistribution: { client_report: true, accountant_report: true, hmrc_pack: true, internal: true },
    cache_max_age_days: 365,
    legal_review_required: false,
    notes: 'Registration via GOV.UK One Login and acceptance of terms required before bulk access. England & Wales only (Phase 64).',
  },
  {
    /* PHASE 155 (line 3), 4 October 2026 — READ, AND IT DOES NOT ALLOW OUR USE. This row said "VOA_OPEN" and the Open
       Government Licence; neither was ever true. The VOA's bulk rating list download page
       (voaratinglists.blob.core.windows.net/html/rlidata.htm, read 4 October 2026, an "I Agree" before any file) says
       "An open government licence does not apply", and its terms (tax.service.gov.uk/view-my-valuation/terms-and-
       conditions) say "Publication of this information and its use is restricted to Non Domestic Rating (NDR) purposes
       only": for interested persons, councils, their representatives and those who serve them, passed on only for the
       same purposes, deleted when no longer needed for them. A capital allowances claim is not a rating purpose. So
       every channel is FALSE — internal too — and nothing is imported (Phase 155 line 3; the phase9 importer
       04-phase-work/phase9/caprebate-voa-import.ts stays unshipped). Only the VOA could permit our use.
       SCRAPPED, the same day: Lakhbir, "scrap the VOA rating". Not to be reopened (ACTION-PLAN COORDINATES,
       "DECIDED - DO NOT REOPEN"). The row stays so the panel can say why it is not used. */
    licence_id: 'VOA_RATING_LIST',
    name: 'VOA rating list data — restricted to Non Domestic Rating purposes; NOT the Open Government Licence',
    publisher_of_licence: 'Valuation Office Agency (HMRC)',
    attribution_required: true,
    attribution_text: 'Valuation Office Agency rating list data, used under the VOA\'s own terms.',
    redistribution: { client_report: false, accountant_report: false, hmrc_pack: false, internal: false },
    cache_max_age_days: 0,
    legal_review_required: true,
    notes: 'Read 4 October 2026: "Publication of this information and its use is restricted to Non Domestic Rating (NDR) ' +
      'purposes only", and "An open government licence does not apply". Capital allowances work is not an NDR purpose, so ' +
      'it is not used at all until the VOA permits it. The file is asterisk-delimited and carries no UPRN. Ratepayer ' +
      'name excluded at source (12818314296) in any case.',
  },
  {
    /**
     * BCIS — THE COST SOURCE, INSTEAD OF SPON'S. Lakhbir chose BCIS over the Spon's price books (Word answers 6 and 8,
     * closed 24 September 2026); no Spon's book is bought, and the three Spon's PDFs in
     * 07-reference-and-benchmarks/price-books stay where they are, unused. Rewritten 24 September 2026 by Phase 151
     * in the shape of CIBSE_KNOWLEDGE below. The research is 04-phase-work/phase3/caprebate-bcis-source-register-row.md.
     *
     * WHAT IT WOULD FEED. The LEG-E4 tables in 04-phase-work/phase9/caprebate-cost-model.cjs - CB_LOCATION_FACTORS,
     * CB_CONTRACT_SIZE_ADJUSTMENT, CB_PRICE_SOURCES - and the bcis_* fields of the BCIS source row. ALL STAY EMPTY AND
     * THE GATE STAYS OFF until Word question 218 ("Which BCIS product did you agree to, and does its licence let our
     * software use its rates?") is answered with the product and its order form. This entry records the terms.
     *
     * WHAT BCIS PUBLISHES, read 24 September 2026 from bcis.co.uk/terms-conditions-of-sale/ (last updated 9 April
     * 2026), Annex One "Special Conditions for BCIS Subscription", which covers every BCIS data product (CapX, OpX,
     * TotX, ProtX, location factors, tender price indices, average prices) except Rebuild Plus (Annex Two). The
     * archived BCIS Online terms of 17 June 2024 match it on every point below. The licensor is Building Cost
     * Information Service Ltd, not RICS itself.
     *   - cl. 2.1: a non-exclusive, non-transferable, revocable licence for the Subscription Term.
     *   - cl. 2.1(b)-(c): the Data and edited copies may be stored on the subscriber's own systems and shared with its
     *     licensed users there. cl. 2.3(a),(b),(d),(e): each user is a named employee with their own login, no more
     *     users than the order states, working from the office on the order. cl. 2.3(j): no automated harvesting.
     *   - cl. 2.1(d): extracts of the Data may be sent to the subscriber's customers or clients, where they relate to
     *     projects created in the service and are reasonably necessary to advise in the normal course of business.
     *     cl. 2.2 and 2.3(h): nothing else is redistributed.
     *   - cl. 7.3: any display credits BCIS "wherever technically and commercially feasible". No wording is given.
     *     cl. 7.4 adds Ordnance Survey and Royal Mail copyright notices without saying whether output must carry them.
     *   - cl. 9.1-9.2: the term is 12 months unless the order says otherwise, renewing unless either side gives 30
     *     days' notice; on expiry the Data and edited copies are deleted immediately, except Derived Data (data changed
     *     so far it cannot be traced back to BCIS or used in its place).
     *   - cl. 4.1 audit for a year after expiry; cl. 8.1 the Data is confidential, disclosable where law or a regulator
     *     requires (cl. 8.2(c)); general terms cl. 13.6: the services are for information only and "should not be
     *     used as conclusive, complete or authoritative".
     *
     * WHAT IT DOES NOT PUBLISH, AND THIS ENTRY HOLDS AS A REFUSAL, NEVER A DEFAULT
     *   - attribution wording: none. `attribution_text` is a NOT PUBLISHED marker;
     *   - the client's accountant: the grant is to "customers or clients" only, so accountant_report is false;
     *   - HMRC: not mentioned. Only disclosure the law requires (cl. 8.2(c)) is possible, and nothing permits a
     *     voluntary pack, so hmrc_pack is false;
     *   - whether a figure our engine computes from BCIS rates and prints in a client's report is an "extract ...
     *     relating to projects created in the service": treated as NOT, so client_report is false until BCIS
     *     confirms it in writing, and a figure carried to a report must be Derived Data or not carry at all;
     *   - whether staff who can see a BCIS figure in the back office are all named licensed users: INTERNAL IS TRUE
     *     ONLY ON THAT CONDITION, which the order form (question 218) must show before anything is loaded;
     *   - an API or data-feed licence: none published (the developer portal says only to email for access), so the
     *     BCIS source row keeps `endpoint: null` and nothing is fetched;
     *   - any freshness period for a loaded edition: none. 365 days is the published subscription term, not a
     *     freshness rule, and expiry means deletion, not staleness;
     *   - prices: none published; BCIS sells by demonstration and quote. Permissions and licensing:
     *     contactbcis@bcis.co.uk; API access: api@bcis.co.uk.
     */
    licence_id: 'BCIS_COMMERCIAL',
    name: 'BCIS subscription licence — Annex One of BCIS Ltd\'s terms of sale; named users, extracts to clients only; NO ATTRIBUTION WORDING, NO ACCOUNTANT OR HMRC GRANT PUBLISHED',
    publisher_of_licence: 'Building Cost Information Service Ltd (BCIS, owned by RICS)',
    attribution_required: true,
    attribution_text:
      'NOT PUBLISHED — BCIS\'s licence (Annex One, cl. 7.3) requires a credit to BCIS wherever feasible but gives no wording. ' +
      'Nothing from this source may appear in a report until BCIS states the wording and confirms the use.',
    redistribution: { client_report: false, accountant_report: false, hmrc_pack: false, internal: true },
    cache_max_age_days: 365,
    legal_review_required: true,
    notes:
      'Read 24 Sep 2026 (Phase 151) from bcis.co.uk/terms-conditions-of-sale/ (updated 9 Apr 2026), Annex One. Internal use ' +
      'is granted to named licensed users only (cl. 2.1(b)-(c), 2.3); extracts may go to clients where they relate to ' +
      'projects created in the service (cl. 2.1(d)); nothing else may be redistributed (cl. 2.2). client_report false, ' +
      'accountant_report false and hmrc_pack false are our refusals where BCIS publishes no grant; 365 days is the ' +
      'subscription term, and on expiry the data is deleted (cl. 9.2). Rates may be USED to compute, but the underlying ' +
      'rate table may not be reproduced. Which BCIS product was agreed, and its order form, is Word question 218.',
  },
  {
    licence_id: 'CLIENT_SUPPLIED',
    name: 'Client-supplied information',
    publisher_of_licence: 'n/a',
    attribution_required: false,
    attribution_text: null,
    redistribution: { client_report: true, accountant_report: true, hmrc_pack: true, internal: true },
    cache_max_age_days: null,
    legal_review_required: false,
    notes: 'The client owns it and instructs us to use it. Processed under the engagement letter.',
  },
  {
    /**
     * ONS postcode products. DELIBERATELY NOT the shared OGL_V3 entry above,
     * even though the licence itself is the Open Government Licence v3.0.
     *
     * ONS requires THREE attribution lines — its own, Ordnance Survey's and
     * Royal Mail's — because the product is Gridlink-derived. The generic
     * "Contains public sector information..." line that serves Companies House
     * and planning data would UNDER-ATTRIBUTE this source, and under-attributing
     * is a breach of the condition the licence is granted on. Same licence,
     * different obligation, therefore a different entry.
     *
     * cache_max_age_days is 120, not OGL_V3's 180: ONS releases quarterly, so
     * 180 days can serve data two releases old, and 120 keeps us at most one
     * release behind with a month of grace to notice.
     *
     * NORTHERN IRELAND IS NOT COVERED. Commercial use of BT postcodes needs a
     * separate licence from Land and Property Services. Enforced in code at
     * ingest and again at lookup — phase9/caprebate-postcode-authority.ts.
     * Established 7 September 2026 from the publisher's own licence page.
     */
    licence_id: 'ONS_POSTCODE_OGL',
    name: 'Open Government Licence v3.0 — ONS postcode products',
    publisher_of_licence: 'The National Archives / Office for National Statistics',
    attribution_required: true,
    attribution_text:
      'Contains OS data © Crown copyright and database right [year]. ' +
      'Contains Royal Mail data © Royal Mail copyright and database right [year]. ' +
      'Source: Office for National Statistics licensed under the Open Government Licence v.3.0.',
    redistribution: { client_report: true, accountant_report: true, hmrc_pack: true, internal: true },
    cache_max_age_days: 120,
    legal_review_required: false,
    notes:
      'Free, no negotiation, no fee — verified against the publisher 7 Sep 2026. ' +
      'EXCLUDES Northern Ireland (BT) for commercial use; that needs Land and ' +
      'Property Services. Scotland IS included, so widening to Scotland is free ' +
      'and widening to Northern Ireland is not.',
  },
  {
    /**
     * THE ADDRESS LOOKUP. Board item 13003875907. Written 12 September 2026 by
     * Phase 129 from the supplier's OWN PUBLISHED PAGES, read that day:
     *   https://homedata.co.uk/terms            (Terms of Service, "Last updated: November 2024")
     *   https://homedata.co.uk/about            ("Sourced from ... OS AddressBase ...";
     *                                            "Licensed under Open Government Licence and commercial agreements")
     *   https://homedata.co.uk/docs/pricing     ("Address endpoints carry Royal Mail PAF / Ordnance Survey licensing")
     *   https://homedata.co.uk/docs/endpoints   (the uprn is "a public OS AddressBase id")
     *
     * WHAT THE TERMS STATE, AND THIS ENTRY CARRIES AS STATED
     *   §7  data "owned by Homedata or our licensors"; "a limited, non-exclusive
     *       licence to use the data in accordance with your subscription plan".
     *   §4  the customer may not "Resell or redistribute our data without
     *       authorisation" — hence redistribution false on every outward channel.
     *   §6  data "provided 'as is'" with no accuracy guarantee — hence max grade B.
     *
     * WHAT THE SUPPLIER DOES NOT PUBLISH, AND THIS ENTRY REFUSES TO INVENT
     *   - a licence NAME: none. `name` says so.
     *   - ATTRIBUTION WORDING: none. `attribution_text` is a NOT PUBLISHED marker,
     *     never a guessed Royal Mail or OS line. No outward channel is open, so the
     *     marker cannot reach a report without a redistribution breach firing first.
     *   - a CACHE WINDOW: none. `cache_max_age_days` is 0, and 0 IS OUR REFUSAL,
     *     NOT THEIR FIGURE: a returned address is stale the moment it is held and
     *     must be re-fetched before it drives anything. NULL WOULD MEAN "NO LIMIT",
     *     which is an unpublished fact asserted in the permissive direction (N4).
     *   - permission to reproduce in a client report, an accountant pack or an
     *     HMRC pack: none beyond §4's prohibition.
     * The supplier's own contact for these is legal@homedata.co.uk (§13).
     *
     * PHASE 153c, 4 October 2026 — THE KEEP-UNTIL PERIOD IS SEVEN YEARS IN THE TEST SYSTEM (Word question 37). Built
     * on our recommendation, for the officer and Homedata to check: an address and its property number are kept with
     * the claim file for seven years (2,557 days), like the rest of it, so a claim checked years later can still say
     * which building every figure was matched on. It is OUR TEST READING, NOT HOMEDATA'S FIGURE, and it stands only
     * until Homedata answers the drafted email in writing. EVERY OUTWARD CHANNEL STAYS CLOSED: nothing from this source
     * reaches a client, accountant or HMRC report. The same reading covers GoAddress ("Find my address",
     * src/connectors/address-lookup.ts ADDRESS_KEEP_UNTIL), which publishes no period either.
     */
    licence_id: 'HOMEDATA_TERMS',
    name: 'Homedata Terms of Service (Nov 2024) — limited, non-exclusive licence under the subscription plan; NO LICENCE NAME PUBLISHED',
    publisher_of_licence: 'Homedata',
    attribution_required: true,
    attribution_text:
      'NOT PUBLISHED — Homedata publishes no attribution wording for address data. ' +
      'Nothing from this source may appear in a report until the supplier states it.',
    redistribution: { client_report: false, accountant_report: false, hmrc_pack: false, internal: true },
    cache_max_age_days: 2557,
    legal_review_required: true,
    notes:
      'TEST READING, Phase 153c (4 Oct 2026, Word question 37): kept seven years with the claim file, reports still ' +
      'closed, awaiting Homedata\'s written answer. Not the supplier\'s figure. ' +
      'Read against the supplier\'s published pages 12 Sep 2026 (Phase 129). Underlying data, per those ' +
      'pages: Ordnance Survey AddressBase (the UPRN) and Royal Mail PAF. Cache window, attribution wording, ' +
      'licence name and per-channel reproduction are NOT PUBLISHED; 0 days and false are our refusals, not ' +
      'their terms. Coverage is published inconsistently: /pricing says "England and Wales only", ' +
      '/data/postcode says Scotland is covered. Confirm all of it with legal@homedata.co.uk on opening the account.',
  },
  {
    /**
     * CIBSE PLANT LIVES — the source nobody owned. Board item "CIBSE plant lives"; written 24 September 2026
     * by Phase 147. The research is 04-phase-work/phase3/caprebate-cibse-plant-lives-source-register-row.md.
     *
     * WHAT IT WOULD FEED. CB_CIBSE_PLANT_LIVES in 04-phase-work/phase9/caprebate-cost-model.cjs: the expected
     * life of each plant element, read by LEG-E5 (per-element depreciation) and by ATP-F-3 (the crosswalk
     * completeness gate). THAT TABLE STAYS EMPTY AND BOTH GATES STAY OFF. This entry records the terms, not data.
     *
     * WHAT CIBSE PUBLISHES, read 24 September 2026 from its own pages as archived in June and July 2026 (the
     * live site answered 503 and then "HTTP Error 500.30 - ASP.NET Core app failed to start" that morning):
     *   - The tables are "Indicative Economic Life Expectancy (2026)", published June 2026: a zip holding
     *     Guide M11 Appendix 11.A1 (economic life expectancy tables, PDF), Appendix 11.A2 (worked examples,
     *     PDF) and an Excel tool. Standard rate FREE, member rate FREE. It supersedes the January 2020
     *     supplement (Appendix 12.A1 of Guide M 2014), which NBS lists as withdrawn. Lives are "Reference
     *     Service Life" in years, aligned to RICS NRM 3 and SFG20, and healthcare-specific assets appear
     *     for the first time.
     *   - The guide the tables belong to is "Guide M11 Life cycle (2023)", September 2023, 22 pages, ISBN
     *     9781914543746: PDF £20.00 + VAT standard rate, FREE to members; book £25.00 + VAT, £12.50 + VAT
     *     to members.
     *   - The download notice: "supplied by CIBSE for the sole use of the person making the download".
     *   - Knowledge FAQs: downloaded files "are for the use of the downloader only. They may not be
     *     duplicated or circulated in any form for use by others, for re-sale or for any other purpose";
     *     reproducing content "in a text for sale" is allowed "for a cost, and only with our permission",
     *     via PLSclear.
     *   - Website terms: CIBSE material is protected by the Copyright, Designs and Patents Act 1988 AND the
     *     Copyright and Rights in Databases Regulations 1997; written requests go to the Head of Knowledge.
     *
     * WHAT IT DOES NOT PUBLISH, AND THIS ENTRY HOLDS AS A REFUSAL, NEVER A DEFAULT
     *   - whether a report a client pays for is "a text for sale": treated as one, so every outward
     *     channel is false;
     *   - whether using a life in a calculation, without printing the table, is reproduction: treated as
     *     reproduction;
     *   - whether a table loaded into a system that several staff use is "circulated ... for use by
     *     others": treated as circulation, so even INTERNAL is false until CIBSE says otherwise. This is
     *     stricter than BCIS_COMMERCIAL on purpose: BCIS sells a subscription for business use, and CIBSE's
     *     only published grant is to one person;
     *   - the PLSclear price: quoted per request, not published;
     *   - attribution wording: none published. `attribution_text` is a NOT PUBLISHED marker;
     *   - how long a loaded edition may be relied on: none published. 0 days is OUR refusal, not theirs;
     *   - the "CIBSE copyright" section of the Fair Use Policy page the terms point to: READ 24 Sep 2026 by
     *     the sweep, as archived on 29 May 2022 (cibse.org/knowledge/about-knowledge-portal/fair-use-policy).
     *     The live site no longer has the page - it is not in CIBSE's 3,703-page sitemap - though the live
     *     terms still point to it. It CONFIRMS all three readings above and loosens none: downloads are "for
     *     their personal use" and "only for the benefit of the person entitled"; copying up to 10% is allowed
     *     "BUT ONLY for your personal use"; and "use of CIBSE documents for re-use, re-sale or other gain,
     *     promotion or benefit to a third party" is a breach, as is distributing content "in any format or
     *     for any purpose without express permission". A paid report is other gain; staff sharing one
     *     download is distribution. Permission requests go to CIBSE's Knowledge Manager.
     *
     * NO SOURCES ROW YET, ON PURPOSE. In this register every external row is a lookup that the research panel
     * lists and a member of staff fires, and it must carry a tier and a switch. This is a reference table
     * loaded once, under a licence we do not hold. Its SOURCES row is written with its loader, if the table
     * is ever loaded; until then no cell can be minted from it at all.
     */
    licence_id: 'CIBSE_KNOWLEDGE',
    name: 'CIBSE Knowledge Portal terms — download for the sole use of the downloader; NO BUSINESS OR RESALE LICENCE PUBLISHED',
    publisher_of_licence: 'Chartered Institution of Building Services Engineers (CIBSE)',
    attribution_required: true,
    attribution_text:
      'NOT PUBLISHED — CIBSE publishes no attribution line for its life expectancy tables. ' +
      'Nothing from this source may appear in a report until CIBSE grants permission and states one.',
    redistribution: { client_report: false, accountant_report: false, hmrc_pack: false, internal: false },
    cache_max_age_days: 0,
    legal_review_required: true,
    notes:
      'Read 24 Sep 2026 (Phase 147) from CIBSE\'s own pages as archived 11 Jun, 15 Jun and 6-7 Jul 2026. The June 2026 ' +
      'life tables are free to download; the Guide M11 PDF is £20 + VAT, free to members. The grant is to the person ' +
      'who downloads, for their own use; reproduction in a text for sale needs CIBSE\'s permission via PLSclear, at a ' +
      'price not published. Every channel false, internal included, and 0 days, are our refusals, not CIBSE\'s terms. ' +
      'A surveyor must first rule whether a whole-building obsolescence scale may be applied per plant element at all; ' +
      'if not, per-element depreciation does not ship and these lives are not needed. ' +
      'CIBSE\'s Fair Use Policy (archived 29 May 2022, read 24 Sep 2026; gone from the live site) confirms every ' +
      'refusal: personal use only, and no re-use for other gain or for the benefit of a third party without permission.',
  },
  {
    /**
     * POSTCODES.IO — THE FREE CHECK AT THE ADDRESS QUESTION. Phase 151, 24 September 2026 (Word answers 16, 17, 35 and
     * 36). The research is 04-phase-work/phase151/free-address-lookup.md.
     *
     * NO FREE ADDRESS LIST EXISTS FOR A COMMERCIAL SERVICE. Read that day: getAddress.io ceased on 4 February 2026 after
     * losing a High Court database-right case, and its lookup returns 404; Ideal Postcodes' free credits are "for testing
     * and evaluation" only; OS Places counts nothing towards the OS Data Hub's free allowance and its trial excludes live
     * use; Loqate and findAddress.io are trials. So the free thing at the address question is a POSTCODE CHECK, not an
     * address list: the client types their postcode, this confirms it exists and gives the council area, region and
     * country, and the client types the building and street themselves. The paid address lookup (Homedata) still runs
     * after signing, when staff start the research.
     *
     * WHAT IT PUBLISHES (postcodes.io/docs/overview and /docs/licences, read 24 Sep 2026): no key; GB data under the OS
     * OpenData licence and the Open Government Licence; for Northern Ireland "BT" postcodes "Commercial use requires a
     * licence from NI Land & Property Services" — SO THE CONNECTOR REFUSES A BT POSTCODE; the attribution lines below.
     * WHAT IT DOES NOT PUBLISH: a rate limit, a service level, or where it is hosted. Only a postcode is ever sent.
     */
    licence_id: 'POSTCODES_IO_OPEN',
    name: 'Postcodes.io — OS OpenData and ONS data under the Open Government Licence v3.0; Northern Ireland excluded for commercial use',
    publisher_of_licence: 'Postcodes.io (Ideal Postcodes Ltd), for Ordnance Survey, Royal Mail, ONS and National Records of Scotland',
    attribution_required: true,
    attribution_text:
      'Contains OS data © Crown copyright and database right [year]. ' +
      'Contains Royal Mail data © Royal Mail copyright and database right [year]. ' +
      'Source: Office for National Statistics licensed under the Open Government Licence v.3.0. ' +
      'Contains National Records of Scotland data © Crown copyright and database right [year].',
    redistribution: { client_report: true, accountant_report: true, hmrc_pack: true, internal: true },
    cache_max_age_days: 120,
    legal_review_required: false,
    notes:
      'Read 24 Sep 2026 (Phase 151). Free, no key, commercial use allowed in Great Britain. A BT (Northern Ireland) postcode ' +
      'needs a Land and Property Services licence for commercial use and is refused. No address lines and no UPRN: it ' +
      'checks a postcode, it does not list addresses. No rate limit or service level is published. 120 days matches the ' +
      'ONS postcode table the data comes from, which is republished quarterly.',
  },
  {
    licence_id: 'CAPREBATE_OWN',
    name: 'Caprebate own work product',
    publisher_of_licence: 'Caprebate',
    attribution_required: false,
    attribution_text: null,
    redistribution: { client_report: true, accountant_report: true, hmrc_pack: true, internal: true },
    cache_max_age_days: null,
    legal_review_required: false,
    notes: 'Survey observations, engine computations, CTA positions.',
  },
];

/* ------------------------------------------------------------------ *
 * 3. Source catalogue — the register proper.
 *    permitted_fields encodes the KEEP column of board item 12818313893.
 * ------------------------------------------------------------------ */

const NO_NAMES: readonly string[] = [];

export const SOURCES: readonly Source[] = [
  {
    source_id: 'CH_COMPANY',
    publisher: 'Companies House',
    dataset: 'Company profile',
    licence_id: 'OGL_V3',
    default_prov: 'API',
    max_grade: 'A',
    permitted_fields: [
      'company_number', 'company_status', 'sic_codes', 'accounts_year_end',
      'incorporation_date', 'registered_office_postcode', 'group_link_*',
      // PHASE 153b, 4 October 2026 (Word question 198): the company's TYPE ("ltd", "plc", "llp" ...), a fact about the
      // company and not about a person. PROPOSED, for the data protection officer (Sadique Maskeen) to agree — the
      // corrections of 3 October said "change the permitted fields first (and ask Sadique), then map". Nothing reads
      // it until COMPANY_TYPE_FROM_REGISTER (09-app/backend/src/connectors/company-search.ts) is switched on, and it is off.
      'company_type',
    ],
    excluded_fields: ['officer_*', 'director_*', 'secretary_*', '*_dob', 'service_address*', 'residential_address*'],
    personal_name_exceptions: NO_NAMES,
    endpoint: 'https://api.company-information.service.gov.uk',
  },
  {
    // EXCEPTION 1 (subitem 12818314874): PSC name retained, justified by the CAA 2001
    // AIA common-control test (£1m shared across commonly controlled businesses).
    // Recorded in the LIA.
    source_id: 'CH_PSC',
    publisher: 'Companies House',
    dataset: 'Persons with significant control',
    licence_id: 'OGL_V3',
    default_prov: 'API',
    max_grade: 'A',
    permitted_fields: ['psc_name', 'psc_kind', 'psc_natures_of_control', 'psc_ceased_on', 'company_number'],
    excluded_fields: ['psc_dob_day', 'psc_address_line_*', 'psc_residential_*'],
    personal_name_exceptions: ['psc_name'],
    endpoint: 'https://api.company-information.service.gov.uk',
  },
  {
    source_id: 'HMLR_PPD',
    publisher: 'HM Land Registry',
    dataset: 'Price Paid Data',
    licence_id: 'HMLR_PPD',
    default_prov: 'API',
    max_grade: 'A',
    permitted_fields: ['price_paid', 'transaction_date', 'tenure', 'property_type_ppd', 'new_build_flag'],
    excluded_fields: ['*_name'],
    personal_name_exceptions: NO_NAMES,
    endpoint: 'https://landregistry.data.gov.uk',
  },
  {
    // EXCEPTION 2 (subitem 12818314353): proprietor name retained ONLY where the property
    // is held personally, because it is then the claimant's own identity. Where the
    // proprietor is a company the value is a company name and no exception is engaged.
    source_id: 'HMLR_TITLE',
    publisher: 'HM Land Registry',
    dataset: 'Title register (official copy)',
    licence_id: 'HMLR_TITLE',
    default_prov: 'API',
    max_grade: 'A',
    /* PHASE 146d, 23 September 2026 — `price_paid`, `transaction_date` and `prior_owner_count` added. THE ROW
       DESCRIBED THIS LOOKUP WITHOUT PERMITTING THE FIELD IT IS BOUGHT FOR. An official copy of the register records
       the price paid, or the value stated where no price was paid, for every disposition since April 2000 —
       commercial included — and that is the ONLY source of a price paid for four of our five sectors, because HM
       Land Registry's free Price Paid Data is residential sales only. Without these three the connector's records
       would have been refused at the one door as unclassified fields. The prior-owner CHAIN is kept as a count:
       how many earlier proprietors the register records, never who they were — `former_proprietor_*` stays
       excluded. */
    permitted_fields: [
      'title_number', 'tenure', 'proprietor_name_personal', 'proprietor_company_number',
      'lease_term_*', 'restriction_*', 'price_paid', 'transaction_date', 'prior_owner_count',
    ],
    excluded_fields: ['charge_holder_individual_*', 'former_proprietor_*'],
    personal_name_exceptions: ['proprietor_name_personal'],
    /* PHASE 146d: the Business Gateway's published live address, from HM Land Registry's own developer pack (read
       23 September 2026). The vendor test environment is https://bgtest.landregistry.gov.uk. Reaching either needs
       a Business Gateway account AND the client certificate HM Land Registry issues under the network access
       agreement, both of which are the developer's to obtain. */
    endpoint: 'https://businessgateway.landregistry.gov.uk',
  },
  {
    /* PHASE 150, 24 September 2026: the land boundary. One GML file per local authority, downloaded whole, and the
       polygon found by a point inside it (findInspirePolygonForPoint in 04-phase-work/phase9/caprebate-boundary-
       import.ts). The polygons carry no title number and no name, so nothing personal can arrive from this source.
       B, not A: HM Land Registry says the extent of a title "cannot be established" from these polygons. The
       fetcher is 09-app/backend/src/connectors/inspire.ts, and it is switched off. */
    source_id: 'HMLR_INSPIRE',
    publisher: 'HM Land Registry',
    dataset: 'INSPIRE Index Polygons',
    licence_id: 'HMLR_INSPIRE',
    default_prov: 'API',
    max_grade: 'B',
    /* Phase 151a: site_area_m2_grade — the area's confidence grade, stored beside it, never better than max_grade. */
    permitted_fields: ['site_area_m2', 'site_area_m2_grade', 'inspire_id'],
    excluded_fields: ['*_name', 'title_number'],
    personal_name_exceptions: NO_NAMES,
    endpoint: 'https://use-land-property-data.service.gov.uk',
  },
  {
    source_id: 'CQC',
    publisher: 'Care Quality Commission',
    dataset: 'Locations & providers syndication',
    licence_id: 'CQC_SYNDICATION',
    default_prov: 'API',
    max_grade: 'A',
    permitted_fields: [
      'cqc_location_id', 'cqc_provider_id', 'registration_status', 'registration_date',
      'beds_registered', 'regulated_activities', 'service_types', 'specialisms', 'location_postcode',
    ],
    excluded_fields: ['registered_manager*', 'nominated_individual*', 'provider_name_sole_trader', '*_person_name'],
    personal_name_exceptions: NO_NAMES,
    endpoint: 'https://api.service.cqc.org.uk',
  },
  {
    /* PHASE 155 (line 1), 4 October 2026: built — a downloaded file, imported on this server (09-app/backend/src/web/
       register-files.ts), never a call per client. CIW publishes its whole directory as one CSV; there is no API. Its
       file has no registration status and no service registration date (only the provider's), so neither is kept.
       BULK, not API: the file is downloaded by a person. The named Responsible Individuals and Registered Persons are
       in the file and are never read. */
    source_id: 'CIW',
    publisher: 'Care Inspectorate Wales',
    dataset: 'Registered services (social care, Wales) — the directory download',
    licence_id: 'OGL_V3',
    default_prov: 'API',
    max_grade: 'A',
    permitted_fields: ['ciw_service_id', 'service_categories', 'service_subtype', 'capacity', 'location_postcode',
      'ciw_uprn', 'local_authority', 'ciw_provider_id', 'provider_type', 'provider_registration_date'],
    excluded_fields: ['responsible_individual*', 'manager_name*', 'registered_person*', 'provider_name*', '*_email*', '*_telephone*'],
    personal_name_exceptions: NO_NAMES,
    endpoint: 'https://digital.careinspectorate.wales',
  },
  {
    /* PHASE 155 (line 2), 4 October 2026: the Care Inspectorate, Scotland's care regulator — new. Its datastore is a
       monthly CSV of every registered care service, under the Open Government Licence; there is no API. Imported on
       this server like CIW's. Its file names a manager and gives a telephone number and an email for each service:
       none is ever read. */
    source_id: 'CARE_INSPECTORATE',
    publisher: 'Care Inspectorate (Scotland)',
    dataset: 'Datastore of registered care services (Scotland) — monthly download',
    licence_id: 'OGL_V3',
    default_prov: 'API',
    max_grade: 'A',
    permitted_fields: ['ci_cs_number', 'care_service', 'care_subtype', 'registered_places', 'total_beds', 'registration_date',
      'service_status', 'ci_uprn', 'local_authority', 'ci_provider_number', 'location_postcode'],
    excluded_fields: ['manager*', 'service_provider_name*', '*_email*', '*_phone*'],
    personal_name_exceptions: NO_NAMES,
    endpoint: 'https://www.careinspectorate.scot',
  },
  {
    source_id: 'EPC',
    publisher: 'MHCLG',
    dataset: 'Energy Performance of Buildings register',
    licence_id: 'EPC_ENGLAND_WALES',
    default_prov: 'API',
    max_grade: 'A',
    permitted_fields: [
      'epc_total_floor_area_m2', 'epc_property_type', 'epc_construction_age_band',
      'epc_tenure', 'epc_lodgement_date', 'epc_rrn',
    ],
    excluded_fields: ['assessor_*'],
    personal_name_exceptions: NO_NAMES,
    // Phase 64: the service moved from epc.opendatacommunities.org on 30 May 2026;
    // the old host now 301s here. Coverage is England & Wales ONLY — the service
    // itself directs Scotland to the Scottish EPC Register, and Northern Ireland
    // is on the separate EPB NI register. Neither is in this register yet.
    // Phase 146c, 23 September 2026: this was the service's WEBSITE. The API is
    // its own host, and the register carries the address a call goes to — as it
    // does for Companies House and CQC. The website is in SUPPLIER_DOCS below.
    endpoint: 'https://api.get-energy-performance-data.communities.gov.uk',
  },
  {
    source_id: 'VOA',
    publisher: 'Valuation Office Agency',
    dataset: 'Rating list summary valuation',
    licence_id: 'VOA_RATING_LIST',
    default_prov: 'API',
    max_grade: 'A',
    permitted_fields: ['voa_total_area_m2', 'voa_summary_valuation', 'voa_scat_code', 'voa_ba_reference', 'voa_effective_date'],
    excluded_fields: ['ratepayer_*'],
    personal_name_exceptions: NO_NAMES,
    endpoint: null,
  },
  {
    /**
     * HIGHEST RISK SOURCE (subitem 12818304906). The whitelist is deliberately tiny.
     *
     * WHAT THIS COMMENT USED TO SAY, AND WHY IT WAS WRONG (corrected by Phase 146d, 23 September 2026). It said the
     * whitelist "contains no free-text field that could carry a third party's name". IT DOES: `planning_description`
     * is free text, and a planning description routinely carries a surname — "Erection of a rear extension for Mr
     * Smith" is an ordinary way for an authority to write one. A comment that says a risk is absent is worse than no
     * comment at all, because the next reader stops looking.
     *
     * THE FIELD IS KEPT ALL THE SAME, AND HERE IS THE REASONING, so that this is a decision on the record rather
     * than an oversight with a nicer comment on it. The name exclusion register excludes `comment_*` and
     * `correspondence_*` WHOLESALE and states the rule behind it: "the rule for a free-text field that MAY carry a
     * name is exclusion of the whole field, never a best-effort filter." That rule was written about text produced
     * BY third parties ABOUT themselves — objectors and neighbours, people with no connection whatsoever to the
     * client or the claim, in whom no legitimate interest is claimed. A description is a different thing in every
     * respect that matters: it is written by the authority, about the WORKS, on a statutory public register, and —
     * because a planning record is kept only when it matched THE CLIENT'S OWN PROPERTY at ACCEPT — any applicant it
     * names is overwhelmingly the client or their agent, not a stranger. It is also the single most useful planning
     * fact this system has: what was built, and when, is what a capital allowances claim turns on.
     *
     * SO THE POSITION IS: the field stays, the comment tells the truth about it, and the data protection officer is
     * asked to confirm that reading rather than being left to discover it. No best-effort name filter is built, and
     * none should be — that is the one thing the register's own rule forbids outright.
     *
     * `officer*` AND `case_officer*` ARE EXCLUDED (Phase 146d). A case officer is a named council employee who is
     * not our client and has no connection to the claim. Nothing we call today returns one into a kept field, but
     * BOTH candidate suppliers publish one: Homedata's /planning/search/ documents that it returns "case officer
     * details", and PlanIt's own answer carries `case_officer`, `applicant_name`, `agent_name` and `agent_address`
     * inside its `other_fields` object — checked on a live PlanIt response on 23 September 2026, so this is not an
     * assumption that the risk arrived with the paid supplier. It was already there. The connector reads named keys
     * only and never touches `other_fields`, so nothing leaks today; these patterns are the second line, for the day
     * somebody reads one field more.
     */
    source_id: 'PLANNING',
    publisher: 'Local planning authority / planning.data.gov.uk',
    dataset: 'Planning applications',
    licence_id: 'OGL_V3',
    default_prov: 'API',
    max_grade: 'B',
    permitted_fields: [
      'planning_reference', 'planning_decision', 'planning_decision_date',
      'planning_received_date', 'planning_description', 'planning_uprn',
    ],
    excluded_fields: [
      'applicant_*', 'agent_*', 'objector_*', 'neighbour_*', 'comment_*', 'consultee_*', 'correspondence_*',
      // Phase 146d: a bare '*', because the field PlanIt sends is `case_officer` with nothing after it.
      'officer*', 'case_officer*',
    ],
    personal_name_exceptions: NO_NAMES,
    endpoint: 'https://www.planit.org.uk/api',
  },
  {
    source_id: 'BCIS',
    publisher: 'RICS / BCIS',
    dataset: 'Elemental cost rates',
    licence_id: 'BCIS_COMMERCIAL',
    default_prov: 'API',
    max_grade: 'A',
    permitted_fields: ['bcis_rate_*', 'bcis_index_*', 'bcis_rebase_date', 'bcis_location_factor'],
    excluded_fields: [],
    personal_name_exceptions: NO_NAMES,
    endpoint: null,
  },
  {
    /**
     * Board item 12991298199. The thing that produces LEG-E4's `location_key`,
     * which nothing in this system produced until 8 September 2026 — and that,
     * not the price-book purchase, was why LEG-E4 could not ship.
     *
     * NO PERSONAL DATA REACHES THIS SOURCE AT ALL. It maps a postcode to a
     * council area from a static published table. There is no proprietor, no
     * person of significant control, no name anywhere in the product, which is
     * what makes the whitelist below as small as it is.
     *
     * Grade A: a register lookup over a published dataset, which is §0.5's own
     * worked example of an A.
     */
    source_id: 'ONS_POSTCODE',
    publisher: 'Office for National Statistics',
    dataset: 'National Statistics Postcode Lookup',
    licence_id: 'ONS_POSTCODE_OGL',
    default_prov: 'API',
    max_grade: 'A',
    permitted_fields: ['ons_lad_code', 'ons_lad_name', 'ons_country_code', 'ons_postcode_terminated_on'],
    excluded_fields: ['*_name_of_person', 'occupier_*', 'resident_*'],
    personal_name_exceptions: NO_NAMES,
    /* Null on purpose. The engine makes no network call to ONS or to anyone
       else; the table is ingested out of band and read locally. */
    endpoint: null,
  },
  {
    /**
     * Board item 13003875907. The source CB_REGISTRY keys every other lookup on
     * (`homedata`: fields uprn, address_line, postcode; no personal fields).
     * The whitelist is exactly that response shape and nothing wider. Grade B,
     * not A: the supplier provides the data "as is" (Terms §6) and is a reseller
     * of the register, not the register. See HOMEDATA_TERMS for what is and is
     * not published.
     */
    source_id: 'HOMEDATA_ADDRESS',
    publisher: 'Homedata (supplier); underlying data Ordnance Survey AddressBase and Royal Mail PAF, as the supplier states',
    dataset: 'Address search and retrieve — UPRN, address line, postcode, coordinates',
    licence_id: 'HOMEDATA_TERMS',
    default_prov: 'API',
    max_grade: 'B',
    /**
     * PHASE 146d, 23 September 2026 — LATITUDE AND LONGITUDE ADDED, and it is a fix rather than an extension.
     *
     * The spatial screen (board item 12830181761 — the check that two records are about the same building) is
     * geometry-keyed, and its own specification says the coordinates come from THIS lookup. NOTHING ELSE IN THIS
     * REGISTER SUPPLIES A COORDINATE AT ALL: every other row is an identifier, an area, a date or a status. So while
     * this whitelist stopped at three fields, the screen could not be fed by anything, and a contamination check
     * that cannot run is not a check.
     *
     * A COORDINATE IS NOT PERSONAL DATA HERE. It is a point on the ground identifying a building, which is what this
     * whole register is about; it says nothing about who is inside it. The rows that WOULD say that — `occupier_*`
     * and `resident_*` — are excluded below and are the reason this connector asks for named slugs and never for one
     * of the supplier's bundles.
     *
     * USRN, TOID AND UDPRN ARE DECIDED AND EXCLUDED, rather than left unmentioned. USRN identifies a street, TOID an
     * Ordnance Survey map feature and UDPRN a Royal Mail delivery point. Each is a real identifier and each would be
     * another key we could match on one day — but nothing in this build reads one, an identifier nobody uses is data
     * held for no purpose, and the supplier publishes no permission to hold its identifiers at all. If something
     * later needs one, it is added here with the reason, which is the point of naming them now.
     */
    /* Phase 151a: easting and northing, published in Homedata's own schema (property_lite, read 24 September 2026). They
       are the British National Grid point the land boundary lookup needs, with no conversion — Homedata labels its
       latitude and longitude WGS84, which the exact conversion (OSTN15, from ETRS89) does not take. */
    permitted_fields: ['uprn', 'address_line', 'postcode', 'latitude', 'longitude', 'easting', 'northing'],
    excluded_fields: ['*_name', 'occupier_*', 'resident_*', 'owner_*', 'proprietor_*', 'usrn', 'toid', 'udprn'],
    personal_name_exceptions: NO_NAMES,
    /* PHASE 146d: CORRECTED FROM https://api.homedata.co.uk/api/address/ ON A LIVE RESPONSE, 23 September 2026. The
       supplier's endpoint reference states "Base URL: https://api.homedata.co.uk/api" while every worked example on
       the same page omits the /api, so the documentation could not settle it. The open, unauthenticated /ping did:
       GET https://api.homedata.co.uk/ping answered 200 and /api/ping answered 404, and the supplier's public
       OpenAPI document declares all 155 of its paths without the prefix. The /api form IS still routed — it is an
       alias — but the root is the canonical one and is the one we call. */
    endpoint: 'https://api.homedata.co.uk/address/',
  },
  {
    /**
     * PHASE 156f (B4), 6 October 2026 — THE SITE AREA FROM THE TITLE OUTLINE, VIA HOMEDATA. Lakhbir: "site boundary - use
     * home data". Homedata's `title_boundary` slug (5 tokens) on the paid address lookup's own property call; the outline
     * is turned into one area by the boundary module (09-app/backend/src/connectors/title-boundary.ts) and THE OUTLINE IS
     * NEVER KEPT. Its own source, so nobody reads the area as HM Land Registry's own file (HMLR_INSPIRE) or as an address
     * fact (HOMEDATA_ADDRESS). Grade B at best, as HMLR_INSPIRE: a reseller's copy of HM Land Registry's index polygon,
     * which "cannot" establish the extent of a title. HOMEDATA_TERMS keeps every report channel closed: internal only,
     * as the INSPIRE area is, until Homedata's terms for title outlines are confirmed.
     */
    source_id: 'HOMEDATA_BOUNDARY',
    publisher: 'Homedata (supplier); underlying data HM Land Registry title outlines, as the supplier states',
    dataset: 'Title boundary (the title_boundary item on a property) — kept only as its area',
    licence_id: 'HOMEDATA_TERMS',
    default_prov: 'API',
    max_grade: 'B',
    permitted_fields: ['site_area_m2', 'site_area_m2_grade', 'uprn'],
    excluded_fields: ['*_name', 'title_number', 'occupier_*', 'resident_*', 'owner_*', 'proprietor_*'],
    personal_name_exceptions: NO_NAMES,
    endpoint: 'https://api.homedata.co.uk/property/',
  },
  {
    source_id: 'CLIENT_ANSWER',
    publisher: 'Client',
    dataset: 'Assessment answers',
    licence_id: 'CLIENT_SUPPLIED',
    default_prov: 'CA',
    max_grade: 'C', // I-17: a C-grade field may not drive a GATE uncorroborated.
    permitted_fields: ['*'],
    excluded_fields: [],
    personal_name_exceptions: NO_NAMES,
    endpoint: null,
  },
  {
    source_id: 'CLIENT_DOC',
    publisher: 'Client',
    dataset: 'Uploaded documents',
    licence_id: 'CLIENT_SUPPLIED',
    default_prov: 'CD',
    max_grade: 'B',
    permitted_fields: ['*'],
    excluded_fields: [],
    personal_name_exceptions: NO_NAMES,
    endpoint: null,
  },
  {
    source_id: 'SURVEYOR',
    publisher: 'Caprebate (chartered surveyor)',
    dataset: 'Site survey and CAVR',
    licence_id: 'CAPREBATE_OWN',
    default_prov: 'SV',
    max_grade: 'D', // D by nature: surveyor judgement. Never mints an A.
    permitted_fields: ['*'],
    excluded_fields: [],
    personal_name_exceptions: NO_NAMES,
    endpoint: null,
  },
  {
    source_id: 'CTA',
    publisher: 'Caprebate (chartered tax adviser)',
    dataset: 'Filing position',
    licence_id: 'CAPREBATE_OWN',
    default_prov: 'CTA',
    max_grade: 'E',
    permitted_fields: ['*'],
    excluded_fields: [],
    personal_name_exceptions: NO_NAMES,
    endpoint: null,
  },
  {
    source_id: 'ENGINE',
    publisher: 'Caprebate',
    dataset: 'Derived by the estimate engine',
    licence_id: 'CAPREBATE_OWN',
    default_prov: 'DR',
    max_grade: 'A', // capped further by grade inheritance at derive() time.
    permitted_fields: ['*'],
    excluded_fields: [],
    personal_name_exceptions: NO_NAMES,
    endpoint: null,
  },
  {
    /** Phase 151, 24 September 2026. The free postcode check at the address question. See POSTCODES_IO_OPEN. */
    source_id: 'POSTCODES_IO',
    publisher: 'Postcodes.io',
    dataset: 'Postcode lookup (ONS Postcode Directory and OS Code-Point Open)',
    licence_id: 'POSTCODES_IO_OPEN',
    default_prov: 'API',
    /* B, not A: a service built on the ONS table, not the ONS table itself — the same reasoning as HOMEDATA_ADDRESS. */
    max_grade: 'B',
    permitted_fields: ['pio_postcode', 'pio_admin_district', 'pio_region', 'pio_country'],
    excluded_fields: ['*_name_of_person', 'occupier_*', 'resident_*'],
    personal_name_exceptions: NO_NAMES,
    endpoint: 'https://api.postcodes.io',
  },
];

/* ------------------------------------------------------------------ *
 * 3a. What each supplier publishes, and when we read it — Phase 146c.
 *
 *     Every connector built in Phase 146c (09-app/backend/src/connectors/)
 *     was built against the documentation below, read on the date given.
 *     A connector's fields, paths and limits come from these pages and from
 *     nowhere else; when a supplier changes them, this is the list to re-read
 *     and re-date. `api_base` is every address a connector for the source
 *     calls — 09-app/backend/src/connectors/sources.ts holds one row for each,
 *     and a test checks that every row there is listed here.
 *     `findings` records what the pages DO NOT say as carefully as what they
 *     do: an unpublished limit or term is written as unpublished, never
 *     guessed.
 * ------------------------------------------------------------------ */

export type SupplierDocs = {
  source_id: string;
  api_base: readonly string[];
  docs: readonly string[];
  read_on: string;
  findings: string;
};

export const SUPPLIER_DOCS: readonly SupplierDocs[] = [
  {
    source_id: 'CH_COMPANY',
    api_base: ['https://api.company-information.service.gov.uk', 'https://document-api.company-information.service.gov.uk'],
    docs: [
      'https://developer-specs.company-information.service.gov.uk/companies-house-public-data-api/reference/search/search-companies',
      'https://developer-specs.company-information.service.gov.uk/companies-house-public-data-api/reference/company-profile/company-profile',
      'https://developer-specs.company-information.service.gov.uk/companies-house-public-data-api/reference/filing-history/list',
      'https://developer-specs.company-information.service.gov.uk/companies-house-public-data-api/reference/officers/list', // Phase 151b (Word answer 156, read 25 September 2026): names read in memory for the signatory check, never kept
      'https://developer-specs.company-information.service.gov.uk/document-api/resources/documentmetadata',
      'https://developer-specs.company-information.service.gov.uk/guides/rateLimiting',
      'https://developer.company-information.service.gov.uk/authentication',
    ],
    read_on: '2026-09-23',
    findings:
      'HTTP Basic, the key as the user name and an empty password. "Up to 600 requests within a five-minute period", ' +
      'then 429. accounts.last_accounts.made_up_to is deprecated for period_end_on. An iXBRL copy of a filing is an ' +
      'application/xhtml+xml resource in the Document API metadata. NO FILLETED FLAG is published anywhere: a small ' +
      'company\'s accounts type does not say whether the profit and loss account was left off.',
  },
  {
    source_id: 'CH_PSC',
    api_base: ['https://api.company-information.service.gov.uk'],
    docs: ['https://developer-specs.company-information.service.gov.uk/companies-house-public-data-api/reference/persons-with-significant-control/list'],
    read_on: '2026-09-23',
    findings:
      'items[] of kind, name, natures_of_control, ceased_on (and name_elements, notified_on, links). Parameters ' +
      'items_per_page, start_index, register_view. A super-secure entry carries no name.',
  },
  {
    /* PHASE 155, 4 October 2026 — three sources read for their terms before any code (the phase's own rule). */
    source_id: 'CIW',
    api_base: ['https://digital.careinspectorate.wales'],
    docs: [
      'https://digital.careinspectorate.wales/data-extract',
      'https://digital.careinspectorate.wales/api/DataExport',
      'https://www.careinspectorate.wales/copyright',
    ],
    read_on: '2026-10-04',
    findings:
      'No API. The directory is one CSV (ciw_services_YYYYMMDD_HHMM.csv, about 5 MB, 87 columns, every field quoted, UTF-8, ' +
      'CRLF, line breaks inside some fields), generated on request and "refreshed on an ongoing basis". The download ' +
      'address is the directory app\'s own and is not documented, so it may change. No licence on the extract page; ' +
      'CIW\'s site-wide copyright notice puts its information under the Open Government Licence. No registration status ' +
      'and no service registration date (only the provider\'s). It names Responsible Individuals and Registered Persons, ' +
      'which are personal data the OGL does not cover: never read.',
  },
  {
    source_id: 'CARE_INSPECTORATE',
    api_base: ['https://ci-web-media-production-bucket.s3.eu-west-2.amazonaws.com'],
    docs: [
      'https://www.careinspectorate.scot/resources-data/data-and-statistics/datastore',
      'https://ci-web-media-production-bucket.s3.eu-west-2.amazonaws.com/assets/resources/datastore/260831datastoreexternal.csv',
    ],
    read_on: '2026-10-04',
    findings:
      'No API. A monthly datastore of every registered care service, CSV and XLSX (YYMMDDdatastoreexternal, about 10 MB, ' +
      '109 columns, Windows-1252 encoded, header unquoted, CRLF), "updated monthly"; the latest is 31 August 2026. "Unless ' +
      'otherwise stated, all content is available under the Open Government Licence." Year-suffixed columns are renamed ' +
      'as the years roll on, so only the stable ones are read. It names a manager and gives a telephone and an email per ' +
      'service: never read.',
  },
  {
    source_id: 'VOA',
    api_base: ['https://voaratinglists.blob.core.windows.net'],
    docs: [
      'https://voaratinglists.blob.core.windows.net/html/rlidata.htm',
      'https://www.tax.service.gov.uk/view-my-valuation/terms-and-conditions',
    ],
    read_on: '2026-10-04',
    findings:
      'NOT FOR OUR USE. The bulk rating list download (list entries about 93 MB zipped, 511 MB unzipped; summary ' +
      'valuations 155 MB and 735 MB; asterisk-delimited despite the .csv name; no UPRN) sits behind an "I Agree" to ' +
      'terms that say "An open government licence does not apply" and "Publication of this information and its use is ' +
      'restricted to Non Domestic Rating (NDR) purposes only". Capital allowances work is not an NDR purpose, so it is ' +
      'recorded here and not imported (licence VOA_RATING_LIST).',
  },
  {
    source_id: 'CQC',
    api_base: ['https://api.service.cqc.org.uk'],
    docs: [
      'https://api-portal.service.cqc.org.uk/api-details#api=syndication',
      'https://www.cqc.org.uk/about-us/transparency/using-cqc-data',
    ],
    read_on: '2026-09-23',
    findings:
      'Base /public/v1, the Ocp-Apim-Subscription-Key header, subscription required. /locations has NO POSTCODE FILTER ' +
      '(it filters by local authority, service type, region and others) and its items carry only locationId, ' +
      'locationName and postalCode. No rate limit is published on the current portal. No API terms are published ' +
      '(the product lists none); the data is under the Open Government Licence and is "updated daily". A location\'s ' +
      'regulated activities and a provider carry named contacts, which are never read.',
  },
  {
    source_id: 'EPC',
    api_base: ['https://api.get-energy-performance-data.communities.gov.uk'],
    docs: [
      'https://get-energy-performance-data.communities.gov.uk/api-technical-documentation',
      'https://get-energy-performance-data.communities.gov.uk/making-a-request',
      'https://raw.githubusercontent.com/communitiesuk/epb-data-warehouse/main/api/api.yml',
      /* PHASE 146h, 23 September 2026 — THE TWO CODE ENDPOINTS, read the same day, which are how the domestic age
         band and tenure stop being letters and numbers and become facts. */
      'https://get-energy-performance-data.communities.gov.uk/api-technical-documentation/codes',
      'https://get-energy-performance-data.communities.gov.uk/api-technical-documentation/codes-info',
    ],
    read_on: '2026-09-23',
    findings:
      'A bearer token. "6000 requests every 5 minutes per originating IP address", then 429. Data "for buildings in ' +
      'England and Wales". /api/{domestic,non-domestic,display}/search by postcode, uprn or address; "no certificates ' +
      'found" is 404. Search results carry no floor area or building type; /api/certificate?certificate_number= does, ' +
      'under keys that vary with the certificate\'s schema. Domestic age band and tenure are codes. ' +
      'PHASE 146h, 23 Sep 2026, THE CODE LISTS, which decode them: GET /api/codes takes no parameter and answers ' +
      '{"data":["built_form","construction_age_band"]} - "a list of codes currently available", and the page gives ' +
      'only those two as examples rather than the whole list, so a code it does not name is asked for and not ' +
      'assumed. GET /api/codes/info takes code (REQUIRED, "one of the codes provided by the /api/codes/ endpoint"), ' +
      'key ("the key found as a value in EPC data") and schemaVersion ("the EPC schema version"), both optional, and ' +
      'answers {"data":[{"key":"NR","values":[{"value":"Detached","schemaVersion":"RdSAP-Schema-17.0",' +
      '"assessmentType":"RdSAP"}]}]}. NEITHER PAGE SAYS WHICH CERTIFICATE FIELDS ARE CODED - that is read off the ' +
      'certificates themselves: a domestic certificate carries tenure as a single coded value at the top level and ' +
      'construction_age_band as a code on EACH of sap_building_parts[], and its schema_type ("RdSAP-Schema-21.0.1") ' +
      'is the schemaVersion to ask for. The same key means different things under different schema versions, so a ' +
      'value returned for another version is not used and the field is left out instead.',
  },
  {
    source_id: 'HMLR_PPD',
    api_base: ['https://landregistry.data.gov.uk'],
    docs: [
      'https://www.gov.uk/government/statistical-data-sets/price-paid-data-downloads',
      'https://www.gov.uk/guidance/about-the-price-paid-data',
      'https://landregistry.data.gov.uk/app/doc/ppd',
    ],
    read_on: '2026-09-23',
    findings:
      'No key. /data/ppi/transaction-record.json?propertyAddress.postcode= returns result.items[] with pricePaid, ' +
      'transactionDate ("Thu, 19 Sep 2013"), estateType, propertyType, newBuild, transactionId and propertyAddress. ' +
      '"All residential property sales in England and Wales that are sold for value". The attribution line is fixed ' +
      'at 2021. No rate limit is published.',
  },
  {
    source_id: 'PLANNING',
    /* PHASE 146d adds api.homedata.co.uk as a THIRD address this source can be asked at — built, switched off, and
       not chosen. PlanIt remains the source of record; see src/connectors/homedata-planning.ts for why the choice is
       not a build decision. An address listed here is how a service row stays tied to its register source when the
       source has more than one publisher, which planning has had since Phase 146c. */
    api_base: ['https://www.planning.data.gov.uk', 'https://www.planit.org.uk', 'https://api.homedata.co.uk'],
    docs: [
      'https://www.planning.data.gov.uk/docs',
      'https://www.planning.data.gov.uk/dataset/planning-application',
      'https://www.planit.org.uk/api/',
      'https://www.planit.org.uk/faq/',
    ],
    read_on: '2026-09-23',
    findings:
      'planning.data.gov.uk: no key; /entity.json?dataset=planning-application&q=<postcode>; the dataset "is ' +
      'incomplete and is not yet ready for use"; only "polite rate-limiting" is asked. PlanIt: no key; ' +
      '/api/applics/json?pcode=&krad=; "one request to the /api/applics endpoint every minute", about 300 a day, and ' +
      'an identifier with an email address in the User-Agent (requests without one are blocked); "No attribution is ' +
      'necessary"; its owner writes that "it would not be wise to base any commercial services on the API". ' +
      'PHASE 146d, 23 Sep 2026, FROM A LIVE PlanIt RESPONSE rather than from its documentation: a record\u2019s ' +
      'own keys carry no officer and no applicant, but its other_fields object carries case_officer, ' +
      'applicant_name, agent_name, agent_address and comment_url. The connector reads named keys and never ' +
      'other_fields, so none of it is read; officer_* and case_officer_* are now excluded on the row as well. ' +
      'PlanIt also REQUIRES the postcode with its space: SW1A2AA answers 400 "No location found", SW1A 2AA ' +
      'answers 200, and postcodeKey already produces the spaced form. Homedata is a third possible publisher for ' +
      'this source: its planning_history slug (5 tokens) is keyed by UPRN, and its /planning/search/ endpoint is ' +
      'NOT used because its own documentation says that one returns "case officer details".',
  },
  {
    /* PHASE 146d, 23 September 2026. `api_base` is the host alone: settled on a LIVE response rather than on the
       prose, because the prose contradicts itself. */
    source_id: 'HOMEDATA_ADDRESS',
    api_base: ['https://api.homedata.co.uk'],
    docs: [
      'https://homedata.co.uk/docs',
      'https://homedata.co.uk/docs/authentication',
      'https://homedata.co.uk/docs/endpoints',
      'https://homedata.co.uk/docs/pricing',
      'https://api.homedata.co.uk/schema/yaml/',
    ],
    read_on: '2026-09-23',
    findings:
      'THE BASE URL IS THE HOST, NOT host + /api. The endpoint reference states "Base URL: ' +
      'https://api.homedata.co.uk/api" while every worked example on the same page omits the /api, and both forms ' +
      'are routed, so neither the documentation nor a 403 settled it. The open endpoints did: /ping answered 200 ' +
      'and /api/ping answered 404, and the public OpenAPI document declares all 155 paths without the prefix. ' +
      'AUTHENTICATION is "Authorization: Api-Key <key>" and the page says in terms "Use Api-Key prefix, not ' +
      'Bearer"; a key may also go in the query string, which we do not do. PRICES: 100 tokens = £1, so a token is ' +
      'a penny. /address/postcode/{postcode}/ and /address/find/ are 2; /property/{uprn}/ discovery is 1; the ' +
      '?with= slugs are address 5, lr_title 1, lr_title_full 10, dimensions 1, construction 1, council_tax 3, ' +
      'title_boundary 5, risks 7, planning_history 5; a ?with= chain costs the SUM of its slugs. The TIERS ' +
      '/base/ 10, /core/ 25 and /complete/ 50 are NOT used: core carries crime and demographics and complete adds ' +
      'deprivation, which this register excludes under occupier_* and resident_*. BILLING: "there is no monthly ' +
      'allowance and nothing resets"; "any 4xx other than a 402 and any 5xx is never billed" and a debit taken ' +
      'before a failure is refunded; a 402 keeps the base charge and its body carries required, available and a ' +
      'topup_url; an organisation\u2019s first ever payment is matched 100%, once. THE COST HEADERS DEPEND ON THE ' +
      'KIND OF KEY, which matters: "Wallet keys receive the X-Tokens-* pair and no rate-limit headers at all; ' +
      'quota keys receive the X-RateLimit-* family instead. You will not see both." So X-Tokens-Charged may simply ' +
      'be absent, and an absent charge is recorded as unknown rather than as nothing. The live service also sends ' +
      'x-call-weight, which we read as the same figure. RATE LIMITS ARE NOT PUBLISHED ANYWHERE: per API key, 429, ' +
      'honour Retry-After, and "a 429 costs nothing" — no number on the pricing, authentication or endpoint pages ' +
      'or in the OpenAPI document, and the coverage matrix is "available on request". THE PLAYGROUND NEEDS AN ' +
      'ACCOUNT: /developer/playground redirects to a log-in page and the live-demo page says "Create an account to ' +
      'run them against your own key", so no fixture could be captured from it and none was. RESPONSE SHAPES ARE ' +
      'NOT PUBLISHED AT ALL: every response in the OpenAPI document reads "200: No response body", so the field ' +
      'names the connector reads come from the endpoint reference\u2019s prose, the readers are deliberately ' +
      'tolerant, and THE FIRST LIVE CALL MUST CONFIRM THE SHAPE. Two further inconsistencies, recorded so nobody ' +
      're-derives them: /address/find/ is described on the pricing and endpoint pages but is absent from the ' +
      'OpenAPI document; and /properties/{uprn}/ (plural) is a deprecated alias of /property/{uprn}/. The ' +
      'marketing prose also still offers "bonus tokens with an optional monthly subscription", which is a ' +
      'subscription, not an allowance, and does not contradict "nothing resets". Its planning_history slug is ' +
      'named on the pricing page but does not appear in the module list the deprecated plural endpoint publishes, ' +
      'so that one slug is taken from the price list and must be confirmed on the first discovery call.',
  },
  {
    /* PHASE 146d, 23 September 2026. Nothing here can be called without the network access agreement, so every
       line below is from HM Land Registry's own public developer pack rather than from a response. */
    source_id: 'HMLR_TITLE',
    api_base: ['https://businessgateway.landregistry.gov.uk', 'https://bgtest.landregistry.gov.uk'],
    docs: [
      'https://www.gov.uk/guidance/hm-land-registry-business-gateway',
      'https://landregistry.github.io/bgtechdoc/rest/get_started/developer_guide/',
      'https://landregistry.github.io/bgtechdoc/get_started/vendor_testing_guide/',
      'https://landregistry.github.io/bg-dev-pack-redesign/find-a-service-api/',
    ],
    read_on: '2026-09-23',
    findings:
      'TWO ENVIRONMENTS ON TWO HOSTS: live businessgateway.landregistry.gov.uk, test bgtest.landregistry.gov.uk. ' +
      'Two families on each: REST under /bg2 (live) and /bg2test (test), SOAP under /b2b/BGSoapEngine (live) and ' +
      '/b2b/BGStubService (test). AUTHENTICATION IS TWO THINGS AT ONCE — "An active Business Gateway user account ' +
      'is required" for Basic authentication, AND "A valid SSL certificate, issued by Business Gateway, is ' +
      'required" as a client certificate on the connection. fetch cannot present a client certificate, which is ' +
      'why src/connectors/http.ts carries a certificate-bearing transport. THE SERVICES WE NEED: "Search by ' +
      'Property Description" (SOAP) — "find out the title number and tenure of a property based on the address ' +
      'supplied"; "Official Copy Title Known" (SOAP) — "order an official copy of the register"; and, published ' +
      'with its exact path, GET /s1/v1/titles/{title_number}/official-copies/availability (REST), which "Returns ' +
      'the OC1 document availability" and is free to ask, so it is asked before the fee is spent. ' +
      'GET /s2/v1/titles/{title_number}/registered-proprietor-names (REST) is published too. WHAT IS NOT ' +
      'PUBLISHED: the WSDL path of any individual SOAP service — those come with the developer pack under the ' +
      'network access agreement — and any rate limit. The SOAP paths in src/connectors/hmlr-title.ts are built ' +
      'from the one SOAP address HM Land Registry does publish and ARE MARKED UNCONFIRMED; a question is open with ' +
      'the developer. Nothing turns on the guess while the switch is off and no certificate is installed.',
  },
  {
    /* PHASE 150, 24 September 2026. Pages only: no polygon file, no map and no service was downloaded or called. */
    source_id: 'HMLR_INSPIRE',
    api_base: ['https://use-land-property-data.service.gov.uk'],
    docs: [
      'https://use-land-property-data.service.gov.uk/datasets/inspire',
      'https://use-land-property-data.service.gov.uk/datasets/inspire/download',
      'https://use-land-property-data.service.gov.uk/datasets/inspire/tech-guidance',
      'https://use-land-property-data.service.gov.uk/api-information',
      /* Phase 151a, the same day: the two lists the council table is derived from, and Ordnance Survey's conversion. */
      'https://services1.arcgis.com/ESMARspQHYMw9BZ9/arcgis/rest/services/LAD_APR_2025_UK_NC_v2/FeatureServer/0',
      'https://docs.os.uk/more-than-maps/a-guide-to-coordinate-systems-in-great-britain/from-one-coordinate-system-to-another-geodetic-transformations/national-grid-transformation-ostn15-etrs89-osgb36',
    ],
    read_on: '2026-09-24',
    findings:
      'NO KEY AND NO ACCOUNT. The download page lists 318 local authorities (published 6 September 2026), each a ' +
      'link of the form /datasets/inspire/download/<Council_Name>.zip with underscores for spaces, under the words ' +
      '"By downloading these datasets, you are agreeing to the OGL conditions of use". The API page lists the ' +
      'datasets its key reaches (company ownership, National Polygon Service, restrictive covenants, registered ' +
      'leases) and INSPIRE is NOT one of them, so no key is used. "The files are published as GML files"; "The ' +
      'dataset is updated on the first Sunday of each month and shows data from the previous month"; "If a polygon ' +
      'is on the boundary between local authorities, it will appear in both local authority data files"; freehold ' +
      'only; "The extent of the land contained in any registered title cannot be established from the INSPIRE ' +
      'Index Polygons". NOT PUBLISHED on any page read: the element names inside the GML, the name of the file ' +
      'inside the zip, a file size, and any rate limit. THE WEBSITE ANSWERS A FIRST VISIT WITH A 302 TO ITSELF ' +
      'THAT SETS A COOKIE (a plain request without cookies loops; with a cookie jar the pages answer 200). Whether ' +
      'the .zip links do the same, or redirect to another host, was NOT checked, because that means requesting a ' +
      'file. Our transport refuses every redirect, so if they do, the first download fails and says so rather ' +
      'than following it. The reader in src/connectors/inspire.ts is therefore tolerant of the element names and ' +
      'strict about everything else, and THE FIRST ALLOWED DOWNLOAD MUST CONFIRM THE SHAPE. ' +
      'PHASE 151a: ONS\'s "Local Authority Districts (April 2025) Names and Codes in the UK" was read from the ' +
      'feature service above (361 rows, 318 of them England and Wales, the same count as HM Land Registry\'s ' +
      'files; no 2026 names-and-codes list was on the portal). 310 councils pair with a file by name alone; the ' +
      'eight left over are paired by hand in src/connectors/inspire-councils.ts with the reason (Hull, Rutland, ' +
      'Durham, the City of London, St Albans, Newcastle, North Yorkshire, King\'s Lynn). Ordnance Survey\'s guide: ' +
      'OSTN15\'s shifts "cover Britain at a resolution of one kilometre" and are applied "by a bilinear ' +
      'interpolation"; a Helmert-type conversion is good to "only about 3 metres". No OSTN15 file was downloaded.',
  },
  {
    source_id: 'POSTCODES_IO',
    api_base: ['https://api.postcodes.io'],
    docs: ['https://postcodes.io/docs/overview', 'https://postcodes.io/docs/licences'],
    read_on: '2026-09-24',
    findings:
      'GET /postcodes/{postcode}, no authentication. 200 with {status, result:{postcode, admin_district, region, country, ' +
      'latitude, longitude, codes{...}}}; 404 with {status:404, error:"Postcode not found"} (a live call confirmed the shape ' +
      'on 24 Sep 2026). No address lines and no UPRN. GB under OS OpenData and the OGL; BT postcodes need an LPS licence ' +
      'for commercial use. No rate limit, service level or hosting location published.',
  },
  {
    source_id: 'ONS_POSTCODE',
    api_base: [],
    docs: [
      'https://www.arcgis.com/home/item.html?id=9e5a92a3cfb14dc7ad43d6ea7a7b8c7f',
      'https://www.ons.gov.uk/methodology/geography/licences',
    ],
    read_on: '2026-09-23',
    findings:
      'August 2026 is the current release; its columns are lad26cd and ctry26cd (the ingest already reads either by ' +
      'pattern). ONS also publishes it as a hosted table with a query API, which we do not use: the table is read on ' +
      'our own server. Three attribution lines (OS, Royal Mail, ONS). Northern Ireland needs a separate licence.',
  },
];

/* ------------------------------------------------------------------ *
 * 4. The register
 * ------------------------------------------------------------------ */

function globMatch(pattern: string, field: string): boolean {
  if (pattern === '*') return true;
  if (pattern.endsWith('*')) return field.startsWith(pattern.slice(0, -1));
  if (pattern.startsWith('*')) return field.endsWith(pattern.slice(1));
  return pattern === field;
}

const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/;

export type Clock = () => string;

export class SourceRegister {
  #sources = new Map<string, Source>();
  #licences = new Map<string, Licence>();
  #skewToleranceMs: number;
  clock: Clock;

  constructor(
    opts: { sources?: readonly Source[]; licences?: readonly Licence[]; clock?: Clock; skewToleranceMs?: number } = {},
  ) {
    for (const l of opts.licences ?? LICENCES) this.#licences.set(l.licence_id, l);
    for (const s of opts.sources ?? SOURCES) {
      if (!this.#licences.has(s.licence_id)) {
        throw new ProvenanceError(
          'E_UNKNOWN_LICENCE',
          `source ${s.source_id} names licence ${s.licence_id}, which is not registered`,
          { source_id: s.source_id },
        );
      }
      this.#sources.set(s.source_id, s);
    }
    this.clock = opts.clock ?? (() => new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'));
    this.#skewToleranceMs = opts.skewToleranceMs ?? 60_000;
  }

  source(id: string): Source {
    const s = this.#sources.get(id);
    if (!s) throw new ProvenanceError('E_UNKNOWN_SOURCE', `source '${id}' is not in the register`, { source_id: id });
    return s;
  }

  licence(id: string): Licence {
    const l = this.#licences.get(id);
    if (!l) throw new ProvenanceError('E_UNKNOWN_LICENCE', `licence '${id}' is not in the register`, { licence_id: id });
    return l;
  }

  licenceFor(sourceId: string): Licence {
    return this.licence(this.source(sourceId).licence_id);
  }

  sources(): readonly Source[] {
    return [...this.#sources.values()];
  }

  /** Sources whose licence has not been read and cleared by the solicitor/DPO. Flagged, not assumed. */
  awaitingLegalReview(): readonly Source[] {
    return this.sources().filter((s) => this.licence(s.licence_id).legal_review_required);
  }

  assertFieldPermitted(sourceId: string, fieldId: string): void {
    const s = this.source(sourceId);
    for (const p of s.excluded_fields) {
      if (globMatch(p, fieldId)) {
        throw new ProvenanceError(
          'E_FIELD_EXCLUDED',
          `field '${fieldId}' is on the exclusion list for source '${sourceId}' (pattern '${p}')`,
          { source_id: sourceId, field_id: fieldId, pattern: p },
        );
      }
    }
    if (!s.permitted_fields.some((p) => globMatch(p, fieldId))) {
      throw new ProvenanceError(
        'E_FIELD_NOT_PERMITTED',
        `field '${fieldId}' is not on the KEEP list for source '${sourceId}'`,
        { source_id: sourceId, field_id: fieldId },
      );
    }
  }

  assertRetrieval(r: Retrieval | undefined): asserts r is Retrieval {
    if (!r || typeof r !== 'object') throw new ProvenanceError('E_NO_RETRIEVED_AT', 'no retrieval block supplied');
    if (typeof r.retrieved_at !== 'string' || r.retrieved_at.length === 0) {
      throw new ProvenanceError('E_NO_RETRIEVED_AT', 'retrieved_at is missing');
    }
    if (!ISO_RE.test(r.retrieved_at)) {
      throw new ProvenanceError(
        'E_BAD_TIMESTAMP',
        `retrieved_at '${r.retrieved_at}' is not ISO-8601 UTC (YYYY-MM-DDTHH:MM:SSZ)`,
        { retrieved_at: r.retrieved_at },
      );
    }
    const t = Date.parse(r.retrieved_at);
    if (Number.isNaN(t)) throw new ProvenanceError('E_BAD_TIMESTAMP', `retrieved_at '${r.retrieved_at}' does not parse`);
    if (t - Date.parse(this.clock()) > this.#skewToleranceMs) {
      throw new ProvenanceError('E_FUTURE_TIMESTAMP', `retrieved_at '${r.retrieved_at}' is in the future`, {
        retrieved_at: r.retrieved_at,
        now: this.clock(),
      });
    }
    if (!r.locator || typeof r.locator !== 'string') {
      throw new ProvenanceError(
        'E_NO_RETRIEVED_AT',
        'retrieval.locator is missing — provenance must name the specific thing read',
      );
    }
  }
}

/* ------------------------------------------------------------------ *
 * 5. Integrity hash
 * ------------------------------------------------------------------ */

function canonical(v: unknown): string {
  if (v === null || v === undefined) return 'null';
  if (Array.isArray(v)) return '[' + v.map(canonical).join(',') + ']';
  if (typeof v === 'object') {
    const o = v as Record<string, unknown>;
    return '{' + Object.keys(o).sort().map((k) => JSON.stringify(k) + ':' + canonical(o[k])).join(',') + '}';
  }
  return JSON.stringify(v);
}

function integrityOf(parts: {
  entity_id: string;
  field_id: string;
  state: CellState;
  value: unknown;
  prov: Provenance;
}): string {
  return createHash('sha256').update(canonical(parts)).digest('hex');
}

/* ------------------------------------------------------------------ *
 * 6. The write path — the only two ways a Cell can come into existence
 * ------------------------------------------------------------------ */

export type RecordInput<T> = {
  entity_id: string;
  field_id: string;
  source_id: string;
  retrieval: Retrieval;
  /** Supply exactly one of value or unknown:true. */
  value?: T;
  unknown?: true;
  /** Overrides the source default. May never be BETTER than the source's max_grade. */
  grade?: Grade;
  prov?: ProvCode;
};

export function record<T>(reg: SourceRegister, input: RecordInput<T>): Cell<T> {
  const src = reg.source(input.source_id);
  reg.assertFieldPermitted(input.source_id, input.field_id);
  reg.assertRetrieval(input.retrieval);

  const isUnknown = input.unknown === true;
  if (isUnknown && input.value !== undefined) {
    throw new ProvenanceError('E_STATE_VALUE_MISMATCH', 'a cell marked UNKNOWN may not also carry a value', {
      field_id: input.field_id,
    });
  }
  if (!isUnknown && input.value === undefined) {
    throw new ProvenanceError(
      'E_STATE_VALUE_MISMATCH',
      `field '${input.field_id}' has no value and is not marked UNKNOWN. ` +
        '"Not yet asked" is the absence of a cell, never a cell holding null',
      { field_id: input.field_id },
    );
  }

  const grade = input.grade ?? src.max_grade;
  if (GRADE_ORDER[grade] < GRADE_ORDER[src.max_grade]) {
    throw new ProvenanceError(
      'E_GRADE_EXCEEDS_SOURCE',
      `grade ${grade} is better than the best grade source '${src.source_id}' can produce (${src.max_grade})`,
      { field_id: input.field_id, grade, max_grade: src.max_grade },
    );
  }

  const prov: Provenance = {
    source_id: src.source_id,
    publisher: src.publisher,
    licence_id: src.licence_id,
    prov: input.prov ?? src.default_prov,
    grade,
    retrieval: input.retrieval,
    recorded_at: reg.clock(),
    derived_from: [],
    computation: null,
    effective_retrieved_at: input.retrieval.retrieved_at,
    effective_cache_max_age_days: reg.licence(src.licence_id).cache_max_age_days,
  };

  const state: CellState = isUnknown ? 'UNKNOWN' : 'VALUE';
  const value = (isUnknown ? null : (input.value as T)) as T | null;
  const integrity = integrityOf({ entity_id: input.entity_id, field_id: input.field_id, state, value, prov });

  return {
    record_id: `${input.entity_id}::${input.field_id}::${integrity.slice(0, 16)}`,
    entity_id: input.entity_id,
    field_id: input.field_id,
    state,
    value,
    prov,
    integrity,
  } as unknown as Cell<T>;
}

export type DeriveInput<T> = {
  entity_id: string;
  field_id: string;
  inputs: readonly AnyCell[];
  computation: string;
  /** Called only when every input is in state VALUE. */
  compute: (values: readonly unknown[]) => T;
  source_id?: string;
};

/**
 * The only way to write a computed figure.
 * Enforces I-1 (UNKNOWN propagates, never coalesces) and I-2 (grade = worst input).
 */
export function derive<T>(reg: SourceRegister, input: DeriveInput<T>): Cell<T> {
  if (input.inputs.length === 0) {
    throw new ProvenanceError(
      'E_NO_INPUTS',
      `derived field '${input.field_id}' names no inputs — a figure with no inputs is not derived, it is asserted`,
      { field_id: input.field_id },
    );
  }
  const src = reg.source(input.source_id ?? 'ENGINE');
  reg.assertFieldPermitted(src.source_id, input.field_id);

  const grade = worstGrade(input.inputs.map((c) => c.prov.grade));
  const anyUnknown = input.inputs.some((c) => c.state === 'UNKNOWN');
  const effective = input.inputs
    .map((c) => c.prov.effective_retrieved_at)
    .reduce((a, b) => (Date.parse(b) < Date.parse(a) ? b : a));

  // Cache window inherits like the grade: strictest cap in the chain, including our own.
  const caps = [
    reg.licence(src.licence_id).cache_max_age_days,
    ...input.inputs.map((c) => c.prov.effective_cache_max_age_days),
  ].filter((n): n is number => typeof n === 'number');
  const effectiveCap = caps.length ? Math.min(...caps) : null;

  const prov: Provenance = {
    source_id: src.source_id,
    publisher: src.publisher,
    licence_id: src.licence_id,
    prov: 'DR',
    grade,
    retrieval: { retrieved_at: effective, method: 'COMPUTED', locator: input.computation },
    recorded_at: reg.clock(),
    derived_from: input.inputs.map((c) => c.record_id),
    computation: input.computation,
    effective_retrieved_at: effective,
    effective_cache_max_age_days: effectiveCap,
  };

  const state: CellState = anyUnknown ? 'UNKNOWN' : 'VALUE';
  const value = anyUnknown ? null : input.compute(input.inputs.map((c) => c.value));
  const integrity = integrityOf({ entity_id: input.entity_id, field_id: input.field_id, state, value, prov });

  return {
    record_id: `${input.entity_id}::${input.field_id}::${integrity.slice(0, 16)}`,
    entity_id: input.entity_id,
    field_id: input.field_id,
    state,
    value: value as T | null,
    prov,
    integrity,
  } as unknown as Cell<T>;
}

/* ------------------------------------------------------------------ *
 * 7. The store — append-only
 * ------------------------------------------------------------------ */

export type WriteReceipt = { record_id: string; version: number; superseded: string | null };

export class ProvenanceStore {
  #reg: SourceRegister;
  #versions = new Map<string, AnyCell[]>();
  #byRecordId = new Map<string, AnyCell>();

  constructor(reg: SourceRegister) {
    this.#reg = reg;
  }

  static #key(entity: string, field: string): string {
    return `${entity}::${field}`;
  }

  /**
   * The only write. Takes a Cell, which cannot be forged outside this module.
   * Re-validates at runtime so plain-JS callers get the same guarantee.
   */
  put(cell: AnyCell): WriteReceipt {
    verify(this.#reg, cell);
    const key = ProvenanceStore.#key(cell.entity_id, cell.field_id);
    const chain = this.#versions.get(key) ?? [];
    const superseded = chain.length > 0 ? chain[chain.length - 1].record_id : null;
    chain.push(cell);
    this.#versions.set(key, chain);
    this.#byRecordId.set(cell.record_id, cell);
    return { record_id: cell.record_id, version: chain.length, superseded };
  }

  /** Latest version, or null for "never asked". Returns the cell, never a bare value. */
  get<T = unknown>(entity_id: string, field_id: string): Cell<T> | null {
    const chain = this.#versions.get(ProvenanceStore.#key(entity_id, field_id));
    return chain && chain.length ? (chain[chain.length - 1] as Cell<T>) : null;
  }

  /** Append-only: nothing is overwritten, so earlier provenance survives a correction. */
  history(entity_id: string, field_id: string): readonly AnyCell[] {
    return [...(this.#versions.get(ProvenanceStore.#key(entity_id, field_id)) ?? [])];
  }

  byRecordId(record_id: string): AnyCell | null {
    return this.#byRecordId.get(record_id) ?? null;
  }

  all(entity_id: string): readonly AnyCell[] {
    const out: AnyCell[] = [];
    for (const [k, chain] of this.#versions) {
      if (k.startsWith(`${entity_id}::`) && chain.length) out.push(chain[chain.length - 1]);
    }
    return out;
  }
}

/* ------------------------------------------------------------------ *
 * 8. Retrieval API
 * ------------------------------------------------------------------ */

/**
 * Deliberately verbose. Unwrapping should be visible in code review, and it
 * refuses to hand back a value for an UNKNOWN cell.
 */
export function unwrap<T>(cell: Cell<T>): T {
  if (cell.state === 'UNKNOWN') {
    throw new ProvenanceError(
      'E_STATE_VALUE_MISMATCH',
      `field '${cell.field_id}' is UNKNOWN — it has no value to unwrap. Route it to capture; do not default it`,
      { field_id: cell.field_id },
    );
  }
  return cell.value as T;
}

export function provenanceOf(cell: AnyCell): Provenance {
  return cell.prov;
}

export function verify(reg: SourceRegister, cell: AnyCell): void {
  if (!cell || typeof cell !== 'object' || typeof (cell as AnyCell).integrity !== 'string') {
    throw new ProvenanceError('E_NOT_A_CELL', 'value is not a provenance cell');
  }
  reg.source(cell.prov.source_id);
  reg.licence(cell.prov.licence_id);
  reg.assertFieldPermitted(cell.prov.source_id, cell.field_id);
  if (cell.prov.prov === 'DR' && cell.prov.derived_from.length === 0) {
    throw new ProvenanceError('E_NO_INPUTS', `derived cell '${cell.field_id}' names no inputs`);
  }
  const expected = integrityOf({
    entity_id: cell.entity_id,
    field_id: cell.field_id,
    state: cell.state,
    value: cell.value,
    prov: cell.prov,
  });
  if (expected !== cell.integrity) {
    throw new ProvenanceError(
      'E_INTEGRITY',
      `integrity hash mismatch on '${cell.field_id}' — value and provenance have been separated or altered`,
      { field_id: cell.field_id },
    );
  }
}

export type TrailNode = {
  record_id: string;
  field_id: string;
  state: CellState;
  value: unknown;
  publisher: string;
  licence: string;
  prov: ProvCode;
  grade: Grade;
  retrieved_at: string;
  locator: string;
  computation: string | null;
  inputs: TrailNode[];
};

/** The answer to "where did this number come from", rendered from the record itself. */
export function evidenceTrail(
  reg: SourceRegister,
  store: ProvenanceStore,
  entity_id: string,
  field_id: string,
): TrailNode | null {
  const cell = store.get(entity_id, field_id);
  if (!cell) return null;
  const seen = new Set<string>();
  const build = (c: AnyCell): TrailNode => {
    seen.add(c.record_id);
    return {
      record_id: c.record_id,
      field_id: c.field_id,
      state: c.state,
      value: c.value,
      publisher: c.prov.publisher,
      licence: reg.licence(c.prov.licence_id).name,
      prov: c.prov.prov,
      grade: c.prov.grade,
      retrieved_at: c.prov.retrieval.retrieved_at,
      locator: c.prov.retrieval.locator,
      computation: c.prov.computation,
      inputs: c.prov.derived_from
        .map((id) => store.byRecordId(id))
        .filter((x): x is AnyCell => x !== null && !seen.has(x.record_id))
        .map(build),
    };
  };
  return build(cell as AnyCell);
}

/** Verbatim attribution lines a report carrying these cells must print. Deduplicated, sorted. */
export function attributionsFor(reg: SourceRegister, cells: readonly AnyCell[]): readonly string[] {
  const out = new Set<string>();
  for (const c of cells) {
    const l = reg.licence(c.prov.licence_id);
    if (l.attribution_required && l.attribution_text) out.add(l.attribution_text);
  }
  return [...out].sort();
}

export type RedistributionBreach = { field_id: string; source_id: string; licence_id: string; channel: Channel };

/** Which of these cells may not be reproduced in the named output. Empty array = clear. */
export function redistributionCheck(
  reg: SourceRegister,
  cells: readonly AnyCell[],
  channel: Channel,
): readonly RedistributionBreach[] {
  const out: RedistributionBreach[] = [];
  for (const c of cells) {
    const l = reg.licence(c.prov.licence_id);
    if (!l.redistribution[channel]) {
      out.push({ field_id: c.field_id, source_id: c.prov.source_id, licence_id: c.prov.licence_id, channel });
    }
  }
  return out;
}

export type StaleCell = { field_id: string; source_id: string; age_days: number; max_age_days: number };

/** Cells whose evidence is older than the licence permits. Measured on effective_retrieved_at. */
export function stalenessReport(
  reg: SourceRegister,
  cells: readonly AnyCell[],
  asOf?: string,
): readonly StaleCell[] {
  const now = Date.parse(asOf ?? reg.clock());
  const out: StaleCell[] = [];
  for (const c of cells) {
    const cap = c.prov.effective_cache_max_age_days;
    if (cap === null) continue;
    const ageDays = (now - Date.parse(c.prov.effective_retrieved_at)) / 86_400_000;
    if (ageDays > cap) {
      out.push({
        field_id: c.field_id,
        source_id: c.prov.source_id,
        age_days: Math.round(ageDays * 10) / 10,
        max_age_days: cap,
      });
    }
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * 9. Serialisation — provenance survives the wire
 * ------------------------------------------------------------------ */

export function serialise(cell: AnyCell): string {
  return JSON.stringify({
    v: 'caprebate.cell.v1',
    record_id: cell.record_id,
    entity_id: cell.entity_id,
    field_id: cell.field_id,
    state: cell.state,
    value: cell.value,
    prov: cell.prov,
    integrity: cell.integrity,
  });
}

/** Refuses anything whose hash does not recompute: a value stripped of provenance cannot re-enter. */
export function rehydrate<T = unknown>(reg: SourceRegister, json: string): Cell<T> {
  const raw = JSON.parse(json) as Record<string, unknown>;
  if (raw.v !== 'caprebate.cell.v1') throw new ProvenanceError('E_NOT_A_CELL', 'unrecognised cell envelope');
  const cell = {
    record_id: raw.record_id,
    entity_id: raw.entity_id,
    field_id: raw.field_id,
    state: raw.state,
    value: raw.value,
    prov: raw.prov,
    integrity: raw.integrity,
  } as unknown as Cell<T>;
  verify(reg, cell as AnyCell);
  return cell;
}
