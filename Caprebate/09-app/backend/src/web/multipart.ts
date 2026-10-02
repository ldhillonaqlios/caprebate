/**
 * A DELIBERATELY SMALL multipart/form-data READER — one file, some fields.
 *
 * WHY IT EXISTS AT ALL. The security baseline forbids inline script and the
 * pages are server-rendered and work with JavaScript disabled. A browser form
 * that carries a file has exactly one encoding available to it, and this is it.
 * Without a reader the settings page would have to tell a member of staff to
 * upload their photograph with `curl`, which is what the client document upload
 * does — and is defensible there, where a pre-signed capability is the real
 * design, and silly here.
 *
 * WHY IT IS SO SMALL, AND WHY THAT IS THE SAFE DIRECTION. Multipart parsing has
 * a long history of holes, and almost all of them come from being generous:
 * nested multiparts, transfer encodings, header continuations, filenames trusted
 * as paths, missing terminators tolerated. THIS READER IS UNGENEROUS. It accepts
 * one flat level, refuses anything it does not recognise rather than guessing,
 * caps the number of parts, and NEVER RETURNS A FILENAME AS A PATH — the caller
 * gets the bytes and a name it is expected to treat as a label.
 *
 * IT IS ALSO NOT THE CONTROL. Whatever comes out of here is sniffed, size
 * capped and re-encoded before it is stored. A parser is a way of reading a
 * request; the allow-list is somewhere else and stays there.
 */

export class MultipartError extends Error {
  readonly code = 'E_MULTIPART';
}

export type Part = {
  readonly name: string;
  /** Present for a file part. A LABEL, never a path — see the header. */
  readonly filename?: string;
  readonly content_type?: string;
  readonly bytes: Uint8Array;
};

const MAX_PARTS = 20;
const MAX_HEADER_BYTES = 8 * 1024;

export function boundaryOf(contentType: string | undefined): string | null {
  if (contentType === undefined) return null;
  if (!/^multipart\/form-data\b/i.test(contentType.trim())) return null;
  const m = /boundary=(?:"([^"]+)"|([^;\s]+))/i.exec(contentType);
  const b = m?.[1] ?? m?.[2];
  return b === undefined || b.length === 0 || b.length > 200 ? null : b;
}

/**
 * Split a body into parts.
 *
 * Byte-oriented throughout: the payload is not a string and treating it as one
 * is how a file survives a round trip through UTF-8 replacement characters and
 * arrives corrupt. Only the HEADERS of each part are decoded, and only as latin1.
 */
export function parseMultipart(body: Uint8Array, boundary: string): Part[] {
  const buf = Buffer.from(body);
  const delim = Buffer.from(`--${boundary}`, 'latin1');
  const parts: Part[] = [];

  let index = buf.indexOf(delim);
  if (index !== 0) throw new MultipartError('that upload did not start with its own boundary');

  while (index >= 0) {
    let cursor = index + delim.length;
    // The closing delimiter is `--boundary--`.
    if (buf[cursor] === 0x2d && buf[cursor + 1] === 0x2d) return parts;
    // Otherwise CRLF (or a bare LF, which some clients send).
    if (buf[cursor] === 0x0d && buf[cursor + 1] === 0x0a) cursor += 2;
    else if (buf[cursor] === 0x0a) cursor += 1;
    else throw new MultipartError('that upload is not shaped like a form');

    const headerEnd = findHeaderEnd(buf, cursor);
    if (headerEnd === null) throw new MultipartError('a part of that upload has no headers');
    if (headerEnd.end - cursor > MAX_HEADER_BYTES) {
      throw new MultipartError('a part of that upload has an unreasonable header');
    }
    const headerText = buf.subarray(cursor, headerEnd.end).toString('latin1');

    const next = buf.indexOf(delim, headerEnd.body);
    if (next < 0) throw new MultipartError('that upload was cut short');
    // The CRLF immediately before the delimiter belongs to the delimiter.
    let bodyEnd = next;
    if (buf[bodyEnd - 1] === 0x0a) bodyEnd--;
    if (buf[bodyEnd - 1] === 0x0d) bodyEnd--;

    const disposition = /content-disposition:\s*form-data;([^\r\n]*)/i.exec(headerText)?.[1] ?? '';
    const name = /(?:^|;)\s*name="([^"]*)"/i.exec(disposition)?.[1];
    if (name === undefined) throw new MultipartError('a part of that upload has no name');
    const filename = /(?:^|;)\s*filename="([^"]*)"/i.exec(disposition)?.[1];
    const contentType = /content-type:\s*([^\r\n;]+)/i.exec(headerText)?.[1]?.trim();

    parts.push({
      name,
      ...(filename === undefined ? {} : { filename }),
      ...(contentType === undefined ? {} : { content_type: contentType }),
      bytes: new Uint8Array(buf.subarray(headerEnd.body, bodyEnd)),
    });
    if (parts.length > MAX_PARTS) throw new MultipartError('that upload has too many parts');

    index = next;
  }
  throw new MultipartError('that upload has no closing boundary');
}

function findHeaderEnd(buf: Buffer, from: number): { end: number; body: number } | null {
  const crlf2 = buf.indexOf('\r\n\r\n', from, 'latin1');
  const lf2 = buf.indexOf('\n\n', from, 'latin1');
  if (crlf2 >= 0 && (lf2 < 0 || crlf2 <= lf2)) return { end: crlf2, body: crlf2 + 4 };
  if (lf2 >= 0) return { end: lf2, body: lf2 + 2 };
  return null;
}

/**
 * The one shape this application actually posts: a form with a single file.
 *
 * Returns the FIRST part that carries a filename. A form that posted two files
 * would silently use one of them, so it refuses instead — this reader has one
 * caller and one job, and a convenience that guesses is how it acquires a
 * second.
 */
export function singleFile(
  body: Uint8Array, contentType: string | undefined,
): { ok: true; part: Part; fields: Record<string, string> } | { ok: false; why: string } {
  const boundary = boundaryOf(contentType);
  if (boundary === null) return { ok: false, why: 'that request is not a file upload' };
  let parts: Part[];
  try {
    parts = parseMultipart(body, boundary);
  } catch (e) {
    return { ok: false, why: e instanceof MultipartError ? e.message : 'that upload could not be read' };
  }
  const files = parts.filter((p) => p.filename !== undefined && p.bytes.length > 0);
  if (files.length === 0) return { ok: false, why: 'no file was attached' };
  if (files.length > 1) return { ok: false, why: 'attach one file, not several' };
  const fields: Record<string, string> = {};
  for (const p of parts) {
    if (p.filename === undefined) fields[p.name] = Buffer.from(p.bytes).toString('utf8');
  }
  const part = files[0];
  if (part === undefined) return { ok: false, why: 'no file was attached' };
  return { ok: true, part, fields };
}

/**
 * 2 Oct 2026: SEVERAL PHOTOS IN ONE FORM — the client's "send lots of photos at once" (src/web/evidence-pages.ts).
 * The same ungenerous reader; every file part is returned, in order, up to `max` of them (the parts cap above still
 * holds). A form that posts more than `max` is refused, not cut short.
 */
export function manyFiles(
  body: Uint8Array, contentType: string | undefined, max: number,
): { ok: true; files: Part[]; fields: Record<string, string> } | { ok: false; why: string } {
  const boundary = boundaryOf(contentType);
  if (boundary === null) return { ok: false, why: 'that request is not a file upload' };
  let parts: Part[];
  try {
    parts = parseMultipart(body, boundary);
  } catch (e) {
    return { ok: false, why: e instanceof MultipartError ? e.message : 'that upload could not be read' };
  }
  const files = parts.filter((p) => p.filename !== undefined && p.bytes.length > 0);
  if (files.length === 0) return { ok: false, why: 'no file was attached' };
  if (files.length > max) return { ok: false, why: `attach at most ${String(max)} files at a time` };
  const fields: Record<string, string> = {};
  for (const p of parts) {
    if (p.filename === undefined) fields[p.name] = Buffer.from(p.bytes).toString('utf8');
  }
  return { ok: true, files, fields };
}
