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
import { extractPages, isScanMarker, pdfPageImages, type ExtractedPage, type PageImage } from './extract-text.ts';
import { receiveByUpload } from './documents.ts';
import { ingestRegisterRecord } from '../stubs/registers.ts';
import { freeGate, assertSignedEngagement } from './research.ts';
import type { RateLimiter, Transport, GateSnapshot } from '../connectors/http.ts';
import type { SecretStore } from '../secrets.ts';
import {
  CLAUDE_SWITCHES, claudeReadiness, prepareClaudeModel, readScannedPages,
  type ClaudeContext, type ClaudeSwitches, type ModelRead,
} from '../connectors/claude.ts';
import type { EgressEntry } from '../../../../04-phase-work/phase3/caprebate-document-pipeline.ts';
import type { ClientDocDiscriminants } from '../../../../04-phase-work/phase3/caprebate-client-doc-ingestion.ts';
import { discriminantsFor, recordReading, VOUCHED_FIELDS } from './document-reading.ts';
import {
  UPLOAD_LIMITS, UploadHandlerError, sniffAccepted, quarantineKeyFor,
  issueUploadUrl, recordUploadComplete, processUpload, openTransparency, runExtraction, writeClaims,
  assertContractCovered, FAIL_CLOSED_SETTINGS, DOC_SPECS, HUMAN_READ_ONLY_TYPES, durableKeyFor,
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
export function documentTextExtractor(readScan?: (images: PageImage[]) => Promise<ExtractedPage[] | null>): TextExtractor {
  return {
    async toPages(bytes: Uint8Array) {
      const pages = extractPages(bytes);
      /* PHASE 146e — A SCAN, READ BY THE VISION PATH, WHEN THERE IS ONE. Only for the scan marker: an encrypted PDF,
         an unreadable filter, a damaged .docx and every other format keep their marker whatever is passed here. The
         pictures must all be liftable and the reading must come back whole, or the marker stands. What the reading
         gives goes on to the SAME strip as any other text. With no reader — as shipped — this is exactly the
         function it was before. */
      if (readScan === undefined || !isScanMarker(pages)) return pages;
      const images = pdfPageImages(bytes);
      if (images === null) return pages;
      const read = await readScan(images);
      return read === null || read.length === 0 || read.some((p) => p.lines.length === 0) ? pages : read;
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
  /**
   * PHASE 146e. What reads a scanned PDF's page pictures as text — `readScannedPages` in src/connectors/claude.ts,
   * behind its own switch. Absent, as shipped: a scan keeps its marker.
   *
   * PHASE 146g: A CALLER NO LONGER HAS TO BUILD THIS. Given `reading` below, it is derived from it — and ONLY while
   * SCANNED_PAGES is on, which is the whole of the rule. Passing one here still wins, so a test can supply its own.
   */
  scan_reader?: (doc_id: string, images: PageImage[]) => Promise<ExtractedPage[] | null>;
  /**
   * PHASE 146g. HOW A FINISHED UPLOAD REACHES THE DOCUMENT READER — the transport (the live one, or recorded answers
   * in a test), the key file read at start-up, and the switches. ABSENT, OR WITH DOCUMENT_READING OFF, A FINISHED
   * UPLOAD BEHAVES EXACTLY AS IT DID BEFORE THIS PHASE: steps 9 and 10 of the receipt contract do not run, nothing is
   * sent anywhere, and every field the document would have answered stays ASKED of the client (N4).
   *
   * It opens no gate. Reading a client's own document is not a register lookup and neither gate governs it; what
   * governs it is the switch, the key, and the data protection officer's approval of the provider and the transfer —
   * which src/connectors/sources.ts still refuses (CLAUDE_DOCUMENTS is region US, `international_transfer_approved`
   * false). The snapshot below is recorded on the call's audit row and decides nothing.
   */
  reading?: UploadReading;
};

/**
 * PHASE 146g. THE ONE PLACE A ROUTE BUILDS A READER, so the two upload routes cannot drift apart. It is handed the
 * process's own key store and transport and reads the gates as they stand, for the audit row and for nothing else.
 *
 * Passing this does NOT switch reading on. `CLAUDE_SWITCHES.DOCUMENT_READING` is false, so every upload that goes
 * through here behaves exactly as it did before this phase.
 */
export function readerFor(
  app: { db: Db; secrets: SecretStore; outside: Transport },
  business_id: string,
  actor_role: string | null,
): UploadReading {
  return {
    transport: app.outside, secrets: app.secrets, actor_role,
    gate: {
      free_gate_open: freeGate().open,
      engagement_signed: assertSignedEngagement(app.db, business_id).signed,
      switched_on: CLAUDE_SWITCHES.DOCUMENT_READING,
    },
  };
}

/** PHASE 146g. See `UploadDeps.reading`. The same shape as `ResearchOutside` (src/web/research.ts), for the same reason. */
export type UploadReading = {
  readonly transport: Transport;
  readonly secrets: SecretStore;
  /** CLAUDE_SWITCHES unless a test passes its own. */
  readonly switches?: ClaudeSwitches;
  readonly limiter?: RateLimiter;
  readonly sleep?: (ms: number) => Promise<void>;
  /** Tests only: a service's policy with some values changed. Passed through to src/connectors/http.ts. */
  readonly policy_override?: ClaudeContext['deps']['policy_override'];
  /** Who is running this, for the audit row. The upload's own actor id is `UploadDeps.actor`. */
  readonly actor_role?: string | null;
  /** The two gates as they stood, for the audit row only. Neither decides whether a document is read. */
  readonly gate?: GateSnapshot;
  /**
   * Whether the two conditional CLIENT_DOC fields name an organisation. Neither is ever inferred from a document.
   *
   * PHASE 146i: A CALLER NO LONGER HAS TO SUPPLY THIS EITHER, and no route does. Left out, the answers a person
   * recorded on the document's own page are read instead (`discriminantsFor`, src/web/document-reading.ts).
   * Passing one here still wins, so a test can say what a person said without writing a row.
   */
  readonly discriminants?: ClientDocDiscriminants;
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

/**
 * PHASE 146g. THE CONTEXT EVERY READING CALL RUNS IN, or null where there is nothing to read with. Built once, from
 * `UploadDeps.reading`, so the page reader and the field reader cannot end up on two different key stores.
 */
function readingContext(d: UploadDeps): ClaudeContext | null {
  const r = d.reading;
  if (r === undefined) return null;
  return {
    deps: {
      audit: audit_of(d), now: d.now, transport: r.transport,
      ...(r.limiter === undefined ? {} : { limiter: r.limiter }),
      ...(r.sleep === undefined ? {} : { sleep: r.sleep }),
      ...(r.policy_override === undefined ? {} : { policy_override: r.policy_override }),
    },
    secrets: r.secrets,
    switches: r.switches ?? CLAUDE_SWITCHES,
    actor_id: d.actor,
    actor_role: r.actor_role ?? null,
    claim_id: null,
    gate: r.gate ?? { free_gate_open: false, engagement_signed: false, switched_on: false },
  };
}

/**
 * The audit log every reading writes to. `UploadDeps.audit` is optional because the handler's own tests run without
 * one; a reading cannot, because an unlogged call to an outside service is the one thing Phase 146b forbids. So a
 * caller that supplies `reading` and no `audit` gets no reading at all — see `readAndClaim`.
 */
function audit_of(d: UploadDeps): AuditLog {
  if (d.audit === undefined) throw new UploadHandlerError('E_JOB_NOT_COMPLETE', 'no audit log', {});
  return d.audit;
}

/** PHASE 146g. The page reader, and ONLY while SCANNED_PAGES is on. Off, a scan keeps its marker, exactly as before. */
function scanReaderFrom(d: UploadDeps): UploadDeps['scan_reader'] {
  if (d.scan_reader !== undefined) return d.scan_reader;
  if (d.reading === undefined || d.audit === undefined) return undefined;
  const switches = d.reading.switches ?? CLAUDE_SWITCHES;
  if (switches.SCANNED_PAGES !== true) return undefined;
  const ctx = readingContext(d);
  if (ctx === null) return undefined;
  // Phase 153c: the document's kind travels with it, and only the kinds on SCANNED_PAGE_KINDS are sent (Word question 193).
  return async (doc_id, images) => {
    const kind = d.db.get<{ type_code: string | null }>('SELECT type_code FROM documents WHERE id = ?', [doc_id])?.type_code ?? null;
    return (await readScannedPages(ctx, doc_id, images, kind)).pages;
  };
}

function handlerDeps(d: UploadDeps, doc_id?: string): UploadHandlerDeps {
  const reader = scanReaderFrom(d);
  return {
    store: d.store,
    extractor: documentTextExtractor(reader === undefined || doc_id === undefined ? undefined : (images) => reader(doc_id, images)),
    classifier: declaredTypeClassifier(),
    audit: dbAuditSink(d.db, d.newId ?? randomUUID),
    now: d.now,
    actor: d.actor,
    // FAIL_CLOSED_SETTINGS, explicitly rather than by default, because Q34
    // (raw-file retention) and Q40 (the ingestion boundary) are both OPEN and
    // a build that quietly chose the permissive setting would be answering
    // them. Under these settings the raw file NEVER reaches the durable prefix.
    // PHASE 140: KEEP_ORIGINALS (src/web/originals.ts), OFF. Only when it is on
    // in all three of its ways does the handler get a period to keep a file
    // for — and then it is the handler's own promotion rule that keeps it.
    settings: d.store.keptDays === null ? FAIL_CLOSED_SETTINGS
      : { ...FAIL_CLOSED_SETTINGS, grace_days_after_extraction: d.store.keptDays },
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
): Promise<{
  job: UploadJob; discharged: boolean; error?: UploadHandlerError; received_request?: string | null;
  /** PHASE 146g: what steps 9 and 10 did, or the reason they did not run. Never absent, so a caller cannot read silence as success. */
  reading?: ReadingOutcome;
}> {
  const deps = handlerDeps(d, job.doc_id);
  const received = await recordUploadComplete(deps, job, written_at);
  try {
    const r = await processUpload(deps, received);
    // PHASE 146g: STEPS 9 AND 10, ON THIS REQUEST, AND ONLY BEHIND THE SWITCH. Before the row is written, so the
    // state the screen reads is the state the job actually reached. Switched off it returns at once and changes
    // nothing — not the row, not the audit log, and not one byte sent anywhere.
    const reading = await readAndClaim(d, deps, r.job);
    /* PHASE 146i: AND NOW SOMEBODY CAN SEE WHAT IT DID. One row per reading that actually started — never for a
       reading that was switched off or was never wired in, because with the switch off a finished upload must
       behave exactly as it did before Phase 146g, and a row is a difference. */
    recordReading(d.db, d.newId ?? randomUUID, d.now(), r.job.doc_id, {
      state: reading.state, why: reading.why,
      fields: reading.fields, not_found: reading.not_found, left_out: reading.left_out.length,
    });
    persist(d, r.job, r.discharged);
    // CRM 4 of 10: ONLY NOW, with the strip and the discharge on the row, may a
    // document request be received — and `receiveByUpload` reads both off the row
    // rather than taking this function's word for them.
    const request = d.audit === undefined ? null : receiveByUpload({ db: d.db, audit: d.audit, now: d.now }, r.job.doc_id);
    return { job: r.job, discharged: r.discharged, received_request: request, reading };
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

/* ------------------------------------------------------------------ *
 * STEPS 9 AND 10 — PHASE 146g, 23 September 2026.
 *
 * THE UPLOAD FLOW NEVER RAN STEP 9. `runExtraction` and `writeClaims` were exported by the port and called from
 * nowhere in src/: every upload stopped at TRIAGED, with the strip done and nothing read. Phase 146e built the real
 * reader and left it with no caller. This is the caller.
 *
 * WHAT IT DOES NOT DO, AND THIS IS THE WHOLE OF THE SAFETY OF IT:
 *
 *   · SWITCHED OFF, IT DOES NOTHING AT ALL. `CLAUDE_SWITCHES.DOCUMENT_READING` is false, so every upload behaves
 *     exactly as it did before this phase: the job stays at TRIAGED, no row changes, no audit row is written and
 *     nothing leaves the building. The switch is read through `claudeReadiness`, which is the same function the
 *     reader itself reads it through — there is no second reading of the switch.
 *   · A READING THAT DID NOT HAPPEN CHANGES NOTHING. No key, the transfer unapproved, a refusal, a time-out, an
 *     answer we cannot read: the job stays at TRIAGED and every field the document would have answered stays ASKED
 *     of the client. Never a zero, never a guess, never a screen error (N4).
 *   · A DOCUMENT A PERSON MUST READ IS NOT SENT. `CPSE_REPLIES` and `SALE_CONTRACT` have no model spec;
 *     `runExtraction` refuses them, and so does this, one step earlier and for the same reason.
 *   · NOTHING THROWS OUT OF HERE. A refused claim — an uncatalogued field, a conditional field with no
 *     discriminant — is an outcome, recorded and reported, not a failed upload. The file has already been read and
 *     deleted by then; failing the request would tell the client to send it again for no reason.
 *   · THE CLAIMS ENTER BY THE ONE DOOR. `ingestRegisterRecord` (src/stubs/registers.ts), where the name exclusion
 *     register is checked, as every register record does. There is no second way in for a document's facts.
 * ------------------------------------------------------------------ */

export type ReadingState =
  | 'NOT_WIRED'       // no reader was given to this call at all
  | 'SWITCHED_OFF'    // DOCUMENT_READING is false — the shipped state
  | 'NOT_CONFIGURED'  // switched on, and the key file has no ANTHROPIC_API_KEY
  | 'HUMAN_ONLY'      // the type has no model spec: a person reads it
  | 'NOT_READY'       // the job did not reach step 9 (no type, no receipt, or a state before TRIAGED)
  | 'NOT_READ'        // it was sent, or could not be, and nothing came back we could use
  | 'NOT_WRITTEN'     // it was read, and the claims were refused before they were written
  | 'CLAIMED';        // read and written

export type ReadingOutcome = {
  readonly state: ReadingState;
  /** In plain words. No key, and nothing from the document. */
  readonly why: string;
  readonly fields: number;
  readonly not_found: number;
  readonly claims: number;
  /**
   * PHASE 146i. The field ids the document DID answer and that were still not kept, because nobody has vouched
   * that the value names an organisation. Each one stays asked of the client, exactly as an absent one does (N4).
   */
  readonly left_out: readonly string[];
  /** What the reader itself reported, where a call was made. */
  readonly read: ModelRead | null;
};

const NOTHING = (state: ReadingState, why: string, read: ModelRead | null = null): ReadingOutcome =>
  ({ state, why, fields: 0, not_found: 0, claims: 0, left_out: [], read });

/* ------------------------------------------------------------------ *
 * PHASE 146i — ONE UNVOUCHED FIELD NO LONGER DISCARDS THE OTHERS.
 *
 * `assertClaimsWritable` throws on a conditional field whose discriminant is not true, and it throws BEFORE the
 * write, which is right: it is one refusal for one set of claims, and half a write is worse than none. The
 * consequence was that a grant funding agreement — which has six fields, one of them conditional — kept NOTHING
 * unless somebody had vouched for the funder's name, and until this phase nobody could.
 *
 * So the unvouched field is taken out of the extraction HERE, before the claims are built. The ingestion module's
 * refusal is untouched and still fires on anything that reaches it unvouched; what reaches it is a set of claims
 * this function has already made writable. The field that came out is reported, not swallowed: it is still ASKED
 * of the client, like every fact a document did not answer.
 * ------------------------------------------------------------------ */

function leaveOutUnvouched(job: UploadJob, vouched: ClientDocDiscriminants): string[] {
  const extraction = job.extraction;
  if (extraction === undefined) return [];
  const out: string[] = [];
  for (const f of VOUCHED_FIELDS) {
    if (vouched[f.flag] === true) continue;
    const i = extraction.fields.findIndex((x) => x.field_id === f.field_id);
    if (i < 0) continue;
    extraction.fields.splice(i, 1);
    out.push(f.field_id);
  }
  return out;
}

async function readAndClaim(d: UploadDeps, deps: UploadHandlerDeps, job: UploadJob): Promise<ReadingOutcome> {
  if (d.reading === undefined) return NOTHING('NOT_WIRED', 'nothing was read: this upload was not given a document reader');
  if (d.audit === undefined) {
    return NOTHING('NOT_WIRED', 'nothing was read: a reading is written down or it does not happen, and this upload has no audit log');
  }
  const ready = claudeReadiness('DOCUMENT_READING', d.reading.secrets, d.reading.switches ?? CLAUDE_SWITCHES);
  if (ready.state !== 'READY') return NOTHING(ready.state === 'SWITCHED_OFF' ? 'SWITCHED_OFF' : 'NOT_CONFIGURED', `nothing was read: ${ready.why}`);

  const type = job.doc_type;
  if (type === undefined || type === null || job.receipt === undefined || job.state !== 'DISCHARGED') {
    return NOTHING('NOT_READY', 'nothing was read: this upload did not get as far as the step that reads it');
  }
  const ctx = readingContext(d);
  if (ctx === null) return NOTHING('NOT_WIRED', 'nothing was read: this upload was not given a document reader');

  /* STEP 8 FIRST, AND IT HAD NO CALLER EITHER. `processUpload` ends at DISCHARGED; `openTransparency` is a separate
     export of the port and nothing in src/ called it, so the contract's step 8 was as unreached as steps 9 and 10 —
     and step 9 asserts TRIAGED, so it cannot run without it. It runs for EVERY document that gets this far, the two
     a person reads included: the transparency record is about what we hold, not about who reads it.
     THE PEOPLE LIST IS EMPTY, and that is a fact about this build rather than a gap in it: the receipt strip has
     already run, the name exclusion register has already refused every person's name, and this build identifies
     nobody in a client document. A person identified later is added to the record by whoever identified them, which
     is what the Article 14(3)(a) month and `assertTransparencyRecordComplete` are for.
     IT RUNS INSIDE THE SWITCH, ON PURPOSE. Running it outside would change what a finished upload does with reading
     switched off, and this phase's first rule is that it must not. */
  try {
    await openTransparency(deps, job, []);
  } catch (e) {
    return NOTHING('NOT_READY', `nothing was read: the record of what we hold could not be opened, ${whyRefused(e)}`);
  }
  if (HUMAN_READ_ONLY_TYPES.includes(type)) {
    return NOTHING('HUMAN_ONLY', 'nothing was sent: this kind of document is read by a person, never by a model');
  }

  let read: ModelRead;
  try {
    const prepared = await prepareClaudeModel(ctx, job.doc_id, type, job.receipt.retained);
    read = prepared.read;
    if (read.state !== 'READ') {
      // N4. Nothing advances, so every field this document would have answered is still asked of the client.
      return NOTHING('NOT_READ', read.why, read);
    }
    const egress: EgressEntry[] = [];
    await runExtraction(deps, job, { kind: 'MODEL', model: prepared.model, egress });
    writeEgressRow(d.audit, d, job, egress);
  } catch (e) {
    return NOTHING('NOT_READ', `nothing was kept from this document: ${whyRefused(e)}`);
  }

  /* PHASE 146i. What a person said about the two fields nobody can vouch for, from the document's own page — or
     what a caller said instead, which is how a test says it without writing a row. An unvouched field comes out of
     the extraction here so that the rest of the document's claims survive. */
  const vouched = d.reading.discriminants ?? discriminantsFor(d.db, job.doc_id);
  const left_out = leaveOutUnvouched(job, vouched);

  const extraction = job.extraction;
  const fields = extraction?.fields.length ?? 0;
  const not_found = extraction?.not_found.length ?? 0;
  try {
    await writeClaims(deps, job, vouched, async (claims) => {
      if (claims.length === 0) return;
      const values: Record<string, unknown> = {};
      for (const c of claims as readonly { field_id: string; value: unknown }[]) values[c.field_id] = c.value;
      ingestRegisterRecord(d.db, d.newId ?? randomUUID, d.now, job.entity_id,
        { sourceId: 'CLIENT_DOC', entityId: job.doc_id, fields: values });
    });
  } catch (e) {
    return { state: 'NOT_WRITTEN', why: `this document was read and nothing was kept from it: ${whyRefused(e)}`, fields, not_found, claims: 0, left_out, read };
  }
  return {
    state: 'CLAIMED',
    why: `read: ${fields} answered, ${not_found} still asked${leftOutWords(left_out)}`,
    fields, not_found, claims: job.claims?.length ?? 0, left_out, read,
  };
}

/** PHASE 146i. What was left out for want of a person's answer, said in the same sentence and in the same words. */
function leftOutWords(left_out: readonly string[]): string {
  if (left_out.length === 0) return '';
  const what = left_out.map((id) => VOUCHED_FIELDS.find((f) => f.field_id === id)?.what ?? id).join(', ');
  return `. We left out ${what}, because nobody has told us it is an organisation`;
}

/** In plain words, and never a key, a path or a word of the document. The code is enough for a developer. */
function whyRefused(e: unknown): string {
  if (e instanceof UploadHandlerError) return `refused (${e.code})`;
  const code = (e as { code?: unknown } | null)?.code;
  return typeof code === 'string' ? `refused (${code})` : 'it was refused';
}

/**
 * WHAT LEFT THE BUILDING, ONCE PER DOCUMENT. The pipeline's own egress record, which is the answer to "what did you
 * send": the payload's fingerprint, and the KIND and PAGE of each segment sent and each dropped. NEVER THE TEXT.
 */
function writeEgressRow(audit: AuditLog, d: UploadDeps, job: UploadJob, egress: readonly EgressEntry[]): void {
  for (const e of egress) {
    try {
      audit.append({
        at: d.now(), kind: 'DOCUMENT_SENT_TO_MODEL', outcome: 'ALLOWED',
        actor_id: d.actor, actor_role: d.reading?.actor_role ?? null, object_type: 'document', object_id: e.doc_id,
        detail: {
          doc_type: e.doc_type, payload_hash: e.payload_hash,
          sent: e.segments_sent, dropped: e.segments_dropped, fields_requested: e.fields_requested,
          job_id: job.job_id,
        },
      });
    } catch { /* the reading is not undone because the note about it could not be written */ }
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
  // PHASE 140: WHERE THE HANDLER KEPT THE ORIGINAL, SAY SO AND SAY UNTIL WHEN. Only on a job that finished, only where
  // the handler itself wrote the durable copy, and only while KEEP_ORIGINALS is on — so with it off this never runs.
  const kept = job.quarantine.durable_written_at;
  if (kept !== undefined && job.state !== 'FAILED' && d.store.keptDays !== null) {
    const until = new Date(new Date(kept).getTime() + d.store.keptDays * 86_400_000).toISOString();
    d.db.run('UPDATE documents SET original_kept_at = ?, original_delete_after = ? WHERE id = ? AND original_kept_at IS NULL',
      [kept, until, job.doc_id]);
  }
}

/**
 * PHASE 140 — A KEPT ORIGINAL, OPENED. The caller has already asked `document.read_original` of the document. Returns the
 * bytes and what they are, or null where nothing is kept: the switch was off when it arrived, it has been deleted, or its
 * time is up (and then it is deleted now, before anything is served).
 */
export async function openKeptOriginal(
  d: { db: Db; store: FsObjectStore; now: () => string; audit: AuditLog },
  actor: { id: string; role: string }, doc_id: string,
): Promise<{ bytes: Buffer; sniffed_as: string | null; filename: string } | null> {
  await sweepOriginals(d, actor);
  const r = d.db.get<{ original_kept_at: string | null; original_deleted_at: string | null; sniffed_as: string | null; filename: string; logical_document_id: string | null }>(
    'SELECT original_kept_at, original_deleted_at, sniffed_as, filename, logical_document_id FROM documents WHERE id = ?', [doc_id]);
  if (r === undefined || r.original_kept_at === null || r.original_deleted_at !== null) return null;
  const bytes = await d.store.openOriginal(durableKeyFor(doc_id));
  d.audit.append({
    at: d.now(), kind: 'DOCUMENT_ORIGINAL_OPENED', outcome: 'ALLOWED', actor_id: actor.id, actor_role: actor.role,
    object_type: 'document', object_id: r.logical_document_id ?? doc_id, detail: { version: doc_id },
  });
  return { bytes, sniffed_as: r.sniffed_as, filename: r.filename };
}

/**
 * PHASE 140 — DELETE EVERY KEPT ORIGINAL WHOSE TIME IS UP. Runs whenever a folder or an original is opened, and from
 * `node src/cli.ts sweep-originals`. It deletes, then records — a record written first would claim a deletion that had
 * not happened. A file already gone is recorded as deleted: the time is up either way, and nothing is left to serve.
 * Returns how many it deleted.
 */
export async function sweepOriginals(
  d: { db: Db; store: FsObjectStore; now: () => string; audit: AuditLog },
  actor: { id: string; role: string } | null,
): Promise<number> {
  const at = d.now();
  const due = d.db.all<{ id: string; logical_document_id: string | null }>(
    'SELECT id, logical_document_id FROM documents WHERE original_kept_at IS NOT NULL AND original_deleted_at IS NULL AND original_delete_after <= ?', [at]);
  for (const r of due) {
    try { await d.store.delete(durableKeyFor(r.id)); } catch { /* already gone: recorded below all the same */ }
    d.db.run('UPDATE documents SET original_deleted_at = ? WHERE id = ? AND original_deleted_at IS NULL', [at, r.id]);
    d.audit.append({
      at, kind: 'DOCUMENT_ORIGINAL_DELETED', outcome: 'ALLOWED', actor_id: actor?.id ?? null, actor_role: actor?.role ?? null,
      object_type: 'document', object_id: r.logical_document_id ?? r.id, detail: { version: r.id, why: 'its time was up' },
    });
  }
  return due.length;
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
