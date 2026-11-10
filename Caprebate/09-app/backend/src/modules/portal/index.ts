/**
 * THE CLIENT PORTAL'S FRONT DOOR: the client's dashboard, their files and their confirmations. Another area imports this module only from here (09-app/docs/ARCHITECTURE.md rule 1).
 * Generated from the imports other areas made on the day the module moved, and kept by hand since: add a name here when
 * another area needs it, never a whole file.
 */
// Its permissions first: the core's table needs them before any of its rules is asked (src/core/authz.ts).
export { PORTAL_ACTIONS } from './actions.ts';
export { confirmSignup, MIN_PASSWORD, offerSignup, requestSignup, verifyOpen } from './signup.ts';
// Files that reach no other business module load first, so a loop back through a front door finds them ready.
export { getClientReportAcceptancesAcceptedAtFingerprintByClaimIdFing, getClientSignupsIdBusinessIdByOfferHash, getClientSignupsIdBusinessIdByVerifyHash, getClientSignupsTermsAgreedAtTermsVersionsById, getClientSignupsVerifyExpiresAtVerifiedAtByVerifyHash, insertClientSignups, updateClientSignupsEmailCanonicalDisplayNameByIdVerifiedAt, updateClientSignupsVerifiedAtUserIdById } from './data.ts';
export { portalStepLine, PROPOSED_STEP_NAMES, stepName } from './portal-steps.ts';
export { accountantConfirmBlock, handleAccountantConfirmStaff, handleConfirmLink } from './accountant-confirm-pages.ts';
export { accountantFitNeed, latestAnswer, returnFilings, returnsOf } from './accountant-confirm.ts';
export { filesButton, folderTiles, handleClientFiles } from './client-files-pages.ts';
// Phase 161l2: one way in for a file and the question about a name moved to the claims; named here as before for the
// CRM (inbound-email.ts, messages-pages.ts) until it reads them through the claims' door.
export { earlyQuestions, readUpload, receiveFile } from '../claims/index.ts';
// Phase 161l2: the client's filing confirmation moved to the claims; named here as before for the CRM's pipeline
// (src/modules/crm/pipeline.ts) until it reads it through the claims' door.
export { clientConfirmationNeed, filingRoute, recordClientFilingConfirmation } from '../claims/index.ts';
export { claimBoxes, headerActions, lookupsCard, newDot, nextStepCard, presentTabs, progressBar, setClientMenu, TAB_OF_SECTION, tabbed } from './client-layout.ts';
export { portalDashboard } from './portal-dashboard.ts';
export * as portalModule from './portal.ts';
export { engagement, readBusiness } from './portal.ts';
export { ACCEPT_WORDS, acceptReport, myAcceptance } from './report-accept.ts';
export type { ReturnFiling } from './accountant-confirm.ts';
export type { TabKey } from './client-layout.ts';
export { getClientReportAcceptancesCountByClaimId } from './data.ts';
// Its addresses, asked by the router shell; they reach other modules, so they load last.
export { CLIENT_RANGE_BASIS, CLIENT_RANGE_BASIS_AFTER_RESEARCH, LETTER_PAGE_CSP, portalConfirmLink, portalEntry, portalSignLink, rangeBasisFor } from './routes.ts';
