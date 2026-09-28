/**
 * PHASE 151i, 28 September 2026 — THE DOCUMENT STORE EVERY COPY OF THE TEST WEBSITE REACHES. BUILT AND SWITCHED OFF.
 *
 * Phase 151e gave the test website one lasting database (Turso) for every copy of it. Its uploaded documents still went
 * to a folder on each copy's temporary disk, so a document uploaded through one copy was missing from the next while its
 * row said it was there. This store keeps them in ONE PRIVATE VERCEL BLOB STORE instead. api/index.mjs uses it only when
 * the lasting database is in use AND a Blob store is connected (`sharedDocumentStore` there); anything less keeps the
 * temporary folder, exactly as before.
 *
 * WHAT CHANGES AND WHAT DOES NOT. `SharedObjectStore` IS an `FsObjectStore`: every caller keeps the type it was written
 * against, and every rule stays where it was — the key checked, an original sealed (AES-256-GCM) before it is kept and
 * refused with no key, a deletion proved, a write capability scoped to exactly one key. It replaces only the four
 * steps that say where the bytes go (`readBytes`, `writeBytes`, `copyBytes`, `removeProven`). The port
 * (`ObjectStore` in the upload handler) already answers with promises, so no caller changed to suit a store.
 *
 * PRIVATE, NEVER A PUBLIC ADDRESS. Read from Vercel's docs, 28 Sep 2026 (vercel.com/docs/vercel-blob/private-storage):
 * a private store's objects "require authentication for all read and write operations"; its address,
 * https://<store>.private.blob.vercel-storage.com/<path>, "is not publicly accessible". And here:
 *   - every call says access: 'private' — a PUBLIC store refuses it, so a store created public by mistake fails closed;
 *   - the address Blob gives back on a write is thrown away, never stored, logged or sent;
 *   - a document leaves only through the routes that already authorise each request (the kept original's download,
 *     the photograph), which read it here server-side. The upload link is still OURS (`/upload/put?token=…`), never
 *     a Blob address, and still scoped to one key;
 *   - every read skips Blob's cache (useCache: false) — the latest bytes, and nothing served from a copy on the way;
 *   - every write says application/octet-stream, so nothing is ever rendered as a page, and the least cache time
 *     Blob allows (60 seconds). Blob's docs: a deleted object "may take up to one minute" to leave its cache. That
 *     cache is behind the same authentication; the Developer Spec's "Built by Phase 151i" section says so plainly.
 *
 * ONE UPLOAD LINK SECRET FOR EVERY COPY. A link issued by one copy is sent back to whichever copy Vercel picks. With a
 * secret made fresh in each process, the second copy refuses a good link. So the shared store signs links with a secret
 * derived (HKDF-SHA256) from the lasting database's token, which every copy already holds and nothing else sees. A new
 * database token ends links issued before it — they last fifteen minutes anyway.
 *
 * THE BLOB CLIENT IS A PORT, LIKE THE STORE. `BlobClient` is the four things this store asks of Blob, in our words.
 * `vercelBlobClient` is the real one: @vercel/blob, loaded only when the store is switched on, so the memory and folder
 * modes never load it. The tests hand in a client that answers as Blob's documented SDK does, with no network.
 */

import { hkdfSync } from 'node:crypto';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FsObjectStore, type FsObjectStoreOptions } from './objectstore.ts';

/** Every object of ours sits under this path in the Blob store, so nothing else in it can be mistaken for one. */
export const SHARED_PREFIX = 'caprebate-documents/';
/** The least cache time Vercel Blob allows (its SDK: "Cannot be set to a value lower than 1 minute"). */
export const SHARED_CACHE_SECONDS = 60;
/** Every object is bytes to a browser, never a page. */
export const SHARED_CONTENT_TYPE = 'application/octet-stream';

/** What this store asks of a Blob store, in our words. Every call is private. */
export interface BlobClient {
  /** Write (or replace) one object. Resolves once it is stored. */
  put(pathname: string, body: Buffer, opts: SharedPutOptions): Promise<void>;
  /** The object's bytes, or null when there is none. Never a cached copy. */
  read(pathname: string): Promise<Uint8Array | null>;
  /** Whether the object exists, asked of the store itself. */
  exists(pathname: string): Promise<boolean>;
  /** Delete one object. Deleting one that is not there is not an error (Blob's `del`). */
  remove(pathname: string): Promise<void>;
}

export type SharedPutOptions = {
  readonly access: 'private';
  readonly addRandomSuffix: false;
  readonly allowOverwrite: true;
  readonly cacheControlMaxAge: number;
  readonly contentType: string;
};

const PUT: SharedPutOptions = Object.freeze({
  access: 'private', addRandomSuffix: false, allowOverwrite: true,
  cacheControlMaxAge: SHARED_CACHE_SECONDS, contentType: SHARED_CONTENT_TYPE,
});

/** The upload link secret every copy shares: HKDF-SHA256 over the lasting database's token. Never the token itself. */
export function uploadLinkSecret(databaseToken: string): Buffer {
  const t = databaseToken.trim();
  if (t === '') throw new Error('a shared upload link secret needs the lasting database token');
  return Buffer.from(hkdfSync('sha256', Buffer.from(t, 'utf8'), Buffer.from('caprebate', 'utf8'), Buffer.from('upload link, phase 151i', 'utf8'), 32));
}

export type SharedObjectStoreOptions = Omit<FsObjectStoreOptions, 'root' | 'secret'> & {
  readonly client: BlobClient;
  /** From `uploadLinkSecret`: the same in every copy, so a link issued by one is accepted by another. */
  readonly linkSecret: Buffer;
};

export class SharedObjectStore extends FsObjectStore {
  readonly #client: BlobClient;
  /** Read by a screen or a log that must say where documents are. Never inferred from a request. */
  readonly shared = true as const;

  constructor(opts: SharedObjectStoreOptions) {
    if (opts.linkSecret.length < 32) throw new Error('the shared upload link secret must be 32 bytes');
    // The base class wants a folder for its permission report. It is made empty and stays empty: no byte goes to it.
    super({ ...opts, root: mkdtempSync(join(tmpdir(), 'cb-shared-unused-')), secret: opts.linkSecret });
    this.#client = opts.client;
  }

  protected override async readBytes(key: string): Promise<Uint8Array> {
    const got = await this.#client.read(SHARED_PREFIX + key);
    if (got === null) throw new Error(`object not found: ${key}`);
    return got;
  }

  protected override async writeBytes(key: string, bytes: Uint8Array): Promise<void> {
    await this.#client.put(SHARED_PREFIX + key, Buffer.from(bytes), PUT);
  }

  protected override async copyBytes(from_key: string, to_key: string): Promise<void> {
    await this.writeBytes(to_key, await this.readBytes(from_key));
  }

  /** As the folder does: a missing object throws, and so does one still there after the delete. */
  protected override async removeProven(key: string): Promise<void> {
    const p = SHARED_PREFIX + key;
    if (!(await this.#client.exists(p))) throw new Error(`object not found: ${key}`);
    await this.#client.remove(p);
    if (await this.#client.exists(p)) throw new Error(`object still readable after delete: ${key}`);
  }
}

/** The part of @vercel/blob this client calls. Named so a test can hand in a recorded one. */
export type VercelBlobSdk = {
  put(pathname: string, body: Buffer, opts: Record<string, unknown>): Promise<unknown>;
  get(pathname: string, opts: Record<string, unknown>): Promise<{ statusCode: number; stream: ReadableStream<Uint8Array> | null } | null>;
  head(pathname: string, opts: Record<string, unknown>): Promise<unknown>;
  del(pathname: string, opts: Record<string, unknown>): Promise<void>;
  BlobNotFoundError: new (...a: never[]) => Error;
};

/**
 * The real client. `token` is a read-write token (CAPREBATE_BLOB_TOKEN, else BLOB_READ_WRITE_TOKEN); with none, the SDK
 * authenticates itself by Vercel's OIDC token and BLOB_STORE_ID, which Vercel adds when a store is connected to the
 * project. The token is passed to the SDK and nowhere else. `sdk` is for the tests; absent, @vercel/blob is loaded now.
 */
export async function vercelBlobClient(auth: { token?: string }, sdk?: VercelBlobSdk): Promise<BlobClient> {
  const blob = sdk ?? (await import('@vercel/blob') as unknown as VercelBlobSdk);
  const who: Record<string, unknown> = auth.token === undefined ? {} : { token: auth.token };
  return {
    async put(pathname, body, opts) {
      // The address Blob answers with is not kept: a document is reached only through our authorising routes.
      await blob.put(pathname, body, { ...opts, ...who });
    },
    async read(pathname) {
      const r = await blob.get(pathname, { access: 'private', useCache: false, ...who });
      if (r === null || r.statusCode !== 200 || r.stream === null) return null;
      return new Uint8Array(await new Response(r.stream).arrayBuffer());
    },
    async exists(pathname) {
      try {
        await blob.head(pathname, { ...who });
        return true;
      } catch (e) {
        if (e instanceof blob.BlobNotFoundError) return false;
        throw e;
      }
    },
    async remove(pathname) {
      await blob.del(pathname, { ...who });
    },
  };
}
