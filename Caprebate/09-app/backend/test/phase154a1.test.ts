/**
 * PHASE 154a1, 4 OCTOBER 2026 — THE FAULTS THE 3 OCTOBER SWEEP FOUND, FIXED.
 *
 * Lakhbir, 3 Oct 2026: "looking at all the bugs found these should be fixed in phase 154a1". The sweep crawled every
 * page as every login, held 140 requests a second and lost no write; these are what it did find. Each test here was
 * run on the code from before its fix and went red (04-phase-work/phase154a1/proofs/, OneDrive).
 *
 *   1  a 50,000-character compliance person search answered 500
 *   2  a contact (or an introducer's person, or a firm) posted with no name field at all was saved, nameless
 *   3  after a 413 on a kept-alive connection, the next request on it hung and was reset
 *   4  labels not tied to their boxes, so a screen reader reads a box with no name — every page, every login
 *   5  a contact saved without its company went to /staff/clients/?done=contact, a 404
 *   6  headings that jump from h1 to h3 — every page, every login
 *   7  a double click made two tasks
 *   8  code{font-size:.9em} is 10.8 px inside 12 px text, under the 12 px house rule
 *   9  a null and a right-to-left override were stored and shown back as typed, in claim notes and portal messages
 *  10  the test website's start file printed every unsent email, body and all, to the function log
 */
import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { Agent, request } from 'node:http';
import { startHarness, LOGINS, type Harness, type Login } from './ui-tidy-harness.ts';
import { SITE_CSS } from '../src/web/assets.ts';
import { SEED_PASSWORD } from '../src/seed.ts';

let H: Harness;
let base = '';
before(async () => {
  H = await startHarness('p154a1');
  const a = H.made.server.address();
  base = `http://127.0.0.1:${typeof a === 'object' && a !== null ? a.port : 0}`;
});
after(() => H.close());

const db = () => H.made.app.db;
const org = () => db().get<{ id: string }>("SELECT id FROM businesses WHERE name LIKE 'Fenmoor%'")?.id ?? '';

/* ------------------------------------------------------------------ line 1 */

describe('line 1: the compliance person search', () => {
  test('a 50,000-character term is searched as its first 200 characters and the page says so, never a 500', async () => {
    for (const n of [40_000, 50_000, 120_000]) {
      const r = await H.post('admin', '/staff/compliance/search', { term: 'a'.repeat(n) });
      assert.equal(r.status, 200, `${n} characters answered ${r.status}`);
      assert.match(r.body, /Only the first 200 characters of what you typed were searched\./, `${n}`);
    }
  });

  test('an ordinary term is searched as typed, with nothing said about its length', async () => {
    const r = await H.post('admin', '/staff/compliance/search', { term: 'Fenmoor' });
    assert.equal(r.status, 200);
    assert.doesNotMatch(r.body, /Only the first 200 characters/);
  });
});

/* ------------------------------------------------------------------ line 2 */

describe('line 2: a person or a firm with no name', () => {
  const count = (sql: string, p: string[] = []) => db().get<{ n: number }>(sql, p)?.n ?? 0;

  test('a contact posted with no full_name field at all is refused, as an empty one is, and nothing is added', async () => {
    const id = org();
    const before = count('SELECT COUNT(*) AS n FROM contacts WHERE business_id = ?', [id]);
    for (const fields of [{ foo: 'bar' }, {}, { full_name: '' }, { full_name: '   ' }]) {
      const r = await H.post('sales', `/staff/organisations/${id}/contacts`, fields);
      assert.equal(r.status, 400, `${JSON.stringify(fields)} answered ${r.status}`);
      assert.match(r.body, /A contact is a person, and needs a name\./, JSON.stringify(fields));
    }
    assert.equal(count('SELECT COUNT(*) AS n FROM contacts WHERE business_id = ?', [id]), before, 'a nameless contact was added');
    assert.equal(count("SELECT COUNT(*) AS n FROM contacts WHERE TRIM(full_name) = ''"), 0);
  });

  test('a contact with a name is still added', async () => {
    const r = await H.post('sales', `/staff/organisations/${org()}/contacts`, { full_name: 'Named Invented Person', email: 'named@example.invalid' });
    assert.equal(r.status, 303);
  });

  test('an introducing firm with no firm_name field, and a person at a firm with no full_name field, are refused', async () => {
    const firms = count('SELECT COUNT(*) AS n FROM introducers');
    const f = await H.post('admin', '/staff/introducers', { notes: 'no name' });
    assert.equal(f.status, 400, `a nameless firm answered ${f.status}`);
    assert.equal(count('SELECT COUNT(*) AS n FROM introducers'), firms, 'a nameless firm was added');
    const made = await H.post('admin', '/staff/introducers', { firm_name: 'Invented Practice 154a1 LLP' });
    assert.equal(made.status, 303, 'a named firm is still recorded');
    const firm = /\/staff\/introducers\/([A-Za-z0-9-]+)/.exec(made.location ?? '')?.[1] ?? '';
    assert.notEqual(firm, '');
    const people = count('SELECT COUNT(*) AS n FROM contacts WHERE introducer_id = ?', [firm]);
    const p = await H.post('admin', `/staff/introducers/${firm}/contacts`, { email: 'nameless@example.invalid' });
    assert.equal(p.status, 400, `a nameless person answered ${p.status}`);
    assert.equal(count('SELECT COUNT(*) AS n FROM contacts WHERE introducer_id = ?', [firm]), people, 'a nameless person was added');
  });
});

/* ------------------------------------------------------------------ line 3 */

type Raw = { status: number; headers: Record<string, string | string[] | undefined>; ms: number; error?: string };
function raw(agent: Agent, method: string, path: string, body: Buffer | null, headers: Record<string, string> = {}): Promise<Raw> {
  const t0 = Date.now();
  return new Promise((resolve) => {
    const req = request(base + path, { method, agent, headers: { ...headers, ...(body === null ? {} : { 'content-length': String(body.length) }) } }, (res) => {
      res.resume();
      res.on('end', () => resolve({ status: res.statusCode ?? 0, headers: res.headers, ms: Date.now() - t0 }));
    });
    req.setTimeout(8000, () => { req.destroy(new Error('timed out')); });
    req.on('error', (e) => resolve({ status: 0, headers: {}, ms: Date.now() - t0, error: e.message }));
    if (body !== null) req.end(body); else req.end();
  });
}

describe('line 3: a refused body does not leave the connection hanging', () => {
  test('a 413 on a kept-alive connection says Connection: close, and the next request answers at once', async () => {
    for (const path of ['/login', '/api/login']) {
      const agent = new Agent({ keepAlive: true, maxSockets: 1 });
      try {
        const big = Buffer.alloc(3 * 1024 * 1024, 0x61);
        const type = path.startsWith('/api/') ? 'application/json' : 'application/x-www-form-urlencoded';
        const first = await raw(agent, 'POST', path, big, { 'content-type': type });
        assert.equal(first.status, 413, `${path}: ${first.error ?? first.status}`);
        const next = await raw(agent, 'GET', '/login', null);
        assert.equal(next.status, 200, `${path}: the next request ${next.error ?? next.status} after ${next.ms} ms`);
        assert.ok(next.ms < 2000, `${path}: the next request took ${next.ms} ms`);
        assert.equal(first.headers['connection'], 'close', `${path}: the 413 kept the connection open`);
      } finally { agent.destroy(); }
    }
  });

  test('a body under the cap keeps the connection for the next request, as before', async () => {
    const agent = new Agent({ keepAlive: true, maxSockets: 1 });
    try {
      const first = await raw(agent, 'GET', '/login', null);
      assert.equal(first.status, 200);
      assert.notEqual(first.headers['connection'], 'close');
      const next = await raw(agent, 'GET', '/login', null);
      assert.equal(next.status, 200);
    } finally { agent.destroy(); }
  });
});

/* ------------------------------------------------------------------ lines 4 and 6: every page, every login */

const SKIP = /\/logout|\/download|\/open\b|\.pdf|\.csv|\.json|\.zip|\.docx|\.png|\.svg|\/file\b|\/files\/[^/]+$|\/attachment|\/export|\/print|\/ics\b|\.ics/;
const START: Record<Login, string> = { admin: '/staff', sales: '/staff', accounting: '/staff', surveying: '/staff', readonly: '/staff', client: '/portal' };
const pattern = (p: string) => p.replace(/\?.*$/, '?q').split('/').map((s) => (/\d/.test(s) && s.length > 6) || /^[0-9a-f-]{20,}$/.test(s) ? ':id' : s).join('/');

/** Every same-site page a login can reach by its links, at most three of each shape. */
async function walk(who: Login, cap = 400): Promise<Map<string, string>> {
  const seen = new Map<string, string>();
  const shapes = new Map<string, number>();
  const queue = [START[who]];
  const area = who === 'client' ? /^\/portal/ : /^\/staff/;
  while (queue.length > 0 && seen.size < cap) {
    const path = queue.shift() ?? '';
    if (seen.has(path)) continue;
    const shape = pattern(path);
    if ((shapes.get(shape) ?? 0) >= 3) continue;
    shapes.set(shape, (shapes.get(shape) ?? 0) + 1);
    const r = await H.get(who, path);
    if (r.status !== 200 || !/<html|<!doctype/i.test(r.body)) { seen.set(path, ''); continue; }
    seen.set(path, r.body);
    for (const m of r.body.matchAll(/href="([^"#]+)/g)) {
      const href = (m[1] ?? '').replace(/&amp;/g, '&');
      if (!href.startsWith('/') || !area.test(href) || SKIP.test(href) || seen.has(href)) continue;
      queue.push(href);
    }
  }
  return seen;
}

const NO_NAME_NEEDED = /type="(hidden|submit|button|image|reset)"/i;
/** What a screen reader would miss on one page: a label tied to nothing, a box with no name, a heading that skips a level. */
export function pageFaults(body: string): string[] {
  const faults: string[] = [];
  const page = body.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<!--[\s\S]*?-->/g, '');
  const ids = new Map<string, number>();
  for (const m of page.matchAll(/\sid="([^"]+)"/g)) ids.set(m[1] ?? '', (ids.get(m[1] ?? '') ?? 0) + 1);
  const forIds = new Set([...page.matchAll(/<label\b[^>]*\sfor="([^"]+)"/g)].map((m) => m[1] ?? ''));
  let open: { attrs: string; wraps: boolean } | null = null;
  for (const m of page.matchAll(/<(\/?)(label|input|select|textarea)\b([^>]*)>/gi)) {
    const [, close, tag0, attrs = ''] = m;
    const tag = (tag0 ?? '').toLowerCase();
    if (tag === 'label') {
      if (close === '') { open = { attrs, wraps: false }; continue; }
      if (open !== null) {
        const f = /\sfor="([^"]+)"/.exec(open.attrs)?.[1];
        if (f !== undefined) {
          if ((ids.get(f) ?? 0) !== 1) faults.push(`a label for="${f}" names ${ids.get(f) ?? 0} boxes`);
        } else if (!open.wraps) faults.push(`a label tied to no box: <label${open.attrs}>`);
      }
      open = null;
      continue;
    }
    if (close !== '' || (tag === 'input' && NO_NAME_NEEDED.test(attrs))) continue;
    if (open !== null) { open.wraps = true; continue; }
    if (/\saria-label(ledby)?="[^"]+"/.test(attrs)) continue;
    const id = /\sid="([^"]+)"/.exec(attrs)?.[1];
    if (id !== undefined && forIds.has(id)) continue;
    faults.push(`a ${tag} with no label: <${tag}${attrs.slice(0, 120)}>`);
  }
  let last = 0;
  for (const m of page.matchAll(/<h([1-6])\b/gi)) {
    const level = Number(m[1]);
    if (last !== 0 && level > last + 1) faults.push(`a heading jumps from h${last} to h${level}`);
    last = level;
  }
  return faults;
}

describe('lines 4 and 6: every page every login can reach, read as a screen reader reads it', () => {
  test('the checker finds what it is for (it is not green by accident)', () => {
    assert.deepEqual(pageFaults('<h1>A</h1><h2>B</h2><label class="fl">Name</label><input name="x"><label for="y">Y</label><input id="y" name="y">'),
      ['a label tied to no box: <label class="fl">', 'a input with no label: <input name="x">']);
    assert.deepEqual(pageFaults('<input name="note" placeholder="note">'), ['a input with no label: <input name="note" placeholder="note">']);
    assert.deepEqual(pageFaults('<h1>A</h1><h3>C</h3>'), ['a heading jumps from h1 to h3']);
    assert.deepEqual(pageFaults('<label for="z">Z</label><input id="z"><input id="z">'), ['a label for="z" names 2 boxes']);
    assert.deepEqual(pageFaults('<h1>A</h1><h2>B</h2><label>Ticked <input type="checkbox" name="t"></label><input name="s" aria-label="Search"><input type="hidden" name="h"><button type="submit">Go</button>'), []);
  });

  for (const who of LOGINS) {
    test(`${who}: every box has a name it is read by, and no heading skips a level`, async () => {
      const pages = await walk(who);
      const got: string[] = [];
      let read = 0;
      for (const [path, body] of pages) {
        if (body === '') continue;
        read += 1;
        for (const f of new Set(pageFaults(body))) got.push(`${path}: ${f}`);
      }
      assert.ok(read >= (who === 'client' ? 5 : 15), `${who} reached only ${read} pages`);
      if (process.env.CB_154A1_FAULTS !== undefined) writeFileSync(`${process.env.CB_154A1_FAULTS}-${who}.txt`, `${read} pages\n${got.join('\n')}\n`);
      assert.deepEqual(got, [], `${got.length} faults on ${who}'s pages:\n${got.slice(0, 60).join('\n')}`);
    });
  }
});

/* ------------------------------------------------------------------ line 5 */

describe('line 5: a contact saved without its company', () => {
  test('goes back to its own company’s page, never to /staff/clients/?done=contact', async () => {
    const c = db().get<{ id: string; business_id: string; full_name: string }>(
      'SELECT id, business_id, full_name FROM contacts WHERE business_id IS NOT NULL ORDER BY id LIMIT 1');
    assert.ok(c !== undefined);
    const r = await H.post('sales', `/staff/contacts/${c.id}`, { full_name: c.full_name });
    assert.equal(r.status, 303);
    assert.equal(r.location, `/staff/clients/${c.business_id}?done=contact#contacts`);
    assert.equal((await H.get('sales', (r.location ?? '').replace(/#.*$/, ''))).status, 200);
  });

  test('a business_id posted with it is not trusted: the contact’s own company is', async () => {
    const c = db().get<{ id: string; business_id: string; full_name: string }>(
      'SELECT id, business_id, full_name FROM contacts WHERE business_id IS NOT NULL ORDER BY id LIMIT 1');
    assert.ok(c !== undefined);
    const r = await H.post('sales', `/staff/contacts/${c.id}`, { full_name: c.full_name, business_id: 'b-somebody-else' });
    assert.equal(r.location, `/staff/clients/${c.business_id}?done=contact#contacts`);
  });
});

/* ------------------------------------------------------------------ line 7 */

describe('line 7: a double click makes one task', () => {
  test('the same task posted twice at once is one task', async () => {
    const fields = { title: 'Double click task 154a1', business_id: org(), owner_id: H.actor('sales').id, due_on: '2026-12-01', activity_type: 'OTHER' };
    const [a, b] = await Promise.all([H.post('sales', '/staff/tasks', fields), H.post('sales', '/staff/tasks', fields)]);
    assert.equal(a.status, 303);
    assert.equal(b.status, 303, 'the second click is not an error');
    assert.equal(db().get<{ n: number }>("SELECT COUNT(*) AS n FROM staff_tasks WHERE title = 'Double click task 154a1'")?.n, 1);
  });

  test('a different task, or the same title from another person, is still added', async () => {
    const fields = { title: 'Double click task 154a1 b', business_id: org(), owner_id: H.actor('sales').id, due_on: '2026-12-01', activity_type: 'OTHER' };
    await H.post('sales', '/staff/tasks', fields);
    await H.post('sales', '/staff/tasks', { ...fields, due_on: '2026-12-02' });
    await H.post('admin', '/staff/tasks', fields);
    assert.equal(db().get<{ n: number }>("SELECT COUNT(*) AS n FROM staff_tasks WHERE title = 'Double click task 154a1 b'")?.n, 3);
  });
});

/* ------------------------------------------------------------------ line 8 */

describe('line 8: no text under 12 px', () => {
  test('every font-size below 1em has a 12 px floor (code in 12 px text was 10.8 px)', () => {
    const small = [...SITE_CSS.matchAll(/font-size:([^;}]*(?<![\d.])0?\.\d+r?em[^;}]*)/g)].map((m) => m[1] ?? '');
    assert.ok(small.length >= 1, 'the code rule is read');
    for (const v of small) assert.match(v, /^max\([^)]*,\s*12px\)$/, v);
    assert.match(SITE_CSS, /code\{[^}]*font-size:max\(\.9em,12px\)/);
  });
});

/* ------------------------------------------------------------------ line 9 */

const TYPED = 'Before\u0000after ‮gnp.exe‬, ⁦isolated⁩ and a mark‏.\r\nSecond line\tkept.';
const CLEAN = 'Beforeafter gnp.exe, isolated and a mark.\r\nSecond line\tkept.';

describe('line 9: invisible characters are taken out on the way in', () => {
  test('a claim note keeps its newlines and tabs and loses the null and the direction overrides', async () => {
    const claim = db().get<{ id: string }>('SELECT id FROM claims ORDER BY id LIMIT 1')?.id ?? '';
    const r = await H.post('admin', `/staff/claims/${claim}/notes`, { body: TYPED });
    assert.equal(r.status, 303);
    const kept = db().get<{ body: string }>('SELECT body FROM internal_notes WHERE claim_id = ? ORDER BY created_at DESC, rowid DESC LIMIT 1', [claim])?.body ?? '';
    assert.equal(kept, CLEAN);
  });

  test('a portal message, as a form and as a multipart form with no file, is kept clean', async () => {
    const r = await H.post('client', '/portal/messages', { body: TYPED });
    assert.equal(r.status, 303, r.body.slice(0, 300));
    const one = db().get<{ body: string }>("SELECT body FROM client_messages WHERE direction = 'FROM_CLIENT' ORDER BY created_at DESC, rowid DESC LIMIT 1")?.body ?? '';
    assert.equal(one, CLEAN);
    const fd = new FormData();
    fd.set('body', TYPED + ' (multipart)');
    const cookie = await clientCookie();
    const m = await fetch(base + '/portal/messages', { method: 'POST', redirect: 'manual', body: fd, headers: { cookie } });
    assert.equal(m.status, 303);
    const two = db().get<{ body: string }>("SELECT body FROM client_messages WHERE direction = 'FROM_CLIENT' ORDER BY created_at DESC, rowid DESC LIMIT 1")?.body ?? '';
    assert.equal(two, CLEAN + ' (multipart)');
  });

  test('a password is never altered on the way in', async () => {
    const { cleanTyped } = await import('../src/web/typed.ts');
    assert.equal(cleanTyped('a\u0000b‮c\n'), 'abc\n');
    assert.equal(cleanTyped('plain words — with a dash, émigré'), 'plain words — with a dash, émigré');
  });
});

async function clientCookie(): Promise<string> {
  const r = await fetch(`${base}/login`, {
    method: 'POST', redirect: 'manual', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ email: 'client@example.invalid', password: SEED_PASSWORD }).toString(),
  });
  return r.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ');
}

/* ------------------------------------------------------------------ line 10 */

describe('line 10: the test website’s start file', () => {
  const entry = readFileSync(new URL('../../../../api/index.mjs', import.meta.url), 'utf8');

  test('it prints the outbox as counts and kinds only — never an address, a subject or a body', async () => {
    const { outboxLogLine } = (await import(new URL('../../../../api/index.mjs', import.meta.url).href)) as {
      outboxLogLine: (rows: { kind: string; sent: boolean }[]) => string | null };
    assert.equal(outboxLogLine([]), null);
    const line = outboxLogLine([{ kind: 'SIGN_UP', sent: false }, { kind: 'SIGN_UP', sent: false }, { kind: 'FREE_TYPED', sent: true }]) ?? '';
    assert.equal(line, 'test deployment: 3 new emails in the outbox - FREE_TYPED 1, SIGN_UP 2; 1 sent, 2 not sent');
    assert.doesNotMatch(entry, /console\.log\([^)]*(m\.body|m\.to_email|m\.subject|to_email|\.body\})/, 'the start file still prints an email');
  });

  test('its comments no longer say no email is sent, or that Zoom and WhatsApp wait for their transfers', () => {
    assert.doesNotMatch(entry, /No email is sent/);
    assert.doesNotMatch(entry, /still refused until Zoom's transfer is approved/);
    assert.doesNotMatch(entry, /nothing is sent until Meta's transfer is approved/);
  });
});

/* ------------------------------------------------------------------ line 13 */

describe('line 13: the pooling requirement (s.187A(4)) in the survey pack, as in the five flows', () => {
  const NOW = '2026-10-04T09:00:00.000Z';
  const seller = (extra: Record<string, unknown>) => new Map(Object.entries({ G8: ['purchase'], G8a: 'property', G9d: '2019-06-01', G12: 'taxpaying',
    G14: 'no', G14po: 'sold_market', G14pod: '2019-06-01', G14iv: 'no', G14t: 'none', G15: 'no', G14fvr: 'yes', ...extra }));
  const legal = async () => (await import('../src/web/pack-legal.ts')).assessLegal;
  const cta = async () => (await import('../src/web/engine.ts')).CB.CB_CTA as unknown as Record<string, unknown>;

  test('a tax-paying seller who never claimed, sold in 2019: RED, naming the pooling requirement and what would meet it', async () => {
    const v = (await legal())('gp', seller({ G11: 'no' }), NOW, 'company').verdict;
    assert.equal(v.level, 'RED');
    assert.ok(v.why.some((w) => /never pooled what it spent on them/.test(w)), v.why.join(' | '));
    assert.ok(v.actions.some((a) => /tax period that began on or before the day it sold them to you \(s\.187A\(4\)\)/.test(a)), v.actions.join(' | '));
  });

  test('the A-3 switch cannot reach that case: still RED with it on, and the sale date is still asked', async () => {
    const CTA = await cta();
    const was = CTA['fvr_requires_past_owner_claim'];
    CTA['fvr_requires_past_owner_claim'] = true;
    try {
      const r = (await legal())('gp', seller({ G11: 'no' }), NOW, 'company');
      assert.equal(r.verdict.level, 'RED');
      assert.ok(r.asked.some((q) => /14pod$/.test(q.id)), 'the date the seller stopped owning is not asked');
    } finally { CTA['fvr_requires_past_owner_claim'] = was; }
  });

  test('N4: a claim history "not sure", or never given, is unsettled (AMBER) — the same either way, never clear', async () => {
    const assess = await legal();
    const unsure = assess('gp', seller({ G11: 'unsure' }), NOW, 'company').verdict;
    const never = assess('gp', seller({}), NOW, 'company').verdict;
    assert.equal(unsure.level, 'AMBER');
    assert.equal(never.level, 'AMBER');
    assert.ok(unsure.why.some((w) => /whether it ever did, and so whether it pooled/.test(w)), unsure.why.join(' | '));
  });

  test('a seller who never claimed but sold before April 2014 is not met by it (the requirement was not yet in force)', async () => {
    const v = (await legal())('gp', seller({ G11: 'no', G9d: '2013-06-01', G14pod: '2013-06-01' }), NOW, 'company').verdict;
    assert.ok(!v.why.some((w) => /never pooled/.test(w)), v.why.join(' | '));
  });
});
