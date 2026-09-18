/**
 * THE FIRST CALLER THE UPLOAD HANDLER HAS EVER HAD.
 *
 * Everything below is wiring. NOT ONE RULE FROM THE HANDLER IS RESTATED HERE:
 * the twelve-step order, the strip, the promotion rule, the quarantine
 * discharge and the fail-closed settings all stay in
 * 04-phase-work/phase3/caprebate-upload-handler.ts, which this phase imported
 * and did not touch. What this file supplies is the four ports the handler
 * takes — a store, an extractor, a classifier and an audit sink — plus the
 * database rows a screen can render.
 *
 * WHY THAT MATTERS MORE THAN THE SCREENS. The handler's own header: "Eighty-two
 * tests passed against a module with no consumer, which proves the design is
 * coherent and proves nothing about whether a single client document is
 * protected. This is the consumer. It is the difference between a
 * specification and a control." That sentence was written on 31 August about
 * the handler's relationship to the ingestion module. It has been true of the
 * handler itself ever since, and it stops being true here.
 */

import { randomUUID } from 'node:crypto';
import type { Db } from '../db.ts';
import type { AuditLog } from '../audit.ts';
import { FsObjectStore } from './objectstore.ts';
import { extractPages } from './extract-text.ts';
import { receiveByUpload } from './documents.ts';
import {
  UPLOAD_LIMITS, UploadHandlerError, sniffAccepted, quarantineKeyFor,
  issueUploadUrl, recordUploadComplete, processUpload,
  assertContractCovered, FAIL_CLOSED_SETTINGS, DOC_SPECS, HUMAN_READ_ONLY_TYPES,
  type AuditEvent, type AuditSink, type DocType, type DocTypeClassifier,
  type TextExtractor, type UploadHandlerDeps, type UploadJob,
} from './upload-handler-port.ts';

/**
 * THE AUDIT SINK ADAPTER.
 *
 * One row per RECEIPT_CONTRACT step. This is what lets a screen SHOW the strip
 * and the discharge happening rather than assert that they did — which the
 * phase brief calls the cheapest way to explain them to a data protection
 * officer, and it is right: a control you can watch needs no argument.
 *
 * NEVER THE CONTENT, NEVER A NAME, NEVER THE PRE-SIGNED URL. The handler is
 * already careful about this — its step-5 event carries removal KINDS and
 * REASONS and not the removed text — and this adapter must not widen it. It
 * writes `detail` through verbatim and adds nothing.
 */
export function dbAuditSink(db: Db, id: () => string = randomUUID): AuditSink {
  return {
    async write(e: AuditEvent): Promise<void> {
      db.run(
        'INSERT INTO document_events (id, job_id, doc_id, contract_step, action, outcome, detail_json, at) ' +
          'VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [id(), e.job_id, e.doc_id, e.contract_step, e.action, e.outcome, JSON.stringify(e.detail), e.at],
      );
    },
  };
}

/**
 * THE TEXT EXTRACTOR — and it is a STUB, declared as one, FOR WHAT IT STILL
 * CANNOT READ. That sentence used to have no second half.
 *
 * WHAT CHANGED ON 9 SEPTEMBER 2026 (PHASE 113c). Until then this returned one
 * marker line for every binary upload, so on a PDF or a .docx the receipt
 * strip ran over a marker rather than over the document — the pipeline was
 * end-to-end but the control was not exercised on real content. It now reads
 * .docx files (through `zip.ts`, the ONE zip reader this project has, the same
 * one the engagement letter uses) and PDFs whose text sits in uncompressed or
 * FlateDecode content streams.
 *
 * WHAT IS STILL A STUB, AND IT IS WHY ROW 4 OF THE SPEC'S STUB TABLE CHANGED
 * WORDING RATHER THAN DISAPPEARING: a SCANNED PDF — page images with no text
 * operators, which needs OCR, a library and a decision rather than a gap — an
 * ENCRYPTED PDF, content behind LZW/ASCII85/JBIG2/CCITT filters, `.doc`, and
 * `.xlsx`/`.pptx`.
 *
 * AND THE RULE THAT DID NOT CHANGE AT ALL. Every path that cannot read a
 * document returns the MARKER: not a guess, and not an empty page. A fake that
 * invented plausible page text would be worse than useless — the strip would
 * be stripping content nobody uploaded, and the `document_events` trail would
 * record a strip that never touched a real name. An empty page is the same
 * falsehood more quietly, because downstream zero segments reads as "we looked
 * and there was nothing to redact". That is N4 applied to extraction, and
 * `src/web/extract-text.ts` is written so that every failure funnels into
 * `markerPages()`.
 *
 * The name is `documentTextExtractor` rather than `plainTextExtractor` because
 * plain text is now the last of the three things it reads, not the only one.
 */
export function documentTextExtractor(): TextExtractor {
  return {
    async toPages(bytes: Uint8Array) {
      return extractPages(bytes);
    },
  };
}

/**
 * THE CLASSIFIER — refuses, never guesses.
 *
 * The port says "May return null; null is refused, never guessed", and the
 * handler turns a null into E_UNRECOGNISED_DOC_TYPE, deletes the quarantine
 * object and does NOT promote. That is the behaviour we want and it is why
 * this returns null rather than picking a likely type: an upload nobody can
 * classify is an upload nobody can strip.
 *
 * The declared type is a CLAIM by the client, checked against the handled set
 * — not trusted, and not the only input a real classifier would use.
 */
export function declaredTypeClassifier(): DocTypeClassifier {
  const handled = new Set<string>([
    ...DOC_SPECS.map((s) => s.doc_type as string),
    ...(HUMAN_READ_ONLY_TYPES as readonly string[]),
  ]);
  return {
    async classify(_bytes: Uint8Array, declared: DocType | null): Promise<DocType | null> {
      if (declared === null) return null;
      return handled.has(declared as string) ? declared : null;
    },
  };
}

export type UploadDeps = {
  db: Db;
  store: FsObjectStore;
  now: () => string;
  /** Who is running this. Recorded in every deletion's evidence. */
  actor: string;
  newId?: () => string;
  /**
   * CRM 4 of 10. Where receiving a document request is audited. Absent, a
   * finished upload receives no request — the handler's own tests run without it.
   */
  audit?: AuditLog;
};

/**
 * CRM 4 of 10. What makes an upload a VERSION: its document, its number, its
 * type, its own deletion clock, the request it answers and its derived name.
 * Decided by src/web/documents.ts and written in the same transaction as the row.
 */
export type VersionColumns = {
  logical_document_id: string;
  version_no: number;
  type_code: string;
  retention_ref: string | null;
  request_id: string | null;
  filename: string;
};

function handlerDeps(d: UploadDeps): UploadHandlerDeps {
  return {
    store: d.store,
    extractor: documentTextExtractor(),
    classifier: declaredTypeClassifier(),
    audit: dbAuditSink(d.db, d.newId ?? randomUUID),
    now: d.now,
    actor: d.actor,
    // FAIL_CLOSED_SETTINGS, explicitly rather than by default, because Q34
    // (raw-file retention) and Q40 (the ingestion boundary) are both OPEN and
    // a build that quietly chose the permissive setting would be answering
    // them. Under these settings the raw file NEVER reaches the durable prefix.
    settings: FAIL_CLOSED_SETTINGS,
  };
}

/* ------------------------------------------------------------------ *
 * STEP 1 — the client asks to upload something.
 * ------------------------------------------------------------------ */

export async function beginUpload(
  d: UploadDeps,
  args: {
    business_id: string; uploaded_by: string; filename: string; declared_type: DocType | null;
    /** CRM 4 of 10: called inside the row's transaction, and its columns written with it. */
    version?: () => VersionColumns;
  },
): Promise<{ doc_id: string; job: UploadJob; url: string; expires_at: string }> {
  // Cheap, and it fails the request rather than the deployment: the handler's
  // own coverage assertion, run on the path that uses it.
  assertContractCovered();

  const newId = d.newId ?? randomUUID;
  const doc_id = newId();
  const job_id = newId();

  const { job, upload } = await issueUploadUrl(handlerDeps(d), {
    job_id, doc_id, entity_id: args.business_id, declared_type: args.declared_type,
  });

  d.db.tx(() => {
    const v = args.version === undefined ? null : args.version();
    d.db.run(
      'INSERT INTO documents (id, business_id, uploaded_by, filename, declared_type, state, created_at, ' +
        'logical_document_id, version_no, type_code, retention_ref, request_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [doc_id, args.business_id, args.uploaded_by, v?.filename ?? args.filename,
       args.declared_type, job.state, d.now(),
       v?.logical_document_id ?? null, v?.version_no ?? null, v?.type_code ?? null, v?.retention_ref ?? null, v?.request_id ?? null],
    );
  });

  // The URL is returned to the caller and NOT stored. It is a bearer capability.
  return { doc_id, job, url: upload.url, expires_at: upload.expires_at };
}

/* ------------------------------------------------------------------ *
 * THE WRITE ITSELF — steps between 1 and 2, which the port assumes a
 * cloud performs and which here we perform ourselves.
 *
 * THE LIMITS ARE CHECKED TWICE ON PURPOSE, and that is not belt-and-braces.
 * Here, so a rejected file never lands at all; and again inside processUpload,
 * on the bytes that actually landed, because under a real pre-signed-URL
 * boundary the store is written by the browser and this code never sees the
 * bytes. Removing either one would be wrong for a different reason.
 * ------------------------------------------------------------------ */

export async function acceptClientBytes(
  d: UploadDeps,
  args: { doc_id: string; token: string; bytes: Uint8Array },
): Promise<{ ok: true; written_at: string } | { ok: false; status: number; why: string }> {
  const key = quarantineKeyFor(args.doc_id);

  const v = d.store.verifyPutToken(args.token, key);
  if (!v.ok) return { ok: false, status: 403, why: 'that upload link is not valid' };

  if (args.bytes.length === 0) return { ok: false, status: 400, why: 'the file is empty' };
  if (args.bytes.length > UPLOAD_LIMITS.max_bytes) {
    return { ok: false, status: 413, why: 'that file is larger than we accept' };
  }
  // SERVER-SIDE CONTENT SNIFFING, not the extension and not the client's
  // say-so. DB-W1-T5. A PHP payload named .pdf fails here, before it is written.
  if (sniffAccepted(args.bytes) === null) {
    return { ok: false, status: 415, why: 'that file type is not one we accept' };
  }

  await d.store.putClientBytes(key, args.bytes);
  const written_at = d.now();
  d.db.run('UPDATE documents SET byte_size = ?, sniffed_as = ? WHERE id = ?',
    [args.bytes.length, sniffAccepted(args.bytes), args.doc_id]);
  return { ok: true, written_at };
}

/* ------------------------------------------------------------------ *
 * STEPS 2–7 — and this is the whole of G1 and G2.
 * ------------------------------------------------------------------ */

export async function finishUpload(
  d: UploadDeps,
  job: UploadJob,
  written_at: string,
): Promise<{ job: UploadJob; discharged: boolean; error?: UploadHandlerError; received_request?: string | null }> {
  const deps = handlerDeps(d);
  const received = await recordUploadComplete(deps, job, written_at);
  try {
    const r = await processUpload(deps, received);
    persist(d, r.job, r.discharged);
    // CRM 4 of 10: ONLY NOW, with the strip and the discharge on the row, may a
    // document request be received — and `receiveByUpload` reads both off the row
    // rather than taking this function's word for them.
    const request = d.audit === undefined ? null : receiveByUpload({ db: d.db, audit: d.audit, now: d.now }, r.job.doc_id);
    return { job: r.job, discharged: r.discharged, received_request: request };
  } catch (e) {
    // A REFUSED UPLOAD IS A NORMAL OUTCOME, NOT A CRASH. The handler has
    // already discharged the quarantine on its own catch path (G2); what is
    // left to do is record the refusal where a person can see it.
    persist(d, received, received.quarantine.deleted_at !== undefined);
    if (e instanceof UploadHandlerError) {
      d.db.run('UPDATE documents SET failure_code = ? WHERE id = ?', [e.code, received.doc_id]);
      return { job: received, discharged: false, error: e };
    }
    throw e;
  }
}

/**
 * THE JOB STEP 1 ISSUED, READ BACK FROM WHAT THE HANDLER ITSELF WROTE.
 * CRM 4 of 10, 11 September 2026.
 *
 * UNTIL THIS FUNCTION, THE RUNNING APPLICATION NEVER FINISHED AN UPLOAD. The job
 * `issueUploadUrl` returns lived only in the request that issued the link, so
 * `PUT /upload/put` wrote the bytes to quarantine and stopped: steps 3 to 7 — the
 * classification, the strip and the discharge — ran in the tests and nowhere
 * else, and the file sat in quarantine until the sweep. A document request could
 * never have been received.
 *
 * NOTHING HERE IS A RULE OF THE HANDLER'S. The job is exactly the object
 * `issueUploadUrl` builds — its id and the moment of issue from the handler's own
 * step-1 row in `document_events`, the key from `quarantineKeyFor`, state ISSUED
 * — and every step after it still asserts its own order.
 *
 * AND A LINK IS USED ONCE. Only a row still at ISSUED gives a job back, so a
 * second PUT with the same link after the file was processed is refused before a
 * byte is written — where before it would have put a fresh unredacted copy into
 * a quarantine that had already been discharged.
 */
export function issuedJob(db: Db, doc_id: string): UploadJob | null {
  const row = db.get<{ id: string; business_id: string; declared_type: string | null; state: string }>(
    'SELECT id, business_id, declared_type, state FROM documents WHERE id = ?', [doc_id]);
  if (row === undefined || row.state !== 'ISSUED') return null;
  const issued = db.get<{ job_id: string; at: string }>(
    'SELECT job_id, at FROM document_events WHERE doc_id = ? AND contract_step = 1 ORDER BY at ASC LIMIT 1', [doc_id]);
  if (issued === undefined) return null;
  return {
    job_id: issued.job_id, doc_id: row.id, entity_id: row.business_id, state: 'ISSUED',
    declared_type: row.declared_type as DocType | null,
    quarantine: { doc_id: row.id, key: quarantineKeyFor(row.id), written_at: issued.at },
  };
}

function persist(d: UploadDeps, job: UploadJob, discharged: boolean): void {
  d.db.run(
    'UPDATE documents SET state = ?, doc_type = ?, strip_recorded_at = ?, quarantine_discharged_at = ? WHERE id = ?',
    [job.state, job.doc_type ?? null,
     job.quarantine.strip_completed_at ?? null,
     discharged ? (job.quarantine.deleted_at ?? d.now()) : null,
     job.doc_id],
  );
}

/**
 * The pipeline trace for one document, oldest first.
 *
 * This is what the portal renders under "what we did with your file". Every
 * row is a RECEIPT_CONTRACT step the handler discharged, written by the
 * handler itself — the screen reports, it does not narrate.
 */
export function eventsFor(db: Db, doc_id: string): {
  contract_step: number; action: string; outcome: string; detail: unknown; at: string;
}[] {
  return db
    .all<{ contract_step: number; action: string; outcome: string; detail_json: string; at: string }>(
      'SELECT contract_step, action, outcome, detail_json, at FROM document_events ' +
        'WHERE doc_id = ? ORDER BY at ASC, contract_step ASC',
      [doc_id],
    )
    .map((r) => ({
      contract_step: r.contract_step, action: r.action, outcome: r.outcome, at: r.at,
      detail: JSON.parse(r.detail_json) as unknown,
    }));
}
