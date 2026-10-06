/**
 * Caprebate — AI Document Pipeline
 * Board item 12830166311. Phase 3, item 5.
 *
 * Clients upload planning documents, fire risk assessments, O&M manuals,
 * asbestos registers, insurance reinstatement valuations, leases and contractor
 * cost breakdowns. This extracts structured fields from each.
 *
 * ============================================================================
 * ABSOLUTE RULE: PLANNING COMMENT TEXT NEVER REACHES A MODEL.
 *
 * Planning portals carry objector and neighbour names and addresses — third
 * party personal data with no lawful basis for us to process. The rule is not
 * negotiable and is not enforced by remembering it.
 *
 * It is enforced structurally, in four layers:
 *
 *   L1  NOT ACQUIRED   the planning fetcher never calls a comments endpoint.
 *                      You cannot leak what you do not hold. (Item 12830181420
 *                      already refuses to store the fields.)
 *   L2  DISCARDED      uploaded planning PDFs are segmented, and every segment
 *                      classified as representations / consultee responses /
 *                      correspondence is DROPPED BEFORE the payload is built.
 *                      Dropped, not redacted — it never enters the payload object.
 *   L3  UNTYPEABLE     the model client accepts only a `ModelPayload`, a branded
 *                      type produced solely by sanitise(). callModel(rawText)
 *                      is a compile error, not a code-review question.
 *   L4  RE-ASSERTED    sanitise() and the client both re-scan for forbidden
 *                      markers and person-name patterns and throw. Belt and
 *                      braces for plain-JS callers.
 *
 * L1 and L2 are the controls that matter. L4 is pattern matching and pattern
 * matching is never complete — it is the last line, not the first.
 * ============================================================================
 *
 * PHASE 151b, 25 September 2026 — THE TAX RETURN AND THE TAX COMPUTATION.
 * Word question 223. The data protection officer, relayed by Lakhbir on 24
 * September 2026: "yes, clients may upload tax returns and tax computations."
 * What must be removed from them is still open, and until the officer says
 * otherwise they are treated like the other financial documents: keep the
 * figures and the company details, and remove individuals' names, addresses
 * and tax references. So both types join DocType with a spec of their own
 * (section 2), three segment kinds that may be kept and two that never are
 * (section 1), and heading rules that find them (section 3). The receipt
 * policies that strip them on arrival are in caprebate-client-doc-ingestion.ts.
 */

import { createHash } from 'node:crypto';
import type { Grade } from './caprebate-source-register.ts';

/* ------------------------------------------------------------------ *
 * 1. Document and segment taxonomy
 * ------------------------------------------------------------------ */

export type DocType =
  | 'PLANNING'
  | 'FIRE_RISK_ASSESSMENT'
  | 'OM_MANUAL'
  | 'ASBESTOS_REGISTER'
  | 'INSURANCE_REINSTATEMENT'
  | 'LEASE'
  | 'CONTRACTOR_COST_BREAKDOWN'
  // Phase 14 (item 12902240772): closes the scoping-inheritance gap on the
  // Stage 2 upload screen. CPSE_REPLIES and SALE_CONTRACT are designed in the
  // same spec doc but remain gated on the pipeline DPIA's party-identity
  // question — see caprebate-document-property-match.ts's header for why
  // that gate exists, and FinderSpec below for the mechanism SALE_CONTRACT
  // will need once it clears.
  | 'BUILDING_REGS_COMPLETION'
  | 'GRANT_FUNDING_AGREEMENT'
  // Phase 21 (item 12902240772 §5-§8): CPSE_REPLIES and SALE_CONTRACT remain
  // gated on the pipeline DPIA (Gate A) and the lease-party question (Gate
  // B) — see HUMAN_READ_ONLY_TYPES below and section 9. Adding the literal
  // types here, with no DOC_SPECS entry, is what makes specFor() refuse to
  // send either to a model: the type exists so an upload is never silently
  // unhandled, but there is no model-facing spec for it to run against.
  | 'CPSE_REPLIES'
  | 'SALE_CONTRACT'
  // Phase 151b (Word question 223, answered yes on 24 September 2026). Both
  // are MODEL-EXTRACTABLE, like the nine above: every field in their specs is
  // a date, a number or a sum of money, and none is a person's.
  | 'TAX_RETURN'
  | 'TAX_COMPUTATION'
  // Phase 146l (Lakhbir, 25 and 27 September 2026): HM Land Registry's title register is looked up BY HAND — a person
  // buys the official copy of the register and the title plan and uploads them. HUMAN-READ-ONLY, like CPSE_REPLIES and
  // SALE_CONTRACT: the proprietorship register names an owner who holds the property personally, and a charge can name
  // an individual lender, so no model reads it. A person reads it and records the facts on the property page.
  | 'TITLE_REGISTER'
  // Phase 157d (the Friary House run, finding F16): four types the claim asks clients for, which nothing could receive.
  // All four are MODEL-EXTRACTABLE on the recommendation recorded by Phase 129 (receipt-recommendations.ts): strip the
  // individuals, keep the figures. Every field below is a date, a number, a sum of money or a room's label; none is a
  // person's, and none is a contractor's or a party's name (a sole trader's name is a person's).
  | 'COMPLETION_STATEMENT'
  | 'ACCOUNTS'
  | 'CONTRACTOR_INVOICE'
  | 'PLANS';

/** Never reach extract()/sanitise()/callModel() — see section 9, captureHumanRead(). */
export const HUMAN_READ_ONLY_TYPES: readonly DocType[] = ['CPSE_REPLIES', 'SALE_CONTRACT', 'TITLE_REGISTER'];

export type SegmentKind =
  // Permitted, per document type
  | 'PROPOSAL_DESCRIPTION'
  | 'DECISION'
  | 'CONDITIONS'
  | 'PLANT_SCHEDULE'
  | 'FINDINGS'
  | 'SURVEY_RESULTS'
  | 'VALUATION'
  | 'DEMISE_AND_TERM'
  | 'COVENANTS'
  | 'COST_SCHEDULE'
  | 'PRELIMS_AND_FEES'
  | 'CERTIFICATE_BODY'
  | 'FUNDING_TERMS'
  | 'FUNDING_SCHEDULE'
  // Phase 151b — the tax return and the tax computation. The company details
  // are a COMPANY's only: its name, its company number, its own tax reference
  // and the period. Only a heading that names the company lands here; a
  // heading about a person ("your details", "business details") never does.
  | 'TAX_ENTITY_DETAILS'
  | 'TAX_PROFIT_COMPUTATION'
  | 'CAPITAL_ALLOWANCES_COMPUTATION'
  // Phase 157d — the four document types. Each names figures, never a person: the price and its parts on a
  // completion statement; the balance sheet, the profit and the fixed-asset note in accounts; the lines and totals of a
  // contractor's invoice; the room schedule and the floor plans' labels on drawings. The parties, the solicitors, the
  // bank details, the directors' report and a drawing's title block land in no kind here, so they are UNCLASSIFIED and
  // never kept.
  | 'COMPLETION_FIGURES'
  | 'ACCOUNTS_STATEMENTS'
  | 'FIXED_ASSET_NOTE'
  | 'INVOICE_LINES'
  | 'DRAWING_SCHEDULE'
  // NEVER permitted, anywhere, for any document type
  | 'REPRESENTATIONS'
  | 'CONSULTEE_RESPONSES'
  | 'CORRESPONDENCE'
  | 'APPLICANT_DETAILS'
  | 'AGENT_DETAILS'
  | 'SIGNATORIES'
  // Phase 151b. An individual's own details on a tax return: a sole trader's,
  // a partner's or a director's name, home address, National Insurance number
  // and personal tax reference. And the declaration a person signs.
  | 'TAXPAYER_PERSONAL_DETAILS'
  | 'DECLARATION'
  | 'UNCLASSIFIED';

/**
 * Never sent to a model. Not for any document type, not with any flag, not
 * with any override. UNCLASSIFIED is on the list because "we could not tell
 * what this section was" must fail closed. Phase 151b added the two kinds a
 * tax return carries about people: nine kinds, where there had been seven.
 */
export const NEVER_TO_MODEL: readonly SegmentKind[] = [
  'REPRESENTATIONS',
  'CONSULTEE_RESPONSES',
  'CORRESPONDENCE',
  'APPLICANT_DETAILS',
  'AGENT_DETAILS',
  'SIGNATORIES',
  'TAXPAYER_PERSONAL_DETAILS',
  'DECLARATION',
  'UNCLASSIFIED',
];

export type Segment = {
  kind: SegmentKind;
  heading: string;
  text: string;
  page: number;
};

export class PipelineError extends Error {
  code: string;
  detail: Record<string, unknown>;
  constructor(code: string, message: string, detail: Record<string, unknown> = {}) {
    super(`[${code}] ${message}`);
    this.name = 'PipelineError';
    this.code = code;
    this.detail = detail;
  }
}

/* ------------------------------------------------------------------ *
 * 2. Extraction specification, per document type
 *
 * Threshold is set per FIELD, by consequence — not one number for the whole
 * system. A field that enters the apportionment or drives a gate needs near
 * certainty; a descriptive field that only appears in narrative does not.
 * This closes schema gap G-3, which left every B-grade field ungraded in
 * practice because no threshold had ever been set.
 * ------------------------------------------------------------------ */

export type FieldSpec = {
  field_id: string;
  /** Where the value ends up mattering. Drives the threshold. */
  consequence: 'APPORTIONMENT' | 'GATE' | 'TAXONOMY' | 'NARRATIVE';
  /** Below this, the field drops from grade B to grade C (schema §0.5). */
  threshold: number;
  /** Which segments may be searched for it. */
  from: readonly SegmentKind[];
  note?: string;
};

/** Threshold by consequence. Stated once so it cannot drift field by field. */
export const THRESHOLD_BY_CONSEQUENCE: Record<FieldSpec['consequence'], number> = {
  APPORTIONMENT: 0.95, // enters a figure a surveyor signs
  GATE: 0.95,          // routes a branch; I-1 and I-17 apply downstream
  TAXONOMY: 0.85,      // selects a fixture row
  NARRATIVE: 0.70,     // appears in prose, computed on by nothing
};

const f = (field_id: string, consequence: FieldSpec['consequence'], from: SegmentKind[], note?: string): FieldSpec => ({
  field_id,
  consequence,
  threshold: THRESHOLD_BY_CONSEQUENCE[consequence],
  from,
  note,
});

export type DocSpec = {
  doc_type: DocType;
  /** Segments this document type may contribute. Everything else is dropped. */
  permitted_segments: readonly SegmentKind[];
  fields: readonly FieldSpec[];
  why: string;
};

export const DOC_SPECS: readonly DocSpec[] = [
  {
    doc_type: 'PLANNING',
    // Deliberately tiny. A planning document tells us what works were permitted
    // and when. Nothing else in it is any use to a capital allowances claim,
    // and everything else in it is a data-protection liability.
    permitted_segments: ['PROPOSAL_DESCRIPTION', 'DECISION', 'CONDITIONS'],
    fields: [
      f('planning_reference', 'NARRATIVE', ['DECISION']),
      f('planning_decision', 'NARRATIVE', ['DECISION']),
      f('planning_decision_date', 'TAXONOMY', ['DECISION'], 'dates the works, which dates the plant'),
      f('planning_description', 'TAXONOMY', ['PROPOSAL_DESCRIPTION']),
      f('planning_plant_conditions', 'TAXONOMY', ['CONDITIONS'], 'extract ventilation, plant screening, acoustic enclosures'),
    ],
    why: 'Dates and describes the works. A permission is not evidence the work was done — hence grade B, never A.',
  },
  {
    doc_type: 'FIRE_RISK_ASSESSMENT',
    permitted_segments: ['FINDINGS', 'SURVEY_RESULTS'],
    fields: [
      f('fra_alarm_system_category', 'TAXONOMY', ['FINDINGS', 'SURVEY_RESULTS']),
      f('fra_emergency_lighting', 'TAXONOMY', ['FINDINGS', 'SURVEY_RESULTS']),
      f('fra_sprinkler_or_suppression', 'TAXONOMY', ['FINDINGS', 'SURVEY_RESULTS']),
      f('fra_smoke_ventilation_aov', 'TAXONOMY', ['FINDINGS', 'SURVEY_RESULTS']),
      f('fra_dry_or_wet_riser', 'TAXONOMY', ['FINDINGS', 'SURVEY_RESULTS']),
      f('fra_fire_door_count', 'TAXONOMY', ['SURVEY_RESULTS']),
      f('fra_assessment_date', 'NARRATIVE', ['FINDINGS']),
    ],
    why: 'The best independent evidence of life-safety plant, which is a large qualifying category in care and clinical settings.',
  },
  {
    doc_type: 'OM_MANUAL',
    permitted_segments: ['PLANT_SCHEDULE'],
    fields: [
      f('om_plant_items', 'TAXONOMY', ['PLANT_SCHEDULE'], 'list: description, category, make/model, capacity, install date, location'),
      f('om_commissioning_date', 'TAXONOMY', ['PLANT_SCHEDULE']),
      f('om_system_types', 'TAXONOMY', ['PLANT_SCHEDULE']),
    ],
    why: 'The richest source in the set. An O&M plant schedule is a fixture inventory that somebody else already built.',
  },
  {
    doc_type: 'ASBESTOS_REGISTER',
    permitted_segments: ['SURVEY_RESULTS'],
    fields: [
      f('asb_acm_locations', 'TAXONOMY', ['SURVEY_RESULTS'], 'ACMs in plant rooms and service voids date the original installation'),
      f('asb_survey_date', 'NARRATIVE', ['SURVEY_RESULTS']),
      f('asb_survey_type', 'NARRATIVE', ['SURVEY_RESULTS']),
    ],
    why: 'Dates original installations and bears on whether a replacement is a repair or capital (Module 00 §4).',
  },
  {
    doc_type: 'INSURANCE_REINSTATEMENT',
    permitted_segments: ['VALUATION'],
    fields: [
      f('reinstatement_declared_value_pence', 'APPORTIONMENT', ['VALUATION'], 'an INDEPENDENT claim on rebuild cost — corroborates B'),
      f('reinstatement_basis', 'APPORTIONMENT', ['VALUATION']),
      f('reinstatement_gia_m2', 'APPORTIONMENT', ['VALUATION']),
      f('reinstatement_professional_fees_pct', 'APPORTIONMENT', ['VALUATION']),
      f('reinstatement_valuation_date', 'APPORTIONMENT', ['VALUATION']),
    ],
    why: 'The only independent cross-check on the rebuild cost in the s.562 residual. Feeds the reconciliation engine as a separate claim.',
  },
  {
    doc_type: 'LEASE',
    permitted_segments: ['DEMISE_AND_TERM', 'COVENANTS'],
    fields: [
      f('lease_term_years', 'GATE', ['DEMISE_AND_TERM'], 's.183 / entitlement'),
      f('lease_commencement_date', 'GATE', ['DEMISE_AND_TERM']),
      f('lease_repairing_basis', 'GATE', ['COVENANTS'], 'FRI / IRI — who owns the fixtures'),
      f('landlord_contribution_amount_pence', 'APPORTIONMENT', ['COVENANTS'],
        'I-4: a contribution is a NUMBER that is deducted, not a flag that is noted'),
      f('lease_tenant_fixtures_clause', 'GATE', ['COVENANTS']),
      f('lease_reinstatement_obligation', 'NARRATIVE', ['COVENANTS']),
    ],
    why: 'Entitlement and the landlord contribution. I-4 records that the contribution was a note in four of five sectors and a number in none.',
  },
  {
    doc_type: 'CONTRACTOR_COST_BREAKDOWN',
    permitted_segments: ['COST_SCHEDULE', 'PRELIMS_AND_FEES'],
    fields: [
      f('cost_elements', 'APPORTIONMENT', ['COST_SCHEDULE'], 'element, description, qty, unit, rate, total'),
      f('cost_prelims_pct', 'APPORTIONMENT', ['PRELIMS_AND_FEES'], 'engine default 18%'),
      f('cost_professional_fees_pct', 'APPORTIONMENT', ['PRELIMS_AND_FEES'], 'engine default 15%, on cost plus prelims'),
      f('cost_provisional_sums', 'APPORTIONMENT', ['COST_SCHEDULE']),
      f('cost_contingency', 'APPORTIONMENT', ['COST_SCHEDULE']),
    ],
    why: 'Actual cost beats a cost model. Where this exists it is the best evidence in the file.',
  },
  {
    doc_type: 'BUILDING_REGS_COMPLETION',
    // A straight omission from the original seven (item 12902240772 §3) —
    // short, semi-standardised, gates nothing, and carries no third-party
    // personal data beyond the signatory block (SIGNATORIES), which is
    // already on NEVER_TO_MODEL.
    permitted_segments: ['CERTIFICATE_BODY'],
    fields: [
      f('brc_certificate_reference', 'NARRATIVE', ['CERTIFICATE_BODY']),
      f('brc_issuing_body', 'NARRATIVE', ['CERTIFICATE_BODY'],
        'local authority or approved inspector — the distinction matters, because approved-inspector jobs have no council copy and the client\'s is the only one'),
      f('brc_works_description', 'TAXONOMY', ['CERTIFICATE_BODY'], 'what was actually built and signed off, as against what was approved'),
      f('brc_completion_date', 'TAXONOMY', ['CERTIFICATE_BODY'], 'dates the works and therefore the plant'),
    ],
    why: 'Confirms what was actually built and signed off rather than merely permitted, and dates it. There is no ' +
      'national API, council copies are chargeable, and they are unavailable altogether where a private approved ' +
      'inspector signed the job off — so the client\'s copy is the only economic route to this evidence.',
  },
  {
    doc_type: 'GRANT_FUNDING_AGREEMENT',
    // s.532 removes base before anything else is calculated (item 12902240772
    // §4). This spec emits NO derived deduction figure: whether the funding
    // was payable for specific items is Rulebook F's tracing judgement, and
    // it is made under that rulebook, not computed here. (Until 22 Sep 2026 this
    // said it went to a CTA review task; Caprebate has no per-case tax adviser
    // under clause 1 of the engagement letter — see REVIEWER below.)
    permitted_segments: ['FUNDING_TERMS', 'FUNDING_SCHEDULE'],
    fields: [
      f('grant_funder_name', 'NARRATIVE', ['FUNDING_TERMS'], 'the funding body, not an individual'),
      f('grant_amount_pence', 'APPORTIONMENT', ['FUNDING_TERMS'],
        'integer pence. I-4 discipline: a contribution is a number that is deducted, not a flag that is noted'),
      f('grant_agreement_date', 'APPORTIONMENT', ['FUNDING_TERMS']),
      f('grant_purpose_description', 'APPORTIONMENT', ['FUNDING_TERMS'], 'verbatim, with locator — the words the agreement uses, not a paraphrase'),
      f('grant_itemised_schedule', 'APPORTIONMENT', ['FUNDING_SCHEDULE'], 'where the agreement lists specific items or works, extract the list as given'),
      f('grant_conditions', 'NARRATIVE', ['FUNDING_TERMS'], 'clawback, use restrictions, reporting'),
    ],
    why: 's.532 removes base before anything else is calculated, and the error direction here is over-claim. The ' +
      'facts of the funding are extractable; whether the money is traceable to particular expenditure is not, and ' +
      'is Rulebook F\'s tracing judgement. The model returns the amount and the words; the deduction is decided under Rulebook F, ' +
      'and the filing position is signed by whoever clause 1 of the engagement letter names.',
  },
  /*
   * THE TAX RETURN AND THE TAX COMPUTATION — Phase 151b, 25 September 2026.
   * Word question 223: the data protection officer said yes to the uploads on
   * 24 September 2026; what must be removed stays open, and until the officer
   * says otherwise the figures and the company details are kept and the
   * individuals are removed. The fields are ONLY what a claim reads from them:
   * the period, the taxable profit, what the return already claims by pool,
   * the annual investment allowance used, and the two pool balances.
   *
   * NO FIELD HERE IS A NAME OR A TAX REFERENCE — not the company's name, not
   * its UTR, not a person's. The company details are KEPT as text on receipt
   * (the segment TAX_ENTITY_DETAILS), because the officer's rule keeps them;
   * but nothing a claim computes needs them, so nothing extracts them. The one
   * identifier extracted is the company number, which ties the return to the
   * claimant, and which only a company or an LLP has.
   *
   * WHY NONE IS 'APPORTIONMENT'. That consequence routes a review task to a
   * SURVEYOR (REVIEWER, section 6), and a surveyor may not read either type:
   * both carry value, so their readers are the claim team (migrations 013 and
   * 045). The figures are GATE fields: they decide whether the allowances can
   * be used this period and how much of the annual investment allowance is
   * left, which is a branch, not a surveyed figure. Same threshold, 0.95.
   */
  {
    doc_type: 'TAX_RETURN',
    permitted_segments: ['TAX_ENTITY_DETAILS', 'TAX_PROFIT_COMPUTATION', 'CAPITAL_ALLOWANCES_COMPUTATION'],
    fields: [
      f('taxret_period_start', 'GATE', ['TAX_ENTITY_DETAILS', 'TAX_PROFIT_COMPUTATION'], 'the first day of the period the return covers'),
      f('taxret_period_end', 'GATE', ['TAX_ENTITY_DETAILS', 'TAX_PROFIT_COMPUTATION'],
        'the last day of that period — the claim\'s ACCOUNTING_PERIOD_END is checked against it'),
      f('taxret_company_number', 'NARRATIVE', ['TAX_ENTITY_DETAILS'],
        'a company or LLP only: a sole trader has none, and the field is then not found, never guessed. A number, never a name'),
      f('taxret_taxable_profit_pence', 'GATE', ['TAX_PROFIT_COMPUTATION'],
        'integer pence, a loss negative — whether the allowances can be used this period'),
      f('taxret_capital_allowances_by_pool', 'GATE', ['CAPITAL_ALLOWANCES_COMPUTATION'],
        'list: pool (main, special rate, single asset), allowance (AIA, writing-down, first-year), amount in pence — what the return already claims, so nothing is claimed twice'),
      f('taxret_aia_claimed_pence', 'GATE', ['CAPITAL_ALLOWANCES_COMPUTATION'],
        'the annual investment allowance the return already uses — AIA headroom is what is left'),
    ],
    why: 'What the client has already told HMRC for the period: the profit the allowances would be set against, and the ' +
      'allowances already claimed. A claim that ignores either can claim twice or claim what cannot be used. The ' +
      'company details are kept as text; the people on the return — the taxpayer where it is a sole trader, the ' +
      'directors, the preparer and whoever signs the declaration — are not kept at all.',
  },
  {
    doc_type: 'TAX_COMPUTATION',
    permitted_segments: ['TAX_ENTITY_DETAILS', 'TAX_PROFIT_COMPUTATION', 'CAPITAL_ALLOWANCES_COMPUTATION'],
    fields: [
      f('taxcomp_period_start', 'GATE', ['TAX_ENTITY_DETAILS', 'TAX_PROFIT_COMPUTATION', 'CAPITAL_ALLOWANCES_COMPUTATION']),
      f('taxcomp_period_end', 'GATE', ['TAX_ENTITY_DETAILS', 'TAX_PROFIT_COMPUTATION', 'CAPITAL_ALLOWANCES_COMPUTATION'],
        'a computation is usually titled with it — "for the year ended 31 March 2026"'),
      f('taxcomp_taxable_profit_pence', 'GATE', ['TAX_PROFIT_COMPUTATION'], 'integer pence, a loss negative'),
      f('taxcomp_capital_allowances_by_pool', 'GATE', ['CAPITAL_ALLOWANCES_COMPUTATION'],
        'list: pool, allowance, amount in pence, as the computation sets it out'),
      f('taxcomp_main_pool_balance_pence', 'GATE', ['CAPITAL_ALLOWANCES_COMPUTATION'],
        'the main pool\'s written-down value carried forward — the pool the claim\'s additions join'),
      f('taxcomp_special_rate_pool_balance_pence', 'GATE', ['CAPITAL_ALLOWANCES_COMPUTATION'],
        'the special rate pool\'s written-down value carried forward — integral features and long-life assets join it'),
      f('taxcomp_aia_claimed_pence', 'GATE', ['CAPITAL_ALLOWANCES_COMPUTATION']),
    ],
    why: 'The pool figures and the profit position are the claim\'s inputs: the balances the new additions join, the ' +
      'annual investment allowance already used, and the profit it is set against. The preparer\'s name, and an ' +
      'individual taxpayer\'s tax reference or National Insurance number, are not needed and are not kept.',
  },
  /*
   * PHASE 157d — FOUR MORE TYPES THE CLAIM ASKS FOR (the Friary House run, F16). On Phase 129's recorded
   * recommendation for each (src/web/receipt-recommendations.ts): strip the individuals, keep the figures. The
   * completion statement and the accounts are read by the claim team only, so their figures are GATE, never
   * APPORTIONMENT (which sends a review to a surveyor). A contractor's invoice and plans are claim evidence, which a
   * surveyor reads.
   */
  {
    doc_type: 'COMPLETION_STATEMENT',
    permitted_segments: ['COMPLETION_FIGURES'],
    fields: [
      f('cs_completion_date', 'GATE', ['COMPLETION_FIGURES'], 'the day the purchase completed — the acquisition date'),
      f('cs_purchase_price_pence', 'GATE', ['COMPLETION_FIGURES'], 'integer pence: the price, before adjustments'),
      f('cs_price_apportionment', 'GATE', ['COMPLETION_FIGURES'],
        'list: part (land, buildings, fixtures, chattels, goodwill), amount in pence — where the statement splits the price'),
      f('cs_stamp_duty_pence', 'NARRATIVE', ['COMPLETION_FIGURES'], 'SDLT or LTT, where shown'),
    ],
    why: 'The price, its apportionment, the stamp duty and the date are what the claim needs. The fee earners, any ' +
      'individual party and the bank details for completion money are not.',
  },
  {
    doc_type: 'ACCOUNTS',
    permitted_segments: ['ACCOUNTS_STATEMENTS', 'FIXED_ASSET_NOTE', 'TAX_PROFIT_COMPUTATION', 'CAPITAL_ALLOWANCES_COMPUTATION'],
    fields: [
      f('acc_period_end', 'GATE', ['ACCOUNTS_STATEMENTS', 'FIXED_ASSET_NOTE'], 'the balance sheet date'),
      f('acc_profit_before_tax_pence', 'GATE', ['ACCOUNTS_STATEMENTS', 'TAX_PROFIT_COMPUTATION'], 'integer pence, a loss negative'),
      f('acc_fixed_asset_additions', 'GATE', ['FIXED_ASSET_NOTE'],
        'list: asset class (land and buildings, fixtures and fittings, plant), additions in the year in pence'),
      f('acc_land_and_buildings_cost_pence', 'GATE', ['FIXED_ASSET_NOTE'], 'cost at the period end'),
      f('acc_capital_allowances_claimed_pence', 'GATE', ['CAPITAL_ALLOWANCES_COMPUTATION'], 'where the tax note shows them'),
    ],
    why: 'The balance sheet and the fixed-asset and tax notes say whether the company can use the allowances and what it ' +
      'has already capitalised; the directors, the preparer and anyone in a related-party note are not needed for that.',
  },
  {
    doc_type: 'CONTRACTOR_INVOICE',
    permitted_segments: ['INVOICE_LINES', 'COST_SCHEDULE', 'PRELIMS_AND_FEES'],
    fields: [
      f('inv_lines', 'APPORTIONMENT', ['INVOICE_LINES', 'COST_SCHEDULE'], 'list: description of the work, amount in pence'),
      f('inv_total_net_pence', 'APPORTIONMENT', ['INVOICE_LINES', 'COST_SCHEDULE'], 'the total before VAT'),
      f('inv_vat_pence', 'NARRATIVE', ['INVOICE_LINES']),
      f('inv_date', 'NARRATIVE', ['INVOICE_LINES'], 'the invoice or valuation date — when the cost was incurred'),
    ],
    why: 'Line items, amounts and dates are actual cost, which beats any apportionment. A sole-trader contractor\'s name, ' +
      'a signatory and anybody\'s bank details are not needed for it, and no field holds a contractor\'s name.',
  },
  {
    doc_type: 'PLANS',
    permitted_segments: ['DRAWING_SCHEDULE'],
    fields: [
      f('plans_rooms', 'TAXONOMY', ['DRAWING_SCHEDULE'], 'list: room label, floor, area in m² where shown'),
      f('plans_gia_m2', 'TAXONOMY', ['DRAWING_SCHEDULE'], 'the gross internal area, where a schedule of accommodation gives it'),
      f('plans_drawing_date', 'NARRATIVE', ['DRAWING_SCHEDULE']),
    ],
    why: 'Room labels and schedules locate the plant. The title block\'s drawn-by, checked-by and client names are not ' +
      'needed. Only the text layer passes the strip.',
  },
];

/**
 * MANDATORY PERSON REVIEW, PER DOCUMENT TYPE — BUILT AND SWITCHED OFF.
 * Phase 132, 14 September 2026.
 *
 * WHAT IT CHANGES. Today `extract()` records a value at or above its confidence
 * threshold with no person looking at it: a 0.96 on an apportionment field
 * stands at grade B on the model's word. Turning a type ON here puts every field
 * found on that type in front of a person — `needs_human_review: true` and one
 * review task each, routed to the same reviewer the consequence already names —
 * however confident the model was.
 *
 * WHAT IT DOES NOT CHANGE. The GRADE. A field a person has been asked to check is
 * still the model's reading until they check it, so it stays at B or C exactly as
 * the threshold put it; promoting or demoting it on the switch would be a figure
 * moving because a setting moved. And a field ALREADY below threshold already has
 * its one task, so it does not get a second.
 *
 * EXHAUSTIVE BY TYPE, AT TYPECHECK. Keyed by every type DOC_SPECS carries — every
 * DocType but the two human-read-only ones, which never reach extract() at all.
 * Adding a DocType without a row here fails the typecheck, and a test asserts the
 * keys equal the DOC_SPECS types at runtime as well.
 *
 * AND FAIL CLOSED WHERE A TABLE IS PASSED IN. `extract()` reads a type missing
 * from the table it is handed as REVIEW REQUIRED. Only an explicit `false` switches
 * review off: an absent row is not a decision that nobody needs to look.
 *
 * ALL FALSE, AS SHIPPED, UNTIL 22 SEPTEMBER 2026. Which types warrant a person on
 * every field is a decision for whoever owns the extraction's error rate, not a
 * build step — and Phase 146e was told to take one: FIRE_RISK_ASSESSMENT IS ON. A
 * fire risk assessment can hold residents' health details (who needs help to leave
 * the building, and why), so every field read from one is checked by a person
 * before it stands, however confident the model was. The other eight are as they
 * were. Recorded in 09-app/CAPREBATE-DEVELOPER-SPEC.md; test M1 holds the table.
 * Phase 151b added the tax return and the tax computation, OFF: whether a person
 * checks every figure read from them is the same kind of decision, and nobody has
 * taken it.
 */
export type ExtractableDocType = Exclude<DocType, 'CPSE_REPLIES' | 'SALE_CONTRACT' | 'TITLE_REGISTER'>;

export const PERSON_REVIEW_BY_DOC_TYPE: Readonly<Record<ExtractableDocType, boolean>> = Object.freeze({
  PLANNING: false,
  FIRE_RISK_ASSESSMENT: true, // Phase 146e: residents' health details — a person checks every field
  OM_MANUAL: false,
  ASBESTOS_REGISTER: false,
  INSURANCE_REINSTATEMENT: false,
  LEASE: false,
  CONTRACTOR_COST_BREAKDOWN: false,
  BUILDING_REGS_COMPLETION: false,
  GRANT_FUNDING_AGREEMENT: false,
  // Phase 151b. Off, as every type is until somebody who owns the error rate
  // decides otherwise — Phase 146e's rule for this table. Not decided here.
  TAX_RETURN: false,
  TAX_COMPUTATION: false,
  // Phase 157d. Off, by the same rule.
  COMPLETION_STATEMENT: false,
  ACCOUNTS: false,
  CONTRACTOR_INVOICE: false,
  PLANS: false,
});

export function specFor(t: DocType): DocSpec {
  if (HUMAN_READ_ONLY_TYPES.includes(t)) {
    throw new PipelineError('E_HUMAN_READ_ONLY', `'${t}' is HUMAN_READ_ONLY — no model spec exists; use captureHumanRead()`, { doc_type: t });
  }
  const s = DOC_SPECS.find((x) => x.doc_type === t);
  if (!s) throw new PipelineError('E_UNKNOWN_DOC_TYPE', `no extraction spec for document type '${t}'`);
  return s;
}

/* ------------------------------------------------------------------ *
 * 3. Segmentation
 *
 * Heading-driven, and it FAILS CLOSED: anything it cannot classify becomes
 * UNCLASSIFIED, which is on NEVER_TO_MODEL. A segmenter that guesses
 * "probably fine" is the same as no segmenter.
 * ------------------------------------------------------------------ */

const HEADING_RULES: { kind: SegmentKind; patterns: RegExp[] }[] = [
  { kind: 'REPRESENTATIONS', patterns: [/represent/i, /objection/i, /comment/i, /neighbour/i, /public\s+not/i, /third[- ]party/i, /letters?\s+received/i] },
  { kind: 'CONSULTEE_RESPONSES', patterns: [/consult/i, /statutory\s+response/i] },
  { kind: 'CORRESPONDENCE', patterns: [/correspond/i, /email/i, /\bletter\b/i] },
  { kind: 'APPLICANT_DETAILS', patterns: [/applicant/i, /\bowner\s+details/i] },
  { kind: 'AGENT_DETAILS', patterns: [/\bagent\b/i] },
  { kind: 'SIGNATORIES', patterns: [/signed/i, /signatur/i, /prepared\s+by/i, /assessor\s+details/i, /surveyor\s+details/i] },
  // Phase 151b. A person's own details on a tax return, and the declaration.
  // Narrow on purpose: each names a person or a person's identifier. "Business
  // details" is here because on a sole trader's return the business name and
  // address ARE the person's. A bare "Tax reference" or "UTR" heading matches
  // nothing and falls to UNCLASSIFIED — it cannot say whose it is, so it goes.
  { kind: 'TAXPAYER_PERSONAL_DETAILS', patterns: [
    /personal\s+details/i, /\byour\s+(personal\s+)?(details|name|address)/i, /\btaxpayer'?s?\s+(details|name|address)/i,
    /national\s+insurance/i, /\bnino\b/i, /\b(director|partner|member|proprietor)s?'?s?'?\s+(details|names?|address)/i,
    /\b(home|residential|private)\s+address/i, /business\s+details/i, /date\s+of\s+birth/i,
  ] },
  { kind: 'DECLARATION', patterns: [/declaration/i, /\bi\s+declare\b/i] },
  { kind: 'PROPOSAL_DESCRIPTION', patterns: [/proposal/i, /description\s+of\s+develop/i, /\bproposed\s+develop/i] },
  { kind: 'DECISION', patterns: [/decision/i, /notice\s+of\s+grant/i, /permission/i] },
  { kind: 'CONDITIONS', patterns: [/condition/i] },
  { kind: 'PLANT_SCHEDULE', patterns: [/plant\s+schedule/i, /equipment\s+schedule/i, /asset\s+(register|list)/i, /\bm&e\b/i, /mechanical\s+and\s+electrical/i] },
  { kind: 'FINDINGS', patterns: [/finding/i, /significant\s+finding/i, /fire\s+safety\s+measures/i] },
  { kind: 'SURVEY_RESULTS', patterns: [/survey\s+result/i, /\bregister\b/i, /inspection/i, /schedule\s+of\s+acm/i, /\bdoor\s+schedule\b/i] },
  { kind: 'VALUATION', patterns: [/reinstatement/i, /declared\s+value/i, /valuation/i, /sum\s+insured/i] },
  { kind: 'DEMISE_AND_TERM', patterns: [/demise/i, /\bterm\b/i, /particulars/i, /\bpremises\b/i] },
  { kind: 'COVENANTS', patterns: [/covenant/i, /obligation/i, /repair/i, /contribution/i, /rent[- ]free/i, /fit[- ]?out/i] },
  { kind: 'COST_SCHEDULE', patterns: [/cost\s+(schedule|breakdown)/i, /bill\s+of\s+quantit/i, /valuation\s+no/i, /elemental/i] },
  { kind: 'PRELIMS_AND_FEES', patterns: [/prelim/i, /professional\s+fee/i, /oh&p/i, /overhead/i] },
  { kind: 'CERTIFICATE_BODY', patterns: [/completion\s+certificate/i, /building\s+regulations?/i, /certificate\s+of\s+completion/i, /certificate\s+reference/i] },
  { kind: 'FUNDING_TERMS', patterns: [/funding\s+(agreement|terms)/i, /grant\s+(agreement|terms|conditions)/i, /grant\s+funding/i, /clawback/i] },
  { kind: 'FUNDING_SCHEDULE', patterns: [/itemised\s+schedule/i, /schedule\s+of\s+(works|items|expenditure)/i, /funding\s+schedule/i] },
  // Phase 151b — the tax return and the tax computation. LAST, so that no
  // heading any of the eleven earlier types already used changes kind.
  { kind: 'CAPITAL_ALLOWANCES_COMPUTATION', patterns: [
    /capital\s+allowances?/i, /(main|special\s+rate|single\s+asset)\s+pool/i, /annual\s+investment\s+allowance/i,
    /\baia\b/i, /writing[- ]down\s+allowance/i, /first[- ]year\s+allowance/i, /full\s+expensing/i,
    /balancing\s+(charge|allowance)/i, /structures\s+and\s+buildings/i,
  ] },
  { kind: 'TAX_PROFIT_COMPUTATION', patterns: [
    /tax\s+computation/i, /computation\s+of\s+(taxable\s+)?(profits?|tax)/i, /taxable\s+(total\s+)?profits?/i,
    /trading\s+(profits?|income|losses?)/i, /adjusted\s+(trading\s+)?profits?/i, /chargeable\s+profits?/i,
    /profits?\s+(before|chargeable)/i, /tax\s+calculation/i, /\bturnover\b/i,
  ] },
  { kind: 'TAX_ENTITY_DETAILS', patterns: [
    /\bcompany\s+(information|details|name|registration|number)/i, /\bcompany'?s?\s+(tax\s+reference|unique\s+taxpayer|utr)/i,
    /return\s+period/i, /accounting\s+period/i, /period\s+covered/i,
  ] },
  // Phase 157d — the four types. LAST again, so no heading an earlier type used changes kind (test TX2).
  { kind: 'COMPLETION_FIGURES', patterns: [
    /completion\s+statement/i, /purchase\s+price/i, /\bconsideration\b/i, /apportion/i, /stamp\s+duty/i, /\bsdlt\b/i,
    /land\s+transaction\s+tax/i, /completion\s+date/i, /balance\s+(due|required)/i,
  ] },
  { kind: 'ACCOUNTS_STATEMENTS', patterns: [
    /balance\s+sheet/i, /statement\s+of\s+financial\s+position/i, /profit\s+and\s+loss/i, /income\s+statement/i,
    /statement\s+of\s+comprehensive\s+income/i,
  ] },
  { kind: 'FIXED_ASSET_NOTE', patterns: [
    /tangible\s+(fixed\s+)?assets/i, /\bfixed\s+assets/i, /property,?\s+plant\s+and\s+equipment/i, /depreciation/i,
  ] },
  { kind: 'INVOICE_LINES', patterns: [
    /\binvoice\b/i, /application\s+for\s+payment/i, /payment\s+(application|certificate)/i, /description\s+of\s+(works|services)/i,
    /amount\s+due/i, /\binterim\s+valuation/i,
  ] },
  { kind: 'DRAWING_SCHEDULE', patterns: [
    /room\s+(schedule|data|layout)/i, /schedule\s+of\s+accommodation/i, /floor\s+plan/i, /drawing\s+(schedule|register|list)/i,
    /\b(ground|first|second|third|lower\s+ground|basement)\s+floor\b/i, /gross\s+internal\s+area/i, /\bgia\b/i,
  ] },
];

export function classifyHeading(heading: string): SegmentKind {
  // Forbidden kinds are tested first: a section headed
  // "Consultation responses and proposal comments" must classify as forbidden,
  // not as PROPOSAL_DESCRIPTION. Order is the control here.
  for (const r of HEADING_RULES) {
    if (r.patterns.some((p) => p.test(heading))) return r.kind;
  }
  return 'UNCLASSIFIED';
}

/** Splits a document into segments on its headings. Unheaded text is UNCLASSIFIED. */
export function segment(pages: readonly { page: number; lines: readonly string[] }[]): Segment[] {
  const out: Segment[] = [];
  let cur: Segment | null = null;
  const isHeading = (l: string) =>
    l.trim().length > 0 && l.trim().length < 80 && (l === l.toUpperCase() || /^\s*\d+(\.\d+)*\s+\S/.test(l) || /:$/.test(l.trim()));

  for (const p of pages) {
    for (const line of p.lines) {
      if (isHeading(line)) {
        if (cur) out.push(cur);
        cur = { kind: classifyHeading(line), heading: line.trim(), text: '', page: p.page };
      } else if (cur) {
        cur.text += (cur.text ? '\n' : '') + line;
      } else {
        cur = { kind: 'UNCLASSIFIED', heading: '(no heading)', text: line, page: p.page };
      }
    }
  }
  if (cur) out.push(cur);
  return out;
}

/* ------------------------------------------------------------------ *
 * 4. The payload — the only thing a model may be given
 * ------------------------------------------------------------------ */

declare const PAYLOAD_BRAND: unique symbol;

export type ModelPayload = {
  readonly [PAYLOAD_BRAND]: 'caprebate.model.payload.v1';
  readonly doc_id: string;
  readonly doc_type: DocType;
  readonly segments: readonly { kind: SegmentKind; heading: string; text: string; page: number }[];
  readonly fields_requested: readonly string[];
  readonly payload_hash: string;
};

/** Third layer only. Pattern matching is never complete; L1 and L2 do the work. */
export const PERSON_NAME_PATTERNS: readonly RegExp[] = [
  /\b(Mr|Mrs|Ms|Miss|Dr|Prof|Sir|Dame|Lord|Lady)\.?\s+[A-Z][a-z]+/,
  /\b(name|signed|signature|contact|objector|applicant|agent)\s*:\s*[A-Z][a-z]+\s+[A-Z][a-z]+/i,
  /\bon behalf of\s+[A-Z][a-z]+\s+[A-Z][a-z]+/,
  /\byours\s+(sincerely|faithfully)\b/i,
];

export type SanitiseResult = {
  payload: ModelPayload;
  dropped: { kind: SegmentKind; heading: string; page: number; reason: string }[];
};

function canonical(v: unknown): string {
  if (v === null || v === undefined) return 'null';
  if (Array.isArray(v)) return '[' + v.map(canonical).join(',') + ']';
  if (typeof v === 'object') {
    const o = v as Record<string, unknown>;
    return '{' + Object.keys(o).sort().map((k) => JSON.stringify(k) + ':' + canonical(o[k])).join(',') + '}';
  }
  return JSON.stringify(v);
}

/**
 * The ONLY producer of a ModelPayload.
 *
 * Forbidden segments are dropped before the payload object is constructed —
 * they are never a property of it, so there is nothing to accidentally
 * serialise, log or forward.
 */
export function sanitise(doc_id: string, doc_type: DocType, segments: readonly Segment[]): SanitiseResult {
  const spec = specFor(doc_type);
  const dropped: SanitiseResult['dropped'] = [];
  const kept: { kind: SegmentKind; heading: string; text: string; page: number }[] = [];

  for (const s of segments) {
    if (NEVER_TO_MODEL.includes(s.kind)) {
      dropped.push({ kind: s.kind, heading: s.heading, page: s.page, reason: 'segment kind is never sent to a model' });
      continue;
    }
    if (!spec.permitted_segments.includes(s.kind)) {
      dropped.push({ kind: s.kind, heading: s.heading, page: s.page, reason: `not a permitted segment for ${doc_type}` });
      continue;
    }
    // L4. A permitted segment can still contain a name in running text
    // ("erection of a dwelling for Mr Smith"). Refuse rather than scrub: a
    // silent scrub hides the fact that the segmenter let something through.
    const hit = PERSON_NAME_PATTERNS.find((p) => p.test(s.text) || p.test(s.heading));
    if (hit) {
      dropped.push({ kind: s.kind, heading: s.heading, page: s.page, reason: `person-name pattern matched: ${hit}` });
      continue;
    }
    kept.push({ kind: s.kind, heading: s.heading, text: s.text, page: s.page });
  }

  const fields_requested = spec.fields.map((x) => x.field_id);
  const body = { doc_id, doc_type, segments: kept, fields_requested };
  const payload = {
    doc_id, doc_type, segments: kept, fields_requested,
    payload_hash: createHash('sha256').update(canonical(body)).digest('hex'),
  } as unknown as ModelPayload;

  return { payload, dropped };
}

/* ------------------------------------------------------------------ *
 * 5. The model client — accepts nothing but a ModelPayload
 * ------------------------------------------------------------------ */

export type RawExtraction = { field_id: string; value: unknown; confidence: number; page: number; quote_ref: string }[];

export type ModelFn = (payload: ModelPayload) => RawExtraction;

export type EgressEntry = {
  doc_id: string;
  doc_type: DocType;
  at: string;
  payload_hash: string;
  segments_sent: { kind: SegmentKind; page: number }[];
  segments_dropped: { kind: SegmentKind; page: number; reason: string }[];
  fields_requested: readonly string[];
};

/**
 * Re-asserts the rule at the boundary, then calls the model and records what
 * left the building. If anyone ever asks "what did you send", this is the answer.
 */
export function callModel(
  model: ModelFn,
  payload: ModelPayload,
  ctx: { at: string; dropped: SanitiseResult['dropped']; egress: EgressEntry[] },
): RawExtraction {
  for (const s of payload.segments) {
    if (NEVER_TO_MODEL.includes(s.kind)) {
      throw new PipelineError('E_FORBIDDEN_SEGMENT', `segment '${s.kind}' reached the model boundary`, { heading: s.heading });
    }
    const hit = PERSON_NAME_PATTERNS.find((p) => p.test(s.text));
    if (hit) {
      throw new PipelineError('E_PERSON_NAME', 'a person-name pattern reached the model boundary', { heading: s.heading });
    }
  }
  ctx.egress.push({
    doc_id: payload.doc_id,
    doc_type: payload.doc_type,
    at: ctx.at,
    payload_hash: payload.payload_hash,
    segments_sent: payload.segments.map((s) => ({ kind: s.kind, page: s.page })),
    segments_dropped: ctx.dropped.map((d) => ({ kind: d.kind, page: d.page, reason: d.reason })),
    fields_requested: payload.fields_requested,
  });
  return model(payload);
}

/* ------------------------------------------------------------------ *
 * 6. Extraction result — a CLAIM, never a decision
 * ------------------------------------------------------------------ */

export type ExtractedField = {
  field_id: string;
  value: unknown;
  confidence: number;
  threshold: number;
  /** Above threshold it stands at B; below it drops to C (schema §0.5). */
  grade: Extract<Grade, 'B' | 'C'>;
  consequence: FieldSpec['consequence'];
  needs_human_review: boolean;
  page: number;
  quote_ref: string;
};

export type ReviewTask = {
  doc_id: string;
  field_id: string;
  value: unknown;
  confidence: number;
  threshold: number;
  page: number;
  quote_ref: string;
  question: string;
  asked_of: 'ANALYST' | 'SURVEYOR' | 'CTA';
};

export type ExtractionResult = {
  doc_id: string;
  doc_type: DocType;
  fields: ExtractedField[];
  review: ReviewTask[];
  dropped: SanitiseResult['dropped'];
  /** Requested fields the model found nothing for. Absent, not guessed. */
  not_found: string[];
};

/* WHO A REVIEW TASK GOES TO (Phase 146, 22 Sep 2026). A GATE field went to 'CTA'
   until then. Caprebate has no tax adviser who could take it: under clause 1 of the
   engagement letter the filing position is signed by the client's own accountant or
   tax adviser, or by the client; the route through a chartered tax adviser of ours
   is bracketed and not available, because none is appointed. The one tax adviser
   the business plans to engage is a one-off, fixed-fee review of the rulebooks — not
   per client, and given no client data (the one-off engagement process, section 3,
   step 5). So a per-document review task has nobody to reach there. Confirming what a
   lease or contract says, against its locator, is reading a document: it is ours,
   done by an analyst, and the rulebooks then apply the law to what was confirmed.
   Test P16b fails on the old routing. */
const REVIEWER: Record<FieldSpec['consequence'], ReviewTask['asked_of']> = {
  APPORTIONMENT: 'SURVEYOR',
  GATE: 'ANALYST',
  TAXONOMY: 'ANALYST',
  NARRATIVE: 'ANALYST',
};

export function extract(
  doc_id: string,
  doc_type: DocType,
  segments: readonly Segment[],
  model: ModelFn,
  ctx: { at: string; egress: EgressEntry[] },
  personReviewTable: Readonly<Partial<Record<DocType, boolean>>> = PERSON_REVIEW_BY_DOC_TYPE,
): ExtractionResult {
  const spec = specFor(doc_type);
  /* FAIL CLOSED: only an explicit `false` switches person review off. A type the
     table does not carry reads as review required — see PERSON_REVIEW_BY_DOC_TYPE. */
  const personReview = personReviewTable[doc_type] !== false;
  const { payload, dropped } = sanitise(doc_id, doc_type, segments);
  const raw = callModel(model, payload, { at: ctx.at, dropped, egress: ctx.egress });

  const byField = new Map(raw.map((r) => [r.field_id, r]));
  const fields: ExtractedField[] = [];
  const review: ReviewTask[] = [];
  const not_found: string[] = [];

  for (const fs of spec.fields) {
    const r = byField.get(fs.field_id);
    if (!r || r.value === null || r.value === undefined) {
      // Never guessed. The absence routes to the capture list in 12830181808.
      not_found.push(fs.field_id);
      continue;
    }
    if (typeof r.confidence !== 'number' || r.confidence < 0 || r.confidence > 1) {
      throw new PipelineError('E_BAD_CONFIDENCE', `field '${fs.field_id}' returned confidence ${String(r.confidence)}`);
    }
    // An extracted value must be traceable to a place in the document, or it is
    // an assertion by a model rather than an extraction from a document.
    if (!r.quote_ref || typeof r.quote_ref !== 'string') {
      throw new PipelineError('E_NO_QUOTE_REF', `field '${fs.field_id}' has no locator in the source document`);
    }
    const nameHit = typeof r.value === 'string' && PERSON_NAME_PATTERNS.some((p) => p.test(r.value as string));
    if (nameHit) {
      throw new PipelineError('E_PERSON_NAME', `extracted value for '${fs.field_id}' looks like a person's name`, { field_id: fs.field_id });
    }

    const below = r.confidence < fs.threshold;
    const ef: ExtractedField = {
      field_id: fs.field_id,
      value: r.value,
      confidence: r.confidence,
      threshold: fs.threshold,
      grade: below ? 'C' : 'B',
      consequence: fs.consequence,
      needs_human_review: below || personReview,
      page: r.page,
      quote_ref: r.quote_ref,
    };
    fields.push(ef);

    /* PERSON REVIEW SWITCHED ON FOR THIS TYPE, on a field the threshold alone would
       have let stand. One task, same reviewer routing, its own wording so the
       reviewer can tell it from a low-confidence read. A below-threshold field is
       left to the branch after this, so it still gets exactly one task. */
    if (personReview && !below) {
      review.push({
        doc_id, field_id: fs.field_id, value: r.value, confidence: r.confidence, threshold: fs.threshold,
        page: r.page, quote_ref: r.quote_ref,
        asked_of: REVIEWER[fs.consequence],
        question:
          `Person review is required for every field read from ${doc_type}. Page ${r.page} read ` +
          `'${fs.field_id}' as ${JSON.stringify(r.value)} at ${Math.round(r.confidence * 100)}% confidence, ` +
          `at or above the ${Math.round(fs.threshold * 100)}% threshold — confirm or correct against ${r.quote_ref}.`,
      });
    }

    if (below) {
      review.push({
        doc_id, field_id: fs.field_id, value: r.value, confidence: r.confidence, threshold: fs.threshold,
        page: r.page, quote_ref: r.quote_ref,
        asked_of: REVIEWER[fs.consequence],
        question:
          `Extraction from ${doc_type} page ${r.page} read '${fs.field_id}' as ${JSON.stringify(r.value)} ` +
          `at ${Math.round(r.confidence * 100)}% confidence, below the ${Math.round(fs.threshold * 100)}% ` +
          `threshold for a ${fs.consequence.toLowerCase()} field. Confirm or correct against ${r.quote_ref}.`,
      });
    }
  }

  return { doc_id, doc_type, fields, review, dropped, not_found };
}

/* ------------------------------------------------------------------ *
 * 7. FinderSpec — a candidate is not a value
 *
 * Item 12902240772 §6 (SALE_CONTRACT, still gated — see the DocType comment
 * above) needs `contract_election_candidates`: every schedule, clause or
 * annexe that COULD be an agreement fixing the value of fixtures. That is
 * not a field with a confidence — "is there an election somewhere in this
 * 200-page contract" has no score that means anything, and the failure mode
 * is asymmetric. A missed election lets a claim proceed on a full
 * apportionment when it is in fact capped, possibly at £1; a false positive
 * costs a reviewer five minutes. So the finder is tuned to OVER-FLAG, and
 * that only works if nothing downstream is allowed to filter what it flags.
 *
 * A FieldSpec's output can enter the source register at grade B or C and
 * then be reconciled and corroborated. A FinderSpec's output never can:
 * candidates become ReviewTasks directly, with no grade and no threshold
 * that means anything, and there is no function anywhere in this module
 * that turns a FinderCandidate into a ClaimSpec. What enters the register
 * is only what a person writes after looking at the candidate.
 * ------------------------------------------------------------------ */

export type FinderCandidate = {
  /** Whatever text or structure the finder judged worth a human's attention. */
  value: unknown;
  page: number;
  quote_ref: string;
};

export type FinderFn = (payload: ModelPayload) => readonly FinderCandidate[];

export type FinderSpec = {
  finder_id: string;
  from: readonly SegmentKind[];
  asked_of: ReviewTask['asked_of'];
  /** Worded per candidate — the prompt a reviewer sees is part of the control (item 12902240772 §10). */
  question: (c: FinderCandidate) => string;
};

/**
 * The only way a FinderSpec's output reaches anything downstream. Every
 * candidate handed in becomes a ReviewTask, with none dropped — over-flagging
 * is the specification, not a tuning accident, so this function performs no
 * filtering of its own and never will.
 */
export function findCandidates(
  spec: FinderSpec,
  doc_id: string,
  candidates: readonly FinderCandidate[],
): ReviewTask[] {
  return candidates.map((c) => ({
    doc_id,
    field_id: spec.finder_id,
    value: c.value,
    confidence: 0,
    threshold: 0,
    page: c.page,
    quote_ref: c.quote_ref,
    asked_of: spec.asked_of,
    question: spec.question(c),
  }));
}

/* ------------------------------------------------------------------ *
 * 8. Handing off to the source register and reconciliation engine
 * ------------------------------------------------------------------ */

export type ClaimSpec = {
  entity_id: string;
  field_id: string;
  source_id: 'CLIENT_DOC';
  value: unknown;
  grade: Extract<Grade, 'B' | 'C'>;
  retrieval: {
    retrieved_at: string; method: 'UPLOAD'; locator: string; extract_ref: string; extraction_confidence: number;
    /** Stamped by document_property_match (12902224596) — see caprebate-document-property-match.ts. */
    property_match?: 'MATCH' | 'MISMATCH' | 'NOT_STATED';
  };
};

/**
 * Extraction produces CLAIMS, never values. Each becomes a CLIENT_DOC cell in
 * the source register (12830181420) and is then reconciled against every other
 * claim by 12830181808. The model decides nothing.
 */
export function toClaims(entity_id: string, r: ExtractionResult, retrieved_at: string): ClaimSpec[] {
  return r.fields.map((x) => ({
    entity_id,
    field_id: x.field_id,
    source_id: 'CLIENT_DOC' as const,
    value: x.value,
    grade: x.grade,
    retrieval: {
      retrieved_at,
      method: 'UPLOAD' as const,
      locator: `${r.doc_type}:${r.doc_id} p${x.page}`,
      extract_ref: x.quote_ref,
      extraction_confidence: x.confidence,
    },
  }));
}

/* ------------------------------------------------------------------ *
 * 9. Human-read-only document types — CPSE_REPLIES and SALE_CONTRACT, and since Phase 146l TITLE_REGISTER
 *
 * Item 12902240772 §8: neither gate (DPIA, lease-party) is a reason to leave
 * an upload of one of these two unprocessed. The interim position is that a
 * person captures the same field set the eventual model spec names, at the
 * same grade, so toClaims() and everything downstream sees no difference
 * between a human-captured value and a model-extracted one.
 *
 * contract_election_candidates is deliberately absent from SALE_CONTRACT's
 * field list below. It was never a FieldSpec — section 7's FinderSpec exists
 * because a candidate is not a value — and human capture does not change
 * that: a reviewer reading the whole contract finds candidates directly,
 * with no finder and no confidence in between.
 * ------------------------------------------------------------------ */

export type HumanCaptureFieldSpec = {
  field_id: string;
  consequence: FieldSpec['consequence'];
  note?: string;
};

export type HumanCaptureDocSpec = {
  doc_type: DocType;
  /** The gate named in item 12902240772 §7 that blocks model extraction. */
  gate: string;
  fields: readonly HumanCaptureFieldSpec[];
  why: string;
};

const h = (field_id: string, consequence: FieldSpec['consequence'], note?: string): HumanCaptureFieldSpec =>
  ({ field_id, consequence, note });

export const HUMAN_CAPTURE_SPECS: readonly HumanCaptureDocSpec[] = [
  {
    doc_type: 'CPSE_REPLIES',
    gate: 'Gate A — the third-party model question (item 12910861459)',
    fields: [
      h('cpse_form_edition', 'NARRATIVE',
        'CPSE.1 has been renumbered across editions, so an enquiry number alone is not a stable identifier'),
      h('cpse_ca_enquiry_numbers', 'GATE', 'which enquiries in this set are the capital allowances ones'),
      h('cpse_ca_question_text', 'GATE', 'verbatim, with locator'),
      h('cpse_ca_reply_text', 'GATE',
        'verbatim, with locator — including any qualification such as "not so far as the Seller is aware"'),
      h('cpse_election_reference', 'GATE', 'any mention of a s.198 or s.199 election anywhere in the replies, verbatim with locator'),
      h('cpse_replies_date', 'NARRATIVE'),
    ],
    why: 'The only routine document in a UK commercial conveyance that asks the s.187A question in terms. A person ' +
      'reads the reply and sets the gate; this spec emits no seller_pooled field and no entitlement conclusion, and never has.',
  },
  {
    doc_type: 'SALE_CONTRACT',
    gate: 'Gate B — party identity (the lease-party question, item 12902240772 §7)',
    fields: [
      h('contract_date', 'GATE'),
      h('contract_consideration_pence', 'APPORTIONMENT', 'cross-checks the Land Registry price paid'),
      h('contract_schedule_index', 'NARRATIVE',
        'the list of every schedule and annexe with its heading, captured whether or not anything was flagged'),
    ],
    why: 'A valid election caps the fixtures claim and no valuation can lift it. This spec emits no election_present ' +
      'boolean and no elected_amount — validity is a legal conclusion a person reaches, never an extraction.',
  },
  {
    doc_type: 'TITLE_REGISTER',
    gate: 'Lakhbir, 25 and 27 September 2026 — the title register is looked up by hand, not by the API',
    fields: [
      h('oc_title_number', 'NARRATIVE', 'as the register writes it, for example WYK123456'),
      h('oc_tenure', 'TAXONOMY', 'freehold or leasehold, from the class of title'),
      h('oc_price_paid_pence', 'GATE', 'the price paid or value stated in the proprietorship register — for four of the five sectors the only source of what the building sold for'),
      h('oc_price_paid_date', 'GATE', 'the date that price is stated for'),
      h('oc_restriction_count', 'NARRATIVE', 'how many restrictions the register carries — a count, never their wording'),
      h('oc_proprietor_company_number', 'NARRATIVE', 'where the owner is a company, its registered number. Where the owner is a person, nothing: a name is never captured'),
      h('oc_prior_owner_count', 'NARRATIVE', 'how many earlier owners the register names — a count, never a name'),
    ],
    why: 'The same facts the retired Business Gateway lookup kept, less the one it could keep under Exception 2 — a ' +
      'personal owner\'s name — because a person reading a copy is not the register handing us a marked field. In the ' +
      'back end a person types these on the property page (src/web/title-by-hand.ts), where they are stored as the ' +
      'register source HMLR_TITLE, marked as entered by hand.',
  },
];

function humanCaptureSpecFor(t: DocType): HumanCaptureDocSpec {
  const s = HUMAN_CAPTURE_SPECS.find((x) => x.doc_type === t);
  if (!s) throw new PipelineError('E_NOT_HUMAN_READ_ONLY', `'${t}' has no human-capture spec`, { doc_type: t });
  return s;
}

export type HumanCaptureInput = {
  field_id: string;
  value: unknown;
  page: number;
  quote_ref: string;
};

export type HumanCaptureResult = {
  doc_id: string;
  doc_type: DocType;
  captured_by: string;
  captured_at: string;
  fields: ExtractedField[];
  not_found: string[];
};

/**
 * The only route CPSE_REPLIES and SALE_CONTRACT have into the source
 * register while their gates are shut. A human reads the document and
 * supplies the same field_ids the eventual model spec names; the output is
 * an ExtractedField[] — the shape extract() itself produces — so toClaims()
 * takes either without a branch. confidence is always 1 and grade always
 * 'B': a value a named reviewer typed after reading the document is not a
 * below-threshold guess to be marked down, and needs_human_review is always
 * false — it has already been read by a human by construction.
 */
export function captureHumanRead(
  doc_id: string,
  doc_type: DocType,
  inputs: readonly HumanCaptureInput[],
  captured_by: string,
  captured_at: string,
): HumanCaptureResult {
  if (!HUMAN_READ_ONLY_TYPES.includes(doc_type)) {
    throw new PipelineError('E_NOT_HUMAN_READ_ONLY', `'${doc_type}' is not a HUMAN_READ_ONLY type — use extract()`, { doc_type });
  }
  const spec = humanCaptureSpecFor(doc_type);
  const byField = new Map(inputs.map((i) => [i.field_id, i]));
  const fields: ExtractedField[] = [];
  const not_found: string[] = [];

  for (const fs of spec.fields) {
    const inp = byField.get(fs.field_id);
    if (!inp || inp.value === null || inp.value === undefined) {
      // Same discipline as extract(): absence is a row that is missing, not
      // a value guessed into existence.
      not_found.push(fs.field_id);
      continue;
    }
    fields.push({
      field_id: fs.field_id,
      value: inp.value,
      confidence: 1,
      threshold: THRESHOLD_BY_CONSEQUENCE[fs.consequence],
      grade: 'B',
      consequence: fs.consequence,
      needs_human_review: false,
      page: inp.page,
      quote_ref: inp.quote_ref,
    });
  }

  return { doc_id, doc_type, captured_by, captured_at, fields, not_found };
}
