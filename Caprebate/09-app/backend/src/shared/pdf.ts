/**
 * A SMALL PDF WRITER — plain text pages, for the signed engagement letter. Phase 146f, 22 September 2026.
 *
 * No dependency. PDF 1.4, A4, the standard Helvetica and Helvetica-Bold fonts (every PDF reader has them, so nothing
 * is embedded), WinAnsi encoding. Text is written as hexadecimal strings, so no character in the letter can end a
 * string early or be read as an operator. A character WinAnsi cannot show becomes "?", and the caller is told how
 * many there were. The output is the same bytes for the same input, so its SHA-256 means something.
 */

export type PdfLine = { readonly text: string; readonly bold?: boolean; readonly size?: number; readonly gap?: number; readonly ink?: Ink };

/**
 * PHASE 157c, 6 October 2026 — A DRAWN SIGNATURE. Strokes as points from 0 to 1000 across and down a box, drawn as
 * plain vector lines (no image), so the same strokes always give the same bytes. `width` and `height` are the box's
 * size in points. A line with ink has no text; it takes the box's height on the page.
 */
export type Ink = { readonly strokes: readonly (readonly (readonly [number, number])[])[]; readonly width: number; readonly height: number };
export type PdfPage = readonly PdfLine[];

/** Unicode to WinAnsi (cp1252) for the characters a letter uses. Everything else outside Latin-1 becomes "?". */
const WIN_ANSI: Readonly<Record<string, number>> = Object.freeze({
  '€': 0x80, '‚': 0x82, '„': 0x84, '…': 0x85, '†': 0x86, '‡': 0x87, '‰': 0x89, '‹': 0x8b,
  '‘': 0x91, '’': 0x92, '“': 0x93, '”': 0x94, '•': 0x95, '–': 0x96, '—': 0x97, '™': 0x99, '›': 0x9b,
});

export function winAnsi(s: string): { bytes: number[]; unshown: number } {
  const bytes: number[] = [];
  let unshown = 0;
  for (const ch of s) {
    const code = ch.codePointAt(0) ?? 63;
    const mapped = WIN_ANSI[ch];
    if (mapped !== undefined) bytes.push(mapped);
    else if ((code >= 0x20 && code <= 0x7e) || (code >= 0xa0 && code <= 0xff)) bytes.push(code);
    else if (code === 0x09) bytes.push(0x20);
    else { bytes.push(0x3f); unshown++; }
  }
  return { bytes, unshown };
}

/** Helvetica's widths are close enough to 0.5em a character for wrapping plain prose at 10pt on A4. */
export function wrap(text: string, maxChars: number): string[] {
  const out: string[] = [];
  for (const para of text.split('\n')) {
    let line = '';
    for (const word of para.split(/\s+/).filter((w) => w !== '')) {
      if (line === '') { line = word; continue; }
      if (line.length + 1 + word.length > maxChars) { out.push(line); line = word; } else line += ` ${word}`;
    }
    while (line.length > maxChars) { out.push(line.slice(0, maxChars)); line = line.slice(maxChars); }
    out.push(line);
  }
  return out;
}

const PAGE_W = 595;   // A4, points
const PAGE_H = 842;
const MARGIN = 56;

/** Lay prose paragraphs onto as many pages as they need. */
export function flow(paragraphs: readonly PdfLine[], maxChars = 92): PdfPage[] {
  const pages: PdfLine[][] = [[]];
  let y = PAGE_H - MARGIN;
  for (const p of paragraphs) {
    if (p.ink !== undefined) {
      if (y - p.ink.height < MARGIN) { pages.push([]); y = PAGE_H - MARGIN; }
      const gap = p.gap ?? 6;
      pages[pages.length - 1]?.push({ text: '', ink: p.ink }, { text: '', size: 1, gap });
      y -= p.ink.height + gap;
      continue;
    }
    const size = p.size ?? 10;
    const lead = size * 1.35;
    const lines = wrap(p.text, Math.floor(maxChars * (10 / size)));
    for (let i = 0; i < lines.length; i++) {
      if (y - lead < MARGIN) { pages.push([]); y = PAGE_H - MARGIN; }
      pages[pages.length - 1]?.push({ text: lines[i] ?? '', size, ...(p.bold === true ? { bold: true } : {}) });
      y -= lead;
    }
    const gap = p.gap ?? size * 0.6;
    y -= gap;
    pages[pages.length - 1]?.push({ text: '', size: 1, gap });
  }
  return pages;
}

/** The PDF path operators for one drawn signature, its box's top-left corner at (left, top) in page points. */
function inkOps(ink: Ink, left: number, top: number): string[] {
  const out = ['q', '0.9 w', '1 J', '1 j', '0.07 0.07 0.07 RG'];
  const px = (v: number) => (left + (Math.min(1000, Math.max(0, v)) / 1000) * ink.width).toFixed(2);
  const py = (v: number) => (top - (Math.min(1000, Math.max(0, v)) / 1000) * ink.height).toFixed(2);
  for (const stroke of ink.strokes) {
    const [first, ...rest] = stroke;
    if (first === undefined) continue;
    out.push(`${px(first[0])} ${py(first[1])} m`);
    if (rest.length === 0) out.push(`${px(first[0])} ${py(first[1])} l`);
    for (const [x, yy] of rest) out.push(`${px(x)} ${py(yy)} l`);
    out.push('S');
  }
  out.push('Q');
  return out;
}

export function buildPdf(pages: readonly PdfPage[], info: { title: string }): { bytes: Uint8Array; unshown: number } {
  let unshown = 0;
  const hex = (s: string): string => {
    const w = winAnsi(s);
    unshown += w.unshown;
    return `<${w.bytes.map((b) => b.toString(16).padStart(2, '0')).join('')}>`;
  };
  const objects: string[] = [];
  const add = (body: string): number => { objects.push(body); return objects.length; };

  const catalogId = add('');              // filled below, once the pages object exists
  const pagesId = add('');
  const fontRegular = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
  const fontBold = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
  const pageIds: number[] = [];
  for (const page of pages) {
    let y = PAGE_H - MARGIN;
    const ops: string[] = ['BT'];
    const drawn: string[] = [];
    for (const line of page) {
      if (line.ink !== undefined) {
        const top = y;
        y -= line.ink.height;
        drawn.push(...inkOps(line.ink, MARGIN, top));
        continue;
      }
      const size = line.size ?? 10;
      if (line.text === '' && line.gap !== undefined) { y -= line.gap; continue; }
      y -= size * 1.35;
      ops.push(`/${line.bold === true ? 'F2' : 'F1'} ${size} Tf 1 0 0 1 ${MARGIN} ${y.toFixed(2)} Tm ${hex(line.text)} Tj`);
    }
    ops.push('ET', ...drawn);
    const stream = ops.join('\n');
    const contentId = add(`<< /Length ${Buffer.byteLength(stream, 'latin1')} >>\nstream\n${stream}\nendstream`);
    pageIds.push(add(`<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] ` +
      `/Resources << /Font << /F1 ${fontRegular} 0 R /F2 ${fontBold} 0 R >> >> /Contents ${contentId} 0 R >>`));
  }
  objects[pagesId - 1] = `<< /Type /Pages /Kids [${pageIds.map((i) => `${i} 0 R`).join(' ')}] /Count ${pageIds.length} >>`;
  objects[catalogId - 1] = `<< /Type /Catalog /Pages ${pagesId} 0 R >>`;
  const infoId = add(`<< /Title ${hex(info.title)} /Producer ${hex('Caprebate back office')} >>`);

  let out = '%PDF-1.4\n%\xe2\xe3\xcf\xd3\n';
  const offsets: number[] = [];
  objects.forEach((body, i) => {
    offsets.push(Buffer.byteLength(out, 'latin1'));
    out += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = Buffer.byteLength(out, 'latin1');
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const o of offsets) out += `${String(o).padStart(10, '0')} 00000 n \n`;
  out += `trailer\n<< /Size ${objects.length + 1} /Root ${catalogId} 0 R /Info ${infoId} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return { bytes: new Uint8Array(Buffer.from(out, 'latin1')), unshown };
}
