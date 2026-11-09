/**
 * RESTORE A BACKUP — one night's database, and the documents, from a copy of the backup bucket. Phase 161h, 7 November
 * 2026 (src/core/backup.ts makes the backup; 09-app/docs/LIVE-RUNBOOK.md, "Restore a backup", says when and how).
 *
 *   1. Copy the bucket to a folder on this computer, OUTSIDE the code folder:
 *        aws s3 sync s3://<BACKUP_S3_BUCKET> ~/caprebate-restore/bucket
 *   2. Open one night's database, and check it, into a NEW file:
 *        CAPREBATE_BACKUP_KEY=<the key, from the password manager> node tools/restore-backup.ts \
 *             --from ~/caprebate-restore/bucket --date 2026-11-07 --to ~/caprebate-restore/live-restored.db \
 *             [--documents ~/caprebate-restore/documents]
 *   3. It prints what it found: the tables built, the audit chain intact or where it breaks, the documents put back.
 *      Then LIVE-RUNBOOK.md says how the file becomes the live database again (turso db create --from-file).
 *
 * It writes only new files and never touches the live website. It prints no key, no address and nothing from a record.
 */
import { join } from 'node:path';
import { Db, pendingMigrations } from '../src/core/db.ts';
import { MIGRATIONS_DIR } from '../src/core/app.ts';
import { AuditLog } from '../src/core/audit.ts';
import { folderTarget, restoreDatabase, restoreDocuments } from '../src/core/backup.ts';
import { FsObjectStore } from '../src/shared/objectstore.ts';

export async function restoreFromFolder(o: { from: string; date: string; to: string; documents?: string; keyB64: string }): Promise<string[]> {
  const key = Buffer.from(o.keyB64.trim(), 'base64');
  if (key.length !== 32) throw new Error('CAPREBATE_BACKUP_KEY is not 32 bytes written as base64');
  const target = folderTarget(o.from);
  const bytes = await restoreDatabase(target, key, o.date, o.to);
  const out = [`The database of ${o.date} is opened into ${o.to} (${Math.round(bytes / 1024)} KB).`];
  const db = new Db(o.to);
  try {
    const left = pendingMigrations(db, MIGRATIONS_DIR);
    out.push(left.length === 0 ? 'Its tables are complete for this version of the code.' : `${left.length} table steps are newer than it: the next release adds them.`);
    const log = new AuditLog(db);
    const v = log.verify();
    out.push(v.intact ? `The audit chain is intact: ${log.entries().length} entries, every one recomputed.` : `THE AUDIT CHAIN BREAKS at entry ${String(v.broken_at ?? '?')}. Do not use this copy; try the night before.`);
  } finally {
    db.close();
  }
  if (o.documents !== undefined) {
    const n = await restoreDocuments(target, key, new FsObjectStore({ root: o.documents }));
    out.push(`${n} document${n === 1 ? '' : 's'} put back into ${join(o.documents)}, each exactly as it was stored.`);
  }
  return out;
}

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : undefined;
}

if (import.meta.filename === process.argv[1]) {
  const from = arg('from'); const date = arg('date'); const to = arg('to'); const documents = arg('documents');
  const keyB64 = process.env.CAPREBATE_BACKUP_KEY ?? '';
  if (from === undefined || date === undefined || to === undefined || keyB64 === '') {
    console.error('usage: CAPREBATE_BACKUP_KEY=<key> node tools/restore-backup.ts --from <a copy of the bucket> --date YYYY-MM-DD --to <a new .db file> [--documents <a new folder>]');
    process.exitCode = 2;
  } else {
    try {
      for (const line of await restoreFromFolder({ from, date, to, keyB64, ...(documents === undefined ? {} : { documents }) })) console.log(line);
    } catch (e) {
      console.error(`Not restored: ${e instanceof Error ? e.message : String(e)}`);
      process.exitCode = 1;
    }
  }
}
