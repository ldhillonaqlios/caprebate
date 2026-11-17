/**
 * THE PROOF ON A REAL TURSO DATABASE (Phase 161n1e, item 9, carried from 161n1a): a migration that rebuilds a table
 * applies there now. test/core/migrations-on-turso.test.ts proves it on a stand-in; this proves it on Turso itself.
 *
 *   CAPREBATE_DB_URL=libsql://... CAPREBATE_DB_TOKEN=... node tools/turso-migration-proof.ts
 *
 * Run it against the TEST website's database (never the live one; it refuses an address with "live" in it). It makes
 * two throwaway tables with a reference between them, rebuilds the one referred to, exactly the shape of migration 049,
 * through the real migrate(), checks the reference still holds, then drops both tables and the two schema_migrations
 * rows it wrote. Nothing else is touched. It prints PASS or FAIL and the reason; never the address or the token.
 */
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Db, migrate } from '../src/core/db.ts';

const url = (process.env.CAPREBATE_DB_URL ?? '').trim();
const token = (process.env.CAPREBATE_DB_TOKEN ?? '').trim();
if (url === '' || token === '') { console.error('Set CAPREBATE_DB_URL and CAPREBATE_DB_TOKEN for the test website’s database.'); process.exit(2); }
if (/live/i.test(url)) { console.error('That address looks like the live database. This proof is for the test website’s only.'); process.exit(2); }

const dir = mkdtempSync(join(tmpdir(), 'cb-turso-proof-'));
const names = ['901-turso-proof-tables.sql', '902-turso-proof-rebuild.sql'];
writeFileSync(join(dir, names[0]!), `CREATE TABLE cb_proof_parent (id TEXT PRIMARY KEY, name TEXT NOT NULL) STRICT;
CREATE TABLE cb_proof_child (id TEXT PRIMARY KEY, parent_id TEXT NOT NULL REFERENCES cb_proof_parent(id)) STRICT;
INSERT INTO cb_proof_parent VALUES ('p1', 'one');
INSERT INTO cb_proof_child VALUES ('c1', 'p1');
`);
writeFileSync(join(dir, names[1]!), `PRAGMA foreign_keys = OFF;
BEGIN;
CREATE TABLE cb_proof_parent_new (id TEXT PRIMARY KEY, name TEXT NOT NULL, note TEXT) STRICT;
INSERT INTO cb_proof_parent_new (id, name) SELECT id, name FROM cb_proof_parent;
DROP TABLE cb_proof_parent;
ALTER TABLE cb_proof_parent_new RENAME TO cb_proof_parent;
COMMIT;
PRAGMA foreign_keys = ON;
`);

const db = new Db(url, { authToken: token });
let ok = false;
try {
  migrate(db, dir);
  const rebuilt = db.all<{ name: string }>('PRAGMA table_info(cb_proof_parent)').some((c) => c.name === 'note');
  const held = db.get<{ n: number }>('SELECT COUNT(*) AS n FROM cb_proof_child c JOIN cb_proof_parent p ON p.id = c.parent_id')?.n === 1;
  ok = rebuilt && held;
  console.log(ok ? 'PASS: the table-rebuilding migration applied on Turso, and the reference held.' : `FAIL: rebuilt ${String(rebuilt)}, reference held ${String(held)}.`);
} catch (e) {
  console.log(`FAIL: ${e instanceof Error ? e.message.replace(url, '<the address>') : 'an error'}`);
} finally {
  // Leave nothing behind: the child first, then the parent, then the two records.
  try { db.execDdl('PRAGMA foreign_keys = OFF; DROP TABLE IF EXISTS cb_proof_child; DROP TABLE IF EXISTS cb_proof_parent; DROP TABLE IF EXISTS cb_proof_parent_new; PRAGMA foreign_keys = ON;'); } catch { console.log('Note: the throwaway tables could not all be dropped; drop cb_proof_child and cb_proof_parent by hand.'); }
  for (const n of names) { try { db.run('DELETE FROM schema_migrations WHERE filename = ?', [n]); } catch { /* left: harmless, never a real file name */ } }
  db.close();
  rmSync(dir, { recursive: true, force: true });
}
process.exit(ok ? 0 : 1);
