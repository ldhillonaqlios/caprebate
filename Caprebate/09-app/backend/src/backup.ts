/**
 * THE NIGHTLY BACKUP, AND ITS RESTORE. Phase 161h, 7 November 2026 (the developer question pack, D8; Word question 155).
 *
 * WHAT IT COPIES, EVERY NIGHT (the live website's "backup" timer, src/web/timers.ts, 02:00 UTC):
 *   - THE DATABASE, whole, as one SQLite file (VACUUM INTO, which writes a clean, complete copy while the website keeps
 *     running), to database/<date>.db.cbbk. On Turso the file is first brought down as a local copy of the live database
 *     (libsql's own replica), then written out the same way.
 *   - THE DOCUMENT STORE, what is new or changed since the last night, each object exactly as stored (a sealed photo stays
 *     sealed), to documents/<key>.cbbk; and a small state file saying what was copied when.
 * WHAT IT LEAVES OUT, ON PURPOSE: the holding places, where an upload waits unredacted for up to an hour before the names
 * we may not keep are removed (quarantine/), and where a phone's locked photo or a file's pieces wait (survey-incoming/).
 * A backup that copied them would keep those files far longer than we say (Word question 155). And the reference
 * database (the postcode table and the grid): it holds no personal data and is rebuilt from two free downloads.
 *
 * LOCKED BEFORE IT LEAVES. Every file is gzipped and encrypted with AES-256-GCM under CAPREBATE_BACKUP_KEY (32 bytes,
 * base64), which only the live project's settings and the password manager hold. The second place stores bytes it cannot
 * read, and a file changed there fails to open (GCM's tag) rather than restoring something altered.
 *
 * HOW LONG IT IS KEPT: BACKUP_KEEP_DAYS. A night's database file is deleted by the bucket's own lifecycle rule after that
 * many days (LIVE-RUNBOOK.md sets it). A document deleted from the website is deleted from the backup once it has been
 * gone that long (the state file counts the days), so a deletion we promise reaches the backup within that time.
 *
 * SWITCHED OFF UNTIL SET UP: with no key, or nowhere to copy to, nothing is copied and the line says which setting is
 * missing (names only). Nothing here prints a key, an address or a file's contents.
 */
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { createRequire } from 'node:module';
import { DatabaseSync } from 'node:sqlite';
import { gunzipSync, gzipSync } from 'node:zlib';
import type { Db } from './db.ts';
import type { SecretStore } from './secrets.ts';
import { isInside, repositoryRoot } from './secrets.ts';
import type { Transport } from './connectors/http.ts';
import { s3LoginFrom, s3Target, type BackupTarget } from './connectors/s3-backup.ts';
import type { FsObjectStore } from './web/objectstore.ts';
import { INCOMING_PREFIX } from './web/objectstore.ts';

/** How long a night's copy, and the copy of a deleted document, is kept. A question for the data protection officer. */
export const BACKUP_KEEP_DAYS = 35;
/** Never copied (see the header): the upload holding place and where locked uploads wait. */
export const BACKUP_LEAVES_OUT: readonly string[] = Object.freeze(['quarantine/', INCOMING_PREFIX]);
/** A night's run stops starting new copies after this long, so it ends inside Vercel's 300-second limit; the rest goes the next night. */
export const BACKUP_TIME_BUDGET_MS = 200_000;

const MAGIC = Buffer.from('CBBK1', 'ascii');

/** The backup key, or null when it is missing or not 32 bytes. */
export function backupKey(secrets: SecretStore): Buffer | null {
  const v = (secrets.forOwner('BACKUPS').get('CAPREBATE_BACKUP_KEY') ?? '').trim();
  if (v === '') return null;
  const k = Buffer.from(v, 'base64');
  return k.length === 32 ? k : null;
}

/** gzip, then AES-256-GCM: MAGIC, 12-byte nonce, 16-byte tag, then the locked bytes. */
export function lockBackup(plain: Uint8Array, key: Buffer): Buffer {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', key, iv);
  const body = Buffer.concat([c.update(gzipSync(plain)), c.final()]);
  return Buffer.concat([MAGIC, iv, c.getAuthTag(), body]);
}

/** Opens a locked file. A wrong key, or a file changed after it was locked, throws. */
export function unlockBackup(locked: Uint8Array, key: Buffer): Buffer {
  const b = Buffer.from(locked);
  if (b.length < MAGIC.length + 28 || !b.subarray(0, MAGIC.length).equals(MAGIC)) throw new Error('this is not a Cap Rebate backup file');
  const iv = b.subarray(5, 17); const tag = b.subarray(17, 33);
  const d = createDecipheriv('aes-256-gcm', key, iv);
  d.setAuthTag(tag);
  return gunzipSync(Buffer.concat([d.update(b.subarray(33)), d.final()]));
}

/* ------------------------------------------------------------------ where it goes */

/** A folder on this computer: for a restore drill, and for a backup on a machine with no bucket. Refused inside the code folder. */
export function folderTarget(dir: string, repoRoot: string = repositoryRoot()): BackupTarget {
  const root = resolve(dir);
  if (!existsSync(root)) mkdirSync(root, { recursive: true, mode: 0o700 });
  if (isInside(realpathSync(root), repoRoot)) throw new Error('a backup folder inside the code folder is refused: it could be committed');
  const path = (name: string): string => {
    if (name.includes('..') || name.startsWith('/')) throw new Error('not a backup file name');
    return join(root, name);
  };
  return {
    where: 'a folder on this computer',
    async put(name, bytes) { mkdirSync(dirname(path(name)), { recursive: true, mode: 0o700 }); writeFileSync(path(name), bytes, { mode: 0o600 }); },
    async get(name) { return existsSync(path(name)) ? new Uint8Array(readFileSync(path(name))) : null; },
    async exists(name) { return existsSync(path(name)); },
    async remove(name) { rmSync(path(name), { force: true }); },
  };
}

/** Where tonight's backup goes: the bucket when its four settings are there, else CAPREBATE_BACKUP_DIR, else nowhere. */
export function backupTargetFrom(secrets: SecretStore, outside: Transport, env: Readonly<Record<string, string | undefined>>, now?: () => string): { target: BackupTarget | null; why: string } {
  const s3 = s3LoginFrom(secrets.forOwner('BACKUPS'));
  if (s3.login !== null) return { target: s3Target(s3.login, outside, now), why: '' };
  const dir = (env['CAPREBATE_BACKUP_DIR'] ?? '').trim();
  if (dir !== '') return { target: folderTarget(dir), why: '' };
  return { target: null, why: `there is nowhere to copy it to (not set: ${s3.missing.join(', ')})` };
}

/* ------------------------------------------------------------------ the database */

export type DatabaseSource =
  | { readonly kind: 'this'; readonly db: Db }
  | { readonly kind: 'turso'; readonly location: string; readonly authToken: string };

/** The live database's address and token, from the same settings the website opens it with. Never printed. */
export function databaseSourceFor(db: Db, env: Readonly<Record<string, string | undefined>>): DatabaseSource {
  if (db.kind !== 'remote') return { kind: 'this', db };
  const pick = (a: string, b: string): string => (env[a] ?? '').trim() || (env[b] ?? '').trim();
  return { kind: 'turso', location: pick('CAPREBATE_DB_URL', 'TURSO_DATABASE_URL'), authToken: pick('CAPREBATE_DB_TOKEN', 'TURSO_AUTH_TOKEN') };
}

/**
 * One whole, consistent SQLite file of the database. VACUUM INTO writes a fresh copy while others keep using it. On
 * Turso, libsql first brings the live database down as a local copy (an embedded replica), and that copy is written out
 * the same way; the replica is never written to.
 */
export function snapshotDatabase(src: DatabaseSource): Buffer {
  const dir = mkdtempSync(join(tmpdir(), 'cb-backup-'));
  try {
    const out = join(dir, 'snapshot.db');
    if (src.kind === 'this') {
      src.db.run('VACUUM INTO ?', [out]);
    } else {
      if (src.location === '' || src.authToken === '') throw new Error('the database address or token is not set');
      const replicaPath = join(dir, 'replica.db');
      const Database = createRequire(import.meta.url)('libsql') as new (p: string, o: { syncUrl: string; authToken: string }) => { sync(): unknown; close(): void };
      const replica = new Database(replicaPath, { syncUrl: src.location, authToken: src.authToken });
      try { replica.sync(); } finally { replica.close(); }
      const copy = new DatabaseSync(replicaPath, { readOnly: true });
      try { copy.prepare('VACUUM INTO ?').run(out); } finally { copy.close(); }
    }
    return readFileSync(out);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/* ------------------------------------------------------------------ the documents */

type DocState = { last_run_at: string | null; objects: Record<string, string>; missing: Record<string, string> };
const STATE_NAME = 'documents/state.json.cbbk';
const docName = (key: string): string => `documents/${key}.cbbk`;
const left = (key: string): boolean => BACKUP_LEAVES_OUT.some((p) => key.startsWith(p));

async function readState(target: BackupTarget, key: Buffer): Promise<DocState> {
  const got = await target.get(STATE_NAME);
  if (got === null) return { last_run_at: null, objects: {}, missing: {} };
  return JSON.parse(unlockBackup(got, key).toString('utf8')) as DocState;
}

export type DocumentsRun = { copied: number; unchanged: number; removed: number; left_out: number; unfinished: number };

/** Copies what is new or changed; deletes the copy of anything gone for BACKUP_KEEP_DAYS. Stops starting copies after `budgetMs`. */
export async function backupDocuments(store: FsObjectStore, target: BackupTarget, key: Buffer, now: string, budgetMs = BACKUP_TIME_BUDGET_MS): Promise<DocumentsRun> {
  const started = Date.now();
  const state = await readState(target, key);
  const all = await store.listObjects();
  const keep = all.filter((o) => !left(o.key));
  const r: DocumentsRun = { copied: 0, unchanged: 0, removed: 0, left_out: all.length - keep.length, unfinished: 0 };
  for (const o of keep) {
    if (state.objects[o.key] === o.written_at) { r.unchanged++; continue; }
    if (Date.now() - started > budgetMs) { r.unfinished++; continue; }
    await target.put(docName(o.key), lockBackup(await store.readStored(o.key), key));
    state.objects[o.key] = o.written_at;
    r.copied++;
  }
  const present = new Set(keep.map((o) => o.key));
  const limit = Date.parse(now) - BACKUP_KEEP_DAYS * 86_400_000;
  for (const k of Object.keys(state.objects)) {
    if (present.has(k)) { delete state.missing[k]; continue; }
    state.missing[k] ??= now;
    if (Date.parse(state.missing[k] as string) <= limit) {
      await target.remove(docName(k));
      delete state.objects[k]; delete state.missing[k];
      r.removed++;
    }
  }
  state.last_run_at = now;
  await target.put(STATE_NAME, lockBackup(Buffer.from(JSON.stringify(state), 'utf8'), key));
  return r;
}

/* ------------------------------------------------------------------ the night's run */

export type BackupDeps = { db: Db; store: FsObjectStore; secrets: SecretStore; outside: Transport; now: () => string };

export async function runNightlyBackup(d: BackupDeps, env: Readonly<Record<string, string | undefined>> = process.env): Promise<{ ok: boolean; why: string }> {
  const key = backupKey(d.secrets);
  if (key === null) return { ok: false, why: 'not run: CAPREBATE_BACKUP_KEY is not set (32 bytes, as base64), so nothing was copied' };
  const t = backupTargetFrom(d.secrets, d.outside, env, d.now);
  if (t.target === null) return { ok: false, why: `not run: ${t.why}` };
  const now = d.now();
  const name = `database/${now.slice(0, 10)}.db.cbbk`;
  const snapshot = snapshotDatabase(databaseSourceFor(d.db, env));
  await t.target.put(name, lockBackup(snapshot, key));
  const docs = await backupDocuments(d.store, t.target, key, now);
  return {
    ok: docs.unfinished === 0,
    why: `the database (${Math.round(snapshot.length / 1024)} KB) and ${docs.copied} new or changed document${docs.copied === 1 ? '' : 's'} copied to ${t.target.where}, ` +
      `${docs.unchanged} unchanged, ${docs.removed} deleted after ${BACKUP_KEEP_DAYS} days gone, ${docs.left_out} in the holding places left out` +
      (docs.unfinished === 0 ? '' : `; ${docs.unfinished} not reached tonight, copied on the next run`),
  };
}

/* ------------------------------------------------------------------ the restore */

/** One night's database, opened and written to `out` (a new file). The caller checks it (tools/restore-backup.ts). */
export async function restoreDatabase(target: BackupTarget, key: Buffer, date: string, out: string): Promise<number> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('give the night as YYYY-MM-DD');
  if (existsSync(out)) throw new Error('the restore writes a new file; that one is already there');
  const got = await target.get(`database/${date}.db.cbbk`);
  if (got === null) throw new Error(`there is no backup of the database for ${date}`);
  const plain = unlockBackup(got, key);
  writeFileSync(out, plain, { mode: 0o600 });
  return plain.length;
}

/** Every document the state file lists, put back into `store` exactly as it was stored. Returns how many. */
export async function restoreDocuments(target: BackupTarget, key: Buffer, store: FsObjectStore): Promise<number> {
  const state = await readState(target, key);
  let n = 0;
  for (const k of Object.keys(state.objects)) {
    const got = await target.get(docName(k));
    if (got === null) throw new Error('a document the backup lists is missing from it');
    await store.restoreStored(k, unlockBackup(got, key));
    n++;
  }
  return n;
}
