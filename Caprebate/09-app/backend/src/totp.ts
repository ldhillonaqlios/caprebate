/**
 * AUTHENTICATOR-APP CODES — RFC 6238 (TOTP) over RFC 4226 (HOTP). Phase 151j, 28 September 2026.
 *
 * The standard every authenticator app speaks (Google Authenticator, Microsoft Authenticator, 1Password and the rest):
 * a shared secret, HMAC-SHA1, a 30-second step, six digits. Written here on node:crypto rather than taken from a
 * package, because it is thirty lines and the RFC's own test vectors (in test/phase151j.test.ts) prove it.
 *
 *   newSecret        20 random bytes, base32 - what the person's app is given, by QR code or typed in
 *   otpauthUri       the address a QR code carries: otpauth://totp/<issuer>:<account>?secret=...&issuer=...
 *   codeAt           the six digits for one time step
 *   verifyCode       a code checked against the step before, the step now and the step after (a phone's clock may
 *                    be up to thirty seconds out), and NEVER a step at or before the last one accepted, so a code
 *                    seen over someone's shoulder cannot be used again. Returns the step it matched, or null.
 */
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

export const TOTP_STEP_SECONDS = 30;
export const TOTP_DIGITS = 6;
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function base32Encode(bytes: Uint8Array): string {
  let bits = 0, value = 0, out = '';
  for (const b of bytes) {
    value = (value << 8) | b; bits += 8;
    while (bits >= 5) { out += ALPHABET[(value >>> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(text: string): Uint8Array {
  const clean = text.toUpperCase().replace(/[\s=-]/g, '');
  let bits = 0, value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    const i = ALPHABET.indexOf(ch);
    if (i < 0) throw new Error('not base32');
    value = (value << 5) | i; bits += 5;
    if (bits >= 8) { out.push((value >>> (bits - 8)) & 255); bits -= 8; }
  }
  return Uint8Array.from(out);
}

export function newSecret(): string {
  return base32Encode(randomBytes(20));
}

/** HOTP (RFC 4226): the code for one counter. Exported for the RFC's own test vectors. */
export function hotp(secret: Uint8Array, counter: number, digits = TOTP_DIGITS): string {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(counter));
  const mac = createHmac('sha1', secret).update(buf).digest();
  const offset = (mac[mac.length - 1] ?? 0) & 0x0f;
  const bin = (((mac[offset] ?? 0) & 0x7f) << 24) | ((mac[offset + 1] ?? 0) << 16) | ((mac[offset + 2] ?? 0) << 8) | (mac[offset + 3] ?? 0);
  return String(bin % 10 ** digits).padStart(digits, '0');
}

export function stepAt(nowMs: number): number {
  return Math.floor(nowMs / 1000 / TOTP_STEP_SECONDS);
}

export function codeAt(secretBase32: string, step: number): string {
  return hotp(base32Decode(secretBase32), step);
}

export function verifyCode(secretBase32: string, code: string, nowMs: number, lastStep: number | null): number | null {
  const given = code.replace(/\s/g, '');
  if (!/^\d{6}$/.test(given)) return null;
  const now = stepAt(nowMs);
  for (const step of [now - 1, now, now + 1]) {
    if (lastStep !== null && step <= lastStep) continue;
    const want = codeAt(secretBase32, step);
    if (timingSafeEqual(Buffer.from(want), Buffer.from(given))) return step;
  }
  return null;
}

export function otpauthUri(issuer: string, account: string, secretBase32: string): string {
  const label = encodeURIComponent(`${issuer}:${account}`);
  return `otpauth://totp/${label}?secret=${secretBase32}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=${TOTP_DIGITS}&period=${TOTP_STEP_SECONDS}`;
}

/** The secret in groups of four, as a person types it into their app. */
export function grouped(secretBase32: string): string {
  return secretBase32.replace(/(.{4})/g, '$1 ').trim();
}
