/**
 * FULL-SIZE PHOTOS, SENT STRAIGHT TO THE FILE STORE, LOCKED ON THE PHONE. 2 October 2026.
 *
 * Lakhbir asked whether the test website's 4.5 MB a send could be raised. It cannot: it is Vercel's fixed limit on a
 * request to the website. So each photo goes from the phone STRAIGHT TO THE PRIVATE FILE STORE (Vercel Blob), never
 * through the website: "go with option 2"; "Lock on the phone"; "100 photos, 25 MB each"; the mock-up, "Yes, build it
 * as shown".
 *
 * HOW. The page's one script (src/web/photo-upload-script.ts) asks to START a send (`startUpload`): the server makes a
 * ONE-TIME LOCK for it — an RSA-2048 key pair — and gives the phone its public half; the private half is kept in the
 * database, itself encrypted with the store's key. For each photo the phone makes a fresh AES-256-GCM key, locks the
 * photo with it, and locks that key with the public half (RSA-OAEP, SHA-256). It asks for a SLOT (`slotFor`): one
 * address in the store for exactly that file, for half an hour, at most the size it said (on the test website a Blob
 * presigned PUT; on any other copy, our own route, `putLocal`). It sends the locked photo there, then says it is DONE
 * (`finishSlot`): the server reads it, opens it with the private half, and treats the photo exactly as a photo sent
 * through the page — JPEG or PNG by its first bytes, at most 25 MB, hidden details taken out, ENCRYPTED with the
 * store's key and kept as not yet sorted (survey-evidence.ts `keep`) — then removes the locked upload. Vercel never
 * holds a photo it can read.
 *
 * WHO. A client of the job's company, for their own send only; with "nobody is in any of these photos" ticked. An
 * upload never finished is removed by the SWEEP (`sweepUploads`) after a day: at the next send, and whenever the outside
 * timer wakes the website (/hooks/read-replies). Each slot's outcome — KEPT, REFUSED or ABANDONED — is recorded once
 * (migration 076). Admin or Sales sort the photos as before (survey-evidence.ts `sortPhotos`).
 */
import { constants, createDecipheriv, generateKeyPairSync, privateDecrypt } from 'node:crypto';
import type { Actor } from '../authz.ts';
import { NotAuthorised } from '../authz.ts';
import { INCOMING_PREFIX, type FsObjectStore, type IncomingTarget } from './objectstore.ts';
import { cleaned, clientOf, keep, NO_KEY, UNSORTED, type EvidenceDeps } from './survey-evidence.ts';

/** The most photos in one send, and the most one photo may be (Lakhbir, 2 Oct 2026). */
export const MAX_PHOTOS_PER_SEND = 100;
export const MAX_FULL_PHOTO_BYTES = 25 * 1024 * 1024;
/** What locking adds: the mark, the locked key's length, the locked key, the nonce, the tag. */
export const LOCK_OVERHEAD = 5 + 2 + 256 + 12 + 16;
export const MAX_LOCKED_BYTES = MAX_FULL_PHOTO_BYTES + LOCK_OVERHEAD;
/** How long a send may take, and how long one slot's address lasts. */
export const SEND_HOURS = 3;
export const SLOT_MINUTES = 30;
/** An upload not finished after this long is removed by the sweep. */
export const ABANDON_HOURS = 24;
/**
 * 2 Oct 2026, the first send on the test website: every photo failed at "the website did not answer". The fallback: if
 * the store will not give its one-time address, the locked photo comes through our own route instead — on the test
 * website at most 4.4 MB a photo (its limit on a request). Such a slot's key ends `.site.lock`, so our route knows it.
 */
export const SITE_MAX_LOCKED_BYTES = 4_400_000;
const SITE_SUFFIX = '.site.lock';

/**
 * What went wrong, in words safe to show and to log: the error's kind and message, with any web address and any long
 * token-like run taken out, at most 200 characters. Never a stack.
 */
export function failureWords(e: unknown): string {
  const name = e instanceof Error ? e.name : 'Error';
  const msg = e instanceof Error ? e.message : String(e);
  const clean = msg.replace(/https?:\/\/\S+/g, '[address]').replace(/[A-Za-z0-9+/_=-]{40,}/g, '[…]').replace(/\s+/g, ' ').trim();
  return `${name}: ${clean}`.slice(0, 200);
}

const MAGIC = Buffer.from('CBUP1', 'latin1');

export type UploadResult<T> = ({ readonly ok: true } & T) | { readonly ok: false; readonly why: string };

type Session = { id: string; job_id: string; by_user: string; photos_planned: number; note: string | null; private_key_sealed: string; expires_at: string };

/** Start a send: the job, how many photos, the tick and the note. The phone gets the lock's public half. */
export function startUpload(d: EvidenceDeps, store: FsObjectStore, actor: Actor, f: { job_id: string; photos: string; nobody: string; note: string }):
  UploadResult<{ readonly session: string; readonly key: string; readonly max_bytes: number; readonly expires_at: string }> {
  const job = clientOf(d.db, actor, f.job_id);
  if (f.nobody !== 'yes') return { ok: false, why: 'Tick to say nobody is in the photos: no patients, residents, staff, screens or records.' };
  const n = /^\d{1,3}$/.test(f.photos.trim()) ? Number(f.photos.trim()) : 0;
  if (n < 1) return { ok: false, why: 'Choose your photos first.' };
  if (n > MAX_PHOTOS_PER_SEND) return { ok: false, why: `Send at most ${String(MAX_PHOTOS_PER_SEND)} photos at a time.` };
  const note = f.note.trim().replace(/\s+/g, ' ');
  if (note.length > 500) return { ok: false, why: 'Keep the note under 500 characters.' };
  if (!store.canSeal) return { ok: false, why: NO_KEY };
  const pair = generateKeyPairSync('rsa', { modulusLength: 2048, publicKeyEncoding: { type: 'spki', format: 'der' }, privateKeyEncoding: { type: 'pkcs8', format: 'der' } });
  const id = d.newId();
  const now = d.now();
  const expires = new Date(Date.parse(now) + SEND_HOURS * 3_600_000).toISOString();
  const key = Buffer.from(pair.publicKey).toString('base64');
  d.db.run('INSERT INTO survey_upload_sessions (id, job_id, by_user, photos_planned, note, nobody_in_it, public_key, private_key_sealed, created_at, expires_at) VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?, ?)',
    [id, job.id, actor.id, n, note === '' ? null : note, key, store.sealBytes(pair.privateKey).toString('base64'), now, expires]);
  return { ok: true, session: id, key, max_bytes: MAX_LOCKED_BYTES, expires_at: expires };
}

/** The caller's own send, for a client of its company still. Anyone else's is refused. */
function ownSession(d: EvidenceDeps, actor: Actor, session_id: string): Session {
  const s = d.db.get<Session>('SELECT id, job_id, by_user, photos_planned, note, private_key_sealed, expires_at FROM survey_upload_sessions WHERE id = ?', [session_id]);
  if (s === undefined || s.by_user !== actor.id) throw new NotAuthorised('survey_evidence.add', 'surveyor_job');
  clientOf(d.db, actor, s.job_id);
  return s;
}

/** One photo's place in the store: its address and headers, for exactly that file, for half an hour. */
export async function slotFor(d: EvidenceDeps, store: FsObjectStore, actor: Actor, session_id: string, f: { n: string; size: string }):
  Promise<UploadResult<{ readonly slot: string; readonly url: string; readonly headers: Readonly<Record<string, string>> }>> {
  const s = ownSession(d, actor, session_id);
  const now = d.now();
  if (now >= s.expires_at) return { ok: false, why: 'This send has run out of time. Choose your photos again.' };
  const n = /^\d{1,3}$/.test(f.n.trim()) ? Number(f.n.trim()) : 0;
  if (n < 1 || n > s.photos_planned) return { ok: false, why: 'That photo is not one of this send.' };
  const size = /^\d{1,9}$/.test(f.size.trim()) ? Number(f.size.trim()) : 0;
  if (size <= LOCK_OVERHEAD) return { ok: false, why: 'That photo is empty.' };
  if (size > MAX_LOCKED_BYTES) return { ok: false, why: 'That photo is too big. The most is 25 MB.' };
  if (d.db.get('SELECT 1 AS x FROM survey_upload_slots WHERE session_id = ? AND n = ?', [s.id, n]) !== undefined) return { ok: false, why: 'That photo has already been sent in this send.' };
  const id = d.newId();
  const staged = `${INCOMING_PREFIX}${s.id}/${id}.lock`;
  const until = Math.min(Date.parse(now) + SLOT_MINUTES * 60_000, Date.parse(s.expires_at));
  let remote: IncomingTarget | null;
  let key = staged;
  try {
    remote = await store.incomingTarget(staged, size, until);
  } catch (e) {
    // The store would not give its address: say why in the log, and send this photo through our own route if it fits.
    const why = failureWords(e);
    console.error(`photo upload: the store gave no upload address, so photos go through the website: ${why}`);
    if (size > SITE_MAX_LOCKED_BYTES) {
      return { ok: false, why: `This photo is over 4.4 MB, and the direct way to our file store is not working yet, so it cannot be sent today. We have been told. (${why})` };
    }
    remote = null;
    key = staged.replace(/\.lock$/, SITE_SUFFIX);
  }
  d.db.run('INSERT INTO survey_upload_slots (id, session_id, n, staged_key, byte_size, issued_at) VALUES (?, ?, ?, ?, ?, ?)', [id, s.id, n, key, size, now]);
  const target = remote ?? { url: `/portal/building/upload/${s.id}/slot/${id}`, headers: {} };
  return { ok: true, slot: id, url: target.url, headers: target.headers };
}

type Slot = { id: string; session_id: string; staged_key: string; byte_size: number; issued_at: string; outcome: string | null; photo_id: string | null; why: string | null };

function slotOf(d: EvidenceDeps, session_id: string, slot_id: string): Slot | undefined {
  return d.db.get<Slot>('SELECT s.id, s.session_id, s.staged_key, s.byte_size, s.issued_at, o.outcome, o.photo_id, o.why FROM survey_upload_slots s ' +
    'LEFT JOIN survey_upload_outcomes o ON o.slot_id = s.id WHERE s.id = ? AND s.session_id = ?', [slot_id, session_id]);
}

/**
 * The locked photo through our own route: on a copy that is not the test website, or (the fallback) a slot the store
 * gave no address for. At most the size the slot said.
 */
export async function putLocal(d: EvidenceDeps, store: FsObjectStore, actor: Actor, session_id: string, slot_id: string, bytes: Uint8Array): Promise<UploadResult<object>> {
  const s = ownSession(d, actor, session_id);
  const slot = slotOf(d, s.id, slot_id);
  if (slot === undefined) return { ok: false, why: 'That photo is not one of this send.' };
  if (store.incomingOrigin !== null && !slot.staged_key.endsWith(SITE_SUFFIX)) return { ok: false, why: 'Photos go straight to the file store here, not through this page.' };
  if (slot.outcome !== null) return { ok: false, why: 'That photo has already been dealt with.' };
  if (d.now() > new Date(Date.parse(slot.issued_at) + SLOT_MINUTES * 60_000).toISOString()) return { ok: false, why: 'That photo’s place has run out of time. Send it again.' };
  if (bytes.length === 0 || bytes.length > slot.byte_size) return { ok: false, why: 'That photo is not the size it said it was.' };
  await store.putIncoming(slot.staged_key, bytes);
  return { ok: true };
}

/** Open a photo locked on the phone with the send's private half. Null if it is not one of ours or was changed. */
export function unlockPhoto(privateKeyPkcs8: Uint8Array, locked: Uint8Array): Buffer | null {
  const b = Buffer.from(locked);
  if (b.length < LOCK_OVERHEAD + 1 || !b.subarray(0, 5).equals(MAGIC)) return null;
  const klen = b.readUInt16BE(5);
  if (klen !== 256) return null;
  const wrapped = b.subarray(7, 7 + klen);
  const iv = b.subarray(7 + klen, 7 + klen + 12);
  const body = b.subarray(7 + klen + 12);
  if (body.length < 17) return null;
  try {
    const aes = privateDecrypt({ key: Buffer.from(privateKeyPkcs8), format: 'der', type: 'pkcs8', padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' }, wrapped);
    if (aes.length !== 32) return null;
    const dec = createDecipheriv('aes-256-gcm', aes, iv);
    dec.setAuthTag(body.subarray(body.length - 16));
    return Buffer.concat([dec.update(body.subarray(0, body.length - 16)), dec.final()]);
  } catch { return null; }
}

/**
 * The phone says one photo is sent. Read it, open it, check and clean it, keep it encrypted as not yet sorted, and
 * remove the locked upload — whatever the outcome. Saying it twice answers the first outcome again.
 */
export async function finishSlot(d: EvidenceDeps, store: FsObjectStore, actor: Actor, session_id: string, slot_id: string): Promise<UploadResult<{ readonly photo: string }>> {
  const s = ownSession(d, actor, session_id);
  const slot = slotOf(d, s.id, slot_id);
  if (slot === undefined) return { ok: false, why: 'That photo is not one of this send.' };
  if (slot.outcome === 'KEPT' && slot.photo_id !== null) return { ok: true, photo: slot.photo_id };
  if (slot.outcome !== null) return { ok: false, why: slot.why ?? 'That photo was not kept.' };
  const refuse = async (why: string): Promise<{ ok: false; why: string }> => {
    await store.dropIncoming(slot.staged_key);
    d.db.run("INSERT INTO survey_upload_outcomes (slot_id, outcome, photo_id, why, at) VALUES (?, 'REFUSED', NULL, ?, ?)", [slot.id, why, d.now()]);
    return { ok: false, why };
  };
  const locked = await store.takeIncoming(slot.staged_key);
  if (locked === null) return { ok: false, why: 'That photo has not arrived yet. Send it again.' };
  if (locked.length > slot.byte_size) return refuse('That photo is not the size it said it was.');
  if (!store.canSeal) return refuse(NO_KEY);
  const plain = unlockPhoto(store.openBytes(Buffer.from(s.private_key_sealed, 'base64')), locked);
  if (plain === null) return refuse('That photo could not be opened. Send it again.');
  if (plain.length > MAX_FULL_PHOTO_BYTES) return refuse('That photo is too big. The most is 25 MB.');
  const c = cleaned(plain);
  if (!c.ok) return refuse(c.why);
  const photo = await keep(d, store, actor, s.job_id, UNSORTED, c, s.note ?? '');
  await store.dropIncoming(slot.staged_key);
  d.db.run("INSERT INTO survey_upload_outcomes (slot_id, outcome, photo_id, why, at) VALUES (?, 'KEPT', ?, NULL, ?)", [slot.id, photo, d.now()]);
  return { ok: true, photo };
}

/**
 * Remove every upload not finished within a day, and record it as ABANDONED. At most `limit` at a time, so a sweep is
 * always quick. Returns how many it cleared.
 */
export async function sweepUploads(d: Pick<EvidenceDeps, 'db' | 'now'>, store: FsObjectStore, limit = 50): Promise<number> {
  const before = new Date(Date.parse(d.now()) - ABANDON_HOURS * 3_600_000).toISOString();
  const stale = d.db.all<{ id: string; staged_key: string }>(
    'SELECT s.id, s.staged_key FROM survey_upload_slots s LEFT JOIN survey_upload_outcomes o ON o.slot_id = s.id WHERE o.slot_id IS NULL AND s.issued_at < ? ORDER BY s.issued_at LIMIT ?',
    [before, limit]);
  for (const x of stale) {
    await store.dropIncoming(x.staged_key);
    d.db.run("INSERT INTO survey_upload_outcomes (slot_id, outcome, photo_id, why, at) VALUES (?, 'ABANDONED', NULL, ?, ?)", [x.id, 'Never finished: removed after a day.', d.now()]);
  }
  return stale.length;
}
