/**
 * A VIDEO OF THE BUILDING, SENT FROM THE PHONE IN LOCKED PIECES..
 *
 * the owner: "we need to add an option of upload video"; the limits, "10 minutes, 1 GB each"; how videos are kept,
 * "Same as photos" — locked on the phone, the place it was filmed taken out, encrypted, kept for testing 7 years, seen by
 * the client, the assigned surveyor, Admin, Sales and the data protection officer.
 *
 * HOW. A video is far bigger than one request to the test website may carry (4.5 MB), and than a phone can lock in one
 * go. So the page's script (src/modules/survey/photo-upload-script.ts) cuts it into pieces of 4 MB. The send gets a one-time lock
 * (`startVideo`, as a photo send does); each piece is locked on the phone with a fresh key, given its own place
 * (`videoSlot`: a Blob presigned PUT on the test website, or our own route — `putVideoLocal` — on any other copy or
 * when the store gives no address), sent, and reported (`finishPiece`): the server opens it, checks its size, and keeps
 * it ENCRYPTED with the store's key at survey-videos/<video>/<n>; the locked piece is removed. When every piece has come
 * (`finishVideo`) the video is checked — an MP4 or QuickTime file (its `ftyp`), at most ten minutes (its `mvhd`) — and
 * every place written in its header (ISO 6709 co-ordinates, as phones write them: `©xyz`, or the Apple location key)
 * is blanked IN PLACE, the same length, so nothing else in the file moves. Then it is kept. A refused or abandoned video's
 * pieces are removed.
 *
 * PLAYBACK in pieces (`videoBytes`): a browser asks for a range of bytes, and is answered at most one piece at a time —
 * which is what an iPhone needs to play and seek, and keeps every answer under the test website's limit.
 */
import { createHash, generateKeyPairSync } from 'node:crypto';
import type { Actor } from '../../core/index.ts';
import { authorise, NotAuthorised } from '../../core/index.ts';
import { INCOMING_PREFIX, VIDEO_PREFIX, type FsObjectStore, type IncomingTarget } from '../../shared/objectstore.ts';
import { clientOf, NO_KEY, type EvidenceDeps } from './survey-evidence.ts';
import { failureWords, LOCK_OVERHEAD, SITE_SUFFIX, unlockPhoto, type UploadResult } from './photo-upload.ts';
import { packJob } from './surveyor.ts';
import { getSurveyVideoOutcomesOutcomeWhyBySendId, getSurveyVideoPiecesCountBySendId, getSurveyVideoSendsIdJobIdById, getSurveyVideoSlotsIdSendIdByIdSendId, getSurveyVideoSlotsXBySendIdN, getSurveyVideoWithdrawalsXByVideoId, getSurveyVideosBusinessIdById, getSurveyVideosJobIdBusinessIdById, getSurveyVideosMsById, insertSurveyVideoOutcomes, insertSurveyVideoOutcomes2, insertSurveyVideoOutcomes3, insertSurveyVideoPieces, insertSurveyVideoSends, insertSurveyVideoSlots, insertSurveyVideoWithdrawals, insertSurveyVideos, listSurveyVideoSendsIdPiecesBySendIdCreatedAt, listSurveyVideoSlotsStagedKeyBySendId } from './data.ts';
import { listSurveyVideosIdContentTypeByJobIdVideoId } from './data-borrowed.ts';

export const VIDEO_PIECE_BYTES = 4 * 1024 * 1024;
export const MAX_VIDEO_BYTES = 1024 * 1024 * 1024;
export const MAX_VIDEO_MS = 10 * 60_000;
/** A phone's ten minutes can read a few seconds over. */
const GRACE_MS = 5_000;
// A function, not a constant: worked out when asked, so this file never reads photo-upload.ts's value while files load.
export function maxLockedPiece(): number { return VIDEO_PIECE_BYTES + LOCK_OVERHEAD; }
export const VIDEO_SEND_HOURS = 12;
export const VIDEO_SLOT_MINUTES = 30;
export const VIDEO_ABANDON_HOURS = 24;

type Send = { id: string; job_id: string; by_user: string; byte_size: number; pieces: number; note: string | null; private_key_sealed: string; expires_at: string };

const pieceKey = (send: string, n: number): string => `${VIDEO_PREFIX}${send}/${String(n)}`;
const plainSizeOf = (s: Pick<Send, 'byte_size' | 'pieces'>, n: number): number => n < s.pieces ? VIDEO_PIECE_BYTES : s.byte_size - (s.pieces - 1) * VIDEO_PIECE_BYTES;

/** UI tidy phase 11: a video's length, short — "32 s", "2 min", "2 min 12 s" — never "0 min 32 s". */
export function lengthWords(secs: number): string {
  const s = Math.max(0, Math.round(secs));
  const m = Math.floor(s / 60);
  if (m === 0) return `${String(s)} s`;
  return s % 60 === 0 ? `${String(m)} min` : `${String(m)} min ${String(s % 60)} s`;
}

/** How long, in words: "under a minute", "1 minute", "12 minutes". */
export function minutesWords(minutes: number): string {
  return minutes < 1 ? 'under a minute' : `${String(minutes)} minute${minutes === 1 ? '' : 's'}`;
}

/** Start a video send: its size, the tick and the note. The phone gets the lock's public half and how to cut it. */
export function startVideo(d: EvidenceDeps, store: FsObjectStore, actor: Actor, f: { job_id: string; size: string; nobody: string; note: string }):
  UploadResult<{ readonly send: string; readonly key: string; readonly pieces: number; readonly piece_bytes: number }> {
  const job = clientOf(d.db, actor, f.job_id);
  if (f.nobody !== 'yes') return { ok: false, why: 'Tick to say nobody is in the video: no patients, residents, staff, screens or records.' };
  const size = /^\d{1,10}$/.test(f.size.trim()) ? Number(f.size.trim()) : 0;
  if (size < 1) return { ok: false, why: 'Choose a video first.' };
  if (size > MAX_VIDEO_BYTES) return { ok: false, why: 'That video is over 1 GB. Send a shorter one, or film the building in two or three parts.' };
  const note = f.note.trim().replace(/\s+/g, ' ');
  if (note.length > 500) return { ok: false, why: 'Keep the note under 500 characters.' };
  if (!store.canSeal) return { ok: false, why: NO_KEY };
  const pair = generateKeyPairSync('rsa', { modulusLength: 2048, publicKeyEncoding: { type: 'spki', format: 'der' }, privateKeyEncoding: { type: 'pkcs8', format: 'der' } });
  const id = d.newId();
  const now = d.now();
  const key = Buffer.from(pair.publicKey).toString('base64');
  const pieces = Math.ceil(size / VIDEO_PIECE_BYTES);
  insertSurveyVideoSends(d.db, [id, job.id, actor.id, size, pieces, note === '' ? null : note, key, store.sealBytes(pair.privateKey).toString('base64'), now,
      new Date(Date.parse(now) + VIDEO_SEND_HOURS * 3_600_000).toISOString()]);
  return { ok: true, send: id, key, pieces, piece_bytes: VIDEO_PIECE_BYTES };
}

function ownSend(d: EvidenceDeps, actor: Actor, send_id: string): Send {
  const s = getSurveyVideoSendsIdJobIdById<Send>(d.db, [send_id]);
  if (s === undefined || s.by_user !== actor.id) throw new NotAuthorised('survey_evidence.add', 'surveyor_job');
  clientOf(d.db, actor, s.job_id);
  return s;
}

const outcomeOf = (d: EvidenceDeps, send_id: string) => getSurveyVideoOutcomesOutcomeWhyBySendId<{ outcome: string; why: string | null }>(d.db, [send_id]);

/** One piece's place: the store's one-time address, or our own route. */
export async function videoSlot(d: EvidenceDeps, store: FsObjectStore, actor: Actor, send_id: string, f: { n: string; size: string }):
  Promise<UploadResult<{ readonly slot: string; readonly url: string; readonly headers: Readonly<Record<string, string>> }>> {
  const s = ownSend(d, actor, send_id);
  const now = d.now();
  if (outcomeOf(d, s.id) !== undefined) return { ok: false, why: 'This video has already been dealt with.' };
  if (now >= s.expires_at) return { ok: false, why: 'This send has run out of time. Choose the video again.' };
  const n = /^\d{1,3}$/.test(f.n.trim()) ? Number(f.n.trim()) : 0;
  if (n < 1 || n > s.pieces) return { ok: false, why: 'That piece is not one of this video.' };
  const size = /^\d{1,8}$/.test(f.size.trim()) ? Number(f.size.trim()) : 0;
  if (size !== plainSizeOf(s, n) + LOCK_OVERHEAD) return { ok: false, why: 'That piece is not the size it should be.' };
  if (getSurveyVideoSlotsXBySendIdN(d.db, [s.id, n]) !== undefined) return { ok: false, why: 'That piece has already been sent.' };
  const id = d.newId();
  let key = `${INCOMING_PREFIX}${s.id}/v${String(n)}-${id}.lock`;
  const until = Math.min(Date.parse(now) + VIDEO_SLOT_MINUTES * 60_000, Date.parse(s.expires_at));
  let remote: IncomingTarget | null;
  try {
    remote = await store.incomingTarget(key, size, until);
  } catch (e) {
    console.error(`video upload: the store gave no upload address, so pieces go through the website: ${failureWords(e)}`);
    remote = null;
    key = key.replace(/\.lock$/, SITE_SUFFIX);
  }
  insertSurveyVideoSlots(d.db, [id, s.id, n, key, size, now]);
  const target = remote ?? { url: `/portal/building/video/${s.id}/slot/${id}`, headers: {} };
  return { ok: true, slot: id, url: target.url, headers: target.headers };
}

type Slot = { id: string; send_id: string; n: number; staged_key: string; byte_size: number; issued_at: string; kept: number };
const slotOf = (d: EvidenceDeps, send_id: string, slot_id: string) => getSurveyVideoSlotsIdSendIdByIdSendId<Slot>(d.db, [slot_id, send_id]);

/** A locked piece through our own route: on a copy that is not the test website, or a slot the store gave no address. */
export async function putVideoLocal(d: EvidenceDeps, store: FsObjectStore, actor: Actor, send_id: string, slot_id: string, bytes: Uint8Array): Promise<UploadResult<object>> {
  const s = ownSend(d, actor, send_id);
  const slot = slotOf(d, s.id, slot_id);
  if (slot === undefined) return { ok: false, why: 'That piece is not one of this video.' };
  if (store.incomingOrigin !== null && !slot.staged_key.endsWith(SITE_SUFFIX)) return { ok: false, why: 'Videos go straight to the file store here, not through this page.' };
  if (slot.kept === 1) return { ok: false, why: 'That piece has already come.' };
  if (d.now() > new Date(Date.parse(slot.issued_at) + VIDEO_SLOT_MINUTES * 60_000).toISOString()) return { ok: false, why: 'That piece’s place has run out of time. Send the video again.' };
  if (bytes.length !== slot.byte_size) return { ok: false, why: 'That piece is not the size it said it was.' };
  await store.putIncoming(slot.staged_key, bytes);
  return { ok: true };
}

/** One piece has come: open it, check it is the right size, keep it encrypted, remove the locked piece. Twice: the same. */
export async function finishPiece(d: EvidenceDeps, store: FsObjectStore, actor: Actor, send_id: string, slot_id: string): Promise<UploadResult<{ readonly n: number }>> {
  const s = ownSend(d, actor, send_id);
  const slot = slotOf(d, s.id, slot_id);
  if (slot === undefined) return { ok: false, why: 'That piece is not one of this video.' };
  if (slot.kept === 1) return { ok: true, n: slot.n };
  const locked = await store.takeIncoming(slot.staged_key);
  if (locked === null) return { ok: false, why: 'That piece has not arrived yet. Send the video again.' };
  const refuse = async (why: string): Promise<{ ok: false; why: string }> => { await store.dropIncoming(slot.staged_key); return { ok: false, why }; };
  if (locked.length !== slot.byte_size) return refuse('That piece is not the size it said it was.');
  if (!store.canSeal) return refuse(NO_KEY);
  const plain = unlockPhoto(store.openBytes(Buffer.from(s.private_key_sealed, 'base64')), locked);
  if (plain === null) return refuse('That piece could not be opened. Send the video again.');
  if (plain.length !== plainSizeOf(s, slot.n)) return refuse('That piece is not the size it should be.');
  await store.putSealed(pieceKey(s.id, slot.n), plain);
  await store.dropIncoming(slot.staged_key);
  insertSurveyVideoPieces(d.db, [s.id, slot.n, slot.id, plain.length, createHash('sha256').update(plain).digest('hex'), d.now()]);
  return { ok: true, n: slot.n };
}

/* ================================================================== *
 * THE VIDEO, CHECKED AND KEPT
 * ================================================================== */

/** The video's bytes across its sealed pieces: read a range, and write a patch back to the pieces it touches. */
class Pieces {
  readonly #store: FsObjectStore;
  readonly #send: string;
  readonly size: number;
  readonly #plain = new Map<number, Buffer>();
  readonly dirty = new Set<number>();
  constructor(store: FsObjectStore, send: string, size: number) { this.#store = store; this.#send = send; this.size = size; }
  async #piece(n: number): Promise<Buffer> {
    let b = this.#plain.get(n);
    if (b === undefined) { b = Buffer.from(await this.#store.getSealed(pieceKey(this.#send, n))); this.#plain.set(n, b); }
    return b;
  }
  async read(offset: number, length: number): Promise<Buffer> {
    const end = Math.min(this.size, offset + length);
    const out: Buffer[] = [];
    for (let at = offset; at < end;) {
      const n = Math.floor(at / VIDEO_PIECE_BYTES) + 1;
      const within = at - (n - 1) * VIDEO_PIECE_BYTES;
      const piece = await this.#piece(n);
      const take = Math.min(piece.length - within, end - at);
      out.push(piece.subarray(within, within + take));
      at += take;
    }
    return Buffer.concat(out);
  }
  async write(offset: number, bytes: Buffer): Promise<void> {
    for (let i = 0; i < bytes.length;) {
      const at = offset + i;
      const n = Math.floor(at / VIDEO_PIECE_BYTES) + 1;
      const within = at - (n - 1) * VIDEO_PIECE_BYTES;
      const piece = await this.#piece(n);
      const take = Math.min(piece.length - within, bytes.length - i);
      bytes.copy(piece, within, i, i + take);
      this.dirty.add(n);
      i += take;
    }
  }
  async save(): Promise<void> { for (const n of this.dirty) await this.#store.putSealed(pieceKey(this.#send, n), this.#plain.get(n)!); }
}

/** A box's size and type at `offset`, or null past the end. */
async function boxAt(r: Pieces, offset: number): Promise<{ type: string; size: number; header: number } | null> {
  if (offset + 8 > r.size) return null;
  const h = await r.read(offset, 16);
  let size = h.readUInt32BE(0);
  const type = h.subarray(4, 8).toString('latin1');
  let header = 8;
  if (size === 1) { if (h.length < 16) return null; size = Number(h.readBigUInt64BE(8)); header = 16; } else if (size === 0) size = r.size - offset;
  if (size < header || offset + size > r.size) return null;
  return { type, size, header };
}

/** The first child box of this type inside a container's body. */
function child(body: Buffer, type: string): { start: number; end: number } | null {
  for (let at = 0; at + 8 <= body.length;) {
    const size = body.readUInt32BE(at);
    if (size < 8 || at + size > body.length) return null;
    if (body.subarray(at + 4, at + 8).toString('latin1') === type) return { start: at, end: at + size };
    at += size;
  }
  return null;
}

/** ISO 6709 co-ordinates as phones write them, e.g. "+51.5072-000.1276+011.000/". */
const ISO6709 = /[+-]\d{2}\.\d{2,}[+-]\d{3}\.\d{2,}(?:[+-]\d+(?:\.\d+)?)?\/?/g;

/** Blank every place in the header: each digit becomes 0, so its length and every offset in the file stay as they were. */
export function blankPlaces(moov: Buffer): number {
  const text = moov.toString('latin1');
  let n = 0;
  for (const m of text.matchAll(ISO6709)) {
    const at = m.index ?? 0;
    for (let i = 0; i < m[0].length; i++) if (moov[at + i]! >= 0x30 && moov[at + i]! <= 0x39) moov[at + i] = 0x30;
    n++;
  }
  return n;
}

/** Every piece has come: check the video, blank its places, keep it. A refusal removes its pieces. */
export async function finishVideo(d: EvidenceDeps, store: FsObjectStore, actor: Actor, send_id: string): Promise<UploadResult<{ readonly video: string; readonly minutes: number }>> {
  const s = ownSend(d, actor, send_id);
  const done = outcomeOf(d, s.id);
  if (done?.outcome === 'KEPT') return { ok: true, video: s.id, minutes: Math.round((getSurveyVideosMsById<{ ms: number }>(d.db, [s.id])?.ms ?? 0) / 60_000) };
  if (done !== undefined) return { ok: false, why: done.why ?? 'That video was not kept.' };
  const have = getSurveyVideoPiecesCountBySendId<{ n: number }>(d.db, [s.id])!.n;
  if (have < s.pieces) return { ok: false, why: `${String(s.pieces - have)} of the video’s ${String(s.pieces)} pieces have not come yet.` };
  const refuse = async (why: string): Promise<{ ok: false; why: string }> => {
    for (let n = 1; n <= s.pieces; n++) await store.dropVideoPiece(pieceKey(s.id, n));
    insertSurveyVideoOutcomes3(d.db, [s.id, why, d.now()]);
    return { ok: false, why };
  };
  const r = new Pieces(store, s.id, s.byte_size);
  const first = await boxAt(r, 0);
  if (first === null || first.type !== 'ftyp') return refuse('That is not a video we can read. Send an MP4 or a phone’s own video (MOV).');
  const brand = (await r.read(first.header, 4)).toString('latin1');
  const contentType = brand === 'qt  ' ? 'video/quicktime' : 'video/mp4';
  let moov: { offset: number; size: number; header: number } | null = null;
  for (let at = 0, guard = 0; at < r.size && guard < 10_000; guard++) {
    const b = await boxAt(r, at);
    if (b === null) break;
    if (b.type === 'moov') { moov = { offset: at, size: b.size, header: b.header }; break; }
    at += b.size;
  }
  if (moov === null) return refuse('That video has no header we can read. Send it again, or record it again on the phone.');
  if (moov.size > 64 * 1024 * 1024) return refuse('That video’s header is too big to check. Send a shorter video.');
  const body = await r.read(moov.offset + moov.header, moov.size - moov.header);
  const mvhd = child(body, 'mvhd');
  if (mvhd === null) return refuse('That video does not say how long it is. Record it again on the phone.');
  const v = body[mvhd.start + 8];
  const timescale = v === 1 ? body.readUInt32BE(mvhd.start + 28) : body.readUInt32BE(mvhd.start + 20);
  const duration = v === 1 ? Number(body.readBigUInt64BE(mvhd.start + 32)) : body.readUInt32BE(mvhd.start + 24);
  if (timescale === 0) return refuse('That video does not say how long it is. Record it again on the phone.');
  const ms = Math.round((duration / timescale) * 1000);
  if (ms > MAX_VIDEO_MS + GRACE_MS) return refuse(`That video is ${String(Math.round(ms / 60_000))} minutes long. The most is 10 minutes: film the building in two or three parts.`);
  const blanked = blankPlaces(body);
  if (blanked > 0) { await r.write(moov.offset + moov.header, body); await r.save(); }
  d.db.tx(() => {
    insertSurveyVideos(d.db, [s.id, s.job_id, contentType, s.byte_size, ms, s.pieces, blanked, s.note, actor.id, d.now()]);
    insertSurveyVideoOutcomes2(d.db, [s.id, d.now()]);
    d.audit.append({ at: d.now(), kind: 'SURVEY_EVIDENCE_ADDED', outcome: 'ALLOWED', actor_id: actor.id, actor_role: actor.role, object_type: 'surveyor_job', object_id: s.job_id,
      detail: { video: s.id, item: 'VIDEO' } });
  });
  return { ok: true, video: s.id, minutes: Math.round(ms / 60_000) };
}

/* ================================================================== *
 * VIDEOS: WHO SEES THEM, AND PLAYING THEM BACK
 * ================================================================== */

export type VideoRow = { readonly id: string; readonly content_type: string; readonly byte_size: number; readonly duration_ms: number; readonly note: string | null; readonly taken_at: string; readonly taken_by_name: string };

export function videosOf(db: EvidenceDeps['db'], job_id: string): VideoRow[] {
  return listSurveyVideosIdContentTypeByJobIdVideoId<VideoRow>(db, [job_id]);
}

/** The client of that company, or staff who may read the job (the assigned surveyor, Admin, Sales). Null when not shown. */
function mayWatch(d: EvidenceDeps, actor: Actor, video_id: string): { size: number; pieces: number; content_type: string } | null {
  const v = getSurveyVideosJobIdBusinessIdById<{ job_id: string; business_id: string; byte_size: number; pieces: number; content_type: string; withdrawn: number }>(d.db, [video_id]);
  if (v === undefined) return null;
  if (actor.role === 'CLIENT') {
    if (actor.business_id !== v.business_id) throw new NotAuthorised('survey_evidence.read', 'surveyor_job');
  } else {
    packJob(d.db, actor, v.job_id); // read under surveyor_job.read: the assigned surveyor, Admin, Sales
  }
  return v.withdrawn === 1 ? null : { size: v.byte_size, pieces: v.pieces, content_type: v.content_type };
}

/**
 * A range of a video, at most one piece's worth: what a browser asks for to play and to seek. With no range asked, the
 * start of the video, as a range. Null when there is nothing to show; 416 words when the range is not in the video.
 */
export async function videoBytes(d: EvidenceDeps, store: FsObjectStore, actor: Actor, video_id: string, range: string | undefined):
  Promise<{ start: number; end: number; total: number; bytes: Buffer; content_type: string } | 'BAD_RANGE' | null> {
  const v = mayWatch(d, actor, video_id);
  if (v === null) return null;
  let start = 0;
  let end = v.size - 1;
  if (range !== undefined && range.trim() !== '') {
    const m = /^bytes=(\d*)-(\d*)$/.exec(range.trim());
    if (m === null || (m[1] === '' && m[2] === '')) return 'BAD_RANGE';
    if (m[1] === '') { start = Math.max(0, v.size - Number(m[2])); } else { start = Number(m[1]); if (m[2] !== '') end = Math.min(end, Number(m[2])); }
    if (start >= v.size || start > end) return 'BAD_RANGE';
  }
  end = Math.min(end, start + VIDEO_PIECE_BYTES - 1);
  const bytes = await new Pieces(store, video_id, v.size).read(start, end - start + 1);
  return { start, end, total: v.size, bytes, content_type: v.content_type };
}

/** A video taken back: by the client of that company, or by Admin or Sales with a reason. It is then shown to nobody. */
export function withdrawVideo(d: EvidenceDeps, actor: Actor, video_id: string, reason: string): UploadResult<object> {
  const v = getSurveyVideosBusinessIdById<{ business_id: string }>(d.db, [video_id]);
  if (v === undefined) return { ok: false, why: 'That video is not one of ours.' };
  const own = actor.role === 'CLIENT' && actor.business_id === v.business_id;
  if (!own) authorise(actor, 'email.queue', { type: 'email', id: v.business_id, business_id: v.business_id });
  const why = own && reason.trim() === '' ? 'Taken back by the client.' : reason.trim().replace(/\s+/g, ' ');
  if (why === '' || why.length > 300) return { ok: false, why: 'Say why the video is taken back, in under 300 characters.' };
  if (getSurveyVideoWithdrawalsXByVideoId(d.db, [video_id]) !== undefined) return { ok: false, why: 'That video has already been taken back.' };
  insertSurveyVideoWithdrawals(d.db, [video_id, actor.id, why, d.now()]);
  return { ok: true };
}

/** Remove every video send not finished within a day: its locked and its kept pieces. Recorded ABANDONED, once. */
export async function sweepVideos(d: Pick<EvidenceDeps, 'db' | 'now'>, store: FsObjectStore, limit = 10): Promise<number> {
  const before = new Date(Date.parse(d.now()) - VIDEO_ABANDON_HOURS * 3_600_000).toISOString();
  const stale = listSurveyVideoSendsIdPiecesBySendIdCreatedAt<{ id: string; pieces: number }>(d.db, [before, limit]);
  for (const s of stale) {
    for (const slot of listSurveyVideoSlotsStagedKeyBySendId<{ staged_key: string }>(d.db, [s.id])) await store.dropIncoming(slot.staged_key);
    for (let n = 1; n <= s.pieces; n++) await store.dropVideoPiece(pieceKey(s.id, n));
    insertSurveyVideoOutcomes(d.db, [s.id, 'Never finished: removed after a day.', d.now()]);
  }
  return stale.length;
}
