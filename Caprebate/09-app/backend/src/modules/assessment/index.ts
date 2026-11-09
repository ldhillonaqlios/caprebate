/**
 * THE ASSESSMENT'S FRONT DOOR: the eligibility check, its figures and sign-up. Another area imports this module only from here (09-app/docs/ARCHITECTURE.md rule 1).
 * Generated from the imports other areas made on the day the module moved, and kept by hand since: add a name here when
 * another area needs it, never a whole file.
 */
// Its permissions first: the core's table needs them before any of its rules is asked (src/core/authz.ts).
export { ASSESSMENT_ACTIONS } from './actions.ts';
// Files that reach no other business module load first, so a loop back through a front door finds them ready.
export { FUNNEL_DELETABLE_TABLES } from './funnel-deletable.ts';
export { jobEconomicsDisposalFee } from './fee-gate.ts';
export { DECLINED_LINE, freeGate, lookupsDeclined, recordLookupsDeclined } from './address-check.ts';
export { ADDRESS_LOOKUP_JS } from './address-lookup-script.ts';
export { allowancesFor, allowanceWords, isCompanyType, rateWords, RETURN_YEARS } from './allowances.ts';
export { CONVEYANCING_STRIP } from './conveyancing-strip.ts';
export { getAssessmentAnswersQuestionIdByAssessmentIdQuestionId, getAssessmentAnswersValueByAssessmentIdQuestionId, getAssessmentAnswersValueByBusinessIdQuestionId, getAssessmentsAssessmentIdSubmittedAtByBusinessId, getAssessmentsAtByBusinessId, getAssessmentsIdByBusinessId, getAssessmentsIdByBusinessId2, getAssessmentsIdSectorByBusinessId, getAssessmentsLowHighById, getAssessmentsSectorById, getAssessmentsShownHighPenceByBusinessId, getAssessmentsShownHighPenceById, getAssessmentsShownLowPenceShownHighPenceById, getAssessmentsSubmittedAtByBusinessId, getEstimatesBasisByAssessmentId, getEstimatesByAssessmentId, getEstimatesCountByAssessmentId, getEstimatesCountByBusinessId, getEstimatesEstimateHashByAssessmentId, getEstimatesIdByAssessmentId, getEstimatesQualifyingExpenditurePenceQualifyingPctByAssessm, getEstimatesQualifyingExpenditurePenceQualifyingPctByAssessm2, getEstimatesQualifyingExpenditurePenceSealedAtByAssessmentId, insertAssessmentAnswers, insertAssessments2, insertConsentAnswers, insertEstimates, insertEstimates2, listAssessmentAnswersOrdQuestionIdByAssessmentId, listAssessmentAnswersOrdQuestionIdByAssessmentId2, listAssessmentAnswersQuestionIdQuestionTextByAssessmentId, listAssessmentAnswersQuestionIdQuestionTextByAssessmentIdSta, listAssessmentAnswersQuestionIdValueByAssessmentIdState, listAssessmentAnswersStateValueByAssessmentIdQuestionId, listAssessmentAnswersValueByAssessmentIdState, listConsentAnswersIdKindByContactId, listConsentAnswersRecordedAtKindByContactId } from './data.ts';
export { FUNNEL_DELETE_SQL, FUNNEL_EDGES } from './funnel-edges.ts';
export { FUNNEL_SWITCHES, funnelStateFor, sessionFromFunnel } from './funnel-session.ts';
export { REPORT_ASSUMPTIONS } from './report-assumptions.ts';
export { MIN_CLAIMS, proposeRanges } from './sector-ranges.ts';
export { ALLOWANCE_PROFIT_COMPARISON } from './allowance-profit-comparison.ts';
export { closeGatedExit, isGatedExit, loadDraft, newDraft, saveDraft, SCREENS, submit } from './assessment.ts';
export { coverageOf, deskFirstReading, videoCoverage } from './desk-first.ts';
export { allGated, applyF4, applyReach, buildings, F4_ROUTE, F4_SCREENS, F4_TEXT, figureBody, firstIncomplete, isFunnel4, screenBody, stageBar, stageOf, submitEnquiry } from './funnel4.ts';
export { grantProviderNeed, grantSplitNeed, shippedGrantSwitches } from './grant-checks.ts';
export * as vatModule from './vat.ts';
export { ensureVatTask, expectedFeeFor, expectedFees, monthStart, settingsView, vatForInvoice, vatReading } from './vat.ts';
export { claimantRole, councilAreaOf, dormantWarning, fillTenureFromRegisters, floorAreaForSite, keepCouncilArea, personIsClients, pricePaidSale, propertyTenure, qualifyingActivityEvidence, registerCompany, registerNamesClientPerson, ROLE_LABELS, siteAreaFlag, siteAreaOf, yearEndFrom } from './who-claims.ts';
export type { FunnelEdge } from './funnel-deletable.ts';
export type { AllowanceFacts, AllowanceWords, PartResult, PoolName } from './allowances.ts';
export type { Draft, ScreenId } from './assessment.ts';
export type { Coverage } from './desk-first.ts';
export type { F4Screen } from './funnel4.ts';
export type { SettingsView, VatReading } from './vat.ts';
export type { ClaimantRole, YearEndReading } from './who-claims.ts';
// Its addresses, asked by the router shell; they reach other modules, so they load last.
export { ADDRESS_PAGE_CSP, assessmentAssets, assessmentRoutes, contactValueProblem } from './routes.ts';
// Phase 161l1: what the CRM reads here in place of its joins (src/modules/crm/dashboard.ts, introducers.ts, claim-lists.ts).
export { listEstimatesQualifyingExpenditurePenceByAssessmentIds } from './data.ts';
