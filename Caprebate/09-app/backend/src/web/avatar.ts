/**
 * THE PROFILE PHOTO, DOWN THE SAME HARDENED PATH AS A CLIENT DOCUMENT.
 *
 * The phase brief: "Profile photo upload goes through the SAME hardened path as
 * client documents: server-side type allow-list, size cap, content sniffing, no
 * execute permission, and re-encoding rather than trusting the file. An avatar
 * upload is the classic way a web application gets a shell."
 *
 * SO THIS FILE IS WIRING, AND EVERY CONTROL IN IT IS SOMEBODY ELSE'S:
 *
 *   allow-list, sniff, size cap, re-encode   src/web/images.ts
 *   0600 files, 0700 directory, outside the
 *     web root, deletion proved not assumed  src/web/objectstore.ts
 *   no route maps a path onto the filesystem asserted from the web sources
 *
 * Nothing here re-decides any of them, for the same reason src/web/uploads.ts
 * restates no rule from the upload handler: a second implementation of a
 * control is a second thing to get wrong, and the copy is always the one that
 * is not updated.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * FIVE THINGS THAT ARE DIFFERENT FROM A CLIENT DOCUMENT, EACH ON PURPOSE
 *
 * 1. THE ALLOW-LIST IS NARROWER. Client documents accept PDF, PNG, JPEG and
 *    OOXML because a lease arrives as whatever the client has. An avatar accepts
 *    PNG ALONE — see images.ts for why: this build re-encodes, and it can only
 *    re-encode honestly what it can decode without taking a dependency.
 *
 * 2. THE SIZE CAP IS SMALLER. 2 MB rather than 50. A face is not a survey.
 *
 * 3. NOTHING THE USER SENT IS EVER STORED. A client document goes to quarantine
 *    as it arrived and is processed there. An avatar is decoded to pixels in
 *    memory and a NEW file is written; the uploaded bytes reach no key at all.
 *    That is a stronger position than quarantine and it is available here only
 *    because an image can be reconstructed and a lease cannot.
 *
 * 4. THERE IS NO PRE-SIGNED URL. The capability in the document pipeline exists
 *    because the July design assumed a browser writing straight to S3. A 2 MB
 *    form post needs no such thing, and a capability that is not needed is a
 *    capability that can leak.
 *
 * 5. IT IS SERVED, WHERE A CLIENT DOCUMENT IS NOT. `/portal/documents/:id/download`
 *    returns 410 by design, because the original is deleted once the receipt
 *    strip has run. A photograph is put there to be looked at — so there is a
 *    serving endpoint, and it authorises the specific object on every request
 *    exactly as DB-W1 requires of the one that serves papers.
 */

import { createHash } from 'node:crypto';
import type { Db } from '../db.ts';
import type { FsObjectStore } from './objectstore.ts';
import { reEncodeAvatar, ImageError, IMAGE_LIMITS } from './images.ts';

export { ImageError, IMAGE_LIMITS };

export type PhotoRecord = {
  readonly user_id: string;
  readonly storage_key: string;
  readonly sniffed_as: string;
  readonly byte_size: number;
  readonly width: number;
  readonly height: number;
  readonly source_format: string;
  readonly source_bytes: number;
  readonly updated_at: string;
};

/**
 * The object key.
 *
 * HASHED RATHER THAN THE USER ID ITSELF, for two reasons that are not the same.
 * A key is a path component, and `assertSafeKey` refuses anything that could
 * escape the root — hashing means that refusal can never be the thing standing
 * between a user id and the filesystem. And a directory listing of the store
 * then carries no identifiers at all, so a backup of the photo directory is not
 * also a list of who has an account.
 */
export function photoKeyFor(user_id: string): string {
  return `avatars/${createHash('sha256').update(user_id).digest('hex')}.png`;
}

export function photoFor(db: Db, user_id: string): PhotoRecord | undefined {
  return db.get<PhotoRecord>(
    'SELECT user_id, storage_key, sniffed_as, byte_size, width, height, source_format, ' +
      'source_bytes, updated_at FROM user_photos WHERE user_id = ?',
    [user_id],
  );
}

export type PhotoResult =
  | { ok: true; record: PhotoRecord }
  | { ok: false; status: number; code: string; why: string };

/**
 * Accept one. The caller has ALREADY authorised `user.set_photo` on this user.
 *
 * THE ORDER MATTERS AND IT IS THE ORDER THE BRIEF LISTS: cap, sniff, re-encode,
 * then — and only then — write. Nothing reaches the object store until it has
 * been rebuilt from pixels, so there is never a moment at which the file the
 * client sent exists on disk under a name a web server could be pointed at.
 */
export async function setPhoto(
  d: { db: Db; store: FsObjectStore; now: () => string },
  user_id: string,
  bytes: Uint8Array,
): Promise<PhotoResult> {
  let out: ReturnType<typeof reEncodeAvatar>;
  try {
    out = reEncodeAvatar(bytes);
  } catch (e) {
    if (e instanceof ImageError) {
      const status =
        e.code === 'E_IMAGE_TOO_BIG' ? 413
        : e.code === 'E_IMAGE_NOT_PNG' || e.code === 'E_IMAGE_NOT_IMAGE' ? 415
        : 400;
      return { ok: false, status, code: e.code, why: e.message };
    }
    throw e;
  }

  const key = photoKeyFor(user_id);
  // putClientBytes is the store's write for bytes that came from outside. It
  // creates the directory at 0700 and the file at 0600, and hardens both after
  // the write rather than trusting the umask.
  await d.store.putClientBytes(key, out.png);

  const at = d.now();
  d.db.run(
    'INSERT INTO user_photos (user_id, storage_key, sniffed_as, byte_size, width, height, ' +
      'source_format, source_bytes, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) ' +
      'ON CONFLICT(user_id) DO UPDATE SET storage_key = excluded.storage_key, ' +
      'sniffed_as = excluded.sniffed_as, byte_size = excluded.byte_size, ' +
      'width = excluded.width, height = excluded.height, ' +
      'source_format = excluded.source_format, source_bytes = excluded.source_bytes, ' +
      'updated_at = excluded.updated_at',
    [user_id, key, 'png', out.png.length, out.width, out.height,
     out.source_format, out.source_bytes, at],
  );

  const record = photoFor(d.db, user_id);
  if (record === undefined) throw new Error('photo insert did not read back');
  return { ok: true, record };
}

/**
 * Remove one. The row goes and so do the bytes.
 *
 * A DELETION THAT LEAVES THE FILE IS NOT A DELETION. The store throws where the
 * object may survive — `FsObjectStore.delete` re-reads the key afterwards and
 * fails if anything is still there — and that error is allowed to propagate,
 * because reporting "removed" over a file that is still on disk is exactly the
 * class of claim this project refuses to make. A missing file is tolerated: it
 * means the row and the store had already diverged, which is worth recording
 * but is not a reason to refuse the request.
 */
export async function clearPhoto(
  d: { db: Db; store: FsObjectStore }, user_id: string,
): Promise<void> {
  const row = photoFor(d.db, user_id);
  if (row === undefined) return;
  d.db.run('DELETE FROM user_photos WHERE user_id = ?', [user_id]);
  try {
    await d.store.delete(row.storage_key);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
  }
}

/** The bytes, for the serving endpoint. Undefined where there is no photo. */
export async function readPhoto(
  d: { db: Db; store: FsObjectStore }, user_id: string,
): Promise<{ bytes: Uint8Array; record: PhotoRecord } | undefined> {
  const record = photoFor(d.db, user_id);
  if (record === undefined) return undefined;
  try {
    return { bytes: await d.store.get(record.storage_key), record };
  } catch {
    // The row says there is a photo and the store disagrees. Report NOTHING
    // rather than an error page: the caller renders the no-photo state, which
    // is true, and the mismatch is a maintenance question rather than a
    // reason to break a page.
    return undefined;
  }
}

/**
 * The headers a photo is served with.
 *
 * `nosniff` MATTERS MORE HERE THAN ALMOST ANYWHERE ELSE. The whole family of
 * attacks this file guards against ends with a browser deciding that a file
 * declared as an image is really something it should run. We have re-encoded,
 * so there is nothing in there to find — and the header is set anyway, because
 * two independent reasons a thing cannot happen is the standard the rest of
 * this application is held to.
 *
 * `private, no-store` because a photograph is personal data and a shared cache
 * is somewhere it should never rest.
 */
export const PHOTO_HEADERS: Readonly<Record<string, string>> = Object.freeze({
  'content-type': 'image/png',
  'x-content-type-options': 'nosniff',
  'content-disposition': 'inline',
  'cache-control': 'private, no-store',
  'referrer-policy': 'no-referrer',
  'content-security-policy': "default-src 'none'; sandbox",
});
