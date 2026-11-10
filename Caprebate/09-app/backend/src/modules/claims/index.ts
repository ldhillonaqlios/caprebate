/**
 * THE CLAIMS' FRONT DOOR: the claim record, its facts, documents, signing and research. Another area imports this module only from here (09-app/docs/ARCHITECTURE.md rule 1).
 * Generated from the imports other areas made on the day the module moved, and kept by hand since: add a name here when
 * another area needs it, never a whole file.
 */
// Its permissions first: the core's table needs them before any of its rules is asked (src/core/authz.ts).
export { CLAIMS_ACTIONS } from './actions.ts';
// Moved from the CRM (Phase 161l1): the claim's object for can(), its jurisdiction, its stage read, and the client's checks.
export { claimObjFor } from './claim-object.ts';
export { derivedJurisdiction, jurisdictionOf, propertyJurisdiction } from './jurisdiction.ts';
export type { JurisdictionReading } from './jurisdiction.ts';
export { clientStageForClaim, enteredAt, loadPipelineClaim, raiseBusinessStage, reportDeliveredOn, setGateOutReader } from './claim-stage.ts';
export type { GateNeeds, Need, PipelineClaim } from './claim-stage.ts';
// What the outside services ask it (their ports): handed in first, as it reaches only its own data and their door.
import './research-subject.ts';
// Files that reach no other business module load first, so a loop back through a front door finds them ready.
export { computeFee, controlsView, FEE_CONTROLS, letterFee, letterFees, PAYMENT_TERMS_QUESTION } from './fee-controls.ts';
export { checksBlock, checksSummary, claimChecksBlock, clientStepsCard, STEP_ANCHOR } from './approvals-pages.ts';
export { getClaimContactsIdByClaimIdContactId, getClaimContactsIdClaimIdById, getClaimDeliverablesCountByBusinessIdState, getClaimDeliverablesIssuedOnKindByClaimIdState, getClaimFactsAnswerByClaimIdFactKey, getClaimGrantsCountByBusinessIdSourceId, getClaimMilestonesAtByClaimIdMilestone, getClaimReconciliationsFiledOnByClaimId, getClaimReconciliationsIdFiledOnByClaimId, getClaimsBById, getClaimsBusinessIdById, getClaimsBusinessIdStageById, getClaimsClaimRefById, getClaimsCountByBusinessId, getClaimsCountByBusinessIdStage, getClaimsIdBusinessIdById, getClaimsIdBusinessIdById2, getClaimsIdBusinessIdById3, getClaimsIdBusinessIdById5, getClaimsIdBusinessIdById7, getClaimsIdByBusinessIdAssessmentId, getClaimsIdByBusinessIdLabel, getClaimsIdByIdBusinessId, getClaimsIdClaimRefById3, getClaimsIdStageById, getClaimsPById, getClaimsPropertyIdByIdBusinessId, getClaimsStageBusinessIdById, getClaimsStageById, getClaimsStageHoldReturnStageById, getClaimStageMovesAtByClaimId, getClaimStageMovesAtByClaimIdKind, getClaimStageMovesAtByClaimIdToStage, getClaimStageMovesReasonCodeByClaimIdKind, getDocumentsIdById, getDocumentsIdByIdBusinessId, getEngagementsAtByBusinessIdLetterState, getEngagementsIdLetterStateByBusinessId3, getEngagementsLetterStateSignedAtByBusinessId2, getEngagementsSByBusinessId, getEngagementsStateSignedAtById, getHmrcEnquiriesAmendedFigurePenceByClaimIdClosedOn, getLogicalDocumentsCountByBusinessIdTypeCode, getPropertiesAddressLine1AddressLine2ById, getPropertiesBusinessIdById, getPropertiesBusinessIdTenureById, getPropertiesClaimantRoleClaimantRoleSourceById, getPropertiesCouncilAreaById, getPropertiesCouncilAreaCouncilAreaSourceById, getPropertiesCountByBusinessId, getPropertiesIdAddressLine1ByBusinessId, getPropertiesIdBusinessIdById, getPropertiesIdByBusinessId, getPropertiesIdByBusinessId2, getPropertiesIdByBusinessId3, getPropertiesIdByIdBusinessId, getPropertiesPostcodeByBusinessId, getPropertiesPostcodeJurisdictionById, getPropertiesTenureTenureSourceById, insertClaimContacts, insertClaimDeliverables2, insertClaimFacts2, insertClaimMilestones, insertClaimMilestones2, insertClaimRefSeries, insertClaims, insertClaimStageMoves, insertClaimStageMoves2, insertClaimStageMoves3, insertClaimStageMoves4, insertEngagements2, insertProperties, insertProperties2, insertProperties3, insertProperties4, insertProperties5, insertTaxAdviserSignoffs2, listClaimReconciliationsClaimIdBusinessId, listClaimsIdBusinessId, listClaimsIdBusinessIdByPropertyId, listClaimsIdByBusinessId, listClaimsIdByBusinessId2, listClaimsIdClaimRefByBusinessId3, listClaimsIdClaimRefByBusinessIdLabel, listClaimsIdClaimRefByOwnerId, listClaimsIdClaimRefByStage, listClaimsIdPropertyIdByBusinessIdStage, listClaimsIdStageByBusinessId, listClaimStageMovesAtKindByClaimId, listClaimStageMovesClaimIdAt, listClaimStageMovesFromStageToStageByClaimId, listClaimStageMovesToStageByClaimId, listDocumentEventsAtContractStepByDocId, listDocumentsIdFilenameByBusinessId, listDocumentsIdTypeCodeByBusinessId, listFactApprovalsFactRefActionByBusinessId2, listLogicalDocumentsId, listPropertiesBusinessIdLabelByBusinessId, listPropertiesIdByBusinessId, listPropertiesIdByBusinessId2, listPropertiesIdLabelByBusinessId, listPropertiesIdLabelByBusinessId3, listPropertiesLabelPostcodeByBusinessId, listPropertiesLabelPostcodeByBusinessId2, listPropertiesPostcode, listPropertyEventsLabelKindByAssessmentId, listSiteAreaInputsEastingNorthingByKind, listSiteAreaInputsLadCodeByKind, updateClaimContactsUnlinkedAtUnlinkedByByIdUnlinkedAt, updateClaimDeliverablesStateIssuedOnById2, updateClaimReconciliationsFiledOnFiledRecordedByById, updateClaimsOwnerIdPriorityByBusinessId, updateClaimsOwnerIdSurveyorIdById, updateClaimsStageHoldReturnStageById, updateEngagementsLetterStateViewedAtByBusinessIdLetterState, updateEngagementsLetterStateViewedAtByIdLetterState, updatePropertiesAddressLine1TownByBusinessId, updatePropertiesClaimantRoleClaimantRoleSourceById, updatePropertiesCouncilAreaCouncilAreaSourceById, updatePropertiesLabelPostcodeById, updatePropertiesLandlordUpdatedAtById, updatePropertiesLeaseEndDateUpdatedAtById, updatePropertiesSaleInProspectUpdatedAtById, updatePropertiesTenureSourceById, updatePropertiesTenureTenureSourceById, updatePropertiesTenureTownById } from './data.ts';
export { ANSWER_WORDS, EARLY_VOUCH_PREFIX, earlyVouchesFrom, VOUCH_ANSWERS } from './document-reading.ts';
export { ALWAYS_NATURAL_PERSON_ROLES, assertHumanCaptureClean, assertRestoreApproved, BACKUP_CYCLE, CAPTURE_NAME_PATTERNS, classifyPartyReference, deletionDueAt, knownBackupCycleDays, ret3DueAt, RET7, ROLE_TOKENS } from './documents/client-doc-ingestion.ts';
export { callModel, DOC_SPECS, HUMAN_READ_ONLY_TYPES, PERSON_NAME_PATTERNS, PipelineError, sanitise, specFor } from './documents/document-pipeline.ts';
export { assertContractCovered, closeJob, CONTRACT_COVERAGE, deleteDueRawFile, durableKeyFor, FAIL_CLOSED_SETTINGS, INGESTION_BOUNDARY, issueUploadUrl, openTransparency, pdfLooksComplete, processUpload, quarantineKeyFor, RECEIPT_CONTRACT, receiptPolicyFor, recordUploadComplete, retainedTextKeyFor, runExtraction, runScheduledSweeps, shouldPromoteRawFile, sniffAccepted, UPLOAD_LIMITS, UploadHandlerError, writeClaims } from './documents/upload-handler.ts';
export { discountsFor } from './fee-discounts.ts';
export { loadLetter, TEST_LETTER_PATH } from './letter.ts';
export { addStaffEvent, approvedEventFigures, dateWords, EVENT_KINDS, eventsOfProperty, eventsOnClaim, KIND_WORDS, purchaseApplies, setEventVat, worksEvents, writeAssessmentEvents } from './property-events.ts';
// The registers published as a file are the outside services' (src/integrations/registers/file-registers.ts);
// named here as before, for the command line's import-register.
export { decodeRegisterFile, FILE_SOURCES, importRegisterFile, RegisterFileError, rowsAtPostcode } from '../../integrations/index.ts';
export { REGISTER_IMPORT_JS } from './register-import-script.ts';
export { lastReopen, REOPEN_VOIDS_WORDS, setAsideOnReopen, valuationLock, VOIDING_REOPEN_STAGES, voidLine } from './valuation-lock.ts';
export { documentCentreGate, documentTypesGate } from './documents.permissions.ts';
export * as documentsModule from './documents.ts';
export { claimDocumentsPanel, claimFileDays, clientFolder, createDocumentRequest, documentObj, earlyQuestionsFor, NO_RECEIPT_POLICY, organisationDocumentsPanel, propertyDocumentsPanel, readLines, receivableTypes, RECEIVED_ONLY_BY_UPLOAD, requestsFor, requestWorkDocuments, ret7Limbs, retentionReading, setShownToClient, startDocumentUpload, typeList, versionObj } from './documents.ts';
export { checksPanel, checksPanelIfPermitted, clientSteps, stepDef, tellClient } from './approvals.ts';
export * as claimFactsModule from './claim-facts.ts';
export { acquisitionDateReading, amendmentWindowReading, captured, claimantTypeReading, earlyWindowWarning, electionResolved, elementName, factsObj, factsPanel, floorAreaOnRecord, grantsTraced, latestFacts, packGrantsFor, PAYER_CLASSES, releasedFactReader, yearEndKnown } from './claim-facts.ts';
export { claimOverview, overviewBlock } from './claim-overview.ts';
export { aftercareBlock, deliverablesBlock, factsBlock, figuresBlock, grantsBlock, handleClaimRecord } from './claim-record-pages.ts';
export { accountantFiles, aftercarePanel, clawbackReading, clientDeliverables, deliverableIssued, deliverableIssuedNeed, DELIVERABLES, deliverablesPanel, figuresPanel, filingRecordedNeed, invoiceWindowNeed, latestSignOff, QUOTE_GAP_REVIEW_PCT, raiseDisposalTask, reportsWindowNeed, signOffRecordNeed, signOffSinceEntry, VARIANCE_CATEGORIES, varianceOf } from './claim-record.ts';
export { claimReturns, claimRoutes, legalDeadlineNeed, routesWhy } from './claim-route.ts';
export { claimDocumentsBlock, placeDocumentsBlock } from './documents-pages.ts';
export { handleDocuments } from './documents.routes.ts';
export { askButton, businessPageHtml, DONE_WORDS, handleEngaged, panel1, panel2, panel3, panel4 } from './engaged-pages.ts';
export * as engagedModule from './engaged.ts';
export { addNote, assertClientsSection, missingFacts, NotFoundAsRefusal, openClaimQuestions, sendTaskToPortal, waitingOn } from './engaged.ts';
export { letterState, letterSteps, signedCopy } from './engagement-send.ts';
export { MANDATORY_DOCUMENTS, mandatoryDocumentNeeds, missingDocuments, receivedOnClaim } from './mandatory-documents.ts';
export { handleReportStaff, handleSignoffLink, portalReport, portalReportCard, sendPanel } from './report-pages.ts';
export { releasedVersion } from './report-signoff.ts';
export * as researchModule from './research.ts';
export { assertSignedEngagement, catalogue, registerAttribution } from './research.ts';
export { ENGAGEMENT_SIGNING, ENGAGEMENT_SIGNING_TEST, letterFacts, letterOptions, seedSignatureRecord, shownLetter, SIGN_WORDS, signByLink, signEngagement, signingMissing, signLinkFor } from './signing.ts';
export * as siteAreaInputsModule from './site-area-inputs.ts';
export { fetchSitePlan, pickWords, sitePlanOf, sitePlanOps, sitePlanSvg } from './site-plan.ts';
export * as titleByHandModule from './title-by-hand.ts';
export { acceptClientBytes, DAMAGED_PDF, finishUpload, issuedJob, openKeptOriginal, readerFor, sweepOriginals } from './uploads.ts';
export type { ControlsView, FeeControls } from './fee-controls.ts';
export type { VouchAnswer } from './document-reading.ts';
export type { BackupCycle, BackupCycleState, DeletionLogEntryClock, IngestionSettings, PartyLegalForm, PersonRole, RawFileRecord, RestoreApproval } from './documents/client-doc-ingestion.ts';
export type { DocType, ModelFn, ModelPayload, RawExtraction, Segment } from './documents/document-pipeline.ts';
export type { AuditEvent, AuditSink, Clock, DocTypeClassifier, JobState, ObjectStore, PresignedUpload, ProcessResult, TextExtractor, UploadHandlerDeps, UploadHandlerErrorCode, UploadJob } from './documents/upload-handler.ts';
export type { FeeDiscountView } from './fee-discounts.ts';
export type { Letter, OpenTerm } from './letter.ts';
export type { ApprovedEventFigure, EventKind, EventOnClaim, PropertyEvent } from './property-events.ts';
export type { FileRow, FileSourceId } from '../../integrations/index.ts';
export type { SetAside } from './valuation-lock.ts';
export type { ClaimDocumentsPanel, PlaceDocumentsPanel, RequestView, TypeView } from './documents.ts';
export type { ChecksPanel, ClientStep, StepView } from './approvals.ts';
export type { FactsPanel } from './claim-facts.ts';
export type { AftercarePanel, ClientDeliverable, DeliverablesPanel, FiguresPanel } from './claim-record.ts';
export type { ClaimReturn } from './claim-route.ts';
export type { MissingFact, WaitingOn } from './engaged.ts';
export type { MandatoryDocuments } from './mandatory-documents.ts';
export type { SourcesPanel } from './research.ts';
export type { ReturnContext } from './return-entries.ts';
export type { EngagementSigning, LetterFacts } from './signing.ts';
export type { SitePlan } from './site-plan.ts';
export { getClaimsIdClaimRefByIdBusinessId, listClaimsIdClaimRefByBusinessIdLabel2 } from './data.ts';
// Phase 161l1: read by ids, for the areas above that joined these tables to their own rows; and for the seed.
export { getClaimsIdByBusinessIdAssessmentIdNotNull, getClaimsIdByBusinessIdAssessmentIdNull, getDocumentsIdBusinessIdTypeCodeById, listEngagementsBusinessIdByLetterStateSigned, listClaimGrantsAmountPenceByClaimIdPaidTo, listClaimsIdBusinessIdStageClaimRefByIds, listDocumentsIdBusinessIdTypeCodeByBusinessId, listPropertiesIdLabelPostcodeByIds } from './data.ts';
export { getDocumentLinksCount, getDocumentsCountVersions, getDocumentsTypeCodeCreatedAtRetentionRefById, getLogicalDocumentsCount } from './data.ts';
// The client's checks (moved from the CRM, Phase 161l1): they reach the claims' documents and engaged files, so late.
export * as clientChecksModule from './client-checks.ts';
export { waitingForCheck } from './client-checks.ts';
export type { ToCheck } from './client-checks.ts';
// The clients list and telling the client, through the port the CRM fills (Phase 161l1).
export { setClientsPorts } from './engaged-pages.ts';
export type { ClientsPorts, ClientSort, TellDeps, TellResult } from './engaged-pages.ts';
// Its addresses, asked by the router shell; they reach other modules, so they load last.
export { claimsAssets, claimsSignoffLink } from './routes.ts';
// Phase 161l1: what the CRM reads here in place of its joins (src/modules/clients/data-borrowed.ts).
export { listClaimContactsIdContactIdLinkedByByClaimIdLinked, listClaimMilestonesRecordedAtMilestoneRecordedByByClaimId, listClaimsIdClaimRefOwnerIdByClaimRef, listClaimsIdClaimRefStageByIds, listClaimStageMovesAtKindActorIdByClaimIdNewest, listClaimStageMovesAtKindActorIdByClaimIdOldest, listClaimStageMovesReasonCodeByClaimIdToNegative } from './data.ts';
export { getClaimDeliverablesContentHashByClaimIdIssuedReport, listDocumentLinksLogicalDocumentIdTypeCodeByBusinessId, listDocumentsIdDeclaredTypeTypeCodeByBusinessId, listDocumentsIdLogicalDocumentIdVersionNoByIds, listDocumentsUploadedByByBusinessIdSince, listLogicalDocumentsIdTypeCodeVersionByIds } from './data.ts';
// What the client record asks the claims (its port, src/modules/clients/messages.ts). Last, as it reaches the client record's door.
import './claim-of-business.ts';
// Phase 161l2: the claim row and a claim's name for a person (moved up from the client record, src/modules/claims/claim-row.ts),
// and the claims' half of the client record's statements split by owner (for the CRM's src/modules/crm/split-reads.ts).
export { claimNaming, claimWords, getClaimsBusinessIdCompanyById, getStaffTasksIdClaimRefByClaimIdIsNextAction, listStaffTasksIdClaimRefByClaimIdIsNextAction, listStaffTasksIdClaimRefByClaimIdIsNextAction2, listStaffTasksIdClaimRefByClaimIdIsNextAction3, listStaffTasksIdClaimRefByClaimIdIsNextAction4, loadClaimRow } from './claim-row.ts';
export type { ClaimDbRow } from './claim-row.ts';
export { CLAIM_SEARCH_STATEMENTS, getClaimsFirstIdByBusinessId, getClaimsFirstIdByBusinessIdAssessmentId, getClaimsIdClaimRefPropertyLabelById, getPropertyRowById, listClaimListLines, listClaimsIdByPropertyId, listClaimsIdClaimRefBusinessIdStageByOwnerNull, listClaimsIdClaimRefBusinessIdStageOwner, listClaimsIdClaimRefPropertyLabelByBusinessId, listClaimsIdClaimRefPropertyLabelByIds, listClaimsIdClaimRefPropertyLabelByPropertyId, listClaimsIdCompletedAtByStageClosed, listPropertyRows, listPropertyRowsByBusinessId, searchClaimsFound, searchClaimsOfIdsFound, searchPropertiesFound, searchPropertiesOfBusinessesFound } from './data.ts';
// What the client record asks the claims (its port, src/modules/clients/claims-port.ts). Last, as it reaches the client record's door.
import './client-ports.ts';
