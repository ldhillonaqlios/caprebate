/**
 * THE CORE'S DATA FILE. The only file that runs SQL on the
 * tables architecture/tables.json gives the core (users, sessions, the audit log, roles and the rest). Every other file
 * asks through these functions: inside the core from here, from another area through the core's front door.
 * Each statement is the one its caller ran before, moved here with its text unchanged; a caller's row type stays with
 * the caller (the type argument).
 */
import type { Db, Param, Row } from './db.ts';

// audit_log
export function getAuditLogCount<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT COUNT(*) AS n FROM audit_log', params);
}
export function getAuditLogCountByKindAt<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>("SELECT COUNT(*) AS n FROM audit_log WHERE kind = 'CONNECTOR_CALLED' AND at >= ? " +
    "AND json_extract(detail, '$.service') = ? AND outcome <> 'REFUSED'", params);
}
export function getAuditLogCountByKindObjectId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>("SELECT COUNT(*) AS n FROM audit_log WHERE kind = 'ENGAGEMENT_SIGNED' AND object_id = ? AND json_extract(detail, '$.record') = ?", params);
}
export function getAuditLogSeqHash<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT seq, hash FROM audit_log ORDER BY seq DESC LIMIT 1', params);
}
export function insertAuditLog(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('INSERT INTO audit_log (seq, at, kind, actor_id, actor_role, object_type, object_id, outcome, detail, prev_hash, hash) ' +
    'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', params);
}
export function listAuditLog<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT * FROM audit_log ORDER BY seq ASC', params);
}
export function listAuditLogAtKindByOutcomeKind<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT a.at, a.kind, a.object_type, a.detail, u.display_name AS who FROM audit_log a LEFT JOIN users u ON u.id = a.actor_id ' +
    "WHERE a.outcome = 'ALLOWED' AND a.kind IN ('CLAIM_CREATED','CLAIM_UPDATED','EMAIL_QUEUED') " +
    "AND ((a.object_type = 'claim' AND a.object_id = ?) OR json_extract(a.detail, '$.claim') = ?) ORDER BY a.seq", params);
}
export function listAuditLogAtKindByOutcomeKind2<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT a.at, a.kind, a.object_type, a.detail, u.display_name AS who FROM audit_log a LEFT JOIN users u ON u.id = a.actor_id ' +
    "WHERE a.outcome = 'ALLOWED' AND a.kind IN ('LEAD_CREATED','LEAD_UPDATED','LEAD_CONVERTED') AND a.object_id = ? ORDER BY a.seq", params);
}
export function listAuditLogAtKindByOutcomeKind3<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT a.at, a.kind, a.object_type, a.detail, u.display_name AS who FROM audit_log a LEFT JOIN users u ON u.id = a.actor_id ' +
    "WHERE a.outcome = 'ALLOWED' AND a.kind IN ('ORGANISATION_UPDATED','CONTACT_CREATED','CONTACT_UPDATED','PROPERTY_CREATED'," +
    "'PROPERTY_UPDATED','CLAIM_CREATED','CLAIM_UPDATED','LEAD_CREATED','LEAD_UPDATED','LEAD_CONVERTED','EMAIL_QUEUED') " +
    "AND (a.object_id = ? OR json_extract(a.detail, '$.business') = ?) ORDER BY a.seq", params);
}
export function listAuditLogAtKindByOutcomeKind4<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT a.at, a.kind, a.object_type, a.detail, u.display_name AS who FROM audit_log a LEFT JOIN users u ON u.id = a.actor_id ' +
    "WHERE a.outcome = 'ALLOWED' AND a.kind IN ('PROPERTY_CREATED','PROPERTY_UPDATED') AND a.object_id = ? ORDER BY a.seq", params);
}
export function listAuditLogAtWhoByKindObjectId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>("SELECT a.at, u.display_name AS who FROM audit_log a LEFT JOIN users u ON u.id = a.actor_id WHERE a.kind = 'INVOICE_SENT' AND a.object_id = ? ORDER BY a.seq", params);
}
export function listAuditLogDetailSByKindM<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>(`SELECT json_extract(a.detail, '$.service') AS s, a.at, json_extract(a.detail, '$.result') AS result, json_extract(a.detail, '$.status') AS status
    FROM audit_log a JOIN (SELECT json_extract(detail, '$.service') AS s, max(seq) AS m FROM audit_log WHERE kind = 'CONNECTOR_CALLED' GROUP BY 1) x
    ON x.m = a.seq`, params);
}
export function listAuditLogKind<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT DISTINCT kind FROM audit_log ORDER BY kind ASC', params);
}
// The audit log page's lines (src/modules/compliance/audit-log.ts), text unchanged from it.
export function listAuditLogLines<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT a.seq, a.at, a.kind, a.actor_role, a.actor_id, a.object_type, a.object_id, a.outcome, u.display_name AS who FROM audit_log a ' +
    'LEFT JOIN users u ON u.id = a.actor_id WHERE (? IS NULL OR a.kind = ?) AND (? IS NULL OR a.outcome = ?) ORDER BY a.seq DESC LIMIT ?', params);
}
/* ONE CLIENT'S AUDIT LINES: about the client, its claims or its properties, or naming them. The client's claims and
   properties are the claims module's, so the caller hands their ids in as JSON arrays (in this order: the client, its
   claims, its properties, the client twice, its claims); each is compared as text, as the claims' own id column was. */
export function listAuditLogLinesByObjectIds<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT a.seq, a.at, a.kind, a.actor_role, a.actor_id, a.object_type, a.object_id, a.outcome, u.display_name AS who FROM audit_log a ' +
    'LEFT JOIN users u ON u.id = a.actor_id WHERE (? IS NULL OR a.kind = ?) AND (? IS NULL OR a.outcome = ?) AND ' +
    '(a.object_id = ? OR a.object_id IN (SELECT CAST(value AS TEXT) FROM json_each(?)) ' +
    'OR a.object_id IN (SELECT CAST(value AS TEXT) FROM json_each(?)) ' +
    "OR json_extract(a.detail, '$.business') = ? OR json_extract(a.detail, '$.business_id') = ? " +
    "OR json_extract(a.detail, '$.claim') IN (SELECT CAST(value AS TEXT) FROM json_each(?))) " +
    'ORDER BY a.seq DESC LIMIT ?', params);
}
export function getAuditLogCountByObjectIds<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT COUNT(*) AS n FROM audit_log a WHERE ' +
    '(a.object_id = ? OR a.object_id IN (SELECT CAST(value AS TEXT) FROM json_each(?)) ' +
    'OR a.object_id IN (SELECT CAST(value AS TEXT) FROM json_each(?)) ' +
    "OR json_extract(a.detail, '$.business') = ? OR json_extract(a.detail, '$.business_id') = ? " +
    "OR json_extract(a.detail, '$.claim') IN (SELECT CAST(value AS TEXT) FROM json_each(?))) ", params);
}

// custom_role_grants
export function deleteCustomRoleGrantsByRole(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('DELETE FROM custom_role_grants WHERE role = ?', params);
}
export function insertCustomRoleGrants(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('INSERT INTO custom_role_grants (role, action, as_role) VALUES (?, ?, ?)', params);
}
export function listCustomRoleGrantsActionAsRoleByRole<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT action, as_role FROM custom_role_grants WHERE role = ? ORDER BY action', params);
}
export function listCustomRoleGrantsRoleAction<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT role, action, as_role FROM custom_role_grants ORDER BY role, action', params);
}

// custom_roles
export function getCustomRolesNameRetiredAtByRole<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT name, retired_at FROM custom_roles WHERE role = ?', params);
}
export function getCustomRolesRoleByName<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT role FROM custom_roles WHERE name = ?', params);
}
export function insertCustomRoles(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('INSERT INTO custom_roles (role, name, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?)', params);
}
export function listCustomRolesRoleName<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT role, name, retired_at FROM custom_roles ORDER BY retired_at IS NOT NULL, name', params);
}
export function listCustomRolesRoleNameByRetiredAt<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT role, name FROM custom_roles WHERE retired_at IS NULL ORDER BY role', params);
}
export function updateCustomRolesRetiredAtUpdatedAtByRole(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('UPDATE custom_roles SET retired_at = ?, updated_at = ? WHERE role = ?', params);
}
export function updateCustomRolesUpdatedAtByRole(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('UPDATE custom_roles SET updated_at = ? WHERE role = ?', params);
}

// form_tokens_used
export function deleteFormTokensUsedByUsedAt(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('DELETE FROM form_tokens_used WHERE used_at < ?', params);
}
export function insertFormTokensUsed(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('INSERT OR IGNORE INTO form_tokens_used (nonce, user_id, used_at) VALUES (?, ?, ?)', params);
}

// password_reset_tokens
export function getPasswordResetTokensIdUserIdByTokenHash<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT id, user_id, expires_at, used_at FROM password_reset_tokens WHERE token_hash = ?', params);
}
export function insertPasswordResetTokens(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('INSERT INTO password_reset_tokens (id, user_id, token_hash, created_at, expires_at, used_at) ' +
    'VALUES (?, ?, ?, ?, ?, NULL)', params);
}
export function updatePasswordResetTokensUsedAtById(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('UPDATE password_reset_tokens SET used_at = ? WHERE id = ?', params);
}

// rate_limit_hits
export function getRateLimitHitsHitsByBucketWindowStart<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT hits FROM rate_limit_hits WHERE bucket = ? AND window_start = ?', params);
}
export function insertRateLimitHits(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('INSERT INTO rate_limit_hits (bucket, window_start, hits) VALUES (?, ?, 1) ' +
    'ON CONFLICT(bucket, window_start) DO UPDATE SET hits = hits + 1', params);
}

// recovery_codes
export function deleteRecoveryCodesByUserId(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('DELETE FROM recovery_codes WHERE user_id = ?', params);
}
export function getRecoveryCodesCountByUserIdUsedAt<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT COUNT(*) AS n FROM recovery_codes WHERE user_id = ? AND used_at IS NULL', params);
}
export function insertRecoveryCodes(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('INSERT INTO recovery_codes (id, user_id, code_hash, made_at) VALUES (?, ?, ?, ?)', params);
}
export function listRecoveryCodesIdCodeHashByUserIdUsedAt<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT id, code_hash FROM recovery_codes WHERE user_id = ? AND used_at IS NULL', params);
}
export function updateRecoveryCodesUsedAtByIdUsedAt(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('UPDATE recovery_codes SET used_at = ? WHERE id = ? AND used_at IS NULL', params);
}

// roles
export function getRolesRoleByRole<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT role FROM roles WHERE role = ?', params);
}
export function insertRoles(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('INSERT INTO roles (role, description) VALUES (?, ?)', params);
}

// section_prefs
export function deleteSectionPrefsByUserIdSection(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('DELETE FROM section_prefs WHERE user_id = ? AND section = ?', params);
}
export function insertSectionPrefs(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('INSERT INTO section_prefs (user_id, section, open, updated_at) VALUES (?, ?, ?, ?) ' +
    'ON CONFLICT (user_id, section) DO UPDATE SET open = excluded.open, updated_at = excluded.updated_at', params);
}
export function listSectionPrefsSectionOpenByUserId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT section, open FROM section_prefs WHERE user_id = ?', params);
}

// sessions
export function getSessionsCountByUserIdRevokedReason<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT COUNT(*) AS n FROM sessions WHERE user_id = ? AND revoked_reason = ?', params);
}
export function getSessionsIdByTokenHashRevokedAt<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT id FROM sessions WHERE token_hash = ? AND revoked_at IS NULL', params);
}
export function getSessionsIdUserIdByTokenHash<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT id, user_id, expires_at, revoked_at, last_seen_at FROM sessions WHERE token_hash = ?', params);
}
export function insertSessions(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('INSERT INTO sessions (id, user_id, token_hash, created_at, expires_at, last_seen_at, revoked_at, revoked_reason, rotated_from) ' +
    'VALUES (?, ?, ?, ?, ?, ?, NULL, NULL, ?)', params);
}
export function listSessionsDisplayNameRoleByUserIdLastSeenAt<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT u.display_name, u.role, ' +
    '(SELECT min(s.created_at) FROM sessions s WHERE s.user_id = u.id AND s.last_seen_at >= ?) AS first, ' +
    '(SELECT max(s.last_seen_at) FROM sessions s WHERE s.user_id = u.id AND s.last_seen_at >= ?) AS last, ' +
    '(SELECT count(*) FROM sessions s WHERE s.user_id = u.id AND s.revoked_at IS NULL AND s.expires_at > ? AND s.last_seen_at >= ?) AS live ' +
    "FROM users u WHERE u.disabled_at IS NULL AND u.role <> 'CLIENT' ORDER BY u.display_name", params);
}
export function listSessionsIdDisplayNameByUserIdRole<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>("SELECT u.id, u.display_name, u.role, u.disabled_at, (SELECT max(s.last_seen_at) FROM sessions s WHERE s.user_id = u.id) AS last FROM users u WHERE u.role <> 'CLIENT' ORDER BY u.display_name", params);
}
export function updateSessionsLastSeenAtById(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('UPDATE sessions SET last_seen_at = ? WHERE id = ?', params);
}
export function updateSessionsRevokedAtRevokedReasonByIdRevokedAt(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('UPDATE sessions SET revoked_at = ?, revoked_reason = ? WHERE id = ? AND revoked_at IS NULL', params);
}
export function updateSessionsRevokedAtRevokedReasonByUserIdRevokedAt(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('UPDATE sessions SET revoked_at = ?, revoked_reason = ? WHERE user_id = ? AND revoked_at IS NULL', params);
}

// sign_in_steps
export function getSignInStepsIdUserIdById<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT id, user_id, purpose, step, pending_method, pending_secret, code_hash, code_expires_at, codes_sent, attempts, expires_at, finished_at ' +
    'FROM sign_in_steps WHERE id = ?', params);
}
export function getSignInStepsIdUserIdByTokenHash<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT id, user_id, purpose, step, pending_method, pending_secret, code_hash, code_expires_at, codes_sent, attempts, expires_at, finished_at ' +
    'FROM sign_in_steps WHERE token_hash = ?', params);
}
export function insertSignInSteps(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('INSERT INTO sign_in_steps (id, token_hash, user_id, purpose, step, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?)', params);
}
export function updateSignInStepsAttemptsById(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('UPDATE sign_in_steps SET attempts = attempts + 1 WHERE id = ?', params);
}
export function updateSignInStepsCodeHashCodeExpiresAtById(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('UPDATE sign_in_steps SET code_hash = ?, code_expires_at = ?, codes_sent = codes_sent + 1 WHERE id = ?', params);
}
export function updateSignInStepsFinishedAtById(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('UPDATE sign_in_steps SET finished_at = ? WHERE id = ?', params);
}
export function updateSignInStepsPendingMethodPendingSecretById(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('UPDATE sign_in_steps SET pending_method = ?, pending_secret = ?, code_hash = NULL, code_expires_at = NULL, attempts = 0 WHERE id = ?', params);
}
export function updateSignInStepsStepPendingMethodById(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('UPDATE sign_in_steps SET step = ?, pending_method = NULL, pending_secret = NULL, code_hash = NULL, code_expires_at = NULL, attempts = 0 WHERE id = ?', params);
}

// upload_pieces
export function getUploadPiecesIdUserIdById<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT id, user_id, size, pieces, sealed, started_at, ended_at FROM upload_pieces WHERE id = ?', params);
}
export function insertUploadPieces(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('INSERT INTO upload_pieces (id, user_id, size, pieces, sealed, started_at) VALUES (?, ?, ?, ?, 0, ?)', params);
}
export function listUploadPiecesIdPiecesByEndedAtStartedAt<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT id, pieces FROM upload_pieces WHERE ended_at IS NULL AND started_at < ?', params);
}
export function updateUploadPiecesEndedAtEndedHowByIdEndedAt(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run("UPDATE upload_pieces SET ended_at = ?, ended_how = 'SWEPT' WHERE id = ? AND ended_at IS NULL", params);
}
export function updateUploadPiecesEndedAtEndedHowByIdEndedAt2(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run("UPDATE upload_pieces SET ended_at = ?, ended_how = 'TAKEN' WHERE id = ? AND ended_at IS NULL", params);
}
export function updateUploadPiecesSealedById(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('UPDATE upload_pieces SET sealed = 1 WHERE id = ?', params);
}

// user_photos
export function deleteUserPhotosByUserId(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('DELETE FROM user_photos WHERE user_id = ?', params);
}
export function getUserPhotosUserIdStorageKeyByUserId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT user_id, storage_key, sniffed_as, byte_size, width, height, source_format, ' +
    'source_bytes, updated_at FROM user_photos WHERE user_id = ?', params);
}
export function insertUserPhotos(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('INSERT INTO user_photos (user_id, storage_key, sniffed_as, byte_size, width, height, ' +
    'source_format, source_bytes, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) ' +
    'ON CONFLICT(user_id) DO UPDATE SET storage_key = excluded.storage_key, ' +
    'sniffed_as = excluded.sniffed_as, byte_size = excluded.byte_size, ' +
    'width = excluded.width, height = excluded.height, ' +
    'source_format = excluded.source_format, source_bytes = excluded.source_bytes, ' +
    'updated_at = excluded.updated_at', params);
}
export function listUserPhotosUserId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT user_id FROM user_photos', params);
}

// users, by ids: the one read that serves every other area's join on users. An area reads its own rows
// with the user's id standing where the joined column stood (`x.recorded_by AS recorder`), then fillUsers puts the
// user's column in its place: same rows, same order, same keys in the same places, NULL where a LEFT JOIN found no one.
export function listUsersDisplayNameByIds<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT id, display_name FROM users WHERE id IN (SELECT value FROM json_each(?))', params);
}
export function listUsersIdDisplayNameRoleEmailByIds<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT id, display_name, role, email, disabled_at FROM users WHERE id IN (SELECT value FROM json_each(?))', params);
}
/** A user's column another area showed by a join: which one each key of a row takes from the user whose id it holds. */
export type UserColumn = 'display_name' | 'role' | 'email' | 'disabled_at';
/**
 * Each key named in `columns` holds a user's id; it is replaced, where it stands, by that user's column (NULL for no id
 * or no such user, as a LEFT JOIN gave). One read for every row. An inner JOIN on a NOT NULL column that refers to
 * users (the database refuses a row without its user) finds a user for every row, so it reads the same way.
 */
export function fillUsers<T extends Row>(db: Db, rows: readonly T[], columns: Readonly<Record<string, UserColumn>>): T[] {
  const keys = Object.keys(columns);
  const ids = new Set<string>();
  for (const r of rows) for (const k of keys) { const v = r[k]; if (typeof v === 'string') ids.add(v); }
  const wide = keys.some((k) => columns[k] !== 'display_name');
  const found = new Map<string, Row>();
  if (ids.size > 0) {
    const read = wide ? listUsersIdDisplayNameRoleEmailByIds : listUsersDisplayNameByIds;
    for (const u of read(db, [JSON.stringify([...ids])])) found.set(String(u.id), u);
  }
  return rows.map((r) => {
    const out: Row = {};
    for (const [k, v] of Object.entries(r)) {
      const col = columns[k];
      out[k] = col === undefined ? v : (typeof v === 'string' ? (found.get(v)?.[col] ?? null) : null);
    }
    return out as T;
  });
}
/** fillUsers for one row (a `get`): undefined stays undefined. */
export function fillUser<T extends Row>(db: Db, row: T | undefined, columns: Readonly<Record<string, UserColumn>>): T | undefined {
  return row === undefined ? undefined : fillUsers(db, [row], columns)[0];
}

// users
export function getUsersCountByBusinessId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT COUNT(*) AS n FROM users WHERE business_id = ?', params);
}
export function getUsersCountByBusinessIdRole<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>("SELECT COUNT(*) AS n FROM users WHERE business_id = ? AND role = 'CLIENT' AND disabled_at IS NULL", params);
}
export function getUsersCountByEmailCanonical<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT COUNT(*) AS n FROM users WHERE email_canonical = ?', params);
}
export function getUsersCountByIdBusinessId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>("SELECT COUNT(*) AS n FROM users WHERE id = ? AND business_id = ? AND role = 'CLIENT' AND disabled_at IS NULL", params);
}
export function getUsersCountByRole<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT COUNT(*) AS n FROM users WHERE role = ?', params);
}
export function getUsersCountByRoleDisabledAt<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT COUNT(*) AS n FROM users WHERE role = ? AND disabled_at IS NULL AND id <> ?', params);
}
export function getUsersDisplayNameById<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT display_name FROM users WHERE id = ?', params);
}
export function getUsersEmailById<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT email FROM users WHERE id = ?', params);
}
export function getUsersEmailDisplayNameById<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT email, display_name FROM users WHERE id = ?', params);
}
export function getUsersEmailRoleById<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT email, role, disabled_at FROM users WHERE id = ?', params);
}
export function getUsersHByIdDisabledAt<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT password_hash AS h FROM users WHERE id = ? AND disabled_at IS NULL', params);
}
export function getUsersIdByEmailCanonical<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT id FROM users WHERE email_canonical = ?', params);
}
export function getUsersIdByEmailCanonicalId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT id FROM users WHERE email_canonical = ? AND id <> ?', params);
}
/** The live website's start check passes the database as it opened it (any object with get), so this one is untyped. */
export function getUsersIdByIdEmailCanonical(db: { get(sql: string, p?: readonly unknown[]): unknown }): unknown {
  return db.get("SELECT id FROM users WHERE id = 'u-demo-readonly' OR email_canonical LIKE '%@example.invalid' LIMIT 1");
}
export function getUsersIdByIdRole<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>("SELECT id FROM users WHERE id = ? AND role <> 'CLIENT' AND disabled_at IS NULL", params);
}
export function getUsersIdByIdRole2<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>("SELECT id FROM users WHERE id = ? AND role = 'SURVEYING' AND disabled_at IS NULL", params);
}
export function getUsersIdEmailByEmailCanonical<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT id, email, display_name, role, disabled_at, business_id, created_at, password_hash ' +
    'FROM users WHERE email_canonical = ?', params);
}
export function getUsersIdEmailById<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT id, email, display_name, role, disabled_at, business_id, created_at FROM users WHERE id = ?', params);
}
export function getUsersIdEmailByIdDisabledAt<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>("SELECT id, email FROM users WHERE id = ? AND disabled_at IS NULL AND role IN ('ADMIN','SALES')", params);
}
export function getUsersMfaMethodById<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT mfa_method FROM users WHERE id = ?', params);
}
export function getUsersMfaMethodMfaSecretById<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT mfa_method, mfa_secret, mfa_last_step, password_hash FROM users WHERE id = ?', params);
}
export function getUsersNById<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT display_name AS n FROM users WHERE id = ?', params);
}
export function getUsersRoleById<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT role FROM users WHERE id = ?', params);
}
export function getUsersRoleByIdDisabledAt<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT role FROM users WHERE id = ? AND disabled_at IS NULL', params);
}
export function getUsersRoleDisabledAtById<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT role, disabled_at FROM users WHERE id = ?', params);
}
export function getUsersRolePasswordTemporaryUntilById<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT role, password_temporary_until, mfa_method, email FROM users WHERE id = ?', params);
}
export function getUsersWelcomeDismissedAtById<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT welcome_dismissed_at FROM users WHERE id = ?', params);
}
export function insertUsers(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('INSERT INTO users (id, email, email_canonical, display_name, role, password_hash, disabled_at, created_at, updated_at, business_id) ' +
    'VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?, ?)', params);
}
export function listUsersIdByRole<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT id FROM users WHERE role = ?', params);
}
export function listUsersIdDisplayNameByRoleADM<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>("SELECT id, display_name FROM users WHERE role IN ('ADMIN','SALES') AND disabled_at IS NULL " +
    'ORDER BY display_name ASC', params);
}
export function listUsersIdDisplayNameByRoleADM2<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>("SELECT id, display_name, role FROM users WHERE role IN ('ADMIN','SALES','ACCOUNTING','SURVEYING') " +
    'AND disabled_at IS NULL ORDER BY display_name ASC', params);
}
export function listUsersIdDisplayNameByRoleDisabledAt<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>("SELECT id, display_name FROM users WHERE role = 'SURVEYING' AND disabled_at IS NULL " +
    'ORDER BY display_name ASC', params);
}
export function listUsersIdDisplayNameByRoleEmailCanonical<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>("SELECT id, display_name FROM users WHERE role = 'CLIENT' AND (lower(display_name) LIKE ? ESCAPE '\\' OR email_canonical LIKE ? ESCAPE '\\') LIMIT 100", params);
}
export function listUsersIdEmail<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT id, email, display_name, role, disabled_at, business_id, created_at ' +
    'FROM users ORDER BY created_at ASC', params);
}
export function listUsersIdEmailByBusinessIdRole<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>("SELECT id, email FROM users WHERE business_id = ? AND role = 'CLIENT' AND disabled_at IS NULL ORDER BY created_at ASC, id ASC", params);
}
export function listUsersIdEmailByRoleBusinessId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>("SELECT id, email FROM users WHERE role = 'CLIENT' AND business_id = ? AND disabled_at IS NULL ORDER BY id", params);
}
export function listUsersIdEmailByRoleDisabledAt<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>("SELECT id, email FROM users WHERE role = 'SALES' AND disabled_at IS NULL ORDER BY id", params);
}
export function listUsersIdMfaSecretByMfaSecret<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>("SELECT id, mfa_secret FROM users WHERE mfa_secret IS NOT NULL", params);
}
export function listUsersIdNameByBusinessIdRole<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>("SELECT id, display_name AS name, email FROM users WHERE business_id = ? AND role = 'CLIENT' AND disabled_at IS NULL ORDER BY created_at ASC, id ASC", params);
}
export function listUsersIdNameByRoleDisabledAt<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>("SELECT id, display_name AS name FROM users WHERE role <> 'CLIENT' AND disabled_at IS NULL ORDER BY display_name", params);
}
export function listUsersIdNameByRoleDisabledAt2<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>("SELECT id, display_name AS name FROM users WHERE role = 'SURVEYING' AND disabled_at IS NULL ORDER BY display_name, id", params);
}
export function listUsersIdRoleByDisabledAt<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT id, role FROM users WHERE disabled_at IS NULL', params);
}
export function updateUsersDisabledAtUpdatedAtById(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('UPDATE users SET disabled_at = ?, updated_at = ? WHERE id = ?', params);
}
export function updateUsersDisplayNameUpdatedAtById(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('UPDATE users SET display_name = ?, updated_at = ? WHERE id = ?', params);
}
export function updateUsersEmailEmailCanonicalById(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('UPDATE users SET email = ?, email_canonical = ?, updated_at = ? WHERE id = ?', params);
}
export function updateUsersMfaLastStepById(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('UPDATE users SET mfa_last_step = ? WHERE id = ?', params);
}
export function updateUsersMfaMethodMfaSecretById(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('UPDATE users SET mfa_method = ?, mfa_secret = ?, mfa_last_step = ?, updated_at = ? WHERE id = ?', params);
}
export function updateUsersMfaMethodMfaSecretById2(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('UPDATE users SET mfa_method = NULL, mfa_secret = NULL, mfa_last_step = NULL, updated_at = ? WHERE id = ?', params);
}
export function updateUsersMfaSecretById(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('UPDATE users SET mfa_secret = ? WHERE id = ?', params);
}
export function updateUsersMfaSecretByIdMfaSecret(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('UPDATE users SET mfa_secret = ? WHERE id = ? AND mfa_secret = ?', params);
}
export function updateUsersPasswordHashPasswordTemporaryUntilById(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('UPDATE users SET password_hash = ?, password_temporary_until = ?, updated_at = ? WHERE id = ?', params);
}
export function updateUsersPasswordHashPasswordTemporaryUntilById2(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('UPDATE users SET password_hash = ?, password_temporary_until = NULL, updated_at = ? WHERE id = ?', params);
}
export function updateUsersPasswordHashUpdatedAtById(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?', params);
}
export function updateUsersPasswordTemporaryUntilById(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('UPDATE users SET password_temporary_until = ? WHERE id = ?', params);
}
export function updateUsersPasswordTemporaryUntilById2(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('UPDATE users SET password_temporary_until = NULL WHERE id = ?', params);
}
export function updateUsersRoleUpdatedAtById(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('UPDATE users SET role = ?, updated_at = ? WHERE id = ?', params);
}
export function updateUsersWelcomeDismissedAtByIdWelcomeDismissedAt(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('UPDATE users SET welcome_dismissed_at = ? WHERE id = ? AND welcome_dismissed_at IS NULL', params);
}

// LOOKUPS IN PLACE OF A JOIN (Phase 161l1): an area that showed a person's name by joining the core's users now reads
// its own rows, then asks here once for the people those rows name. A LEFT JOIN users became a lookup that gives null
// for an id that is null or names nobody, as the join did. One read, by a list of ids, serves every caller.
export function listUsersIdDisplayNameByIds<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT id, display_name, email, role, disabled_at FROM users WHERE id IN (SELECT value FROM json_each(?))', params);
}

/** What the lookup gives for one person. */
export interface PersonFacts { id: string; display_name: string | null; email: string | null; role: string | null; disabled_at: string | null }

/** The people the given ids name, by id. Null, empty and repeated ids are skipped; an id that names nobody is absent. */
export function peopleByIds(db: Db, ids: Iterable<unknown>): Map<string, PersonFacts> {
  const wanted = [...new Set([...ids].filter((id): id is string => typeof id === 'string' && id !== ''))];
  const found = new Map<string, PersonFacts>();
  if (wanted.length === 0) return found;
  for (const p of listUsersIdDisplayNameByIds<PersonFacts & Row>(db, [JSON.stringify(wanted)])) found.set(p.id, p);
  return found;
}

/** A person's display name by id, null when the id is null or names nobody (what LEFT JOIN users u ... u.display_name gave). */
export function namesByIds(db: Db, ids: Iterable<unknown>): (id: unknown) => string | null {
  const people = peopleByIds(db, ids);
  return (id) => (typeof id === 'string' ? people.get(id)?.display_name ?? null : null);
}
/** The invoice changes recorded against the invoices named (the CRM's invoice history, Phase 161l1). */
export function listAuditLogAtDetailActorIdByInvoiceUpdatedObjectIds<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>("SELECT a.at, a.detail, a.actor_id FROM audit_log a WHERE a.kind = 'INVOICE_UPDATED' " +
    'AND a.object_id IN (SELECT value FROM json_each(?)) ORDER BY a.seq', params);
}
