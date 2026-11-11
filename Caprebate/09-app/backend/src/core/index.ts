/**
 * THE CORE'S FRONT DOOR: the database gate, sign-in, permissions, the audit log and the keys. Another area imports the core only from this file; what it may use is listed here, and nothing else of the core is reachable from outside.
 * Generated from the imports other areas made on that day, and kept by hand since: add a name here when another area
 * needs it, never a whole file.
 */
// Files that reach no other business module load first, so a loop back through a front door finds them ready.
export { AuthError, GENERIC_AUTH_FAILURE, SESSION_COOKIE_NAME, TEMPORARY_PASSWORD_EXPIRED, authenticate, changeOwnPassword, completePasswordReset, logout, primeTimingDefence, rateLimit, requestPasswordReset, revokeAllSessions } from './auth.ts';
export { DPO_ROLE_SWITCH, NotAuthorised, PREDICATES, REGISTERED_ACTIONS, actionOwner, authorise, builtInHolds, can, registerActions } from './authz.ts';
export { IMAGE_LIMITS, PHOTO_HEADERS, clearPhoto, photoFor, readPhoto, setPhoto } from './avatar.ts';
export { AuditLog, GENESIS, _canonical, screenDetail } from './audit.ts';
export { BackOfficeError, NotFoundAsRefusal, answerLabel, assertBackOffice, assertSection, mayArrangeCalls, mayEnterBackOffice } from './backoffice.ts';
export { EventOutsideTransaction, ListenerFailed, announce, listen, listenersOf } from './events.ts';
export { BORROWABLE_ROLES, NEVER_GRANTED, customRoleKey, customRoleOf, isCustomRoleKey, loadCustomRoles, roleRefusal } from './custom-roles.ts';
export { deleteCustomRoleGrantsByRole, fillUser, fillUsers, getAuditLogCount, getAuditLogCountByKindAt, getAuditLogCountByKindObjectId, getCustomRolesNameRetiredAtByRole, getCustomRolesRoleByName, getRolesRoleByRole, getSessionsCountByUserIdRevokedReason, getSessionsIdByTokenHashRevokedAt, getUsersCountByBusinessId, getUsersCountByBusinessIdRole, getUsersCountByEmailCanonical, getUsersCountByIdBusinessId, getUsersCountByRole, getUsersCountByRoleDisabledAt, getUsersDisplayNameById, getUsersEmailById, getUsersEmailDisplayNameById, getUsersEmailRoleById, getUsersHByIdDisabledAt, getUsersIdByEmailCanonical, getUsersIdByEmailCanonicalId, getUsersIdByIdEmailCanonical, getUsersIdByIdRole, getUsersIdByIdRole2, getUsersIdEmailByIdDisabledAt, getUsersNById, getUsersRoleById, getUsersRoleByIdDisabledAt, getUsersRoleDisabledAtById, insertCustomRoleGrants, insertCustomRoles, insertRoles, listAuditLogAtKindByOutcomeKind, listAuditLogAtKindByOutcomeKind2, listAuditLogAtKindByOutcomeKind3, listAuditLogAtKindByOutcomeKind4, listAuditLogAtWhoByKindObjectId, listAuditLogDetailSByKindM, listAuditLogKind, listCustomRoleGrantsActionAsRoleByRole, listCustomRolesRoleName, listSessionsDisplayNameRoleByUserIdLastSeenAt, listSessionsIdDisplayNameByUserIdRole, listUserPhotosUserId, listUsersDisplayNameByIds, listUsersIdByRole, listUsersIdDisplayNameByRoleADM, listUsersIdDisplayNameByRoleADM2, listUsersIdDisplayNameByRoleDisabledAt, listUsersIdDisplayNameByRoleEmailCanonical, listUsersIdDisplayNameRoleEmailByIds, listUsersIdEmailByBusinessIdRole, listUsersIdEmailByRoleBusinessId, listUsersIdEmailByRoleDisabledAt, listUsersIdNameByBusinessIdRole, listUsersIdNameByRoleDisabledAt, listUsersIdNameByRoleDisabledAt2, listUsersIdRoleByDisabledAt, updateCustomRolesRetiredAtUpdatedAtByRole, updateCustomRolesUpdatedAtByRole, updateSessionsRevokedAtRevokedReasonByUserIdRevokedAt, updateUsersDisplayNameUpdatedAtById, updateUsersEmailEmailCanonicalById, updateUsersPasswordTemporaryUntilById } from './data.ts';
// The users the client record's statements joined, by a list of ids (Phase 161l2).
export { getUsersCountByBusinessIdsEmailCanonical, listUsersIdDisplayNameByIdsDisabledAt } from './data.ts';
export { getAuditLogCountByObjectIds, listAuditLogLines, listAuditLogLinesByObjectIds } from './data.ts';
// The lookup by ids that takes the place of another area's join to users.
export { listAuditLogAtDetailActorIdByInvoiceUpdatedObjectIds, namesByIds, peopleByIds } from './data.ts';
export { Db, migrate, pendingMigrations, withReadMemo } from './db.ts';
export { clientHelp, staffHelp } from './help.ts';
export { JSON_HEADERS, PayloadTooLarge, bindResponse, clientIp, clockOf, cookie, form, html, inContext, nav, readBody, redirect, setCookie, simple } from './http.ts';
export { STAGE_GROUPS, groupBand, groupBar, kpiRow, lateBadge, noDateBadge, nobodyBadge, siteOf, stageBadge, stageGroupOf, stageLabel } from './look.ts';
export { nameSwitches, navContext, setSubMenu } from './nav-context.ts';
export { LEAD_FILTERS, TASK_FILTERS, addUnderCurrent, filterBar, opens, portalShell, provideNav, staffShell } from './navigation.ts';
export { setAssignedSurveyorsReader, surveyorsOnBusiness, surveyorsOnClaim } from './assigned-surveyors.ts';
export { MultipartError, boundaryOf, manyFiles, parseMultipart, piecedFields, singleFile } from './multipart.ts';
export { APP_ROLES, DPO_ROLE, isAppRole, toQuarantineRole } from './roles.ts';
export { SECRET_KEYS, isInside, isProduction, keyFileStartCheck, overlaySecrets, processSecrets, redactSecrets, repositoryRoot, secretsFromEnvironment, useProcessSecrets } from './secrets.ts';
export { keepSectionChoice, sectionPrefs } from './sections.ts';
export { cleanField } from './typed.ts';
export { PIECED_ABOVE, PIECE_BYTES, piecesOf, piecesPage, putPiece, setDocumentMaxBytes, startPieces, sweepPieces } from './upload-pieces.ts';
export { assignRole, canonicalEmail, createUser, disableUser, findById, hashToken, listUsers, newId, toActor } from './users.ts';
export { WELCOME_JOBS, dismissWelcome, welcomeShown } from './welcome.ts';
// What the start-up wiring (src/app/) uses of the core. Each file named here loads no business module.
export { MIGRATIONS_DIR, STUBS } from './app.ts';
export { addTokensToPages, formTokenRefusal, refuseForm } from './form-token-check.ts';
export { formToken, formTokensMode, onceToken } from './form-token.ts';
export { MFA_KEY_NAME, mfaKeyFrom, resealSecrets, sealTextSecrets } from './mfa-seal.ts';
export { defaultHasher } from './password.ts';
export { RECOVERY_CODES_LOW } from './recovery-codes.ts';
export { refillForm, typedValues } from './refill.ts';
export { MIN_PASSWORD, STEP_COOKIE, STEP_GONE, STEP_TTL_MS, TEMPORARY_PASSWORD_DAYS, beginSignIn, chooseMethod, describeStep, issueTemporaryPassword, makeNewRecoveryCodes, ownRecoveryCodesLeft, ownTwoFactor, recoveryCodesPage, recoveryCodesWords, removeOwnTwoFactor, resendCode, resetTwoFactor, startAccountSetup, stepPage, submitCode, submitNewPassword, submitRecoveryCode, temporaryPassword, temporaryUntil } from './sign-in.ts';
export type { Deps, LoginResult } from './auth.ts';
export type { AuditEntry, AuditKind, Outcome } from './audit.ts';
export type { Actor, DocumentFacts, Obj, ObjType, Rule, RuleTable } from './authz.ts';
export type { PhotoRecord } from './avatar.ts';
export type { EventContext, EventMap, EventName, Listener } from './events.ts';
export type { BorrowableRole, Grant } from './custom-roles.ts';
export type { Param, Row } from './db.ts';
export type { UserColumn } from './data.ts';
export type { StaffRequest, WebDeps, WebRequest, WebResult } from './http.ts';
export type { GroupKey, Kpi, KpiTone } from './look.ts';
export type { NavParts } from './navigation.ts';
export type { AssignedSurveyorsReader } from './assigned-surveyors.ts';
export type { Part } from './multipart.ts';
export type { AppRole } from './roles.ts';
export type { OwnerSecrets, SecretKey, SecretOwner, SecretStore } from './secrets.ts';
export type { User } from './users.ts';
export type { PersonFacts } from './data.ts';
export type { App, BuildOptions } from './app.ts';
export type { FormTokens } from './form-token.ts';
export type { PasswordHasher } from './password.ts';
export type { Method } from './sign-in.ts';
// Phase 161m: the core's rules register.
export { CORE_RULES, rulesThroughCore } from './logic/rules.ts';
