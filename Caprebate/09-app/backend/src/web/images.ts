/**
 * RE-ENCODING, WHICH IS THE ONLY PART OF AN AVATAR UPLOAD THAT ACTUALLY HELPS.
 *
 * The phase brief: "re-encoding rather than trusting the file. An avatar upload
 * is the classic way a web application gets a shell."
 *
 * WHY A SNIFF IS NOT ENOUGH, AND THIS IS THE WHOLE ARGUMENT FOR THIS FILE.
 * A magic-number check reads the first four bytes. Every attack that has ever
 * mattered here lives AFTER them: a PHP payload in a tEXt chunk, a script in an
 * XMP block, a polyglot whose PNG header is followed by something a second
 * parser will run, or bytes appended after IEND that no image decoder reads and
 * every naive `include` does. A file that passes a sniff and is then stored
 * verbatim is a file whose tail nobody has looked at.
 *
 * SO NOTHING THE CLIENT SENT IS STORED. The bytes are decoded to PIXELS and a
 * NEW file is written from those pixels. What survives is the picture; every
 * chunk that is not IHDR, PLTE, tRNS or IDAT is dropped because it is never
 * read, and anything after IEND is dropped because decoding stops there. That
 * is a structural guarantee rather than a list of things to strip — the safe
 * direction, the same one src/payload.ts takes with the surveyor's object.
 *
 * WHY PNG ONLY, AND WHY THAT IS A DECISION RATHER THAN A SHORTFALL.
 * A real re-encode needs a real decoder. PNG's is zlib plus five scanline
 * filters and `node:zlib` is built in, so PNG can be decoded honestly with no
 * dependency. JPEG needs a full DCT decoder, and this package has exactly ONE
 * runtime dependency on purpose. The alternative — accept a JPEG and store it
 * unchanged — is the thing this file exists to refuse. SO A JPEG IS REFUSED,
 * WITH A MESSAGE SAYING WHY. A narrower allow-list that is honestly enforced
 * beats a wider one that is not, and widening it later is a decoder, not a
 * redesign: `decode()` is the only seam.
 *
 * DECOMPRESSION BOMBS. A 4 KB PNG can declare 30000x30000 and inflate to 3.6 GB.
 * The dimensions are read from IHDR and refused BEFORE anything is inflated,
 * and the inflate itself is capped at the exact byte count those dimensions
 * imply. Both, because either alone leaves the other open.
 */

import { inflateSync, deflateSync } from 'node:zlib';

export class ImageError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = 'ImageError';
    this.code = code;
  }
}

/**
 * The limits. Named here so a screen can quote them and a test can assert the
 * screen quotes the same numbers the code enforces.
 */
export const IMAGE_LIMITS = Object.freeze({
  /** The upload itself. An avatar is a face, not a photograph of a building. */
  max_bytes: 2 * 1024 * 1024,
  /** Refused from IHDR, before a byte is inflated. */
  max_source_dimension: 4096,
  /** What we store. Anything larger is box-averaged down to fit inside it. */
  max_stored_dimension: 256,
  /** The formats this build can honestly re-encode. */
  accepted: ['png'] as const,
});

const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/**
 * What this actually is, from the bytes.
 *
 * It returns a label for formats it RECOGNISES, including ones it cannot
 * re-encode, so the caller can refuse a JPEG with "we only accept PNG" rather
 * than the useless "that is not an image".
 */
export function sniffImage(bytes: Uint8Array): 'png' | 'jpeg' | 'gif' | 'webp' | null {
  const at = (i: number): number => bytes[i] ?? -1;
  if (bytes.length >= 8 && PNG_MAGIC.every((b, i) => at(i) === b)) return 'png';
  if (bytes.length >= 3 && at(0) === 0xff && at(1) === 0xd8 && at(2) === 0xff) return 'jpeg';
  if (bytes.length >= 6 && at(0) === 0x47 && at(1) === 0x49 && at(2) === 0x46) return 'gif';
  if (
    bytes.length >= 12 && at(0) === 0x52 && at(1) === 0x49 && at(2) === 0x46 && at(3) === 0x46 &&
    at(8) === 0x57 && at(9) === 0x45 && at(10) === 0x42 && at(11) === 0x50
  ) return 'webp';
  return null;
}

export type Raster = {
  readonly width: number;
  readonly height: number;
  /** RGBA, 8 bits a channel, row-major. */
  readonly rgba: Uint8Array;
};

/* ------------------------------------------------------------------ *
 * CRC32 — PNG's own, and it is checked on read as well as written on
 * emit. A chunk whose CRC does not match is a corrupt file, and a
 * corrupt file is refused rather than repaired.
 * ------------------------------------------------------------------ */

const CRC_TABLE = ((): Uint32Array => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = (CRC_TABLE[(c ^ (buf[i] ?? 0)) & 0xff] ?? 0) ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

/* ------------------------------------------------------------------ *
 * DECODE
 * ------------------------------------------------------------------ */

type Chunk = { type: string; data: Uint8Array };

function readChunks(bytes: Uint8Array): Chunk[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const out: Chunk[] = [];
  let p = 8; // past the signature
  while (p + 8 <= bytes.length) {
    const len = view.getUint32(p);
    if (len > 0x7fffffff) throw new ImageError('E_IMAGE_MALFORMED', 'that image is not readable');
    const typeStart = p + 4;
    const dataStart = typeStart + 4;
    const crcStart = dataStart + len;
    if (crcStart + 4 > bytes.length) {
      throw new ImageError('E_IMAGE_MALFORMED', 'that image ends part way through');
    }
    const type = String.fromCharCode(
      bytes[typeStart] ?? 0, bytes[typeStart + 1] ?? 0,
      bytes[typeStart + 2] ?? 0, bytes[typeStart + 3] ?? 0,
    );
    const covered = bytes.subarray(typeStart, crcStart);
    if (crc32(covered) !== view.getUint32(crcStart)) {
      throw new ImageError('E_IMAGE_MALFORMED', 'that image is damaged — a checksum does not match');
    }
    out.push({ type, data: bytes.subarray(dataStart, crcStart) });
    p = crcStart + 4;
    // ANYTHING AFTER IEND IS NOT READ, and because we re-emit rather than copy,
    // it is not stored either. That is the appended-payload case, closed by
    // construction.
    if (type === 'IEND') break;
  }
  return out;
}

const CHANNELS: Readonly<Record<number, number>> = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };

/**
 * PNG -> RGBA8.
 *
 * Supports the non-interlaced 8-bit forms plus 8-bit palette: greyscale,
 * greyscale+alpha, truecolour, truecolour+alpha, and indexed with an optional
 * tRNS. Anything else — 1/2/4/16-bit, Adam7 interlace — is REFUSED rather than
 * approximated, because an avatar that silently comes out wrong is worse than
 * one the client was asked to re-save.
 */
export function decodePng(bytes: Uint8Array): Raster {
  if (sniffImage(bytes) !== 'png') {
    throw new ImageError('E_IMAGE_NOT_PNG', 'that file is not a PNG');
  }
  const chunks = readChunks(bytes);
  const ihdr = chunks.find((c) => c.type === 'IHDR');
  if (ihdr === undefined || ihdr.data.length < 13) {
    throw new ImageError('E_IMAGE_MALFORMED', 'that PNG has no header');
  }
  const hv = new DataView(ihdr.data.buffer, ihdr.data.byteOffset, ihdr.data.byteLength);
  const width = hv.getUint32(0);
  const height = hv.getUint32(4);
  const bitDepth = ihdr.data[8] ?? 0;
  const colourType = ihdr.data[9] ?? 0;
  const interlace = ihdr.data[12] ?? 0;

  if (width === 0 || height === 0) {
    throw new ImageError('E_IMAGE_MALFORMED', 'that image has no size');
  }
  // BEFORE ANY INFLATE. This is the decompression-bomb refusal, and it is made
  // from the declared dimensions rather than the file size, because the file
  // size is the thing a bomb makes small.
  if (width > IMAGE_LIMITS.max_source_dimension || height > IMAGE_LIMITS.max_source_dimension) {
    throw new ImageError(
      'E_IMAGE_TOO_LARGE',
      `that image is ${width}x${height}; we accept up to ` +
        `${IMAGE_LIMITS.max_source_dimension}x${IMAGE_LIMITS.max_source_dimension}`,
    );
  }
  if (bitDepth !== 8) {
    throw new ImageError('E_IMAGE_UNSUPPORTED', 'we can only re-encode 8-bit PNGs — please re-save and try again');
  }
  if (interlace !== 0) {
    throw new ImageError('E_IMAGE_UNSUPPORTED', 'we cannot re-encode an interlaced PNG — please re-save without interlacing');
  }
  const channels = CHANNELS[colourType];
  if (channels === undefined) {
    throw new ImageError('E_IMAGE_UNSUPPORTED', 'that PNG uses a colour type we cannot re-encode');
  }

  const bpp = channels;
  const stride = width * bpp;
  const expected = height * (stride + 1);

  const idat = Buffer.concat(chunks.filter((c) => c.type === 'IDAT').map((c) => Buffer.from(c.data)));
  if (idat.length === 0) throw new ImageError('E_IMAGE_MALFORMED', 'that PNG carries no image data');

  let raw: Buffer;
  try {
    // The second half of the bomb defence: the inflate itself cannot produce
    // more than the header said it would.
    raw = inflateSync(idat, { maxOutputLength: expected });
  } catch {
    throw new ImageError('E_IMAGE_MALFORMED', 'that image data could not be read');
  }
  if (raw.length < expected) {
    throw new ImageError('E_IMAGE_MALFORMED', 'that PNG is shorter than its header claims');
  }

  const palette = chunks.find((c) => c.type === 'PLTE')?.data;
  const trns = chunks.find((c) => c.type === 'tRNS')?.data;
  if (colourType === 3 && palette === undefined) {
    throw new ImageError('E_IMAGE_MALFORMED', 'that indexed PNG has no palette');
  }

  const lines = unfilter(raw, width, height, bpp);
  const rgba = toRgba(lines, width, height, colourType, bpp, palette, trns);
  return { width, height, rgba };
}

/** The five PNG scanline filters, undone in place. */
function unfilter(raw: Buffer, width: number, height: number, bpp: number): Uint8Array {
  const stride = width * bpp;
  const out = new Uint8Array(height * stride);
  let prev = new Uint8Array(stride);
  for (let y = 0; y < height; y++) {
    const inOff = y * (stride + 1);
    const filter = raw[inOff] ?? 0;
    const line = new Uint8Array(stride);
    for (let x = 0; x < stride; x++) {
      const rawByte = raw[inOff + 1 + x] ?? 0;
      const a = x >= bpp ? (line[x - bpp] ?? 0) : 0;
      const b = prev[x] ?? 0;
      const c = x >= bpp ? (prev[x - bpp] ?? 0) : 0;
      let v: number;
      switch (filter) {
        case 0: v = rawByte; break;
        case 1: v = rawByte + a; break;
        case 2: v = rawByte + b; break;
        case 3: v = rawByte + ((a + b) >> 1); break;
        case 4: v = rawByte + paeth(a, b, c); break;
        default:
          throw new ImageError('E_IMAGE_MALFORMED', 'that PNG uses a filter type that does not exist');
      }
      line[x] = v & 0xff;
    }
    out.set(line, y * stride);
    prev = line;
  }
  return out;
}

function paeth(a: number, b: number, c: number): number {
  const p = a + b - c;
  const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
}

function toRgba(
  lines: Uint8Array, width: number, height: number, colourType: number, bpp: number,
  palette: Uint8Array | undefined, trns: Uint8Array | undefined,
): Uint8Array {
  const rgba = new Uint8Array(width * height * 4);
  const stride = width * bpp;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const s = y * stride + x * bpp;
      const d = (y * width + x) * 4;
      let r = 0, g = 0, b = 0, a = 255;
      if (colourType === 0) { r = g = b = lines[s] ?? 0; }
      else if (colourType === 4) { r = g = b = lines[s] ?? 0; a = lines[s + 1] ?? 255; }
      else if (colourType === 2) { r = lines[s] ?? 0; g = lines[s + 1] ?? 0; b = lines[s + 2] ?? 0; }
      else if (colourType === 6) {
        r = lines[s] ?? 0; g = lines[s + 1] ?? 0; b = lines[s + 2] ?? 0; a = lines[s + 3] ?? 255;
      } else {
        const idx = lines[s] ?? 0;
        const p = palette ?? new Uint8Array(0);
        if (idx * 3 + 2 >= p.length) {
          throw new ImageError('E_IMAGE_MALFORMED', 'that PNG indexes past the end of its palette');
        }
        r = p[idx * 3] ?? 0; g = p[idx * 3 + 1] ?? 0; b = p[idx * 3 + 2] ?? 0;
        a = trns !== undefined && idx < trns.length ? (trns[idx] ?? 255) : 255;
      }
      rgba[d] = r; rgba[d + 1] = g; rgba[d + 2] = b; rgba[d + 3] = a;
    }
  }
  return rgba;
}

/* ------------------------------------------------------------------ *
 * RESIZE — box average, integer arithmetic, no library.
 * ------------------------------------------------------------------ */

/**
 * Fit inside `max` on the long edge, preserving the aspect ratio. An image
 * already inside it is returned untouched — a needless resample is a needless
 * loss of detail.
 */
export function fitWithin(src: Raster, max: number): Raster {
  const longest = Math.max(src.width, src.height);
  if (longest <= max) return src;
  const scale = max / longest;
  const width = Math.max(1, Math.round(src.width * scale));
  const height = Math.max(1, Math.round(src.height * scale));
  const rgba = new Uint8Array(width * height * 4);

  for (let y = 0; y < height; y++) {
    const y0 = Math.floor((y * src.height) / height);
    const y1 = Math.max(y0 + 1, Math.floor(((y + 1) * src.height) / height));
    for (let x = 0; x < width; x++) {
      const x0 = Math.floor((x * src.width) / width);
      const x1 = Math.max(x0 + 1, Math.floor(((x + 1) * src.width) / width));
      let r = 0, g = 0, b = 0, a = 0, n = 0;
      for (let sy = y0; sy < y1 && sy < src.height; sy++) {
        for (let sx = x0; sx < x1 && sx < src.width; sx++) {
          const s = (sy * src.width + sx) * 4;
          r += src.rgba[s] ?? 0; g += src.rgba[s + 1] ?? 0;
          b += src.rgba[s + 2] ?? 0; a += src.rgba[s + 3] ?? 0;
          n++;
        }
      }
      const d = (y * width + x) * 4;
      if (n === 0) n = 1;
      rgba[d] = Math.round(r / n); rgba[d + 1] = Math.round(g / n);
      rgba[d + 2] = Math.round(b / n); rgba[d + 3] = Math.round(a / n);
    }
  }
  return { width, height, rgba };
}

/* ------------------------------------------------------------------ *
 * ENCODE — three chunks and nothing else.
 * ------------------------------------------------------------------ */

function chunk(type: string, data: Uint8Array): Buffer {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(data.length, 0);
  head.write(type, 4, 'latin1');
  const body = Buffer.concat([head.subarray(4), Buffer.from(data)]);
  const tail = Buffer.alloc(4);
  tail.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([head.subarray(0, 4), body, tail]);
}

/**
 * RGBA8 -> PNG. IHDR, IDAT, IEND. THAT IS THE WHOLE FILE.
 *
 * No tEXt, no iTXt, no eXIf, no iCCP, no pHYs, no timestamp — not because they
 * are stripped, but because nothing writes them. Encoding from pixels is what
 * makes "what did the client hide in there" an unanswerable question rather
 * than a search.
 */
export function encodePng(img: Raster): Uint8Array {
  const stride = img.width * 4;
  const raw = Buffer.alloc(img.height * (stride + 1));
  for (let y = 0; y < img.height; y++) {
    raw[y * (stride + 1)] = 0; // filter 0. Simple, and an avatar is small.
    raw.set(img.rgba.subarray(y * stride, (y + 1) * stride), y * (stride + 1) + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(img.width, 0);
  ihdr.writeUInt32BE(img.height, 4);
  ihdr[8] = 8;   // bit depth
  ihdr[9] = 6;   // colour type: truecolour with alpha
  ihdr[10] = 0;  // compression
  ihdr[11] = 0;  // filter
  ihdr[12] = 0;  // interlace: none
  return new Uint8Array(Buffer.concat([
    Buffer.from(PNG_MAGIC),
    chunk('IHDR', ihdr),
    chunk('IDAT', new Uint8Array(deflateSync(raw, { level: 9 }))),
    chunk('IEND', new Uint8Array(0)),
  ]));
}

/**
 * THE WHOLE PIPELINE, as one call: sniff, refuse, decode, fit, re-encode.
 *
 * The caller gets bytes it can store and a record of what arrived. It never
 * gets the option of storing the original, because this function does not
 * return it.
 */
export function reEncodeAvatar(bytes: Uint8Array): {
  png: Uint8Array; width: number; height: number; source_format: string; source_bytes: number;
} {
  if (bytes.length === 0) throw new ImageError('E_IMAGE_EMPTY', 'that file is empty');
  if (bytes.length > IMAGE_LIMITS.max_bytes) {
    throw new ImageError(
      'E_IMAGE_TOO_BIG',
      `that file is larger than the ${Math.round(IMAGE_LIMITS.max_bytes / 1024 / 1024)} MB we accept`,
    );
  }
  const sniffed = sniffImage(bytes);
  if (sniffed === null) {
    throw new ImageError('E_IMAGE_NOT_IMAGE', 'that file is not an image we recognise');
  }
  if (sniffed !== 'png') {
    throw new ImageError(
      'E_IMAGE_NOT_PNG',
      `we accept PNG only. That is a ${sniffed.toUpperCase()}, and this build re-encodes every ` +
        'photo rather than storing what was sent — which it can only do honestly for a format it ' +
        'can decode. Save it as a PNG and try again.',
    );
  }
  const decoded = decodePng(bytes);
  const fitted = fitWithin(decoded, IMAGE_LIMITS.max_stored_dimension);
  return {
    png: encodePng(fitted),
    width: fitted.width,
    height: fitted.height,
    source_format: sniffed,
    source_bytes: bytes.length,
  };
}
