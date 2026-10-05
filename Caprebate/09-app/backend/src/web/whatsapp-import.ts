/**
 * PHASE 156c, 5 October 2026 — A WHATSAPP CHAT EXPORTED ON THE PHONE, ADDED TO THE CLIENT'S RECORD BY HAND.
 *
 * Lakhbir chose this over a live connection to Meta (5 Oct 2026: "go with manual upload, keep photos"). Staff talk to
 * clients on the WhatsApp phone; to keep a conversation they export that one chat and add it here. THREE STEPS:
 *
 *   1. UPLOAD (`startImport`). The chat's text, and the list of files in the export. A small export comes through
 *      the website whole (the .zip, kept sealed); a big one cannot (the test website takes about 4.5 MB a request),
 *      so the page's script opens it on the person's own computer and sends only the text and the names. Nothing is
 *      saved to the record at this step. A group chat (more than two names) is refused.
 *   2. CHECK (`importCheck`). How many messages and files, the first and last date, who is us and who is the client,
 *      and from which date to keep them — an export always holds the WHOLE history of the chat. Warnings: dates that
 *      could be read month first; a contact who did not tick the WhatsApp box (their messages are kept: Lakhbir,
 *      5 Oct 2026, "kept in").
 *   3. SAVE (`saveImport`). Each message from that date into whatsapp_messages (IN or OUT, the message's own time),
 *      tied to this upload in whatsapp_import_lines. A newer copy of the same chat adds only what is not there yet.
 *      Files: from the kept .zip at once; otherwise the script sends each needed one (`addImportFile`), each sealed
 *      in the file store as a fetched WhatsApp attachment is.
 *
 * Nothing here contacts Meta or anyone else. The copies follow the same keep-and-delete rules as other client
 * messages (Lakhbir, 5 Oct 2026, "yes same rules").
 */
import { createHash, randomUUID } from 'node:crypto';
import type { App } from '../app.ts';
import { authorise, type Actor } from '../authz.ts';
import { parseChat, type ExportMessage, type ParsedChat } from '../connectors/whatsapp-export.ts';
import { localDate } from './localtime.ts';
import { WHATSAPP_IMPORT_PREFIX, WHATSAPP_PREFIX, type FsObjectStore } from './objectstore.ts';
import { phoneContacts } from './whatsapp.ts';
import { listZipEntries, readZipEntryFromBuffer } from './zip.ts';

/** Where an upload's text and .zip are kept, sealed. */
export const IMPORT_PREFIX = WHATSAPP_IMPORT_PREFIX;
/** The largest .zip that is read on the server (a bigger one is opened in the browser and sent in pieces). */
export const IMPORT_MAX_ZIP = 100 * 1024 * 1024;
/** The largest chat text: about ten years of a busy chat. */
export const IMPORT_MAX_TEXT = 16 * 1024 * 1024;
/** The most files an export may list. */
export const IMPORT_MAX_FILES = 5000;
/** One file sent on its own after saving. The test website takes about 4.5 MB a request, so the page says so. */
export const IMPORT_MAX_FILE = 25 * 1024 * 1024;

/** The kinds of file kept, by extension: photos, videos, voice notes, PDFs and Office documents. Nothing else. */
const KINDS: Readonly<Record<string, { type: 'image' | 'video' | 'audio' | 'document'; mime: string }>> = Object.freeze({
  jpg: { type: 'image', mime: 'image/jpeg' }, jpeg: { type: 'image', mime: 'image/jpeg' }, png: { type: 'image', mime: 'image/png' },
  heic: { type: 'image', mime: 'image/heic' }, heif: { type: 'image', mime: 'image/heif' }, webp: { type: 'image', mime: 'image/webp' },
  gif: { type: 'image', mime: 'image/gif' },
  mp4: { type: 'video', mime: 'video/mp4' }, mov: { type: 'video', mime: 'video/quicktime' }, '3gp': { type: 'video', mime: 'video/3gpp' },
  opus: { type: 'audio', mime: 'audio/ogg' }, ogg: { type: 'audio', mime: 'audio/ogg' }, m4a: { type: 'audio', mime: 'audio/mp4' },
  mp3: { type: 'audio', mime: 'audio/mpeg' }, aac: { type: 'audio', mime: 'audio/aac' }, amr: { type: 'audio', mime: 'audio/amr' }, wav: { type: 'audio', mime: 'audio/wav' },
  pdf: { type: 'document', mime: 'application/pdf' },
  doc: { type: 'document', mime: 'application/msword' },
  docx: { type: 'document', mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' },
  xls: { type: 'document', mime: 'application/vnd.ms-excel' },
  xlsx: { type: 'document', mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },
  ppt: { type: 'document', mime: 'application/vnd.ms-powerpoint' },
  pptx: { type: 'document', mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' },
});
const WORDS: Readonly<Record<string, string>> = { image: 'A photo', video: 'A video', audio: 'A voice note', document: 'A document' };

/** What kind of file a name is, or null when it is not one we keep. */
export function fileKind(name: string): { type: 'image' | 'video' | 'audio' | 'document'; mime: string } | null {
  const ext = (/\.([A-Za-z0-9]{1,5})$/.exec(name)?.[1] ?? '').toLowerCase();
  return KINDS[ext] ?? null;
}

/** A name inside an export that is safe: no folder that climbs out, no absolute path, no zip inside the zip. */
export function safeEntryName(name: string): boolean {
  if (name === '' || name.length > 200 || /[\u0000-\u001f]/.test(name)) return false;
  if (name.startsWith('/') || name.startsWith('\\') || /^[A-Za-z]:/.test(name)) return false;
  if (name.split(/[\\/]/).some((part) => part === '..')) return false;
  return true;
}

const CHAT_TEXT = (name: string): boolean => /(^|\/)(_chat\.txt|WhatsApp Chat[^/]*\.txt)$/i.test(name);
const base = (name: string): string => name.split(/[\\/]/).pop() ?? name;

type Result<T> = ({ ok: true } & T) | { ok: false; why: string };
type Done = { ok: true } | { ok: false; why: string };
const obj = (business_id: string) => ({ type: 'client_message' as const, id: business_id, business_id });

export type ImportInput = {
  readonly contact_id: string;
  readonly filename: string;
  /** The whole export as it came, when it came whole (.zip or .txt). */
  readonly whole: Buffer | null;
  /** When the browser opened the .zip: the chat's text, and every file name in it. */
  readonly chat: Buffer | null;
  readonly names: readonly string[] | null;
};

/** STEP 1. Read the upload and keep it for the check. Nothing reaches the record yet. */
export async function startImport(app: App, store: FsObjectStore, actor: Actor, business_id: string, input: ImportInput): Promise<Result<{ id: string }>> {
  authorise(actor, 'client_message.write', obj(business_id));
  if (!store.canSeal) return { ok: false, why: 'We cannot keep files yet: the key that encrypts them is not set.' };
  const c = phoneContacts(app.db, business_id, app.now()).find((x) => x.id === input.contact_id);
  if (c === undefined) return { ok: false, why: 'Choose which of this company’s contacts the chat is with (one with a mobile number).' };
  const filename = base(input.filename).replace(/[^\p{L}\p{N} ._()-]/gu, '_').slice(0, 200) || 'WhatsApp chat';

  let text: Buffer | null = null;
  let names: string[] = [];
  let zip: Buffer | null = null;
  if (input.whole !== null) {
    if (input.whole.length > IMPORT_MAX_ZIP) return { ok: false, why: 'That file is too big to add here (over 100 MB).' };
    const isZip = input.whole.length > 4 && input.whole.readUInt32LE(0) === 0x04034b50;
    if (isZip) {
      try { names = listZipEntries(input.whole); } catch { return { ok: false, why: 'That .zip could not be opened. Export the chat again and choose the new file.' }; }
      const chatName = names.find(CHAT_TEXT);
      if (chatName === undefined) return { ok: false, why: 'That .zip has no WhatsApp chat in it. On the phone, open the chat, tap the name, then Export chat.' };
      try { text = readZipEntryFromBuffer(input.whole, [chatName]); } catch { return { ok: false, why: 'The chat inside that .zip could not be read.' }; }
      zip = input.whole;
    } else {
      text = input.whole;
    }
  } else if (input.chat !== null) {
    text = input.chat;
    names = [...(input.names ?? [])];
  }
  if (text === null || text.length === 0) return { ok: false, why: 'Choose the exported chat first (the .zip, or the .txt).' };
  if (text.length > IMPORT_MAX_TEXT) return { ok: false, why: 'That chat is too long to add here.' };
  if (names.length > IMPORT_MAX_FILES) return { ok: false, why: `That export holds more than ${IMPORT_MAX_FILES} files.` };
  const unsafe = names.find((n) => !safeEntryName(n));
  if (unsafe !== undefined) return { ok: false, why: 'That .zip has a file with a name we do not accept (a folder that climbs out, or an odd character). Export the chat again.' };
  if (names.some((n) => /\.zip$/i.test(n))) return { ok: false, why: 'That .zip has another .zip inside it. Export the chat again and choose the new file.' };

  const parsed = parseChat(text.toString('utf8'));
  if (parsed.messages.length === 0) return { ok: false, why: 'That file is not a WhatsApp chat we can read. On the phone, open the chat, tap the name, then Export chat.' };
  if (parsed.senders.length > 2) return { ok: false, why: 'Only one-to-one chats can be added for now.' };

  const id = randomUUID();
  const chatKey = `${IMPORT_PREFIX}${id}/chat.txt`;
  await store.putSealed(chatKey, text);
  let zipKey: string | null = null;
  if (zip !== null) { zipKey = `${IMPORT_PREFIX}${id}/export.zip`; await store.putSealed(zipKey, zip); }
  const now = app.now();
  app.db.run(
    'INSERT INTO whatsapp_imports (id, business_id, contact_id, phone, status, filename, layout, chat_key, zip_key, file_names, uploaded_by, uploaded_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [id, business_id, c.id, c.number, 'CHECKING', filename, parsed.layout, chatKey, zipKey, JSON.stringify(names.map(base)), actor.id, now]);
  app.audit.append({ at: now, kind: 'WHATSAPP_EXPORT_UPLOADED', outcome: 'ALLOWED', actor_id: actor.id, actor_role: actor.role,
    object_type: 'whatsapp_import', object_id: id, detail: { business: business_id, contact: c.id, messages: parsed.messages.length, files: names.length, whole: zip !== null } });
  return { ok: true, id };
}

type ImportRow = {
  id: string; business_id: string; contact_id: string; phone: string; status: string; filename: string; layout: string | null;
  chat_key: string; zip_key: string | null; file_names: string; uploaded_by: string; uploaded_at: string;
  us_name: string | null; from_date: string | null; saved_at: string | null; added: number | null;
};

function importRow(app: App, business_id: string, id: string): ImportRow | undefined {
  return app.db.get<ImportRow>('SELECT * FROM whatsapp_imports WHERE id = ? AND business_id = ?', [id, business_id]);
}

async function parsedOf(store: FsObjectStore, row: ImportRow): Promise<ParsedChat> {
  return parseChat((await store.getSealed(row.chat_key)).toString('utf8'));
}

const fingerprint = (contact_id: string, m: ExportMessage, direction: 'IN' | 'OUT', body: string): string =>
  createHash('sha256').update([contact_id, m.at, direction, body, m.attachment ?? ''].join('\n')).digest('hex');

/** The words kept for one message. */
function bodyOf(m: ExportMessage): { kind: 'text' | 'media' | 'other'; body: string } {
  if (m.deleted) return { kind: 'other', body: m.text };
  if (m.omitted) return { kind: 'other', body: 'A file that was not in the export.' };
  if (m.attachment !== null) {
    const k = fileKind(m.attachment);
    const what = k === null ? `A file (${m.attachment}) of a kind we do not keep` : `${WORDS[k.type] ?? 'A file'}${k.type === 'document' ? `: ${m.attachment}` : ''}`;
    return { kind: k === null ? 'other' : 'media', body: m.text === '' ? `${what}.` : `${m.text}\n(${what}.)` };
  }
  if (m.text.startsWith('A view-once message')) return { kind: 'other', body: m.text };
  return { kind: 'text', body: m.edited ? `${m.text} (edited)` : m.text };
}

export type ImportCheck = {
  readonly id: string; readonly status: string; readonly filename: string; readonly contact_name: string; readonly contact_agreed: boolean;
  readonly layout: string | null; readonly senders: readonly string[]; readonly us_guess: string | null;
  readonly messages: number; readonly first: string; readonly last: string; readonly first_date: string; readonly last_date: string;
  /** For the chosen side and date: how many would be added, and how many are already on the record. */
  readonly from_date: string; readonly us: string | null; readonly to_add: number; readonly already: number;
  readonly files: number; readonly files_not_kept: number; readonly omitted: number;
  readonly dates_could_be_month_first: boolean; readonly whole_zip_kept: boolean;
  readonly saved_at: string | null; readonly added: number | null;
};

/** STEP 2. What the upload holds, for a person to check. `us` and `from` are the choices so far, if any. */
export async function importCheck(app: App, store: FsObjectStore, actor: Actor, business_id: string, id: string, choice: { us?: string | null; from?: string | null } = {}): Promise<ImportCheck | null> {
  authorise(actor, 'client_message.write', obj(business_id));
  const row = importRow(app, business_id, id);
  if (row === undefined) return null;
  const p = await parsedOf(store, row);
  const contact = app.db.get<{ full_name: string; whatsapp_optin: number }>('SELECT full_name, whatsapp_optin FROM contacts WHERE id = ?', [row.contact_id]);
  const cname = (contact?.full_name ?? '').trim().toLowerCase();
  const cfirst = cname.split(/\s+/)[0] ?? '';
  // Our side is the name that is not the client's, where the client's name is recognisable; otherwise the person chooses.
  const them = p.senders.find((s) => s.toLowerCase() === cname || (cfirst !== '' && s.toLowerCase().split(/\s+/)[0] === cfirst));
  const us_guess = row.us_name ?? (them !== undefined && p.senders.length === 2 ? p.senders.find((s) => s !== them) ?? null : null);
  const us = choice.us != null && p.senders.includes(choice.us) ? choice.us : us_guess;
  const first = p.messages[0]!;
  const last = p.messages[p.messages.length - 1]!;
  const first_date = localDate(first.at);
  const from = choice.from != null && /^\d{4}-\d{2}-\d{2}$/.test(choice.from) ? choice.from : (row.from_date ?? first_date);
  const chosen = p.messages.filter((m) => localDate(m.at) >= from);
  let already = 0;
  for (const m of chosen) {
    if (us === null) break;
    const dir = m.sender === us ? 'OUT' : 'IN';
    if (app.db.get('SELECT 1 FROM whatsapp_import_lines WHERE fingerprint = ?', [fingerprint(row.contact_id, m, dir, bodyOf(m).body)]) !== undefined) already += 1;
  }
  const withFiles = chosen.filter((m) => m.attachment !== null);
  return {
    id: row.id, status: row.status, filename: row.filename, contact_name: contact?.full_name ?? '', contact_agreed: contact?.whatsapp_optin === 1,
    layout: row.layout, senders: p.senders, us_guess, messages: p.messages.length,
    first: first.local, last: last.local, first_date, last_date: localDate(last.at),
    from_date: from, us, to_add: us === null ? chosen.length : chosen.length - already, already,
    files: withFiles.filter((m) => fileKind(m.attachment!) !== null).length,
    files_not_kept: withFiles.filter((m) => fileKind(m.attachment!) === null).length,
    omitted: chosen.filter((m) => m.omitted).length,
    dates_could_be_month_first: p.dates_could_be_month_first, whole_zip_kept: row.zip_key !== null,
    saved_at: row.saved_at, added: row.added,
  };
}

/** STEP 3. Save the messages from `from` on, with `us` as our side. Files come from the kept .zip where there is one. */
export async function saveImport(app: App, store: FsObjectStore, actor: Actor, business_id: string, id: string, choice: { us: string; from: string }): Promise<Result<{ added: number; files_waiting: number }>> {
  authorise(actor, 'client_message.write', obj(business_id));
  const row = importRow(app, business_id, id);
  if (row === undefined) return { ok: false, why: 'That upload is not there any more. Add the chat again.' };
  if (row.status !== 'CHECKING') return { ok: false, why: row.status === 'SAVED' ? 'That chat is saved already.' : 'That upload was cancelled. Add the chat again.' };
  const p = await parsedOf(store, row);
  if (!p.senders.includes(choice.us)) return { ok: false, why: 'Choose which name is us.' };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(choice.from)) return { ok: false, why: 'Choose the date to keep the messages from.' };
  const now = app.now();
  let added = 0;
  const filesToAttach: { message_id: string; name: string }[] = [];
  app.db.tx(() => {
    for (const m of p.messages) {
      if (localDate(m.at) < choice.from) continue;
      const direction = m.sender === choice.us ? 'OUT' : 'IN';
      const { kind, body } = bodyOf(m);
      const fp = fingerprint(row.contact_id, m, direction, body);
      if (app.db.get('SELECT 1 FROM whatsapp_import_lines WHERE fingerprint = ?', [fp]) !== undefined) continue;
      const mid = randomUUID();
      app.db.run(
        'INSERT INTO whatsapp_messages (id, business_id, contact_id, direction, phone, kind, body, wa_id, status, error, written_by, filed_by, created_at, status_at) VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?, NULL, ?, ?, ?, ?)',
        [mid, business_id, row.contact_id, direction, row.phone, kind, body, direction === 'IN' ? 'RECEIVED' : 'SENT',
          direction === 'OUT' ? actor.id : null, actor.id, m.at, m.at]);
      app.db.run('INSERT INTO whatsapp_import_lines (message_id, import_id, contact_id, sender, attachment, fingerprint) VALUES (?, ?, ?, ?, ?, ?)',
        [mid, row.id, row.contact_id, m.sender, m.attachment, fp]);
      if (m.attachment !== null && fileKind(m.attachment) !== null) filesToAttach.push({ message_id: mid, name: m.attachment });
      added += 1;
    }
    app.db.run("UPDATE whatsapp_imports SET status = 'SAVED', us_name = ?, from_date = ?, saved_by = ?, saved_at = ?, added = ? WHERE id = ?",
      [choice.us, choice.from, actor.id, now, added, row.id]);
  });
  // A .zip that came whole gives its files now; a big one's files are sent by the page, one at a time.
  if (row.zip_key !== null) {
    const zip = await store.getSealed(row.zip_key);
    const inZip = listZipEntries(zip);
    for (const f of filesToAttach) {
      const entry = inZip.find((n) => base(n) === f.name);
      if (entry === undefined) continue;
      try { await attach(app, store, actor, f.message_id, f.name, readZipEntryFromBuffer(zip, [entry])); } catch { /* a file the zip cannot give stays waiting */ }
    }
  }
  app.audit.append({ at: now, kind: 'WHATSAPP_EXPORT_SAVED', outcome: 'ALLOWED', actor_id: actor.id, actor_role: actor.role,
    object_type: 'whatsapp_import', object_id: row.id, detail: { business: business_id, added, from: choice.from } });
  return { ok: true, added, files_waiting: filesWaiting(app, row.id).length };
}

/** Cancel an upload that has not been saved. Nothing reached the record. */
export function cancelImport(app: App, actor: Actor, business_id: string, id: string): Done {
  authorise(actor, 'client_message.write', obj(business_id));
  const row = importRow(app, business_id, id);
  if (row === undefined || row.status !== 'CHECKING') return { ok: false, why: 'That upload cannot be cancelled now.' };
  app.db.run("UPDATE whatsapp_imports SET status = 'CANCELLED' WHERE id = ?", [id]);
  return { ok: true };
}

/** The file names this saved upload still needs from the export (each a kept kind, not yet added). */
export function filesWaiting(app: App, import_id: string): string[] {
  return app.db.all<{ attachment: string }>(
    'SELECT l.attachment FROM whatsapp_import_lines l LEFT JOIN whatsapp_media m ON m.message_id = l.message_id ' +
    'WHERE l.import_id = ? AND l.attachment IS NOT NULL AND m.message_id IS NULL ORDER BY l.attachment', [import_id])
    .map((r) => r.attachment).filter((n) => fileKind(n) !== null);
}

/** The names still waiting, for the page's script. Write access only. */
export function importFilesWaiting(app: App, actor: Actor, business_id: string, id: string): string[] | null {
  authorise(actor, 'client_message.write', obj(business_id));
  const row = importRow(app, business_id, id);
  return row === undefined || row.status !== 'SAVED' ? null : filesWaiting(app, id);
}

/** One file from the export, sent after saving. It must be one this upload is waiting for. */
export async function addImportFile(app: App, store: FsObjectStore, actor: Actor, business_id: string, id: string, name: string, bytes: Uint8Array): Promise<Done> {
  authorise(actor, 'client_message.write', obj(business_id));
  const row = importRow(app, business_id, id);
  if (row === undefined || row.status !== 'SAVED') return { ok: false, why: 'Save the chat first.' };
  const clean = base(name);
  if (fileKind(clean) === null) return { ok: false, why: 'That kind of file is not kept.' };
  if (bytes.length === 0 || bytes.length > IMPORT_MAX_FILE) return { ok: false, why: 'That file is empty or too big.' };
  const waiting = app.db.all<{ message_id: string }>(
    'SELECT l.message_id FROM whatsapp_import_lines l LEFT JOIN whatsapp_media m ON m.message_id = l.message_id ' +
    'WHERE l.import_id = ? AND l.attachment = ? AND m.message_id IS NULL', [id, clean]);
  if (waiting.length === 0) return { ok: false, why: 'This chat is not waiting for that file.' };
  for (const w of waiting) await attach(app, store, actor, w.message_id, clean, bytes);
  return { ok: true };
}

/** Keep one file sealed and record it as the message's attachment, as a fetched WhatsApp file is recorded. */
async function attach(app: App, store: FsObjectStore, actor: Actor, message_id: string, name: string, bytes: Uint8Array): Promise<void> {
  const k = fileKind(name);
  if (k === null) return;
  const objectKey = `${WHATSAPP_PREFIX}${message_id}`;
  await store.putSealed(objectKey, bytes);
  app.db.run(
    'INSERT INTO whatsapp_media (message_id, media_id, media_type, mime, sha256, filename, object_key, bytes, fetched_by, fetched_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [message_id, `export:${name}`.slice(0, 200), k.type, k.mime, createHash('sha256').update(bytes).digest('hex'), name.slice(0, 200), objectKey, bytes.length, actor.id, app.now()]);
}

export type ImportListed = { readonly id: string; readonly contact: string; readonly status: string; readonly uploaded_at: string; readonly by: string; readonly added: number | null; readonly files_waiting: number };

/** This company's uploads, newest first. */
export function importsFor(app: App, business_id: string): ImportListed[] {
  return app.db.all<{ id: string; contact: string; status: string; uploaded_at: string; by: string; added: number | null }>(
    'SELECT i.id, c.full_name AS contact, i.status, i.uploaded_at, u.display_name AS by, i.added FROM whatsapp_imports i ' +
    'JOIN contacts c ON c.id = i.contact_id JOIN users u ON u.id = i.uploaded_by WHERE i.business_id = ? AND i.status <> ? ORDER BY i.uploaded_at DESC, i.id',
    [business_id, 'CANCELLED']).map((r) => ({ ...r, files_waiting: r.status === 'SAVED' ? filesWaiting(app, r.id).length : 0 }));
}

/** Whether a message came from an export, and which. */
export function importedFrom(app: App, message_id: string): { import_id: string; uploaded_at: string; by: string } | null {
  return app.db.get<{ import_id: string; uploaded_at: string; by: string }>(
    'SELECT l.import_id, i.uploaded_at, u.display_name AS by FROM whatsapp_import_lines l JOIN whatsapp_imports i ON i.id = l.import_id ' +
    'JOIN users u ON u.id = i.uploaded_by WHERE l.message_id = ?', [message_id]) ?? null;
}
