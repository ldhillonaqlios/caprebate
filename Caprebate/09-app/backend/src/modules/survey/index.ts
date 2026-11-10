/**
 * THE SURVEY'S FRONT DOOR: the surveyor workspace, the survey pack, the report, photos and video, and the costings. Another area imports this module only from here (09-app/docs/ARCHITECTURE.md rule 1).
 * Generated from the imports other areas made on the day the module moved, and kept by hand since: add a name here when
 * another area needs it, never a whole file.
 */
// Its permissions first: the core's table needs them before any of its rules is asked (src/core/authz.ts).
export { SURVEY_ACTIONS } from './actions.ts';
export { GENESIS } from './anchor-quarantine.ts';
export type { Role } from './anchor-quarantine.ts';
// The BCIS importers, for the command line (src/app/cli.ts).
export { importBcisData } from './bcis-data.ts';
export { importBcisIndex } from './bcis-index.ts';
export { getAnchorLogCountByJobIdClaimId, getAnchorLogHash, getAnchorLogSeqHashByJobIdClaimId, getSitePlansPostcodeHalfMByJobId, getSurveyorCommitmentsCommittedAtByClaimId, getSurveyorCommitmentsIdJobIdByClaimId, getSurveyorCommitmentsNByAssessmentId, getSurveyorJobsCountByBusinessIdState, getSurveyorJobsIdBusinessIdById4, getSurveyorJobsSurveyorIdByBusinessIdSurveyorId, getSurveyPackApprovalsClaimIdBusinessIdById, getSurveyPackApprovalsCountByPackId, getSurveyPackApprovalsIdVersionByClaimId, getSurveyPackApprovalsJsonExtractSnapshotJsonFById, getSurveyPackApprovalsJsonExtractSnapshotJsonQById, getSurveyPackApprovalsSnapshotJsonByClaimId, getSurveyPackApprovalsSnapshotJsonVersionByClaimId, getSurveyPackApprovalsVersionSnapshotJsonByClaimId, getSurveyPackLegalAnswersSByPackIdByUser, getSurveyPacksIdByJobId, insertPackClientNotices, insertPackSignoffAnswers, insertPackSignoffRecorded, insertPackSignoffRequests, insertSitePlans, insertSurveyorCommitments, insertSurveyorJobs, listSurveyorJobsIdBusinessIdByClaimId, listSurveyorJobsIdSurveyorIdByClaimId, listSurveyorJobsSurveyorIdByBusinessIdSurveyorId, listSurveyorJobsSurveyorIdByBusinessIdSurveyorId2, listSurveyorJobsSurveyorIdByBusinessIdSurveyorId3, listSurveyorJobsSurveyorIdByClaimIdSurveyorId, listSurveyorJobsSurveyorIdByClaimIdSurveyorId2, listSurveyPackApprovalsSnapshotJsonAssessmentIdByVersionPack, listSurveyPackReadsChapterSeqByJobIdUserId, updateSurveyorJobsClaimIdByBusinessIdAssessmentId } from './data.ts';
export { handlePortalEvidence, handleStaffEvidence, portalEvidenceCard } from './evidence-pages.ts';
export { approvedVersion } from './pack-approve.ts';
export type { ApprovalRow, Readiness, Snapshot } from './pack-approve.ts';
export { CHAPTERS, chaptersToRead } from './pack-chapters.ts';
export { grantRoute } from './pack-grants.ts';
export type { GrantSwitches, PackGrant } from './pack-grants.ts';
export { legalVerdictForClaim } from './pack-legal.ts';
export type { LegalVerdict } from './pack-legal.ts';
export { parseCsv, taxonomy, TAXONOMY_SECTOR } from './pack-lines.ts';
export { poundsWords } from './pack-sums.ts';
export type { Source, Valued } from './pack-sums.ts';
export { PHOTO_UPLOAD_JS } from './photo-upload-script.ts';
export { sweepUploads } from './photo-upload.ts';
export { checklistView } from './survey-evidence.ts';
export type { ChecklistView } from './survey-evidence.ts';
// Moved up from the assessment (Phase 161l2): the grant checks (they read the pack's grant routes) and the sector
// ranges from finished packs, for the CRM's pipeline and the command line. The desk-first reading is the survey's own.
export { grantProviderNeed, grantSplitNeed } from './grant-checks.ts';
export { proposeRanges } from './sector-ranges.ts';
export * as surveyOpenModule from './survey-open.ts';
export { handleSurveyPack } from './survey-pack-pages.ts';
export { packView } from './survey-pack.ts';
export type { PackView } from './survey-pack.ts';
export { longDate, REPORT_TITLE, reportHtml, reportModel, reportPdf } from './survey-report.ts';
// Phase 161l2: the report's pages and its sign-off came here from the claims (the client's own pages are the portal's).
export { handleReportStaff, pdfName, sendPdf } from './report-pages.ts';
export { releasedVersion } from './report-signoff.ts';
// And what the claim's overview (now the CRM's) read in the claims' borrowed file.
export { getSurveyorJobsIdSurveyorIdByClaimId } from './data.ts';
export { sweepVideos } from './survey-video.ts';
export { handleSurveyor, setSurveyorThreadPanel } from './surveyor-pages.ts';
export type { SurveyorThreadPanel } from './surveyor-pages.ts';
export { assertSurveySection, packJob, payloadFor, surveyorJobs } from './surveyor.ts';
export { assembleReleasedFacts } from '../../payload.ts';
export type { ReleasedFacts } from '../../payload.ts';
// Its parts of the back office's menu (src/core/navigation.ts). Last, as it reaches the module's own files.
import './nav.ts';
// Who holds a survey job, for the core's port (src/core/assigned-surveyors.ts). Last, as it reaches the module's own data.
import './assigned-surveyors.ts';
// Phase 161l1: what the CRM reads here in place of its joins (src/modules/clients/data-borrowed.ts, emptied in Phase 161l2).
export { getSurveyPackApprovalsVersionApprovedAtApprovedByByClaimId, listSurveyorCommitmentsCommittedAtJobIdSurveyorIdByClaimId, listSurveyorJobsBusinessIdClaimIdBySurveyorId, listSurveyorJobsIdBusinessIdClaimIdBySurveyorId } from './data.ts';
// Its addresses, asked by the router shell; they reach other modules, so they load last.
export { surveySignoffLink } from './routes.ts';
// What the claims ask this module (their port, src/modules/claims/above-ports.ts). Last, as it reaches the claims' door.
import './claims-ports.ts';
// Phase 161l2: whether a booking is a walk-through, for the client record's port (src/modules/clients/walkthrough-port.ts).
// Last, as it reaches the client record's door.
export { getSurveyWalkthroughsXByBookingId } from './data.ts';
import './client-ports.ts';
