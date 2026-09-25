/**
 * Caprebate — CLIENT_DOC Ingestion Minimisation Control
 * Board item 12928074627. Phase 41.
 * Amended by Phase 44 (board items 12928214881 and 12928215019), 30 Aug 2026.
 * Amended by Phase 65 (Q56 answered — section 7B), 2 Sep 2026.
 *
 * WHAT PHASE 44 CHANGED, READ THIS BEFORE THE PARAGRAPH BELOW. Phase 41 wrote
 * that the strip runs "before anything is written to durable storage". Under
 * the architecture recorded in STORAGE_POSITION — pre-signed URL uploads
 * direct to S3 — that was never true, and the sweep at Phase 42 found it.
 * Phase 44 (i) records the ingestion boundary this codebase now assumes and
 * builds the mechanism that bounds it (sections 1A and 1B), (ii) corrects
 * every sentence that overstated the guarantee rather than weakening the
 * control to match them, (iii) re-checks condition A14-D4 and records it as PARTLY
 * MET (section 1C), and (iv) withdraws the retention rule that promised a
 * redacted copy nothing could produce (section 7A).
 *
 * ============================================================================
 * WHY THIS EXISTS, IN ONE PARAGRAPH.
 *
 * caprebate-document-pipeline.ts is an excellent set of controls on what
 * reaches an extraction model. Phase 40 (board item 12927987812) §3.2 walked
 * every one of them — the seven NEVER_TO_MODEL segment kinds, the branded
 * ModelPayload type, the L4 person-name scrubber, the E_PERSON_NAME egress
 * refusal, Gate A and Gate B — and found that every single row of that table
 * says "after". They all operate on a document Caprebate already holds. The
 * transparency duty in Article 14, and the lawful basis question behind it,
 * attach when the document is OBTAINED, which is the moment the client uploads
 * it. This module is the control at that boundary. It is additive and it is
 * upstream: nothing here weakens, replaces or relaxes anything downstream.
 * ============================================================================
 *
 * THE THREE FACTS THAT MAKE IT CHEAP.
 *
 *   1. NO FIELD IN ANY OF THE ELEVEN SPECIFICATIONS IS A PERSON'S NAME.
 *      Re-checked field by field against DOC_SPECS and HUMAN_CAPTURE_SPECS for
 *      this module — test C7 asserts it mechanically rather than trusting the
 *      reading. (Thirteen since Phase 151b added the tax return and the tax
 *      computation, re-checked the same way: still none.) So the parties clause, the execution block and the
 *      representations are needed by NOTHING downstream, and removing them on
 *      receipt costs the extraction exactly nothing.
 *
 *   2. THE NAME EXCLUSION REGISTER ALREADY IS THIS CONTROL, FOR REGISTERS.
 *      Its assertion, its fail-closed source lookup and its unclassified-field
 *      refusal are the right mechanism. Phase 41 adds the CLIENT_DOC entry it
 *      was missing (subitem 13) and calls the existing assertion rather than
 *      writing a second one — see assertClaimsWritable().
 *
 *   3. THE PIPELINE ALREADY WRITES source_id: 'CLIENT_DOC'.
 *      A source id the exclusion policy did not contain. Under its own
 *      fail-closed design that would have thrown E_UNKNOWN_SOURCE the first
 *      time anybody called the assertion on the upload path. Nobody ever did.
 *
 * ----------------------------------------------------------------------------
 * WHAT IS DECIDED HERE AND WHAT IS DELIBERATELY NOT.
 *
 * Gate B, Q34, Q35 and Q36 are NOT decided here and must not be inferred from
 * anything in this file. Every setting they govern is a parameter on
 * IngestionSettings with a FAIL-CLOSED default, and FAIL_CLOSED_SETTINGS states
 * what "fail closed" means for each one and why. A fail-closed default for a
 * retention rule means DELETE SOONER, not keep longer — a retention rule with
 * no deletion mechanism is a retention rule that says "forever".
 *
 * Q40 is not decided here either. INGESTION_BOUNDARY carries the fail-closed
 * default this codebase builds against and an is_a_decision field saying, in
 * data, that no human has chosen it. Two things Phase 44 DOES settle, because
 * neither is a judgement: an option that cannot be performed is withdrawn
 * rather than offered (section 7A), and a condition already owned by the
 * Developer is enforced where it removes an option (CONDITION_D4_STATUS). Both
 * are put to Lakhbir and the DPO as Q44 and Q45 rather than left in a comment.
 * ----------------------------------------------------------------------------
 *
 * Runs on Node >= 22.6 with type stripping (`node file.ts`). No enums, no
 * namespaces, no parameter properties — those are not strippable.
 */

import {
  DOC_SPECS, HUMAN_CAPTURE_SPECS, HUMAN_READ_ONLY_TYPES, NEVER_TO_MODEL,
  type DocType, type Segment, type SegmentKind,
} from './caprebate-document-pipeline.ts';
import {
  assertNoUnauthorisedName, NameExclusionError,
  type IngestedRecord,
} from './caprebate-name-exclusion.ts';

/* ------------------------------------------------------------------ *
 * 0. Errors
 * ------------------------------------------------------------------ */

export type IngestionErrorCode =
  | 'E_NO_RECEIPT_POLICY'
  | 'E_NEVER_RETAINED_SEGMENT_KEPT'
  | 'E_CAPTURE_NAME_PRESENT'
  | 'E_CAPTURE_NOT_ATTESTED'
  | 'E_TRANSPARENCY_PERSON_UNRESOLVED'
  | 'E_TRANSPARENCY_REF_IS_NAME'
  | 'E_TRANSPARENCY_NO_BASIS_ROLE'
  | 'E_CONDITIONAL_FIELD_UNDISCRIMINATED'
  | 'E_RETENTION_OVERDUE'
  | 'E_DELETION_UNEVIDENCED'
  /* --- added by Phase 44, board items 12928214881 and 12928215019 --- */
  /** A pre-signed URL was issued for a key outside the quarantine prefix. */
  | 'E_UPLOAD_KEY_NOT_QUARANTINED'
  /** A quarantine object is past its TTL and still held. */
  | 'E_QUARANTINE_UNDISCHARGED'
  /** The durable write happened before, or without, the strip that precedes it. */
  | 'E_DURABLE_WRITE_BEFORE_STRIP'
  /** A retention rule was selected that this codebase has withdrawn. */
  | 'E_RETENTION_RULE_WITHDRAWN'
  /** A deletion claimed a redacted copy survives, and nothing can produce one. */
  | 'E_REDACTED_COPY_UNPRODUCIBLE'
  /* --- added by Phase 132, 14 September 2026 --- */
  /** A caller asserted a backup position the host's backup cycle does not support. */
  | 'E_BACKUP_CYCLE_ASSERTED'
  /** A deleted record was about to be restored with no approval from the data protection officer. */
  | 'E_RESTORE_UNAPPROVED';

export class ClientDocIngestionError extends Error {
  code: IngestionErrorCode;
  detail: Record<string, unknown>;
  constructor(code: IngestionErrorCode, message: string, detail: Record<string, unknown> = {}) {
    super(`[${code}] ${message}`);
    this.name = 'ClientDocIngestionError';
    this.code = code;
    this.detail = detail;
  }
}

/* ------------------------------------------------------------------ *
 * 1. THE STORAGE FACT — established 29 August 2026, board item 12928031577
 *
 * Phase 40 §3.4 proceeded on an INFERENCE that the raw uploaded file is
 * retained, said so, and created an item to establish it. This is the answer,
 * and it is not the binary the inference expected. It is recorded here as
 * data, in the module that depends on it, so that a future reader cannot
 * re-derive it wrongly.
 *
 *   INTENDED — yes, retained. The Developer Brief (00-START-HERE/
 *   Caprebate-Developer-Brief.md §3, technology stack table) specifies
 *   "Object storage — AWS S3 (eu-west-2 / London) — Uploads, scans, PDFs,
 *   signed letters. SSE; pre-signed URLs", and §11 requires "encryption at
 *   rest (DB+S3)". So the architecture of record retains the raw file, in the
 *   UK, encrypted.
 *
 *   BUILT — no. Not the storage, and not the upload path either. There is no
 *   file write, no storage adapter, no upload handler and no PDF/OCR text
 *   extraction anywhere in the codebase. The pipeline library BEGINS at
 *   segment(pages), which takes text somebody else already extracted, and
 *   nothing anywhere constructs a doc_id. (Verified by searching every .ts and
 *   .cjs file under 04-phase-work and 03-app for fs, writeFile,
 *   createWriteStream, S3, bucket, putObject, blob and storage: the only hits
 *   are two dev-time chunking scripts and the regression harness reading
 *   source files.)
 *
 *   DELETION — does not exist, in any form. The Developer Brief's own list of
 *   open decisions carries "12. Retention periods — leads, documents, signed
 *   engagements, message history" as an UNMADE decision, and §11 lists a
 *   "retention policy" as a thing still to be produced.
 *
 * WHY THIS IS NOT THE "documents are not retained" FINDING that would have
 * collapsed most of this phase. Phase 40's review trigger 3 anticipated a
 * finding that documents are not retained, which would have required §7 and
 * §10 to be re-run. That is NOT what was found. What was found is that the
 * question is UNDECIDED BECAUSE THE COMPONENT DOES NOT EXIST YET — the
 * intended design retains, nothing is built, and no deletion mechanism has
 * ever been specified. Phase 40's working inference was therefore right about
 * the destination and wrong only about the tense.
 *
 * The consequence for this module is the reason it is written the way it is:
 * every control here is a control on a boundary that has NO IMPLEMENTATION TO
 * RETROFIT. That is the cheapest possible moment to impose one, and it is why
 * this file is a specification with a working reference implementation rather
 * than a patch to a running system. The upload handler, when somebody writes
 * it, has to call these functions; RECEIPT_CONTRACT below states in what order.
 * ------------------------------------------------------------------ */

export const STORAGE_POSITION = {
  established_on: '2026-08-29',
  board_item: '12928031577',
  intended_store: 'AWS S3, eu-west-2 (London), SSE, pre-signed URLs',
  intended_store_source: 'Caprebate-Developer-Brief.md §3 technology stack table',
  raw_file_retained_by_design: true,
  upload_path_implemented: false,
  storage_adapter_implemented: false,
  deletion_mechanism_exists: false,
  retention_period_decided: false,
  retention_decision_ref: 'Q34; Developer Brief §12 open decision 12',
} as const;

/* ------------------------------------------------------------------ *
 * 1A. WHERE THE INGESTION BOUNDARY ACTUALLY IS — Phase 44, item 12928214881
 *
 * THE CORRECTION THIS SECTION EXISTS TO MAKE. Phase 41 wrote, in this file,
 * that applyReceiptPolicy "runs on receipt, before anything is written to
 * durable storage" and that what it removes "is never written anywhere". Read
 * against STORAGE_POSITION above — which records the architecture of record as
 * pre-signed URL uploads to S3 — that could not be true. A pre-signed URL is a
 * capability handed to the client's BROWSER, which then writes the bytes
 * straight into the bucket. Caprebate’s server never holds the file before
 * the object store does. At the moment applyReceiptPolicy runs, the complete
 * unredacted document is already in storage, and what the function filters is
 * the EXTRACTED TEXT. Everything it reports as `removed` stays in the stored
 * original for the whole retention period.
 *
 * That is the third time this shape has been found. Phase 40 found every
 * control sitting at the model boundary while the duty attaches at the door.
 * Phase 41 moved the control to "receipt". Phase 42 found that "receipt" was
 * itself downstream of the first durable write. Each pass was careful and each
 * reasoned from an incomplete picture of the architecture, which is why the
 * architecture is now written down HERE, as data, next to the control it
 * governs, rather than being re-derived from a brief nobody re-reads.
 *
 * TWO WAYS TO MAKE THE SENTENCE TRUE AGAIN.
 *
 *   (a) QUARANTINE_PREFIX. The pre-signed URL is scoped to a short-lived
 *       quarantine location. The browser still uploads directly. Caprebate
 *       strips (and, if a redaction producer is ever built, redacts), writes
 *       the clean artefact to the durable location, and DELETES the quarantine
 *       object. Direct upload keeps its speed and cost; "before the first
 *       DURABLE write" becomes true; and the window in which the unredacted
 *       file exists is bounded by a TTL and an assertion rather than by a
 *       retention rule.
 *
 *   (b) SERVER_MEDIATED_UPLOAD. The bytes reach Caprebate before any object
 *       store. Simpler to reason about, and it makes the original sentence
 *       literally true — at the cost of putting large file transfers through
 *       application servers, which is slower, dearer and a scaling problem.
 *
 * WHICH IS BUILT HERE, AND ON WHOSE AUTHORITY. (a). Q40 puts the choice to
 * Lakhbir and the developer with a recommendation of (a); as at 30 August 2026
 * Q40 IS UNANSWERED. So this is a FAIL-CLOSED DEFAULT, NOT A DECISION, and
 * INGESTION_BOUNDARY.is_a_decision records that in a field rather than in a
 * paragraph somebody may skim. Fail-closed here means: the shorter the
 * unredacted file's life, the better, so the model that bounds it with a TTL
 * is preferred to the model that does not. If Q40 lands on (b), the assertions
 * below still hold — a server-mediated upload is the quarantine model with a
 * quarantine residency of zero — and only the key-scoping assertion becomes
 * moot.
 *
 * WHAT THIS SECTION DOES NOT CLAIM. It does not claim quarantine storage is
 * not storage. It is: it is durable, it is a write, and a controller that
 * holds a file for an hour has held it. Phase 40 §3.4 settles that obtaining
 * alone engages Article 14 and that "we looked at it and deleted it" does not
 * undo it. What the quarantine model buys is not innocence at the door — it is
 * a bounded, asserted, evidenced holding instead of an unbounded one, which is
 * §7.7 measure 2 ("hold less") applied to the one file where, per §5.4, the
 * whole third-party personal data holding lives.
 *
 * NAME COLLISION, FLAGGED SO IT IS NOT INHERITED AS CONFUSION. There is an
 * unrelated caprebate-anchor-quarantine.ts in this directory (Phase 10, the
 * surveyor walkthrough). It quarantines ANCHOR VALUES pending professional
 * judgement. It has nothing to do with this and the two must not be wired
 * together.
 * ------------------------------------------------------------------ */

export type IngestionBoundaryModel =
  /** (a) Pre-signed URL into a short-lived quarantine location; strip; promote; delete. */
  | 'QUARANTINE_PREFIX'
  /** (b) The bytes reach Caprebate before any object store. */
  | 'SERVER_MEDIATED_UPLOAD'
  /** What the Developer Brief specifies today, unmodified: the browser writes straight to the durable prefix. */
  | 'DIRECT_TO_DURABLE';

export const INGESTION_BOUNDARY = {
  recorded_on: '2026-08-30',
  board_item: '12928214881',
  model: 'QUARANTINE_PREFIX' as IngestionBoundaryModel,
  /**
   * FALSE. This is the fail-closed default adopted because Q40 is unanswered.
   * A reader who needs to know whether a human chose this reads this field.
   */
  is_a_decision: false,
  decision_ref: 'Q40 (decision queue v6.7 addendum 8) — UNANSWERED as at 2026-08-30',
  /** What the architecture of record says today, which is the thing being corrected. */
  brief_says: 'DIRECT_TO_DURABLE' as IngestionBoundaryModel,
  brief_source: 'Caprebate-Developer-Brief.md §3 technology stack table',
  /** Nothing below is built. Same standing as everything else in this module. */
  implemented: false,
  quarantine_ttl_minutes: 60,
  quarantine_prefix: 'quarantine/',
  durable_prefix: 'documents/',
} as const;

/** The TTL, exported separately because it is the number a reviewer argues about. */
export const QUARANTINE_TTL_MINUTES: number = INGESTION_BOUNDARY.quarantine_ttl_minutes;

/**
 * The order an upload handler must call this module in. Stated as data so it
 * can be asserted, and so a developer writing the handler has one place to
 * read rather than five. Part D of the name exclusion register makes the same
 * point for connectors: retrieve -> assert -> write, and if the assertion
 * throws the write never happens.
 *
 * REWRITTEN BY PHASE 44. The previous version described a sequence in which
 * nothing was written until after the strip. That was never the architecture.
 * This version states the real order INCLUDING the quarantine write and its
 * deletion, because the point of a contract stated as data is that a developer
 * reading one place gets the real order rather than an aspirational one.
 */
export const RECEIPT_CONTRACT: readonly string[] = [
  '1. issue a pre-signed URL scoped to the QUARANTINE prefix only — assertQuarantineKey(key) refuses ' +
    'any key outside it, because a pre-signed URL naming a durable key defeats every step below',
  '2. the browser writes the file to quarantine. THIS IS A REAL WRITE TO REAL STORAGE and the file is ' +
    'unredacted at this point. What bounds it is the TTL and step 7, not the physics',
  '3. classify the DocType (an unrecognised type is refused: the quarantine object is DELETED, not promoted)',
  '4. segment() the quarantine object — text extraction',
  '5. applyReceiptPolicy(doc_id, doc_type, segments) — filters the EXTRACTED TEXT. It does not alter ' +
    'the file; result.removed is still in the quarantine object at this instant',
  '6. write ONLY result.retained onward. Where the raw file is retained at all (Q34), promote to the ' +
    'durable prefix — and note that with no redaction producer built (see WITHDRAWN_RETENTION_RULES) ' +
    'what is promoted is the ORIGINAL, removed segments included',
  '7. delete the quarantine object and record it — recordQuarantineDischarge(). Until this runs the ' +
    'unredacted file is held; assertQuarantineDischarged() makes an undischarged one break something',
  '8. openTransparencyRecord(doc_id, doc_type, received_at) and triage the natural persons named',
  '9. extract() or captureHumanRead() as the type requires',
  '10. assertClaimsWritable(claims, discriminants) BEFORE the claims are written',
  '11. assertTransparencyRecordComplete(record) before the Article 14(3)(a) month expires',
  '12. rawFileRecordFromReceipt(...) at step 6, then sweepForDeletion() on a schedule thereafter',
];

/**
 * Where the first durable write of the unredacted file sits relative to the
 * strip, under each boundary model. This is the table Phase 40 §3.2 would have
 * drawn for the storage boundary if the storage boundary had been known.
 */
export const BOUNDARY_POSITION: readonly {
  model: IngestionBoundaryModel;
  unredacted_file_reaches_storage: 'before the strip' | 'never';
  bounded_by: string;
  strip_claim_that_holds: string;
}[] = [
  {
    model: 'DIRECT_TO_DURABLE',
    unredacted_file_reaches_storage: 'before the strip',
    bounded_by: 'the retention rule only — i.e. Q34, which is undecided',
    strip_claim_that_holds:
      'the extracted text is filtered. Nothing is removed from the file, ever, and the removed ' +
      'content lives for the whole retention period',
  },
  {
    model: 'QUARANTINE_PREFIX',
    unredacted_file_reaches_storage: 'before the strip',
    bounded_by: 'a TTL and assertQuarantineDischarged()',
    strip_claim_that_holds:
      'the extracted text is filtered, and the unredacted file is held only for the quarantine ' +
      'window. "Before the first DURABLE write" is true; "before the first write" is not',
  },
  {
    model: 'SERVER_MEDIATED_UPLOAD',
    unredacted_file_reaches_storage: 'never',
    bounded_by: 'the request lifetime — the bytes are in memory or a temp file, not an object store',
    strip_claim_that_holds:
      'the original Phase 41 sentence, literally. This is the only model under which it was ever true',
  },
];

/* ------------------------------------------------------------------ *
 * 1B. THE QUARANTINE MECHANISM
 *
 * Built to the same standard as the deletion mechanism in section 7 and for
 * the same reason: a boundary with no assertion behind it is a paragraph. The
 * failure this exists to make impossible is the quiet one — the quarantine
 * object that is written, extracted from, and then simply left, so that
 * "quarantine" becomes a second durable store with a friendlier name.
 * ------------------------------------------------------------------ */

export type QuarantineObject = {
  doc_id: string;
  /** The object key the pre-signed URL was issued for. */
  key: string;
  /** When the browser's write completed. The clock starts here, not at classification. */
  written_at: string;
  /** When applyReceiptPolicy ran on the text extracted from it. */
  strip_completed_at?: string;
  /** When the artefact was written to the durable prefix, where it is retained at all. */
  durable_written_at?: string;
  deleted_at?: string;
  deletion_evidence?: { deleted_by: string; method: string };
};

/**
 * Refuses a key outside the quarantine prefix. Fail closed on the register's
 * Part E discipline: an unrecognised shape is refused, not waved through.
 *
 * This is the single most load-bearing line in the model, and it is one string
 * comparison. Everything else here assumes the file landed in quarantine; if
 * the URL that was signed named a durable key, nothing below ever runs and no
 * assertion notices, because there is no quarantine object to sweep.
 */
export function assertQuarantineKey(key: string): void {
  if (!key.startsWith(INGESTION_BOUNDARY.quarantine_prefix)) {
    throw new ClientDocIngestionError(
      'E_UPLOAD_KEY_NOT_QUARANTINED',
      `pre-signed upload key '${key}' is not under the quarantine prefix ` +
        `'${INGESTION_BOUNDARY.quarantine_prefix}'. A URL signed for a durable key writes the ` +
        'unredacted file straight into the retained store, which is the architecture this ' +
        'boundary exists to correct (board item 12928214881).',
      { key, quarantine_prefix: INGESTION_BOUNDARY.quarantine_prefix },
    );
  }
}

/** When the quarantine object must be gone by. Always computable — the clock starts on the write. */
export function quarantineDischargeDueAt(o: QuarantineObject): string {
  return new Date(new Date(o.written_at).getTime() + QUARANTINE_TTL_MINUTES * 60_000).toISOString();
}

export type QuarantineSweep = {
  /** Deleted, with evidence. The only clean state. */
  discharged: QuarantineObject[];
  /** Still held, still inside the TTL. */
  live: QuarantineObject[];
  /** Still held, past the TTL. Quarantine has become storage. */
  overdue: QuarantineObject[];
  /** Promoted to the durable prefix before, or without, the strip. */
  out_of_order: QuarantineObject[];
};

export function sweepQuarantine(objects: readonly QuarantineObject[], now: string): QuarantineSweep {
  const t = new Date(now).getTime();
  const out: QuarantineSweep = { discharged: [], live: [], overdue: [], out_of_order: [] };
  for (const o of objects) {
    const stripT = o.strip_completed_at ? new Date(o.strip_completed_at).getTime() : null;
    const durT = o.durable_written_at ? new Date(o.durable_written_at).getTime() : null;
    if (durT !== null && (stripT === null || durT < stripT)) out.out_of_order.push(o);

    if (o.deleted_at) { out.discharged.push(o); continue; }
    if (new Date(quarantineDischargeDueAt(o)).getTime() <= t) out.overdue.push(o);
    else out.live.push(o);
  }
  return out;
}

/** Records the quarantine deletion. Unevidenced deletion is refused, exactly as in section 7. */
export function recordQuarantineDischarge(
  o: QuarantineObject,
  deleted_at: string,
  evidence: NonNullable<QuarantineObject['deletion_evidence']>,
): QuarantineObject {
  if (!evidence.deleted_by || !evidence.method) {
    throw new ClientDocIngestionError(
      'E_DELETION_UNEVIDENCED',
      'a quarantine discharge must record who performed it and by what method. The whole value ' +
        'of the quarantine model is that the unredacted file demonstrably stopped existing.',
      { doc_id: o.doc_id, key: o.key },
    );
  }
  return { ...o, deleted_at, deletion_evidence: evidence };
}

/**
 * THE FUNCTION THAT MAKES THE BOUNDARY REAL. Run on a schedule, on the same
 * pattern as assertNoOverdueUndeleted.
 *
 * Two refusals, and they are different in kind:
 *
 *   E_DURABLE_WRITE_BEFORE_STRIP — the artefact was promoted before the strip
 *     ran, or with no strip recorded at all. The ordering IS the control; a
 *     quarantine step performed in the wrong order is DIRECT_TO_DURABLE with
 *     an extra copy.
 *
 *   E_QUARANTINE_UNDISCHARGED — an unredacted file is past its TTL and still
 *     held. This is the quiet failure: nothing breaks, nothing alerts, and the
 *     quarantine bucket becomes the thing §5.4 says holds every third-party
 *     name Caprebate has.
 */
export function assertQuarantineDischarged(objects: readonly QuarantineObject[], now: string): void {
  const sweep = sweepQuarantine(objects, now);
  if (sweep.out_of_order.length > 0) {
    throw new ClientDocIngestionError(
      'E_DURABLE_WRITE_BEFORE_STRIP',
      `${sweep.out_of_order.length} document(s) were written to the durable prefix before, or ` +
        'without, applyReceiptPolicy running. The order in RECEIPT_CONTRACT is the control — ' +
        'promoting first and stripping afterwards leaves the unredacted file in the retained store, ' +
        'which is the defect at board item 12928214881.',
      { doc_ids: sweep.out_of_order.map((o) => o.doc_id) },
    );
  }
  if (sweep.overdue.length > 0) {
    throw new ClientDocIngestionError(
      'E_QUARANTINE_UNDISCHARGED',
      `${sweep.overdue.length} quarantine object(s) are past the ${QUARANTINE_TTL_MINUTES}-minute ` +
        'TTL and still held. An undischarged quarantine object is an unredacted client document in ' +
        'durable storage with no retention rule over it — worse than the position this model ' +
        'replaced, not better, because nothing is even counting it.',
      { doc_ids: sweep.overdue.map((o) => o.doc_id), ttl_minutes: QUARANTINE_TTL_MINUTES },
    );
  }
}

/* ------------------------------------------------------------------ *
 * 1C. CONDITION A14-D4, RE-CHECKED — Phase 44
 *
 * A14-D4 (Phase 40 §10): "Planning representations, consultee responses and
 * correspondence are removed from an uploaded planning document on receipt,
 * not merely kept out of the model."
 *
 * Phase 41 stated A14-D4 as MET and as absolute. It is neither, and the reason is
 * the boundary above. Recorded as data so the next phase does not have to
 * re-derive it a fourth time.
 * ------------------------------------------------------------------ */

export const CONDITION_D4_STATUS = {
  condition: 'A14-D4',
  source: 'Phase 40 §10, board item 12927987812',
  re_assessed_on: '2026-08-30',
  by: 'Phase 44, board item 12928214881',
  verdict: 'PARTLY_MET' as 'MET' | 'PARTLY_MET' | 'NOT_MET',

  met_for:
    'the extracted text and everything downstream of it. NEVER_RETAINED_ON_RECEIPT is applied first, ' +
    'before any mode branch, with no override anywhere in this module, and E_NEVER_RETAINED_SEGMENT_KEPT ' +
    're-asserts it against the output. Tests D4a-D4d. That part of Phase 41 was correct and is unchanged.',

  not_met_for:
    'the file itself. Under DIRECT_TO_DURABLE the representations sit in the stored original for the ' +
    'whole retention period, so "removed on receipt" is false for the only artefact that holds them. ' +
    'Under QUARANTINE_PREFIX they are held for the quarantine window and then the original is either ' +
    'deleted or promoted INTACT, because no redaction producer exists (section 7A).',

  what_would_make_it_met: [
    'the QUARANTINE_PREFIX boundary built, so the holding is bounded and asserted; and',
    'EITHER the original deleted rather than promoted (Q34 = DELETE_ON_EXTRACTION_COMPLETE),',
    'OR a redaction producer built so what is promoted no longer contains the three kinds.',
  ],

  /**
   * The consequence nobody had drawn, and it constrains an answer rather than
   * making one: A14-D4 is a LAWFUL BASIS condition, not a minimisation preference.
   * Where a planning upload's strip reported a NO_LAWFUL_BASIS removal, keeping
   * the original for the defence period keeps content Caprebate has decided
   * it has no basis to hold, for years. So for THOSE documents the long clock
   * is not one of Q34's three answers — it is unavailable until a redaction
   * producer exists. Implemented in deletionDueAt(), not left as prose. Q44.
   */
  constrains_q34: true,

  /**
   * PHASE 65, 2 September 2026. Q56 was answered Reading B — do not delete
   * the client document — which closes the FIRST of the two routes listed in
   * what_would_make_it_met, by decision rather than by argument. Recorded
   * here and not in that list because both entries still WOULD make A14-D4 met;
   * what changed is that one of them is no longer available to be chosen.
   */
  q56_closes_first_route:
    'Q56 (2 September 2026): the original is kept, so meeting A14-D4 by deleting it is no longer on offer for ' +
    'documents generally. For an A14-D4-affected document the long clock is unavailable anyway (q34_constraint), ' +
    'so that class is still deleted on the extraction clock — A14-D4 is met for it by deleting the document, not ' +
    'by holding a lawful version of it. A producer satisfying REDACTION_PRODUCER_CONTRACT is now the only ' +
    'route that both meets A14-D4 and honours the instruction to keep the document. That is the premise Q45 was ' +
    'answered on, and it has changed — section 7B.',

  q34_constraint:
    'RETAIN_FOR_DEFENCE_PERIOD cannot apply to a document whose receipt strip removed NO_LAWFUL_BASIS ' +
    'content. Such a record falls back to the extraction clock — fail closed means delete sooner.',
} as const;

/* ------------------------------------------------------------------ *
 * 2. WHO IS A DATA SUBJECT — the legal-form test, extended
 *
 * The name exclusion register's preamble already has the right test and it is
 * NOT restated differently here: "the test is legal form, not whether the
 * string looks like a name". A company called "A N Other Consulting Ltd" is
 * not a natural person; a sole trader's provider name is.
 *
 * Phase 40 §4.1 adds three cases the register population never needed, because
 * a register returns fields and a document has parties, signatories and
 * witnesses. All three are implemented below.
 * ------------------------------------------------------------------ */

export type PartyLegalForm =
  | 'NATURAL_PERSON'
  | 'SOLE_TRADER'
  | 'BODY_CORPORATE'
  | 'LLP'
  | 'PARTNERSHIP_SCOTLAND'
  | 'PARTNERSHIP_ENGLAND_WALES_NI'
  | 'PUBLIC_BODY'
  | 'UNKNOWN';

/**
 * Partnership Act 1890 s.4, read in the current revised text on
 * legislation.gov.uk on 29 August 2026:
 *
 *   s.4(1) "Persons who have entered into partnership with one another are for
 *   the purposes of this Act called collectively a firm, and the name under
 *   which their business is carried on is called the firm-name."
 *
 *   s.4(2) "In Scotland a firm is a legal person distinct from the partners of
 *   whom it is composed, but an individual partner may be charged on a decree
 *   or diligence directed against the firm, and on payment of the debts is
 *   entitled to relief pro ratâ from the firm and its other members."
 *
 * So separate legal personality is conferred on a firm IN SCOTLAND ONLY. A
 * lease naming "Dr A, Dr B and Dr C practising as the X Medical Partnership"
 * in England names three data subjects and no entity. An LLP is a body
 * corporate and is not affected. This matters for volume, not for engagement:
 * Phase 40 §4.4 records that a GP partnership's premises is one of the three
 * ordinary counter-cases to the DPIA's "mostly corporate" reassurance.
 */
export const PARTNERSHIP_ACT_1890_S4 = {
  provision: 'Partnership Act 1890 s.4',
  read_on: '2026-08-29',
  source: 'legislation.gov.uk/ukpga/1890/39/section/4 (current revised text)',
  effect: 'Separate legal personality is conferred on a firm in Scotland only (s.4(2)).',
} as const;

export type PartyReference = {
  /** How the party appears on the face of the document. */
  form: PartyLegalForm;
  /**
   * How many individuals are named on the document in connection with this
   * party. For an English partnership this is ordinarily the partners named as
   * parties; for a company it is ordinarily zero (the company is named, not
   * its people) but may be more where individuals are separately named.
   */
  individuals_named_on_document: number;
};

export type PartyClassification = {
  firm_name_is_personal_data: boolean;
  data_subject_count: number;
  reason: string;
};

/**
 * Applies the legal-form test to one party reference. Fails closed: UNKNOWN is
 * treated as a natural person, because the whole point of the register's
 * fail-closed design is that an uncatalogued thing is refused rather than
 * assumed innocent.
 */
export function classifyPartyReference(p: PartyReference): PartyClassification {
  const named = Math.max(0, p.individuals_named_on_document);
  switch (p.form) {
    case 'NATURAL_PERSON':
      return {
        firm_name_is_personal_data: true,
        data_subject_count: Math.max(1, named),
        reason: 'a natural person named in their own right',
      };
    case 'SOLE_TRADER':
      return {
        firm_name_is_personal_data: true,
        data_subject_count: Math.max(1, named),
        reason:
          'a sole trader has no legal identity separate from the individual, so the trading ' +
          'name IS the person\'s name — name exclusion register preamble, applied unchanged',
      };
    case 'BODY_CORPORATE':
    case 'LLP':
    case 'PUBLIC_BODY':
      return {
        firm_name_is_personal_data: false,
        data_subject_count: named,
        reason:
          'the name identifies a legal entity, not a natural person, even where the string ' +
          'reads as a person\'s name — name exclusion register preamble and its test T10. ' +
          'An LLP is a body corporate and is not touched by Partnership Act 1890 s.4',
      };
    case 'PARTNERSHIP_SCOTLAND':
      return {
        firm_name_is_personal_data: false,
        data_subject_count: named,
        reason:
          'Partnership Act 1890 s.4(2): in Scotland a firm is a legal person distinct from ' +
          'the partners. The firm-name is not personal data; individuals separately named ' +
          'still are',
      };
    case 'PARTNERSHIP_ENGLAND_WALES_NI':
      return {
        firm_name_is_personal_data: true,
        // A firm has at least two partners by definition. If the document names
        // fewer than that, the count is still at least two data subjects behind
        // the firm-name, and rounding down would understate the population.
        data_subject_count: Math.max(2, named),
        reason:
          'Partnership Act 1890 s.4(2) confers separate legal personality in SCOTLAND ONLY. ' +
          'Elsewhere s.4(1) defines the firm as the partners collectively, so the firm-name ' +
          'is a collective label for natural persons and the partners are the data subjects',
      };
    case 'UNKNOWN':
    default:
      return {
        firm_name_is_personal_data: true,
        data_subject_count: Math.max(1, named),
        reason:
          'legal form not established — treated as a natural person. Fail closed: an ' +
          'uncatalogued party is refused the benefit of the corporate answer, not given it',
      };
  }
}

/**
 * The roles Phase 40 §4.3 isolates as natural persons one hundred per cent of
 * the time. Kept as a separate predicate from classifyPartyReference because
 * that is the whole finding: these three sit OUTSIDE the parties clause, so a
 * rule about "party names" reaches none of them.
 *
 *   1. The attesting witness. A company cannot witness a signature.
 *   2. The individual who signs, including one signing "for and on behalf of"
 *      a company — they are a natural person and their name is personal data
 *      whoever they sign for.
 *   3. The professional certifier — the FRA assessor, the asbestos surveyor,
 *      the reinstatement valuer, the building control signatory.
 */
export type PersonRole =
  | 'ATTESTING_WITNESS'
  | 'INDIVIDUAL_SIGNATORY'
  | 'PROFESSIONAL_CERTIFIER'
  | 'TRANSACTION_PARTY'
  | 'GUARANTOR'
  | 'AGENT_OR_REPRESENTATIVE'
  | 'OFFICER_OR_CASE_OFFICER'
  | 'PERSON_NAMED_IN_PROSE'
  | 'PLANNING_OBJECTOR_OR_CONSULTEE'
  | 'PERSON_IN_EVACUATION_PLAN';

export const ALWAYS_NATURAL_PERSON_ROLES: readonly PersonRole[] = [
  'ATTESTING_WITNESS',
  'INDIVIDUAL_SIGNATORY',
  'PROFESSIONAL_CERTIFIER',
];

/**
 * True where the role is occupied by a natural person regardless of the legal
 * form of any entity behind it. Note what this does NOT do: it does not ask
 * whether the person is a party, because two of the three are not.
 */
export function roleIsAlwaysNaturalPerson(role: PersonRole): boolean {
  return ALWAYS_NATURAL_PERSON_ROLES.includes(role);
}

/**
 * Roles for which Caprebate has NO LAWFUL BASIS AT ALL, so there is nothing
 * for a transparency notice to describe and the answer is not to hold the data.
 * Item 5 §4.4: "For Class D, Article 6(1)(f) is not available and is not
 * claimed." Phase 40 §4.5 shows that LIA-C10 governs the planning API and not an
 * uploaded planning PDF — which is what condition A14-D4 and section 3 below fix.
 */
export const NO_LAWFUL_BASIS_ROLES: readonly PersonRole[] = ['PLANNING_OBJECTOR_OR_CONSULTEE'];

/* ------------------------------------------------------------------ *
 * 3. THE RECEIPT POLICY — what may be written to storage, per document type
 *
 * Worked from the FIELD SETS, not from a general idea of what is sensitive.
 * The question asked of every segment kind is: does any field in this
 * document type's specification come from it? If no field needs it, it goes.
 *
 * That question has a mechanical answer for the nine model-extractable types
 * (eleven since Phase 151b), because DocSpec.permitted_segments already IS the answer, and test C1
 * asserts the derivation rather than trusting this table. It has no mechanical
 * answer for the two HUMAN_READ_ONLY types, and section 3.2 says so plainly
 * instead of inventing one.
 * ------------------------------------------------------------------ */

/**
 * Removed on receipt from EVERY document type, including the two
 * HUMAN_READ_ONLY ones, under EVERY setting, with no override anywhere in this
 * module. This is Phase 40 condition A14-D4 and it is the one item in this phase
 * that should not wait for the rest.
 *
 * The reason these three are absolute where the rest of the strip is
 * spec-derived: for everything else the argument is minimisation — no field
 * needs it, so holding it is unnecessary. For these three the argument is
 * lawful basis — Caprebate has decided it has NONE, so holding it is not
 * merely unnecessary, it is unlawful. Those are different arguments with
 * different consequences and they must not be collapsed into one list.
 */
export const NEVER_RETAINED_ON_RECEIPT: readonly SegmentKind[] = [
  'REPRESENTATIONS',
  'CONSULTEE_RESPONSES',
  'CORRESPONDENCE',
];

export type RemovalReason =
  /** No lawful basis for the content at all. Absolute. Condition A14-D4. */
  | 'NO_LAWFUL_BASIS'
  /** No field in this document type's specification comes from this segment. */
  | 'NO_FIELD_NEEDS_IT'
  /** The segmenter could not classify it, so it is refused. Fail closed. */
  | 'UNCLASSIFIED_FAILS_CLOSED';

export type RetentionMode =
  /** Retain only the segments the specification actually draws fields from. */
  | 'SPEC_DERIVED'
  /**
   * Retain everything except NEVER_RETAINED_ON_RECEIPT, because a human has to
   * read the document and no spec says which parts. Weaker, and named so.
   */
  | 'WHOLE_DOCUMENT_PENDING_HUMAN_READ';

export type ClientDocReceiptPolicy = {
  doc_type: DocType;
  mode: RetentionMode;
  /** Written to durable storage on receipt. Empty for the human-read modes. */
  retained_segments: readonly SegmentKind[];
  /**
   * The roles Phase 40 §4.2 works through for this type, with how often the
   * role is occupied by a natural person. This is what makes the per-upload
   * triage at condition A14-D1 performable by a person who has not read Phase 40:
   * it tells them who to look for in this document type.
   */
  roles_to_triage: readonly { role: PersonRole; frequency: 'always' | 'usually' | 'sometimes' | 'never'; note?: string }[];
  why: string;
};

/** Built from DOC_SPECS so the two cannot drift. Test C1 asserts the identity. */
function specDerivedSegments(t: DocType): readonly SegmentKind[] {
  const spec = DOC_SPECS.find((s) => s.doc_type === t);
  return spec ? spec.permitted_segments : [];
}

export const CLIENT_DOC_RECEIPT_POLICY: readonly ClientDocReceiptPolicy[] = [
  {
    doc_type: 'PLANNING',
    mode: 'SPEC_DERIVED',
    retained_segments: specDerivedSegments('PLANNING'),
    roles_to_triage: [
      { role: 'OFFICER_OR_CASE_OFFICER', frequency: 'always', note: 'the delegated signatory on the decision notice' },
      { role: 'TRANSACTION_PARTY', frequency: 'sometimes', note: 'the applicant, where the surgery is personally held' },
      { role: 'AGENT_OR_REPRESENTATIVE', frequency: 'sometimes' },
      {
        role: 'PLANNING_OBJECTOR_OR_CONSULTEE', frequency: 'always',
        note: 'NO LAWFUL BASIS. Removed on receipt by NEVER_RETAINED_ON_RECEIPT — must never reach triage at all',
      },
    ],
    why:
      'The sharpest case in the set. Condition LIA-C10 excludes planning names from the planning API; it does not ' +
      'govern a planning PDF a client emails in, and the pipeline header says so in terms. Three segment kinds ' +
      'carry the Class D population and all three are on NEVER_RETAINED_ON_RECEIPT. What survives is a reference, ' +
      'a decision, a date, a description of works and the plant conditions — nothing about anybody.',
  },
  {
    doc_type: 'FIRE_RISK_ASSESSMENT',
    mode: 'SPEC_DERIVED',
    retained_segments: specDerivedSegments('FIRE_RISK_ASSESSMENT'),
    roles_to_triage: [
      { role: 'PROFESSIONAL_CERTIFIER', frequency: 'always', note: 'the assessor, with membership or registration number' },
      { role: 'TRANSACTION_PARTY', frequency: 'sometimes', note: 'the "responsible person" — may be the client' },
      { role: 'PERSON_NAMED_IN_PROSE', frequency: 'always', note: 'named fire marshals and key holders' },
      {
        role: 'PERSON_IN_EVACUATION_PLAN', frequency: 'sometimes',
        note:
          'POSSIBLE SPECIAL CATEGORY DATA. A personal emergency evacuation plan names a resident and states why ' +
          'they cannot use the stairs. Board item 12928031578 is checking the "no special category data" position ' +
          'against a real FRA. [VERIFY] — no real FRA has been examined by anybody on this board',
      },
    ],
    why:
      'FINDINGS and SURVEY_RESULTS carry the life-safety plant, which is a large qualifying category. A PEEP is ' +
      'not ordinarily under either heading, but the segmenter is heading-driven and a PEEP under an unrecognised ' +
      'heading becomes UNCLASSIFIED, which this policy removes. That is the fail-closed behaviour working, and it ' +
      'is not a substitute for board item 12928031578 answering the Article 9 question.',
  },
  {
    doc_type: 'OM_MANUAL',
    mode: 'SPEC_DERIVED',
    retained_segments: specDerivedSegments('OM_MANUAL'),
    roles_to_triage: [
      { role: 'PROFESSIONAL_CERTIFIER', frequency: 'always', note: 'the commissioning engineer, where a signature appears' },
      { role: 'AGENT_OR_REPRESENTATIVE', frequency: 'usually', note: 'a named individual at a corporate maintenance contractor' },
    ],
    why:
      'The thinnest population of the eleven and the richest extraction: a plant schedule is a fixture inventory ' +
      'somebody else already built. PLANT_SCHEDULE alone is retained; the commissioning sign-off is SIGNATORIES ' +
      'and is not.',
  },
  {
    doc_type: 'ASBESTOS_REGISTER',
    mode: 'SPEC_DERIVED',
    retained_segments: specDerivedSegments('ASBESTOS_REGISTER'),
    roles_to_triage: [
      { role: 'PROFESSIONAL_CERTIFIER', frequency: 'always', note: 'the surveyor and the analyst' },
      { role: 'TRANSACTION_PARTY', frequency: 'sometimes', note: 'the duty holder' },
      { role: 'PERSON_NAMED_IN_PROSE', frequency: 'sometimes', note: 'persons identified as at risk, or as having been informed' },
    ],
    why: 'SURVEY_RESULTS dates the original installation, which bears on repairs versus capital. Nothing else is needed.',
  },
  {
    doc_type: 'INSURANCE_REINSTATEMENT',
    mode: 'SPEC_DERIVED',
    retained_segments: specDerivedSegments('INSURANCE_REINSTATEMENT'),
    roles_to_triage: [
      { role: 'PROFESSIONAL_CERTIFIER', frequency: 'always', note: 'the valuer, with RICS registration' },
      { role: 'TRANSACTION_PARTY', frequency: 'sometimes', note: 'the insured — may be the client' },
    ],
    why: 'The VALUATION segment is the only independent cross-check on rebuild cost. The valuer\'s name is in the certification block, which is not retained.',
  },
  {
    doc_type: 'LEASE',
    mode: 'SPEC_DERIVED',
    retained_segments: specDerivedSegments('LEASE'),
    roles_to_triage: [
      {
        role: 'ATTESTING_WITNESS', frequency: 'always',
        note:
          'ALWAYS a natural person — a company cannot witness a signature. Named with an address and often an ' +
          'occupation, which is MORE personal data than Item 5 condition LIA-C5 permits Caprebate to keep about a ' +
          'person with significant control. The least connected person in the document',
      },
      { role: 'TRANSACTION_PARTY', frequency: 'sometimes', note: 'landlord and tenant; the tenant is often the client' },
      { role: 'GUARANTOR', frequency: 'usually', note: 'a director personally guaranteeing a practice lease — the document discloses their personal financial exposure' },
      { role: 'AGENT_OR_REPRESENTATIVE', frequency: 'sometimes', note: 'managing agent; any individual named to determine a rent review' },
      { role: 'INDIVIDUAL_SIGNATORY', frequency: 'always' },
    ],
    why:
      'DEMISE_AND_TERM and COVENANTS carry entitlement and the landlord contribution. The parties clause and the ' +
      'execution block carry the landlord, the tenant, the guarantor and the witnesses, and NO FIELD NEEDS EITHER. ' +
      'This is the type where the receipt strip removes the most people for the least cost.',
  },
  {
    doc_type: 'CONTRACTOR_COST_BREAKDOWN',
    mode: 'SPEC_DERIVED',
    retained_segments: specDerivedSegments('CONTRACTOR_COST_BREAKDOWN'),
    roles_to_triage: [
      { role: 'PROFESSIONAL_CERTIFIER', frequency: 'always', note: 'the quantity surveyor or commercial manager, where signed' },
      { role: 'INDIVIDUAL_SIGNATORY', frequency: 'always', note: 'where signed' },
    ],
    why: 'COST_SCHEDULE and PRELIMS_AND_FEES are actual cost, which beats a cost model. The signature block is not needed for any of it.',
  },
  {
    doc_type: 'BUILDING_REGS_COMPLETION',
    mode: 'SPEC_DERIVED',
    retained_segments: specDerivedSegments('BUILDING_REGS_COMPLETION'),
    roles_to_triage: [
      { role: 'INDIVIDUAL_SIGNATORY', frequency: 'always', note: 'the certificate signatory' },
      {
        role: 'PROFESSIONAL_CERTIFIER', frequency: 'sometimes',
        note:
          'an approved inspector, as distinct from a local authority. Whether an approved inspector may be an ' +
          'individual under the Building Safety Act 2022 regime is [VERIFY] — that Act has not been read. ' +
          'brc_issuing_body therefore carries a discriminant in assertClaimsWritable()',
      },
      { role: 'TRANSACTION_PARTY', frequency: 'sometimes', note: 'a named owner or applicant on the certificate' },
    ],
    why:
      'CERTIFICATE_BODY confirms what was actually built and signed off, and dates it. Thinnest population of the ' +
      'eleven and the type most likely to name nobody but a signatory — who is in the block that is not retained.',
  },
  {
    doc_type: 'GRANT_FUNDING_AGREEMENT',
    mode: 'SPEC_DERIVED',
    retained_segments: specDerivedSegments('GRANT_FUNDING_AGREEMENT'),
    roles_to_triage: [
      { role: 'INDIVIDUAL_SIGNATORY', frequency: 'always', note: 'signatories on both sides' },
      { role: 'OFFICER_OR_CASE_OFFICER', frequency: 'usually', note: 'a named grant officer or contact, where present' },
    ],
    why:
      'FUNDING_TERMS and FUNDING_SCHEDULE carry the s.532 facts. The funder is specified as a body and the spec ' +
      'says so in a note — Phase 40 §4.2 records that the note is enforced nowhere. It is now, by the ' +
      'funder_is_body discriminant in assertClaimsWritable(). grant_purpose_description is captured VERBATIM, so ' +
      'the human-capture rule in section 5 applies to it even on the model path.',
  },
  /*
   * THE TAX RETURN AND THE TAX COMPUTATION — Phase 151b, 25 September 2026.
   *
   * Word question 223. The data protection officer, relayed by Lakhbir on 24
   * September 2026: "yes, clients may upload tax returns and tax computations.
   * Still open: what must be removed from them. Until the officer says
   * otherwise we will treat them like the other financial documents: keep the
   * figures and the company details, and remove individuals' names, addresses
   * and tax references." These two entries are that rule, in the same shape as
   * every other SPEC_DERIVED type: what is kept is exactly the spec's permitted
   * segments, and everything else is removed on receipt.
   *
   * THE COMPANY'S OWN TAX REFERENCE IS A COMPANY DETAIL, AND IS KEPT. Decided
   * here from the legal-form test in section 2 (classifyPartyReference) and the
   * name exclusion register it applies unchanged: for a BODY_CORPORATE or an
   * LLP "the name identifies a legal entity, not a natural person", and the
   * register already keeps a company's own identifier (company_number on the
   * Companies House entry). A company's UTR identifies the company in exactly
   * the way its number does, so it stays with the company details. A sole
   * trader's UTR is the opposite case, for the reason the register gives for a
   * sole trader's trading name: there is no legal identity separate from the
   * individual, so the reference IS the person's. It is removed. Because the
   * strip reads headings and cannot see legal form, only a heading that names
   * the COMPANY lands in TAX_ENTITY_DETAILS; a bare "Tax reference" or "UTR"
   * heading is UNCLASSIFIED and goes, since it cannot say whose it is. No
   * field extracts any tax reference: nothing a claim computes needs one.
   */
  {
    doc_type: 'TAX_RETURN',
    mode: 'SPEC_DERIVED',
    retained_segments: specDerivedSegments('TAX_RETURN'),
    roles_to_triage: [
      {
        role: 'TRANSACTION_PARTY', frequency: 'sometimes',
        note:
          'the taxpayer. A company is not a data subject; a sole trader, and each partner on a partnership return, ' +
          'always is — their name, home address, National Insurance number and tax reference are in the personal ' +
          'details, which are not kept',
      },
      { role: 'INDIVIDUAL_SIGNATORY', frequency: 'always', note: 'whoever signs the declaration — a director, the taxpayer, or someone they authorise' },
      { role: 'AGENT_OR_REPRESENTATIVE', frequency: 'usually', note: 'the accountant or tax agent who prepared it. The firm is not a data subject; a named individual at it is' },
      { role: 'PERSON_NAMED_IN_PROSE', frequency: 'sometimes', note: 'a director or partner named anywhere else on the return' },
    ],
    why:
      'Kept: the company details (the company\'s name, its company number, its own tax reference and the period), the ' +
      'profits and the capital allowances claimed, pool by pool. Removed on receipt: every individual\'s name, address, ' +
      'National Insurance number and personal tax reference, the preparer, the signature and the declaration. ' +
      'A SOLE TRADER\'S RETURN IS THE HARD CASE, BECAUSE THE TAXPAYER IS A PERSON. What survives is the period, the ' +
      'profit and the allowances, which are figures about the business. What does not survive is everything that says ' +
      'who they are: their name, their business name (which is their name), their address, their National Insurance ' +
      'number and their tax reference — all under personal or business-details headings, none of which is kept. ' +
      'The figures are still about one person\'s income, and keeping them is the officer\'s rule until question 223 ' +
      'says otherwise. HONEST WEAKNESS: the strip reads headings, so a name written inside a kept section — a figure ' +
      'labelled with a partner\'s name — is kept as text. The model boundary\'s name check refuses such a section before ' +
      'any model sees it, and no field can hold a name, but neither removes it from the kept text.',
  },
  {
    doc_type: 'TAX_COMPUTATION',
    mode: 'SPEC_DERIVED',
    retained_segments: specDerivedSegments('TAX_COMPUTATION'),
    roles_to_triage: [
      { role: 'AGENT_OR_REPRESENTATIVE', frequency: 'usually', note: 'the preparer — named in a "prepared by" line, which is not kept' },
      { role: 'TRANSACTION_PARTY', frequency: 'sometimes', note: 'the taxpayer, where a sole trader or a partner — then always a person' },
      { role: 'INDIVIDUAL_SIGNATORY', frequency: 'sometimes', note: 'where a director or the taxpayer signs to approve it' },
      {
        role: 'PERSON_NAMED_IN_PROSE', frequency: 'sometimes',
        note:
          'a director\'s car in a single asset pool, a director\'s loan, a named benefit in kind — a person can be ' +
          'named inside the figures themselves',
      },
    ],
    why:
      'Kept: the pool figures — each pool\'s balance, the annual investment allowance used, the allowances claimed — ' +
      'the profit position, and the company details. Removed on receipt: the preparer\'s name, any signature or ' +
      'approval, and an individual taxpayer\'s name, address, tax reference and National Insurance number. For a sole ' +
      'trader the same line holds as on the return: the figures stay, and nothing that says who they are does. ' +
      'HONEST WEAKNESS, the same as the return\'s and sharper here: a private-use asset is often labelled with the ' +
      'person who uses it ("director\'s car"), inside the capital allowances section that is kept. The strip cannot ' +
      'see it; the model boundary refuses such a section, and no field holds a name.',
  },
  {
    doc_type: 'CPSE_REPLIES',
    mode: 'WHOLE_DOCUMENT_PENDING_HUMAN_READ',
    retained_segments: [],
    roles_to_triage: [
      { role: 'TRANSACTION_PARTY', frequency: 'sometimes', note: 'the Seller — this is class P2 proper' },
      { role: 'PROFESSIONAL_CERTIFIER', frequency: 'always', note: 'the named fee earner who signed the replies. The firm is never a data subject; the fee earner always is' },
      {
        role: 'PERSON_NAMED_IN_PROSE', frequency: 'usually',
        note:
          'occupiers, tenants, a neighbour in a boundary dispute, a person who carried out unauthorised works. ' +
          'CPSE enquiries ask about disputes, notices, adverse rights and occupiers, and the replies name people',
      },
    ],
    why:
      'HONEST WEAKNESS, STATED RATHER THAN ENGINEERED AROUND. A person has to read the whole document, so a ' +
      'spec-derived strip is not available: cpse_ca_reply_text is captured verbatim and there is no heading rule ' +
      'that reliably locates it. The three NEVER_RETAINED_ON_RECEIPT kinds are still removed. Everything else is ' +
      'retained until the human read completes, and the compensating controls are the capture rule in section 5 ' +
      '(which is what stops the name reaching a structured field) and the retention clock in section 7 (which is ' +
      'what stops the document sitting there afterwards). Neither is a substitute for the strip and this module ' +
      'does not present them as one.',
  },
  {
    doc_type: 'SALE_CONTRACT',
    mode: 'WHOLE_DOCUMENT_PENDING_HUMAN_READ',
    retained_segments: [],
    roles_to_triage: [
      { role: 'ATTESTING_WITNESS', frequency: 'always', note: 'ALWAYS a natural person' },
      { role: 'TRANSACTION_PARTY', frequency: 'sometimes', note: 'seller and buyer' },
      { role: 'GUARANTOR', frequency: 'usually' },
      {
        role: 'INDIVIDUAL_SIGNATORY', frequency: 'always',
        note:
          'including an attorney signing under a power of attorney, and a personal representative where a seller ' +
          'has died — in which case the document discloses the fact of the appointment and by implication the death',
      },
      { role: 'PROFESSIONAL_CERTIFIER', frequency: 'always', note: 'the named conveyancing fee earner' },
    ],
    why:
      'Same honest weakness as CPSE_REPLIES, and the higher-population of the two: the witnesses are always ' +
      'natural persons and the execution block is the point of the document. contract_schedule_index is captured ' +
      'in full deliberately, which means the human capture rule in section 5 is the operative control here.',
  },
];

export function receiptPolicyFor(t: DocType): ClientDocReceiptPolicy {
  const p = CLIENT_DOC_RECEIPT_POLICY.find((x) => x.doc_type === t);
  if (!p) {
    throw new ClientDocIngestionError(
      'E_NO_RECEIPT_POLICY',
      `document type '${t}' has no receipt policy — it may not be written to storage at all. ` +
        'A new document type must earn a policy entry before an upload of it can be stored ' +
        '(fail closed, on the same discipline as the name exclusion register\'s Part E).',
      { doc_type: t },
    );
  }
  return p;
}

export type ReceiptResult = {
  doc_id: string;
  doc_type: DocType;
  mode: RetentionMode;
  /** The ONLY extracted text that may be written onward. */
  retained: Segment[];
  /**
   * Removed FROM THE EXTRACTED TEXT, before that text is written onward.
   *
   * CORRECTED BY PHASE 44 (item 12928214881), and the correction matters. This
   * does NOT mean the content has been removed from the uploaded file. It has
   * not: applyReceiptPolicy takes Segment[] and returns Segment[], and never
   * touches the file. Under every boundary model in BOUNDARY_POSITION except
   * SERVER_MEDIATED_UPLOAD, the file already exists in storage when this runs,
   * and everything listed here is still in it. What happens to the file is
   * governed by the quarantine discharge in section 1B and the retention rule
   * in section 7 — not by this function.
   *
   * Note also what this list carries and what it does not: kind, heading, page
   * and reason — never the text. The pipeline's sanitise() takes the same care
   * with its `dropped` list for the same reason, and a removal log that quoted
   * the content would recreate the exposure it exists to record.
   */
  removed: { kind: SegmentKind; heading: string; page: number; reason: RemovalReason }[];
};

/**
 * THE STRIP — ON THE EXTRACTED TEXT.
 *
 * WHAT THIS FUNCTION DOES: it decides which extracted segments may be written
 * onward, per document type, and refuses to return a NO_LAWFUL_BASIS kind
 * under any setting. That is real and it is the control condition A14-D4 needs.
 *
 * WHAT IT DOES NOT DO, corrected by Phase 44 (item 12928214881): it does not
 * alter the uploaded file, and it does not run before the file is in storage.
 * Phase 41 described it as running "before anything is written to durable
 * storage" and as dropping segments "out of the document". Both were written
 * from an incomplete picture of the upload path — the architecture of record
 * has the browser writing to S3 by pre-signed URL, so the file is in storage
 * before any Caprebate code sees it. Section 1A records the boundary this
 * codebase now assumes and why; section 1B holds the mechanism that bounds it.
 *
 * The asymmetry with sanitise() is therefore narrower than Phase 41 claimed,
 * and stating it accurately is the point: sanitise() decides what reaches a
 * MODEL; this decides what reaches STORAGE AS TEXT and what the rest of the
 * system may ever see. Both operate on a document already held. The control
 * that operates on the file is the quarantine discharge, not this.
 */
export function applyReceiptPolicy(
  doc_id: string,
  doc_type: DocType,
  segments: readonly Segment[],
): ReceiptResult {
  const policy = receiptPolicyFor(doc_type);
  const retained: Segment[] = [];
  const removed: ReceiptResult['removed'] = [];

  for (const s of segments) {
    // Absolute, first, and before any mode branch: no lawful basis beats every
    // other consideration including a human's need to read the document.
    if (NEVER_RETAINED_ON_RECEIPT.includes(s.kind)) {
      removed.push({ kind: s.kind, heading: s.heading, page: s.page, reason: 'NO_LAWFUL_BASIS' });
      continue;
    }

    if (policy.mode === 'WHOLE_DOCUMENT_PENDING_HUMAN_READ') {
      // Everything else is retained, including UNCLASSIFIED. Stated in the
      // policy's `why` as an honest weakness rather than hidden here.
      retained.push(s);
      continue;
    }

    if (s.kind === 'UNCLASSIFIED') {
      removed.push({ kind: s.kind, heading: s.heading, page: s.page, reason: 'UNCLASSIFIED_FAILS_CLOSED' });
      continue;
    }
    if (!policy.retained_segments.includes(s.kind)) {
      removed.push({ kind: s.kind, heading: s.heading, page: s.page, reason: 'NO_FIELD_NEEDS_IT' });
      continue;
    }
    retained.push(s);
  }

  // Belt and braces, on the pipeline's own L4 pattern: re-assert the absolute
  // rule against the output rather than trusting the loop above.
  const leaked = retained.find((s) => NEVER_RETAINED_ON_RECEIPT.includes(s.kind));
  if (leaked) {
    throw new ClientDocIngestionError(
      'E_NEVER_RETAINED_SEGMENT_KEPT',
      `segment kind '${leaked.kind}' was retained on receipt. Caprebate has NO LAWFUL BASIS ` +
        'for this content (Item 5 §4.4, Class D) — it is not a minimisation preference.',
      { doc_id, doc_type, kind: leaked.kind, heading: leaked.heading },
    );
  }

  return { doc_id, doc_type, mode: policy.mode, retained, removed };
}

/* ------------------------------------------------------------------ *
 * 4. WIRING assertNoUnauthorisedName INTO THE UPLOAD PATH
 *
 * The register's Part D states the call sequence for a connector: retrieve ->
 * assertNoUnauthorisedName(record) -> write. If the assertion throws, the write
 * never happens, and the connector lets the error propagate rather than
 * catching it and silently skipping the field. The upload path has no
 * connector, so this function is its equivalent, and it obeys the same rule.
 * ------------------------------------------------------------------ */

/**
 * The two conditional keep-fields. Both are kept because the specification
 * says the value is an organisation; neither can be checked by the register,
 * which sees field names and not values. So the caller must assert the fact,
 * on the same pattern Exception 2 uses for proprietorType — and, exactly as
 * there, an omitted discriminant fails closed rather than open.
 */
export type ClientDocDiscriminants = {
  /** GRANT_FUNDING_AGREEMENT: grant_funder_name names a funding body, not an individual. */
  funder_is_body?: boolean;
  /** BUILDING_REGS_COMPLETION: brc_issuing_body names an organisation, not an individual approved inspector. */
  issuing_body_is_organisation?: boolean;
};

const CONDITIONAL_FIELDS: readonly {
  field: string;
  flag: keyof ClientDocDiscriminants;
  why: string;
}[] = [
  {
    field: 'grant_funder_name',
    flag: 'funder_is_body',
    why:
      "the GRANT_FUNDING_AGREEMENT spec's own field note says 'the funding body, not an individual'. " +
      'Phase 40 §4.2 found the note is enforced nowhere. This is the enforcement.',
  },
  {
    field: 'brc_issuing_body',
    flag: 'issuing_body_is_organisation',
    why:
      'the BUILDING_REGS_COMPLETION spec distinguishes a local authority from an approved inspector. ' +
      'Whether an approved inspector may be an individual under the Building Safety Act 2022 regime is ' +
      '[VERIFY] — the Act has not been read by anybody on this board, so the fail-closed reading applies.',
  },
];

/**
 * Call BEFORE the claims from toClaims() are written. Throws
 * NameExclusionError from the register's own assertion for an unauthorised or
 * uncatalogued field, and ClientDocIngestionError for a conditional field
 * whose discriminant was not supplied.
 *
 * `claims` is deliberately typed structurally rather than importing ClaimSpec,
 * so that a caller holding either a ClaimSpec[] (model path) or a
 * HumanCaptureResult's fields (human path) can use the same function. The two
 * paths must not have two different name controls; that is exactly the split
 * that produced this phase.
 */
export function assertClaimsWritable(
  claims: readonly { field_id: string; source_id?: string }[],
  discriminants: ClientDocDiscriminants = {},
): void {
  const fields: Record<string, unknown> = {};
  for (const c of claims) {
    if (c.source_id !== undefined && c.source_id !== 'CLIENT_DOC') {
      // Not an error here — it is the register's to raise, and it will, via
      // findPolicy's fail-closed lookup on whatever source id was passed.
      assertNoUnauthorisedName({ sourceId: c.source_id, entityId: '(client-doc)', fields: { [c.field_id]: null } });
      continue;
    }
    fields[c.field_id] = null; // the register classifies by field NAME, never by value
  }

  for (const cf of CONDITIONAL_FIELDS) {
    if (!(cf.field in fields)) continue;
    if (discriminants[cf.flag] !== true) {
      throw new ClientDocIngestionError(
        'E_CONDITIONAL_FIELD_UNDISCRIMINATED',
        `'${cf.field}' was written but '${cf.flag}' is ` +
          `'${String(discriminants[cf.flag])}', not true — refused. The field is kept on the ` +
          `CLIENT_DOC keep list only on the footing that the value names an organisation: ${cf.why}`,
        { field: cf.field, flag: cf.flag, supplied: discriminants[cf.flag] },
      );
    }
  }

  const rec: IngestedRecord = { sourceId: 'CLIENT_DOC', entityId: '(client-doc)', fields };
  assertNoUnauthorisedName(rec); // throws NameExclusionError; let it propagate
}

/* ------------------------------------------------------------------ *
 * 5. THE HUMAN-CAPTURE RULE — Phase 40 condition A14-D3
 *
 * CPSE_REPLIES and SALE_CONTRACT are HUMAN_READ_ONLY and their specs capture
 * reply text VERBATIM. A person keying that in passes through no control at
 * all: the four layers, the drop list, the L4 scrubber and the E_PERSON_NAME
 * egress refusal are ALL model-boundary controls, and these two types never
 * touch the model path.
 *
 * "Do not type in names" is advisory and advisory is not a control. What
 * follows is enforceable, in two layers, and it is honest about which layer
 * does the work — the same honesty the pipeline shows about its own L4.
 *
 *   LAYER 1, STRUCTURAL, and this is the one that works. The reviewer does not
 *   supply raw verbatim text. They supply text in which every name has been
 *   replaced by a ROLE TOKEN — [SELLER], [BUYER], [WITNESS], [NAMED
 *   INDIVIDUAL], [FEE EARNER] — and they state how many substitutions they
 *   made. A verbatim field is accepted only with an explicit attestation that
 *   the rule was applied. No attestation, no capture. This preserves the
 *   evidential point the DPIA §6 makes for verbatim capture — the qualification
 *   "not so far as the Seller is aware" survives a role token intact, because
 *   the token is where the name was and the wording around it is untouched.
 *
 *   LAYER 2, PATTERN MATCHING, and it is the backstop and nothing more. The
 *   same PERSON_NAME_PATTERNS the pipeline uses at L4, applied to the captured
 *   value. The pipeline's own header says pattern matching is never complete
 *   and its test P26 demonstrates it missing a bare name in running prose.
 *   That is equally true here and this module claims nothing more for it.
 * ------------------------------------------------------------------ */

export const ROLE_TOKENS: readonly string[] = [
  '[SELLER]', '[BUYER]', '[LANDLORD]', '[TENANT]', '[GUARANTOR]', '[WITNESS]',
  '[FEE EARNER]', '[SIGNATORY]', '[OCCUPIER]', '[NEIGHBOUR]', '[NAMED INDIVIDUAL]',
];

/** The fields captured verbatim, across both paths. Phase 40 §4.7. */
export const VERBATIM_FIELDS: readonly string[] = [
  'cpse_ca_question_text',
  'cpse_ca_reply_text',
  'cpse_election_reference',
  'contract_schedule_index',
  'grant_purpose_description',
];

export type HumanCaptureAttestation = {
  field_id: string;
  value: unknown;
  /**
   * Set true by the reviewer to state that they read the source text, and that
   * every natural person's name in it has been replaced by a role token. This
   * is a statement of fact by a named person, recorded against their name and
   * the timestamp captureHumanRead() already records — not a checkbox with no
   * consequence.
   */
  names_replaced_with_role_tokens: boolean;
  /** How many substitutions were made. Zero is permitted and is a positive assertion that the text named nobody. */
  substitutions: number;
};

/**
 * The person-name patterns are imported by re-declaration rather than by
 * import, deliberately: the pipeline's PERSON_NAME_PATTERNS is tuned for a
 * model payload built from document segments, and this is applied to a short
 * captured string. Keeping them separate means tightening one cannot silently
 * loosen the other. The overlap is intentional and both are backstops.
 */
export const CAPTURE_NAME_PATTERNS: readonly RegExp[] = [
  /\b(Mr|Mrs|Ms|Miss|Dr|Prof|Sir|Dame|Lord|Lady)\.?\s+[A-Z][a-z]+/,
  /\bon behalf of\s+[A-Z][a-z]+\s+[A-Z][a-z]+/,
  /\b(signed|witnessed|attested)\s+by\s+[A-Z][a-z]+\s+[A-Z][a-z]+/i,
  /\byours\s+(sincerely|faithfully)\b/i,
];

/**
 * Call for EVERY field a human captures, before captureHumanRead()'s output
 * reaches toClaims(). Throws rather than scrubbing: a silent scrub hides the
 * fact that the rule was not applied, which is the pipeline's own stated
 * reason for refusing rather than redacting at L4.
 */
export function assertHumanCaptureClean(a: HumanCaptureAttestation): void {
  const isVerbatim = VERBATIM_FIELDS.includes(a.field_id);

  if (isVerbatim && !a.names_replaced_with_role_tokens) {
    throw new ClientDocIngestionError(
      'E_CAPTURE_NOT_ATTESTED',
      `'${a.field_id}' is captured verbatim and the reviewer has not attested that names were ` +
        'replaced with role tokens. Verbatim capture is the vector (Phase 40 §4.7) and the ' +
        'attestation is the control — an unattested verbatim capture is refused, not accepted ' +
        'and flagged.',
      { field_id: a.field_id },
    );
  }

  if (typeof a.value !== 'string') return; // a number, a date or a list carries no name

  const hit = CAPTURE_NAME_PATTERNS.find((p) => p.test(a.value as string));
  if (hit) {
    throw new ClientDocIngestionError(
      'E_CAPTURE_NAME_PRESENT',
      `a person-name pattern matched the captured value for '${a.field_id}'. Replace the name ` +
        `with a role token (${ROLE_TOKENS.slice(0, 4).join(', ')}, …) and capture again. ` +
        'NOTE: this is a backstop. Pattern matching is never complete — a bare name in running ' +
        'prose passes it, exactly as pipeline test P26 demonstrates. The control is the ' +
        'reviewer applying the rule; this only catches the cases it happens to catch.',
      { field_id: a.field_id, pattern: String(hit) },
    );
  }
}

/* ------------------------------------------------------------------ *
 * 6. THE PER-UPLOAD TRANSPARENCY RECORD — conditions A14-D1, A14-D2 and A14-D5
 *
 * Phase 40 §11: nothing anywhere records that an Article 14 notice was sent to
 * a named individual, and this population is worse off than the register
 * population because it has no store at all to add a field to.
 *
 * THE CHAPEAU IS WHY THIS IS PER PERSON. Article 14(5) was substituted on
 * 5 February 2026 to read "do not apply TO THE EXTENT THAT" (Phase 40 §1.3,
 * annotation F7, read in the current text on legislation.gov.uk). So reliance
 * on the exemption is a per-person, per-item assertion, and a position that
 * cannot be evidenced person by person is not a position.
 *
 * THE DESIGN CONSTRAINT THAT SHAPES EVERYTHING BELOW — RESTATED 1 Sep 2026
 * (Phase 60). This block used to say that Caprebate' structured
 * records contain no third-party name by design, and that a compliance record
 * keyed by name would destroy that. Q37 has since been answered — "we can hold
 * the details in our custom backend" — so a name-bearing identity store IS
 * being built, deliberately. The old rationale is withdrawn. The RULE it
 * produced is kept, on better footing:
 *
 *   THE CLAIM RECORD STILL HOLDS NO THIRD-PARTY NAME. assertClaimsWritable and
 *   the empty nameExceptions on the CLIENT_DOC policy entry are unchanged, and
 *   they are now the load-bearing guarantee rather than one of two.
 *
 *   person_ref STAYS OPAQUE BECAUSE IT IS THE JOIN — between the claim record,
 *   the raw file and the identity store. A name in the join propagates into
 *   every record that carries it, which is precisely what assertClaimsWritable
 *   exists to prevent. Not "we hold no names": we hold them in ONE place, and
 *   the join is what would spread them everywhere else.
 *
 * assertTransparencyRecordComplete still refuses a name-shaped ref (test T7,
 * unchanged and passing). Article 11(2) is NO LONGER AVAILABLE for this
 * population and must not be claimed — a controller with a name index is in a
 * position to identify, so Articles 15 to 20 apply in full. Phase 40's L5 is
 * withdrawn as resolved-by-decision, not answered.
 *
 * DO NOT implement the reversal by adding a third nameException to the
 * CLIENT_DOC entry. The exception is a separate store with its own rule — see
 * the Dashboard Data Specification (board item 12948738680) and the Phase 41
 * reconciliation (item 12928074627, Document 2). No behaviour changed here.
 * ------------------------------------------------------------------ */

export type RouteGroup =
  /** A route exists on the face of the document. Notify — the exemption is not available. */
  | 'R_A'
  /** No route. This is where Article 14(5)(e) lives. */
  | 'R_B';

export type NoticeRoute = 'DIRECT_POST' | 'DIRECT_EMAIL' | 'VIA_CLIENT';

export type IdentifiedPerson = {
  /**
   * OPAQUE. A per-document reference such as 'LEASE-2026-0007/witness-1'.
   * NEVER a name — see the section header.
   */
  person_ref: string;
  role: PersonRole;
  route_group: RouteGroup;
  /** Whether an address for this person appears on the face of the document. Drives the route group. */
  address_on_document: boolean;
  notice?: {
    template: 'BTC-T7';
    route: NoticeRoute;
    sent_at: string;
  };
  exemption?: {
    article: '14(5)(e)';
    /** Why, for THIS person and THIS document. A reason that would fit anybody is not a reason. */
    reason: string;
    recorded_by: string;
    recorded_at: string;
  };
};

export type TransparencyRecord = {
  doc_id: string;
  doc_type: DocType;
  /** When the document was OBTAINED. The Article 14(3)(a) month runs from here. */
  received_at: string;
  triaged_at?: string;
  people: IdentifiedPerson[];
};

export function openTransparencyRecord(doc_id: string, doc_type: DocType, received_at: string): TransparencyRecord {
  return { doc_id, doc_type, received_at, people: [] };
}

/** Route group follows from the document, not from convenience. Phase 40 §7.1. */
export function routeGroupFor(address_on_document: boolean): RouteGroup {
  return address_on_document ? 'R_A' : 'R_B';
}

const REF_LOOKS_LIKE_A_NAME = /(^|[^A-Za-z])(Mr|Mrs|Ms|Miss|Dr|Prof|Sir|Dame)\.?\s|^[A-Z][a-z]+\s+[A-Z][a-z]+$/;

/**
 * Call before the Article 14(3)(a) month expires. Throws unless EVERY
 * identified person has either a notice or a recorded exemption reason.
 *
 * Three separate refusals, and they are different in kind:
 *
 *   E_TRANSPARENCY_NO_BASIS_ROLE — a Class D person is in the record at all.
 *     There is no lawful basis for them, so there is nothing for a notice to
 *     describe and the exemption is not the answer either. The answer is not to
 *     hold it, and if one has reached triage then applyReceiptPolicy did not
 *     run or did not run first. This is the loop between condition A14-D4 and
 *     condition A14-D1 being closed.
 *
 *   E_TRANSPARENCY_REF_IS_NAME — a name is entering the JOIN. person_ref keys
 *     the claim record and the raw file as well as the identity store, so a
 *     name here spreads into records that are exported, reported on and handed
 *     to an accountant. The name belongs in the identity store, keyed by this
 *     reference. (Restated 1 Sep 2026, Phase 60 — the refusal is unchanged;
 *     its reason is no longer "we hold no names".)
 *
 *   E_TRANSPARENCY_PERSON_UNRESOLVED — the ordinary case: somebody has been
 *     identified and neither told nor recorded as exempt. Note that an R_A
 *     person can NEVER be resolved by the exemption: Phase 40 §7.5 concludes
 *     that one letter to an address printed on the document is not a
 *     disproportionate effort, it is an argument that fails.
 */
export function assertTransparencyRecordComplete(rec: TransparencyRecord): void {
  for (const p of rec.people) {
    if (NO_LAWFUL_BASIS_ROLES.includes(p.role)) {
      throw new ClientDocIngestionError(
        'E_TRANSPARENCY_NO_BASIS_ROLE',
        `person '${p.person_ref}' has role '${p.role}', for which Caprebate has NO LAWFUL ` +
          'BASIS AT ALL (Item 5 §4.4, Class D). A transparency notice cannot describe processing ' +
          'that has no basis. This person should have been removed from the extracted text by ' +
          'applyReceiptPolicy — check that it ran, and that it ran before the text was written ' +
          'onward. Note that this refusal says nothing about the FILE: see CONDITION_D4_STATUS.',
        { doc_id: rec.doc_id, person_ref: p.person_ref, role: p.role },
      );
    }

    if (REF_LOOKS_LIKE_A_NAME.test(p.person_ref)) {
      throw new ClientDocIngestionError(
        'E_TRANSPARENCY_REF_IS_NAME',
        `person_ref '${p.person_ref}' looks like a person's name. person_ref is the JOIN — it keys ` +
          'the claim record and the raw file as well as the identity store, so a name here ' +
          'propagates into records that are exported, reported on and handed to an accountant. ' +
          'The claim record holds no third-party name and that does not change. The name belongs ' +
          'in the identity store, keyed by this reference. Use an opaque per-document ' +
          "reference such as '<doc_id>/witness-1'.",
        { doc_id: rec.doc_id, person_ref: p.person_ref },
      );
    }

    if (p.notice) continue;

    if (p.route_group === 'R_A') {
      throw new ClientDocIngestionError(
        'E_TRANSPARENCY_PERSON_UNRESOLVED',
        `person '${p.person_ref}' is in route group R_A — an address for them is on the face of ` +
          'the document — and no notice is recorded. The Article 14(5)(e) exemption is NOT ' +
          'available for this person: one letter to an address already in front of the reader is ' +
          'not a disproportionate effort (Phase 40 §7.5). Send BTC-T7.',
        { doc_id: rec.doc_id, person_ref: p.person_ref, role: p.role },
      );
    }

    if (!p.exemption || p.exemption.reason.trim().length === 0) {
      throw new ClientDocIngestionError(
        'E_TRANSPARENCY_PERSON_UNRESOLVED',
        `person '${p.person_ref}' has neither a notice nor a recorded Article 14(5)(e) reason. ` +
          'The Article 14(5) chapeau was substituted on 5 February 2026 to read "do not apply TO ' +
          'THE EXTENT THAT", so reliance is a per-person, per-item assertion. A position that ' +
          'cannot be evidenced person by person is not a position.',
        { doc_id: rec.doc_id, person_ref: p.person_ref, role: p.role },
      );
    }
  }
}

/* ------------------------------------------------------------------ *
 * 7. RETENTION AND DELETION OF THE RAW FILE
 *
 * Distinct from RET-1 and RET-2, which are being derived for the DEFENCE PACK:
 * keep the evidence until the return can no longer be challenged. Nobody had
 * asked whether the raw uploaded file needs the same clock, and it matters
 * because the file is where every third-party name lives — the structured
 * records contain none.
 *
 * Q34 IS THE DECISION AND IT IS NOT MADE HERE. What is built here is the
 * mechanism, so that whichever way Q34 lands, deletion actually happens and is
 * evidenced. Phase 40 §10's own words: a retention rule with no deletion
 * mechanism is a retention rule that says "forever".
 *
 * WHAT FAIL-CLOSED MEANS FOR A RETENTION RULE, since it is the opposite of
 * what it means everywhere else in this codebase: everywhere else fail-closed
 * means refuse to act. Here it means DELETE SOONER. The default is therefore
 * the shorter clock, and choosing the longer one is an affirmative decision
 * somebody has to make and be recorded as making.
 * ------------------------------------------------------------------ */

/* ------------------------------------------------------------------ *
 * 7A. THE OPTION WITHDRAWN, AND WHY — Phase 44, board item 12928215019
 *
 * Phase 41 offered three retention rules. One of them,
 * RETAIN_REDACTED_DELETE_ORIGINAL — "keep a copy with the receipt strip
 * applied; delete the unredacted original" — had nothing behind it.
 * applyReceiptPolicy returns Segment[], which is text. There is no PDF,
 * image or OCR redaction anywhere in this codebase; there is no file handling
 * anywhere in this codebase at all. deletionDueAt treated the rule as
 * identical to DELETE_ON_EXTRACTION_COMPLETE, so not even the clock
 * distinguished it. redacted_copy_retained was a boolean a caller asserted.
 *
 * WHY THAT IS WORSE THAN A DORMANT ENUM MEMBER. This is the option Phase 40
 * §7.7 measure 2 recommends where deleting the source early is unacceptable,
 * and Q34 offers it to Lakhbir and the data protection officer as a live answer. A decision put
 * to a human with an option that cannot be performed is not a decision. If
 * they had picked it, the developer would have inherited a rule name and the
 * protection they thought they were buying would not exist.
 *
 * WHAT WAS DONE, AND WHY THIS RATHER THAN BUILDING IT. Withdrawn. Phase 44's
 * Part A lands on a quarantine step that DOES have the file in hand, which
 * makes a producer buildable where it previously was not — buildable, but not
 * built, and shipping an enum member whose guarantee nothing delivers is the
 * exact defect being fixed, not a smaller version of it. Real redaction means
 * destroying the underlying text: a black rectangle drawn over selectable text
 * is the classic way organisations publish the thing they thought they had
 * hidden, and a producer that did that would be worse than no producer,
 * because the flag would then be true. REDACTION_PRODUCER_CONTRACT below
 * states what has to exist before the rule comes back, so that reinstating it
 * is a build against a specification rather than a judgement call.
 *
 * FAIL-CLOSED CHECK. Withdrawing leaves DELETE_ON_EXTRACTION_COMPLETE (the
 * default, and the shortest clock) and RETAIN_FOR_DEFENCE_PERIOD. Removing
 * the middle option removes something that held LESS than the long clock, so
 * withdrawal is not automatically the safe direction — it is safe here only
 * because the middle option never actually held less than anything. It held
 * exactly what the long clock held, under a name that said otherwise.
 * ------------------------------------------------------------------ */

/** Withdrawn 30 August 2026. Kept as a type so the string stays knowable and refusable. */
export type WithdrawnRetentionRule = 'RETAIN_REDACTED_DELETE_ORIGINAL';

export const WITHDRAWN_RETENTION_RULES: readonly {
  rule: WithdrawnRetentionRule;
  withdrawn_on: string;
  board_item: string;
  reason: string;
  reinstate_when: string;
}[] = [
  {
    rule: 'RETAIN_REDACTED_DELETE_ORIGINAL',
    withdrawn_on: '2026-08-30',
    board_item: '12928215019',
    reason:
      'nothing in the codebase can produce the redacted copy the rule guarantees. The receipt strip ' +
      'returns extracted text, not a redacted file, and no redaction of any kind exists. The rule ' +
      'named a protection that did not exist and the deletion clock treated it as the extraction rule.',
    reinstate_when:
      'a producer satisfying REDACTION_PRODUCER_CONTRACT exists, is tested against a real scanned ' +
      'document as well as a born-digital one, and sets redacted_copy_retained from its own result.',
  },
];

/**
 * What a redaction producer must satisfy before RETAIN_REDACTED_DELETE_ORIGINAL
 * may return. Written as a contract rather than a to-do because the failure
 * mode here is a producer that appears to work.
 */
export const REDACTION_PRODUCER_CONTRACT: readonly string[] = [
  '1. it DESTROYS the underlying content. A drawn rectangle, a white fill, a clipping path or a ' +
    'page-level annotation is not redaction: the text is still selectable, extractable and indexed',
  '2. it handles the raster path. A large share of client uploads are scans and photographs, so the ' +
    'content is pixels; redacting the OCR layer while leaving the image is the same failure in reverse',
  '3. it removes the content from EVERY copy the format keeps — embedded thumbnails, incremental-save ' +
    'revisions, XMP and document metadata, attached files, and any prior version the object store holds',
  '4. it maps the removals from ReceiptResult.removed onto page regions, and refuses rather than ' +
    'guesses where a removed segment cannot be located on the page (fail closed, on this file\'s pattern)',
  '5. it VERIFIES its own output by re-extracting from the redacted artefact and asserting that no ' +
    'removed segment survives — and sets redacted_copy_retained from that assertion, never from a caller',
  '6. it runs inside the quarantine window (section 1B), on the object still in the quarantine prefix, ' +
    'so that what is promoted to the durable prefix is the redacted artefact and never the original',
];

/**
 * The two rules that are actually implementable.
 *
 * RETAIN_REDACTED_DELETE_ORIGINAL was here and is not: section 7A, and it is
 * refused at runtime by assertRetentionRuleImplementable() rather than merely
 * removed from the type, because settings arrive from configuration and a
 * type is not a runtime guard.
 */
export type RawFileRetentionRule =
  /** Delete the original once extraction is complete and checked. The default. */
  | 'DELETE_ON_EXTRACTION_COMPLETE'
  /** One clock for everything — the raw file lives as long as the defence pack. */
  | 'RETAIN_FOR_DEFENCE_PERIOD';

/**
 * Refuses a withdrawn rule. Called from deletionDueAt, so every path that
 * computes or enforces a deletion date passes through it.
 *
 * Fail-closed direction check: this REFUSES rather than silently substituting
 * the default, because a silent substitution would give somebody who had
 * chosen the redacted-copy option the extraction clock without telling them —
 * which is the right clock but the wrong way to arrive at it, and it would
 * hide exactly the fact this phase exists to surface.
 */
export function assertRetentionRuleImplementable(rule: string): void {
  const withdrawn = WITHDRAWN_RETENTION_RULES.find((w) => w.rule === rule);
  if (withdrawn) {
    throw new ClientDocIngestionError(
      'E_RETENTION_RULE_WITHDRAWN',
      `retention rule '${rule}' was withdrawn on ${withdrawn.withdrawn_on} (board item ` +
        `${withdrawn.board_item}): ${withdrawn.reason} Choose between ` +
        'DELETE_ON_EXTRACTION_COMPLETE and RETAIN_FOR_DEFENCE_PERIOD, or build a producer ' +
        'satisfying REDACTION_PRODUCER_CONTRACT and reinstate it.',
      { rule, board_item: withdrawn.board_item, reinstate_when: withdrawn.reinstate_when },
    );
  }
}

/* ------------------------------------------------------------------ *
 * 7B. THE ANSWER, AND THE CLOCK IT TURNS OUT TO NEED
 * Phase 65, board item 12878920167, 2 September 2026
 *
 * Q56 asked what Lakhbir meant by "keep it as redacted". Answered on
 * 2 September 2026: READING B — do not delete the client's document. No
 * redaction capability is bought or built and no per-document human step is
 * introduced.
 *
 * WHAT THE ANSWER DOES.
 *
 *   IT SELECTS AN EXISTING RULE. Reading B is RETAIN_FOR_DEFENCE_PERIOD, which
 *   section 7 already implements and tests R8 and X8 already hold. Q34's
 *   retention limb is answered by it.
 *
 *   IT DOES NOT REINSTATE RETAIN_REDACTED_DELETE_ORIGINAL. Reading A would
 *   have. Section 7A stands unchanged, assertRetentionRuleImplementable still
 *   refuses the withdrawn string, recordDeletion still refuses a retained
 *   redacted copy, and no producer exists. Worth stating because the two
 *   readings differ by one word in the answer and by a purchase in the
 *   consequence.
 *
 *   IT DOES NOT, ON ITS OWN, PRODUCE A DELETION DATE — and that is the part a
 *   one-line configuration change would have missed. RETAIN_FOR_DEFENCE_PERIOD
 *   reads defence_period_ends_at, which the schema documents as coming from
 *   the defence-pack clock, RET-1 and RET-2. RET-1 is an unset blank whose
 *   drafting defect is itself open as Q60. Select the rule, supply nothing,
 *   and deletionDueAt has no date to give: every retained file lands in
 *   DeletionSweep.undeletable, which test R9 already refuses to let pass
 *   quietly. So "keep it" without a clock is not the cheap answer it looks
 *   like. It is indefinite retention, arrived at by omission.
 *
 * SO THE CLOCK IS WIRED HERE. Phase 55 derived RET-7 for this exact file — six
 * years from the later of claim_period_end and report_delivered_at — and wrote
 * that a Reading B answer would carry the period, the instrument and the
 * trigger over to the original unchanged. RET7 below is that derivation as
 * data and ret7DueAt is the arithmetic.
 *
 * AND IT IS WIRED OFF, because a derived period is not an approved one. RET-7
 * belongs to the DPO and his appointment is not yet signed for, so
 * settings.ret7_approved defaults to false and the answer does not quietly
 * create a six-year retention period nobody signed. Fail-closed for an
 * unapproved clock is undeletable-and-surfaced rather than a date: a plausible
 * date would make the schedule look finished, which is the failure the
 * Developer Build Order already warns about in terms.
 *
 * THE CARVE-OUT PHASE 55 DID NOT HAVE. Retention Determinations 7.3 says a
 * Reading B answer changes "one sentence and no arithmetic". Right about the
 * arithmetic, one sentence short. deletionDueAt refuses the long clock to any
 * document whose strip removed NO_LAWFUL_BASIS content (condition A14-D4, section
 * 1C), and those fall back to the extraction clock. The instruction is
 * therefore honoured WITH A STATED EXCEPTION: some client documents will be
 * deleted despite an instruction to keep them, the exception is not
 * discretionary, and it is not a defect. It is condition A14-D4 doing its job.
 * ------------------------------------------------------------------ */

/** The answer, as data, so that what was decided reads next to what it selected. */
export const Q56_ANSWER = {
  question:
    'what did "keep it as redacted" mean — keep a properly redacted copy (Reading A), or simply do not ' +
    'delete the client document (Reading B)?',
  answered_on: '2026-09-02',
  answered_by: 'Lakhbir Dhillon, Head of Business Development',
  reading: 'B',
  in_terms:
    'do not delete the client document. No redaction tool is bought or built, and no per-document human ' +
    'redaction step enters the cost of a job.',
  selects_rule: 'RETAIN_FOR_DEFENCE_PERIOD',
  reinstates: null,
  clock: 'RET-7',
  exception:
    'a document whose receipt strip removed NO_LAWFUL_BASIS content. Condition A14-D4 removes the long clock ' +
    'for that class and deletionDueAt falls it back to the extraction clock, so it is deleted despite the ' +
    'instruction to keep it.',
  supersedes:
    'the fail-closed default DELETE_ON_EXTRACTION_COMPLETE, which was never a decision — FAIL_CLOSED_SETTINGS ' +
    'says so in terms and still holds it as the default for an unconfigured system.',
  board_items: ['12878920167', '12928215019', '12945903194'],
} as const;

/**
 * RET-7 as data. Derived by Phase 55 from the longest window in which somebody
 * could still act, and NOT approved — the approved flag is the only thing that
 * lets it compute a date in deletionDueAt.
 */
export const RET7 = {
  ref: 'RET-7',
  governs:
    'the client uploaded document. Phase 55 derived it for the extracted facts; Q56 Reading B carries it ' +
    'to the raw file as well.',
  period_years: 6,
  trigger: 'the later of claim_period_end and report_delivered_at',
  instruments: [
    'FA 1998 Sch 18 para 46(2) — discovery assessment where the loss of tax was brought about carelessly: ' +
      '6 years from the end of the accounting period',
    'TMA 1970 s.36(1) — the income tax equivalent: 6 years from the end of the year of assessment',
    'Limitation Act 1980 s.2 and s.5 — the claim the client may bring against us, which produce the same figure',
  ],
  excluded: [
    'the 20-year deliberate-behaviour window (FA 1998 Sch 18 para 46(2A); TMA 1970 s.36(1A)) — handled by ' +
      'legal hold on a named claim, not by the schedule',
    'the Limitation Act 1980 s.14B 15-year longstop — a longstop bars stale claims, it is not a period in ' +
      'which claims are expected. Legal hold again',
  ],
  derived_in: 'Retention Determinations, board item 12945903194, section 4.3',
  approved: false,
  approver: 'Sadique Maskeen, Data Protection Officer — the instrument of appointment is not yet signed',
  still_needed: 'the CTA confirming which return types are in scope. Q59, Q60 and Q61 all bear on it',
} as const;

const RET7_YEARS = 6;

/**
 * THE HOST'S BACKUP CYCLE — A NAMED BLANK. Phase 132, 14 September 2026.
 *
 * Retention Procedure 4.1 point 4: a record leaves the live systems at once and
 * the backups only when the backup cycle expires, "with no restoration of a
 * deleted record without the DPO's approval. The cycle length must be stated."
 * It is NOT SET. Nobody has asked the host in writing whether the client-document
 * folders can be left out of the nightly whole-site backup, and until somebody
 * has, a file deleted from disk may still be alive in a copy.
 *
 * SO EVERY DELIVERED DELETION CARRIES THE BLANK, NOT A GUESS. recordDeletion
 * writes the cycle onto the evidence itself — a caller never supplies it — and
 * while the cycle is not known the evidence says backups are still pending, with
 * no cycle and no expiry. A cycle recorded as not known and a cycle never set are
 * the same fact (N4): neither becomes zero, neither becomes "no backups", and
 * neither lets RET-3 start its clock.
 *
 * `days` is the length of the cycle in whole days once it is known; 0 would mean
 * the folders are excluded and no copy survives. Only a cycle whose state is SET
 * is read at all. Setting it is the data protection officer's and the
 * developer's act, and one line here.
 */
export type BackupCycleState = 'NOT_SET' | 'UNKNOWN' | 'SET';

export type BackupCycle = {
  readonly days: number | null;
  readonly state: BackupCycleState;
  readonly owner: string;
  readonly question: string;
  readonly source: string;
};

export const BACKUP_CYCLE = {
  days: null as number | null,
  state: 'NOT_SET',
  owner: 'the data protection officer with the developer',
  question: 'Can the client-document folders be excluded from the nightly whole-site backup?',
  source: 'Retention Procedure 4.1 point 4',
} as const;

/**
 * The cycle, as a deletion may rely on it: a whole number of days, only where
 * the state is SET. Anything else — NOT_SET, UNKNOWN, a SET with no number, a
 * negative or fractional number — is not known, and reads as null.
 */
export function knownBackupCycleDays(cycle: BackupCycle): number | null {
  if (cycle.state !== 'SET') return null;
  const d = cycle.days;
  return typeof d === 'number' && Number.isInteger(d) && d >= 0 ? d : null;
}

/** RET-3's drafted period — six years from the day a deletion is complete everywhere (Retention Determinations v1.2, 12.4). Not approved. */
const RET3_YEARS = 6;

export type DeletionLogEntryClock = {
  readonly verified_at: string | null;
  readonly backups_pending: boolean;
  readonly backup_cycle_days: number | null;
  readonly backup_copies_expire_at: string | null;
};

/**
 * RET-3, computed — the arithmetic, which nothing uses until the data protection
 * officer approves the parameter. The clock starts when a deletion is complete
 * EVERYWHERE: `verified_at` for the live store and, where the entry records
 * backups still pending, the later of that and the day the last backup copy
 * expires. NULL WHILE BACKUPS ARE PENDING AND THE CYCLE IS NOT KNOWN — never
 * computed as though the copies expired the moment the file was deleted — and
 * null while the deletion is not verified. Both are held and reported as
 * unscheduled, never as expired.
 */
export function ret3DueAt(entry: DeletionLogEntryClock): string | null {
  if (!entry.verified_at) return null;
  let complete = new Date(entry.verified_at).getTime();
  if (entry.backups_pending) {
    if (entry.backup_cycle_days === null || !entry.backup_copies_expire_at) return null;
    complete = Math.max(complete, new Date(entry.backup_copies_expire_at).getTime());
  }
  const d = new Date(complete);
  d.setUTCFullYear(d.getUTCFullYear() + RET3_YEARS);
  return d.toISOString();
}

/**
 * RET-7, computed. Null where either limb is unknown, deliberately: the rule
 * is "the later of" two events, and a later-of taken from one of them is not a
 * conservative version of the rule — it is a different rule that happens to
 * produce a date. Null reaches assertNoOverdueUndeleted, which surfaces it.
 */
export function ret7DueAt(rec: RawFileRecord): string | null {
  if (!rec.claim_period_end || !rec.report_delivered_at) return null;
  const later = Math.max(
    new Date(rec.claim_period_end).getTime(),
    new Date(rec.report_delivered_at).getTime(),
  );
  const d = new Date(later);
  d.setUTCFullYear(d.getUTCFullYear() + RET7_YEARS);
  return d.toISOString();
}

export type IngestionSettings = {
  /**
   * Q34's retention limb, ANSWERED by Q56 on 2 September 2026 as
   * RETAIN_FOR_DEFENCE_PERIOD (section 7B). The default below is unchanged and
   * is still the shorter rule, because a default is what an unconfigured
   * system does, not what the controller decided.
   */
  raw_file_retention: RawFileRetentionRule;
  /** Days after extraction completes before deletion falls due, where the rule is extraction-linked. */
  grace_days_after_extraction: number;
  /**
   * Q34's cost line: whether the ability to re-read the source is being given
   * up. Under Q56 Reading B it is not given up for documents generally — but
   * it still is for the A14-D4-affected class, which is deleted on the extraction
   * clock whatever this says.
   */
  accepts_loss_of_source_reread: boolean;
  /**
   * Whether the DPO has APPROVED RET-7. Derived is not approved: until this is
   * true, ret7DueAt's result is not used, and a file held under the long clock
   * with no supplied defence-pack date stays undeletable and surfaced. Turning
   * it on is the act of setting a retention period and belongs to the DPO,
   * Sadique Maskeen (named 18 Sep 2026, Phase 133i; Shafeek Ali had been named for now on 17 Sep).
   */
  ret7_approved: boolean;
};

/**
 * The fail-closed defaults. NOT a recommendation and NOT a decision — the
 * shortest clock the mechanism supports, so that an unconfigured system holds
 * the least, and so that holding more is a visible act rather than a default
 * nobody chose. Q34, Q35 and Q36 belong to Lakhbir and the DPO.
 */
export const FAIL_CLOSED_SETTINGS: IngestionSettings = {
  raw_file_retention: 'DELETE_ON_EXTRACTION_COMPLETE',
  grace_days_after_extraction: 0,
  accepts_loss_of_source_reread: false,
  /** Derived is not approved. False until the DPO signs RET-7 — section 7B. */
  ret7_approved: false,
};

export type RawFileRecord = {
  doc_id: string;
  doc_type: DocType;
  received_at: string;
  extraction_completed_at?: string;
  /** Only where the rule is RETAIN_FOR_DEFENCE_PERIOD. Supplied by the defence-pack clock (RET-1/RET-2), not computed here. */
  defence_period_ends_at?: string;
  /**
   * RET-7 limb (a) — the end of the accounting period (CT) or year of
   * assessment (IT) the claim relates to. Set by the CTA at claim close, and
   * NOT the same date as claim_closed_at: the discovery windows run from the
   * end of the period, which is normally earlier and can be a year earlier.
   * Phase 65.
   */
  claim_period_end?: string;
  /** RET-7 limb (b) — the date the report went to the client. Set by the system. Phase 65. */
  report_delivered_at?: string;
  deleted_at?: string;
  /**
   * True where the receipt strip removed NO_LAWFUL_BASIS content from this
   * document's extracted text — so the same content is in the file. DERIVED
   * from ReceiptResult by rawFileRecordFromReceipt(), not asserted by a
   * caller, on the same reasoning that makes redacted_copy_retained refusable.
   * Its consequence is in deletionDueAt(): CONDITION_D4_STATUS.q34_constraint.
   */
  no_basis_content_in_original?: boolean;
  deletion_evidence?: {
    deleted_by: string;
    method: string;
    /**
     * Whether a redacted copy survives.
     *
     * MUST BE FALSE as this codebase stands. The rule that made it true —
     * RETAIN_REDACTED_DELETE_ORIGINAL — was withdrawn on 30 August 2026
     * because nothing produces a redacted copy (section 7A), and recordDeletion
     * refuses a `true` here rather than letting an evidence record assert a
     * protection that does not exist. The field survives the withdrawal so
     * that reinstating the rule is one guard to lift, not a schema change.
     */
    redacted_copy_retained: boolean;
    /**
     * Phase 132. WHETHER A COPY MAY STILL BE ALIVE IN THE HOST'S BACKUPS, the
     * cycle the deletion relied on, and the day the last copy expires — Retention
     * Procedure 4.3's "whether backups are pending expiry". WRITTEN BY
     * recordDeletion FROM BACKUP_CYCLE, never by a caller. While the cycle is not
     * known: pending true, no cycle, no expiry — a blank, never a zero.
     */
    backups_pending: boolean;
    backup_cycle_days: number | null;
    backup_copies_expire_at: string | null;
  };
};

/** What a caller hands recordDeletion. The backup fields may be restated, and a restatement that disagrees is refused. */
export type DeletionEvidenceInput =
  Pick<NonNullable<RawFileRecord['deletion_evidence']>, 'deleted_by' | 'method' | 'redacted_copy_retained'>
  & Partial<Pick<NonNullable<RawFileRecord['deletion_evidence']>, 'backups_pending' | 'backup_cycle_days' | 'backup_copies_expire_at'>>;

const DAY_MS = 86_400_000;

/**
 * Builds the retention record from the receipt result, so that
 * no_basis_content_in_original is a fact about what the strip actually did
 * rather than a flag somebody remembered to set. Same discipline as the
 * discriminants in section 4: a caller-asserted fact fails open the moment a
 * caller forgets.
 */
export function rawFileRecordFromReceipt(
  receipt: ReceiptResult,
  received_at: string,
  over: Partial<RawFileRecord> = {},
): RawFileRecord {
  return {
    doc_id: receipt.doc_id,
    doc_type: receipt.doc_type,
    received_at,
    no_basis_content_in_original: receipt.removed.some((r) => r.reason === 'NO_LAWFUL_BASIS'),
    ...over,
  };
}

/**
 * When deletion of the raw file falls due, or null where it cannot yet be
 * computed. Null is NOT "never" — assertNoOverdueUndeleted treats a record
 * that has been sitting undeletable as the thing to surface, because "we could
 * not compute a date" is exactly how "forever" gets built by accident.
 *
 * PHASE 44 ADDS ONE CONSTRAINT, and it constrains an answer rather than making
 * one. Where the strip removed NO_LAWFUL_BASIS content, that content is still
 * in the file (section 1A), and Phase 40 condition A14-D4 says Caprebate must
 * not hold it. So the defence-period clock is not available for that document
 * and it falls back to the extraction clock. This is not a choice between
 * Q34's options: it is condition A14-D4, which is already owned by the Developer,
 * removing one option for one class of document. Fail-closed for a retention
 * rule means DELETE SOONER, and this deletes sooner. Q44 puts the consequence
 * to Lakhbir and the DPO, because the alternative — building the redaction
 * producer so the long clock becomes available again — is their call to fund.
 */
export function deletionDueAt(rec: RawFileRecord, settings: IngestionSettings): string | null {
  assertRetentionRuleImplementable(settings.raw_file_retention);

  const extractionClock = (): string | null => {
    if (!rec.extraction_completed_at) return null;
    const due = new Date(rec.extraction_completed_at).getTime() + settings.grace_days_after_extraction * DAY_MS;
    return new Date(due).toISOString();
  };

  switch (settings.raw_file_retention) {
    case 'DELETE_ON_EXTRACTION_COMPLETE':
      return extractionClock();
    case 'RETAIN_FOR_DEFENCE_PERIOD': {
      if (rec.no_basis_content_in_original) return extractionClock();
      const supplied = rec.defence_period_ends_at ?? null;
      const ret7 = settings.ret7_approved ? ret7DueAt(rec) : null;
      // WHERE BOTH CLOCKS ARE KNOWN, THE LATER ONE GOVERNS. Word answer 173,
      // closed 24 September 2026: "Where two retention periods apply to a
      // client file, use the later of the two keep-until dates. The file
      // should be retained until both applicable retention periods have
      // expired." Until then this took the EARLIER, on the footing that a
      // file under two rules is held under the one that runs out first and
      // that fail-closed for a retention rule is sooner. The answer rejects
      // that footing: each period exists because somebody may need the file
      // until it ends — the defence pack for an enquiry, RET-7 for the
      // discovery windows — so deleting at the first end defeats the second.
      // Phase 151b made the change; tests Y7 and Y9-Y12 hold it.
      //
      // Unchanged, and still a different rule: where only one clock is known
      // it governs, and where neither is, null reaches assertNoOverdueUndeleted
      // rather than becoming a silent forever. An unapproved RET-7 is not
      // known (N4) and so cannot lengthen anything. And the A14-D4 fallback
      // above — a file that lost no-basis content goes on the extraction
      // clock — is not two retention periods at all: it is a lawful-basis
      // condition removing the long clock for that file, and answer 173 does
      // not reach it.
      if (supplied && ret7) {
        return new Date(Math.max(new Date(supplied).getTime(), new Date(ret7).getTime())).toISOString();
      }
      return supplied ?? ret7;
    }
    default:
      return null;
  }
}

export type DeletionSweep = {
  due: RawFileRecord[];
  overdue: RawFileRecord[];
  /** Held, with no computable deletion date. The "forever" risk, surfaced rather than hidden. */
  undeletable: RawFileRecord[];
  deleted: RawFileRecord[];
};

export function sweepForDeletion(
  records: readonly RawFileRecord[],
  now: string,
  settings: IngestionSettings,
): DeletionSweep {
  const t = new Date(now).getTime();
  const out: DeletionSweep = { due: [], overdue: [], undeletable: [], deleted: [] };
  for (const r of records) {
    if (r.deleted_at) { out.deleted.push(r); continue; }
    const due = deletionDueAt(r, settings);
    if (due === null) { out.undeletable.push(r); continue; }
    const dueT = new Date(due).getTime();
    if (dueT <= t) out.overdue.push(r);
    else out.due.push(r);
  }
  return out;
}

/**
 * Records a deletion. A deletion with no evidence is indistinguishable from no deletion.
 *
 * PHASE 132: THE EVIDENCE CARRIES THE BACKUP CYCLE, AND THIS FUNCTION WRITES IT.
 * The cycle is read from `cycle` — BACKUP_CYCLE unless a test passes another —
 * and a caller that states a backup position the cycle does not support is
 * refused with E_BACKUP_CYCLE_ASSERTED, on the same reasoning that refuses
 * `redacted_copy_retained: true`: an evidence record that asserts the copies are
 * gone, when nobody knows, is worse than one that says nothing.
 */
export function recordDeletion(
  rec: RawFileRecord,
  deleted_at: string,
  evidence: DeletionEvidenceInput,
  cycle: BackupCycle = BACKUP_CYCLE,
): RawFileRecord {
  if (!evidence.deleted_by || !evidence.method) {
    throw new ClientDocIngestionError(
      'E_DELETION_UNEVIDENCED',
      'a deletion must record who performed it and by what method. An unevidenced deletion ' +
        'cannot be distinguished from a deletion that never happened, and the point of the ' +
        'retention rule is to be demonstrable.',
      { doc_id: rec.doc_id },
    );
  }
  if (evidence.redacted_copy_retained) {
    throw new ClientDocIngestionError(
      'E_REDACTED_COPY_UNPRODUCIBLE',
      'this deletion asserts that a redacted copy survives. Nothing in this codebase can produce ' +
        'one — the receipt strip returns extracted text, not a redacted file, and no redaction of ' +
        'any kind is built (board item 12928215019, section 7A). Recording the flag as true would ' +
        'put a protection on the file that does not exist, which is worse than recording nothing. ' +
        'Build a producer satisfying REDACTION_PRODUCER_CONTRACT and lift this guard together.',
      { doc_id: rec.doc_id },
    );
  }
  const days = knownBackupCycleDays(cycle);
  const backup = {
    // Not known is pending. Only a known cycle of zero days — the folders excluded — says no copy survives.
    backups_pending: days === null || days > 0,
    backup_cycle_days: days,
    backup_copies_expire_at: days === null || days === 0
      ? null
      : new Date(new Date(deleted_at).getTime() + days * DAY_MS).toISOString(),
  };
  const asserted = (['backups_pending', 'backup_cycle_days', 'backup_copies_expire_at'] as const)
    .filter((k) => evidence[k] !== undefined && evidence[k] !== backup[k]);
  if (asserted.length > 0) {
    throw new ClientDocIngestionError(
      'E_BACKUP_CYCLE_ASSERTED',
      `this deletion states ${asserted.join(', ')} differently from the host's backup cycle, which is ` +
        `${cycle.state}${days === null ? ' — not known' : ` at ${days} days`}. The backup position is written from ` +
        `the cycle (${cycle.source}), never asserted by a caller: "${cycle.question}" is for ${cycle.owner}.`,
      { doc_id: rec.doc_id, asserted },
    );
  }
  return {
    ...rec,
    deleted_at,
    deletion_evidence: {
      deleted_by: evidence.deleted_by,
      method: evidence.method,
      redacted_copy_retained: evidence.redacted_copy_retained,
      ...backup,
    },
  };
}

export type RestoreApproval = { readonly approved_by: string; readonly approval_ref: string };

/**
 * NO RESTORATION OF A DELETED RECORD WITHOUT THE DPO'S APPROVAL — Retention
 * Procedure 4.1 point 4. Phase 132. Nothing in this codebase restores a file;
 * this is the guard any restore path must pass first. A deleted record with no
 * approval, or an approval missing who gave it or its reference, is refused. A
 * record that was never deleted has nothing to restore and passes.
 */
export function assertRestoreApproved(rec: RawFileRecord, approval: RestoreApproval | null): void {
  if (!rec.deleted_at) return;
  if (approval === null || !approval.approved_by?.trim() || !approval.approval_ref?.trim()) {
    throw new ClientDocIngestionError(
      'E_RESTORE_UNAPPROVED',
      'this record was deleted, and a deleted record is never restored — from a backup or anywhere — without the ' +
        'data protection officer\'s approval, recorded with who gave it and its reference (Retention Procedure 4.1 point 4).',
      { doc_id: rec.doc_id, deleted_at: rec.deleted_at },
    );
  }
}

/**
 * THE FUNCTION THAT MAKES THE RETENTION RULE REAL. Run on a schedule. Throws
 * where any raw file is past its deletion date and still held, or where any is
 * held with no computable date at all.
 *
 * Without this, everything above is a document. With it, a retention rule that
 * is not being honoured breaks something visible, which is the only version of
 * a retention rule that means anything.
 */
export function assertNoOverdueUndeleted(
  records: readonly RawFileRecord[],
  now: string,
  settings: IngestionSettings,
): void {
  const sweep = sweepForDeletion(records, now, settings);
  if (sweep.overdue.length > 0) {
    throw new ClientDocIngestionError(
      'E_RETENTION_OVERDUE',
      `${sweep.overdue.length} raw uploaded file(s) are past their deletion date and are still ` +
        'held. The raw file is where every third-party name lives — the structured records ' +
        'contain none — so an overdue file is the whole of the residual exposure.',
      { doc_ids: sweep.overdue.map((r) => r.doc_id), rule: settings.raw_file_retention },
    );
  }
  if (sweep.undeletable.length > 0) {
    throw new ClientDocIngestionError(
      'E_RETENTION_OVERDUE',
      `${sweep.undeletable.length} raw uploaded file(s) are held with NO COMPUTABLE DELETION ` +
        'DATE. Under the current rule that means extraction never completed, or the defence-pack ' +
        'clock was never supplied. A file with no deletion date is kept forever by default, which ' +
        'is the failure this mechanism exists to make impossible.',
      { doc_ids: sweep.undeletable.map((r) => r.doc_id), rule: settings.raw_file_retention },
    );
  }
}

export { NameExclusionError, NEVER_TO_MODEL, HUMAN_READ_ONLY_TYPES, HUMAN_CAPTURE_SPECS };
