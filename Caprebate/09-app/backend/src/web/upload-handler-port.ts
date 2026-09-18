/**
 * THE ONE PLACE THIS APPLICATION NAMES THE UPLOAD HANDLER.
 *
 * `04-phase-work/phase3/caprebate-upload-handler.ts` is 945 lines, has 38
 * tests, obeys the twelve-step RECEIPT_CONTRACT order — and until Phase 104
 * NOTHING HAD EVER CALLED IT. Its own header is blunt about what that means:
 * every control on client documents was dormant "in the precise sense that no
 * code path reached any of them".
 *
 * This file is the seam. Everything the web half needs from the handler and
 * from the ingestion module comes through here, so:
 *
 *   · `grep -rn "04-phase-work" src/` returns ONE line, and it is below;
 *   · THE HANDLER IS IMPORTED, NOT COPIED. There is no second implementation
 *     of the contract order in this package and there must never be one;
 *   · if the handler moves, one path changes.
 *
 * NOTHING IS RE-EXPORTED WITH A DIFFERENT NAME OR A WIDER TYPE. A shim that
 * "tidied" the port would be a second specification of it, which is the exact
 * failure the extraction of the engine was done to prevent.
 */

export {
  UPLOAD_LIMITS,
  UploadHandlerError,
  sniffAccepted,
  quarantineKeyFor,
  durableKeyFor,
  retainedTextKeyFor,
  shouldPromoteRawFile,
  issueUploadUrl,
  recordUploadComplete,
  processUpload,
  openTransparency,
  runExtraction,
  writeClaims,
  closeJob,
  runScheduledSweeps,
  deleteDueRawFile,
  CONTRACT_COVERAGE,
  assertContractCovered,
  RECEIPT_CONTRACT,
  INGESTION_BOUNDARY,
  FAIL_CLOSED_SETTINGS,
  receiptPolicyFor,
} from '../../../../04-phase-work/phase3/caprebate-upload-handler.ts';

export type {
  ObjectStore,
  PresignedUpload,
  TextExtractor,
  DocTypeClassifier,
  AuditSink,
  AuditEvent,
  UploadHandlerDeps,
  UploadJob,
  JobState,
  ProcessResult,
  Clock,
  UploadHandlerErrorCode,
} from '../../../../04-phase-work/phase3/caprebate-upload-handler.ts';

export type { DocType } from '../../../../04-phase-work/phase3/caprebate-document-pipeline.ts';
export { DOC_SPECS, HUMAN_READ_ONLY_TYPES } from '../../../../04-phase-work/phase3/caprebate-document-pipeline.ts';

/**
 * CRM 4 of 10. The one deletion clock the Retention Procedure gives a client
 * document, AS THE INGESTION MODULE STATES IT — its period, its trigger and
 * whether it is approved. src/web/documents.ts reads `RET7.approved` here rather
 * than writing "not approved" into a screen, so the day the data protection
 * officer approves it the reading changes with no second edit.
 */
export { RET7 } from '../../../../04-phase-work/phase3/caprebate-client-doc-ingestion.ts';

/**
 * Phase 132, 14 September 2026. The host's backup cycle — NOT SET, a named blank on every deletion — the guard that
 * refuses to restore a deleted record without the data protection officer's approval, and RET-3's clock, AS THE
 * INGESTION MODULE STATES THEM. The deletion log in migration 022 and the retention list read them here and restate none.
 */
export {
  BACKUP_CYCLE, knownBackupCycleDays, assertRestoreApproved, ret3DueAt,
} from '../../../../04-phase-work/phase3/caprebate-client-doc-ingestion.ts';
export type { BackupCycle, BackupCycleState, RestoreApproval, DeletionLogEntryClock } from '../../../../04-phase-work/phase3/caprebate-client-doc-ingestion.ts';

/**
 * Phase 132. The deletion clock itself — and its rule that where two clocks are known the EARLIER governs — as the
 * ingestion module states it, so the RET-7 dates src/web/documents.ts reads can be proved against the one function that
 * would turn them into a date. Nothing in src/ calls it: RET-7 is not approved.
 */
export { deletionDueAt } from '../../../../04-phase-work/phase3/caprebate-client-doc-ingestion.ts';
export type { IngestionSettings, RawFileRecord } from '../../../../04-phase-work/phase3/caprebate-client-doc-ingestion.ts';

/**
 * Phase 129. The legal-form test, the roles that are always a person, and the human-capture rule's role tokens and
 * backstop patterns, AS THE INGESTION MODULE STATES THEM. src/web/conveyancing-strip.ts reads them here and restates none.
 */
export {
  classifyPartyReference, ALWAYS_NATURAL_PERSON_ROLES, ROLE_TOKENS, CAPTURE_NAME_PATTERNS, assertHumanCaptureClean,
} from '../../../../04-phase-work/phase3/caprebate-client-doc-ingestion.ts';
export type { PartyLegalForm, PersonRole } from '../../../../04-phase-work/phase3/caprebate-client-doc-ingestion.ts';
