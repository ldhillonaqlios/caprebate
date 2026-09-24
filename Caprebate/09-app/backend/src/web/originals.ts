/**
 * KEEP_ORIGINALS — KEEPING THE FILE A CLIENT SENT. BUILT, AND SWITCHED OFF. Phase 140, 21 September 2026.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * WHY IT IS OFF
 *
 * Lakhbir wants staff to "see what the customer has uploaded". Today nobody can: the upload handler reads each file,
 * keeps what it took from it, and deletes the original. That deletion is our data-minimisation promise — the privacy
 * notice and the retention determinations are written on it. Keeping originals is what staff expect, and it changes
 * both documents. That is Lakhbir's decision with the data protection officer, not a build choice, so it is put to him
 * in CAPREBATE QUESTIONS under exactly this title:
 *   "Should we keep the files clients upload, or keep deleting them once read?"
 * PHASE 151, 24 September 2026: ANSWERED — KEEP THEM (Word answer 48, closed). The switch STAYS OFF: keeping needs a
 * keep-until period and a list of who may open them, and the privacy notice must say both first. That is the follow-up,
 * quoted below as KEEP_ORIGINALS_QUESTION: "How long do we keep the files clients upload, and who may open them?"
 *
 * OFF IS EXACTLY TODAY. With `enabled: false` the upload handler runs on FAIL_CLOSED_SETTINGS as it always has, every
 * original is deleted once read, and the three `documents.original_*` columns (migration 035) stay empty.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * ON, AND NOTHING NEW DECIDES WHAT IS KEPT
 *
 * The handler already has the rule for keeping a file: it promotes the original to durable storage, after the strip and
 * never before, where the retention rule outlives the reading of it (PROMOTION_RULE in
 * 04-phase-work/phase3/caprebate-upload-handler.ts). This switch only gives it a retention period to read — a number of
 * days after reading — so the handler's own order, its own refusal to promote before the strip and its own quarantine
 * discharge all still run. There is no second path that keeps a file.
 *
 * THREE THINGS MUST ALL BE TRUE, OR IT IS OFF — each fails closed, and not known is not a yes (N4):
 *   1. enabled is true;
 *   2. a retention period in whole days, which the data protection officer approves, is set;
 *   3. a 32-byte encryption key is present (CAPREBATE_ORIGINALS_KEY, base64). The object store will not write an
 *      original without it — see `seal` below and FsObjectStore.copy.
 *
 * A kept original is ENCRYPTED (AES-256-GCM, a fresh nonce per file), OUTSIDE THE WEB ROOT (the store has no route
 * that maps a path onto it), opened only through `document.read_original` — Admin, Sales (on the documents Sales may
 * read) and the data protection officer since 24 September 2026 (Word question 219), and the client on their own — and
 * DELETED when its days are up, by `sweepOriginals`, which runs whenever the folder or the original is opened and from
 * `node src/cli.ts sweep-originals`.
 */

import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

export type KeepOriginals = {
  readonly enabled: boolean;
  /** Whole days after the file was read. Null until the data protection officer approves a period. */
  readonly retention_days: number | null;
  readonly question: string;
};

/** The title of the question under Lakhbir in CAPREBATE QUESTIONS. Quoted, not paraphrased. */
export const KEEP_ORIGINALS_QUESTION = 'How long do we keep the files clients upload, and who may open them?';

/* 24 September 2026, Lakhbir in chat (Word question 219, recorded; still open for the data protection officer to
   approve): keep them 7 years, and Sales, Admin and the data protection officer may open them. 7 years from the day
   the file was read is 2,557 days (two leap days in any seven years from 2026). THE SWITCH STAYS OFF until the officer
   approves and the privacy notice says both; `keptDays` reads no period while it is off. */
export const KEEP_ORIGINALS: KeepOriginals = Object.freeze({
  enabled: false,
  retention_days: 2557,
  question: KEEP_ORIGINALS_QUESTION,
});

/** The days a kept original lives, or null where the switch is off in any of its three ways. */
export function keptDays(cfg: KeepOriginals, sealKey: Buffer | null): number | null {
  if (cfg.enabled !== true) return null;
  const n = cfg.retention_days;
  if (n === null || !Number.isInteger(n) || n < 1) return null;
  if (sealKey === null || sealKey.length !== 32) return null;
  return n;
}

/** CAPREBATE_ORIGINALS_KEY, read once. Anything but exactly 32 bytes of base64 is no key at all. */
export function sealKeyFromEnv(v: string | undefined = process.env.CAPREBATE_ORIGINALS_KEY): Buffer | null {
  if (v === undefined || v.trim() === '') return null;
  const k = Buffer.from(v.trim(), 'base64');
  return k.length === 32 ? k : null;
}

const MAGIC = Buffer.from('CBORIG1', 'latin1');

/** Encrypt a file for keeping: MAGIC, a 12-byte nonce, the 16-byte tag, then the ciphertext. */
export function seal(key: Buffer, plain: Uint8Array): Buffer {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', key, iv);
  const body = Buffer.concat([c.update(plain), c.final()]);
  return Buffer.concat([MAGIC, iv, c.getAuthTag(), body]);
}

/** Decrypt a kept file. Throws on a file that is not ours, or has been changed. */
export function unseal(key: Buffer, sealed: Uint8Array): Buffer {
  const b = Buffer.from(sealed);
  if (b.length < MAGIC.length + 28 || !b.subarray(0, MAGIC.length).equals(MAGIC)) throw new Error('not a kept original');
  const iv = b.subarray(MAGIC.length, MAGIC.length + 12);
  const tag = b.subarray(MAGIC.length + 12, MAGIC.length + 28);
  const d = createDecipheriv('aes-256-gcm', key, iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(b.subarray(MAGIC.length + 28)), d.final()]);
}

/** The words a person reads where no original is kept. Never a broken link. */
export const READ_AND_DELETED = 'Read and then deleted — here is what we took from it.';
