/**
 * THE EMAILS' LOGO: THE HOUSE MARK AS A SMALL PNG. Phase 161m2, 11 November 2026.
 *
 * build.py's emails name a hosted PNG beside the wordmark (an email may not carry SVG). This draws it, in code, the
 * same way every time: build.py's MARK_SVG (the house outline, the screen bar and six keys, on a 48-unit grid) in mint
 * (#ABEDD8) on a transparent ground, 68 x 68 pixels so it is sharp at the 34 x 34 the email shows it. Each pixel is
 * sampled 4 x 4 times for smooth edges; the PNG is written with node:zlib only (one IDAT, no filter). Made once, on
 * first use, and served from memory at EMAIL_LOGO_PATH (src/app/router.ts), like the site's other logo.
 *
 * The brand book forbids rebuilding the lockup (slide 29); this is the house mark alone, as the home page and the
 * favicon already draw it, not the lockup.
 */

import { crc32, deflateSync } from 'node:zlib';

/** Where the app serves it. An email names it on the app's public https address (email-layout.ts, emailLogoUrl). */
export const EMAIL_LOGO_PATH = '/email/cap-rebate-logo.png';
export const EMAIL_LOGO_SIZE = 68;

/** Public and cacheable: a mail program (or its image proxy) fetches it with no cookie, often more than once. */
export const EMAIL_LOGO_HEADERS: Readonly<Record<string, string>> = Object.freeze({
  'content-type': 'image/png',
  'x-content-type-options': 'nosniff',
  'cache-control': 'public, max-age=604800',
});

const MINT: readonly [number, number, number] = [0xab, 0xed, 0xd8];
const STROKE_HALF = 1.5; // stroke-width 3

type Pt = readonly [number, number];

/** The house outline's straight runs (M14 43 H34 ... V39 ... Z) and its two rounded bottom corners (radius 4). */
const SEGMENTS: readonly (readonly [Pt, Pt])[] = [
  [[14, 43], [34, 43]], [[38, 39], [38, 20.5]], [[38, 20.5], [24, 8]], [[24, 8], [10, 20.5]], [[10, 20.5], [10, 39]],
];
const CORNERS: readonly { readonly c: Pt; readonly right: boolean }[] = [{ c: [34, 39], right: true }, { c: [14, 39], right: false }];

/** Filled rounded rectangles: the screen bar, then the keys (x 16, 22, 28; y 29.5, 35.5). */
const RECTS: readonly (readonly [number, number, number, number, number])[] = [
  [16, 20, 16, 5.5, 1.6],
  ...[29.5, 35.5].flatMap((y) => [16, 22, 28].map((x) => [x, y, 4, 4, 1] as const)),
];

function segmentDistance(p: Pt, a: Pt, b: Pt): number {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}

/** Distance to the outline. Round joins come free: the distance to a corner point is a circle. */
function outlineDistance(p: Pt): number {
  let d = Infinity;
  for (const [a, b] of SEGMENTS) d = Math.min(d, segmentDistance(p, a, b));
  for (const { c, right } of CORNERS) {
    const inQuarter = p[1] >= c[1] && (right ? p[0] >= c[0] : p[0] <= c[0]);
    if (inQuarter) d = Math.min(d, Math.abs(Math.hypot(p[0] - c[0], p[1] - c[1]) - 4));
  }
  return d;
}

function inRoundedRect(p: Pt, [x, y, w, h, r]: readonly [number, number, number, number, number]): boolean {
  if (p[0] < x || p[0] > x + w || p[1] < y || p[1] > y + h) return false;
  const qx = Math.max(Math.abs(p[0] - (x + w / 2)) - (w / 2 - r), 0);
  const qy = Math.max(Math.abs(p[1] - (y + h / 2)) - (h / 2 - r), 0);
  return qx * qx + qy * qy <= r * r;
}

/** The mark's pixels, RGBA, row by row (68 x 68 x 4 bytes). Pure arithmetic, so the same on every machine. */
export function emailLogoPixels(size = EMAIL_LOGO_SIZE): Uint8Array {
  const out = new Uint8Array(size * size * 4);
  const scale = 48 / size;
  const n = 4;
  for (let py = 0; py < size; py += 1) {
    for (let px = 0; px < size; px += 1) {
      let hit = 0;
      for (let sy = 0; sy < n; sy += 1) {
        for (let sx = 0; sx < n; sx += 1) {
          const p: Pt = [(px + (sx + 0.5) / n) * scale, (py + (sy + 0.5) / n) * scale];
          if (outlineDistance(p) <= STROKE_HALF || RECTS.some((r) => inRoundedRect(p, r))) hit += 1;
        }
      }
      const i = (py * size + px) * 4;
      out[i] = MINT[0]; out[i + 1] = MINT[1]; out[i + 2] = MINT[2];
      out[i + 3] = Math.round((255 * hit) / (n * n));
    }
  }
  return out;
}

function chunk(type: string, data: Uint8Array): Buffer {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(data.length, 0);
  head.write(type, 4, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])) >>> 0, 0);
  return Buffer.concat([head, data, crc]);
}

/** An RGBA image as a PNG file: signature, IHDR (8-bit RGBA), one IDAT, IEND. */
export function encodePng(width: number, height: number, rgba: Uint8Array): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const raw = Buffer.alloc(height * (width * 4 + 1));
  for (let y = 0; y < height; y += 1) {
    raw[y * (width * 4 + 1)] = 0; // filter: none
    Buffer.from(rgba.buffer, rgba.byteOffset + y * width * 4, width * 4).copy(raw, y * (width * 4 + 1) + 1);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', new Uint8Array(0)),
  ]);
}

let made: Buffer | undefined;

/** The logo's PNG bytes, made on first use and kept. */
export function emailLogoPng(): Buffer {
  made ??= encodePng(EMAIL_LOGO_SIZE, EMAIL_LOGO_SIZE, emailLogoPixels());
  return made;
}
