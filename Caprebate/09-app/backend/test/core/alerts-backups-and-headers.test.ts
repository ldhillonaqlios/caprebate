/**
 * PHASE 161n1d, 17 NOVEMBER 2026 — ALERTS, BACKUPS AND HEADERS, FROM ITRoadway'S SECOND CODE REVIEW (12 Nov 2026).
 *
 *   1  M-10  every timer run is written down; a run not ok emails the alert addresses (the audit chain broken at once);
 *            no good backup in 26 hours, and the database past its size, alert once a day; Connections shows each job
 *   2  M-09  the backup never deletes (test/core/live-website.test.ts proves the marker and the restore)
 *   3  L-01  HSTS and Permissions-Policy on every answer; the video-call page keeps its own
 *   4  L-14  the load test runs and prints its figures
 *
 * Every person, address and figure here is invented.
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';

import { createApp, EVERY_RESPONSE_HEADERS } from '../../src/app/server.ts';
import { seed } from '../../src/app/seed.ts';
import { ALERT_SETTING, BACKUP_STALE_HOURS, TIMER_JOBS, alertAddresses, runTimerJob, watchBackups } from '../../src/app/timers.ts';
import { LIVE_REQUIRED, liveStartCheck } from '../../src/app/live-website.ts';
import { TIMER_JOB_NAMES, timerHealth } from '../../src/core/timer-runs.ts';
import { insertTimerRuns } from '../../src/core/data.ts';
import { secretsFromValues } from '../../src/core/secrets.ts';
import { VIDEO_PAGE_HEADERS } from '../../src/modules/clients/video-calls.ts';

const ALERTS = 'admin.alerts@example.invalid, developer.alerts@example.invalid';
const BACKEND = join(import.meta.dirname, '..', '..');

async function boot(start = '2026-11-17T10:00:00.000Z') {
  let t = Date.parse(start);
  const made = await createApp(':memory:', { twoFactor: 'off', documentRoot: mkdtempSync(join(tmpdir(), 'cb-161n1d-')), now: () => new Date(t).toISOString(), sealKey: randomBytes(32) });
  made.app.secrets = secretsFromValues({ [ALERT_SETTING]: ALERTS });
  const mails = () => made.app.db.all<{ to_email: string; subject: string; body: string }>('SELECT to_email, subject, body FROM outbox ORDER BY rowid');
  const runs = () => made.app.db.all<{ job: string; ok: number; line: string }>('SELECT job, ok, line FROM timer_runs ORDER BY id');
  return { made, mails, runs, add: (ms: number) => { t += ms; }, run: (job: (typeof TIMER_JOBS)[number]) => runTimerJob({ app: made.app, store: made.store }, job, {}) };
}

/* ================================================================== 1. M-10 */

describe('161n1d · 1 · M-10: somebody is told when a timer goes wrong', () => {
  test('a failing run is written down and emails both alert addresses, with the job and its counts only; once an hour', async () => {
    const b = await boot();
    try {
      const r = await b.run('backup'); // no backup key: not ok
      assert.equal(r.ok, false);
      assert.deepEqual(b.runs().map((x) => [x.job, x.ok]), [['backup', 0]]);
      assert.equal(b.runs()[0]?.line, r.line);
      const m = b.mails();
      assert.deepEqual(m.map((x) => x.to_email), ['admin.alerts@example.invalid', 'developer.alerts@example.invalid']);
      assert.equal(m[0]?.subject, 'Cap Rebate: the backup job did not finish properly');
      assert.ok(m[0]?.body.includes(r.line), 'the counts line');
      assert.ok(!/—/.test(m[0]?.body ?? ''), 'no long dash');
      await b.run('backup');
      assert.equal(b.mails().length, 2, 'not again within the hour');
      b.add(61 * 60_000);
      await b.run('backup');
      assert.equal(b.mails().length, 4, 'again after it');
      assert.equal(b.made.app.db.get<{ n: number }>("SELECT COUNT(*) AS n FROM audit_log WHERE kind = 'TIMER_ALERT_SENT'")?.n, 2);
      assert.ok(!(b.made.app.db.get<{ d: string }>("SELECT group_concat(detail) AS d FROM audit_log WHERE kind = 'TIMER_ALERT_SENT'")?.d ?? '').includes('@'), 'no address in the audit log');
    } finally { b.made.close(); }
  });

  test('"audit chain: BROKEN" emails at once, every time, as an incident', async () => {
    const b = await boot();
    try {
      // A row added behind the application's back, with a hash that does not follow: what tampering looks like.
      b.made.app.db.run("INSERT INTO audit_log (seq, at, kind, actor_id, actor_role, object_type, object_id, outcome, detail, prev_hash, hash) VALUES ((SELECT max(seq) + 1 FROM audit_log), ?, 'LOGIN_FAILED', NULL, NULL, NULL, NULL, 'REFUSED', '{}', 'x', 'y')", [new Date().toISOString()]);
      const r = await b.run('nightly');
      assert.match(r.line, /audit chain: BROKEN/);
      await b.run('nightly');
      const m = b.mails().filter((x) => x.subject === 'Cap Rebate: the audit log check failed');
      assert.equal(m.length, 4, 'two runs, two addresses, no quiet hour');
      assert.match(m[0]?.body ?? '', /Treat this as an incident/);
    } finally { b.made.close(); }
  });

  test(`no good backup in ${String(BACKUP_STALE_HOURS)} hours alerts once a day; a good one, or timers new to the website, do not`, async () => {
    const b = await boot();
    try {
      const at = (h: number) => new Date(Date.parse(b.made.app.now()) - h * 3_600_000).toISOString();
      insertTimerRuns(b.made.app.db, ['every-five-minutes', at(1), 1, 'x']);
      assert.match(watchBackups(b.made.app), /less than 26 hours/);
      assert.equal(b.mails().length, 0);
      insertTimerRuns(b.made.app.db, ['nightly', at(30), 1, 'x']);
      assert.match(watchBackups(b.made.app), /no good backup in 26 hours, alerted/);
      assert.equal(b.mails().filter((x) => x.subject === 'Cap Rebate: no good backup in 26 hours').length, 2);
      watchBackups(b.made.app);
      assert.equal(b.mails().length, 2, 'once a day');
      insertTimerRuns(b.made.app.db, ['backup', at(2), 1, 'ok']);
      assert.match(watchBackups(b.made.app), /a good backup in the last 26 hours/);
      // and the five-minute job runs the watch
      assert.match((await b.run('every-five-minutes')).line, /backup watch: a good backup in the last 26 hours/);
    } finally { b.made.close(); }
  });

  test('the database past its size alerts once a day (the limit made tiny here)', async () => {
    const b = await boot();
    try {
      assert.match(watchBackups(b.made.app, 1), /the database is \d+ MB, alerted/);
      watchBackups(b.made.app, 1);
      assert.equal(b.mails().filter((x) => x.subject === 'Cap Rebate: the database is over 200 MB').length, 2);
    } finally { b.made.close(); }
  });

  test('each job\'s last run and last good run on Admin\'s Connections page; the names are the timers\' own', async () => {
    assert.deepEqual([...TIMER_JOB_NAMES], [...TIMER_JOBS]);
    const b = await boot();
    try {
      await b.run('backup');
      insertTimerRuns(b.made.app.db, ['nightly', b.made.app.now(), 1, 'ok']);
      const h = timerHealth(b.made.app.db);
      assert.equal(h.find((x) => x.job === 'backup')?.last?.ok, false);
      assert.equal(h.find((x) => x.job === 'backup')?.last_good, null);
      assert.ok(h.find((x) => x.job === 'nightly')?.last_good !== null);
      await new Promise<void>((r) => b.made.server.listen(0, '127.0.0.1', () => r()));
      const a = b.made.server.address();
      const base = `http://127.0.0.1:${typeof a === 'object' && a !== null ? a.port : 0}`;
      const s = await seed(b.made.app.db, b.made.app.hasher, b.made.app.now);
      const login = await fetch(`${base}/login`, { method: 'POST', redirect: 'manual', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ email: 'admin@example.invalid', password: s.password }).toString() });
      const cookie = (login.headers.getSetCookie()[0] ?? '').split(';')[0] ?? '';
      const page = await (await fetch(`${base}/staff/connections`, { headers: { cookie } })).text();
      assert.match(page, /The live website(&#39;|')s timers/);
      assert.match(page, /<tr id="timer-backup">[\s\S]*?<strong>not ok<\/strong>[\s\S]*?Never/);
    } finally { b.made.close(); }
  });

  test('the alert addresses are a listed setting, required on the live start, and must be addresses', () => {
    assert.ok(LIVE_REQUIRED.some((r) => r.names.includes(ALERT_SETTING)));
    assert.match(readFileSync(join(BACKEND, 'secrets.example.env'), 'utf8'), /^CAPREBATE_ALERT_EMAILS=$/m);
    assert.deepEqual(alertAddresses(secretsFromValues({ [ALERT_SETTING]: ' a@x.invalid , not-an-address,b@y.invalid' })), ['a@x.invalid', 'b@y.invalid']);
    const base = { CAPREBATE_PRODUCTION: '1', CAPREBATE_DB_URL: '/tmp/x.db', CAPREBATE_DB_TOKEN: 'invented', CAPREBATE_BLOB_TOKEN: 'invented', CAPREBATE_MFA_KEY: randomBytes(32).toString('base64'),
      CRON_SECRET: 'x'.repeat(40), CAPREBATE_BACKUP_KEY: randomBytes(32).toString('base64'), CAPREBATE_PUBLIC_ORIGIN: 'https://caprebate.co.uk', CAPREBATE_UPLOAD_LINK_KEY: randomBytes(32).toString('base64') };
    assert.ok(liveStartCheck(base).lines.some((l) => /CAPREBATE_ALERT_EMAILS is not set/.test(l)));
    assert.ok(liveStartCheck({ ...base, [ALERT_SETTING]: 'nobody' }).lines.some((l) => /must be email addresses/.test(l)));
    assert.equal(liveStartCheck({ ...base, [ALERT_SETTING]: ALERTS }).stop, false);
  });
});

/* ================================================================== 3. L-01 */

describe('161n1d · 3 · L-01: HSTS and Permissions-Policy on every answer', () => {
  test('on a page, on JSON and on a file', async () => {
    const b = await boot();
    try {
      await new Promise<void>((r) => b.made.server.listen(0, '127.0.0.1', () => r()));
      const a = b.made.server.address();
      const base = `http://127.0.0.1:${typeof a === 'object' && a !== null ? a.port : 0}`;
      for (const path of ['/', '/login', '/api/health', '/assets/site.css', '/no-such-page']) {
        const r = await fetch(base + path, { redirect: 'manual' });
        assert.equal(r.headers.get('strict-transport-security'), 'max-age=31536000; includeSubDomains', path);
        assert.equal(r.headers.get('permissions-policy'), 'camera=(), microphone=(), geolocation=(), payment=()', path);
      }
    } finally { b.made.close(); }
  });

  test('the video-call page\'s own headers allow its camera and microphone, and replace the default', async () => {
    assert.match(VIDEO_PAGE_HEADERS['permissions-policy'] ?? '', /camera=\(self\), microphone=\(self\)/);
    // How Node joins the two: a header set first is replaced by the same header given to writeHead.
    const s = createServer((_req, res) => { for (const [k, v] of Object.entries(EVERY_RESPONSE_HEADERS)) res.setHeader(k, v); res.writeHead(200, VIDEO_PAGE_HEADERS); res.end('ok'); });
    await new Promise<void>((r) => s.listen(0, '127.0.0.1', () => r()));
    try {
      const a = s.address();
      const r = await fetch(`http://127.0.0.1:${typeof a === 'object' && a !== null ? a.port : 0}/`);
      assert.match(r.headers.get('permissions-policy') ?? '', /camera=\(self\)/);
      assert.equal(r.headers.get('strict-transport-security'), 'max-age=31536000; includeSubDomains', 'HSTS stays');
    } finally { s.close(); }
  });
});

/* ================================================================== 4. L-14 */

describe('161n1d · 4 · L-14: the load test', () => {
  test('runs on invented data in a folder of its own and prints the figures the record keeps', () => {
    const out = execFileSync(process.execPath, [join(BACKEND, 'tools', 'load-test.ts'), '--days', '3', '--audit', '50'], { encoding: 'utf8', timeout: 60_000 });
    assert.match(out, /enquiries sent through the assessment: 3 of 3 days/);
    assert.match(out, /\/staff\/leads: \d+ ms \(200\)/);
    assert.match(out, /nightly backup: \d+ ms, ok:/);
    assert.match(out, /database file: [\d.]+ MB/);
  });
});
