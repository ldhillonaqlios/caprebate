/**
 * The documented commands. A clean checkout runs these and nothing else.
 *
 *   npm install
 *   npm run migrate      create or update caprebate.db
 *   npm run seed         invented data + one user per role
 *   npm run verify-audit recompute the audit log's hash chain; exit 1 if it is broken
 *   node src/cli.ts sweep-originals   delete every kept original whose time is up (KEEP_ORIGINALS; off, so none)
 *   node src/cli.ts send-outbox       send every email saved while sending was on (EMAIL_SENDING; off, so none)
 *   node src/cli.ts read-mailbox      read new replies to contactus@caprebate.com, read-only (INBOUND_EMAIL; off, so none)
 *   node src/cli.ts sweep-messages    delete every chat message past its period (MESSAGE_RETENTION; off, so none)
 *   npm start            the server
 *   npm run check        lint:sql, typecheck, tests
 */

import { buildApp } from './app.ts';
import { seed } from './seed.ts';
import { Db, migrate } from './db.ts';
import { MIGRATIONS_DIR } from './app.ts';
import { AuditLog } from './audit.ts';
import { join } from 'node:path';
import { FsObjectStore } from './web/objectstore.ts';
import { sealKeyFromEnv } from './web/originals.ts';
import { openKeptOriginal, sweepOriginals } from './web/uploads.ts';
import { EMAIL_SENDING, auditMailConnections, dispatchOutbox, smtpLoginFromKeyFile, smtpProvider } from './stubs/email-provider.ts';
import { INBOUND_EMAIL, imapLoginFromKeyFile, imapMailbox } from './stubs/email-inbound.ts';
import { readMailbox } from './web/inbound-email.ts';
import { MESSAGE_RETENTION, sweepMessages } from './web/message-retention.ts';
import { randomUUID } from 'node:crypto';

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

  if (cmd === 'sweep-originals') {
    /* PHASE 140. KEEP_ORIGINALS is off, so no original is ever kept and this deletes nothing. It is here so the day the
       switch goes on, a scheduled run of this one line is all the hosting needs to add. */
    const db = new Db(DEFAULT_DB);
    try {
      const store = new FsObjectStore({ root: process.env.CAPREBATE_DOCS ?? join(import.meta.dirname, '..', '.documents'), sealKey: sealKeyFromEnv() });
      const n = await sweepOriginals({ db, store, now: () => new Date().toISOString(), audit: new AuditLog(db) }, null);
      console.log(`${n} kept original${n === 1 ? '' : 's'} deleted because ${n === 1 ? 'its' : 'their'} time was up.`);
      return 0;
    } finally {
      db.close();
    }
  }

  if (cmd === 'sweep-messages') {
    /* PHASE 142a. MESSAGE_RETENTION is off, so this deletes nothing and says why. The day the data protection officer
       sets the periods and it is switched on, a scheduled run of this one line applies them. */
    const db = new Db(DEFAULT_DB);
    try {
      const r = sweepMessages({ db, audit: new AuditLog(db), now: () => new Date().toISOString(), newId: () => randomUUID() }, MESSAGE_RETENTION, null);
      console.log(r.state === 'OFF' ? `Messages are not being cleaned up yet:\n  ${r.missing.join('\n  ')}`
        : `${r.client_messages} client message${r.client_messages === 1 ? '' : 's'}, ${r.team_messages} team message${r.team_messages === 1 ? '' : 's'} and ${r.emails} emailed repl${r.emails === 1 ? 'y' : 'ies'} deleted because their time was up.`);
      return 0;
    } finally {
      db.close();
    }
  }

  if (cmd === 'send-outbox') {
    /* PHASE 141. EMAIL_SENDING is off, so this sends nothing and says why. The day it is on, a scheduled run of this line
       retries anything that could not be sent at the moment it was saved. */
    const db = new Db(DEFAULT_DB);
    try {
      const login = smtpLoginFromKeyFile();
      const store = new FsObjectStore({ root: process.env.CAPREBATE_DOCS ?? join(import.meta.dirname, '..', '.documents'), sealKey: sealKeyFromEnv() });
      const audit = new AuditLog(db);
      const now = (): string => new Date().toISOString();
      const r = await dispatchOutbox({ db, now }, EMAIL_SENDING, login, login === null ? null : smtpProvider(login, undefined, undefined, auditMailConnections(audit, now)), async (id) => {
        const k = await openKeptOriginal({ db, store, now, audit }, { id: 'system', role: 'SYSTEM' }, id);
        return k === null ? null : { filename: k.filename, content_type: 'application/octet-stream', bytes: k.bytes };
      });
      console.log(r.state === 'OFF' ? `Emails are not being sent yet:\n  ${r.missing.join('\n  ')}` : `${r.sent} sent, ${r.failed} not sent, ${r.refused} refused.`);
      return 0;
    } finally {
      db.close();
    }
  }

  if (cmd === 'read-mailbox') {
    /* PHASE 142. INBOUND_EMAIL is off, so this reads nothing and says why. The day it is on, a scheduled run of this line
       files each reply that answers one of our emails onto its company's chat, and queues the rest for staff. */
    const db = new Db(DEFAULT_DB);
    try {
      const login = imapLoginFromKeyFile();
      const audit = new AuditLog(db);
      const now = (): string => new Date().toISOString();
      const r = await readMailbox({ db, audit, now, newId: () => randomUUID() },
        INBOUND_EMAIL, login, login === null ? null : imapMailbox(login, undefined, undefined, auditMailConnections(audit, now)));
      console.log(r.state === 'OFF' ? `Replies are not being read yet:\n  ${r.missing.join('\n  ')}`
        : `${r.read} read: ${r.filed} filed, ${r.do_not_contact} from a company marked do not contact (recorded, nothing sent), ${r.queued} waiting for staff, ${r.bounces} delivery report${r.bounces === 1 ? '' : 's'} (recorded as bounces).`);
      return 0;
    } finally {
      db.close();
    }
  }

  console.error('usage: node src/cli.ts <migrate|seed|verify-audit|sweep-originals|send-outbox|read-mailbox>');
  return 1;
}

main().then((c) => process.exit(c), (e: unknown) => {
  console.error(e instanceof Error ? e.message : String(e));
  process.exit(1);
});
