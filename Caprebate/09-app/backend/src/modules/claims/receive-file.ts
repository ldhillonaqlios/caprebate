/**
 * ONE WAY IN FOR A FILE FROM A MEMBER OF STAFF, AND READING AN UPLOAD FORM. Moved here from the portal's client files
 * (src/modules/portal/client-files-pages.ts) by Phase 161l2 (10 November 2026), unchanged: the claims' document pages
 * (documents.routes.ts), the portal's client files and the CRM's messages all take a file this way, and it reaches
 * only the claims' own documents and uploads, the core and the shared parts.
 *
 * `receiveFile` is the whole of a staff upload, and it is EXACTLY the path a client's upload takes through PUT
 * /upload/put: `startDocumentUpload` (which asks `document.upload` and issues a single-use key), `acceptClientBytes`
 * (the key, the size cap and the content check, on the bytes) and `finishUpload` (the upload handler's receipt
 * contract). It only saves the person a second page with an address on it.
 */
import type { IncomingMessage } from 'node:http';
import type { App } from '../../core/app.ts';
import type { Actor } from '../../core/index.ts';
import { piecedFields, singleFile } from '../../core/index.ts';
import type { FsObjectStore } from '../../shared/index.ts';
import * as D from './documents.ts';
import { acceptClientBytes, DAMAGED_PDF, finishUpload, issuedJob, readerFor } from './uploads.ts';
import { UPLOAD_LIMITS, pdfLooksComplete, sniffAccepted } from './upload-handler-port.ts';

const MAX_BODY = UPLOAD_LIMITS.max_bytes + 64 * 1024;
const TOO_BIG = `That file is too big. The most we take is ${Math.round(UPLOAD_LIMITS.max_bytes / 1024 / 1024)} MB.`;
const NOT_ACCEPTED = 'We cannot take that kind of file. Send a PDF, a photo (JPEG or PNG), or a Word or Excel file.';

/**
 * RECEIVE ONE FILE FROM A MEMBER OF STAFF — through exactly the path a client's upload takes. The size and content check
 * run here first only so a refused file leaves no half-made document behind; `acceptClientBytes` runs them again on the
 * bytes, as it always does, and that is the control.
 */
export async function receiveFile(
  d: { app: App; store: FsObjectStore; newId: () => string }, actor: Actor, args: D.StartArgs, bytes: Uint8Array,
): Promise<{ ok: true; logical_document_id: string; sent_before: string | null } | { ok: false; why: string }> {
  if (bytes.length === 0) return { ok: false, why: 'That file is empty. Choose it again.' };
  if (bytes.length > UPLOAD_LIMITS.max_bytes) return { ok: false, why: TOO_BIG };
  if (sniffAccepted(bytes) === null) return { ok: false, why: NOT_ACCEPTED };
  // A PDF with no end is damaged. acceptClientBytes refuses it too; this only says so first.
  if (sniffAccepted(bytes) === 'pdf' && !pdfLooksComplete(bytes)) return { ok: false, why: 'That PDF is damaged or incomplete: it stops part-way. Save or export it again, then send it.' };
  const db = d.app.db;
  const now = d.app.now;
  const b = await D.startDocumentUpload({ db, audit: d.app.audit, now, newId: d.newId, store: d.store }, actor, args);
  if (!b.ok) return { ok: false, why: b.why };
  // The same single-use key the upload address carries, used here on the same request — never shown, never stored.
  const token = new URL(b.url, 'http://localhost').searchParams.get('token') ?? '';
  const job = issuedJob(db, b.doc_id);
  if (job === null) return { ok: false, why: 'Something went wrong. Try again.' };
  /* `reading` carries the process's key store and transport to steps 9 and 10 of the receipt contract.
     It switches nothing on — CLAUDE_SWITCHES.DOCUMENT_READING is false — and with it off a finished upload behaves
     exactly as it did before. args.business_id is the client whose gates are recorded on the reading's audit row. */
  const deps = { db, store: d.store, now, actor: actor.id, newId: d.newId, audit: d.app.audit,
    reading: readerFor(d.app, args.business_id, actor.role) };
  const r = await acceptClientBytes(deps, { doc_id: b.doc_id, token, bytes });
  if (!r.ok) return { ok: false, why: r.status === 413 ? TOO_BIG : r.status === 415 ? NOT_ACCEPTED : r.why === DAMAGED_PDF ? 'That PDF is damaged or incomplete: it stops part-way. Save or export it again, then send it.' : 'Something went wrong. Try again.' };
  const done = await finishUpload(deps, job, r.written_at);
  if (done.error !== undefined) {
    return { ok: false, why: done.error.code === 'E_UNRECOGNISED_DOC_TYPE'
      ? 'We could not read it as that kind of document. Check what it is and try again.'
      : 'We could not use that file. Try again, or send it as a PDF.' };
  }
  return { ok: true, logical_document_id: b.logical_document_id, sent_before: r.sent_before };
}

/** A multipart upload's file and fields, or why not. */
export async function readUpload(
  req: IncomingMessage, body: (r: IncomingMessage, max?: number) => Promise<Buffer>,
  pieces?: (id: string) => Promise<{ ok: true; bytes: Uint8Array } | { ok: false; why: string }>,
): Promise<{ ok: true; bytes: Uint8Array; fields: Record<string, string> } | { ok: false; why: string }> {
  let raw0: Buffer;
  try { raw0 = await body(req, MAX_BODY); } catch { return { ok: false, why: TOO_BIG }; }
  // A file over Vercel's 4.5 MB a request was sent first in pieces (src/core/upload-pieces.ts); the form
  // comes with its file box empty and the send's id in `pieces`. Everything after this reads the bytes as before.
  const sent = pieces === undefined ? null : piecedFields(new Uint8Array(raw0), req.headers['content-type']);
  if (sent !== null && pieces !== undefined) {
    const got = await pieces(sent.id);
    if (!got.ok) return got;
    return { ok: true, bytes: got.bytes, fields: sent.fields };
  }
  const parsed = singleFile(new Uint8Array(raw0), req.headers['content-type']);
  if (!parsed.ok) return { ok: false, why: parsed.why === 'no file was attached' ? 'Choose a file first.' : `${parsed.why.charAt(0).toUpperCase()}${parsed.why.slice(1)}.` };
  return { ok: true, bytes: parsed.part.bytes, fields: parsed.fields };
}
