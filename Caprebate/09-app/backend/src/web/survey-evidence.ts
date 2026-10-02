/**
 * THE SURVEY'S EVIDENCE FROM THE CLIENT — the photo checklist, the recorded walkthrough call, and how the surveyor
 * inspected. 2 October 2026; the mock-up Lakhbir approved that day.
 *
 * Lakhbir: "a recorded phone walkthrough … and add the option for … a guided photo checklist in the client portal".
 * Asked on 2 Oct 2026: the photos are KEPT, FOR TESTING ("Keep them, test only"); the walkthrough is a RECORDED ZOOM
 * CALL ("Recorded Zoom call") — the test website takes at most 4.5 MB a request, so a 20–40 minute phone video cannot be
 * uploaded, and a page may run no script to send it in pieces.
 *
 * THE PHOTOS. A client of the company takes one photo at a time for a checklist item (src/web/survey-checklist.ts),
 * saying nobody is in it. It must be a JPEG or PNG — read from its first bytes, not its name — of at most 4.4 MB. Its
 * hidden details are taken out before it is kept: a JPEG's EXIF, XMP and IPTC blocks and comments (where the phone was,
 * which phone, when), a PNG's text and EXIF chunks. Then it is ENCRYPTED with the store's key (AES-256-GCM, the key a
 * kept original uses) and kept under survey-photos/; with no key it is refused, and the page says why. The row keeps
 * where it is, its type, size and SHA-256, who took it, when, and the client's "nobody is in it". A photo is never
 * edited or deleted here: it is taken back (withdrawn), by the client or by staff, and is then shown to nobody.
 *
 * MANY AT ONCE (2 Oct 2026, Lakhbir: "not only … individually but also in one go. admin can then split"). A client
 * may send up to 15 photos in one go, with one "nobody is in them", up to 4.4 MB in all (the test website's limit is
 * for the whole send). Each is checked and cleaned like a single one; if any is refused, none is kept, and the page
 * says which. They are kept under UNSORTED until Admin or Sales put each under a checklist item (`sortPhotos`, migration
 * 075): the newest move is the photo's item. One that is not useful is taken back.
 *
 * WHO SEES A PHOTO. The client of that company; Admin and Sales; and the surveyor assigned to the job — every request
 * asked of the rules (`surveyor_job.read` for staff). Lakhbir's waiver for testing names Admin, Sales, the data
 * protection officer, the client and the assigned surveyor, and the 7-year keep (SURVEY_PHOTOS below). Real use waits
 * for the officer and the privacy notice.
 *
 * THE WALKTHROUGH CALL. The client asks for one in their portal (a message to us). Admin or Sales books it as a video
 * call at one of their free times — they own client calls in the diary, and a surveyor is kept out of the diary on
 * purpose (src/authz.ts, booking.read). It is marked as this job's walkthrough, so its Zoom meeting is made to RECORD TO
 * ZOOM'S CLOUD (src/connectors/zoom.ts). After the call, the assigned surveyor, Admin or Sales fetches the recording's
 * link, passcode and length from Zoom, and they are kept; the video stays with Zoom. Opening it is recorded.
 *
 * HOW THE SURVEYOR INSPECTED — desktop with the client's evidence, a live video survey, or a site visit — is said by
 * the assigned surveyor in chapter 2, and goes in the approved report.
 */
import { createHash } from 'node:crypto';
import type { App } from '../app.ts';
import type { Db } from '../db.ts';
import type { AuditLog } from '../audit.ts';
import { authorise, can, NotAuthorised, type Actor } from '../authz.ts';
import type { FsObjectStore } from './objectstore.ts';
import { packJob } from './surveyor.ts';
import { checklistFor, type ChecklistItem } from './survey-checklist.ts';
import { postClientMessage } from './messages.ts';
import { isBookable, SLOT_MINUTES } from './schedule.ts';
import { reconcileVideoMeeting, zoomDeps } from './video-calls.ts';
import { sendVideoInvite } from './booking-invite.ts';
import { zoomRecording } from '../connectors/zoom.ts';

export type EvidenceDeps = { db: Db; audit: AuditLog; now: () => string; newId: () => string };
export type Result = { readonly ok: true; readonly id: string } | { readonly ok: false; readonly why: string; readonly field?: string };

/** Lakhbir's decision for testing, 2 October 2026, as asked. */
export const SURVEY_PHOTOS = Object.freeze({
  kept_for_testing: true,
  waiver_record: 'On 2 Oct 2026 Lakhbir was asked if we keep survey photos before the data officer has said. ' +
    'The answer: "Keep them, test only". Kept 7 years, encrypted. Opened by Admin, Sales, the DPO, the client and the surveyor.',
  retention_days: 2557,
});

/** Under the test website's 4.5 MB a request, with room for the form around it. */
export const MAX_PHOTO_BYTES = 4_400_000;

/* ================================================================== *
 * A PHOTO'S HIDDEN DETAILS, TAKEN OUT
 * ================================================================== */

export type Sniffed = 'image/jpeg' | 'image/png' | null;

export function sniffImage(b: Uint8Array): Sniffed {
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  const png = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (b.length > 8 && png.every((x, i) => b[i] === x)) return 'image/png';
  return null;
}

/**
 * A JPEG without its EXIF (APP1, which carries GPS and the camera), XMP, IPTC (APP13), other application blocks
 * (APP2–APP15, except the ICC colour profile in APP2) and comments. The image data is copied as it is. Null if the
 * file is not a JPEG we can walk to its image data.
 */
export function stripJpeg(b: Uint8Array): Uint8Array | null {
  if (sniffImage(b) !== 'image/jpeg') return null;
  const out: number[] = [0xff, 0xd8];
  let i = 2;
  while (i + 4 <= b.length) {
    if (b[i] !== 0xff) return null;
    const marker = b[i + 1] ?? 0;
    if (marker === 0xff) { i++; continue; }
    if (marker === 0xda) { for (let k = i; k < b.length; k++) out.push(b[k] ?? 0); return new Uint8Array(out); } // start of scan: the rest is image
    if (marker === 0xd9) return null;
    const len = ((b[i + 2] ?? 0) << 8) | (b[i + 3] ?? 0);
    if (len < 2 || i + 2 + len > b.length) return null;
    const isIcc = marker === 0xe2 && Buffer.from(b.subarray(i + 4, i + 15)).toString('latin1') === 'ICC_PROFILE';
    const drop = (marker >= 0xe1 && marker <= 0xef && !isIcc) || marker === 0xfe;
    if (!drop) for (let k = i; k < i + 2 + len; k++) out.push(b[k] ?? 0);
    i += 2 + len;
  }
  return null;
}

/** A PNG without its text, EXIF and time chunks. Null if it is not a PNG we can walk to its end. */
export function stripPng(b: Uint8Array): Uint8Array | null {
  if (sniffImage(b) !== 'image/png') return null;
  const parts: Uint8Array[] = [b.subarray(0, 8)];
  let i = 8;
  while (i + 12 <= b.length) {
    const len = (((b[i] ?? 0) << 24) >>> 0) + ((b[i + 1] ?? 0) << 16) + ((b[i + 2] ?? 0) << 8) + (b[i + 3] ?? 0);
    const type = Buffer.from(b.subarray(i + 4, i + 8)).toString('latin1');
    const end = i + 12 + len;
    if (end > b.length) return null;
    if (!['tEXt', 'zTXt', 'iTXt', 'eXIf', 'tIME'].includes(type)) parts.push(b.subarray(i, end));
    i = end;
    if (type === 'IEND') return new Uint8Array(Buffer.concat(parts));
  }
  return null;
}

/* ================================================================== *
 * THE CHECKLIST, AS THE CLIENT HAS DONE IT
 * ================================================================== */

export type EvidenceJob = { readonly id: string; readonly business_id: string; readonly sector: string; readonly place: string; readonly surveyor_id: string | null };

/** The company's survey jobs, with the property each pack is for. */
export function jobsOfBusiness(db: Db, business_id: string): EvidenceJob[] {
  return db.all<EvidenceJob>(
    "SELECT j.id, j.business_id, b.sector, COALESCE(p.label, b.name) AS place, j.surveyor_id FROM surveyor_jobs j JOIN businesses b ON b.id = j.business_id " +
      'LEFT JOIN survey_packs sp ON sp.job_id = j.id LEFT JOIN properties p ON p.id = sp.property_id WHERE j.business_id = ? ORDER BY j.created_at, j.id', [business_id]);
}

function jobRow(db: Db, job_id: string): EvidenceJob | null {
  return db.get<EvidenceJob>(
    "SELECT j.id, j.business_id, b.sector, COALESCE(p.label, b.name) AS place, j.surveyor_id FROM surveyor_jobs j JOIN businesses b ON b.id = j.business_id " +
      'LEFT JOIN survey_packs sp ON sp.job_id = j.id LEFT JOIN properties p ON p.id = sp.property_id WHERE j.id = ?', [job_id]) ?? null;
}

/** A client of the job's own company — the only person who adds photos and marks items. */
export function clientOf(db: Db, actor: Actor, job_id: string): EvidenceJob {
  const j = jobRow(db, job_id);
  if (j === null || actor.role !== 'CLIENT' || actor.business_id !== j.business_id) throw new NotAuthorised('survey_evidence.add', 'surveyor_job');
  return j;
}

export type PhotoRow = { readonly id: string; readonly item_key: string; readonly content_type: string; readonly byte_size: number; readonly note: string | null; readonly taken_at: string; readonly taken_by_name: string };
export type ItemView = ChecklistItem & {
  readonly photos: readonly PhotoRow[];
  readonly mark: 'NOT_HERE' | 'NOT_SAFE' | null;
  readonly done: boolean;
};
/** `photos` counts the photos under a checklist item; `unsorted` those sent in one go and not yet sorted. */
export type ChecklistView = { readonly job: EvidenceJob; readonly items: readonly ItemView[]; readonly done: number; readonly marked: number; readonly total: number; readonly photos: number; readonly unsorted: number };

/** The item key of a photo sent in one go, before Admin or Sales sort it. Never a checklist item. */
export const UNSORTED = 'UNSORTED';

export function photosOf(db: Db, job_id: string): PhotoRow[] {
  return db.all<PhotoRow>(
    'SELECT p.id, COALESCE((SELECT s.item_key FROM survey_photo_sorts s WHERE s.photo_id = p.id ORDER BY s.at DESC, s.rowid DESC LIMIT 1), p.item_key) AS item_key, ' +
      'p.content_type, p.byte_size, p.note, p.taken_at, u.display_name AS taken_by_name FROM survey_photos p JOIN users u ON u.id = p.taken_by ' +
      'LEFT JOIN survey_photo_withdrawals w ON w.photo_id = p.id WHERE p.job_id = ? AND w.photo_id IS NULL ORDER BY p.taken_at, p.rowid', [job_id]);
}

export function checklistView(db: Db, job_id: string): ChecklistView | null {
  const job = jobRow(db, job_id);
  if (job === null) return null;
  const photos = photosOf(db, job_id);
  const marks = new Map(db.all<{ item_key: string; mark: string }>(
    'SELECT m.item_key, m.mark FROM survey_checklist_marks m WHERE m.job_id = ? AND m.rowid = (SELECT x.rowid FROM survey_checklist_marks x WHERE x.job_id = m.job_id AND x.item_key = m.item_key ORDER BY x.at DESC, x.rowid DESC LIMIT 1)',
    [job_id]).map((r) => [r.item_key, r.mark] as const));
  const items = checklistFor(job.sector).map((i): ItemView => {
    const ps = photos.filter((p) => p.item_key === i.key);
    const m = marks.get(i.key);
    const mark = m === 'NOT_HERE' || m === 'NOT_SAFE' ? m : null;
    return { ...i, photos: ps, mark, done: ps.length > 0 || mark !== null };
  });
  return { job, items, done: items.filter((i) => i.photos.length > 0).length, marked: items.filter((i) => i.photos.length === 0 && i.mark !== null).length, total: items.length,
    photos: items.reduce((a, i) => a + i.photos.length, 0), unsorted: photos.filter((p) => p.item_key === UNSORTED).length };
}

/** The photos each pack line has, by the fixture list's id: how many, and from which items. */
export function evidenceByLine(db: Db, job_id: string): Map<string, { count: number; items: string[] }> {
  const v = checklistView(db, job_id);
  const out = new Map<string, { count: number; items: string[] }>();
  if (v === null) return out;
  for (const i of v.items) {
    if (i.photos.length === 0) continue;
    for (const l of i.lines) {
      const e = out.get(l) ?? { count: 0, items: [] };
      e.count += i.photos.length;
      if (!e.items.includes(i.title)) e.items.push(i.title);
      out.set(l, e);
    }
  }
  return out;
}

/* ================================================================== *
 * THE CLIENT'S ACTIONS
 * ================================================================== */

export async function addPhoto(
  d: EvidenceDeps, store: FsObjectStore, actor: Actor,
  f: { job_id: string; item_key: string; bytes: Uint8Array; nobody: string; note: string },
): Promise<Result> {
  const job = clientOf(d.db, actor, f.job_id);
  const item = checklistFor(job.sector).find((i) => i.key === f.item_key);
  if (item === undefined) return { ok: false, why: 'That is not one of the checklist’s items.' };
  if (f.nobody !== 'yes') return { ok: false, field: 'nobody', why: 'Tick to say nobody is in the photo: no patients, residents, staff, screens or records.' };
  if (f.bytes.length === 0) return { ok: false, field: 'file', why: 'Choose or take a photo first.' };
  if (f.bytes.length > MAX_PHOTO_BYTES) return { ok: false, field: 'file', why: 'That photo is too big. The most is 4.4 MB. Take it again at a smaller size, or send a screenshot of it.' };
  const c = cleaned(f.bytes);
  if (!c.ok) return { ok: false, field: 'file', why: c.why };
  const note = f.note.trim().replace(/\s+/g, ' ');
  if (note.length > 500) return { ok: false, field: 'note', why: 'Keep the note under 500 characters.' };
  if (!store.canSeal) return { ok: false, why: NO_KEY };
  return { ok: true, id: await keep(d, store, actor, job.id, item.key, c, note) };
}

export const NO_KEY = 'We cannot keep photos yet: the key that encrypts them is not set. We have been told.';
export type Cleaned = { readonly ok: true; readonly type: 'image/jpeg' | 'image/png'; readonly bytes: Uint8Array } | { readonly ok: false; readonly why: string };

/** A photo known by its first bytes, with its hidden details taken out. */
export function cleaned(bytes: Uint8Array): Cleaned {
  const type = sniffImage(bytes);
  if (type === null) return { ok: false, why: 'Send a photo as a JPEG or PNG. An iPhone turns its photos into JPEG when you choose one here.' };
  const clean = type === 'image/jpeg' ? stripJpeg(bytes) : stripPng(bytes);
  if (clean === null) return { ok: false, why: 'That photo could not be read. Take it again, please.' };
  return { ok: true, type, bytes: clean };
}

/** Encrypt it, keep it, and say so in the audit log. */
export async function keep(d: EvidenceDeps, store: FsObjectStore, actor: Actor, job_id: string, item_key: string, c: Extract<Cleaned, { ok: true }>, note: string): Promise<string> {
  const id = d.newId();
  const key = `survey-photos/${job_id}/${id}.${c.type === 'image/jpeg' ? 'jpg' : 'png'}`;
  await store.putSealed(key, c.bytes);
  const at = d.now();
  d.db.run('INSERT INTO survey_photos (id, job_id, item_key, object_key, content_type, byte_size, sha256, note, taken_by, taken_at, nobody_in_it) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)',
    [id, job_id, item_key, key, c.type, c.bytes.length, createHash('sha256').update(c.bytes).digest('hex'), note === '' ? null : note, actor.id, at]);
  d.audit.append({ at, kind: 'SURVEY_EVIDENCE_ADDED', outcome: 'ALLOWED', actor_id: actor.id, actor_role: actor.role, object_type: 'surveyor_job', object_id: job_id,
    detail: { photo: id, item: item_key } });
  return id;
}

/** The most a client sends in one go. */
export const MAX_PHOTOS_AT_ONCE = 15;

/**
 * Several photos in one go, from a client of that company, with one "nobody is in them". All are checked first: if
 * any is refused, none is kept, and the words say which (by its place in the list, 1 being the first). They are kept
 * under UNSORTED, for Admin or Sales to sort.
 */
export async function addPhotos(
  d: EvidenceDeps, store: FsObjectStore, actor: Actor,
  f: { job_id: string; files: readonly Uint8Array[]; nobody: string; note: string },
): Promise<{ readonly ok: true; readonly ids: readonly string[] } | { readonly ok: false; readonly why: string; readonly field?: string }> {
  const job = clientOf(d.db, actor, f.job_id);
  if (f.nobody !== 'yes') return { ok: false, field: 'nobody', why: 'Tick to say nobody is in the photos: no patients, residents, staff, screens or records.' };
  const files = f.files.filter((b) => b.length > 0);
  if (files.length === 0) return { ok: false, field: 'files', why: 'Choose your photos first.' };
  if (files.length > MAX_PHOTOS_AT_ONCE) return { ok: false, field: 'files', why: `Send at most ${String(MAX_PHOTOS_AT_ONCE)} photos at a time.` };
  if (files.reduce((a, b) => a + b.length, 0) > MAX_PHOTO_BYTES) return { ok: false, field: 'files', why: 'Those photos are too big together. The most is 4.4 MB in one go. Send fewer at a time.' };
  const all: Extract<Cleaned, { ok: true }>[] = [];
  for (const [k, b] of files.entries()) {
    const c = cleaned(b);
    if (!c.ok) return { ok: false, field: 'files', why: `Photo ${String(k + 1)}: ${c.why} None was sent.` };
    all.push(c);
  }
  const note = f.note.trim().replace(/\s+/g, ' ');
  if (note.length > 500) return { ok: false, field: 'note', why: 'Keep the note under 500 characters.' };
  if (!store.canSeal) return { ok: false, why: NO_KEY };
  const ids: string[] = [];
  for (const c of all) ids.push(await keep(d, store, actor, job.id, UNSORTED, c, note));
  return { ok: true, ids };
}

export function markItem(d: EvidenceDeps, actor: Actor, f: { job_id: string; item_key: string; mark: string }): Result {
  const job = clientOf(d.db, actor, f.job_id);
  if (!checklistFor(job.sector).some((i) => i.key === f.item_key)) return { ok: false, why: 'That is not one of the checklist’s items.' };
  if (!['NOT_HERE', 'NOT_SAFE', 'CLEARED'].includes(f.mark)) return { ok: false, why: 'Choose “not in our building” or “not safe or not ours”.' };
  const id = d.newId();
  d.db.run('INSERT INTO survey_checklist_marks (id, job_id, item_key, mark, by_user, at) VALUES (?, ?, ?, ?, ?, ?)', [id, job.id, f.item_key, f.mark, actor.id, d.now()]);
  return { ok: true, id };
}

/** A photo taken back: by the client of that company, or by Admin or Sales with a reason. It is then shown to nobody. */
export function withdrawPhoto(d: EvidenceDeps, actor: Actor, photo_id: string, reason: string): Result {
  const p = d.db.get<{ job_id: string; business_id: string }>('SELECT p.job_id, j.business_id FROM survey_photos p JOIN surveyor_jobs j ON j.id = p.job_id WHERE p.id = ?', [photo_id]);
  if (p === undefined) return { ok: false, why: 'That photo is not one of ours.' };
  const own = actor.role === 'CLIENT' && actor.business_id === p.business_id;
  if (!own) authorise(actor, 'email.queue', { type: 'email', id: p.business_id, business_id: p.business_id });
  const why = own && reason.trim() === '' ? 'Taken back by the client.' : reason.trim().replace(/\s+/g, ' ');
  if (why === '' || why.length > 300) return { ok: false, field: 'reason', why: 'Say why the photo is taken back, in under 300 characters.' };
  if (d.db.get('SELECT 1 AS x FROM survey_photo_withdrawals WHERE photo_id = ?', [photo_id]) !== undefined) return { ok: false, why: 'That photo has already been taken back.' };
  d.db.run('INSERT INTO survey_photo_withdrawals (photo_id, by_user, reason, at) VALUES (?, ?, ?, ?)', [photo_id, actor.id, why, d.now()]);
  return { ok: true, id: photo_id };
}

/**
 * A photo's bytes, for the client of that company or for staff who may read the job (the assigned surveyor, Admin,
 * Sales). A withdrawn photo is shown to nobody. Null when there is nothing to show; a refusal throws.
 */
export async function photoBytes(d: EvidenceDeps, store: FsObjectStore, actor: Actor, photo_id: string): Promise<{ bytes: Buffer; content_type: string } | null> {
  const p = d.db.get<{ job_id: string; business_id: string; object_key: string; content_type: string; withdrawn: number }>(
    'SELECT p.job_id, j.business_id, p.object_key, p.content_type, (w.photo_id IS NOT NULL) AS withdrawn FROM survey_photos p JOIN surveyor_jobs j ON j.id = p.job_id ' +
      'LEFT JOIN survey_photo_withdrawals w ON w.photo_id = p.id WHERE p.id = ?', [photo_id]);
  if (p === undefined) return null;
  if (actor.role === 'CLIENT') {
    if (actor.business_id !== p.business_id) throw new NotAuthorised('survey_evidence.read', 'surveyor_job');
  } else {
    const { obj } = packJob(d.db, actor, p.job_id);
    authorise(actor, 'surveyor_job.read', obj);
  }
  if (p.withdrawn === 1) return null;
  return { bytes: await store.getSealed(p.object_key), content_type: p.content_type };
}

/* ================================================================== *
 * SORTING PHOTOS SENT IN ONE GO — Admin or Sales
 * ================================================================== */

/** The choice that takes a photo back while sorting. */
export const TAKE_BACK = 'TAKE_BACK';

/** The photos sent in one go and not yet sorted, oldest first. */
export function unsortedOf(db: Db, job_id: string): PhotoRow[] {
  return photosOf(db, job_id).filter((p) => p.item_key === UNSORTED);
}

/**
 * Put each chosen photo under a checklist item, or take it back as not useful. Admin or Sales only. `choices` maps a
 * photo to an item key, TAKE_BACK, or '' (leave it for now). Every choice is checked first; if any is wrong, nothing
 * is saved. Each move is kept under the sorter's name.
 */
export function sortPhotos(d: EvidenceDeps, actor: Actor, job_id: string, choices: Readonly<Record<string, string>>): { readonly ok: true; readonly sorted: number; readonly taken_back: number } | { readonly ok: false; readonly why: string } {
  const { job } = packJob(d.db, actor, job_id);
  authorise(actor, 'email.queue', { type: 'email', id: job.business_id, business_id: job.business_id });
  const keys = new Set(checklistFor(job.sector).map((i) => i.key));
  const live = new Map(photosOf(d.db, job_id).map((p) => [p.id, p] as const));
  const moves = Object.entries(choices).filter(([, to]) => to !== '');
  for (const [photo, to] of moves) {
    if (!live.has(photo)) return { ok: false, why: 'One of those photos is not this survey’s, or was taken back. Nothing was saved.' };
    if (to !== TAKE_BACK && !keys.has(to)) return { ok: false, why: 'Choose an item from the checklist for each photo. Nothing was saved.' };
  }
  let sorted = 0;
  let taken_back = 0;
  d.db.tx(() => {
    for (const [photo, to] of moves) {
      if (to === TAKE_BACK) {
        d.db.run('INSERT INTO survey_photo_withdrawals (photo_id, by_user, reason, at) VALUES (?, ?, ?, ?)', [photo, actor.id, 'Not useful, taken back when sorting.', d.now()]);
        taken_back++;
      } else if (live.get(photo)?.item_key !== to) {
        d.db.run('INSERT INTO survey_photo_sorts (id, photo_id, item_key, by_user, at) VALUES (?, ?, ?, ?, ?)', [d.newId(), photo, to, actor.id, d.now()]);
        sorted++;
      }
    }
    if (sorted + taken_back > 0) {
      d.audit.append({ at: d.now(), kind: 'SURVEY_PHOTOS_SORTED', outcome: 'ALLOWED', actor_id: actor.id, actor_role: actor.role, object_type: 'surveyor_job', object_id: job_id,
        detail: { sorted, taken_back } });
    }
  });
  return { ok: true, sorted, taken_back };
}

/* ================================================================== *
 * THE WALKTHROUGH CALL
 * ================================================================== */

export const ASK_WORDS = 'I would like a recorded video call to show you around the building for the survey.';

export function askWalkthrough(d: EvidenceDeps, actor: Actor, job_id: string): Result {
  const job = clientOf(d.db, actor, job_id);
  const open = d.db.get('SELECT 1 AS x FROM survey_walkthrough_asks a WHERE a.job_id = ? AND NOT EXISTS (SELECT 1 FROM survey_walkthroughs w WHERE w.job_id = a.job_id AND w.booked_at >= a.at)', [job_id]);
  if (open !== undefined) return { ok: false, why: 'We have your request. We will offer you a time.' };
  return d.db.tx((): Result => {
    const m = postClientMessage(d, actor, job.business_id, { body: ASK_WORDS, claim_id: null });
    if (!m.ok) return m;
    const id = d.newId();
    d.db.run('INSERT INTO survey_walkthrough_asks (id, job_id, by_user, at) VALUES (?, ?, ?, ?)', [id, job_id, actor.id, d.now()]);
    return { ok: true, id };
  });
}

export type Walkthrough = {
  readonly id: string; readonly booking_id: string; readonly starts_at: string | null; readonly cancelled: boolean; readonly booked_by_name: string;
  readonly meeting_id: string | null;
  readonly recordings: readonly { readonly id: string; readonly share_url: string; readonly passcode: string | null; readonly minutes: number; readonly recorded_at: string; readonly views: number }[];
};

export function walkthroughsOf(db: Db, job_id: string): Walkthrough[] {
  return db.all<{ id: string; booking_id: string; starts_at: string | null; cancelled_at: string | null; booked_by_name: string; meeting_id: string | null }>(
    'SELECT w.id, w.booking_id, b.starts_at, b.cancelled_at, u.display_name AS booked_by_name, ' +
      '(SELECT m.meeting_id FROM video_meetings m WHERE m.booking_id = b.id ORDER BY m.created_at DESC LIMIT 1) AS meeting_id ' +
      'FROM survey_walkthroughs w JOIN bookings b ON b.id = w.booking_id JOIN users u ON u.id = w.booked_by WHERE w.job_id = ? ORDER BY w.booked_at DESC', [job_id],
  ).map((w) => ({
    id: w.id, booking_id: w.booking_id, starts_at: w.starts_at, cancelled: w.cancelled_at !== null, booked_by_name: w.booked_by_name, meeting_id: w.meeting_id,
    recordings: db.all<{ id: string; share_url: string; passcode: string | null; minutes: number; recorded_at: string; views: number }>(
      'SELECT r.id, r.share_url, r.passcode, r.minutes, r.recorded_at, (SELECT COUNT(*) FROM survey_recording_views v WHERE v.recording_id = r.id) AS views FROM survey_recordings r WHERE r.walkthrough_id = ? ORDER BY r.recorded_at', [w.id]),
  }));
}

export function asksOf(db: Db, job_id: string): { at: string; by_name: string }[] {
  return db.all('SELECT a.at, u.display_name AS by_name FROM survey_walkthrough_asks a JOIN users u ON u.id = a.by_user WHERE a.job_id = ? ORDER BY a.at DESC', [job_id]);
}

/** Who may fetch the walkthrough's recording: the assigned surveyor, Admin or Sales. */
function mayArrange(db: Db, actor: Actor, job_id: string): ReturnType<typeof packJob> {
  const pj = packJob(db, actor, job_id);
  if (!can(actor, 'surveyor_job.commit', pj.obj)) authorise(actor, 'email.queue', { type: 'email', id: pj.job.business_id, business_id: pj.job.business_id });
  return pj;
}

/** Book the walkthrough as a video call at one of the booker's free times (Admin or Sales); its Zoom meeting records. */
export async function bookWalkthrough(app: App, newId: () => string, actor: Actor, job_id: string, f: { slot: string; to: string; origin: string }): Promise<Result & { zoom?: boolean }> {
  const { job, obj } = packJob(app.db, actor, job_id);
  authorise(actor, 'surveyor_job.read', obj);
  authorise(actor, 'booking.write', { type: 'booking', id: 'walkthrough', business_id: job.business_id });
  const to = f.to.trim();
  if (to === '' || app.db.get('SELECT 1 AS x FROM contacts WHERE business_id = ? AND lower(email) = lower(?)', [job.business_id, to]) === undefined) {
    return { ok: false, field: 'to', why: 'Choose who the call is with: one of their contacts with an email address.' };
  }
  const now = app.now();
  const ok = isBookable(app.db, f.slot.trim(), { forUser: actor.id, now });
  if (!ok.ok) return { ok: false, field: 'slot', why: `That time cannot be booked: ${ok.why}. Choose another.` };
  const starts = new Date(Date.parse(f.slot.trim())).toISOString();
  const ends = new Date(Date.parse(starts) + SLOT_MINUTES * 60_000).toISOString();
  const booking = newId();
  const id = newId();
  app.db.tx(() => {
    app.db.run("INSERT INTO bookings (id, business_id, lead_id, assigned_to, channel, sms_variant, entry_point, starts_at, ends_at, created_at) VALUES (?, ?, NULL, ?, 'video', NULL, 'staff', ?, ?, ?)",
      [booking, job.business_id, actor.id, starts, ends, now]);
    app.db.run('INSERT INTO survey_walkthroughs (id, job_id, booking_id, booked_by, booked_at) VALUES (?, ?, ?, ?, ?)', [id, job_id, booking, actor.id, now]);
    app.audit.append({ at: now, kind: 'BOOKING_CREATED', outcome: 'ALLOWED', actor_id: actor.id, actor_role: actor.role, object_type: 'booking', object_id: booking,
      detail: { business: job.business_id, channel: 'video', walkthrough: true } });
  });
  const zoomed = await reconcileVideoMeeting(app, booking);
  sendVideoInvite(app, f.origin, booking, 'arranged', to);
  return { ok: true, id, zoom: zoomed === 'MADE' };
}

/** Fetch a walkthrough's recording from Zoom and keep its link, passcode and length. */
export async function fetchRecording(app: App, newId: () => string, actor: Actor, job_id: string, walkthrough_id: string): Promise<Result> {
  mayArrange(app.db, actor, job_id);
  const w = walkthroughsOf(app.db, job_id).find((x) => x.id === walkthrough_id);
  if (w === undefined) return { ok: false, why: 'That is not one of this job’s walkthrough calls.' };
  if (w.meeting_id === null) return { ok: false, why: 'That call has no Zoom meeting, so Zoom has no recording of it.' };
  const r = await zoomRecording(zoomDeps(app), w.meeting_id);
  if (r.state !== 'FOUND') return { ok: false, why: r.why };
  if (w.recordings.some((x) => x.share_url === r.share_url)) return { ok: false, why: 'We already have that recording.' };
  const id = newId();
  app.db.run('INSERT INTO survey_recordings (id, walkthrough_id, share_url, passcode, minutes, recorded_at, fetched_by, fetched_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    [id, w.id, r.share_url, r.passcode, r.minutes, r.recorded_at, actor.id, app.now()]);
  return { ok: true, id };
}

/** Opening a recording, recorded. Its link for whoever may read the job. */
export function watchRecording(d: EvidenceDeps, actor: Actor, job_id: string, recording_id: string): string | null {
  const { obj } = packJob(d.db, actor, job_id);
  authorise(actor, 'surveyor_job.read', obj);
  const r = d.db.get<{ share_url: string }>('SELECT r.share_url FROM survey_recordings r JOIN survey_walkthroughs w ON w.id = r.walkthrough_id WHERE r.id = ? AND w.job_id = ?', [recording_id, job_id]);
  if (r === undefined) return null;
  d.db.run('INSERT INTO survey_recording_views (id, recording_id, by_user, at) VALUES (?, ?, ?, ?)', [d.newId(), recording_id, actor.id, d.now()]);
  return r.share_url;
}

/* ================================================================== *
 * HOW THE SURVEYOR INSPECTED
 * ================================================================== */

export const BASIS_WORDS: Readonly<Record<string, string>> = Object.freeze({
  DESKTOP_EVIDENCE: 'Desktop, with the client’s photos and video',
  LIVE_VIDEO: 'A live video survey',
  SITE_VISIT: 'A site visit',
});

export type Basis = { readonly basis: string; readonly words: string; readonly note: string | null; readonly by_name: string; readonly at: string };

export function basisOf(db: Db, job_id: string): Basis | null {
  const r = db.get<{ basis: string; note: string | null; by_name: string; at: string }>(
    'SELECT b.basis, b.note, u.display_name AS by_name, b.at FROM survey_inspection_basis b JOIN users u ON u.id = b.by_user WHERE b.job_id = ? ORDER BY b.at DESC, b.rowid DESC LIMIT 1', [job_id]);
  return r === undefined ? null : { ...r, words: BASIS_WORDS[r.basis] ?? r.basis };
}

export function setBasis(d: EvidenceDeps, actor: Actor, job_id: string, f: { basis: string; note: string }): Result {
  const { obj } = packJob(d.db, actor, job_id);
  authorise(actor, 'surveyor_job.commit', obj);
  if (BASIS_WORDS[f.basis] === undefined) return { ok: false, field: 'basis', why: 'Choose how you inspected the building.' };
  const note = f.note.trim().replace(/\s+/g, ' ');
  if (note.length > 500) return { ok: false, field: 'note', why: 'Keep the note under 500 characters.' };
  const now = basisOf(d.db, job_id);
  if (now !== null && now.basis === f.basis && (now.note ?? '') === note) return { ok: false, why: 'That is already how you inspected it.' };
  const id = d.newId();
  d.db.run('INSERT INTO survey_inspection_basis (id, job_id, basis, note, by_user, at) VALUES (?, ?, ?, ?, ?, ?)', [id, job_id, f.basis, note === '' ? null : note, actor.id, d.now()]);
  return { ok: true, id };
}
