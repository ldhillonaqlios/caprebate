/**
 * COMPLIANCE'S FRONT DOOR: identity checks, data protection, the breach log, retention, complaints and the audit log screen. Another area imports this module only from here (09-app/docs/ARCHITECTURE.md rule 1).
 * Generated from the imports other areas made on the day the module moved, and kept by hand since: add a name here when
 * another area needs it, never a whole file.
 */
// Its permissions first: the core's table needs them before any of its rules is asked (src/core/authz.ts).
export { COMPLIANCE_ACTIONS } from './actions.ts';
export { AUDIT_OUTCOMES, AUDIT_PAGE_SIZE, auditLogGate, auditLogView, clientAuditCount } from './audit-log.ts';
export type { AuditLogView } from './audit-log.ts';
export { breachRegister } from './compliance-breach.ts';
export { RETENTION_PARAMETERS } from './compliance-identity.ts';
export { handleCompliance } from './compliance-pages.ts';
export { complaintsLog, logComplaint, rightsRegister } from './compliance-rights.ts';
export { assertComplianceRead, assertComplianceWrite, cddGateNeed, complianceObj, dateField, liveHeldIds, settingReading, textField, words } from './compliance.ts';
export type { ComplianceDeps, Fields, SettingReading, Vocab } from './compliance.ts';
export { DISCLOSURE_LOG } from './disclosure-log.ts';
export { IDENTITY_HOOK_MAX_BYTES, IDENTITY_HOOK_PATH, IDENTITY_SIGNATURE_HEADERS, identityChecks, identityPanel, receiveIdentityResult, storageReason } from './identity-checks.ts';
export { agreementPage, agreementTick, approvalsPage, currentApprovals, currentTermsVersions, hasAgreedCurrent, keepAgreement, recordApproval } from './legal-approvals.ts';
export type { TermsVersions } from './legal-approvals.ts';
export { getComplaintFormsIdReceivedAtById, insertComplaintForms, insertDeletionLog, insertDeletionLog2, listComplaintFormsIdReceivedAtByLoggedComplaintId, updateComplaintFormsLoggedComplaintIdLoggedAtByIdLoggedCompl } from './data.ts';
