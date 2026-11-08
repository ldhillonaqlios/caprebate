/**
 * THE CORE'S FRONT DOOR (Phase 161i, 7 Nov 2026; 09-app/ARCHITECTURE.md rule 1): the server and router shell, the database gate, sign-in, permissions, the audit log and the keys. Another area imports the core only from this file; what it may use is listed here, and nothing else of the core is reachable from outside.
 * Generated from the imports other areas made on that day, and kept by hand since: add a name here when another area
 * needs it, never a whole file.
 */
export { BORROWABLE_ROLES, NEVER_GRANTED, customRoleKey, isCustomRoleKey, loadCustomRoles, roleRefusal } from './custom-roles.ts';
export type { BorrowableRole, Grant } from './custom-roles.ts';
export { Db, migrate } from './db.ts';
export { SECRET_KEYS, isInside, processSecrets, redactSecrets, repositoryRoot } from './secrets.ts';
export type { OwnerSecrets, SecretOwner, SecretStore } from './secrets.ts';
export { assignRole, canonicalEmail, createUser, disableUser, findById, hashToken, listUsers, newId } from './users.ts';
export type { User } from './users.ts';
export { rateLimit, revokeAllSessions } from './auth.ts';
export type { Deps } from './auth.ts';
export { APP_ROLES, DPO_ROLE, isAppRole, toQuarantineRole } from './roles.ts';
export type { AppRole } from './roles.ts';
export { DPO_ROLE_SWITCH, NotAuthorised, REGISTERED_ACTIONS, authorise, builtInHolds, can } from './authz.ts';
export type { Actor, Obj } from './authz.ts';
export { photoFor } from './avatar.ts';
export type { PhotoRecord } from './avatar.ts';
export { BACKUP_KEEP_DAYS } from './backup.ts';
export { cleanField } from './typed.ts';
export { MultipartError, boundaryOf, manyFiles, parseMultipart, piecedFields, singleFile } from './multipart.ts';
export type { Part } from './multipart.ts';
export { requiredWordsInMarkup } from './required.ts';
export { sectionPrefs } from './sections.ts';
export { STAGE_GROUPS, groupBand, groupBar, kpiRow, lateBadge, noDateBadge, nobodyBadge, siteOf, stageBadge, stageGroupOf, stageLabel } from './look.ts';
export type { GroupKey, Kpi, KpiTone } from './look.ts';
export { piecesOf, piecesPage } from './upload-pieces.ts';
export { deleteCustomRoleGrantsByRole, getAuditLogCount, getAuditLogCountByKindAt, getAuditLogCountByKindObjectId, getCustomRolesNameRetiredAtByRole, getCustomRolesRoleByName, getRolesRoleByRole, getSessionsCountByUserIdRevokedReason, getUsersCountByBusinessId, getUsersCountByBusinessIdRole, getUsersCountByIdBusinessId, getUsersCountByRole, getUsersCountByRoleDisabledAt, getUsersDisplayNameById, getUsersEmailById, getUsersEmailDisplayNameById, getUsersEmailRoleById, getUsersIdByEmailCanonical, getUsersIdByEmailCanonicalId, getUsersIdByIdRole, getUsersIdByIdRole2, getUsersIdEmailByIdDisabledAt, getUsersNById, getUsersRoleById, getUsersRoleDisabledAtById, insertCustomRoleGrants, insertCustomRoles, insertRoles, listAuditLogAtKindByOutcomeKind, listAuditLogAtKindByOutcomeKind2, listAuditLogAtKindByOutcomeKind3, listAuditLogAtKindByOutcomeKind4, listAuditLogAtWhoByKindObjectId, listAuditLogDetailSByKindM, listAuditLogKind, listCustomRoleGrantsActionAsRoleByRole, listCustomRolesRoleName, listSessionsDisplayNameRoleByUserIdLastSeenAt, listSessionsIdDisplayNameByUserIdRole, listUserPhotosUserId, listUsersIdByRole, listUsersIdDisplayNameByRoleADM, listUsersIdDisplayNameByRoleADM2, listUsersIdDisplayNameByRoleDisabledAt, listUsersIdDisplayNameByRoleEmailCanonical, listUsersIdEmailByBusinessIdRole, listUsersIdEmailByRoleBusinessId, listUsersIdEmailByRoleDisabledAt, listUsersIdNameByBusinessIdRole, listUsersIdNameByRoleDisabledAt, listUsersIdNameByRoleDisabledAt2, listUsersIdRoleByDisabledAt, updateCustomRolesRetiredAtUpdatedAtByRole, updateCustomRolesUpdatedAtByRole, updateSessionsRevokedAtRevokedReasonByUserIdRevokedAt, updateUsersDisplayNameUpdatedAtById, updateUsersEmailEmailCanonicalById, updateUsersPasswordTemporaryUntilById } from './data.ts';
export type { Param, Row } from './db.ts';
