/**
 * The documented commands. A clean checkout runs these and nothing else.
 *
 *   npm install
 *   npm run migrate      create or update caprebate.db
 *   npm run seed         invented data + one user per role
 *   npm run verify-audit recompute the audit log's hash chain; exit 1 if it is broken
 *   node src/cli.ts sweep-originals   delete every kept original whose time is up (KEEP_ORIGINALS; off, so none)
 *   node src/cli.ts send-outbox       send every email saved while sending was on (EMAIL_SENDING; off, so none)
 *   node src/cli.ts read-mailbox      read new replies to contact@caprebate.co.uk, read-only (INBOUND_EMAIL; off, so none)
 *   node src/cli.ts sweep-messages    delete every chat message past its period (MESSAGE_RETENTION; off, so none)
 *   node src/cli.ts sweep-land-boundaries   delete every kept land boundary file past the licence's 35 days
 *   node src/cli.ts seal-app-secrets  seal every authenticator app secret still kept as text (CAPREBATE_MFA_KEY, Phase 151k)
 *   CAPREBATE_LIVE_SMOKE=1 node src/cli.ts smoke <SOURCE> --who W --why Y   one logged test lookup (Phase 151g)
 *   node src/cli.ts smoke-switched-on <SOURCE> --who W --why Y   record a switch-on; the count of three starts again
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
import { inspireStoreFromEnv, INSPIRE_KEEP_DAYS } from './connectors/inspire-store.ts';
import { randomUUID } from 'node:crypto';
import { liveTransport } from './connectors/http.ts';
import { runSmokeCommand, runSwitchedOnCommand } from './connectors/test-lookups.ts';
import { processSecrets } from './secrets.ts';
import { mfaKeyFrom, MFA_KEY_NAME, sealTextSecrets } from './mfa-seal.ts';
import { postcodeStore } from './web/postcode.ts';

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

  if (cmd === 'seal-app-secrets') {
    /* PHASE 151k. The key comes from the key file (src/secrets.ts), never from this command line. With no key set nothing
       changes; a key that is not right changes nothing and says so. Never prints a secret or the key. */
    const k = mfaKeyFrom(processSecrets());
    const db = new Db(DEFAULT_DB);
    try {
      const r = sealTextSecrets(db, k);
      if (r.state === 'NONE') { console.log(`No ${MFA_KEY_NAME} is set in the key file, so nothing was sealed. App secrets stay as text.`); return 0; }
      if (r.state === 'BAD') { console.error(`${MFA_KEY_NAME} is set but is not 32 bytes written as base64, so nothing was sealed.`); return 1; }
      new AuditLog(db).append({ at: new Date().toISOString(), kind: 'APP_SECRETS_SEALED', outcome: 'ALLOWED', detail: { count: r.sealed } });
      console.log(`${r.sealed} authenticator app secret${r.sealed === 1 ? '' : 's'} sealed. Any already sealed were left as they were.`);
      return 0;
    } finally {
      db.close();
    }
  }

  if (cmd === 'sweep-land-boundaries') {
    /* PHASE 151a. A kept council file is deleted when it is next asked for after its time; this deletes the ones
       nobody asks for again, so none outlives the licence's days. With no store set up, nothing is kept and nothing is
       deleted. A daily scheduled run of this one line is all the hosting needs to add. */
    const store = inspireStoreFromEnv();
    if (store === null) {
      console.log('No land boundary store is set up (CAPREBATE_INSPIRE_STORE_DIR), so no file is kept and none was deleted.');
      return 0;
    }
    const n = store.sweep(new Date().toISOString());
    console.log(`${n} land boundary file${n === 1 ? '' : 's'} deleted because ${n === 1 ? 'it was' : 'they were'} kept longer than ${INSPIRE_KEEP_DAYS} days.`);
    return 0;
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

  /* ------------------------------------------------------------------ *
   * PHASE 146g — THE LIVE SMOKE TEST. Does this account, this key and this address actually work?
   *
   * Every suite runs on recorded answers with no key and no network, which proves the code and proves nothing about
   * an account somebody has just opened. This makes ONE real call to ONE service and says whether the service took
   * it. The handover page in the Developer Spec names this command in every row.
   *
   * IT NEEDS CAPREBATE_LIVE_SMOKE=1, the same shape as the seed's own confirmation: a live call is not something to
   * make by mistyping a command. It opens no gate and changes no switch that ships.
   *
   * PHASE 151g, 28 September 2026: IT NOW KEEPS LAKHBIR'S FIVE CONDITIONS (Word question 170, answered 25 September
   * 2026) as refusals, not as a printed warning — who and why required, a log outside the repository that keeps only
   * the connector, the time, PASS or NO, who and why, three lookups per connector each time it is switched on, never
   * a client's values, and never a demonstration. src/connectors/test-lookups.ts does all of it; this hands it the
   * live transport and the key file.
   * ------------------------------------------------------------------ */
  if (cmd === 'smoke') {
    return runSmokeCommand(process.argv.slice(3), process.env, {
      now: () => new Date().toISOString(), out: (l) => console.log(l), err: (l) => console.error(l),
      transport: liveTransport, secrets: processSecrets(), postcodeStore: postcodeStore(),
    });
  }

  /* PHASE 151g. A person records that a connector has been switched on: one line in the test lookup log, and the only
     way that connector's count of three test lookups starts again. It makes no call and changes no switch. */
  if (cmd === 'smoke-switched-on') {
    return runSwitchedOnCommand(process.argv.slice(3), process.env, {
      now: () => new Date().toISOString(), out: (l) => console.log(l), err: (l) => console.error(l),
    });
  }

  console.error('usage: node src/cli.ts <migrate|seed|verify-audit|sweep-originals|sweep-messages|sweep-land-boundaries|send-outbox|read-mailbox|smoke|smoke-switched-on>');
  return 1;
}

main().then((c) => process.exit(c), (e: unknown) => {
  console.error(e instanceof Error ? e.message : String(e));
  process.exit(1);
});
