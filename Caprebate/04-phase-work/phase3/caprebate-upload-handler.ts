/**
 * Caprebate — CLIENT DOCUMENT UPLOAD HANDLER
 * Board item 12929369585. Phase 53, 31 August 2026.
 *
 * WHY THIS FILE EXISTS.
 *
 * `caprebate-client-doc-ingestion.ts` states, as data, the twelve-step call
 * order any upload handler must obey (`RECEIPT_CONTRACT`). Until today nothing
 * called it. Eighty-two tests passed against a module with no consumer, which
 * proves the design is coherent and proves nothing about whether a single
 * client document is protected. Every control on client documents — the
 * receipt strip, the quarantine discharge, the deletion clock, the Article 14
 * transparency record — was DORMANT, in the precise sense that no code path
 * reached any of them.
 *
 * This is the consumer. It is the difference between a specification and a
 * control.
 *
 * WHAT IT GUARANTEES, and these are the two the phase brief names:
 *
 *   G1. NOTHING IS PROMOTED TO DURABLE STORAGE BEFORE THE STRIP HAS RUN.
 *       Enforced three times over, deliberately: by the state machine
 *       (`promoteRawFile` throws unless `strip_completed_at` is set), by the
 *       module's own `assertQuarantineDischarged()` (which refuses an
 *       out-of-order promotion), and by the sweeper that runs on a schedule
 *       whether or not any handler ran correctly. Three because the failure is
 *       silent: promoting first and stripping afterwards leaves the unredacted
 *       file in the retained store and NOTHING ELSE NOTICES.
 *
 *   G2. THE QUARANTINE OBJECT IS DELETED AND THE DELETION IS RECORDED.
 *       In the catch path as well as the success path, so that an upload which
 *       throws during extraction does not leave an unredacted client file
 *       sitting in quarantine. Where the store's delete itself fails, the job
 *       does NOT report success and the QuarantineObject is left undischarged,
 *       so `assertQuarantineDischarged()` breaks something visible within the
 *       TTL. A handler that swallowed a failed delete would be worse than no
 *       handler, because it would look like one.
 *
 * WHAT IT DOES NOT DECIDE.
 *
 * Q34 (raw-file retention), Q40 (the ingestion boundary) and Q51/Q52/Q53 (the
 * WordPress control questions raised by Phase 53 in Developer Brief §3.0) are
 * all OPEN and none is decided here. This handler runs against
 * `FAIL_CLOSED_SETTINGS` by default and against the `ObjectStore` PORT rather
 * than any concrete store, precisely so that answering them is a configuration
 * change and an adapter, not a rewrite.
 *
 * The one thing this file decides for itself is `PROMOTION_RULE`, and it is
 * marked `is_a_decision: false` in the same idiom `INGESTION_BOUNDARY` uses,
 * for the same reason: a reader who needs to know whether a human chose it
 * reads the field rather than inferring it from the code.
 *
 * WHY A PORT AND NOT S3.
 *
 * The Developer Brief's §3 table said S3 with pre-signed URLs. On 29 August
 * Lakhbir decided the CRM is a custom WordPress back end, which has no object
 * store at all — `wp-content/uploads/` sits inside the webroot and is served
 * with no authorisation check. Whether client documents may live there is Q51
 * and it is not answered. So this handler takes five methods and does not care
 * which of the three architectures is behind them. Writing it against a
 * concrete store today would have to be undone.
 *
 * Runs on Node >= 22.6 with type stripping (`node file.ts`). No enums, no
 * decorators, no runtime-typed syntax — same constraints as the rest of phase3.
 */

import {
  DOC_SPECS, HUMAN_READ_ONLY_TYPES, segment, extract, captureHumanRead, toClaims,
  type DocType, type Segment, type ModelFn, type EgressEntry,
  type ExtractionResult, type HumanCaptureInput, type HumanCaptureResult,
} from './caprebate-document-pipeline.ts';
import {
  INGESTION_BOUNDARY, QUARANTINE_TTL_MINUTES, RECEIPT_CONTRACT,
  assertQuarantineKey, quarantineDischargeDueAt, recordQuarantineDischarge,
  assertQuarantineDischarged, sweepQuarantine,
  applyReceiptPolicy, receiptPolicyFor,
  assertClaimsWritable, openTransparencyRecord, assertTransparencyRecordComplete,
  rawFileRecordFromReceipt, deletionDueAt, recordDeletion, sweepForDeletion,
  assertNoOverdueUndeleted, assertRetentionRuleImplementable,
  FAIL_CLOSED_SETTINGS, ClientDocIngestionError,
  type QuarantineObject, type ReceiptResult, type RawFileRecord,
  type IngestionSettings, type TransparencyRecord, type ClientDocDiscriminants,
  type IdentifiedPerson,
} from './caprebate-client-doc-ingestion.ts';

/* ------------------------------------------------------------------ *
 * 0. Errors
 * ------------------------------------------------------------------ */

export type UploadHandlerErrorCode =
  /** A durable write of the FILE was attempted with no strip recorded. G1. */
  | 'E_PROMOTE_BEFORE_STRIP'
  /** The quarantine object could not be deleted. The job fails; the sweeper takes over. G2. */
  | 'E_DISCHARGE_FAILED'
  /** The uploaded document's type is not one this system handles. */
  | 'E_UNRECOGNISED_DOC_TYPE'
  /** A step was called out of the order RECEIPT_CONTRACT states. */
  | 'E_CONTRACT_ORDER'
  /** A HUMAN_READ_ONLY type reached the model path, or a model type reached human capture. */
  | 'E_WRONG_CAPTURE_ROUTE'
  /** The upload exceeded a limit, or its declared type and its bytes disagree. */
  | 'E_UPLOAD_REJECTED'
  /** The job was asked for a result it does not have because an earlier step failed. */
  | 'E_JOB_NOT_COMPLETE';

export class UploadHandlerError extends Error {
  code: UploadHandlerErrorCode;
  detail: Record<string, unknown>;
  constructor(code: UploadHandlerErrorCode, message: string, detail: Record<string, unknown> = {}) {
    super(`[${code}] ${message}`);
    this.name = 'UploadHandlerError';
    this.code = code;
    this.detail = detail;
  }
}

/* ------------------------------------------------------------------ *
 * 1. THE PORTS
 *
 * Five methods, and `delete` is the one that matters. A store that cannot
 * evidence a deletion cannot host the quarantine prefix, and that is a
 * procurement fact rather than an implementation detail — see Developer Brief
 * §3.0 Q52 on managed hosting that snapshots the whole site on a schedule the
 * tenant does not control.
 * ------------------------------------------------------------------ */

export type PresignedUpload = {
  /** The opaque URL handed to the browser. Never logged — it is a bearer capability. */
  url: string;
  /** The key it is scoped to. ALWAYS under the quarantine prefix; asserted before issue. */
  key: string;
  expires_at: string;
};

export interface ObjectStore {
  /**
   * Issue a write capability scoped to exactly ONE key, expiring at or before
   * `expires_at`. The implementation MUST NOT widen the scope to a prefix: a
   * URL that can write anywhere under `quarantine/` lets one client overwrite
   * another's document.
   */
  presignPut(key: string, expires_at: string): Promise<PresignedUpload>;
  /** Read the object back, server-side, for text extraction. */
  get(key: string): Promise<Uint8Array>;
  /** Server-side copy. Used only to promote a raw file from quarantine to durable. */
  copy(from_key: string, to_key: string): Promise<void>;
  /**
   * Delete, permanently. MUST throw rather than resolve where the object may
   * survive — in a backup, in a versioned bucket's previous version, in a
   * recycle bin. `recordQuarantineDischarge` writes evidence that this
   * happened, and evidence of a deletion that did not happen is worse than no
   * evidence at all.
   */
  delete(key: string): Promise<void>;
  /** Write a small object (the retained text). Not for client files. */
  putText(key: string, body: string): Promise<void>;
}

/** Text extraction — OCR, PDF parse, whatever. Out of scope here; a port. */
export interface TextExtractor {
  toPages(bytes: Uint8Array): Promise<readonly { page: number; lines: readonly string[] }[]>;
}

/** Classifies the uploaded bytes. May return null; null is refused, never guessed. */
export interface DocTypeClassifier {
  classify(bytes: Uint8Array, declared: DocType | null): Promise<DocType | null>;
}

export type Clock = () => string;

/**
 * Every step writes here. Under the WordPress decision this sink is open
 * question Q53 (Developer Brief §3.0 C3): a log in the WordPress database is
 * editable by every Administrator, including the log of their own actions. The
 * port exists so that answering Q53 is an adapter, not a retrofit.
 */
export interface AuditSink {
  write(e: AuditEvent): Promise<void>;
}

export type AuditEvent = {
  at: string;
  job_id: string;
  doc_id: string;
  /** The RECEIPT_CONTRACT step this event discharges, or 0 for handler-level events. */
  contract_step: number;
  action: string;
  outcome: 'ok' | 'refused' | 'failed';
  /** Never the document's content, never a name, never the pre-signed URL. */
  detail: Record<string, unknown>;
};

export type UploadHandlerDeps = {
  store: ObjectStore;
  extractor: TextExtractor;
  classifier: DocTypeClassifier;
  audit: AuditSink;
  now: Clock;
  /** Who or what is performing the run. Recorded in every deletion's evidence. */
  actor: string;
  settings?: IngestionSettings;
};

/* ------------------------------------------------------------------ *
 * 2. LIMITS, AND WHY THEY ARE HERE RATHER THAN IN THE WEB LAYER
 *
 * A file-type allow-list enforced in the browser is not a control; a caller
 * holding a pre-signed URL never runs the browser's code. These are checked
 * server-side, after the write, before anything else happens to the object —
 * which is the only place they CAN be checked under a pre-signed-URL boundary.
 * ------------------------------------------------------------------ */

export const UPLOAD_LIMITS = {
  max_bytes: 50 * 1024 * 1024,
  /** Magic-number prefixes, because a `.pdf` extension is a claim, not a fact. */
  accepted_magic: [
    { label: 'pdf', bytes: [0x25, 0x50, 0x44, 0x46] },            // %PDF
    { label: 'png', bytes: [0x89, 0x50, 0x4e, 0x47] },
    { label: 'jpeg', bytes: [0xff, 0xd8, 0xff] },
    { label: 'zip-or-ooxml', bytes: [0x50, 0x4b, 0x03, 0x04] },   // docx / xlsx
  ],
} as const;

/**
 * PHASE 157d, 6 OCTOBER 2026 (the Friary House run, finding F19): A PDF THAT STOPS PART-WAY IS REFUSED AS DAMAGED.
 * Every complete PDF ends with an end-of-file marker, `%%EOF`, in its last few hundred bytes (a later saved edit adds
 * another, later on). One cut off in the middle of sending, or truncated by the program that made it, has none: it
 * passes the `%PDF` check above and then reads as nothing. The marker is looked for in the last 1,024 bytes, which
 * allows for the trailing spaces and line ends some programs add after it. Only a PDF is checked; the other formats
 * have no such marker.
 */
export const PDF_EOF_WINDOW = 1024;
export function pdfLooksComplete(bytes: Uint8Array): boolean {
  const from = Math.max(0, bytes.length - PDF_EOF_WINDOW);
  const tail = Buffer.from(bytes.buffer, bytes.byteOffset + from, bytes.length - from).toString('latin1');
  return tail.includes('%%EOF');
}

export function sniffAccepted(bytes: Uint8Array): string | null {
  for (const m of UPLOAD_LIMITS.accepted_magic) {
    if (bytes.length < m.bytes.length) continue;
    let ok = true;
    for (let i = 0; i < m.bytes.length; i++) {
      if (bytes[i] !== m.bytes[i]) { ok = false; break; }
    }
    if (ok) return m.label;
  }
  return null;
}

/* ------------------------------------------------------------------ *
 * 3. PROMOTION_RULE — the one thing this file decides, marked as such
 *
 * RECEIPT_CONTRACT step 6 says "where the raw file is retained at all (Q34),
 * promote to the durable prefix". Q34 is open, so "at all" needs a reading,
 * and the reading has to be written down rather than left inside an `if`.
 *
 * The rule: promote the raw file ONLY where the retention rule keeps it past
 * the moment extraction completes. Under FAIL_CLOSED_SETTINGS
 * (DELETE_ON_EXTRACTION_COMPLETE, grace 0) the raw file therefore NEVER
 * REACHES DURABLE STORAGE AT ALL — it lives in quarantine, is extracted from,
 * and is deleted. That is strictly less exposure than promoting it and then
 * deleting it, and it is the fail-closed reading of an open question.
 *
 * It is NOT a decision. If Lakhbir answers Q34 with RETAIN_FOR_DEFENCE_PERIOD,
 * or with a non-zero grace period, promotion switches on with no code change.
 *
 * PHASE 65, 2 SEPTEMBER 2026 — Q34's retention limb was answered that way, and
 * switching promotion on found a gap between this rule and its implementation.
 * The rule is stated per RETENTION RULE; the retention clock is per DOCUMENT.
 * deletionDueAt refuses the long clock to a document whose strip removed
 * NO_LAWFUL_BASIS content (condition A14-D4) and falls it back to the extraction
 * clock — so for that document the retention rule does NOT outlive extraction,
 * and promoting it writes exactly the content A14-D4 says must not be held into
 * the durable prefix, to be deleted from it moments later. That is not a new
 * rule: it is this rule, applied to the record instead of to the settings.
 * shouldPromoteRawFile now takes the record and says so. Test G1c.
 * ------------------------------------------------------------------ */

export const PROMOTION_RULE = {
  recorded_on: '2026-08-31',
  board_item: '12929369585',
  rule: 'promote the raw file only where the retention rule outlives the completion of extraction',
  is_a_decision: false,
  decision_ref: 'Q34 (raw-file retention) — UNANSWERED as at 2026-08-31',
  under_fail_closed_settings: 'the raw file never reaches the durable prefix',
  /** Phase 65. Per-document, because the clock is per-document. */
  d4_carve_out:
    'a document whose receipt strip removed NO_LAWFUL_BASIS content is NOT promoted even under the long ' +
    'rule, because deletionDueAt gives that document the extraction clock and the rule above promotes ' +
    'only what outlives extraction',
} as const;

/**
 * Whether the raw file is promoted out of quarantine into durable storage.
 *
 * The record is optional so that the settings-only question — "does this
 * configuration promote at all?" — is still askable, which is what the
 * specification tests do. Where a record IS supplied, the answer is about that
 * document: an A14-D4-affected one is never promoted, because its clock is the
 * extraction clock however the rule is configured.
 */
export function shouldPromoteRawFile(settings: IngestionSettings, rec?: RawFileRecord): boolean {
  assertRetentionRuleImplementable(settings.raw_file_retention);
  if (rec?.no_basis_content_in_original) return settings.grace_days_after_extraction > 0;
  if (settings.raw_file_retention === 'RETAIN_FOR_DEFENCE_PERIOD') return true;
  return settings.grace_days_after_extraction > 0;
}

/* ------------------------------------------------------------------ *
 * 4. KEYS
 * ------------------------------------------------------------------ */

export function quarantineKeyFor(doc_id: string): string {
  return `${INGESTION_BOUNDARY.quarantine_prefix}${doc_id}`;
}
export function durableKeyFor(doc_id: string): string {
  return `${INGESTION_BOUNDARY.durable_prefix}${doc_id}`;
}
export function retainedTextKeyFor(doc_id: string): string {
  return `${INGESTION_BOUNDARY.durable_prefix}${doc_id}.retained.json`;
}

/* ------------------------------------------------------------------ *
 * 5. THE JOB
 *
 * One upload, one job, one record of what happened to it. The states are
 * ordered and the order is RECEIPT_CONTRACT's; `assertState` refuses a step
 * called out of order rather than letting it half-work.
 * ------------------------------------------------------------------ */

export type JobState =
  | 'ISSUED'      // step 1 — a capability exists, nothing is written
  | 'RECEIVED'    // step 2 — the browser wrote to quarantine
  | 'CLASSIFIED'  // step 3
  | 'SEGMENTED'   // step 4
  | 'STRIPPED'    // step 5 — and ONLY from here may the file be promoted
  | 'WRITTEN'     // step 6
  | 'DISCHARGED'  // step 7 — the unredacted file is gone, with evidence
  | 'TRIAGED'     // step 8
  | 'EXTRACTED'   // step 9
  | 'CLAIMED'     // step 10
  | 'COMPLETE'    // step 11
  | 'FAILED';

const STATE_ORDER: readonly JobState[] = [
  'ISSUED', 'RECEIVED', 'CLASSIFIED', 'SEGMENTED', 'STRIPPED',
  'WRITTEN', 'DISCHARGED', 'TRIAGED', 'EXTRACTED', 'CLAIMED', 'COMPLETE',
];

export type UploadJob = {
  job_id: string;
  doc_id: string;
  entity_id: string;
  state: JobState;
  quarantine: QuarantineObject;
  declared_type: DocType | null;
  doc_type?: DocType;
  segments?: Segment[];
  receipt?: ReceiptResult;
  raw_file?: RawFileRecord;
  transparency?: TransparencyRecord;
  extraction?: ExtractionResult | HumanCaptureResult;
  claims?: readonly { field_id: string; source_id?: string }[];
  /** Set where the job failed. The quarantine is still discharged; see G2. */
  failure?: { code: string; message: string };
};

function assertState(job: UploadJob, expected: JobState, step: number): void {
  if (job.state !== expected) {
    throw new UploadHandlerError(
      'E_CONTRACT_ORDER',
      `step ${step} was called with the job in state '${job.state}', not '${expected}'. ` +
        'RECEIPT_CONTRACT states an ORDER, and the order IS the control — see ' +
        'assertQuarantineDischarged, which refuses a promotion that happened before the strip.',
      { job_id: job.job_id, doc_id: job.doc_id, state: job.state, expected, step },
    );
  }
}

function advance(job: UploadJob, to: JobState): void {
  const from = STATE_ORDER.indexOf(job.state);
  const next = STATE_ORDER.indexOf(to);
  if (from < 0 || next !== from + 1) {
    throw new UploadHandlerError('E_CONTRACT_ORDER', `illegal transition ${job.state} -> ${to}`, {
      job_id: job.job_id, from: job.state, to,
    });
  }
  job.state = to;
}

/* ------------------------------------------------------------------ *
 * 6. STEP 1 — issue the pre-signed URL
 *
 * `assertQuarantineKey` runs BEFORE the URL is minted, which is the only
 * moment at which it can do anything. Its own comment calls it "the single
 * most load-bearing line in the model": a URL signed for a durable key writes
 * the unredacted file straight into the retained store, and no assertion
 * downstream notices, because there is no quarantine object to sweep.
 * ------------------------------------------------------------------ */

export async function issueUploadUrl(
  deps: UploadHandlerDeps,
  args: { job_id: string; doc_id: string; entity_id: string; declared_type: DocType | null },
): Promise<{ job: UploadJob; upload: PresignedUpload }> {
  const at = deps.now();
  const key = quarantineKeyFor(args.doc_id);

  assertQuarantineKey(key);

  const expires_at = new Date(new Date(at).getTime() + QUARANTINE_TTL_MINUTES * 60_000).toISOString();
  const upload = await deps.store.presignPut(key, expires_at);

  if (upload.key !== key) {
    throw new UploadHandlerError(
      'E_UPLOAD_REJECTED',
      `the store signed key '${upload.key}', not the key it was asked for. A store that widens ` +
        'the scope of a write capability defeats the quarantine boundary before it starts.',
      { asked: key, signed: upload.key },
    );
  }
  assertQuarantineKey(upload.key);

  const job: UploadJob = {
    job_id: args.job_id,
    doc_id: args.doc_id,
    entity_id: args.entity_id,
    state: 'ISSUED',
    declared_type: args.declared_type,
    // written_at is provisional until the browser actually writes; step 2 sets
    // the real one. The clock that matters starts at the write, not here.
    quarantine: { doc_id: args.doc_id, key, written_at: at },
  };

  await deps.audit.write({
    at, job_id: job.job_id, doc_id: job.doc_id, contract_step: 1,
    action: 'presign_quarantine_put', outcome: 'ok',
    detail: { key, expires_at, ttl_minutes: QUARANTINE_TTL_MINUTES },
  });

  return { job, upload };
}

/* ------------------------------------------------------------------ *
 * 7. STEP 2 — the browser has written. THE FILE IS NOW REAL AND UNREDACTED.
 *
 * RECEIPT_CONTRACT step 2 says so in terms: "THIS IS A REAL WRITE TO REAL
 * STORAGE and the file is unredacted at this point. What bounds it is the TTL
 * and step 7, not the physics."
 * ------------------------------------------------------------------ */

export async function recordUploadComplete(
  deps: UploadHandlerDeps,
  job: UploadJob,
  written_at: string,
): Promise<UploadJob> {
  assertState(job, 'ISSUED', 2);
  job.quarantine = { ...job.quarantine, written_at };
  advance(job, 'RECEIVED');

  await deps.audit.write({
    at: deps.now(), job_id: job.job_id, doc_id: job.doc_id, contract_step: 2,
    action: 'quarantine_write_observed', outcome: 'ok',
    detail: {
      key: job.quarantine.key, written_at,
      discharge_due_at: quarantineDischargeDueAt(job.quarantine),
    },
  });
  return job;
}

/* ------------------------------------------------------------------ *
 * 8. STEPS 3–7 — the part that must not be reordered, and must not leak
 *
 * This is the whole of G1 and G2. It runs classify -> segment -> strip ->
 * write -> discharge, and the discharge also runs on the catch path so that a
 * throw anywhere above it still deletes the unredacted file.
 * ------------------------------------------------------------------ */

export type ProcessResult = {
  job: UploadJob;
  /** True only where the quarantine object is gone AND the deletion is evidenced. */
  discharged: boolean;
};

export async function processUpload(deps: UploadHandlerDeps, job: UploadJob): Promise<ProcessResult> {
  assertState(job, 'RECEIVED', 3);
  const settings = deps.settings ?? FAIL_CLOSED_SETTINGS;
  let dischargeReason = 'strip complete';

  try {
    const bytes = await deps.store.get(job.quarantine.key);

    // --- limits, server-side, on the bytes that actually landed -------------
    if (bytes.length > UPLOAD_LIMITS.max_bytes) {
      throw new UploadHandlerError('E_UPLOAD_REJECTED',
        `upload is ${bytes.length} bytes, over the ${UPLOAD_LIMITS.max_bytes}-byte limit`,
        { doc_id: job.doc_id, bytes: bytes.length });
    }
    const sniffed = sniffAccepted(bytes);
    if (sniffed === null) {
      dischargeReason = 'rejected format — refused before classification';
      throw new UploadHandlerError('E_UPLOAD_REJECTED',
        'the uploaded bytes are not one of the accepted formats. The declared extension is a ' +
          'claim; this is the check. A file the web server would execute must never reach a ' +
          'directory it serves — see Developer Brief §11 and §3.0 control C1.',
        { doc_id: job.doc_id });
    }

    // --- step 3: classify. Unrecognised is REFUSED, never guessed -----------
    const doc_type = await deps.classifier.classify(bytes, job.declared_type);
    if (doc_type === null || !isHandledType(doc_type)) {
      dischargeReason = 'unrecognised document type — refused at classification';
      throw new UploadHandlerError('E_UNRECOGNISED_DOC_TYPE',
        `no handled document type for this upload (declared '${String(job.declared_type)}'). ` +
          'RECEIPT_CONTRACT step 3: the quarantine object is DELETED, not promoted. An upload ' +
          'nobody can classify is an upload nobody can strip.',
        { doc_id: job.doc_id, declared: job.declared_type });
    }
    job.doc_type = doc_type;
    advance(job, 'CLASSIFIED');
    await deps.audit.write({
      at: deps.now(), job_id: job.job_id, doc_id: job.doc_id, contract_step: 3,
      action: 'classify', outcome: 'ok', detail: { doc_type, sniffed },
    });

    // --- step 4: segment ----------------------------------------------------
    const pages = await deps.extractor.toPages(bytes);
    job.segments = segment(pages);
    advance(job, 'SEGMENTED');
    await deps.audit.write({
      at: deps.now(), job_id: job.job_id, doc_id: job.doc_id, contract_step: 4,
      action: 'segment', outcome: 'ok',
      detail: { pages: pages.length, segments: job.segments.length },
    });

    // --- step 5: THE STRIP --------------------------------------------------
    const receipt = applyReceiptPolicy(job.doc_id, doc_type, job.segments);
    job.receipt = receipt;
    job.quarantine = { ...job.quarantine, strip_completed_at: deps.now() };
    advance(job, 'STRIPPED');
    await deps.audit.write({
      at: deps.now(), job_id: job.job_id, doc_id: job.doc_id, contract_step: 5,
      action: 'apply_receipt_policy', outcome: 'ok',
      // Kinds and reasons only. The removal log never carries the text — the
      // module's own comment on ReceiptResult.removed makes the same point:
      // a removal log that quoted the content would recreate the exposure it
      // exists to record.
      detail: {
        mode: receipt.mode, retained: receipt.retained.length,
        removed: receipt.removed.map((r) => ({ kind: r.kind, reason: r.reason })),
      },
    });

    // --- step 6: write ONLY the retained text; promote the FILE only where
    //     the retention rule outlives extraction (PROMOTION_RULE) ------------
    await deps.store.putText(retainedTextKeyFor(job.doc_id), JSON.stringify(receipt.retained));

    job.raw_file = rawFileRecordFromReceipt(receipt, job.quarantine.written_at);

    const promote = shouldPromoteRawFile(settings, job.raw_file);
    if (promote) job.quarantine = await promoteRawFile(deps, job);

    advance(job, 'WRITTEN');
    await deps.audit.write({
      at: deps.now(), job_id: job.job_id, doc_id: job.doc_id, contract_step: 6,
      action: 'write_retained', outcome: 'ok',
      detail: {
        retained_key: retainedTextKeyFor(job.doc_id),
        raw_file_promoted: promote,
        promotion_rule: PROMOTION_RULE.rule,
        retention_rule: settings.raw_file_retention,
        no_basis_content_in_original: job.raw_file.no_basis_content_in_original,
      },
    });

    // --- step 7 -------------------------------------------------------------
    const discharged = await dischargeQuarantine(deps, job, dischargeReason);
    return { job, discharged };
  } catch (err) {
    job.failure = {
      code: (err as { code?: string }).code ?? 'E_UNKNOWN',
      message: (err as Error).message,
    };
    // G2 on the failure path. The unredacted file goes whether or not the job
    // succeeded — a failed extraction is not a reason to keep it. A discharge
    // that itself fails is swallowed HERE and only here, because the original
    // error is the more useful one to propagate; the object is left
    // undischarged and the scheduled sweep raises it within the TTL.
    let discharged = false;
    try { discharged = await dischargeQuarantine(deps, job, dischargeReason); } catch { discharged = false; }
    job.state = 'FAILED';
    await deps.audit.write({
      at: deps.now(), job_id: job.job_id, doc_id: job.doc_id, contract_step: 0,
      action: 'process_upload', outcome: 'failed',
      detail: { code: job.failure.code, discharged },
    });
    throw err;
  }
}

function isHandledType(t: DocType): boolean {
  return HUMAN_READ_ONLY_TYPES.includes(t) || DOC_SPECS.some((s) => s.doc_type === t);
}

/**
 * G1, first of three enforcements. Promotion is the only durable write of the
 * FILE, and it is refused unless the strip is recorded on the quarantine
 * object itself — not on a flag a caller passed in, which is the shape that
 * fails open the moment somebody forgets.
 */
async function promoteRawFile(deps: UploadHandlerDeps, job: UploadJob): Promise<QuarantineObject> {
  if (!job.quarantine.strip_completed_at) {
    throw new UploadHandlerError('E_PROMOTE_BEFORE_STRIP',
      'the raw file was about to be promoted to the durable prefix with no strip recorded. ' +
        'This is the defect at board item 12928214881 arriving from the other direction: the ' +
        'ORDER is the control, and a quarantine step performed in the wrong order is ' +
        'DIRECT_TO_DURABLE with an extra copy.',
      { doc_id: job.doc_id, key: job.quarantine.key });
  }
  await deps.store.copy(job.quarantine.key, durableKeyFor(job.doc_id));
  const q: QuarantineObject = { ...job.quarantine, durable_written_at: deps.now() };
  // G1, second enforcement: the module's own sweep, run on this one object
  // before we go any further. If the ordering is wrong this throws here rather
  // than on a schedule tomorrow. `deleted_at` is supplied only so the sweep
  // classifies it as discharged and evaluates the out-of-order test; the real
  // discharge follows at step 7 and writes the evidence.
  assertQuarantineDischarged([{ ...q, deleted_at: q.durable_written_at }], deps.now());
  return q;
}

/**
 * G2. Delete, THEN record, in that order — a record written before the delete
 * would assert something not yet true, and if the delete then failed the
 * record would be a lie about the one fact this whole model rests on.
 *
 * Throws on the success path where the delete fails, because a job that
 * reports success while an unredacted client document is still held is the
 * worst outcome available: it looks like the control worked.
 */
async function dischargeQuarantine(deps: UploadHandlerDeps, job: UploadJob, reason: string): Promise<boolean> {
  if (job.quarantine.deleted_at) return true;

  try {
    await deps.store.delete(job.quarantine.key);
  } catch (e) {
    await deps.audit.write({
      at: deps.now(), job_id: job.job_id, doc_id: job.doc_id, contract_step: 7,
      action: 'quarantine_discharge', outcome: 'failed',
      detail: {
        key: job.quarantine.key, error: (e as Error).message,
        consequence: 'the object is undischarged; assertQuarantineDischarged() breaks within the TTL',
      },
    });
    throw new UploadHandlerError('E_DISCHARGE_FAILED',
      `the quarantine object '${job.quarantine.key}' could not be deleted. The job does NOT ` +
        'report success: an unredacted client document is still held. It is deliberately left ' +
        'undischarged so that the scheduled assertQuarantineDischarged() raises ' +
        'E_QUARANTINE_UNDISCHARGED within the TTL rather than nobody noticing.',
      { doc_id: job.doc_id, key: job.quarantine.key, cause: (e as Error).message });
  }

  const at = deps.now();
  job.quarantine = recordQuarantineDischarge(job.quarantine, at, {
    deleted_by: deps.actor,
    method: `ObjectStore.delete('${job.quarantine.key}') — ${reason}`,
  });
  if (job.state === 'WRITTEN') advance(job, 'DISCHARGED');

  await deps.audit.write({
    at, job_id: job.job_id, doc_id: job.doc_id, contract_step: 7,
    action: 'quarantine_discharge', outcome: 'ok',
    detail: {
      key: job.quarantine.key, deleted_by: deps.actor, reason,
      held_for_ms: new Date(at).getTime() - new Date(job.quarantine.written_at).getTime(),
    },
  });
  return true;
}

/* ------------------------------------------------------------------ *
 * 9. STEP 8 — the transparency record
 *
 * Opened at the moment the document was OBTAINED, which is the quarantine
 * write, not the moment somebody got round to triaging it. Article 14(3)(a)
 * runs from there, and `openTransparencyRecord` takes the date for exactly
 * that reason.
 * ------------------------------------------------------------------ */

export async function openTransparency(
  deps: UploadHandlerDeps,
  job: UploadJob,
  people: readonly IdentifiedPerson[],
): Promise<UploadJob> {
  assertState(job, 'DISCHARGED', 8);
  if (!job.doc_type) {
    throw new UploadHandlerError('E_JOB_NOT_COMPLETE', 'no doc_type on the job', { job_id: job.job_id });
  }

  const rec = openTransparencyRecord(job.doc_id, job.doc_type, job.quarantine.written_at);
  rec.people = [...people];
  rec.triaged_at = deps.now();
  job.transparency = rec;
  advance(job, 'TRIAGED');

  await deps.audit.write({
    at: deps.now(), job_id: job.job_id, doc_id: job.doc_id, contract_step: 8,
    action: 'open_transparency_record', outcome: 'ok',
    // person_ref values only — they are opaque by construction, and
    // assertTransparencyRecordComplete refuses one that looks like a name.
    detail: {
      received_at: rec.received_at,
      people: rec.people.map((p) => ({ ref: p.person_ref, role: p.role, route: p.route_group })),
    },
  });
  return job;
}

/* ------------------------------------------------------------------ *
 * 10. STEP 9 — extract() or captureHumanRead(), as the type requires
 * ------------------------------------------------------------------ */

export async function runExtraction(
  deps: UploadHandlerDeps,
  job: UploadJob,
  route:
    | { kind: 'MODEL'; model: ModelFn; egress: EgressEntry[] }
    | { kind: 'HUMAN'; inputs: readonly HumanCaptureInput[]; captured_by: string },
): Promise<UploadJob> {
  assertState(job, 'TRIAGED', 9);
  const t = job.doc_type;
  if (!t || !job.receipt) {
    throw new UploadHandlerError('E_JOB_NOT_COMPLETE', 'no receipt on the job', { job_id: job.job_id });
  }

  const humanOnly = HUMAN_READ_ONLY_TYPES.includes(t);
  if (humanOnly && route.kind !== 'HUMAN') {
    throw new UploadHandlerError('E_WRONG_CAPTURE_ROUTE',
      `'${t}' is HUMAN_READ_ONLY — it is gated on the pipeline DPIA and has no model spec. ` +
        'specFor() would refuse it; refusing here as well keeps the reason legible at the ' +
        'point a developer is looking.',
      { doc_id: job.doc_id, doc_type: t });
  }
  if (!humanOnly && route.kind !== 'MODEL') {
    throw new UploadHandlerError('E_WRONG_CAPTURE_ROUTE',
      `'${t}' has a model spec — human capture is not the route for it, and captureHumanRead() ` +
        'would refuse it. Two routes with two different name controls is the split that produced ' +
        'the Phase 41 work; do not reintroduce it here.',
      { doc_id: job.doc_id, doc_type: t });
  }

  const at = deps.now();
  if (route.kind === 'MODEL') {
    // ONLY the retained segments reach extraction. The removed ones are still
    // in the file at this instant and must not travel forward as text.
    job.extraction = extract(job.doc_id, t, job.receipt.retained, route.model, { at, egress: route.egress });
  } else {
    job.extraction = captureHumanRead(job.doc_id, t, route.inputs, route.captured_by, at);
  }
  job.raw_file = { ...(job.raw_file as RawFileRecord), extraction_completed_at: at };
  advance(job, 'EXTRACTED');

  await deps.audit.write({
    at, job_id: job.job_id, doc_id: job.doc_id, contract_step: 9,
    action: route.kind === 'MODEL' ? 'extract' : 'capture_human_read', outcome: 'ok',
    detail: { fields: job.extraction.fields.length, not_found: job.extraction.not_found.length },
  });
  return job;
}

/* ------------------------------------------------------------------ *
 * 11. STEP 10 — assertClaimsWritable BEFORE the claims are written
 *
 * The order in the contract is not decorative. `assertClaimsWritable` throws
 * NameExclusionError for an unauthorised or uncatalogued field; calling it
 * after the write turns a refusal into an incident.
 * ------------------------------------------------------------------ */

export async function writeClaims(
  deps: UploadHandlerDeps,
  job: UploadJob,
  discriminants: ClientDocDiscriminants,
  write: (claims: readonly unknown[]) => Promise<void>,
): Promise<UploadJob> {
  assertState(job, 'EXTRACTED', 10);
  if (!job.extraction) {
    throw new UploadHandlerError('E_JOB_NOT_COMPLETE', 'no extraction on the job', { job_id: job.job_id });
  }

  const asExtraction: ExtractionResult = 'review' in job.extraction
    ? (job.extraction as ExtractionResult)
    : {
        doc_id: job.extraction.doc_id,
        doc_type: job.extraction.doc_type,
        fields: job.extraction.fields,
        review: [],
        dropped: [],
        not_found: job.extraction.not_found,
      };
  const claims = toClaims(job.entity_id, asExtraction, deps.now());

  // THROWS BEFORE THE WRITE. That is the whole point of this function.
  assertClaimsWritable(claims, discriminants);

  await write(claims);
  job.claims = claims;
  advance(job, 'CLAIMED');

  await deps.audit.write({
    at: deps.now(), job_id: job.job_id, doc_id: job.doc_id, contract_step: 10,
    action: 'write_claims', outcome: 'ok',
    detail: { count: claims.length, fields: claims.map((c) => c.field_id) },
  });
  return job;
}

/* ------------------------------------------------------------------ *
 * 12. STEP 11 — the Article 14(3)(a) month, and STEP 12 — the schedules
 *
 * Neither belongs to a single upload, which is why they are separate exports
 * rather than the tail of processUpload(). Both are jobs that run whether or
 * not any handler ran correctly, and that is the point: the assertions are the
 * BACKSTOP for the handler, not a summary of it.
 * ------------------------------------------------------------------ */

export function closeJob(job: UploadJob): UploadJob {
  assertState(job, 'CLAIMED', 11);
  if (!job.transparency) {
    throw new UploadHandlerError('E_JOB_NOT_COMPLETE', 'no transparency record on the job', { job_id: job.job_id });
  }
  assertTransparencyRecordComplete(job.transparency);
  advance(job, 'COMPLETE');
  return job;
}

export type ScheduledSweepResult = {
  at: string;
  quarantine_ok: boolean;
  retention_ok: boolean;
  errors: { control: 'QUARANTINE' | 'RETENTION'; code: string; message: string }[];
  quarantine: ReturnType<typeof sweepQuarantine>;
  retention: ReturnType<typeof sweepForDeletion>;
};

/**
 * STEP 12, and G1's third enforcement. Run this on a schedule from the
 * beginning — before the first client uploads anything, so that a failure is
 * a build failure rather than a discovery. Both assertions are caught and
 * reported rather than allowed to escape, because a sweeper that dies on the
 * first bad object never inspects the second.
 */
export function runScheduledSweeps(
  quarantine_objects: readonly QuarantineObject[],
  raw_files: readonly RawFileRecord[],
  now: string,
  settings: IngestionSettings = FAIL_CLOSED_SETTINGS,
): ScheduledSweepResult {
  const errors: ScheduledSweepResult['errors'] = [];
  let quarantine_ok = true;
  let retention_ok = true;

  try {
    assertQuarantineDischarged(quarantine_objects, now);
  } catch (e) {
    quarantine_ok = false;
    errors.push({ control: 'QUARANTINE', code: (e as ClientDocIngestionError).code, message: (e as Error).message });
  }
  try {
    assertNoOverdueUndeleted(raw_files, now, settings);
  } catch (e) {
    retention_ok = false;
    errors.push({ control: 'RETENTION', code: (e as ClientDocIngestionError).code, message: (e as Error).message });
  }

  return {
    at: now, quarantine_ok, retention_ok, errors,
    quarantine: sweepQuarantine(quarantine_objects, now),
    retention: sweepForDeletion(raw_files, now, settings),
  };
}

/** Deletes a raw file that has fallen due, and records it. Step 12's other half. */
export async function deleteDueRawFile(
  deps: UploadHandlerDeps,
  rec: RawFileRecord,
  key: string,
): Promise<RawFileRecord> {
  const settings = deps.settings ?? FAIL_CLOSED_SETTINGS;
  const due = deletionDueAt(rec, settings);
  if (due === null) {
    throw new UploadHandlerError('E_JOB_NOT_COMPLETE',
      `no computable deletion date for '${rec.doc_id}'. Deleting anyway would be right by ` +
        'accident; the correct response is that assertNoOverdueUndeleted() already surfaces ' +
        'this as the "forever by default" case, and somebody answers it.',
      { doc_id: rec.doc_id });
  }
  await deps.store.delete(key);
  const at = deps.now();
  const out = recordDeletion(rec, at, {
    deleted_by: deps.actor,
    method: `ObjectStore.delete('${key}') — retention rule ${settings.raw_file_retention}, due ${due}`,
    // Refused as `true` by recordDeletion: nothing in this codebase produces a
    // redacted copy (board item 12928215019, WITHDRAWN_RETENTION_RULES).
    redacted_copy_retained: false,
  });
  await deps.audit.write({
    at, job_id: `retention:${rec.doc_id}`, doc_id: rec.doc_id, contract_step: 12,
    action: 'delete_raw_file', outcome: 'ok',
    detail: { key, due, rule: settings.raw_file_retention },
  });
  return out;
}

/* ------------------------------------------------------------------ *
 * 13. CONTRACT_COVERAGE — the assertion that this handler IS the contract
 *
 * RECEIPT_CONTRACT is twelve strings. This maps each one to the exported
 * function that discharges it. The test suite asserts the two are the same
 * length and in the same order, so that a step added to the contract and not
 * to the handler FAILS A TEST rather than being noticed in a year.
 *
 * That is the specific failure this phase exists to prevent: the module
 * carried a contract and no consumer, and nothing anywhere said so.
 * ------------------------------------------------------------------ */

export const CONTRACT_COVERAGE: readonly { step: number; discharged_by: string; note: string }[] = [
  { step: 1, discharged_by: 'issueUploadUrl', note: 'assertQuarantineKey runs before the URL is minted' },
  { step: 2, discharged_by: 'recordUploadComplete', note: 'the TTL clock starts at the write, not at issue' },
  { step: 3, discharged_by: 'processUpload', note: 'unrecognised type -> discharge, never promote' },
  { step: 4, discharged_by: 'processUpload', note: 'segment() over the TextExtractor port' },
  { step: 5, discharged_by: 'processUpload', note: 'applyReceiptPolicy; sets strip_completed_at' },
  { step: 6, discharged_by: 'processUpload / promoteRawFile', note: 'retained text always; the file only under PROMOTION_RULE' },
  { step: 7, discharged_by: 'dischargeQuarantine', note: 'success and failure paths; delete then record, in that order' },
  { step: 8, discharged_by: 'openTransparency', note: 'received_at is the quarantine write, not the triage' },
  { step: 9, discharged_by: 'runExtraction', note: 'model or human route, refused if crossed' },
  { step: 10, discharged_by: 'writeClaims', note: 'assertClaimsWritable throws BEFORE write()' },
  { step: 11, discharged_by: 'closeJob', note: 'assertTransparencyRecordComplete' },
  { step: 12, discharged_by: 'runScheduledSweeps / deleteDueRawFile', note: 'runs whether or not a handler ran correctly' },
];

export function assertContractCovered(): void {
  if (CONTRACT_COVERAGE.length !== RECEIPT_CONTRACT.length) {
    throw new UploadHandlerError('E_CONTRACT_ORDER',
      `RECEIPT_CONTRACT has ${RECEIPT_CONTRACT.length} steps and CONTRACT_COVERAGE claims ` +
        `${CONTRACT_COVERAGE.length}. A step was added to the contract and not to the handler, ` +
        'or the reverse. One of them is now wrong.',
      { contract: RECEIPT_CONTRACT.length, covered: CONTRACT_COVERAGE.length });
  }
  for (let i = 0; i < RECEIPT_CONTRACT.length; i++) {
    const claimed = CONTRACT_COVERAGE[i];
    if (claimed.step !== i + 1) {
      throw new UploadHandlerError('E_CONTRACT_ORDER',
        `CONTRACT_COVERAGE entry ${i} claims step ${claimed.step}. The coverage list is read as ` +
          'an ORDERING, not as a set.',
        { index: i, claimed: claimed.step });
    }
  }
}

export { RECEIPT_CONTRACT, INGESTION_BOUNDARY, FAIL_CLOSED_SETTINGS, receiptPolicyFor };
