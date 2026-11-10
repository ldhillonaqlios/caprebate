/**
 * THE ASSESSMENT'S FRONT DOOR: the eligibility check, its figures and sign-up. Another area imports this module only from here (09-app/docs/ARCHITECTURE.md rule 1).
 * Generated from the imports other areas made on the day the module moved, and kept by hand since: add a name here when
 * another area needs it, never a whole file.
 */
// Its permissions first: the core's table needs them before any of its rules is asked (src/core/authz.ts).
export { ASSESSMENT_ACTIONS } from './actions.ts';
// Files that reach no other business module load first, so a loop back through a front door finds them ready.
// The claimant type as a gate reads it (moved from the CRM, Phase 161l1).
export { claimantFromAnswers, claimantTypeForGate } from './claimant-type.ts';
// Where a submitted assessment puts each building: the port the claims fill as their door loads (Phase 161l2).
export { setAssessedPropertyWriter } from './property-writer.ts';
export type { AssessedEvent, AssessedProperty, AssessedPropertyWriter } from './property-writer.ts';
// How the client holds the building, as the assessment hears it (Phase 161l2; the claims' who-claims.ts reads it back).
export { USE_TO_ROLE } from './claimant-role.ts';
export type { ClaimantRole } from './claimant-role.ts';
export { FUNNEL_DELETABLE_TABLES } from './funnel-deletable.ts';
export { feeGate, jobEconomicsDisposalFee } from './fee-gate.ts';
export type { FeeGateReading } from './fee-gate.ts';
export { DECLINED_LINE, freeGate, lookupsDeclined, recordLookupsDeclined } from './address-check.ts';
export { ADDRESS_LOOKUP_JS } from './address-lookup-script.ts';
export { allowancesFor, allowanceWords, isCompanyType, rateWords, RETURN_YEARS } from './allowances.ts';
export { getAssessmentAnswersQuestionIdByAssessmentIdQuestionId, getAssessmentAnswersValueByAssessmentIdQuestionId, getAssessmentAnswersValueByBusinessIdQuestionId, getAssessmentsAssessmentIdSubmittedAtByBusinessId, getAssessmentsAtByBusinessId, getAssessmentsIdByBusinessId, getAssessmentsIdByBusinessId2, getAssessmentsIdSectorByBusinessId, getAssessmentsLowHighById, getAssessmentsSectorById, getAssessmentsShownHighPenceByBusinessId, getAssessmentsShownHighPenceById, getAssessmentsShownLowPenceShownHighPenceById, getAssessmentsSubmittedAtByBusinessId, getEstimatesBasisByAssessmentId, getEstimatesByAssessmentId, getEstimatesCountByAssessmentId, getEstimatesCountByBusinessId, getEstimatesEstimateHashByAssessmentId, getEstimatesIdByAssessmentId, getEstimatesQualifyingExpenditurePenceQualifyingPctByAssessm, getEstimatesQualifyingExpenditurePenceQualifyingPctByAssessm2, getEstimatesQualifyingExpenditurePenceSealedAtByAssessmentId, insertAssessmentAnswers, insertAssessments2, insertConsentAnswers, insertEstimates, insertEstimates2, listAssessmentAnswersOrdQuestionIdByAssessmentId, listAssessmentAnswersOrdQuestionIdByAssessmentId2, listAssessmentAnswersQuestionIdQuestionTextByAssessmentId, listAssessmentAnswersQuestionIdQuestionTextByAssessmentIdSta, listAssessmentAnswersQuestionIdValueByAssessmentIdState, listAssessmentAnswersStateValueByAssessmentIdQuestionId, listAssessmentAnswersValueByAssessmentIdState, listAssessmentsBusinessIdSubmittedAtByBusinessIds, listConsentAnswersIdKindByContactId, listConsentAnswersRecordedAtKindByContactId } from './data.ts';
export { getConsentAnswersCount } from './data.ts';
// Phase 161l2: what the claims' who-claims.ts reads here (moved up from the assessment).
export { getAssessmentsCompanyNumberCompanyStatusByBusinessIdCompanyN } from './data.ts';
export { FUNNEL_DELETE_SQL, FUNNEL_EDGES } from './funnel-edges.ts';
export { FUNNEL_SWITCHES, funnelStateFor, sessionFromFunnel } from './funnel-session.ts';
export { REPORT_ASSUMPTIONS } from './report-assumptions.ts';
export { closeGatedExit, isGatedExit, loadDraft, newDraft, saveDraft, SCREENS, submit } from './assessment.ts';
export { allGated, applyF4, applyReach, buildings, F4_ROUTE, F4_SCREENS, F4_TEXT, figureBody, firstIncomplete, isFunnel4, screenBody, stageBar, stageOf, submitEnquiry } from './funnel4.ts';
export type { FunnelEdge } from './funnel-deletable.ts';
export type { AllowanceFacts, AllowanceWords, PartResult, PoolName } from './allowances.ts';
export type { Draft, ScreenId } from './assessment.ts';
export type { F4Screen } from './funnel4.ts';
// Its addresses, asked by the router shell; they reach other modules, so they load last.
export { ADDRESS_PAGE_CSP, assessmentAssets, assessmentRoutes, contactValueProblem } from './routes.ts';
// Phase 161l1: what the CRM reads here in place of its joins (src/modules/crm/dashboard.ts, introducers.ts, claim-lists.ts).
export { listEstimatesQualifyingExpenditurePenceByAssessmentIds } from './data.ts';
