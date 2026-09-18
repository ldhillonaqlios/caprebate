/**
 * The documented commands. A clean checkout runs these and nothing else.
 *
 *   npm install
 *   npm run migrate      create or update caprebate.db
 *   npm run seed         invented data + one user per role
 *   npm run verify-audit recompute the audit log's hash chain; exit 1 if it is broken
 *   npm start            the server
 *   npm run check        lint:sql, typecheck, tests
 */

import { buildApp } from './app.ts';
import { seed } from './seed.ts';
import { Db, migrate } from './db.ts';
import { MIGRATIONS_DIR } from './app.ts';
import { AuditLog } from './audit.ts';

const DEFAULT_DB = process.env.CAPREBATE_DB ?? 'caprebate.db';

async function main(): Promise<number> {
  const cmd = process.argv[2];

  if (cmd === 'migrate') {
    const db = new Db(DEFAULT_DB);
    const applied = migrate(db, MIGRATIONS_DIR);
    db.close();
    console.log(applied.length ? `applied: ${applied.join(', ')}` : 'already up to date');
    return 0;
  }

  if (cmd === 'seed') {
    /* SEEDING IS REFUSED UNLESS ASKED FOR EXPLICITLY. Invented data with known
       passwords must not arrive in a deployment because somebody forgot a flag. */
    if (process.env.CAPREBATE_ALLOW_SEED !== '1') {
      console.error('refusing to seed: set CAPREBATE_ALLOW_SEED=1 to confirm this is not production');
      return 1;
    }
    const app = await buildApp({ location: DEFAULT_DB });
    const r = await seed(app.db, app.hasher, app.now);
    app.close();
    console.log(`seeded ${r.businesses.length} invented businesses and ${r.users.length} users.`);
    console.log('All five roles share the development password below. Change it before anyone else can reach this.\n');
    for (const u of r.users) console.log(`  ${u.role.padEnd(11)} ${u.email}`);
    console.log(`\n  password: ${r.password}`);
    return 0;
  }

  if (cmd === 'verify-audit') {
    /* THE CRM FOLLOW-ON. `AuditLog.verify()` was called only by the tests. This reads the rows back from the database
       file and recomputes every hash from the genesis — it writes nothing, not even a line of its own, and prints the
       entry count and where the chain breaks, never an entry's detail. Exit 0 intact, 1 broken. */
    const db = new Db(DEFAULT_DB);
    try {
      const log = new AuditLog(db);
      const entries = log.entries().length;
      const v = log.verify();
      console.log(v.intact
        ? `audit log intact: ${entries} entries, every hash recomputed from the genesis and every link to the previous entry checked.`
        : `AUDIT LOG BROKEN at entry ${v.broken_at ?? '?'} of ${entries}: that entry's hash, or its link to the one before it, does not recompute.`);
      return v.intact ? 0 : 1;
    } finally {
      db.close();
    }
  }

  console.error('usage: node src/cli.ts <migrate|seed|verify-audit>');
  return 1;
}

main().then((c) => process.exit(c), (e: unknown) => {
  console.error(e instanceof Error ? e.message : String(e));
  process.exit(1);
});
