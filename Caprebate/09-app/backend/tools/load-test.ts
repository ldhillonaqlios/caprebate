/**
 * THE LOAD TEST (Phase 161n1d, ITRoadway's second review, L-14): "not yet tested at size".
 *
 *   node tools/load-test.ts [--days 365] [--audit 30000]
 *
 * On THIS computer, in a new folder it makes and deletes, never the test website or the live one:
 *   1. a database FILE (as the live website's local copy is), built and seeded with the invented logins;
 *   2. a year of invented enquiries, one a day, each sent through the website's own assessment pages (the buildings, the
 *      spend, the tax, the details, the close) with the clock moved a day each time, so every row the real thing writes
 *      is written: the business, its buildings, the lead, the contact, the booking, the emails, the audit rows;
 *   3. a year of staff work in the audit log (--audit rows, as the back office writes them);
 * then times the key staff pages (each three times, the middle one kept) as Admin, and the nightly backup to a folder,
 * and prints the figures, which the phase record keeps. Every name, address and figure is invented.
 *
 * WHAT IT DOES NOT MEASURE: Turso's round trips from London to Ireland (each SQL call is a trip there on the live
 * website). That needs the live preview database, which is the developer's (the pack asks them to run this against it,
 * with CAPREBATE_DB_URL and CAPREBATE_DB_TOKEN, once it is made).
 */
import { mkdtempSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { createApp } from '../src/app/server.ts';
import { seed } from '../src/app/seed.ts';
import { runNightlyBackup } from '../src/integrations/index.ts';
import { secretsFromValues } from '../src/core/secrets.ts';

const arg = (name: string, d: number): number => {
  const i = process.argv.indexOf(`--${name}`);
  const v = i < 0 ? NaN : Number(process.argv[i + 1]);
  return Number.isFinite(v) && v > 0 ? v : d;
};
const DAYS = arg('days', 365);
const AUDIT = arg('audit', 30000);

async function main(): Promise<void> {
  const dir = mkdtempSync(join(tmpdir(), 'cb-load-'));
  const dbFile = join(dir, 'load.db');
  let t = Date.parse('2026-01-05T10:00:00.000Z');
  const made = await createApp(dbFile, { twoFactor: 'off', documentRoot: join(dir, 'docs'), now: () => new Date(t).toISOString(), sealKey: randomBytes(32) });
  await new Promise<void>((r) => made.server.listen(0, '127.0.0.1', () => r()));
  const a = made.server.address();
  const base = `http://127.0.0.1:${typeof a === 'object' && a !== null ? a.port : 0}`;
  try {
    const s = await seed(made.app.db, made.app.hasher, made.app.now);
    const client = () => {
      let cookie = '';
      const req = async (path: string, init: RequestInit = {}) => {
        const r = await fetch(base + path, { redirect: 'manual', ...init, headers: { ...(init.headers as Record<string, string> ?? {}), ...(cookie ? { cookie } : {}) } });
        for (const x of r.headers.getSetCookie()) { const f = x.split(';')[0] ?? ''; const k = f.split('=')[0]; cookie = [...cookie.split('; ').filter((y) => y && y.split('=')[0] !== k), f].join('; '); }
        return { status: r.status, body: await r.text(), location: r.headers.get('location') };
      };
      const post = (path: string, f: Record<string, string>) => req(path, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(f).toString() });
      return { req, post };
    };

    // 2. A year of enquiries through the assessment.
    const started = Date.now();
    let sent = 0;
    for (let day = 0; day < DAYS; day++) {
      t += 86_400_000;
      const c = client();
      await c.req('/assessment');
      await c.post('/assessment/buildings', { b0_sector: day % 3 === 0 ? 'dental' : 'care_homes' });
      await c.post('/assessment/spend-on', { b0_trigger: day % 2 === 0 ? 'purchase' : 'fit_out' });
      await c.post('/assessment/amounts', { b0_spend: String(400000 + (day % 50) * 25000), b0_date: '2023' });
      await c.post('/assessment/tax', { b0_tax: 'yes', b0_profit: 'profitable' });
      await c.post('/assessment/claims', { b0_prior: 'no', b0_seller: 'dont_know' });
      await c.post('/assessment/works', { b0_works: 'no' });
      await c.post('/assessment/details', { b0_business: `Load Test Practice ${String(day)} Limited`, b0_entity: 'ltd', b0_line1: `${String(day + 1)} Invented Street`, b0_town: 'Hinckley', b0_postcode: 'LE10 1DA' });
      const r = await c.post('/assessment/close', { first_name: 'Pat', surname: `Invented${String(day)}`, job_role: 'owner_director', channel: 'email', email: `pat.${String(day)}@load-test.example.invalid` });
      if (r.status === 200) sent++;
    }
    const enquirySeconds = (Date.now() - started) / 1000;

    // 3. A year of staff work in the audit log.
    const auditStarted = Date.now();
    const staff = made.app.db.all<{ id: string; role: string }>("SELECT id, role FROM users WHERE role <> 'CLIENT'");
    const businesses = made.app.db.all<{ id: string }>('SELECT id FROM businesses');
    for (let i = 0; i < AUDIT; i++) {
      const who = staff[i % staff.length]!;
      const b = businesses[i % businesses.length]!;
      made.app.audit.append({ at: new Date(t - (AUDIT - i) * 900_000).toISOString(), kind: 'DOCUMENT_ACCESSED', outcome: 'ALLOWED', actor_id: who.id, actor_role: who.role, object_type: 'business', object_id: b.id, detail: { load_test: true } });
    }
    const auditSeconds = (Date.now() - auditStarted) / 1000;

    // The pages, as Admin.
    const admin = client();
    await admin.post('/login', { email: 'admin@example.invalid', password: s.password });
    const oneClient = businesses[Math.floor(businesses.length / 2)]!.id;
    const pages = ['/staff', '/staff/leads', '/staff/claims', '/staff/pipeline', '/staff/clients', `/staff/clients/${oneClient}`, '/staff/calendar', '/staff/audit', '/staff/enquiries'];
    const timed: { path: string; status: number; ms: number }[] = [];
    for (const p of pages) {
      const ms: number[] = []; let status = 0;
      for (let k = 0; k < 3; k++) { const t0 = performance.now(); const r = await admin.req(p); status = r.status; ms.push(performance.now() - t0); }
      ms.sort((x, y) => x - y);
      timed.push({ path: p.replace(oneClient, '<a client>'), status, ms: Math.round(ms[1] ?? 0) });
    }

    // The backup, to a folder.
    const backupDir = join(dir, 'backup');
    const b0 = performance.now();
    const backup = await runNightlyBackup({ db: made.app.db, store: made.store, secrets: secretsFromValues({ CAPREBATE_BACKUP_KEY: randomBytes(32).toString('base64') }), outside: made.app.outside, now: made.app.now },
      { CAPREBATE_BACKUP_DIR: backupDir, CAPREBATE_DB: dbFile });
    const backupMs = Math.round(performance.now() - b0);

    const count = (table: string): number => made.app.db.get<{ n: number }>(`SELECT COUNT(*) AS n FROM "${table}"`)?.n ?? 0;
    console.log(`load test, ${new Date().toISOString()} (invented data, this computer, a database file)`);
    console.log(`  enquiries sent through the assessment: ${String(sent)} of ${String(DAYS)} days, in ${enquirySeconds.toFixed(1)} s`);
    console.log(`  audit rows added: ${String(AUDIT)}, in ${auditSeconds.toFixed(1)} s`);
    for (const tb of ['businesses', 'leads', 'contacts', 'bookings', 'outbox', 'audit_log']) console.log(`  ${tb}: ${String(count(tb))} rows`);
    console.log(`  database file: ${(statSync(dbFile).size / 1024 / 1024).toFixed(1)} MB`);
    for (const x of timed) console.log(`  ${x.path}: ${String(x.ms)} ms (${String(x.status)})`);
    console.log(`  nightly backup: ${String(backupMs)} ms, ${backup.ok ? 'ok' : 'NOT ok'}: ${backup.why}`);
  } finally {
    made.close();
    rmSync(dir, { recursive: true, force: true });
  }
}

await main();
