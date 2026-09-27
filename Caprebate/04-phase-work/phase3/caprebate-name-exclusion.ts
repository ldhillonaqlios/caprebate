/**
 * Caprebate — Name Exclusion Register & Automated Assertion
 * Board item 12818313893. Phase 5, item 7.
 *
 * The rule, in one sentence: no register ingestion may write a natural
 * person's name to storage except the two documented exceptions (Companies
 * House PSC, and an individual HM Land Registry proprietor). Everything
 * else — assessor names, registered managers, nominated individuals,
 * responsible individuals, directors, secretaries, trustees, applicants,
 * agents, objectors, neighbours, ratepayers, registered persons — is
 * retrieved (where the source API forces it) and never recorded.
 *
 * This module is the single typed source of the source-by-source register
 * documented on the board item. The Monday doc's Part A is generated FROM
 * this data, not written alongside it, so the register and the code cannot
 * drift apart: change the KEEP/EXCLUDE list here and the documentation is
 * wrong until someone updates both, which is the same discipline the
 * source register (caprebate-source-register.ts, board 12830181420)
 * already applies to provenance. The two modules are deliberately
 * independent: that file governs what a source may write about a BUILDING
 * (provenance, licence, grade); this one governs what a source may write
 * about a PERSON (a name, or a field that identifies one). A field could
 * pass one and fail the other, and both must be checked.
 *
 * Fail-closed is the load-bearing property, not a footnote. A source that
 * is not in NAME_EXCLUSION_POLICY cannot write anything at all — not
 * because its fields have been checked and found safe, but because nobody
 * has looked yet. The same rule applies field-by-field on a REGISTERED
 * source: a field that is neither on the KEEP list, the EXCLUDE list, nor
 * one of the two named exceptions is UNCLASSIFIED and is refused, on the
 * ground that an uncatalogued field might be exactly the personal-name
 * field nobody has added to the policy yet. A new source or a new field
 * must earn its way onto a list before it can be written; it is never
 * assumed innocent by default.
 *
 * LIA cross-reference: board doc id 46389172 (item 5). This module is what
 * safeguards S1 and S11 refer to (LIA §7.3 table). The LIA supplies the
 * lawful-basis balancing test; this module supplies, and enforces, the
 * field-level rule the LIA depends on. Do not restate the balancing test
 * here — read it there.
 *
 * Runs on Node >= 22.6 with type stripping (`node file.ts`). No enums, no
 * namespaces, no parameter properties — those are not strippable.
 */

/* ------------------------------------------------------------------ *
 * 1. Types
 * ------------------------------------------------------------------ */

export type RiskLevel = 'standard' | 'highest';

export type ExceptionId =
  | 'EXCEPTION_1_PSC_COMMON_CONTROL'
  | 'EXCEPTION_2_HMLR_INDIVIDUAL_PROPRIETOR';

/**
 * One of the two documented, narrow retentions of a personal name.
 * Both are justified at board item 12818210932 and reasoned over in the
 * LIA (doc 46389172). This module cross-refers; it does not restate.
 */
export type NameFieldException = {
  field: string;
  exceptionId: ExceptionId;
  justification: string;
  crossRef: string;
};

/**
 * The source-by-source policy. `subitem` is the number of the item in the
 * board's own list (1-11; 12 is this test suite) and exists purely so a
 * reader can walk from the Monday item straight to the matching entry.
 */
export type SourceNamePolicy = {
  sourceId: string;
  subitem: number;
  publisher: string;
  datasetLabel: string;
  riskLevel: RiskLevel;
  /** Fields safe to write. Never carry, and never identify, a natural person. Glob-matched. */
  keptFields: readonly string[];
  /**
   * Fields that carry, or identify, a natural person, and are never written
   * outside a documented exception. Glob-matched. Includes identifiers that
   * do not look like "name" fields on their label alone (an assessor ID),
   * and free-text fields that may carry a name incidentally (a planning
   * comment) even though the field itself is not a name field by type.
   */
  excludedNameFields: readonly string[];
  /**
   * Other excluded personal data on this source that is NOT a name (a date
   * of birth, an address). Listed for completeness against the board
   * subitem and for Part A of the register; NOT consulted by
   * isPersonalNameField or assertNoUnauthorisedName, which are name-only.
   * Address/DOB minimisation is governed by board item 12818210932.
   */
  excludedOtherPersonalFields?: readonly string[];
  /** Empty unless this source carries one of the two documented exceptions. */
  nameExceptions: readonly NameFieldException[];
  note: string;
};

/* ------------------------------------------------------------------ *
 * 2. The register — one entry per source, subitems 1-11.
 * ------------------------------------------------------------------ */

export const NAME_EXCLUSION_POLICY: readonly SourceNamePolicy[] = [
  {
    // Subitem 1.
    sourceId: 'CQC',
    subitem: 1,
    publisher: 'Care Quality Commission',
    datasetLabel: 'Locations & providers syndication (England)',
    riskLevel: 'standard',
    keptFields: [
      'registration_status', 'beds_registered', 'regulated_activities',
      'service_types', 'specialisms', 'registration_date',
      'cqc_location_id', 'cqc_provider_id',
    ],
    excludedNameFields: [
      'registered_manager_name', 'registered_manager_*',
      'nominated_individual_name', 'nominated_individual_*',
      'provider_name_sole_trader',
    ],
    nameExceptions: [],
    note:
      "'provider_name_sole_trader' is excluded even though the field is " +
      "labelled a provider NAME: for a sole trader the provider name IS " +
      "the individual's own name, not a company name. Classified as a " +
      "personal-name field on that ground, not on its label.",
  },
  {
    // Subitem 2. Three devolved regulators, same field shape, one entry.
    sourceId: 'CARE_REGULATORS_DEVOLVED',
    subitem: 2,
    publisher: 'Care Inspectorate Wales / Care Inspectorate (Scotland) / RQIA (Northern Ireland)',
    datasetLabel: 'Registered services (social care, Wales/Scotland/NI)',
    riskLevel: 'standard',
    keptFields: ['registration_status', 'service_categories', 'capacity', 'regulator_service_id'],
    excludedNameFields: [
      'responsible_individual_name', 'responsible_individual_*',
      'manager_name', 'manager_name_*',
    ],
    nameExceptions: [],
    note: 'CIW, the Care Inspectorate and RQIA publish the same shape of record; treated as one policy entry.',
  },
  {
    // Subitem 3.
    sourceId: 'EPC',
    subitem: 3,
    publisher: 'MHCLG (England & Wales) / Scottish EPC Register',
    datasetLabel: 'Energy Performance of Buildings register',
    riskLevel: 'standard',
    keptFields: [
      'epc_total_floor_area_m2', 'epc_property_type', 'epc_construction_age_band',
      'epc_tenure', 'epc_lodgement_date', 'epc_rrn',
    ],
    excludedNameFields: ['assessor_name', 'assessor_id', 'assessor_company'],
    nameExceptions: [],
    note:
      "'assessor_id' is excluded even though it is not a name field by " +
      'type: it is a unique identifier that names one specific individual ' +
      'as surely as their name would, and re-identifies them just as ' +
      "easily. 'assessor_company' is excluded too — an assessor typically " +
      'trades under a company name that is their own name or a close ' +
      'variant, so it is treated as identifying, not as a business fact.',
  },
  {
    // Subitem 4. Company profile only — PSC is a separate entry (subitem 5)
    // and the officers endpoint is never called (see note).
    sourceId: 'CH_COMPANY',
    subitem: 4,
    publisher: 'Companies House',
    datasetLabel: 'Company profile',
    riskLevel: 'standard',
    keptFields: [
      'company_number', 'company_status', 'sic_codes', 'accounts_year_end',
      'incorporation_date', 'group_link_*', 'company_name',
    ],
    excludedNameFields: ['director_name', 'director_*', 'secretary_name', 'secretary_*'],
    excludedOtherPersonalFields: ['officer_dob', 'service_address_*', 'residential_address_*'],
    nameExceptions: [],
    note:
      "'company_name' is KEPT and is NOT treated as a personal-name field, " +
      "even where the company trades under a name that is a person's own " +
      "name (e.g. 'A N Other Consulting Ltd') — a company name is the " +
      'identity of a legal entity, not personal data about a natural ' +
      'person. Contrast this with provider_name_sole_trader above, which ' +
      'IS excluded because a sole trader has no separate legal identity ' +
      "from the individual. The officers endpoint (director/secretary " +
      "detail beyond what a company profile carries) is never called at " +
      "all — the preferred pattern is to avoid the endpoint entirely " +
      "rather than fetch and filter it. Because it is never called, no " +
      "policy entry for it exists; an attempted ingestion tagged as that " +
      "source fails closed as an unknown source (see test T-UNKNOWN-SOURCE).",
  },
  {
    // Subitem 5 = EXCEPTION 1.
    sourceId: 'CH_PSC',
    subitem: 5,
    publisher: 'Companies House',
    datasetLabel: 'Persons with significant control',
    riskLevel: 'standard',
    keptFields: ['psc_kind', 'psc_natures_of_control', 'psc_ceased_on', 'company_number'],
    excludedNameFields: [],
    excludedOtherPersonalFields: ['psc_dob_day', 'psc_address_line_*', 'psc_residential_*'],
    nameExceptions: [
      {
        field: 'psc_name',
        exceptionId: 'EXCEPTION_1_PSC_COMMON_CONTROL',
        justification:
          'Retained as the evidence of common control for the CAA 2001 Annual ' +
          'Investment Allowance test (the £1m allowance is shared across ' +
          'commonly controlled businesses). The name is not incidental ' +
          'metadata — it is the fact being established.',
        crossRef: 'board item 12818210932 (full justification); LIA doc 46389172 §5.1 and §7.3',
      },
    ],
    note:
      'EXCEPTION 1. Retained fields stay limited to name, birth month/year ' +
      'and nationality — never day of birth, never an address. See ' +
      'condition LIA-C5, LIA §12.',
  },
  {
    // Subitem 6 = EXCEPTION 2.
    sourceId: 'HMLR_TITLE',
    subitem: 6,
    publisher: 'HM Land Registry',
    datasetLabel: 'Title register (official copy)',
    riskLevel: 'standard',
    /* PHASE 146d, 23 September 2026 — `price_paid`, `transaction_date` AND `prior_owner_count` ADDED, and their
       absence was a real defect rather than a tightening. The whole reason this £7 lookup exists is that HM Land
       Registry's FREE sale-price data is residential only, so for a care home, a dental practice, a surgery or a
       hospital the official copy of the register is the only source of a price paid there is. The register row
       described the lookup without permitting the one field it is bought for: any connector writing it would have
       been refused at the one door as an unclassified field. Neither is a name: a price is a sum of money, a date
       is a date, and a prior-owner COUNT is a number — the former proprietors' names stay excluded below, and the
       count is why it is a count. */
    keptFields: [
      'title_number', 'tenure', 'proprietor_company_number', 'proprietor_name_company',
      'lease_term_*', 'restriction_*', 'price_paid', 'transaction_date', 'prior_owner_count',
    ],
    excludedNameFields: ['former_proprietor_name', 'former_proprietor_*', 'charge_holder_individual_*'],
    nameExceptions: [
      {
        field: 'proprietor_name_personal',
        exceptionId: 'EXCEPTION_2_HMLR_INDIVIDUAL_PROPRIETOR',
          justification:
          'Retained ONLY where the property is held by a natural person, ' +
          "because that person is then the claimant's own identity — the " +
          'entitlement to the capital allowance attaches to them by name. ' +
          'NOT retained where the proprietor is a company: the value is ' +
          "then a company name (proprietor_name_company) and no natural " +
          'person is identified.',
        crossRef: 'board item 12818210932 (full justification); LIA doc 46389172 §7.2',
      },
    ],
    note:
      'EXCEPTION 2. The record must carry which kind of proprietor this ' +
      "is (see IngestedRecord.proprietorType below). 'proprietor_name_personal' " +
      "written against a record whose proprietor is a company is not the " +
      'exception applying correctly — it is the exception applied to the ' +
      'wrong case, and the assertion treats it as a failure in its own ' +
      "right (E_EXCEPTION_MISAPPLIED), not as a pass.",
  },
  {
    // Subitem 7.
    sourceId: 'HMLR_PPD',
    subitem: 7,
    publisher: 'HM Land Registry',
    datasetLabel: 'Price Paid Data',
    riskLevel: 'standard',
    keptFields: ['price_paid', 'transaction_date', 'tenure', 'property_type_ppd', 'new_build_flag'],
    excludedNameFields: [],
    nameExceptions: [],
    note: 'No personal data at all. Price Paid Data is a transaction record, not a persons record.',
  },
  {
    // Subitem 8. The VOA LICENCE question is separately owned at item
    // 12818978633 and is out of scope here — this entry is the name
    // exclusion only.
    sourceId: 'VOA',
    subitem: 8,
    publisher: 'Valuation Office Agency',
    datasetLabel: 'Rating list summary valuation',
    riskLevel: 'standard',
    keptFields: ['voa_total_area_m2', 'voa_summary_valuation', 'voa_scat_code', 'voa_ba_reference', 'voa_effective_date'],
    excludedNameFields: ['ratepayer_name', 'ratepayer_*'],
    nameExceptions: [],
    note:
      'Ratepayer name excluded where present. The VOA data-licence question ' +
      '(whether the licence permits commercial use at all) is tracked ' +
      'separately at board item 12818978633 and is not decided by this entry.',
  },
  {
    // Subitem 9. HIGHEST RISK SOURCE.
    sourceId: 'PLANNING',
    subitem: 9,
    publisher: 'Local planning authority / PlanIt / planning.data.gov.uk',
    datasetLabel: 'Planning applications',
    riskLevel: 'highest',
    /* Phase 146d adds `planning_uprn`, which the source register has always permitted and this one did not keep —
       so a planning record carrying the property's own identifier would have been refused at the one door as an
       unclassified field. It is the least personal thing on the row: it names a building. */
    keptFields: [
      'planning_reference', 'planning_decision', 'planning_decision_date',
      'planning_received_date', 'planning_description', 'planning_uprn',
    ],
    /* Phase 146d, 23 September 2026 — see the note. The patterns end in a bare '*' rather than '_*' BECAUSE THE
       FIELD PlanIt ACTUALLY SENDS IS `case_officer`, with nothing after it: 'case_officer_*' would have matched
       every spelling except the real one. A glob is only as good as the name it was written against. */
    excludedNameFields: [
      'applicant_name', 'applicant_*', 'agent_name', 'agent_*',
      'objector_name', 'objector_*', 'neighbour_name', 'neighbour_*',
      'consultee_name', 'consultee_*',
      'comment_*', 'correspondence_*',
      'officer*', 'case_officer*',
    ],
    nameExceptions: [],
    note:
      "'comment_*' and 'correspondence_*' are excluded WHOLESALE, not " +
      "trimmed: planning comment and correspondence text is free text and " +
      "may carry a name, an address, a health condition or a family " +
      "circumstance anywhere within it, with no reliable way to redact " +
      "just the name. The rule for a free-text field that MAY carry a " +
      "name is exclusion of the whole field, never a best-effort filter. " +
      "This is the highest-risk source in the register because it is the " +
      "one place a register record carries data about people (objectors, " +
      "neighbours) who have no connection whatsoever to Caprebate’s " +
      "client or to the claim (LIA §4.4, Class D) — no legitimate interest " +
      "is claimed in it and none should be. " +
      "PHASE 146d, 23 SEPTEMBER 2026 ADDS 'officer_*' AND 'case_officer_*': " +
      "a case officer is a named local-authority employee and belongs to " +
      "exactly that class. BOTH candidate suppliers carry one. Homedata's " +
      "/planning/search/ says in its own documentation that it returns " +
      "'case officer details'; and PlanIt — the source of record today — " +
      "carries case_officer, applicant_name, agent_name and agent_address " +
      "inside the other_fields object of its answer, which was read from a " +
      "live PlanIt response on 23 September 2026 rather than assumed. So " +
      "this risk did not arrive with the paid supplier; it was already " +
      "here, and nothing had barred it. The connector reads named keys and " +
      "never other_fields, so nothing has leaked; these patterns are the " +
      "second line. AND ONE THING THIS NOTE MUST NOT BE READ AS SAYING: " +
      "'planning_description' IS free text and MAY carry a name. It is " +
      "kept, deliberately, for the reasons set out above PLANNING in " +
      "caprebate-source-register.ts — it is the authority's account of the " +
      "WORKS, on a statutory public register, and it is kept only for a " +
      "record that matched the client's own property. NO BEST-EFFORT NAME " +
      "FILTER IS BUILT FOR IT, because the rule two sentences up forbids " +
      "exactly that. The data protection officer is asked to confirm the " +
      "reading.",
  },
  {
    // Subitem 10.
    sourceId: 'OFSTED_RSH',
    subitem: 10,
    publisher: 'Ofsted / Regulator of Social Housing',
    datasetLabel: 'Registered provider status',
    riskLevel: 'standard',
    keptFields: ['provider_status'],
    excludedNameFields: ['registered_person_name', 'registered_person_*', 'contact_name', 'contact_*'],
    nameExceptions: [],
    note: 'Provider status only. Registered person and contact names excluded.',
  },
  {
    // Subitem 11.
    sourceId: 'CHARITY_COMMISSION',
    subitem: 11,
    publisher: 'Charity Commission for England and Wales / OSCR',
    datasetLabel: 'Registered charity record',
    riskLevel: 'standard',
    keptFields: ['charity_number', 'charity_status', 'charity_structure'],
    excludedNameFields: ['trustee_name', 'trustee_*'],
    nameExceptions: [],
    note: 'Charity number, status and structure only. Trustee names excluded.',
  },
  {
    /**
     * Board item 13003875907. ADDED BY PHASE 146d, 23 September 2026 — and until it was added, nothing from the paid
     * address lookup could be written at all: `findPolicy` fails closed on a source it does not know, so the one
     * door would have refused every record with E_UNKNOWN_SOURCE. That is the register working as designed, and it
     * is why the entry comes with the connector rather than after it.
     *
     * THE LOWEST-RISK ROW IN THIS REGISTER, and it is worth saying why so that nobody later widens it by analogy.
     * This lookup returns an identifier, an address line, a postcode and a point on the ground. It has no
     * proprietor, no occupier, no resident and no free text of any kind. The supplier sells a great deal more about
     * the same property — who lives in the area, what crime is recorded near it, how deprived the neighbourhood is —
     * and the connector never asks for any of it: it requests named slugs, never the supplier's bundles, and there
     * is a test that it never requests a bundle. The exclusions below are therefore about the SUPPLIER'S catalogue
     * rather than about this endpoint's answer, which is the right way round for a paid reseller whose product may
     * grow between one release and the next.
     *
     * THE ADDRESS LINE IS THE CLIENT'S OWN PROPERTY'S ADDRESS, which we already hold because somebody typed it in.
     * It is not a person's address: this system's clients are trading businesses, and a lookup is only ever made
     * after that business has signed an engagement letter with us.
     */
    sourceId: 'HOMEDATA_ADDRESS',
    subitem: 14,
    publisher: 'Homedata (supplier); underlying data Ordnance Survey AddressBase and Royal Mail PAF',
    datasetLabel: 'Paid address lookup — identifier, address line, postcode, coordinates',
    riskLevel: 'standard',
    // Phase 151a: easting and northing, the supplier's British National Grid point for the same building.
    keptFields: ['uprn', 'address_line', 'postcode', 'latitude', 'longitude', 'easting', 'northing'],
    excludedNameFields: ['*_name', 'occupier_*', 'resident_*', 'owner_*', 'proprietor_*'],
    nameExceptions: [],
    note:
      'Four facts about a building and nothing about anybody in it. The coordinates are here because the spatial ' +
      'screen (board item 12830181761) is geometry-keyed and nothing else in the register supplies a coordinate; a ' +
      'point on the ground identifies a building, which is what this register is about. USRN, TOID and UDPRN are ' +
      'excluded in the source register by an explicit decision rather than by omission — nothing reads one, and an ' +
      'identifier held for no purpose is data held for no purpose.',
  },
  {
    /*
     * PHASE 151a, 24 September 2026 — HM LAND REGISTRY'S LAND BOUNDARY (INSPIRE Index Polygons). Without an entry the
     * one door would refuse the site area with E_UNKNOWN_SOURCE, so the entry comes with the function that writes it
     * (09-app/backend/src/connectors/site-area.ts), as HOMEDATA_ADDRESS's did.
     *
     * NOTHING PERSONAL CAN ARRIVE. The polygons carry no title number and no name — only an INSPIRE ID and a shape
     * (SUPPLIER_DOCS, HMLR_INSPIRE). What is kept is the area worked out from the shape, its confidence grade, and the
     * polygon's identifier. The shape itself, a map of it and its coordinates are never kept: the boundary module's
     * CURRENT_LICENCE_PERMISSION keeps them out of every report, and nothing writes them here.
     */
    sourceId: 'HMLR_INSPIRE',
    subitem: 15,
    publisher: 'HM Land Registry',
    datasetLabel: 'INSPIRE Index Polygons — the site area worked out from a land boundary',
    riskLevel: 'standard',
    keptFields: ['site_area_m2', 'site_area_m2_grade', 'inspire_id'],
    excludedNameFields: ['*_name', 'proprietor_*', 'owner_*', 'title_number'],
    nameExceptions: [],
    note:
      'An area, its grade and a polygon identifier, and nothing about anybody. HM Land Registry\'s INSPIRE polygons ' +
      'carry no title number and no proprietor. The title number is excluded as well as the names because it leads ' +
      'straight to the register\'s proprietor, and nothing here needs it.',
  },
  {
    // Subitem 13. Added by Phase 41 (board item 12928074627). Subitem 12 is
    // the test suite and is deliberately skipped rather than reused.
    //
    // NOT A REGISTER. Every other entry above describes a public register
    // Caprebate goes and fetches from. This one describes documents a
    // CLIENT SENDS IN, and it is here for a reason stated in Phase 40 (item
    // 12927987812) §5.2: caprebate-document-pipeline.ts already writes its
    // claims with source_id: 'CLIENT_DOC', a source id this policy did not
    // contain — so findPolicy's fail-closed default would have thrown
    // E_UNKNOWN_SOURCE the moment anybody called the assertion on that path.
    // Nobody ever did. Adding the entry is what makes the call possible; the
    // call itself is made by assertClaimsWritable() in
    // caprebate-client-doc-ingestion.ts, which is the upload path's
    // equivalent of a connector.
    //
    // HIGHEST RISK, and for a sharper reason than PLANNING's. A planning API
    // response reaches this policy before it is written. An uploaded planning
    // PDF reaches nothing: the pipeline's four layers are all model-boundary
    // controls, and Phase 40 §3.2 establishes that every one of them sits
    // AFTER the moment the document is obtained. This entry governs the
    // structured claims. What governs the document itself is the receipt
    // policy in caprebate-client-doc-ingestion.ts, which is upstream of
    // this and of everything else.
    sourceId: 'CLIENT_DOC',
    subitem: 13,
    publisher: 'The client — portal upload or email attachment',
    datasetLabel: 'Client-supplied transaction, building and tax documents, and the Land Registry official copy (fourteen types)',
    riskLevel: 'highest',
    // Exactly the field_ids of DOC_SPECS and HUMAN_CAPTURE_SPECS, enumerated
    // literally rather than imported, for the reason Part E gives: a spec that
    // grows a new field must EARN its way onto this list. Until it does, the
    // new field is E_UNCLASSIFIED_FIELD and the write is refused. Test C7 in
    // the client-doc suite asserts the two lists agree today, so drift is
    // caught at test time rather than in production.
    keptFields: [
      // PLANNING
      'planning_reference', 'planning_decision', 'planning_decision_date',
      'planning_description', 'planning_plant_conditions',
      // FIRE_RISK_ASSESSMENT
      'fra_alarm_system_category', 'fra_emergency_lighting', 'fra_sprinkler_or_suppression',
      'fra_smoke_ventilation_aov', 'fra_dry_or_wet_riser', 'fra_fire_door_count',
      'fra_assessment_date',
      // OM_MANUAL
      'om_plant_items', 'om_commissioning_date', 'om_system_types',
      // ASBESTOS_REGISTER
      'asb_acm_locations', 'asb_survey_date', 'asb_survey_type',
      // INSURANCE_REINSTATEMENT
      'reinstatement_declared_value_pence', 'reinstatement_basis', 'reinstatement_gia_m2',
      'reinstatement_professional_fees_pct', 'reinstatement_valuation_date',
      // LEASE
      'lease_term_years', 'lease_commencement_date', 'lease_repairing_basis',
      'landlord_contribution_amount_pence', 'lease_tenant_fixtures_clause',
      'lease_reinstatement_obligation',
      // CONTRACTOR_COST_BREAKDOWN
      'cost_elements', 'cost_prelims_pct', 'cost_professional_fees_pct',
      'cost_provisional_sums', 'cost_contingency',
      // BUILDING_REGS_COMPLETION. 'brc_issuing_body' is kept but CONDITIONAL —
      // see the note, and assertClaimsWritable's issuing-body discriminant.
      'brc_certificate_reference', 'brc_issuing_body', 'brc_works_description',
      'brc_completion_date',
      // GRANT_FUNDING_AGREEMENT. 'grant_funder_name' is kept but CONDITIONAL —
      // see the note, and assertClaimsWritable's funder discriminant.
      'grant_funder_name', 'grant_amount_pence', 'grant_agreement_date',
      'grant_purpose_description', 'grant_itemised_schedule', 'grant_conditions',
      // CPSE_REPLIES — human capture only
      'cpse_form_edition', 'cpse_ca_enquiry_numbers', 'cpse_ca_question_text',
      'cpse_ca_reply_text', 'cpse_election_reference', 'cpse_replies_date',
      // SALE_CONTRACT — human capture only
      'contract_date', 'contract_consideration_pence', 'contract_schedule_index',
      // PHASE 151b, 25 September 2026 — THE TAX RETURN AND THE TAX COMPUTATION. The data protection officer said yes to
      // both as uploads (Word question 223, 24 September 2026), and until the officer says otherwise they are treated
      // like the other financial documents: the figures and the company's details are kept; individuals' names,
      // addresses and tax references are removed on receipt (caprebate-client-doc-ingestion.ts). Every field below is
      // a date, a company number, a sum of money or a set of figures by pool — none a name, none a tax reference.
      // TAX_RETURN
      'taxret_period_start', 'taxret_period_end', 'taxret_company_number', 'taxret_taxable_profit_pence',
      'taxret_capital_allowances_by_pool', 'taxret_aia_claimed_pence',
      // TAX_COMPUTATION
      'taxcomp_period_start', 'taxcomp_period_end', 'taxcomp_taxable_profit_pence', 'taxcomp_capital_allowances_by_pool',
      'taxcomp_main_pool_balance_pence', 'taxcomp_special_rate_pool_balance_pence', 'taxcomp_aia_claimed_pence',
      // PHASE 146l, 27 September 2026 — THE OFFICIAL COPY OF THE TITLE REGISTER, read by a person (HUMAN_CAPTURE_SPECS).
      // A title number, a tenure, a price and its date, and three counts or a company number. No name: a personal
      // owner's name is never captured from an uploaded copy, and CLIENT_DOC still takes no name exception.
      // TITLE_REGISTER
      'oc_title_number', 'oc_tenure', 'oc_price_paid_pence', 'oc_price_paid_date', 'oc_restriction_count',
      'oc_proprietor_company_number', 'oc_prior_owner_count',
    ],
    // No spec has any of these fields today. They are listed because the roles
    // EXIST on the face of the documents (Phase 40 §4.2 works them through type
    // by type) and the cheapest moment to refuse them is before somebody adds
    // one to a spec believing it harmless. Ordered as Phase 40 orders them:
    // transaction roles, then the three roles that are natural persons one
    // hundred per cent of the time (§4.3), then the Class D roles that have no
    // lawful basis at all (§4.5), then free text.
    excludedNameFields: [
      // Transaction parties
      'party_*', 'seller_*', 'buyer_*', 'landlord_name', 'landlord_name_*',
      'tenant_name', 'tenant_name_*', 'guarantor_*', 'surety_*',
      'attorney_*', 'personal_representative_*', 'insured_name', 'duty_holder_name',
      // The three that are ALWAYS natural persons — Phase 40 §4.3
      'witness_*', 'attesting_*',
      'signatory_*', 'signed_by_*', 'executed_by_*',
      'assessor_*', 'surveyor_*', 'analyst_*', 'valuer_*', 'certifier_*',
      'engineer_*', 'commissioning_engineer_*', 'inspector_name', 'inspector_name_*',
      // Named professionals and officers
      'fee_earner_*', 'conveyancer_*', 'solicitor_name', 'solicitor_name_*',
      'case_officer_*', 'grant_officer_*', 'agent_name', 'agent_name_*',
      'contact_*', 'managing_agent_name',
      // Class D — no lawful basis is claimed for any of these. Phase 40 §4.5
      'applicant_name', 'applicant_name_*', 'objector_*', 'neighbour_*', 'consultee_*',
      'representation_*', 'comment_*', 'correspondence_*',
      // People named inside the document rather than party to it
      'occupier_*', 'resident_*', 'peep_*', 'evacuation_plan_person_*',
      'named_staff_*', 'key_holder_*', 'fire_marshal_*', 'responsible_person_name',
      // Catch-alls for the shapes a future field is most likely to take
      '*_name_personal', '*_personal_name', 'person_*',
    ],
    // EMPTY, AND THAT IS THE POINT. There is no third exception. No natural
    // person's name is retained from a client document in any circumstance.
    // Part E sets out what would have to be produced before a third exception
    // could exist; none of it has been produced, and this phase does not
    // attempt to create one.
    nameExceptions: [],
    note:
      "Two kept fields are CONDITIONAL and are the only two in this entry that " +
      "could carry a natural person's name. Both are enforced by a discriminant " +
      "in assertClaimsWritable(), on the pattern Exception 2 uses for " +
      "proprietorType — the register cannot see values, only field names, so a " +
      "field whose safety depends on WHAT IT CONTAINS needs a companion flag " +
      "that the caller must set truthfully. (1) 'grant_funder_name': the " +
      "GRANT_FUNDING_AGREEMENT spec notes 'the funding body, not an individual', " +
      "and Phase 40 §4.2 records that the note is not enforced anywhere. It is " +
      "now: funder_is_body must be true. (2) 'brc_issuing_body': the " +
      "BUILDING_REGS_COMPLETION spec distinguishes a local authority from an " +
      "approved inspector, and whether an approved inspector may be an " +
      "individual under the Building Safety Act 2022 regime is [VERIFY] — that " +
      "Act has not been read by anyone on this board. issuing_body_is_organisation " +
      "must be true, which is the fail-closed reading while the question is open. " +
      "Everything else on the keep list is a date, a reference, a measurement, a " +
      "sum of money, or a description of works. No field in any of the eleven " +
      "specifications is a person's name — Phase 40 §5.4, checked field by field. " +
      "Phase 151b added the tax return and the tax computation, thirteen types in all: their thirteen fields are " +
      "dates, a company number, sums and figures by pool, and none is a name or a tax reference. " +
      "Phase 146l added the official copy of the Land Registry title register, read by a person, fourteen types in " +
      "all: its seven fields are a title number, a tenure, a price and its date, a company number and two counts.",
  },
];

/* ------------------------------------------------------------------ *
 * 3. Errors
 * ------------------------------------------------------------------ */

export type NameExclusionErrorCode =
  | 'E_UNKNOWN_SOURCE'
  | 'E_NAME_FIELD_EXCLUDED'
  | 'E_UNCLASSIFIED_FIELD'
  | 'E_EXCEPTION_MISAPPLIED';

export class NameExclusionError extends Error {
  code: NameExclusionErrorCode;
  detail: Record<string, unknown>;
  constructor(code: NameExclusionErrorCode, message: string, detail: Record<string, unknown> = {}) {
    super(`[${code}] ${message}`);
    this.name = 'NameExclusionError';
    this.code = code;
    this.detail = detail;
  }
}

/* ------------------------------------------------------------------ *
 * 4. Lookup and field classification
 * ------------------------------------------------------------------ */

function globMatch(pattern: string, field: string): boolean {
  if (pattern === '*') return true;
  if (pattern.endsWith('*')) return field.startsWith(pattern.slice(0, -1));
  if (pattern.startsWith('*')) return field.endsWith(pattern.slice(1));
  return pattern === field;
}

const BY_SOURCE = new Map<string, SourceNamePolicy>(NAME_EXCLUSION_POLICY.map((p) => [p.sourceId, p]));

/**
 * Fail-closed at the source level: a source id not in NAME_EXCLUSION_POLICY
 * is refused outright. This is deliberate and covers, among other things,
 * the Companies House officers endpoint, which is never registered because
 * it is never called (see CH_COMPANY's note).
 */
export function findPolicy(sourceId: string): SourceNamePolicy {
  const p = BY_SOURCE.get(sourceId);
  if (!p) {
    throw new NameExclusionError(
      'E_UNKNOWN_SOURCE',
      `source '${sourceId}' is not in the name exclusion register — nothing may be ` +
        'written from it until a policy entry is added (fail closed, not fail open)',
      { source_id: sourceId },
    );
  }
  return p;
}

export type FieldClassification =
  | { kind: 'kept'; field: string; sourceId: string }
  | { kind: 'name_excluded'; field: string; sourceId: string }
  | { kind: 'name_retained_exception'; field: string; sourceId: string; exceptionId: ExceptionId }
  | { kind: 'unclassified'; field: string; sourceId: string };

/**
 * Classifies one field on one (registered) source. Order of checks matters:
 * an exception is checked before the exclusion list, because the excepted
 * field IS a name field that would otherwise be excluded — the exception
 * is what lifts it, not an absence from the exclusion list.
 */
export function classifyField(sourceId: string, field: string): FieldClassification {
  const policy = findPolicy(sourceId);
  const exception = policy.nameExceptions.find((e) => globMatch(e.field, field));
  if (exception) return { kind: 'name_retained_exception', field, sourceId, exceptionId: exception.exceptionId };
  if (policy.excludedNameFields.some((p) => globMatch(p, field))) {
    return { kind: 'name_excluded', field, sourceId };
  }
  if (policy.keptFields.some((p) => globMatch(p, field))) return { kind: 'kept', field, sourceId };
  return { kind: 'unclassified', field, sourceId };
}

/**
 * The predicate required by subitem 12: does this field, on this source,
 * carry or identify a natural person's name? True for an excluded name
 * field AND for a retained exception (it IS a name; it is simply the one
 * permitted to be written). False only for 'kept'. An unclassified field
 * is NOT asserted to be a name field by this predicate — classifyField
 * already fails it closed as unclassified, and assertNoUnauthorisedName
 * refuses it on that separate, stricter ground.
 */
export function isPersonalNameField(sourceId: string, field: string): boolean {
  const c = classifyField(sourceId, field);
  return c.kind === 'name_excluded' || c.kind === 'name_retained_exception';
}

/* ------------------------------------------------------------------ *
 * 5. The assertion
 * ------------------------------------------------------------------ */

export type ProprietorType = 'individual' | 'company';

export type IngestedRecord = {
  sourceId: string;
  entityId: string;
  fields: Readonly<Record<string, unknown>>;
  /**
   * Required whenever fields includes 'proprietor_name_personal' or
   * 'proprietor_name_company' from HMLR_TITLE: which kind of proprietor
   * this title actually has. This is the discriminant the LIA (§7.2) says
   * the system must be able to make (condition LIA-C6) — it is what lets
   * Exception 2 apply to the right case and refuses it applied to the
   * wrong one.
   */
  proprietorType?: ProprietorType;
  /**
   * The Article 14 transparency record for this person. Required — and
   * asserted by assertArt14Complete, NOT by assertNoUnauthorisedName — on any
   * record retaining a name under a documented exception.
   *
   * DELIBERATELY NOT CHECKED AT THE INGESTION BOUNDARY. Article 14(3)(a) gives
   * a month from obtaining the data, so the notice cannot exist at the moment
   * of ingestion and requiring it there would make lawful ingestion impossible.
   * Same split as the uploaded-document population.
   */
  art14?: Art14Record;
};

/**
 * Subitem 12. Throws if any personal-name field would be written outside
 * the two documented exceptions. Throws for an unregistered source. Throws
 * for a field that is neither kept, excluded, nor excepted — an
 * uncatalogued field is refused, not assumed safe. Returns normally (does
 * not throw) for a clean record.
 *
 * This is called at the ingestion boundary — see Part D of the register —
 * not at report-generation time. A filter applied only when a report is
 * produced would leave the name sitting in storage in between, which is
 * exactly the gap the LIA (§7.5) warns against.
 */
export function assertNoUnauthorisedName(rec: IngestedRecord): void {
  const policy = findPolicy(rec.sourceId); // fail closed on an unknown source

  for (const field of Object.keys(rec.fields)) {
    const classification = classifyField(rec.sourceId, field);

    if (classification.kind === 'unclassified') {
      throw new NameExclusionError(
        'E_UNCLASSIFIED_FIELD',
        `field '${field}' on source '${rec.sourceId}' is on neither the KEEP list, the ` +
          'EXCLUDE list, nor a documented exception — refused. A new field must be ' +
          'added to NAME_EXCLUSION_POLICY (and to the Part A register) before it may ' +
          'be written; it is never assumed safe by default.',
        { source_id: rec.sourceId, field },
      );
    }

    if (classification.kind === 'name_excluded') {
      throw new NameExclusionError(
        'E_NAME_FIELD_EXCLUDED',
        `field '${field}' on source '${rec.sourceId}' is a personal-name field and is ` +
          'not one of the two documented exceptions — refused',
        { source_id: rec.sourceId, field },
      );
    }

    if (classification.kind === 'name_retained_exception') {
      if (rec.sourceId === 'HMLR_TITLE' && field === 'proprietor_name_personal') {
        if (rec.proprietorType !== 'individual') {
          throw new NameExclusionError(
            'E_EXCEPTION_MISAPPLIED',
            `'proprietor_name_personal' was written but proprietorType is ` +
              `'${rec.proprietorType ?? 'undefined'}', not 'individual' — Exception 2 ` +
              'covers an individual proprietor only. A corporate proprietor\'s name ' +
              "belongs in 'proprietor_name_company', which is not a personal-name field.",
            { source_id: rec.sourceId, field, proprietor_type: rec.proprietorType },
          );
        }
      }
      // CH_PSC's sole exception field (psc_name) needs no further discriminant:
      // the source itself only ever describes a natural person.
    }
  }
  void policy; // referenced for its side-effecting lookup above; no further use here
}

/* ------------------------------------------------------------------ *
 * 6. THE ARTICLE 14 TRANSPARENCY RECORD — the RP-E1 and RP-E2 stores
 *
 * Board item 12927936989, specified 29 August 2026 (Phase 39), built
 * 8 September 2026 (Phase 98).
 *
 * WHY IT IS HERE AND NOT IN A MODULE OF ITS OWN. This file is what decides
 * which records retain a natural person's name — the two documented
 * exceptions, RP-E1 (Companies House person with significant control) and RP-E2
 * (HM Land Registry individual proprietor). The duty to tell that person we
 * hold their data follows from exactly the same fact, so the predicate that
 * decides whether a notice is owed is derived from NAME_EXCLUSION_POLICY
 * rather than from a flag somebody remembers to set. The equivalent record
 * for the uploaded-document population lives in caprebate-client-doc-
 * ingestion.ts section 6 for the same reason.
 *
 * WHAT WAS ACTUALLY MISSING, WHICH IS NARROWER THAN "NOTHING RECORDS THIS".
 * Phase 98's prompt said `art14_notice_sent` appears nowhere in 04-phase-work,
 * and that grep was correct. The conclusion drawn from it was not: a full
 * Article 14 transparency record ALREADY EXISTS for the uploaded-document
 * population, with per-person notices, 14(5)(e) exemption reasons and a
 * completeness assertion. Its own header even says that population was "worse
 * off than the register population because it has no store at all to add a
 * field to" — implying the register population had one. It did not. THIS is
 * the store, and the gap was real; it was just not the gap the grep described.
 *
 * ROUTE 2 IS A DECISION, NOT A RECOMMENDATION. Item 5 §8.5, 28 August 2026:
 * publish under Article 14(5)(e) with 14(7) as the baseline, AND notify the
 * individual directly wherever a route to them exists. So "we published" is
 * not an answer on its own for a person we could have reached.
 *
 * WHY PER PERSON AND NOT PER POLICY. Article 14(5) reads "do not apply TO THE
 * EXTENT THAT". Reliance on the exemption is a per-person assertion, and a
 * position that cannot be evidenced person by person is not a position. Same
 * reasoning as the document population; same conclusion.
 *
 * A BLANK IS NOT AN ANSWER — the rule the breach register applies at its
 * §2.5. NOT SENT with a reason is an answer; empty is not. That is the whole
 * point of assertArt14Complete: four fields that may be left empty are four
 * boxes, not a record.
 * ------------------------------------------------------------------ */

/** DIRECT and VIA_CLIENT mean a notice went out. NOT_SENT_NO_ROUTE is where
 *  Article 14(5)(e) lives — and it is a claim about the world, not a default. */
export type Art14Route = 'DIRECT' | 'VIA_CLIENT' | 'NOT_SENT_NO_ROUTE';

/** NOTIFIED — Article 14 met directly. EXEMPTION_RELIED_ON — 14(5)(e), with
 *  14(7) publication as the baseline. This is the field that lets us say which
 *  individuals the exemption is actually being relied on for. */
export type Art14Basis = 'NOTIFIED' | 'EXEMPTION_RELIED_ON';

/** The literal that distinguishes "we decided not to send" from "nobody filled
 *  this in". They are not the same and only one of them is a record. */
export const ART14_NOT_SENT = 'NOT_SENT';

export type Art14Record = {
  /** An ISO date, or the literal ART14_NOT_SENT. Never empty. */
  art14_notice_sent: string;
  art14_notice_route: Art14Route;
  art14_basis: Art14Basis;
  /**
   * Which version of the notice was sent, so a later amendment is traceable.
   * Null ONLY where no notice was sent — asserted, not trusted.
   */
  art14_notice_version: string | null;
  /**
   * Required when the exemption is relied on. Why, for THIS person: a reason
   * that would fit anybody is not a reason.
   */
  art14_exemption_reason?: string;
  recorded_by: string;
  recorded_at: string;
};

export type Art14ErrorCode =
  | 'E_ART14_RECORD_MISSING'
  | 'E_ART14_BLANK_NOT_AN_ANSWER'
  | 'E_ART14_INCOHERENT'
  | 'E_ART14_EXEMPTION_WITHOUT_REASON'
  | 'E_ART14_VERSION_MISSING'
  | 'E_ART14_NOT_OWED';

export class Art14Error extends Error {
  code: Art14ErrorCode;
  detail: Record<string, unknown>;
  constructor(code: Art14ErrorCode, message: string, detail: Record<string, unknown> = {}) {
    super(`[${code}] ${message}`);
    this.name = 'Art14Error';
    this.code = code;
    this.detail = detail;
  }
}

const art14Fail = (code: Art14ErrorCode, message: string, detail: Record<string, unknown> = {}): never => {
  throw new Art14Error(code, message, detail);
};

/**
 * Does this record identify a natural person under one of the two exceptions?
 *
 * DERIVED, NOT DECLARED. It reads the same policy that permitted the name in
 * the first place, so a record cannot retain a name under an exception and
 * separately claim it owes nobody a notice. Exception 2 additionally requires
 * proprietorType === 'individual': a corporate proprietor's name identifies no
 * natural person and owes no Article 14 duty.
 */
export function art14Owed(rec: IngestedRecord): boolean {
  const policy = findPolicy(rec.sourceId); // fail closed on an unknown source
  for (const field of Object.keys(rec.fields)) {
    const hit = policy.nameExceptions.find((e) => e.field === field);
    if (!hit) continue;
    if (hit.exceptionId === 'EXCEPTION_2_HMLR_INDIVIDUAL_PROPRIETOR' &&
        rec.proprietorType !== 'individual') {
      continue;
    }
    return true;
  }
  return false;
}

/**
 * The Article 14(3)(a) deadline: within a reasonable period, and at the latest
 * within ONE MONTH of obtaining the data. Returned so a caller can act on it
 * rather than discover it.
 */
export function art14DeadlineFor(obtainedAt: string): string {
  const d = new Date(obtainedAt);
  if (Number.isNaN(d.getTime())) {
    art14Fail('E_ART14_BLANK_NOT_AN_ANSWER',
      `'${obtainedAt}' is not a date the Article 14(3)(a) month can run from`,
      { obtained_at: obtainedAt });
  }
  const out = new Date(d);
  out.setMonth(out.getMonth() + 1);
  return out.toISOString().slice(0, 10);
}

const looksBlank = (v: unknown): boolean =>
  v === undefined || v === null || (typeof v === 'string' && v.trim() === '');

/**
 * Call before the Article 14(3)(a) month expires. Throws unless the record is
 * a coherent answer rather than four filled boxes.
 *
 * THE CROSS-FIELD RULES ARE THE POINT. Any one of these four fields can be set
 * to something plausible on its own; it is the combinations that are either
 * evidence or nonsense. A record saying a notice was sent on a date AND that
 * the exemption for unreachable people is being relied on describes two
 * mutually exclusive worlds, and it is exactly the shape a half-completed form
 * produces.
 */
export function assertArt14Complete(rec: IngestedRecord): void {
  if (!art14Owed(rec)) {
    if (rec.art14 !== undefined) {
      art14Fail('E_ART14_NOT_OWED',
        `source '${rec.sourceId}' record '${rec.entityId}' carries an Article 14 ` +
          'transparency record but identifies no natural person under either ' +
          'documented exception. A notice recorded against nobody is not evidence ' +
          'of compliance; it is a record that will later be cited as one.',
        { source_id: rec.sourceId, entity_id: rec.entityId });
    }
    return;
  }

  const a = rec.art14;
  if (a === undefined) {
    art14Fail('E_ART14_RECORD_MISSING',
      `source '${rec.sourceId}' record '${rec.entityId}' retains a personal name under ` +
        'a documented exception but has no Article 14 transparency record. Article 5(2) ' +
        'accountability means being able to SHOW the person was told, or to show which ' +
        'individuals the 14(5)(e) exemption is being relied on for. Neither is possible ' +
        'from an absent record.',
      { source_id: rec.sourceId, entity_id: rec.entityId });
    return;
  }

  for (const [k, v] of [
    ['art14_notice_sent', a.art14_notice_sent],
    ['art14_notice_route', a.art14_notice_route],
    ['art14_basis', a.art14_basis],
    ['recorded_by', a.recorded_by],
    ['recorded_at', a.recorded_at],
  ] as const) {
    if (looksBlank(v)) {
      art14Fail('E_ART14_BLANK_NOT_AN_ANSWER',
        `'${k}' is empty on record '${rec.entityId}'. A blank is not an answer — ` +
          `${ART14_NOT_SENT} with a reason is an answer, empty is not. This is the same ` +
          'rule the breach register applies at its section 2.5.',
        { source_id: rec.sourceId, entity_id: rec.entityId, field: k });
    }
  }

  const sent = a.art14_notice_sent !== ART14_NOT_SENT;
  if (sent && Number.isNaN(new Date(a.art14_notice_sent).getTime())) {
    art14Fail('E_ART14_BLANK_NOT_AN_ANSWER',
      `art14_notice_sent is '${a.art14_notice_sent}' — it must be a date, or exactly ` +
        `'${ART14_NOT_SENT}'. A free-text near-miss is how a field stops being queryable.`,
      { entity_id: rec.entityId, given: a.art14_notice_sent });
  }

  const routeSaysSent = a.art14_notice_route !== 'NOT_SENT_NO_ROUTE';

  if (sent !== routeSaysSent) {
    art14Fail('E_ART14_INCOHERENT',
      `record '${rec.entityId}' says notice_sent='${a.art14_notice_sent}' but ` +
        `route='${a.art14_notice_route}'. Those describe different worlds: either a ` +
        'notice went out and it went by some route, or it did not and there was no route.',
      { entity_id: rec.entityId, notice_sent: a.art14_notice_sent, route: a.art14_notice_route });
  }

  if (a.art14_basis === 'NOTIFIED' && !sent) {
    art14Fail('E_ART14_INCOHERENT',
      `record '${rec.entityId}' claims basis NOTIFIED but no notice was sent. ` +
        'Article 14 is not met by intending to meet it.',
      { entity_id: rec.entityId });
  }

  if (a.art14_basis === 'EXEMPTION_RELIED_ON' && sent) {
    art14Fail('E_ART14_INCOHERENT',
      `record '${rec.entityId}' claims the Article 14(5)(e) exemption AND records a ` +
        'notice sent on ' + a.art14_notice_sent + '. The exemption is for people we ' +
        'cannot reach; reaching them and then relying on it is incoherent, and it is ' +
        'the shape a half-completed form produces.',
      { entity_id: rec.entityId });
  }

  if (a.art14_basis === 'EXEMPTION_RELIED_ON' && looksBlank(a.art14_exemption_reason)) {
    art14Fail('E_ART14_EXEMPTION_WITHOUT_REASON',
      `record '${rec.entityId}' relies on Article 14(5)(e) with no reason recorded. ` +
        'Article 14(5) applies "to the extent that", so reliance is a per-person ' +
        'assertion — and Article 14(6) makes the NUMBER of data subjects relevant, ' +
        'which is where a small controller is weakest. An unevidenced exemption across ' +
        'a handful of people is the least defensible position available.',
      { entity_id: rec.entityId });
  }

  if (sent && looksBlank(a.art14_notice_version)) {
    art14Fail('E_ART14_VERSION_MISSING',
      `record '${rec.entityId}' records a notice sent on ${a.art14_notice_sent} but not ` +
        'which version of the notice. Without it a later amendment cannot be traced to ' +
        'the people who received the earlier wording.',
      { entity_id: rec.entityId });
  }

  if (!sent && !looksBlank(a.art14_notice_version)) {
    art14Fail('E_ART14_INCOHERENT',
      `record '${rec.entityId}' names a notice version but records no notice sent.`,
      { entity_id: rec.entityId });
  }
}

/**
 * VIA_CLIENT is recorded but NOT yet permitted, and this is how that is
 * surfaced rather than forgotten.
 *
 * Whether Article 14 may be discharged by asking our client to pass the notice
 * to a person named on their own title or PSC register is an open question for
 * the data protection officer. THE FIELD IS NEEDED EITHER WAY, which is why
 * this was buildable before the answer — but a record that depends on an
 * unanswered question must be findable when it is answered, or the answer
 * arrives and nothing changes.
 */
export function art14PendingDpoDecision(rec: IngestedRecord): boolean {
  return rec.art14 !== undefined && rec.art14.art14_notice_route === 'VIA_CLIENT';
}
