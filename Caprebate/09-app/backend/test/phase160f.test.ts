/**
 * PHASE 160f, 20 OCTOBER 2026 — THE PUBLIC NOTICES ON THE TEST WEBSITE, THEIR FACTS PROPOSED, AND THE COMPLAINT FORM.
 *
 *   1  the page as served: nothing inline, a draft banner, no long dash, the footer's anchors, the eight proposed facts
 *   2  the acceptance check lists the proposed facts, and --live still refuses the page
 *   3  served only where testNotices is on (api/index.mjs); anywhere else the placeholder stays
 *   4  the complaint form: kept with when it arrived, emailed to the data protection address, refused when incomplete,
 *      slowed from one network address
 *   5  staff see it on the complaints page and log it with its arrival time, once
 *
 * Every person here is invented.
 */
/* This file signs in with a password only, so it builds the application with twoFactor: 'off'. */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createApp } from '../src/server.ts';
import { seed } from '../src/seed.ts';
import { HTML_HEADERS } from '../src/web/html.ts';
import { buildNoticesEdition, COMPLAINT_SOURCE_LIMIT, DP_MAIL, NOTICES_PATH, refOf } from '../src/web/notices-site.ts';

const ROOT = join(import.meta.dirname, '..', '..', '..');
const CHECK = join(ROOT, '03-app', 'caprebate-notices-acceptance.cjs');
const T0 = '2026-10-20T08:45:00.000Z';

let clock = T0;
async function boot(testNotices = true) {
  clock = T0;
  const made = await createApp(':memory:', { twoFactor: 'off', documentRoot: mkdtempSync(join(tmpdir(), 'cb-160f-')), now: () => clock, ...(testNotices ? { testNotices: true } : {}) });
  await new Promise<void>((r) => made.server.listen(0, '127.0.0.1', () => r()));
  const addr = made.server.address();
  const base = `http://127.0.0.1:${typeof addr === 'object' && addr !== null ? addr.port : 0}`;
  const s = await seed(made.app.db, made.app.hasher, made.app.now);
  const send = (f: Record<string, string | string[]>, headers: Record<string, string> = {}) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(f)) for (const x of Array.isArray(v) ? v : [v]) p.append(k, x);
    return fetch(`${base}/notices/complaint`, { method: 'POST', redirect: 'manual', headers: { 'content-type': 'application/x-www-form-urlencoded', ...headers }, body: p.toString() });
  };
  async function signIn(who: string) {
    let cookie = '';
    const req = async (path: string, init: RequestInit = {}) => {
      const headers = { ...(init.headers as Record<string, string> | undefined) };
      if (cookie !== '') headers['cookie'] = cookie;
      const r = await fetch(base + path, { redirect: 'manual', ...init, headers });
      const set = r.headers.getSetCookie();
      if (set.length > 0) cookie = set.map((x) => x.split(';')[0] ?? '').join('; ');
      return { status: r.status, body: await r.text(), location: r.headers.get('location') };
    };
    const r = await req('/login', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ email: `${who}@example.invalid`, password: s.password }).toString() });
    assert.equal(r.status, 303, `${who} could not sign in`);
    return req;
  }
  return { made, base, send, signIn, db: made.app.db, close: made.close };
}

const GOOD = { name: 'Ada Invented', reply_to: 'ada@example.invalid', on_behalf: 'self', complaint_verbatim: 'You named me in a report. <script>alert(1)</script>', remedy_sought: 'Tell me what you hold.', 'rights[]': ['access', 'erase', 'not-a-right'] };

describe('1 · the page as served', () => {
  const ed = buildNoticesEdition(readFileSync(NOTICES_PATH, 'utf8'));
  test('nothing inline, the style a file, a draft banner, and the form posting here', () => {
    assert.doesNotMatch(ed.html, /<style\b|<script\b|\sstyle\s*=|\son[a-z]+\s*=/i);
    assert.match(ed.html, /<link rel="stylesheet" href="\/assets\/notices\.css">/);
    assert.match(ed.html, /<p class="draft-banner" role="note"><strong>Draft, on our test website\.<\/strong>/);
    assert.match(ed.html, /<form class="form" method="post" action="\/notices\/complaint">/);
    assert.match(ed.css, /\.proposed\{/);
    assert.match(ed.css, /\.draft-banner\{/);
  });
  test('a page carrying anything inline is refused, not served', () => {
    const page = readFileSync(NOTICES_PATH, 'utf8');
    for (const bad of ['<p style="color:red">x</p>', '<script>alert(1)</script>', '<a href="#" onclick="x()">x</a>']) {
      assert.throws(() => buildNoticesEdition(page.replace('</header>', `${bad}</header>`)), /carries/, bad);
    }
  });
  test('the footer\'s #privacy and #complaints land, and no long dash is left in the words', () => {
    assert.match(ed.html, /<span id="privacy"><\/span>\s*<section id="who-we-are">/);
    assert.match(ed.html, /<section id="complain">\s*<span id="complaints"><\/span>/);
    const words = ed.html.replace(/<[^>]+>/g, ' ');
    assert.equal((words.match(/—/g) ?? []).length, 0);
  });
  test('the four facts nobody supplied are proposed, and the website\'s host, store and database are named, in the US', () => {
    const src = readFileSync(NOTICES_PATH, 'utf8').replace(/<!--[\s\S]*?-->/g, '');
    assert.doesNotMatch(src, /\[NOT SET — /);
    assert.equal((src.match(/<span class="proposed">Proposed, awaiting our data protection officer:<\/span>/g) ?? []).length, 8);
    assert.match(src, /we rely on <strong>legitimate interests<\/strong> \(Article 6\(1\)\(f\) of the UK GDPR\)/);
    assert.match(src, /seven years from the end of the accounting period the claim is made in/);
    assert.match(src, /<strong>Vercel<\/strong>, which hosts our test website/);
    assert.match(src, /<strong>Turso<\/strong>, the database behind our test website/);
    assert.match(src, /US East, Virginia/);
    assert.doesNotMatch(src, /Not yet chosen\. It will be named here before the portal is used|Not yet contracted/);
  });
});

describe('2 · the acceptance check', () => {
  test('it lists the eight proposed facts and passes; --live still refuses the page', () => {
    const r = spawnSync(process.execPath, [CHECK], { encoding: 'utf8' });
    assert.equal(r.status, 0, r.stdout.slice(-800));
    assert.match(r.stdout, /PROPOSED — filled with our recommendation, awaiting the data protection officer {2}\(8\)/);
    assert.match(r.stdout, /0 facts are unset\. 8 are proposed, awaiting the data protection officer\./);
    const live = spawnSync(process.execPath, [CHECK, '--live'], { encoding: 'utf8' });
    assert.equal(live.status, 1);
    assert.match(live.stdout, /FAIL \(--live\): 8 fact\(s\) proposed and not yet confirmed/);
  });
});

describe('3 · on the test website only', () => {
  test('with testNotices: the page, its style and /privacy to its privacy part; the site\'s usual policy', async () => {
    const b = await boot();
    try {
      const n = await fetch(`${b.base}/notices/`);
      assert.equal(n.status, 200);
      assert.equal(n.headers.get('content-security-policy'), HTML_HEADERS['content-security-policy']);
      assert.match(await n.text(), /Draft, on our test website/);
      const css = await fetch(`${b.base}/assets/notices.css`);
      assert.equal(css.status, 200);
      assert.match(css.headers.get('content-type') ?? '', /text\/css/);
      const p = await fetch(`${b.base}/privacy`, { redirect: 'manual' });
      assert.equal(p.status, 303);
      assert.equal(p.headers.get('location'), '/notices/#privacy');
    } finally { b.close(); }
  });
  test('without it: the placeholder, no stylesheet, and no complaint form', async () => {
    const b = await boot(false);
    try {
      const n = await fetch(`${b.base}/notices/`);
      assert.equal(n.status, 200);
      assert.match(await n.text(), /are being prepared/);
      assert.notEqual((await fetch(`${b.base}/assets/notices.css`)).status, 200);
      assert.notEqual((await b.send(GOOD)).status, 200);
    } finally { b.close(); }
  });
  test('api/index.mjs, and nothing else, passes testNotices', () => {
    assert.match(readFileSync(join(ROOT, '..', 'api', 'index.mjs'), 'utf8'), /\n {4}testNotices: true,\n/);
    assert.doesNotMatch(readFileSync(join(import.meta.dirname, '..', 'tools', 'demo-server.ts'), 'utf8'), /testNotices/);
  });
});

describe('4 · the complaint form', () => {
  test('a complaint is kept with when it arrived, emailed to the data protection address, and the reply gives its reference', async () => {
    const b = await boot();
    try {
      const r = await b.send(GOOD);
      assert.equal(r.status, 200);
      const page = await r.text();
      const row = b.db.get<{ id: string; received_at: string; name: string; complaint_verbatim: string; rights: string; on_behalf: string }>('SELECT * FROM complaint_forms');
      assert.ok(row !== undefined);
      assert.equal(row.received_at, T0);
      assert.equal(row.complaint_verbatim, GOOD.complaint_verbatim);
      assert.deepEqual(JSON.parse(row.rights), ['access', 'erase'], 'only the rights the form offers');
      assert.match(page, new RegExp(`Your reference is <strong>${refOf(row.id)}</strong>`));
      assert.doesNotMatch(page, /<script>alert/);
      const mail = b.db.get<{ to_email: string; subject: string; body: string }>("SELECT to_email, subject, body FROM outbox WHERE to_email = ?", [DP_MAIL]);
      assert.ok(mail !== undefined, 'the data protection address was not told');
      assert.match(mail.subject, new RegExp(refOf(row.id)));
      assert.match(mail.body, /Its thirty days run from then/);
      assert.ok(b.db.get("SELECT kind FROM audit_log WHERE kind = 'COMPLAINT_FORM_RECEIVED'") !== undefined);
    } finally { b.close(); }
  });
  test('without a name, a way to reply or the complaint itself, nothing is kept and the person is told why', async () => {
    const b = await boot();
    try {
      for (const [drop, why] of [['name', /your name/], ['reply_to', /how to reply/], ['complaint_verbatim', /what your complaint is about/]] as const) {
        const f: Record<string, string | string[]> = { ...GOOD }; f[drop] = '   ';
        const r = await b.send(f);
        assert.equal(r.status, 400, drop);
        assert.match(await r.text(), why);
      }
      assert.equal(b.db.get<{ n: number }>('SELECT COUNT(*) AS n FROM complaint_forms')?.n, 0);
    } finally { b.close(); }
  });
  test('many complaints from one network address are slowed, with the email address to use instead', async () => {
    const b = await boot();
    try {
      for (let i = 0; i < COMPLAINT_SOURCE_LIMIT; i++) assert.equal((await b.send(GOOD)).status, 200);
      const r = await b.send(GOOD);
      assert.equal(r.status, 400);
      assert.match(await r.text(), new RegExp(DP_MAIL.replace('.', '\\.')));
    } finally { b.close(); }
  });
  test('a complaint form posted from another website is refused like any other form', async () => {
    const b = await boot();
    try {
      assert.equal((await b.send(GOOD, { 'sec-fetch-site': 'cross-site' })).status, 403);
    } finally { b.close(); }
  });
});

describe('5 · staff log it with its arrival time, once', () => {
  test('listed on the complaints page, logged as received by the form at the time it arrived, then gone from the list', async () => {
    const b = await boot();
    try {
      await b.send(GOOD);
      const id = b.db.get<{ id: string }>('SELECT id FROM complaint_forms')?.id ?? '';
      clock = '2026-10-23T11:00:00.000Z'; // logged three days after it arrived
      const admin = await b.signIn('admin');
      const list = await admin('/staff/compliance/complaints');
      assert.equal(list.status, 200);
      assert.match(list.body, /Sent through the website's complaint form: 1 to log/);
      assert.match(list.body, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
      assert.doesNotMatch(list.body, /<script>alert/);
      const logged = await admin(`/staff/compliance/complaint-forms/${id}/log`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: '' });
      assert.equal(logged.status, 303);
      assert.match(logged.location ?? '', /^\/staff\/compliance\/complaints\/[A-Za-z0-9-]+\?done=logged$/);
      const c = b.db.get<{ received_at: string; received_via: string; complaint_verbatim: string; complainant_as_described: string }>('SELECT received_at, received_via, complaint_verbatim, complainant_as_described FROM complaints');
      assert.ok(c !== undefined);
      assert.equal(c.received_at, T0, 'the thirty days run from when it arrived');
      assert.equal(c.received_via, 'FORM');
      assert.match(c.complaint_verbatim, /What they want: Tell me what you hold\.\n\nRights they asked about: access, erase$/);
      assert.match(c.complainant_as_described, /^Ada Invented, reply to ada@example\.invalid$/);
      assert.doesNotMatch((await admin('/staff/compliance/complaints')).body, /Sent through the website's complaint form/);
      const again = await admin(`/staff/compliance/complaint-forms/${id}/log`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: '' });
      assert.notEqual(again.location ?? '', logged.location ?? '');
      assert.equal(b.db.get<{ n: number }>('SELECT COUNT(*) AS n FROM complaints')?.n, 1, 'logged twice');
    } finally { b.close(); }
  });
  test('a login that may not write to the compliance registers cannot log it', async () => {
    const b = await boot();
    try {
      await b.send(GOOD);
      const id = b.db.get<{ id: string }>('SELECT id FROM complaint_forms')?.id ?? '';
      const sales = await b.signIn('sales');
      const r = await sales(`/staff/compliance/complaint-forms/${id}/log`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: '' });
      assert.equal(r.status, 403);
      assert.equal(b.db.get<{ n: number }>('SELECT COUNT(*) AS n FROM complaints')?.n, 0);
    } finally { b.close(); }
  });
});
