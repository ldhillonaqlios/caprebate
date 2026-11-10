/**
 * THE CLIENT PORTAL'S FRONT DOOR: the client's dashboard, their files and their confirmations. Another area imports this module only from here (09-app/docs/ARCHITECTURE.md rule 1).
 * Generated from the imports other areas made on the day the module moved, and kept by hand since: add a name here when
 * another area needs it, never a whole file.
 */
// Its permissions first: the core's table needs them before any of its rules is asked (src/core/authz.ts).
export { PORTAL_ACTIONS } from './actions.ts';
// The account settings' port, filled by the back office (src/app/staff.ts); it reads nothing.
export { setPortalSettings } from './settings-port.ts';
export type { PortalSettings, PortalSettingsDeps } from './settings-port.ts';
export { confirmSignup, MIN_PASSWORD, offerSignup, requestSignup, verifyOpen } from './signup.ts';
// Files that reach no other business module load first, so a loop back through a front door finds them ready.
export { getClientReportAcceptancesAcceptedAtFingerprintByClaimIdFing, getClientSignupsIdBusinessIdByOfferHash, getClientSignupsIdBusinessIdByVerifyHash, getClientSignupsTermsAgreedAtTermsVersionsById, getClientSignupsVerifyExpiresAtVerifiedAtByVerifyHash, insertClientSignups, updateClientSignupsEmailCanonicalDisplayNameByIdVerifiedAt, updateClientSignupsVerifiedAtUserIdById } from './data.ts';
export { accountantConfirmBlock, handleAccountantConfirmStaff, handleConfirmLink } from './accountant-confirm-pages.ts';
export { accountantFitNeed, latestAnswer, returnFilings, returnsOf } from './accountant-confirm.ts';
export { handleClientFiles } from './client-files-pages.ts';
export { portalDashboard } from './portal-dashboard.ts';
export * as portalModule from './portal.ts';
export { engagement, readBusiness } from './portal.ts';
export { ACCEPT_WORDS, acceptReport, myAcceptance } from './report-accept.ts';
export type { ReturnFiling } from './accountant-confirm.ts';
// Phase 161l2: the types of what the claims ask here, through their port (src/modules/claims/above-ports.ts).
export type { ConfirmKind, ConfirmRow } from './accountant-confirm.ts';
export { getClientReportAcceptancesCountByClaimId } from './data.ts';
// Its addresses, asked by the router shell; they reach other modules, so they load last.
export { CLIENT_RANGE_BASIS, CLIENT_RANGE_BASIS_AFTER_RESEARCH, LETTER_PAGE_CSP, portalConfirmLink, portalEntry, portalSignLink, rangeBasisFor } from './routes.ts';
// What the modules below ask the portal (the ports they own, Phase 161l2). Last, as it reaches the module's own files.
import './ports.ts';
// What the claims ask this module (their port, src/modules/claims/above-ports.ts). Last, as it reaches the claims' door.
import './claims-ports.ts';
// What the CRM asks the portal (its port, src/modules/crm/report-acceptance-port.ts; Phase 161l2). Last, as it reaches the CRM's door.
import './crm-ports.ts';
