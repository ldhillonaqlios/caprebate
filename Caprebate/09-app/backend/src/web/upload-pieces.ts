/**
 * A FILE SENT IN PIECES — PHASE 160e, 19 October 2026.
 *
 * The stress test of 19 October 2026 sent a 6 MB document to the test website: Vercel refused it before the website saw
 * it, with its own page ("Request Entity Too Large"). Vercel takes at most 4.5 MB a request, and every document form
 * sent its file whole, while the portal says "The most we take is 50 MB". Photos and videos already go round the limit
 * (src/web/photo-upload.ts, src/web/survey-video.ts); documents did not.
 *
 * HOW. The page's script (src/web/upload-pieces-script.ts) sees a chosen file over `PIECED_ABOVE`, asks to START
 * (`startPieces`: the size, so the server says how many pieces), sends each piece of at most `PIECE_BYTES` (`putPiece`),
 * then sends the form exactly as before with the file box emptied and the start's id in a field named `pieces`. The
 * form's own handler reads the file from the pieces (`takePieces`, through `readUpload` in client-files-pages.ts and
 * `readPortalSend` in messages-pages.ts) and does everything it always did with it: the same type, size and damage
 * checks, the same `receiveFile`. Nothing a document goes through changed; only how its bytes arrive.
 *
 * WHERE THE PIECES WAIT. In the store's incoming area (the private Blob store on the test website), SEALED with the
 * store's key where it has one, so a piece is never readable at rest. They are removed when the form takes them, and
 * the SWEEP (`sweepPieces`) removes any not taken within a day.
 *
 * WHO. Only the person who started a send may add to it or take it. A send is one file, taken once.
 */
import type { Actor } from '../authz.ts';
import type { Db } from '../db.ts';
import { INCOMING_PREFIX, type FsObjectStore } from './objectstore.ts';
import { UPLOAD_LIMITS } from './upload-handler-port.ts';

/** Each piece the page sends: well under Vercel's 4.5 MB a request. */
export const PIECE_BYTES = 3 * 1024 * 1024;
/** A file at or under this goes whole, as before; above it the page's script sends it in pieces. */
export const PIECED_ABOVE = 4 * 1000 * 1000;
/** The most a file sent in pieces may be: the same as any document. */
export const MAX_PIECED_BYTES = UPLOAD_LIMITS.max_bytes;
/** A send not taken within this many hours is removed. */
export const ABANDON_HOURS = 24;

export type PiecesDeps = { readonly db: Db; readonly now: () => string; readonly newId: () => string };
export type PiecesResult<T> = ({ readonly ok: true } & T) | { readonly ok: false; readonly why: string };

type Row = { id: string; user_id: string; size: number; pieces: number; sealed: number; started_at: string; ended_at: string | null };

const ID = /^[A-Za-z0-9-]{8,64}$/;
const TOO_BIG = `That file is too big. The most we take is ${String(Math.round(MAX_PIECED_BYTES / 1024 / 1024))} MB.`;
const GONE = 'That file did not finish arriving. Choose it and send it again.';

function keyOf(id: string, n: number): string { return `${INCOMING_PREFIX}pieces/${id}/${String(n)}`; }

type Reader = { readonly db: Db; readonly now: () => string };

function own(d: Reader, actor: Actor, id: string): Row | null {
  if (!ID.test(id)) return null;
  const r = d.db.get<Row>('SELECT id, user_id, size, pieces, sealed, started_at, ended_at FROM upload_pieces WHERE id = ?', [id]);
  if (r === undefined || r.user_id !== actor.id || r.ended_at !== null) return null;
  if (Date.parse(d.now()) - Date.parse(r.started_at) > ABANDON_HOURS * 3600 * 1000) return null;
  return r;
}

/** Start a send: its size says how many pieces. */
export function startPieces(d: PiecesDeps, actor: Actor, sizeText: string): PiecesResult<{ readonly id: string; readonly piece_bytes: number; readonly pieces: number }> {
  if (actor.disabled) return { ok: false, why: 'This login is switched off.' };
  const size = /^\d{1,12}$/.test(sizeText.trim()) ? Number(sizeText.trim()) : 0;
  if (size < 1) return { ok: false, why: 'That file is empty.' };
  if (size > MAX_PIECED_BYTES) return { ok: false, why: TOO_BIG };
  const pieces = Math.ceil(size / PIECE_BYTES);
  const id = d.newId();
  d.db.run('INSERT INTO upload_pieces (id, user_id, size, pieces, sealed, started_at) VALUES (?, ?, ?, ?, 0, ?)', [id, actor.id, size, pieces, d.now()]);
  return { ok: true, id, piece_bytes: PIECE_BYTES, pieces };
}

/** One piece, numbered from 0. Every piece but the last is exactly `PIECE_BYTES`; the last is what is left. */
export async function putPiece(d: PiecesDeps, store: FsObjectStore, actor: Actor, id: string, nText: string, bytes: Uint8Array): Promise<PiecesResult<object>> {
  const r = own(d, actor, id);
  if (r === null) return { ok: false, why: GONE };
  const n = /^\d{1,3}$/.test(nText) ? Number(nText) : -1;
  if (n < 0 || n >= r.pieces) return { ok: false, why: GONE };
  const want = n < r.pieces - 1 ? PIECE_BYTES : r.size - PIECE_BYTES * (r.pieces - 1);
  if (bytes.length !== want) return { ok: false, why: GONE };
  if (store.canSeal) {
    await store.putIncoming(keyOf(id, n), store.sealBytes(bytes));
    d.db.run('UPDATE upload_pieces SET sealed = 1 WHERE id = ?', [id]);
  } else {
    await store.putIncoming(keyOf(id, n), bytes);
  }
  return { ok: true };
}

/** The whole file, once, for the form's own handler; its pieces are removed. Null, with why, if any piece is missing. */
export async function takePieces(d: Reader, store: FsObjectStore, actor: Actor, id: string): Promise<PiecesResult<{ readonly bytes: Uint8Array }>> {
  const r = own(d, actor, id);
  if (r === null) return { ok: false, why: GONE };
  // Taken first, so two forms sent at once cannot both use it.
  const claimed = d.db.run("UPDATE upload_pieces SET ended_at = ?, ended_how = 'TAKEN' WHERE id = ? AND ended_at IS NULL", [d.now(), id]);
  if (claimed.changes !== 1) return { ok: false, why: GONE };
  const parts: Uint8Array[] = [];
  let missing = false;
  for (let n = 0; n < r.pieces; n++) {
    const got = await store.takeIncoming(keyOf(id, n));
    if (got === null) { missing = true; break; }
    parts.push(r.sealed === 1 && store.canSeal ? store.openBytes(got) : got);
  }
  await dropAll(store, id, r.pieces);
  if (missing) return { ok: false, why: GONE };
  const bytes = Buffer.concat(parts);
  if (bytes.length !== r.size) return { ok: false, why: GONE };
  return { ok: true, bytes: new Uint8Array(bytes) };
}

async function dropAll(store: FsObjectStore, id: string, pieces: number): Promise<void> {
  for (let n = 0; n < pieces; n++) await store.dropIncoming(keyOf(id, n));
}

/** What a form's handler passes to `readUpload`: this person's pieces, taken once. */
export function piecesOf(app: Reader, store: FsObjectStore, actor: Actor): (id: string) => Promise<PiecesResult<{ readonly bytes: Uint8Array }>> {
  return (id) => takePieces(app, store, actor, id);
}

/**
 * A page with a form marked `data-pieces`: every page's security policy plus OUR OWN script, which may send only to this
 * site, and the script named last so the page reads without it. Any other page is returned as it came.
 */
export const PIECES_PAGE_CSP = "default-src 'none'; style-src 'self'; img-src 'self' data:; script-src 'self'; connect-src 'self'; " +
  "form-action 'self'; frame-ancestors 'none'; base-uri 'none'";

export function piecesPage(headers: Readonly<Record<string, string>>, body: string): { headers: Readonly<Record<string, string>>; body: string } {
  if (!body.includes('data-pieces')) return { headers, body };
  const withScript = body.includes('/assets/upload-pieces.js') ? body : body.replace('</body>', '<script src="/assets/upload-pieces.js" defer></script></body>');
  return { headers: { ...headers, 'content-security-policy': PIECES_PAGE_CSP }, body: withScript };
}

/** Remove every send not taken within `ABANDON_HOURS`, and its pieces. Returns how many. */
export async function sweepPieces(d: Reader, store: FsObjectStore): Promise<number> {
  const before = new Date(Date.parse(d.now()) - ABANDON_HOURS * 3600 * 1000).toISOString();
  const old = d.db.all<{ id: string; pieces: number }>('SELECT id, pieces FROM upload_pieces WHERE ended_at IS NULL AND started_at < ?', [before]);
  for (const o of old) {
    await dropAll(store, o.id, o.pieces);
    d.db.run("UPDATE upload_pieces SET ended_at = ?, ended_how = 'SWEPT' WHERE id = ? AND ended_at IS NULL", [d.now(), o.id]);
  }
  return old.length;
}
