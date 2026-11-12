/**
 * COMPLIANCE'S FRONT DOOR: identity checks, data protection, the breach log, retention, complaints and the audit log screen. Another area imports this module only from here (09-app/docs/ARCHITECTURE.md rule 1).
 * Generated from the imports other areas made on the day the module moved, and kept by hand since: add a name here when
 * another area needs it, never a whole file.
 */
// Its permissions first: the core's table needs them before any of its rules is asked (src/core/authz.ts).
export { COMPLIANCE_ACTIONS } from './actions.ts';
// What no email, letter or breach entry may carry; it reads nothing, so the templates (admin) find it ready.
export { REFUSED_WORDS, carriesBankDetails, tipsOff } from './refused-words.ts';
// The legal pages' register; it reads nothing, so the public site's pages and the portal find it ready.
export { LEGAL_PAGES, NO_APPROVALS, NOTICES_VERSION, agreementLinks, inForce, safeBack, versionOf } from './legal-register.ts';
export type { Approvals, LegalPageKey, PageApproval } from './legal-register.ts';
export { logFormComplaint, refOf, waitingForms } from './complaint-forms.ts';
export type { WaitingForm } from './complaint-forms.ts';
export { AUDIT_OUTCOMES, AUDIT_PAGE_SIZE, auditLogGate, auditLogView, clientAuditCount } from './audit-log.ts';
export type { AuditLogView } from './audit-log.ts';
export { breachRegister } from './compliance-breach.ts';
export { RETENTION_PARAMETERS } from './compliance-identity.ts';
export { handleCompliance } from './compliance.routes.ts';
export { complaintsLog, logComplaint, rightsRegister } from './compliance-rights.ts';
export { cddGateNeed, dateField, liveHeldIds, settingReading, textField, words } from './compliance.ts';
export { assertComplianceRead, assertComplianceWrite, complianceObj } from './compliance.permissions.ts';
export type { ComplianceDeps, Fields, SettingReading, Vocab } from './compliance.ts';
export { DISCLOSURE_LOG } from './disclosure-log.ts';
export { IDENTITY_HOOK_MAX_BYTES, IDENTITY_HOOK_PATH, IDENTITY_SIGNATURE_HEADERS, identityChecks, identityPanel, receiveIdentityResult, storageReason } from './identity-checks.ts';
// Phase 161m2: the identity check's two emails (the link, and complete on a pass).
export { ID_EMAIL_WORDS, firstNameOf, idCheckDoneEmail, idCheckEmail } from './identity-checks.ts';
export { agreementPage, agreementTick, approvalsPage, currentApprovals, currentTermsVersions, hasAgreedCurrent, keepAgreement, recordApproval } from './legal-approvals.ts';
export type { TermsVersions } from './legal-approvals.ts';
export { getComplaintFormsIdReceivedAtById, insertComplaintForms, insertDeletionLog, insertDeletionLog2, listComplaintFormsIdReceivedAtByLoggedComplaintId, updateComplaintFormsLoggedComplaintIdLoggedAtByIdLoggedCompl } from './data.ts';
// Its addresses, asked by the router shell (Phase 161l2); they reach the module's own files, so they load last.
export { complianceIdentityHook, complianceLegalApprovals } from './routes.ts';
// What the claims ask this module (their port, src/modules/claims/above-ports.ts). Last, as it reaches the claims' door.
import './claims-ports.ts';
// What the modules below ask compliance (the ports they own, Phase 161l2). Last, as it reaches the module's own files.
import './ports.ts';
// Phase 161m: its rules register (logic/rules.ts), and every area's below it.
export { COMPLIANCE_RULES, rulesThroughCompliance } from './logic/rules.ts';
