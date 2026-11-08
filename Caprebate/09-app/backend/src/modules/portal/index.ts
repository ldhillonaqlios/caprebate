/**
 * THE CLIENT PORTAL'S FRONT DOOR: the client's dashboard, their files and their confirmations. Another area imports this module only from here (09-app/ARCHITECTURE.md rule 1).
 * Generated from the imports other areas made on the day the module moved, and kept by hand since: add a name here when
 * another area needs it, never a whole file.
 */
export { accountantConfirmBlock, handleAccountantConfirmStaff, handleConfirmLink } from './accountant-confirm-pages.ts';
export { accountantFitNeed, latestAnswer, returnFilings, returnsOf } from './accountant-confirm.ts';
export type { ReturnFiling } from './accountant-confirm.ts';
export { earlyQuestions, filesButton, folderTiles, handleClientFiles, readUpload, receiveFile } from './client-files-pages.ts';
export { clientConfirmationNeed, filingRoute, recordClientFilingConfirmation } from './client-filing.ts';
export { claimBoxes, headerActions, lookupsCard, newDot, nextStepCard, presentTabs, progressBar, setClientMenu, TAB_OF_SECTION, tabbed } from './client-layout.ts';
export type { TabKey } from './client-layout.ts';
export { getClientReportAcceptancesAcceptedAtFingerprintByClaimIdFing, insertClientStepNotices, insertClientStepNotices2, listClientStepNoticesClaimIdStepByBusinessId2 } from './data.ts';
export { portalDashboard } from './portal-dashboard.ts';
export { portalStepLine, PROPOSED_STEP_NAMES, stepName } from './portal-steps.ts';
export * as portalModule from './portal.ts';
export { engagement, readBusiness } from './portal.ts';
export { ACCEPT_WORDS, acceptReport, myAcceptance } from './report-accept.ts';
export { approvedFieldsOf, lookAgainAfter, lookAgainJson, lookAgainShort, lookAgainSummary, takeBackReason } from './take-back.ts';
export type { LookAgain } from './take-back.ts';
