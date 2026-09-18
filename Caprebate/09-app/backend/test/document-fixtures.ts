/**
 * DOCUMENT FIXTURES, BUILT IN CODE. NOT ONE BINARY BLOB IN THE REPOSITORY.
 *
 * A checked-in PDF is a file nobody reads, that nobody can diff, and that
 * quietly stops matching what the test claims it contains. These builders make
 * a real zip and a real PDF at run time instead — structurally valid, not
 * merely valid enough for the code under test.
 *
 * THEY LIVE HERE RATHER THAN IN ONE TEST FILE because `web.test.ts` needs them
 * too. Before Phase 113c its end-to-end upload test fed the handler the string
 * "%PDF-1.4\nLandlord: Acme Holdings Ltd…" — bytes that pass the magic-number
 * sniffer and are not a PDF. That read as plain text under the old extractor,
 * so the test looked like it was stripping a document. Under a real extractor
 * it would read as an unreadable PDF and the strip would run over the marker,
 * which is exactly the weakness this phase set out to remove. It now uploads a
 * real one.
 */

import { deflateSync, deflateRawSync, crc32 } from 'node:zlib';

/* ================================================================== *
 * THE FIXTURE BUILDERS
 * ================================================================== */

/**
 * A real zip: local file headers, then a central directory, then an EOCD.
 *
 * `entryName` IS A PARAMETER ON PURPOSE. The COORDINATES block in the action
 * plan records that a .docx in this corpus stores `word\document.xml` with a
 * BACKSLASH, that a lookup for the forward-slash name returns nothing, and
 * that it reads exactly like a corrupt file. Both spellings are built and both
 * are asserted below, which is the only way that trap stays paid for.
 */
export function zipOf(entries: readonly { name: string; body: string; store?: boolean }[]): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;

  for (const e of entries) {
    const nameBytes = Buffer.from(e.name, 'latin1');
    const raw = Buffer.from(e.body, 'utf8');
    const stored = e.store === true;
    const data = stored ? raw : deflateRawSync(raw);
    const sum = crc32(raw);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);                 // version needed
    local.writeUInt16LE(stored ? 0 : 8, 8);     // method
    local.writeUInt32LE(sum, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(nameBytes.length, 26);
    locals.push(local, nameBytes, data);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(stored ? 0 : 8, 10);
    central.writeUInt32LE(sum, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(raw.length, 24);
    central.writeUInt16LE(nameBytes.length, 28);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, nameBytes);

    offset += local.length + nameBytes.length + data.length;
  }

  const centralBuf = Buffer.concat(centrals);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(centralBuf.length, 12);
  eocd.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, centralBuf, eocd]);
}

export function docxOf(paragraphs: readonly string[], opts: { entryName?: string; store?: boolean } = {}): Buffer {
  const body = paragraphs
    .map((p) => `<w:p><w:r><w:t xml:space="preserve">${p
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</w:t></w:r></w:p>`)
    .join('');
  const xml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'
    + `<w:body>${body}</w:body></w:document>`;
  return zipOf([
    { name: '[Content_Types].xml', body: '<Types/>' },
    { name: opts.entryName ?? 'word/document.xml', body: xml, ...(opts.store === true ? { store: true } : {}) },
  ]);
}

/** `(Hello \(world\))` — the escaping a PDF literal string requires. */
function pdfLiteral(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

export type PdfOptions = {
  /** FlateDecode the content streams rather than leaving them uncompressed. */
  compress?: boolean;
  /** Write /Filter /LZWDecode without actually LZW-encoding: an undecodable stream. */
  unsupportedFilter?: boolean;
  /** Put /Encrypt in the trailer, as an enciphered file does. */
  encrypted?: boolean;
  /** Emit no text operators at all — what a page of scanned images looks like. */
  scanned?: boolean;
  /** Use TJ arrays with kerning numbers instead of plain Tj. */
  kerned?: boolean;
};

/**
 * A minimal but genuinely structured PDF: catalogue, page tree, one content
 * stream per page. Object offsets in the xref table are written correctly even
 * though this reader deliberately does not use them — a fixture that is only
 * valid enough for the code under test proves less than one that is valid.
 */
export function pdfOf(pages: readonly (readonly string[])[], opts: PdfOptions = {}): Buffer {
  const objects: string[] = [];
  const pageObjNums: number[] = [];
  const contentObjNums: number[] = [];

  // 1 catalogue, 2 page tree, then a (page, content) pair per page.
  let next = 3;
  for (let i = 0; i < pages.length; i++) { pageObjNums.push(next++); contentObjNums.push(next++); }

  objects[1] = '<< /Type /Catalog /Pages 2 0 R >>';
  objects[2] = `<< /Type /Pages /Count ${pages.length} /Kids [${pageObjNums.map((n) => `${n} 0 R`).join(' ')}] >>`;

  const chunks: Buffer[] = [];
  const emit = (s: string): void => { chunks.push(Buffer.from(s, 'latin1')); };

  for (let i = 0; i < pages.length; i++) {
    objects[pageObjNums[i]!] =
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents ${contentObjNums[i]!} 0 R >>`;
  }

  emit('%PDF-1.4\n%\xe2\xe3\xcf\xd3\n');
  const offsets: number[] = [];
  const lengthSoFar = (): number => chunks.reduce((n, b) => n + b.length, 0);

  const writeObj = (num: number, dict: string, stream?: Buffer): void => {
    offsets[num] = lengthSoFar();
    emit(`${num} 0 obj\n${dict}\n`);
    if (stream !== undefined) {
      emit('stream\n');
      chunks.push(stream);
      emit('\nendstream\n');
    }
    emit('endobj\n');
  };

  writeObj(1, objects[1]!);
  writeObj(2, objects[2]!);

  for (let i = 0; i < pages.length; i++) {
    writeObj(pageObjNums[i]!, objects[pageObjNums[i]!]!);

    let content = 'BT /F1 12 Tf 72 760 Td\n';
    if (opts.scanned !== true) {
      for (const line of pages[i]!) {
        content += opts.kerned === true
          // A kerning number below -100 is how a producer writes a word space.
          ? `[(${pdfLiteral(line.split(' ')[0] ?? '')}) -250 (${pdfLiteral(line.split(' ').slice(1).join(' '))}) ] TJ 0 -14 Td\n`
          : `(${pdfLiteral(line)}) Tj 0 -14 Td\n`;
      }
    } else {
      content += '/Im0 Do\n';
    }
    content += 'ET\n';

    const rawStream = Buffer.from(content, 'latin1');
    const streamBytes = opts.compress === true ? deflateSync(rawStream) : rawStream;
    const filter = opts.unsupportedFilter === true
      ? ' /Filter /LZWDecode'
      : opts.compress === true ? ' /Filter /FlateDecode' : '';
    writeObj(contentObjNums[i]!, `<< /Length ${streamBytes.length}${filter} >>`, streamBytes);
  }

  const xrefAt = lengthSoFar();
  const count = next;
  let xref = `xref\n0 ${count}\n0000000000 65535 f \n`;
  for (let n = 1; n < count; n++) {
    xref += `${String(offsets[n] ?? 0).padStart(10, '0')} 00000 n \n`;
  }
  const encrypt = opts.encrypted === true ? ' /Encrypt 99 0 R' : '';
  xref += `trailer\n<< /Size ${count} /Root 1 0 R${encrypt} >>\nstartxref\n${xrefAt}\n%%EOF\n`;
  emit(xref);

  return Buffer.concat(chunks);
}

