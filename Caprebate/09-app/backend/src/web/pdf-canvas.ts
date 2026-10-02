/**
 * A PDF THAT IS DRAWN, NOT ONLY WRITTEN — boxes, lines, bars and text placed exactly, for the client's survey report.
 * 2 October 2026 (Lakhbir: the client "would want something visually appealing"; the design approved as a mock-up).
 *
 * Like src/web/pdf.ts, which writes the signed engagement letter: no dependency, PDF 1.4, A4, the standard fonts every
 * reader has (nothing embedded), WinAnsi text written as hexadecimal strings so no character can end a string early or be
 * read as an operator, and the same bytes for the same input — so the PDF of an approved version is the same file
 * every time it is made, and needs no keeping. What it adds: a filled or outlined box (square or rounded), a line
 * (solid or dashed), a filled circle, text in Helvetica, Helvetica-Bold or Times-Bold in any colour, set left, right or
 * centred, and the exact width of a piece of text (src/web/pdf-metrics.ts), so prose wraps and figures line up.
 *
 * Positions are in points from the TOP-LEFT of the page (text at its baseline), as a page is read; the writer turns them
 * the other way up, as PDF wants.
 */
import { winAnsi } from './pdf.ts';
import { WIDTHS, type PdfFont } from './pdf-metrics.ts';

export type { PdfFont };
export type Rgb = readonly [number, number, number];

export type Op =
  | { readonly k: 'rect'; readonly x: number; readonly y: number; readonly w: number; readonly h: number;
      readonly fill?: Rgb; readonly stroke?: Rgb; readonly lw?: number; readonly r?: number; readonly dash?: number }
  | { readonly k: 'line'; readonly x1: number; readonly y1: number; readonly x2: number; readonly y2: number; readonly color: Rgb; readonly lw: number; readonly dash?: number }
  | { readonly k: 'circle'; readonly cx: number; readonly cy: number; readonly r: number; readonly fill: Rgb }
  | { readonly k: 'text'; readonly x: number; readonly y: number; readonly s: string; readonly font: PdfFont; readonly size: number; readonly color: Rgb;
      readonly align?: 'left' | 'right' | 'center'; readonly spacing?: number };

export const PAGE = Object.freeze({ w: 595, h: 842 });

const FONT_KEY: Readonly<Record<PdfFont, string>> = Object.freeze({ Helvetica: 'F1', 'Helvetica-Bold': 'F2', 'Times-Bold': 'F3' });

/** The width of a piece of text, in points. A character WinAnsi cannot show is measured as the "?" it becomes. */
export function textWidth(s: string, font: PdfFont, size: number): number {
  const table = WIDTHS[font];
  let units = 0;
  for (const b of winAnsi(s).bytes) units += b >= 32 ? (table[b - 32] ?? 0) : 0;
  return (units * size) / 1000;
}

/**
 * Prose broken into lines no wider than `maxW`, at its spaces; a newline starts a new line. A word wider than the line
 * on its own is cut, so nothing is ever drawn past the edge.
 */
export function wrapText(s: string, font: PdfFont, size: number, maxW: number): string[] {
  const out: string[] = [];
  for (const para of s.split('\n')) {
    let line = '';
    for (const word of para.split(/\s+/).filter((w) => w !== '')) {
      const next = line === '' ? word : `${line} ${word}`;
      if (textWidth(next, font, size) <= maxW) { line = next; continue; }
      if (line !== '') out.push(line);
      let rest = word;
      while (textWidth(rest, font, size) > maxW && rest.length > 1) {
        let cut = rest.length - 1;
        while (cut > 1 && textWidth(rest.slice(0, cut), font, size) > maxW) cut--;
        out.push(rest.slice(0, cut));
        rest = rest.slice(cut);
      }
      line = rest;
    }
    out.push(line);
  }
  return out;
}

const n = (v: number): string => (Math.round(v * 100) / 100).toString();
const colour = (c: Rgb): string => c.map((x) => n(Math.min(255, Math.max(0, x)) / 255)).join(' ');

/** A rounded box as a path: four straight sides and four quarter-circles (drawn as Bézier curves). */
function roundedPath(x: number, y: number, w: number, h: number, r: number): string {
  const k = 0.5523 * r;
  const right = x + w;
  const top = y + h;
  return [
    `${n(x + r)} ${n(y)} m`, `${n(right - r)} ${n(y)} l`, `${n(right - r + k)} ${n(y)} ${n(right)} ${n(y + r - k)} ${n(right)} ${n(y + r)} c`,
    `${n(right)} ${n(top - r)} l`, `${n(right)} ${n(top - r + k)} ${n(right - r + k)} ${n(top)} ${n(right - r)} ${n(top)} c`,
    `${n(x + r)} ${n(top)} l`, `${n(x + r - k)} ${n(top)} ${n(x)} ${n(top - r + k)} ${n(x)} ${n(top - r)} c`,
    `${n(x)} ${n(y + r)} l`, `${n(x)} ${n(y + r - k)} ${n(x + r - k)} ${n(y)} ${n(x + r)} ${n(y)} c`, 'h',
  ].join(' ');
}

export function buildCanvasPdf(pages: readonly (readonly Op[])[], info: { readonly title: string }): { bytes: Uint8Array; unshown: number } {
  let unshown = 0;
  const hex = (s: string): string => {
    const w = winAnsi(s);
    unshown += w.unshown;
    return `<${w.bytes.map((b) => b.toString(16).padStart(2, '0')).join('')}>`;
  };
  const objects: string[] = [];
  const add = (body: string): number => { objects.push(body); return objects.length; };
  const catalogId = add('');
  const pagesId = add('');
  const fonts = (['Helvetica', 'Helvetica-Bold', 'Times-Bold'] as const).map((f) => add(`<< /Type /Font /Subtype /Type1 /BaseFont /${f} /Encoding /WinAnsiEncoding >>`));
  const pageIds: number[] = [];
  for (const ops of pages) {
    const out: string[] = [];
    for (const o of ops) {
      if (o.k === 'rect') {
        const y = PAGE.h - o.y - o.h;
        const path = o.r !== undefined && o.r > 0 ? roundedPath(o.x, y, o.w, o.h, Math.min(o.r, o.w / 2, o.h / 2)) : `${n(o.x)} ${n(y)} ${n(o.w)} ${n(o.h)} re`;
        const paint = o.fill !== undefined && o.stroke !== undefined ? 'B' : o.fill !== undefined ? 'f' : 'S';
        out.push(`q ${o.fill === undefined ? '' : `${colour(o.fill)} rg `}${o.stroke === undefined ? '' : `${colour(o.stroke)} RG ${n(o.lw ?? 1)} w `}${o.dash === undefined ? '' : `[${n(o.dash)}] 0 d `}${path} ${paint} Q`);
      } else if (o.k === 'line') {
        out.push(`q ${colour(o.color)} RG ${n(o.lw)} w ${o.dash === undefined ? '' : `[${n(o.dash)}] 0 d `}${n(o.x1)} ${n(PAGE.h - o.y1)} m ${n(o.x2)} ${n(PAGE.h - o.y2)} l S Q`);
      } else if (o.k === 'circle') {
        out.push(`q ${colour(o.fill)} rg ${roundedPath(o.cx - o.r, PAGE.h - o.cy - o.r, 2 * o.r, 2 * o.r, o.r)} f Q`);
      } else {
        // Character spacing is part of the page's text state and outlives the text object, so it is set every time.
        const sp = o.spacing ?? 0;
        const w = textWidth(o.s, o.font, o.size) + sp * Math.max(0, [...o.s].length - 1);
        const x = o.align === 'right' ? o.x - w : o.align === 'center' ? o.x - w / 2 : o.x;
        out.push(`BT /${FONT_KEY[o.font]} ${n(o.size)} Tf ${n(sp)} Tc ${colour(o.color)} rg 1 0 0 1 ${n(x)} ${n(PAGE.h - o.y)} Tm ${hex(o.s)} Tj ET`);
      }
    }
    const stream = out.join('\n');
    const contentId = add(`<< /Length ${Buffer.byteLength(stream, 'latin1')} >>\nstream\n${stream}\nendstream`);
    pageIds.push(add(`<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${PAGE.w} ${PAGE.h}] ` +
      `/Resources << /Font << /F1 ${fonts[0]} 0 R /F2 ${fonts[1]} 0 R /F3 ${fonts[2]} 0 R >> >> /Contents ${contentId} 0 R >>`));
  }
  objects[pagesId - 1] = `<< /Type /Pages /Kids [${pageIds.map((i) => `${i} 0 R`).join(' ')}] /Count ${pageIds.length} >>`;
  objects[catalogId - 1] = `<< /Type /Catalog /Pages ${pagesId} 0 R >>`;
  const infoId = add(`<< /Title ${hex(info.title)} /Producer ${hex('Caprebate back office')} >>`);

  let file = '%PDF-1.4\n%\xe2\xe3\xcf\xd3\n';
  const offsets: number[] = [];
  objects.forEach((body, i) => {
    offsets.push(Buffer.byteLength(file, 'latin1'));
    file += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = Buffer.byteLength(file, 'latin1');
  file += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const o of offsets) file += `${String(o).padStart(10, '0')} 00000 n \n`;
  file += `trailer\n<< /Size ${objects.length + 1} /Root ${catalogId} 0 R /Info ${infoId} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return { bytes: new Uint8Array(Buffer.from(file, 'latin1')), unshown };
}
