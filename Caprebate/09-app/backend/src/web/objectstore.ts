/**
 * THE OBJECT STORE — the real implementation of the port the upload handler
 * has been waiting for since 31 August.
 *
 * `04-phase-work/phase3/caprebate-upload-handler.ts` is 945 lines with 38
 * tests and, until this file, NO CONSUMER. Its own header says so: "Eighty-two
 * tests passed against a module with no consumer, which proves the design is
 * coherent and proves nothing about whether a single client document is
 * protected." This is the store it takes, and src/web/uploads.ts is the caller.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * REQUIREMENT DB-W1, WHICH IS WHY THIS FILE IS SHAPED THE WAY IT IS
 *
 * Developer Brief §3.0.3: client documents are written OUTSIDE the web root,
 * where no web-server route can reach them by path, and are served ONLY
 * through an application endpoint that authorises every single request, for
 * that specific document and that specific requester.
 *
 * "Outside the web root" is trivially true here and it is worth saying WHY
 * rather than claiming it: THIS APPLICATION HAS NO STATIC FILE ROUTE AT ALL.
 * The single asset it serves — /assets/site.css — is a string constant in
 * src/web/assets.ts, not a file read from disk. There is no `sendFile`, no
 * document root, and no directory the router will map a path into. A reviewer
 * can establish that with one grep, and `assertNoStaticFileRoute()` below is
 * that grep as an assertion so it cannot rot.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * WHAT A "PRE-SIGNED URL" MEANS WITH NO CLOUD BEHIND IT
 *
 * The port's `presignPut` exists because the July design assumed S3. There is
 * no S3 here and there will not be one under WordPress either. So the
 * capability is real but local: an HMAC over (key, expiry) with a per-process
 * secret, scoped to EXACTLY ONE KEY.
 *
 * THE SCOPE IS THE CONTROL, NOT THE SIGNATURE. The port's own comment: "The
 * implementation MUST NOT widen the scope to a prefix: a URL that can write
 * anywhere under quarantine/ lets one client overwrite another's document."
 * `verifyPutToken` therefore takes the key it is being used against and
 * compares, rather than trusting the key inside the token.
 *
 * THE TOKEN IS A BEARER CAPABILITY AND IS NEVER PERSISTED OR LOGGED. It is not
 * written to `documents`, not to `document_events`, and not to the audit log.
 * The handler says the same thing at PresignedUpload.
 */

import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { mkdirSync, existsSync, chmodSync, statSync } from 'node:fs';
import { readFile, writeFile, unlink, mkdir, copyFile, access } from 'node:fs/promises';
import { constants as FS } from 'node:fs';
import { join, dirname, normalize, sep } from 'node:path';
import { durableKeyFor, retainedTextKeyFor, type ObjectStore, type PresignedUpload } from './upload-handler-port.ts';
import { KEEP_ORIGINALS, keptDays, seal, unseal, type KeepOriginals } from './originals.ts';

/** PHASE 140: where a kept original lives — the handler's durable prefix. The retained text beside it is not an original. */
const DURABLE_PREFIX = durableKeyFor('');
function isOriginalKey(key: string): boolean {
  return key.startsWith(DURABLE_PREFIX) && !key.endsWith(retainedTextKeyFor('').slice(DURABLE_PREFIX.length));
}

/**
 * PERMISSIONS, and the honest version of "no execute permission".
 *
 * DB-W1-T5 asks for no execute permission on the storage directory. On a POSIX
 * filesystem a directory's execute bit is its TRAVERSE bit: strip it from the
 * owner and the process cannot open its own files, so a literal reading makes
 * the store unusable and the requirement unmeetable.
 *
 * What the test is actually protecting against is named in the brief one line
 * later — "the classic WordPress upload failure is a PHP file with an image
 * extension landing somewhere the web server will run it". So:
 *
 *   FILES      0o600  — owner read/write. NO EXECUTE BIT FOR ANYONE, which is
 *                       the half that stops a dropped payload being run.
 *   DIRECTORY  0o700  — owner traverse only. Group and other have no execute
 *                       bit and no read bit, so no other account on the host —
 *                       including the web server's, if one is ever added —
 *                       can enter or list it.
 *
 * Both are asserted by `permissionReport()` and both are checked by the DB-W1
 * tests. Recording the reasoning here rather than silently choosing 0o700 is
 * the point: a later reader can disagree with it, which they cannot do with a
 * number that has no argument attached.
 */
export const DIR_MODE = 0o700;
export const FILE_MODE = 0o600;

export type FsObjectStoreOptions = {
  /** The storage root. MUST NOT be inside anything this process serves. */
  root: string;
  /** Injected so a test is deterministic; defaults to a fresh random secret. */
  secret?: Buffer;
  now?: () => string;
  /** PHASE 140: the KEEP_ORIGINALS switch. Absent is the shipped switch, off. A test passes it on. */
  originals?: KeepOriginals;
  /** PHASE 140: the 32-byte key a kept original is encrypted with. Absent or wrong length: no original is ever kept. */
  sealKey?: Buffer | null;
};

/** A key that would escape the root, or reach a parent, is refused outright. */
function assertSafeKey(key: string): void {
  if (key.length === 0 || key.length > 512) throw new Error('object key out of range');
  if (key.startsWith('/') || key.includes('\0')) throw new Error('object key not relative');
  const n = normalize(key);
  if (n.startsWith('..') || n.includes(`..${sep}`) || n !== key) {
    throw new Error(`object key escapes the store root: ${JSON.stringify(key)}`);
  }
}

export class FsObjectStore implements ObjectStore {
  readonly root: string;
  readonly #secret: Buffer;
  readonly #now: () => string;
  readonly #sealKey: Buffer | null;
  /** PHASE 140: days a kept original lives, or null — KEEP_ORIGINALS is off in one of its three ways. Read by uploads.ts. */
  readonly keptDays: number | null;

  constructor(opts: FsObjectStoreOptions) {
    this.root = opts.root;
    this.#sealKey = opts.sealKey !== undefined && opts.sealKey !== null && opts.sealKey.length === 32 ? opts.sealKey : null;
    this.keptDays = keptDays(opts.originals ?? KEEP_ORIGINALS, this.#sealKey);
    this.#secret = opts.secret ?? randomBytes(32);
    this.#now = opts.now ?? ((): string => new Date().toISOString());
    if (!existsSync(this.root)) mkdirSync(this.root, { recursive: true, mode: DIR_MODE });
    chmodSync(this.root, DIR_MODE);
  }

  #path(key: string): string {
    assertSafeKey(key);
    return join(this.root, key);
  }

  /* ---------------------------------------------------------------- the port */

  async presignPut(key: string, expires_at: string): Promise<PresignedUpload> {
    assertSafeKey(key);
    // The key is returned UNCHANGED. The handler compares what it asked for
    // with what came back and refuses a store that widened the scope; that
    // check only means something if this implementation cannot quietly differ.
    const token = this.mintPutToken(key, expires_at);
    return { url: `/upload/put?token=${encodeURIComponent(token)}`, key, expires_at };
  }

  async get(key: string): Promise<Uint8Array> {
    assertSafeKey(key);
    return this.readBytes(key);
  }

  /**
   * The handler's only use of `copy` is promoting an original to durable storage (PROMOTION_RULE). PHASE 140: AN ORIGINAL
   * IS NEVER WRITTEN THERE IN THE CLEAR. It is encrypted on the way, and with no key the copy is refused — the handler's
   * own catch path then deletes the quarantined file, so a missing key can only ever mean less is kept, never more.
   */
  async copy(from_key: string, to_key: string): Promise<void> {
    assertSafeKey(from_key);
    assertSafeKey(to_key);
    if (isOriginalKey(to_key)) {
      if (this.#sealKey === null) throw new Error('refusing to keep an original with no encryption key');
      await this.writeBytes(to_key, seal(this.#sealKey, await this.readBytes(from_key)));
    } else {
      await this.copyBytes(from_key, to_key);
    }
  }

  /** PHASE 140: a kept original, decrypted. Only src/web/uploads.ts calls this, after `document.read_original`. */
  async openOriginal(key: string): Promise<Buffer> {
    if (!isOriginalKey(key)) throw new Error('not an original');
    if (this.#sealKey === null) throw new Error('no key to open a kept original');
    assertSafeKey(key);
    return unseal(this.#sealKey, await this.readBytes(key));
  }

  /**
   * Delete, permanently — and THROW rather than resolve where the object may
   * survive. The port's comment is unusually strong about this and it is right:
   * `recordQuarantineDischarge` writes evidence that a deletion happened, and
   * evidence of a deletion that did not happen is worse than no evidence.
   *
   * A MISSING OBJECT IS NOT A SUCCESSFUL DELETION AND IS NOT SILENTLY OK. If
   * the file is not there, something else removed it and this store cannot say
   * what — so it throws and the job fails, which is what leaves the
   * QuarantineObject undischarged for the sweeper to find.
   */
  async delete(key: string): Promise<void> {
    assertSafeKey(key);
    await this.removeProven(key);
  }

  async putText(key: string, body: string): Promise<void> {
    assertSafeKey(key);
    await this.writeBytes(key, Buffer.from(body, 'utf8'));
  }

  /* ------------------------------------------------- the capability, minted */

  mintPutToken(key: string, expires_at: string): string {
    assertSafeKey(key);
    const payload = `${key}|${expires_at}`;
    const sig = createHmac('sha256', this.#secret).update(payload).digest('base64url');
    return `${Buffer.from(payload, 'utf8').toString('base64url')}.${sig}`;
  }

  /**
   * Verify, AGAINST A KEY THE CALLER ALREADY KNOWS.
   *
   * `expectedKey` is not optional and it is not read out of the token. A
   * verifier that returned the key from inside the token would let a holder of
   * any valid token write to whatever key it named — which is exactly the
   * prefix-widening failure the port warns about, arriving through the back
   * door instead of the front.
   */
  verifyPutToken(token: string, expectedKey: string): { ok: true } | { ok: false; why: string } {
    const dot = token.lastIndexOf('.');
    if (dot <= 0) return { ok: false, why: 'malformed' };
    const payload = Buffer.from(token.slice(0, dot), 'base64url').toString('utf8');
    const given = Buffer.from(token.slice(dot + 1), 'base64url');
    const want = createHmac('sha256', this.#secret).update(payload).digest();
    if (given.length !== want.length || !timingSafeEqual(given, want)) {
      return { ok: false, why: 'signature' };
    }
    const bar = payload.lastIndexOf('|');
    if (bar <= 0) return { ok: false, why: 'malformed' };
    const key = payload.slice(0, bar);
    const expires = payload.slice(bar + 1);
    if (key !== expectedKey) return { ok: false, why: 'scope' };
    if (new Date(expires).getTime() <= new Date(this.#now()).getTime()) {
      return { ok: false, why: 'expired' };
    }
    return { ok: true };
  }

  /**
   * The write the capability authorises. Separate from `putText` because this
   * one is the CLIENT'S BYTES and putText is ours; conflating them is how a
   * client file ends up written by a path that skipped the size check.
   */
  async putClientBytes(key: string, bytes: Uint8Array): Promise<void> {
    assertSafeKey(key);
    await this.writeBytes(key, bytes);
  }

  /* ------------------------------------------------ where the bytes go
   * PHASE 151i, 28 September 2026. Everything above decides WHAT happens to a document: the key checked, an original
   * sealed before it is kept and refused without a key, a deletion proved, a write capability scoped to one key. The
   * four steps below are only WHERE the bytes go, and they are all a store may change. Here it is a folder on this
   * machine, exactly as before; src/web/shared-objectstore.ts puts them in a private Vercel Blob store every copy of the
   * test website reaches, and inherits every rule above unchanged. Each step is given a key the public method above
   * has already checked. */

  /** One object's bytes. A missing object throws: it is never an empty file. */
  protected async readBytes(key: string): Promise<Uint8Array> {
    return new Uint8Array(await readFile(this.#path(key)));
  }

  /** Write (or replace) one object, owner read/write only. */
  protected async writeBytes(key: string, bytes: Uint8Array): Promise<void> {
    const p = this.#path(key);
    await mkdir(dirname(p), { recursive: true, mode: DIR_MODE });
    await writeFile(p, bytes, { mode: FILE_MODE });
    await this.#harden(p);
  }

  /** Copy one object to another key, as it is. */
  protected async copyBytes(from_key: string, to_key: string): Promise<void> {
    const to = this.#path(to_key);
    await mkdir(dirname(to), { recursive: true, mode: DIR_MODE });
    await copyFile(this.#path(from_key), to);
    await this.#harden(to);
  }

  /**
   * Delete one object, then PROVE it is gone, and throw if it is not. A missing object throws too: it is not a
   * successful deletion (see `delete` above). A store that cannot evidence a deletion cannot host the quarantine
   * prefix — the port calls that a procurement fact.
   */
  protected async removeProven(key: string): Promise<void> {
    await unlink(this.#path(key));
    try {
      await access(this.#path(key), FS.F_OK);
    } catch {
      return; // gone, as required
    }
    throw new Error(`object still readable after delete: ${key}`);
  }

  async #harden(p: string): Promise<void> {
    chmodSync(p, FILE_MODE);
  }

  /** DB-W1-T5, as data a test and a screen can both read. */
  permissionReport(): {
    root: string; dirMode: string; fileMode: string;
    dirGroupOther: number; fileExecuteBits: number;
  } {
    const st = statSync(this.root);
    const dirMode = st.mode & 0o777;
    return {
      root: this.root,
      dirMode: dirMode.toString(8).padStart(3, '0'),
      fileMode: FILE_MODE.toString(8).padStart(3, '0'),
      /** Anything group or other can do to the directory. MUST be 0. */
      dirGroupOther: dirMode & 0o077,
      /** Execute bits on a stored file. MUST be 0 — nobody may run what a client sent. */
      fileExecuteBits: FILE_MODE & 0o111,
    };
  }
}

/**
 * DB-W1's first clause, asserted rather than asserted-in-prose.
 *
 * Reads the router's own source and fails if anything in it maps a request
 * path onto the filesystem. It is deliberately a source-level check: the point
 * is not that today's routes are safe, it is that a future route which reads a
 * file by path cannot be added without this failing.
 */
export async function assertNoStaticFileRoute(routerSource: string): Promise<void> {
  /**
   * THE PATTERNS MUST NOT MATCH THEIR OWN SOURCE, and one of them did.
   *
   * Phase 105 widened this scan from `router.ts` alone to every file in
   * src/web/ — necessary, because `staff.ts` serves the profile photograph and
   * a check scoped to one file stops being a check the moment a second file can
   * answer with bytes. The wider scan then failed on THIS FILE, because the
   * bare `/serve-static/` matched the literal in the list below.
   *
   * A self-match is not a false positive to be excluded away: excluding
   * `objectstore.ts` would exempt the one file that actually holds the store.
   * So the two library patterns now require an IMPORT CONTEXT, which is the
   * only way either of them can serve anything anyway. Every file in src/web/
   * is scanned, this one included.
   */
  const banned = [
    /createReadStream\s*\(/,
    /\bsendFile\s*\(/,
    /readFileSync\s*\(\s*join\s*\(/,
    /express\.static\s*\(/,
    /(?:from\s+|require\(\s*)['"]serve-static['"]/,
  ];
  for (const re of banned) {
    if (re.test(routerSource)) {
      throw new Error(
        `DB-W1: the web router contains ${String(re)}, which serves files straight from disk. ` +
          'Client documents may only be served by a route that checks who is asking, every time. ' +
          'A route that serves a folder gets round that check.',
      );
    }
  }
}
