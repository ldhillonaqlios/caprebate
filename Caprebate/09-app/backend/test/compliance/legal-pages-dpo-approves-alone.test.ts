/**
 * PHASE 161m1, 11 November 2026: THE DATA PROTECTION OFFICER ALONE APPROVES THE LEGAL PAGES.
 *
 * Lakhbir, the business owner: "no solicitor, its a DPO pack". Until now a legal page was in force only once BOTH a
 * solicitor and the DPO had approved its current version. Now the DPO's approval of the current version alone puts it
 * in force (inForce in src/modules/compliance/legal-register.ts; currentApprovals and the /staff/legal page in
 * src/modules/compliance/legal-approvals.ts; the Draft and In force lines, draftLine in
 * src/modules/public-site/legal-pages.ts). The table is unchanged (migration 121 still allows SOLICITOR): a solicitor's
 * approval recorded before the change is kept, but no longer counts.
 *
 * WHAT IT PROVES:
 *   1  a page with only the DPO's approval of its current version is in force, and says the DPO approved it
 *   2  a page with only a solicitor's approval is still a draft; the row is kept, and is not read
 *   3  a DPO approval of an OLDER version does not count; the current version's does
 *   4  the back office form no longer offers the solicitor, and an approval as solicitor is refused
 *   5  the Draft and In force lines name the DPO only
 */
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../../src/app/server.ts';
import { seed } from '../../src/app/seed.ts';
import { inForce, versionOf, type LegalPageKey } from '../../src/modules/compliance/legal-register.ts';
import { currentApprovals } from '../../src/modules/compliance/legal-approvals.ts';
import { CONSENT_COOKIE, draftLine } from '../../src/modules/public-site/legal-pages.ts';

type Made = Awaited<ReturnType<typeof createApp>>;
type Res = { status: number; body: string };
let live: Made; let base = ''; let password = ''; let adminId = '';

const get = async (path: string, cookie = `${CONSENT_COOKIE}=essential`): Promise<Res> => {
  const x = await fetch(base + path, { redirect: 'manual', headers: { cookie } });
  return { status: x.status, body: await x.text() };
};
const post = async (path: string, body: Record<string, string>, cookie: string): Promise<Res> => {
  const x = await fetch(base + path, { method: 'POST', redirect: 'manual', headers: { cookie, 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(body).toString() });
  return { status: x.status, body: await x.text() };
};
async function signIn(email: string): Promise<string> {
  const x = await fetch(base + '/login', { method: 'POST', redirect: 'manual', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ email, password }).toString() });
  return x.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ');
}
/** An approval row as the table keeps it, written straight in (as one recorded before this change would be). */
let n = 0;
function keep(page: LegalPageKey, version: string, role: 'SOLICITOR' | 'DPO', by: string, on: string): void {
  n += 1;
  live.app.db.run('INSERT INTO legal_approvals (id, page, version, approved_by, approver_role, approved_on, recorded_by, recorded_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    [`la-161m1-${String(n)}`, page, version, by, role, on, adminId, '2026-11-11T09:00:00.000Z']);
}
const DRAFT = /<p class="draft-note" role="note"><strong>Draft\.<\/strong> Our data protection officer has not yet approved/;
const IN_FORCE = /<p class="in-force-note" role="note">In force\./;

before(async () => {
  live = await createApp(':memory:', { twoFactor: 'off', documentRoot: mkdtempSync(join(tmpdir(), 'cb-161m1-')), legal: true });
  await new Promise<void>((r) => live.server.listen(0, '127.0.0.1', () => r()));
  const a = live.server.address();
  base = `http://127.0.0.1:${typeof a === 'object' && a !== null ? a.port : 0}`;
  password = (await seed(live.app.db, live.app.hasher, live.app.now)).password;
  adminId = live.app.db.get<{ id: string }>("SELECT id FROM users WHERE email_canonical = 'admin@example.invalid'")!.id;
});
after(() => { live.close(); });

describe('Phase 161m1: the data protection officer alone approves the legal pages', () => {
  test('1 · only the DPO has approved the current version: the page is in force, and says the DPO approved it', async () => {
    keep('acceptable-use', versionOf('acceptable-use'), 'DPO', 'An Invented Officer', '2026-11-10');
    const a = currentApprovals(live.app.db).get('acceptable-use');
    assert.deepEqual(a, { dpo: { by: 'An Invented Officer', on: '2026-11-10' } });
    assert.equal(inForce(a), true, 'the DPO alone did not put the page in force');
    const body = (await get('/acceptable-use/')).body;
    assert.match(body, IN_FORCE);
    assert.match(body, /was approved by our data\s+protection officer on\s+10 November 2026\./);
    assert.doesNotMatch(body, /class="draft-note"/);
    assert.doesNotMatch(body, /solicitor/i);
    // The notices page on the live website takes the same line.
    keep('notices', versionOf('notices'), 'DPO', 'An Invented Officer', '2026-11-10');
    const notices = (await get('/notices/')).body;
    assert.match(notices, IN_FORCE);
    assert.doesNotMatch(notices, /class="draft-note"/);
  });

  test('2 · only a solicitor has approved (recorded before the change): still a draft; the row is kept and not read', async () => {
    keep('cookies', versionOf('cookies'), 'SOLICITOR', 'An Invented Solicitor', '2026-11-04');
    assert.equal(currentApprovals(live.app.db).get('cookies'), undefined, 'a solicitor\'s approval was read');
    assert.equal(inForce(currentApprovals(live.app.db).get('cookies')), false);
    const body = (await get('/cookies/')).body;
    assert.match(body, DRAFT);
    assert.doesNotMatch(body, IN_FORCE);
    assert.doesNotMatch(body, /solicitor/i, 'the page still names a solicitor');
    // Nothing recorded is lost.
    assert.equal(live.app.db.get<{ n: number }>("SELECT count(*) AS n FROM legal_approvals WHERE page = 'cookies' AND approver_role = 'SOLICITOR'")!.n, 1);
  });

  test('3 · a DPO approval of an older version does not count; the current version\'s does', async () => {
    assert.notEqual(versionOf('disclaimer'), '2026-01-01');
    keep('disclaimer', '2026-01-01', 'DPO', 'An Invented Officer', '2026-01-02');
    assert.equal(currentApprovals(live.app.db).get('disclaimer'), undefined, 'an older version\'s approval was counted');
    assert.match((await get('/disclaimer/')).body, DRAFT);
    keep('disclaimer', versionOf('disclaimer'), 'DPO', 'An Invented Officer', '2026-11-09');
    assert.deepEqual(currentApprovals(live.app.db).get('disclaimer'), { dpo: { by: 'An Invented Officer', on: '2026-11-09' } });
    const now = (await get('/disclaimer/')).body;
    assert.match(now, IN_FORCE);
    assert.match(now, /9 November 2026/);
  });

  test('4 · the back office form offers no solicitor, an approval as solicitor is refused, and the DPO\'s is recorded', async () => {
    const admin = await signIn('admin@example.invalid');
    const page0 = await get('/staff/legal', admin);
    assert.equal(page0.status, 200);
    assert.match(page0.body, /<h1>Legal pages<\/h1>/);
    assert.doesNotMatch(page0.body, /solicitor/i, 'the back office page still names a solicitor');
    assert.doesNotMatch(page0.body, /name="role"/, 'the form still asks who approved it');
    assert.doesNotMatch(page0.body, /value="SOLICITOR"/);
    assert.match(page0.body, /<th>Data protection officer<\/th><th>In force<\/th>/);
    assert.match(page0.body, /until our data protection officer approves this version\. Their approval alone\s+puts it in force\./);
    const before = live.app.db.get<{ n: number }>('SELECT count(*) AS n FROM legal_approvals')!.n;
    const refused = await post('/staff/legal/approve', { page: 'terms', role: 'SOLICITOR', approved_by: 'An Invented Solicitor', approved_on: '2026-11-04' }, admin);
    assert.equal(refused.status, 400);
    assert.match(refused.body, /Only our data protection officer approves the legal pages\./);
    assert.equal(live.app.db.get<{ n: number }>('SELECT count(*) AS n FROM legal_approvals')!.n, before, 'a solicitor\'s approval was recorded');
    // The form as drawn sends no role: it is the DPO's approval.
    const ok = await post('/staff/legal/approve', { page: 'terms', approved_by: 'An Invented Officer', approved_on: '2026-11-11' }, admin);
    assert.equal(ok.status, 200);
    assert.match(ok.body, /The approval is recorded\./);
    assert.equal(live.app.db.get<{ r: string }>("SELECT approver_role AS r FROM legal_approvals WHERE page = 'terms'")!.r, 'DPO');
    assert.match((await get('/terms/')).body, IN_FORCE);
    assert.equal((await post('/staff/legal/approve', { page: 'terms', approved_by: 'Again', approved_on: '2026-11-11' }, admin)).status, 400, 'a second approval of the same version');
  });

  test('5 · the Draft and In force lines name the data protection officer only', () => {
    const draft = draftLine('privacy-policy', undefined).html;
    assert.match(draft, /<strong>Draft\.<\/strong> Our data protection officer has not yet approved\s+this page, so it is not yet in force\. This version is of 11 November 2026\./);
    assert.doesNotMatch(draft, /solicitor|both/i);
    const live1 = draftLine('privacy-policy', { dpo: { by: 'An Invented Officer', on: '2026-11-12' } }).html;
    assert.match(live1, /In force\. This version, of 11 November 2026, was approved by our data\s+protection officer on 12 November 2026\./);
    assert.doesNotMatch(live1, /solicitor/i);
  });
});
