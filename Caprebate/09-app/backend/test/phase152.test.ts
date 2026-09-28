/**
 * PHASE 152 (the sweep, 28 September 2026) — THE SIGN-UP CONFIRMATION LINK LEAVES THE OUTBOX ONCE IT HAS GONE.
 *
 * Phase 151k took a SENT sign-in code and a SENT password reset link out of the outbox (SENT_SECRET_KINDS, migration
 * 058), as it was asked. The email that confirms a new client login (kind ACCOUNT_VERIFY, src/web/signup.ts) carries a
 * link of the same sort: it works once (client_signups.verified_at) and for 24 hours (VERIFY_TTL_MS), and anybody who
 * can read the outbox could open it first. Only its hash is kept in client_signups, so taking the words out of the
 * outbox does not stop the link working for the person it was sent to.
 *
 *   1. sent: its words become the fixed sentence; who, when, the subject and the kind stay;
 *   2. the never-edited rule lets exactly that edit through for ACCOUNT_VERIFY, and nothing else;
 *   3. end to end: a real sign-up request, sent, blanked - and the link from the email still makes the login, once;
 *   4. while sending is off the email keeps its words (the only copy);
 *   (and, below, A MIGRATION AND ITS RECORD AS ONE STEP: src/db.ts, migrate - cut off part way on a file database,
 *   the next start finishes it; a file in a shape the runner does not know is refused with a sentence)
 *   5. the two kinds 058 named are still blanked, every other email keeps its words, and 058's sentence is no
 *      longer a way through the rule (migration 060 changes the trigger only: a row 058 blanked is not touched).
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createApp } from '../src/server.ts';
import { seed } from '../src/seed.ts';
import { outboxTransport } from '../src/stubs/email.ts';
import * as EP from '../src/stubs/email-provider.ts';
import { offerSignup, requestSignup, confirmSignup } from '../src/web/signup.ts';
import type { EmailSending, SmtpLogin } from '../src/stubs/email-provider.ts';
import { Db as TheDb, migrate, pendingMigrations } from '../src/db.ts';
import type { Db } from '../src/db.ts';

const NOW = '2026-09-28T16:00:00.000Z';
const ON: EmailSending = Object.freeze({
  enabled: true, provider: 'SMTP', named_in_privacy_notice: true, named_in_engagement_letter: true, mailbox_and_dns_ready: true,
  question: EP.EMAIL_PROVIDER_QUESTION,
});
const LOGIN: SmtpLogin = Object.freeze({ host: '127.0.0.1', port: 1, user: 'contact@caprebate.co.uk', password: 'not-a-real-password' });
const noFiles = async (): Promise<null> => null;
const OLD_058_SENTENCE = 'This email held a sign-in code or a password reset link. It was sent, and then its words were removed so the code or link is not kept.';

async function world() {
  const made = await createApp(':memory:', { documentRoot: mkdtempSync(join(tmpdir(), 'cb-152-')), now: () => NOW });
  await seed(made.app.db, made.app.hasher, made.app.now);
  return { app: made.app, db: made.app.db, close: () => made.server.close() };
}
const spy = () => ({ id: 'SPY', deliver: async () => ({ ok: true as const, ref: 'x' }) });
const bodyOf = (db: Db, id: string) =>
  db.get<{ body: string; to_email: string; subject: string; kind: string; sent_at: string | null }>(
    'SELECT body, to_email, subject, kind, sent_at FROM outbox WHERE id = ?', [id])!;

describe('Phase 152 · the sign-up confirmation link is not kept in the outbox once it has been sent', () => {
  test('ACCOUNT_VERIFY is one of the kinds taken out', () => {
    assert.ok(EP.SENT_SECRET_KINDS.includes('ACCOUNT_VERIFY'), `SENT_SECRET_KINDS is ${JSON.stringify(EP.SENT_SECRET_KINDS)}`);
  });

  test('sent: its words become the fixed sentence; who it went to, when, the subject and the kind stay', async () => {
    const w = await world();
    try {
      const on = outboxTransport(w.db, () => 'v-1', () => NOW, () => true);
      on.send({ to_email: 'client@example.invalid', subject: 'Confirm your Cap Rebate login', kind: 'ACCOUNT_VERIFY',
        body: 'Open the link below to finish your login.\n\nhttp://localhost/account/verify?token=00ff00ff' });
      const r = await EP.dispatchOutbox({ db: w.db, now: () => NOW }, ON, LOGIN, spy(), noFiles);
      assert.equal(r.state, 'RAN');
      const x = bodyOf(w.db, 'v-1');
      assert.equal(x.body, EP.SENT_SECRET_BODY, 'the confirmation link kept its words after it was sent');
      assert.doesNotMatch(x.body, /token=/);
      assert.equal(x.to_email, 'client@example.invalid');
      assert.equal(x.subject, 'Confirm your Cap Rebate login');
      assert.equal(x.kind, 'ACCOUNT_VERIFY');
      assert.equal(x.sent_at, NOW);
    } finally { w.close(); }
  });

  test('the never-edited rule lets exactly that edit through for ACCOUNT_VERIFY, and no other', async () => {
    const w = await world();
    try {
      let n = 0;
      const on = outboxTransport(w.db, () => `t-${++n}`, () => NOW, () => true);
      const link = on.send({ to_email: 'client@example.invalid', subject: 's', body: 'token=abc', kind: 'ACCOUNT_VERIFY' }).id!;
      const refused = (sql: string, args: unknown[]) => assert.throws(() => w.db.run(sql, args as never[]), /never edited/);
      refused('UPDATE outbox SET body = ? WHERE id = ?', [EP.SENT_SECRET_BODY, link]); // not sent yet: the only copy
      w.db.run('UPDATE outbox SET sent_at = ? WHERE id = ?', [NOW, link]);
      refused('UPDATE outbox SET body = ? WHERE id = ?', ['anything else', link]);
      refused('UPDATE outbox SET subject = ? WHERE id = ?', ['changed', link]);
      w.db.run('UPDATE outbox SET body = ? WHERE id = ?', [EP.SENT_SECRET_BODY, link]);
      assert.equal(bodyOf(w.db, link).body, EP.SENT_SECRET_BODY);
    } finally { w.close(); }
  });

  test('end to end: a real sign-up request is sent and blanked, and the link from the email still makes the login once', async () => {
    const w = await world();
    try {
      const business = w.db.get<{ id: string }>('SELECT id FROM businesses ORDER BY id LIMIT 1')!.id;
      let k = 0;
      // sending on, as it would be on a live deploy, so the request is saved as one to send
      (w.app as { email: ReturnType<typeof outboxTransport> }).email = outboxTransport(w.db, () => `e2e-${++k}`, () => NOW, () => true);
      const offer = offerSignup(w.app, () => `su-${++k}`, business, null);
      const asked = await requestSignup(w.app, 'http://localhost', new URLSearchParams({
        offer, email: 'new.client@example.invalid', display_name: 'An Invented Client', password: 'a long invented password 152' }));
      assert.deepEqual(asked, { ok: true });
      const mail = w.db.get<{ id: string; body: string }>("SELECT id, body FROM outbox WHERE kind = 'ACCOUNT_VERIFY' ORDER BY rowid DESC LIMIT 1")!;
      const raw = /token=([0-9a-f]+)/.exec(mail.body)?.[1] ?? '';
      assert.ok(raw.length > 0, 'the email carried no link');
      const r = await EP.dispatchOutbox({ db: w.db, now: () => NOW }, ON, LOGIN, spy(), noFiles, mail.id);
      assert.equal(r.state, 'RAN');
      assert.equal(bodyOf(w.db, mail.id).body, EP.SENT_SECRET_BODY);
      assert.ok(!JSON.stringify(w.db.all('SELECT * FROM outbox')).includes(raw), 'the link is still somewhere in the outbox');
      assert.deepEqual(confirmSignup(w.app, raw), { ok: true });
      assert.equal(confirmSignup(w.app, raw).ok, false, 'the link worked twice');
    } finally { w.close(); }
  });

  test('while sending is off the confirmation email keeps its words: it is the only copy', async () => {
    const w = await world();
    try {
      const off = outboxTransport(w.db, () => 'v-off', () => NOW);
      off.send({ to_email: 'client@example.invalid', subject: 's', body: 'token=keepme', kind: 'ACCOUNT_VERIFY' });
      const r = await EP.dispatchOutbox({ db: w.db, now: () => NOW }, EP.EMAIL_SENDING, LOGIN, spy(), noFiles);
      assert.equal(r.state, 'OFF');
      assert.equal(bodyOf(w.db, 'v-off').body, 'token=keepme');
    } finally { w.close(); }
  });

  test('058\'s two kinds are still taken out, every other email keeps its words, and 058\'s sentence is no longer a way through', async () => {
    const w = await world();
    try {
      let n = 0;
      const on = outboxTransport(w.db, () => `o-${++n}`, () => NOW, () => true);
      const code = on.send({ to_email: 'a@example.invalid', subject: 's', body: 'code 123456', kind: 'SIGN_IN_CODE' }).id!;
      const reset = on.send({ to_email: 'a@example.invalid', subject: 's', body: 'token=aa', kind: 'PASSWORD_RESET' }).id!;
      const note = on.send({ to_email: 'a@example.invalid', subject: 's', body: 'A task is due.', kind: 'NOTIFICATION' }).id!;
      await EP.dispatchOutbox({ db: w.db, now: () => NOW }, ON, LOGIN, spy(), noFiles);
      assert.equal(bodyOf(w.db, code).body, EP.SENT_SECRET_BODY);
      assert.equal(bodyOf(w.db, reset).body, EP.SENT_SECRET_BODY);
      assert.equal(bodyOf(w.db, note).body, 'A task is due.');
      // 058's sentence is no longer a way through: the rule lets through the one sentence the code writes, and no other
      const late = on.send({ to_email: 'a@example.invalid', subject: 's', body: 'code 654321', kind: 'SIGN_IN_CODE' }).id!;
      w.db.run('UPDATE outbox SET sent_at = ? WHERE id = ?', [NOW, late]);
      assert.notEqual(EP.SENT_SECRET_BODY, OLD_058_SENTENCE);
      assert.throws(() => w.db.run('UPDATE outbox SET body = ? WHERE id = ?', [OLD_058_SENTENCE, late]), /never edited/);
    } finally { w.close(); }
  });
});

/* ================================================================== a migration and its record, as one step */

const MIGRATIONS = join(import.meta.dirname, '..', 'migrations');
const DB_TS = pathToFileURL(join(import.meta.dirname, '..', 'src', 'db.ts')).href;

/**
 * Start a migration run on a FILE database in a child process and kill it (SIGKILL, no clean-up of any kind) the
 * moment the SQL holding `mark` has run - before migrate() writes anything after it. That is the window the test
 * website's first start on Turso fell into on 28 September 2026, when a 30-second limit stopped it part way.
 */
function killPartWay(file: string, mark: string) {
  const script = `
    import { Db, migrate } from ${JSON.stringify(DB_TS)};
    const db = new Db(${JSON.stringify(file)});
    const run = db.execDdl.bind(db);
    db.execDdl = (sql) => { run(sql); if (sql.includes(${JSON.stringify(mark)})) process.kill(process.pid, 'SIGKILL'); };
    migrate(db, ${JSON.stringify(MIGRATIONS)});
    console.log('FINISHED - the kill never came');
  `;
  return spawnSync(process.execPath, ['--input-type=module', '-e', script], { encoding: 'utf8', timeout: 120_000 });
}

describe('Phase 152 · a migration and its record land together or not at all', () => {
  for (const [label, mark, table] of [
    ['a plain file (015, which makes claim_facts - the table the test website was left holding)', 'CREATE TABLE claim_facts (', 'claim_facts'],
    ['a file that runs its own transaction (016, foreign keys off around it)', 'CREATE TABLE invoice_credit_notes (', 'invoice_credit_notes'],
  ] as const) {
    test(`cut off part way through ${label}: the next start finishes it`, () => {
      const dir = mkdtempSync(join(tmpdir(), 'cb-152-mig-'));
      const file = join(dir, 'cut-off.db');
      const r = killPartWay(file, mark);
      assert.equal(r.signal, 'SIGKILL', `the run was not cut off: ${r.status} ${r.stdout}${r.stderr}`);
      const db = new TheDb(file);
      try {
        assert.ok(pendingMigrations(db, MIGRATIONS).length > 0, 'nothing was left to do - the cut came too late to prove anything');
        migrate(db, MIGRATIONS); // before Phase 152 this threw: "table ... already exists"
        assert.deepEqual(pendingMigrations(db, MIGRATIONS), []);
        assert.equal(db.get<{ n: number }>("SELECT COUNT(*) AS n FROM sqlite_master WHERE type = 'table' AND name = ?", [table])?.n, 1);
        assert.equal(db.get<{ foreign_keys: number }>('PRAGMA foreign_keys')?.foreign_keys, 1, 'foreign keys were left off');
        assert.deepEqual(db.all('PRAGMA foreign_key_check'), []);
      } finally { db.close(); }
    });
  }

  test('a file in a shape the runner does not know is refused with a sentence, and nothing from it lands', () => {
    const dir = mkdtempSync(join(tmpdir(), 'cb-152-shape-'));
    const cases: [string, string, RegExp][] = [
      ['two-begins.sql', 'PRAGMA foreign_keys = OFF;\nBEGIN;\nCREATE TABLE t1 (a TEXT);\nCOMMIT;\nBEGIN;\nCREATE TABLE t2 (a TEXT);\nCOMMIT;\nPRAGMA foreign_keys = ON;\n', /2 "BEGIN;" line\(s\) and 2 "COMMIT;"/],
      ['commit-only.sql', 'CREATE TABLE t3 (a TEXT);\nCOMMIT;\n', /0 "BEGIN;" line\(s\) and 1 "COMMIT;"/],
      ['begin-transaction.sql', 'BEGIN TRANSACTION;\nCREATE TABLE t4 (a TEXT);\nEND TRANSACTION;\n', /not the one shape/],
      ['something-before.sql', 'CREATE TABLE t5 (a TEXT);\nBEGIN;\nCREATE TABLE t6 (a TEXT);\nCOMMIT;\n', /before its "BEGIN;" line/],
    ];
    for (const [name, sql, why] of cases) {
      const sub = join(dir, name.replace('.sql', ''));
      mkdirSync(sub);
      writeFileSync(join(sub, '001-' + name), sql);
      const db = new TheDb(':memory:');
      try {
        assert.throws(() => migrate(db, sub), (e: Error) => why.test(e.message) && /was not run/.test(e.message) && /Nothing from it was applied\./.test(e.message), name);
        assert.equal(db.get<{ n: number }>("SELECT COUNT(*) AS n FROM sqlite_master WHERE type = 'table' AND name LIKE 't_'")?.n, 0, `${name}: something landed`);
        assert.equal(db.get<{ n: number }>('SELECT COUNT(*) AS n FROM schema_migrations')?.n, 0);
      } finally { db.close(); }
    }
  });

  test('a clean run still applies every file once, records each, and leaves foreign keys on', () => {
    const db = new TheDb(':memory:');
    try {
      const all = migrate(db, MIGRATIONS);
      assert.ok(all.length >= 60);
      assert.deepEqual(migrate(db, MIGRATIONS), []);
      assert.equal(db.get<{ n: number }>('SELECT COUNT(*) AS n FROM schema_migrations')?.n, all.length);
      assert.equal(db.get<{ foreign_keys: number }>('PRAGMA foreign_keys')?.foreign_keys, 1);
    } finally { db.close(); }
  });
});
