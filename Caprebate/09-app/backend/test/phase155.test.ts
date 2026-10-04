/**
 * PHASE 155, 4 OCTOBER 2026 — THE SERVICES THE PLANS NAME BUT NOBODY HAS BUILT.
 *
 * Each line's tests were run on the code from before it and went red (04-phase-work/phase155/proofs/, OneDrive).
 * Recorded answers and invented rows only: nothing here reaches a real service.
 */
import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../src/server.ts';
import { secretsFromValues } from '../src/secrets.ts';
import * as IE from '../src/web/inbound-email.ts';

const PASSWORD = 'an-invented-password-155';
const IMAP_KEYS = { IONOS_IMAP_HOST: 'imap.ionos.co.uk', IONOS_IMAP_PORT: '993', IONOS_IMAP_USER: 'contact@caprebate.co.uk', IONOS_IMAP_PASSWORD: 'not-a-real-password' };
const TIMER_WORD = 'an-invented-timer-word-of-forty-characters';
/** Monday 5 October 2026, 10:00 in the UK (BST), and minutes after it. */
const MON_10 = '2026-10-05T09:00:00.000Z';
const plus = (iso: string, min: number) => new Date(Date.parse(iso) + min * 60_000).toISOString();

let made: Awaited<ReturnType<typeof createApp>>;
let base = '';
let now = MON_10;
before(async () => {
  made = await createApp(':memory:', { twoFactor: 'off', documentRoot: mkdtempSync(join(tmpdir(), 'cb-155-')), now: () => now });
  await new Promise<void>((r) => made.server.listen(0, '127.0.0.1', () => r()));
  const a = made.server.address();
  base = `http://127.0.0.1:${typeof a === 'object' && a !== null ? a.port : 0}`;
  const hash = await made.app.hasher.hash(PASSWORD);
  for (const [id, email, role] of [['u-155-admin', 'admin155@example.invalid', 'ADMIN'], ['u-155-sales', 'sales155@example.invalid', 'SALES']] as const) {
    made.app.db.run('INSERT INTO users (id,email,email_canonical,display_name,role,password_hash,created_at,updated_at,business_id) VALUES (?,?,?,?,?,?,?,?,NULL)',
      [id, email, email, `${role} 155`, role, hash, MON_10, MON_10]);
  }
});
after(() => made.close());

async function signIn(email: string): Promise<(path: string, init?: RequestInit) => Promise<{ status: number; body: string }>> {
  const r = await fetch(`${base}/login`, { method: 'POST', redirect: 'manual', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ email, password: PASSWORD }).toString() });
  const cookie = r.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ');
  return async (path, init = {}) => {
    const x = await fetch(base + path, { redirect: 'manual', ...init, headers: { ...(init.headers as Record<string, string> | undefined ?? {}), cookie } });
    return { status: x.status, body: await x.text() };
  };
}

const quietBox = { since: async () => [], one: async () => null, highestUid: async () => 7 };

/* ------------------------------------------------------------------ line 5 */

describe('line 5: Admin is told when email replies have not been read for over an hour in working hours', () => {
  test('never read, on a Monday morning, with reading on and its login set: warned', () => {
    made.app.secrets = secretsFromValues(IMAP_KEYS);
    assert.match(IE.repliesStale(made.app, MON_10) ?? '', /^Email replies have never been read in\. The outside timer that reads them \(cron-job\.org\) may have stopped/);
  });

  test('a read that worked clears it for an hour, and then it is back, saying when the last read was', async () => {
    made.app.secrets = secretsFromValues(IMAP_KEYS);
    made.app.mailbox = quietBox;
    try {
      now = MON_10;
      await IE.readRepliesIfDue(made.app, true);
      assert.equal(IE.repliesStale(made.app, plus(MON_10, 59)), null);
      assert.equal(IE.repliesStale(made.app, plus(MON_10, 60)), null);
      assert.match(IE.repliesStale(made.app, plus(MON_10, 61)) ?? '', /^Email replies were last read in at .*10:00.*, over an hour ago\./);
    } finally { delete made.app.mailbox; now = MON_10; }
  });

  test('outside working hours, at a weekend, or with no login set: no warning', () => {
    made.app.secrets = secretsFromValues(IMAP_KEYS);
    const lastOk = made.app.db.get<{ last_ok_at: string }>('SELECT last_ok_at FROM mailbox_reads WHERE id = 1')?.last_ok_at;
    assert.equal(lastOk, MON_10);
    assert.equal(IE.repliesStale(made.app, '2026-10-05T16:30:00.000Z'), null, '17:30 on Monday is after hours');
    assert.equal(IE.repliesStale(made.app, '2026-10-06T07:30:00.000Z'), null, '08:30 on Tuesday is before hours');
    assert.equal(IE.repliesStale(made.app, '2026-10-10T11:00:00.000Z'), null, 'Saturday');
    assert.notEqual(IE.repliesStale(made.app, '2026-10-06T08:00:00.000Z'), null, '09:00 on Tuesday, last read Monday 10:00');
    made.app.secrets = secretsFromValues({});
    assert.equal(IE.repliesStale(made.app, '2026-10-06T08:00:00.000Z'), null, 'no mailbox login: nothing is meant to be reading');
  });

  test('a failed read keeps the last good time and says the inbox could not be read; nothing of the error is kept', async () => {
    made.app.secrets = secretsFromValues(IMAP_KEYS);
    made.app.mailbox = { since: async () => { throw new Error('the mailbox refused contact@caprebate.co.uk'); }, one: async () => null, highestUid: async () => 7 };
    try {
      now = plus(MON_10, 90);
      await IE.readRepliesIfDue(made.app, true);
      const row = made.app.db.get<Record<string, unknown>>('SELECT * FROM mailbox_reads WHERE id = 1');
      assert.deepEqual(row, { id: 1, last_try_at: plus(MON_10, 90), last_ok_at: MON_10, last_failed: 1 });
      assert.match(IE.repliesStale(made.app, plus(MON_10, 90)) ?? '', /or the inbox could not be read on the last try/);
    } finally { delete made.app.mailbox; now = MON_10; }
  });

  test('the outside timer’s own call records the read (POST /hooks/read-replies)', async () => {
    made.app.secrets = secretsFromValues({ ...IMAP_KEYS, REPLY_TIMER_TOKEN: TIMER_WORD });
    made.app.mailbox = quietBox;
    try {
      now = plus(MON_10, 200);
      const r = await fetch(`${base}/hooks/read-replies`, { method: 'POST', headers: { authorization: `Bearer ${TIMER_WORD}` } });
      assert.equal(r.status, 200);
      assert.equal(made.app.db.get<{ last_ok_at: string }>('SELECT last_ok_at FROM mailbox_reads WHERE id = 1')?.last_ok_at, plus(MON_10, 200));
    } finally { delete made.app.mailbox; now = MON_10; }
  });

  test('Admin’s home shows the warning, on every view; Sales’s does not', async () => {
    made.app.secrets = secretsFromValues(IMAP_KEYS);
    now = plus(MON_10, 24 * 60);
    try {
      const admin = await signIn('admin155@example.invalid');
      for (const view of ['', '?view=admin', '?view=accounting']) {
        const page = (await admin(`/staff${view}`)).body;
        assert.match(page, /<div class="flag" role="alert" id="replies-stale"><strong>Email replies are not being read\.<\/strong>/, view);
      }
      const sales = await signIn('sales155@example.invalid');
      assert.doesNotMatch((await sales('/staff')).body, /replies-stale/);
    } finally { now = MON_10; made.app.secrets = secretsFromValues({}); }
  });
});

/* ------------------------------------------------------------------ line 4 */

describe('line 4: the BCIS index from a file Lakhbir downloads, kept outside the repository', () => {
  const FILE = 'Period,Index\n1Q 2024,380\n2Q 2024,384\nJan 2025,388\n2026-01,396\n';

  test('imported to a file outside the repository, read back in the cost model’s table shape, and the factor uses it', async () => {
    const { importBcisIndex, bcisIndexTable } = await import('../src/web/bcis-index.ts');
    const out = join(mkdtempSync(join(tmpdir(), 'cb-bcis-')), 'index.json');
    const env = { CAPREBATE_BCIS_INDEX_FILE: out };
    assert.deepEqual(bcisIndexTable(env), { table: null, why: 'no BCIS index has been imported: BCIS is not bought yet (Word question 218)' });
    const r = importBcisIndex(FILE, '/Users/someone/Downloads/bcis-tpi.csv', '2026-10-04T15:00:00.000Z', env);
    assert.deepEqual(r, { ok: true, path: out, points: 4, from: '2024-01', to: '2026-01', passed_over: 1 });
    const t = bcisIndexTable(env);
    assert.ok(t.table !== null);
    assert.equal(t.table.source, 'BCIS building price index, imported from bcis-tpi.csv on 2026-10-04');
    const { createRequire } = await import('node:module');
    const M = createRequire(import.meta.url)('../../../04-phase-work/phase9/caprebate-cost-model.cjs') as { indexFactorFromTable: (t: unknown, a: string, b: string) => { factor: number } };
    assert.equal(M.indexFactorFromTable(t.table, '2024-05-01', '2026-01-15').factor, 384 / 396);
  });

  test('a path inside the repository is refused, and nothing is written there', async () => {
    const { importBcisIndex } = await import('../src/web/bcis-index.ts');
    const { repositoryRoot } = await import('../src/secrets.ts');
    const inside = join(repositoryRoot(), 'bcis-index-155.json');
    const r = importBcisIndex(FILE, 'x.csv', '2026-10-04T15:00:00.000Z', { CAPREBATE_BCIS_INDEX_FILE: inside });
    assert.equal(r.ok, false);
    assert.match(r.ok ? '' : r.why, /may not be kept inside the repository/);
    const { existsSync } = await import('node:fs');
    assert.equal(existsSync(inside), false);
  });

  test('a file the cost model cannot read whole is refused whole, and an earlier good table is left as it was', async () => {
    const { importBcisIndex, bcisIndexTable } = await import('../src/web/bcis-index.ts');
    const out = join(mkdtempSync(join(tmpdir(), 'cb-bcis-')), 'index.json');
    const env = { CAPREBATE_BCIS_INDEX_FILE: out };
    assert.equal(importBcisIndex(FILE, 'good.csv', '2026-10-04T15:00:00.000Z', env).ok, true);
    const bad = importBcisIndex('2024-01,380\nSpring 2024,381\n', 'bad.csv', '2026-10-04T16:00:00.000Z', env);
    assert.equal(bad.ok, false);
    assert.match(bad.ok ? '' : bad.why, /not a month or a quarter/);
    assert.equal(bcisIndexTable(env).table?.points.length, 4);
  });
});
