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
 *   node src/cli.ts sweep-enquiries   delete every closed website enquiry past its period (ENQUIRY_RETENTION, Phase 153c; off, so none)
 *   node src/cli.ts import-premises <CQC_CARE_DIRECTORY|NHS_ODS_DENTAL|NHS_ODS_GP> <file> --by <user id>   healthcare premises, no names (Phase 153c)
 *   node src/cli.ts sector-ranges     propose each sector's range from approved survey packs; changes nothing (Phase 153e)
 *   node src/cli.ts sweep-land-boundaries   delete every kept land boundary file past the licence's 35 days
 *   node src/cli.ts seal-app-secrets  seal every authenticator app secret still kept as text (CAPREBATE_MFA_KEY, Phase 151k)
 *   CAPREBATE_LIVE_SMOKE=1 node src/cli.ts smoke <SOURCE> --who W --why Y   one logged test lookup (Phase 151g)
 *   node src/cli.ts smoke-switched-on <SOURCE> --who W --why Y   record a switch-on; the count of three starts again
 *   CAPREBATE_LIVE_SMOKE=1 node src/cli.ts smoke HMLR_INSPIRE --who W --why Y   one council's land boundary file, the same way (Phase 151l)
 *   CAPREBATE_LOCAL_ZOOM=1 node src/cli.ts zoom-call-length <meeting id>   ask Zoom how long one call lasted (Phase 156d)
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
import { EMAIL_SENDING, auditMailConnections, dispatchOutbox, emailPlaceRefusal, smtpLoginFromKeyFile, smtpProvider } from './stubs/email-provider.ts';
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
import { zoomPastCall } from './connectors/zoom.ts';

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

  if (cmd === 'sweep-enquiries') {
    /* PHASE 153c (Word question 222). ENQUIRY_RETENTION is off, so this deletes nothing and says why. */
    const db = new Db(DEFAULT_DB);
    try {
      const { sweepEnquiries, ENQUIRY_RETENTION } = await import('./web/enquiry-retention.ts');
      const r = sweepEnquiries({ db, audit: new AuditLog(db), now: () => new Date().toISOString(), newId: () => randomUUID() }, ENQUIRY_RETENTION, null);
      console.log(r.state === 'OFF' ? `Closed enquiries are not being cleaned up yet:\n  ${r.missing.join('\n  ')}`
        : `${r.deleted} closed website enquir${r.deleted === 1 ? 'y' : 'ies'} deleted because their time was up; ${r.funnel_leads_due_not_deleted} lost funnel lead${r.funnel_leads_due_not_deleted === 1 ? '' : 's'} past the period, not deleted (no path yet).`);
      return 0;
    } finally {
      db.close();
    }
  }

  if (cmd === 'import-premises') {
    /* PHASE 153c (Word question 183). Business name, address, sector and source only; a name that may be a person's is
       held back. Nothing reads the list to contact anyone. */
    const [source, file] = [process.argv[3], process.argv[4]];
    const byAt = process.argv.indexOf('--by');
    const by = byAt > 0 ? process.argv[byAt + 1] : undefined;
    const { importPremises, PREMISES_SOURCES } = await import('./web/premises-import.ts');
    if (source === undefined || !(source in PREMISES_SOURCES) || file === undefined || by === undefined) {
      console.error(`Usage: node src/cli.ts import-premises <${Object.keys(PREMISES_SOURCES).join('|')}> <file> --by <user id>`);
      return 1;
    }
    const { readFileSync } = await import('node:fs');
    const db = new Db(DEFAULT_DB);
    try {
      const user = db.get<{ role: string }>('SELECT role FROM users WHERE id = ? AND disabled_at IS NULL', [by]);
      if (user === undefined || user.role !== 'ADMIN') { console.error('Only an active Admin may import premises.'); return 1; }
      const r = importPremises({ db, audit: new AuditLog(db), now: () => new Date().toISOString(), newId: () => randomUUID() },
        source as keyof typeof PREMISES_SOURCES, readFileSync(file, 'utf8'), { id: by, role: user.role });
      console.log(`${r.kept} kept, ${r.already_held} already held, ${r.held_back_may_name_a_person} held back (the name may be a person's), ${r.skipped_unreadable} unreadable, ${r.skipped_not_our_sector} not a sector we serve.`);
      return 0;
    } finally {
      db.close();
    }
  }

  if (cmd === 'import-register') {
    /* PHASE 155 (lines 1-2). The Welsh or Scottish care regulator's downloaded list into a table on this server
       (src/web/register-files.ts). Importing switches nothing on: each lookup stays behind its own switch, off. */
    const [source, file] = [process.argv[3], process.argv[4]];
    const byAt = process.argv.indexOf('--by');
    const by = byAt > 0 ? process.argv[byAt + 1] : undefined;
    const { importRegisterFile, decodeRegisterFile, FILE_SOURCES } = await import('./web/register-files.ts');
    if (source === undefined || !(source in FILE_SOURCES) || file === undefined || by === undefined) {
      console.error(`Usage: node src/cli.ts import-register <${Object.keys(FILE_SOURCES).join('|')}> <file> --by <user id>`);
      for (const f of Object.values(FILE_SOURCES)) console.error(`  ${f.source_id}: ${f.download}`);
      return 1;
    }
    const { readFileSync } = await import('node:fs');
    const db = new Db(DEFAULT_DB);
    try {
      const user = db.get<{ role: string }>('SELECT role FROM users WHERE id = ? AND disabled_at IS NULL', [by]);
      if (user === undefined || user.role !== 'ADMIN') { console.error('Only an active Admin may import a register file.'); return 1; }
      const id = source as keyof typeof FILE_SOURCES;
      const r = importRegisterFile({ db, audit: new AuditLog(db), now: () => new Date().toISOString() },
        id, decodeRegisterFile(readFileSync(file), id), file, { id: by, role: user.role });
      console.log(`${r.kept} services kept, ${r.skipped_unreadable} skipped (no reference, or no postcode we can read), ${r.replaced} replaced from the last import. The lookup is still switched off.`);
      return 0;
    } catch (e) {
      console.error(e instanceof Error ? e.message : String(e));
      return 1;
    } finally {
      db.close();
    }
  }

  if (cmd === 'import-bcis-index') {
    /* PHASE 155 (line 4). The BCIS index from a file Lakhbir downloads, kept OUTSIDE the repository (src/web/bcis-index.ts). */
    const file = process.argv[3];
    if (file === undefined) { console.error('Usage: node src/cli.ts import-bcis-index <the CSV downloaded from BCIS>'); return 1; }
    const { readFileSync } = await import('node:fs');
    const { importBcisIndex } = await import('./web/bcis-index.ts');
    const r = importBcisIndex(readFileSync(file, 'utf8'), file, new Date().toISOString());
    if (!r.ok) { console.error(r.why); return 1; }
    console.log(`${r.points} index points, ${r.from} to ${r.to}, kept at ${r.path}${r.passed_over === 0 ? '' : ` (${r.passed_over} row${r.passed_over === 1 ? '' : 's'} with no figure passed over)`}. ` +
      'The survey pack does not use it yet: wiring the cost model into the pack is Phase 157.');
    return 0;
  }

  if (cmd === 'sector-ranges') {
    /* PHASE 153e (Word question 138). Reads the approved survey packs and proposes a range per sector, supported living
       per trigger. It changes no band: a person changes the engine, with the surveyor's agreement. */
    const db = new Db(DEFAULT_DB);
    try {
      const { proposeRanges } = await import('./web/sector-ranges.ts');
      const r = proposeRanges(db);
      if (r.proposals.length === 0) console.log('No approved survey pack yet, so there is nothing to propose.');
      for (const p of r.proposals) console.log(`${p.sector}${p.trigger === null ? '' : ` (${p.trigger})`}: ${p.words}`);
      if (r.left_out > 0) console.log(`${String(r.left_out)} approved pack(s) left out: no price paid or no qualifying figure.`);
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
      // 2 Oct 2026: only the test website sends (src/connectors/place.ts), unless started with CAPREBATE_LOCAL_EMAIL=1.
      const place = emailPlaceRefusal({ live: true });
      if (place !== null) { console.log(`Emails are not being sent: ${place}`); return 0; }
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

  /* PHASE 156d, 5 October 2026. Ask Zoom how long ONE call lasted and how many joined: Phase 156d's step B1, to learn
     whether our free Zoom plan gives it. Read only; it makes, moves and keeps nothing, and prints two numbers or Zoom's
     own code and words, never a name or an email. Like every Zoom call from a copy that is not the test website, it
     needs CAPREBATE_LOCAL_ZOOM=1 (src/connectors/zoom.ts, zoomPlaceRefusal). The audit line goes to a scratch log. */
  if (cmd === 'zoom-call-length') {
    const meeting = (process.argv[3] ?? '').replace(/\s+/g, '');
    const db = new Db(':memory:');
    try {
      migrate(db, MIGRATIONS_DIR);
      const r = await zoomPastCall({ audit: new AuditLog(db), now: () => new Date().toISOString(), transport: liveTransport, secrets: processSecrets() }, meeting);
      console.log(r.state === 'FOUND'
        ? `FOUND: the call lasted ${r.minutes} minute${r.minutes === 1 ? '' : 's'}; ${r.people === null ? 'Zoom did not say how many joined' : `${r.people} joined`}.`
        : `${r.state}: ${r.why}${r.zoom_code === undefined ? '' : ` (Zoom's code ${r.zoom_code})`}`);
      return r.state === 'FOUND' ? 0 : 2;
    } finally {
      db.close();
    }
  }

  console.error('usage: node src/cli.ts <migrate|seed|verify-audit|sweep-originals|sweep-messages|sweep-land-boundaries|send-outbox|read-mailbox|smoke|smoke-switched-on|zoom-call-length>');
  return 1;
}

main().then((c) => process.exit(c), (e: unknown) => {
  console.error(e instanceof Error ? e.message : String(e));
  process.exit(1);
});
