/**
 * ONE ZIP READER, AND THE PROJECT NOW HAS EXACTLY ONE.
 *
 * This is `letter.ts`'s central-directory walk, lifted here unchanged so that
 * the upload text extractor can use it. IT WAS NOT REWRITTEN AND IT WAS NOT
 * COPIED — `letter.ts` now imports it. Phase 113c's brief is explicit about
 * that: "DO NOT WRITE A SECOND ZIP READER", because a second one would be a
 * second place for the two traps below to be got wrong.
 *
 * TRAP ONE — A DOCX ZIP IN THIS CORPUS USES BACKSLASH ENTRY PATHS. Looking up
 * "word/document.xml" returns nothing and reads EXACTLY like a corrupt file.
 * The engagement letter really does store `word\document.xml`, the first
 * version of that reader shelled out to `unzip -p` asking for the
 * forward-slash name and got "filename not matched", and the COORDINATES block
 * in the action plan carries the warning to this day. `docxDocumentXml` below
 * tries both spellings, so no caller has to remember.
 *
 * TRAP TWO — NO EXTERNAL BINARY, AND NO NEW RUNTIME DEPENDENCY. Shelling out
 * to `unzip` made the portal depend on a tool that is not on a stock Windows
 * machine, in a back end whose whole claim is one runtime dependency
 * (@node-rs/argon2). node:zlib does the inflating; this file adds nothing to
 * package.json.
 */

import { readFileSync } from 'node:fs';
import { inflateRawSync } from 'node:zlib';

/**
 * Read one entry out of a zip held in memory.
 *
 * THROWS RATHER THAN RETURNING NULL, and the callers differ on purpose. The
 * engagement letter is a file this build ships and a missing entry there is a
 * broken install, so `letter.ts` lets it throw. An uploaded document is a
 * client's file and a malformed one is an ordinary event, so the extractor
 * catches and returns the unreadable marker — never an empty page.
 */
export function readZipEntryFromBuffer(buf: Buffer, names: readonly string[]): Buffer {
  // End of central directory: signature 0x06054b50, scanned from the tail.
  let eocd = -1;
  for (let i = buf.length - 22; i >= 0 && i > buf.length - 66_000; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('not a zip file');

  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);

  for (let n = 0; n < count; n++) {
    if (p + 46 > buf.length || buf.readUInt32LE(p) !== 0x02014b50) {
      throw new Error('bad central directory entry');
    }
    const method = buf.readUInt16LE(p + 10);
    const compSize = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const localOff = buf.readUInt32LE(p + 42);
    const name = buf.subarray(p + 46, p + 46 + nameLen).toString('utf8');

    if (names.includes(name)) {
      // The local header repeats the name and extra lengths, and they can
      // differ from the central directory's — reading the central ones here
      // is the classic off-by-a-few-bytes bug.
      const lNameLen = buf.readUInt16LE(localOff + 26);
      const lExtraLen = buf.readUInt16LE(localOff + 28);
      const start = localOff + 30 + lNameLen + lExtraLen;
      const raw = buf.subarray(start, start + compSize);
      if (method === 0) return Buffer.from(raw);
      if (method === 8) return inflateRawSync(raw);
      throw new Error(`unsupported zip compression method ${method} for ${name}`);
    }
    p += 46 + nameLen + extraLen + commentLen;
  }
  throw new Error(`no ${names.join(' or ')} in this zip`);
}

/** The same, for a zip on disk. */
export function readZipEntry(path: string, names: readonly string[]): Buffer {
  try {
    return readZipEntryFromBuffer(readFileSync(path), names);
  } catch (e) {
    throw new Error(`${(e as Error).message}: ${path}`);
  }
}

/** Both spellings of the word-processing part, so no caller repeats trap one. */
export const DOCX_DOCUMENT_ENTRIES = ['word/document.xml', 'word\\document.xml'] as const;

export function docxDocumentXml(buf: Buffer): string {
  return readZipEntryFromBuffer(buf, DOCX_DOCUMENT_ENTRIES).toString('utf8');
}

/**
 * The paragraphs of a WordprocessingML body, in document order, trimmed, with
 * the empty ones dropped.
 *
 * NOTHING IS INTERPRETED HERE. A `w:p` becomes the concatenation of its `w:t`
 * runs and nothing else — no substitution, no heading detection, no
 * classification. `letter.ts` layers the specimen substitution on top; the
 * extractor layers nothing at all. Keeping the split here is what makes one
 * reader serve both without either one inheriting the other's rules.
 */
export function docxParagraphTexts(xml: string): string[] {
  const out: string[] = [];
  for (const p of xml.match(/<w:p[ >][\s\S]*?<\/w:p>/g) ?? []) {
    const runs = [...p.matchAll(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g)].map((m) => m[1] ?? '');
    const text = decodeXmlEntities(runs.join('').replace(/<[^>]+>/g, '')).trim();
    if (text.length > 0) out.push(text);
  }
  return out;
}

/**
 * The five predefined XML entities and numeric references.
 *
 * WITHOUT THIS A NAME CONTAINING AN AMPERSAND SURVIVES THE STRIP AS
 * `&amp;`-escaped text, which is a different string from the one a redaction
 * rule is looking for. It is also simply what the document said: `w:t` content
 * is XML, and `&amp;` in the file means `&` on the page.
 */
function decodeXmlEntities(s: string): string {
  return s
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h: string) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d: string) => String.fromCodePoint(Number(d)))
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}
