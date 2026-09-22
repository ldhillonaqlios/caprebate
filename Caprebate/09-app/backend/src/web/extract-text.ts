/**
 * READING TEXT OUT OF AN UPLOADED DOCUMENT — AND REFUSING TO INVENT ANY.
 *
 * This is the module behind the `TextExtractor` port. Before Phase 113c the
 * port was filled by a reader that handled text-bearing uploads honestly and
 * returned ONE MARKER LINE for everything else — so the receipt strip, on a
 * PDF or a .docx, ran over a marker rather than over the document. Two of
 * those three cases are now real:
 *
 *   .docx  — read through the ONE zip reader this project has (`zip.ts`),
 *            the same one the engagement letter uses. Nearly free.
 *   PDF    — uncompressed and FlateDecode content streams, text pulled from
 *            the Tj, TJ, ' and " operators. This is the real work, IT WILL NOT
 *            READ EVERY PDF, AND IT IS NOT SUPPOSED TO.
 *   text   — unchanged, and still the honest reading it always was.
 *
 * ═══ THE RULE THIS FILE IS BUILT AROUND, AND IT IS N4 ═══
 *
 * EVERY PATH THAT CANNOT READ A DOCUMENT RETURNS THE MARKER. Not a guess, and
 * — this is the half that is easy to get wrong — NOT AN EMPTY PAGE. An
 * encrypted PDF, a scanned one, an unsupported filter, a malformed zip, an
 * .xlsx where a .docx was expected: all marker.
 *
 * The reason is the whole reason the stub was written the way it was. A fake
 * that invented plausible page text would be worse than useless: the receipt
 * strip would be stripping content nobody uploaded, and the `document_events`
 * trail would record a strip that never touched a real name. AND AN EMPTY PAGE
 * IS THE SAME LIE IN A QUIETER VOICE — downstream, zero segments reads as "we
 * looked and there was nothing to redact", which is exactly the favourable
 * branch N4 forbids an unknown from taking. `markerPages()` is therefore the
 * only failure return in this file, and every `catch` and every empty result
 * funnels into it.
 *
 * NO NEW RUNTIME DEPENDENCY. node:zlib does the inflating. The back end still
 * has exactly one (@node-rs/argon2).
 *
 * WHAT IS STILL NOT READ, and it is why row 4 of the spec's stub table changes
 * wording rather than disappearing: a SCANNED PDF (page images, no text
 * operators — OCR, which is a library and a decision, not a gap), an ENCRYPTED
 * PDF, LZW/ASCII85/JBIG2/CCITT-filtered content, .doc (the pre-2007 binary
 * format), .xlsx and .pptx.
 */

import { docxDocumentXml, docxParagraphTexts } from './zip.ts';
import { inflateSync, inflateRawSync } from 'node:zlib';

export type ExtractedPage = { page: number; lines: string[] };

/* ------------------------------------------------------------------ *
 * THE MARKER
 * ------------------------------------------------------------------ */

/**
 * Every marker line starts with this, so a consumer can recognise one without
 * matching a whole sentence, and so a test can assert the marker is present
 * rather than asserting an exact wording a later phase would break.
 *
 * DELIBERATELY LOWER CASE, and that is not a style choice. `segment()` in the
 * document pipeline treats a short ALL-CAPS line as a HEADING and runs it
 * through `classifyHeading`. A shouting marker would therefore be classified
 * as a document section — most likely UNCLASSIFIED, but "most likely" is not a
 * control. Lower case keeps it what it is: a line of body text saying that
 * there is no body text.
 */
export const UNREADABLE_MARKER_PREFIX = '[unreadable document —';

export type MarkerReason =
  | 'we cannot read text from this kind of file yet'
  | 'this PDF is encrypted'
  | 'this PDF has no text we can read — it is most likely a scan, and we cannot read scans yet'
  | 'this PDF uses a filter we cannot read yet'
  | 'this .docx could not be opened — it is damaged, or it is not really a Word file';

export function markerPages(reason: MarkerReason): ExtractedPage[] {
  return [{ page: 1, lines: [`${UNREADABLE_MARKER_PREFIX} ${reason}]`] }];
}

/** True when `pages` is a refusal rather than a reading. */
export function isMarkerPages(pages: readonly ExtractedPage[]): boolean {
  return pages.length === 1
    && pages[0]!.lines.length === 1
    && pages[0]!.lines[0]!.startsWith(UNREADABLE_MARKER_PREFIX);
}

/**
 * The single gate to the marker. No page may be empty and no page list may be:
 * an empty reading is an unread document wearing a reassuring face.
 */
function orMarker(pages: ExtractedPage[] | null, reason: MarkerReason): ExtractedPage[] {
  if (pages === null) return markerPages(reason);
  const kept = pages
    .map((p) => ({ page: p.page, lines: p.lines.map((l) => l.trim()).filter((l) => l.length > 0) }))
    .filter((p) => p.lines.length > 0);
  return kept.length === 0 ? markerPages(reason) : kept;
}

/* ------------------------------------------------------------------ *
 * THE DISPATCH — ON THE BYTES, NEVER ON A FILENAME
 *
 * The filename is a claim; the magic number is the fact. That is the position
 * `sniffAccepted` takes in the upload handler, and it is taken again here
 * because this function is also reachable from a caller that never saw that
 * check.
 * ------------------------------------------------------------------ */

export function extractPages(bytes: Uint8Array): ExtractedPage[] {
  const buf = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  if (startsWith(buf, [0x50, 0x4b, 0x03, 0x04])) return extractOoxml(buf);
  if (startsWith(buf, [0x25, 0x50, 0x44, 0x46])) return extractPdf(buf);
  return extractPlainText(buf);
}

function startsWith(buf: Buffer, magic: readonly number[]): boolean {
  if (buf.length < magic.length) return false;
  for (let i = 0; i < magic.length; i++) if (buf[i] !== magic[i]) return false;
  return true;
}

/* ------------------------------------------------------------------ *
 * .docx
 *
 * ONE PAGE, AND THAT IS HONEST RATHER THAN LAZY. A .docx has no pages until
 * something lays it out — Word's own page breaks are a rendering hint, not a
 * property of the file. The segmenter works on lines and headings, not on page
 * boundaries, so nothing downstream loses anything, and inventing page numbers
 * would be inventing.
 * ------------------------------------------------------------------ */

const DOCX_UNREADABLE: MarkerReason =
  'this .docx could not be opened — it is damaged, or it is not really a Word file';

export function extractOoxml(buf: Buffer): ExtractedPage[] {
  let xml: string;
  try {
    xml = docxDocumentXml(buf);
  } catch {
    // An .xlsx or .pptx lands here too, and so does a truncated upload. They
    // cannot be told apart without guessing, so the marker says the thing that
    // is certainly true of all of them.
    return markerPages(DOCX_UNREADABLE);
  }
  return orMarker([{ page: 1, lines: docxParagraphTexts(xml) }], DOCX_UNREADABLE);
}

/* ------------------------------------------------------------------ *
 * PLAIN TEXT — the reading this module inherited, unchanged
 * ------------------------------------------------------------------ */

const NOT_TEXT: MarkerReason = 'we cannot read text from this kind of file yet';

export function extractPlainText(buf: Buffer): ExtractedPage[] {
  const text = buf.toString('utf8');
  const printable = text.replace(/[^\P{C}\n]/gu, '');
  const looksTextual = printable.length > 0 && printable.length / Math.max(text.length, 1) > 0.9;
  if (!looksTextual) return markerPages(NOT_TEXT);
  return orMarker([{ page: 1, lines: printable.split('\n') }], NOT_TEXT);
}

/* ================================================================== *
 * PDF
 *
 * Enough of the format to get the text out of a generated document, and no
 * more. It walks the objects, resolves the page tree where it can, inflates
 * FlateDecode content streams, and reads the text-showing operators. It does
 * NOT do fonts, encodings beyond Latin-1 and UTF-16, ligature mapping, column
 * ordering, or OCR. Where any of that would be needed to answer honestly, it
 * returns the marker instead.
 * ================================================================== */

const PDF_NO_TEXT: MarkerReason =
  'this PDF has no text we can read — it is most likely a scan, and we cannot read scans yet';
const PDF_FILTER: MarkerReason = 'this PDF uses a filter we cannot read yet';

export function extractPdf(buf: Buffer): ExtractedPage[] {
  // latin1 keeps one character per byte, so every index into this string is a
  // byte offset into the file. That is what lets the object scan below slice
  // binary stream data out of a string at all.
  const s = buf.toString('latin1');

  // ENCRYPTED FIRST, BEFORE ANYTHING ELSE IS ATTEMPTED. A partly-decrypted
  // stream can inflate into plausible-looking rubbish, which is precisely the
  // "invents page text" failure this module exists to avoid. /Encrypt in a
  // trailer means every string and stream in the file is enciphered.
  if (/\/Encrypt[\s/<[]/.test(s)) return markerPages('this PDF is encrypted');

  const objects = scanObjects(s);
  const refsByPage = pageContentRefs(s, objects);

  const pages: ExtractedPage[] = [];
  let sawUnsupportedFilter = false;

  for (let i = 0; i < refsByPage.length; i++) {
    const lines: string[] = [];
    for (const ref of refsByPage[i]!) {
      const obj = objects.get(ref);
      if (obj === undefined) continue;
      const decoded = decodeStream(s, obj);
      if (decoded === 'UNSUPPORTED_FILTER') { sawUnsupportedFilter = true; continue; }
      if (decoded === null) continue;
      lines.push(...contentStreamLines(decoded));
    }
    pages.push({ page: i + 1, lines });
  }

  const anyText = pages.some((p) => p.lines.some((l) => l.trim().length > 0));
  if (!anyText) return markerPages(sawUnsupportedFilter ? PDF_FILTER : PDF_NO_TEXT);
  return orMarker(pages, PDF_NO_TEXT);
}

type PdfObject = { num: number; start: number; end: number };

/**
 * Every `N G obj … endobj` in the file, by object number.
 *
 * SCANNED RATHER THAN READ OUT OF THE XREF TABLE, on purpose. A
 * cross-reference table is the fast path and it is also the fragile one: it is
 * wrong in every incrementally-updated file unless the whole update chain is
 * followed, and it is absent altogether from a file with a cross-reference
 * STREAM. One scan cannot be stale.
 */
function scanObjects(s: string): Map<number, PdfObject> {
  const out = new Map<number, PdfObject>();
  const re = /(?:^|[\s>])(\d+)\s+(\d+)\s+obj\b/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s)) !== null) {
    const num = Number(m[1]);
    const start = m.index + m[0].length;
    const end = s.indexOf('endobj', start);
    if (end < 0) continue;
    // A later definition of the same object number is an incremental update
    // and supersedes the earlier one, which is why this overwrites.
    out.set(num, { num, start, end });
    re.lastIndex = start;
  }
  return out;
}

/**
 * The content-stream references of each page, in page order.
 *
 * TWO ROUTES, AND THE SECOND IS DECLARED A FALLBACK RATHER THAN HIDDEN. The
 * first walks /Root then /Pages then /Kids, which gives the real page order.
 * When the catalogue cannot be found — most often because it lives inside an
 * object stream this reader does not open — the second takes every `/Type
 * /Page` object in FILE ORDER. That is the order every generator this build
 * has met writes them in, and it is still an assumption: it could put page 3's
 * text under page 2's number. It CANNOT invent text, which is the property
 * that matters here, and a page number is not a fact anything downstream
 * relieves a client on.
 */
function pageContentRefs(s: string, objects: Map<number, PdfObject>): number[][] {
  const walked = walkPageTree(s, objects);
  if (walked !== null) return walked;

  const out: number[][] = [];
  for (const o of [...objects.values()].sort((a, b) => a.start - b.start)) {
    const body = s.slice(o.start, o.end);
    if (!/\/Type\s*\/Page(?![a-zA-Z])/.test(body)) continue;
    out.push(contentsRefsOf(body));
  }
  return out;
}

function walkPageTree(s: string, objects: Map<number, PdfObject>): number[][] | null {
  const root = /\/Root\s+(\d+)\s+\d+\s+R/.exec(s);
  if (root === null) return null;
  const catalog = objects.get(Number(root[1]));
  if (catalog === undefined) return null;
  const pagesRef = /\/Pages\s+(\d+)\s+\d+\s+R/.exec(s.slice(catalog.start, catalog.end));
  if (pagesRef === null) return null;

  const out: number[][] = [];
  const seen = new Set<number>();
  const visit = (num: number, depth: number): void => {
    if (depth > 32 || seen.has(num)) return;
    seen.add(num);
    const o = objects.get(num);
    if (o === undefined) return;
    const body = s.slice(o.start, o.end);
    if (/\/Type\s*\/Page(?![a-zA-Z])/.test(body)) { out.push(contentsRefsOf(body)); return; }
    const kids = /\/Kids\s*\[([\s\S]*?)\]/.exec(body);
    if (kids === null) return;
    for (const k of kids[1]!.matchAll(/(\d+)\s+\d+\s+R/g)) visit(Number(k[1]), depth + 1);
  };
  visit(Number(pagesRef[1]), 0);
  return out.length === 0 ? null : out;
}

/** `/Contents 5 0 R` and `/Contents [5 0 R 6 0 R]` mean the same thing. */
function contentsRefsOf(body: string): number[] {
  const arr = /\/Contents\s*\[([\s\S]*?)\]/.exec(body);
  if (arr !== null) return [...arr[1]!.matchAll(/(\d+)\s+\d+\s+R/g)].map((m) => Number(m[1]));
  const one = /\/Contents\s+(\d+)\s+\d+\s+R/.exec(body);
  return one === null ? [] : [Number(one[1])];
}

/**
 * The bytes of one stream, decoded.
 *
 * Returns null when the object holds no stream at all, and the sentinel
 * 'UNSUPPORTED_FILTER' when it holds one this build cannot decode. THOSE TWO
 * ARE DIFFERENT and telling them apart is what lets the marker say WHY — "no
 * extractable text" and "a filter we do not decode" send a reader to two
 * different places.
 */
function decodeStream(s: string, o: PdfObject): string | null | 'UNSUPPORTED_FILTER' {
  const body = s.slice(o.start, o.end);
  const opens = /\bstream(\r\n|\n|\r)/.exec(body);
  if (opens === null) return null;
  const dict = body.slice(0, opens.index);
  const dataStart = opens.index + opens[0].length;

  // /Length when it is a direct integer; the endstream keyword otherwise. A
  // /Length written as an indirect reference is common enough that falling
  // back rather than failing is worth the eight characters.
  const len = /\/Length\s+(\d+)(?!\s+\d+\s+R)/.exec(dict);
  const dataEnd = len !== null ? dataStart + Number(len[1]) : body.indexOf('endstream', dataStart);
  if (dataEnd <= dataStart) return null;
  const raw = body.slice(dataStart, dataEnd);

  const filter = /\/Filter\s*(?:\[\s*)?\/([A-Za-z0-9]+)/.exec(dict);
  if (filter === null) return raw;
  if (filter[1] !== 'FlateDecode') return 'UNSUPPORTED_FILTER';

  const bytes = Buffer.from(raw, 'latin1');
  try {
    return inflateSync(bytes).toString('latin1');
  } catch {
    try {
      // Some producers write a raw deflate stream with no zlib header.
      return inflateRawSync(bytes).toString('latin1');
    } catch {
      return null;
    }
  }
}

/* ------------------------------------------------------------------ *
 * THE CONTENT STREAM SCANNER
 *
 * A content stream is postfix: operands, then the operator that consumes them.
 * Five operators produce text and four position operators are read as line
 * breaks. Everything else — colours, graphics state, paths, images — is
 * skipped by simply not matching.
 *
 * THE ONE PLACE THIS ADDS A CHARACTER THE DOCUMENT DOES NOT CONTAIN is the
 * word space inside a TJ array, and it is declared here rather than buried. A
 * TJ array interleaves strings with kerning numbers in thousandths of an em,
 * and a large negative number is how every producer writes a word space. Below
 * the threshold nothing is inserted. This is a rendering fact and not content:
 * it cannot introduce a name, and without it every word runs into the next one
 * and no name would match either.
 * ------------------------------------------------------------------ */

const TJ_SPACE_THRESHOLD = -100;

/** A sentinel operand marking where the most recent `[ … ]` ended. */
const ARRAY_END = ' ARRAY_END';

export function contentStreamLines(content: string): string[] {
  const lines: string[] = [];
  let line = '';
  const flush = (): void => { if (line.trim().length > 0) lines.push(line.trim()); line = ''; };

  let i = 0;
  let pending: (string | number)[] = [];
  let array: (string | number)[] | null = null;
  const push = (v: string | number): void => { (array ?? pending).push(v); };

  while (i < content.length) {
    const c = content[i]!;

    if (c === '(') { const r = readLiteralString(content, i); push(r.value); i = r.next; continue; }
    if (c === '<' && content[i + 1] !== '<') { const r = readHexString(content, i); push(r.value); i = r.next; continue; }
    if (c === '[') { array = []; i++; continue; }
    if (c === ']') { pending.push(...(array ?? []), ARRAY_END); array = null; i++; continue; }
    if (c === '<' || c === '>') { i++; continue; }

    if (/[-+0-9.]/.test(c)) {
      const m = /^[-+]?[0-9]*\.?[0-9]+/.exec(content.slice(i));
      if (m !== null) { push(Number(m[0])); i += m[0].length; continue; }
      i++; continue;
    }

    const op = /^(T\*|Tj|TJ|Td|TD|Tm|BT|ET|'|")/.exec(content.slice(i));
    if (op !== null) {
      const name = op[1]!;
      if (name === 'Tj') {
        const last = lastString(pending);
        if (last !== null) line += last;
      } else if (name === 'TJ') {
        line += joinTjArray(pending);
      } else if (name === "'" || name === '"') {
        // Both move to the next line and then show a string.
        flush();
        const last = lastString(pending);
        if (last !== null) line += last;
      } else {
        // Td, TD, Tm, BT, ET. A new text position is a new line: the standard
        // heuristic, and the only one available without laying the page out.
        flush();
      }
      pending = [];
      i += name.length;
      continue;
    }

    // Any other operator: it consumes its operands and produces no text.
    const word = /^[A-Za-z][A-Za-z0-9*]*/.exec(content.slice(i));
    if (word !== null) { pending = []; i += word[0].length; continue; }
    i++;
  }
  flush();
  return lines;
}

function lastString(pending: readonly (string | number)[]): string | null {
  for (let i = pending.length - 1; i >= 0; i--) {
    const v = pending[i];
    if (typeof v === 'string' && v !== ARRAY_END) return v;
  }
  return null;
}

/** The operands of the most recent `[ … ]`, rendered with word spaces. */
function joinTjArray(pending: readonly (string | number)[]): string {
  const end = pending.lastIndexOf(ARRAY_END);
  const items = end < 0 ? [...pending] : pending.slice(0, end);
  let start = 0;
  for (let i = items.length - 1; i >= 0; i--) {
    if (items[i] === ARRAY_END) { start = i + 1; break; }
  }
  let out = '';
  for (const v of items.slice(start)) {
    if (typeof v === 'string') out += v;
    else if (v < TJ_SPACE_THRESHOLD && !out.endsWith(' ')) out += ' ';
  }
  return out;
}

/** `( … )` with balanced parentheses, backslash escapes and octal codes. */
function readLiteralString(s: string, at: number): { value: string; next: number } {
  let i = at + 1;
  let depth = 1;
  const bytes: number[] = [];
  while (i < s.length) {
    const c = s[i]!;
    if (c === '\\') {
      const n = s[i + 1];
      if (n === undefined) { i++; continue; }
      if (n === 'n') { bytes.push(10); i += 2; continue; }
      if (n === 'r') { bytes.push(13); i += 2; continue; }
      if (n === 't') { bytes.push(9); i += 2; continue; }
      if (n === 'b') { bytes.push(8); i += 2; continue; }
      if (n === 'f') { bytes.push(12); i += 2; continue; }
      if (n === '\n') { i += 2; continue; }
      if (n === '\r') { i += s[i + 2] === '\n' ? 3 : 2; continue; }
      const oct = /^[0-7]{1,3}/.exec(s.slice(i + 1));
      if (oct !== null) { bytes.push(parseInt(oct[0], 8) & 0xff); i += 1 + oct[0].length; continue; }
      bytes.push(n.charCodeAt(0) & 0xff); i += 2; continue;
    }
    if (c === '(') { depth++; bytes.push(40); i++; continue; }
    if (c === ')') { depth--; if (depth === 0) { i++; break; } bytes.push(41); i++; continue; }
    bytes.push(c.charCodeAt(0) & 0xff);
    i++;
  }
  return { value: decodeTextBytes(Buffer.from(bytes)), next: i };
}

/** `<48656C6C6F>`, an odd digit count padded with a zero as the format says. */
function readHexString(s: string, at: number): { value: string; next: number } {
  const close = s.indexOf('>', at);
  if (close < 0) return { value: '', next: s.length };
  let hex = s.slice(at + 1, close).replace(/[^0-9a-fA-F]/g, '');
  if (hex.length % 2 === 1) hex += '0';
  return { value: decodeTextBytes(Buffer.from(hex, 'hex')), next: close + 1 };
}

/**
 * PDF text bytes are Latin-1 unless the string opens with a UTF-16 byte-order
 * mark. Anything genuinely font-encoded — a subset font with a custom cmap —
 * comes out as the wrong characters, and that is a VISIBLE limit rather than a
 * silent one: it produces gibberish, not a plausible sentence, so a reader can
 * see that it happened.
 */
function decodeTextBytes(b: Buffer): string {
  if (b.length >= 2 && b[0] === 0xfe && b[1] === 0xff) return Buffer.from(b.subarray(2)).swap16().toString('utf16le');
  if (b.length >= 2 && b[0] === 0xff && b[1] === 0xfe) return b.subarray(2).toString('utf16le');
  return b.toString('latin1');
}
