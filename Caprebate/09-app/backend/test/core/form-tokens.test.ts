/**
 * PHASE 161b, 4 November 2026 — A SECURITY TOKEN ON EVERY FORM THAT CHANGES SOMETHING (src/core/form-token.ts,
 * src/core/form-token-check.ts, the check at the top of src/core/server.ts's handler).
 *
 * The ITRoadway technical audit (2 Nov 2026), section 4, row 3. What these tests hold:
 *   - every route that is not GET or HEAD, found in the source, refuses a signed-in person's request with no token,
 *     unless it is on the exempt list; and every exempt or sensitive entry matches a real route;
 *   - no token, a wrong token, another session's token, a used single-use token and an old one are refused; the right
 *     ones go through; a refusal changes nothing and is in the audit log, with plain words back;
 *   - pages carry the tokens in their POST forms (and only ours), the JSON API takes them in headers, a multipart form
 *     carries its own, and the route never sees our two fields;
 *   - every real start turns the tokens on in so many words; only the test runner has them off by default.
 * The app here runs with formTokens 'on' and invented logins (the seed's), on this machine only.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execSync } from 'node:child_process';
import { Readable } from 'node:stream';
import type { IncomingMessage } from 'node:http';
import { createApp } from '../../src/core/server.ts';
import { seed } from '../../src/core/seed.ts';
import { SESSION_COOKIE_NAME } from '../../src/core/auth.ts';
import { readBody } from '../../src/core/router.ts';
import {
  EXEMPT, EXPIRED_TITLE, EXPIRED_WORDS, FORM_FIELD, FORM_HEADER, ONCE_FIELD, ONCE_HEADER, SENSITIVE,
  exemptFor, formToken, formTokensMode, isSensitive, onceToken, withFormTokens,
} from '../../src/core/form-token.ts';
import { formTokenRefusal } from '../../src/core/form-token-check.ts';

const BACKEND = join(import.meta.dirname, '..', '..');
const ROOT = join(BACKEND, '..', '..', '..');

type Res = { status: number; location: string | null; body: string };
type Login = 'admin' | 'sales' | 'client';

async function start() {
  const made = await createApp(':memory:', { twoFactor: 'off', formTokens: 'on', documentRoot: mkdtempSync(join(tmpdir(), 'cb-161b-')) });
  await new Promise<void>((r) => made.server.listen(0, '127.0.0.1', () => r()));
  const addr = made.server.address();
  const base = `http://127.0.0.1:${typeof addr === 'object' && addr !== null ? addr.port : 0}`;
  const s = await seed(made.app.db, made.app.hasher, made.app.now);
  const cookies = new Map<Login, string>();
  const raw = new Map<Login, string>();
  for (const who of ['admin', 'sales', 'client'] as const) {
    const r = await fetch(`${base}/login`, {
      method: 'POST', redirect: 'manual', headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ email: `${who}@example.invalid`, password: s.password }).toString(),
    });
    assert.equal(r.status, 303, `${who} could not sign in (the sign-in form needs no token)`);
    const all = r.headers.getSetCookie().map((c) => c.split(';')[0] ?? '');
    cookies.set(who, all.join('; '));
    const mine = all.find((c) => c.startsWith(`${SESSION_COOKIE_NAME}=`));
    assert.ok(mine !== undefined, 'a session cookie');
    raw.set(who, mine.slice(SESSION_COOKIE_NAME.length + 1));
  }
  const send = async (who: Login, path: string, init: RequestInit = {}): Promise<Res> => {
    const x = await fetch(base + path, { redirect: 'manual', ...init, headers: { ...(init.headers as Record<string, string> | undefined ?? {}), cookie: cookies.get(who) ?? '' } });
    return { status: x.status, location: x.headers.get('location'), body: await x.text() };
  };
  const post = (who: Login, path: string, fields: Record<string, string>, headers: Record<string, string> = {}) =>
    send(who, path, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', ...headers }, body: new URLSearchParams(fields).toString() });
  const token = (who: Login) => formToken(raw.get(who) ?? '');
  const once = (who: Login, at = Date.parse(made.app.now())) => onceToken(raw.get(who) ?? '', at);
  const refusals = () => made.app.db.get<{ n: number }>("SELECT COUNT(*) AS n FROM audit_log WHERE kind = 'FORM_TOKEN_REFUSED'")?.n ?? 0;
  const users = () => made.app.db.get<{ n: number }>('SELECT COUNT(*) AS n FROM users')?.n ?? 0;
  return { made, base, send, post, token, once, refusals, users, close: () => made.close() };
}

const expired = (r: Res) => r.status === 403 && r.body.includes(EXPIRED_TITLE);

/** Every literal route that is not GET or HEAD, and every form action, from the source. */
function routesInSource(): string[] {
  const files = execSync('git ls-files src', { cwd: BACKEND, encoding: 'utf8' }).split('\n').filter((f) => f.endsWith('.ts') && !f.includes('.bak'));
  const out = new Set<string>();
  for (const f of files) {
    const s = readFileSync(join(BACKEND, f), 'utf8');
    for (const m of s.matchAll(/(?:path|p|pathname)\s*===\s*(['"`])(\/[^'"`$]+)\1\s*&&\s*\(?\s*(?:method|req\.method)\s*===\s*['"](POST|PUT|DELETE|PATCH)['"]/g)) out.add(m[2] ?? '');
    for (const m of s.matchAll(/(?:method|req\.method)\s*===\s*['"](POST|PUT|DELETE|PATCH)['"]\s*&&\s*(?:path|p)\s*===\s*(['"`])(\/[^'"`$]+)\2/g)) out.add(m[3] ?? '');
    /* Routes written under a prefix: `${base}/...` (src/core/staff.ts's own-account pages, mounted at /staff/settings
       and /portal/settings) and `${BASE}/...` (a file's own const BASE). */
    const bases: Record<string, string[]> = { base: ['/staff/settings', '/portal/settings'] };
    const own = /const BASE = ['"`](\/[^'"`]+)['"`]/.exec(s);
    if (own) bases.BASE = [own[1] ?? ''];
    for (const m of s.matchAll(/path\s*===\s*`\$\{(base|BASE)\}(\/[^`$]*)`\s*&&\s*method\s*===\s*['"](POST|PUT|DELETE|PATCH)['"]/g)) {
      for (const b of bases[m[1] ?? ''] ?? []) out.add(b + (m[2] ?? ''));
    }
    for (const m of s.matchAll(/<form\b[^>]*method="post"[^>]*action="(\/[^"]+)"|<form\b[^>]*action="(\/[^"]+)"[^>]*method="post"/gi)) {
      out.add((m[1] ?? m[2] ?? '').replace(/\$\{[^}]*\}/g, 'x1').split('?')[0] ?? '');
    }
  }
  out.delete('');
  return [...out].sort();
}

test('161b: off by default only inside the test runner; told, it is what it is told', () => {
  assert.equal(formTokensMode(undefined, {}, []), 'on');
  assert.equal(formTokensMode(undefined, { NODE_TEST_CONTEXT: 'child-v8' }, []), 'off');
  assert.equal(formTokensMode(undefined, {}, ['--test']), 'off');
  assert.equal(formTokensMode('on', { NODE_TEST_CONTEXT: 'child-v8' }, ['--test']), 'on');
  assert.equal(formTokensMode('off', {}, []), 'off');
});

test('161b: every real start turns the tokens on in so many words', () => {
  const server = readFileSync(join(BACKEND, 'src', 'core', 'server.ts'), 'utf8');
  const main = server.slice(server.indexOf('if (import.meta.filename === process.argv[1])'));
  assert.match(main, /formTokens: 'on'/);
  assert.match(readFileSync(join(ROOT, 'api', 'index.mjs'), 'utf8'), /formTokens: 'on'/);
  assert.doesNotMatch(readFileSync(join(ROOT, 'api', 'index.mjs'), 'utf8'), /formTokens: 'off'/);
});

test('161b: every route that changes something refuses a signed-in request with no token, unless it is exempt', async () => {
  const t = await start();
  try {
    const routes = routesInSource();
    assert.ok(routes.length > 60, `routes found in the source: ${routes.length}`);
    const unchecked: string[] = [];
    for (const path of routes) {
      if (exemptFor(path) !== undefined) continue;
      const r = await t.post('admin', path, { anything: '1' });
      if (!expired(r)) unchecked.push(`${path} answered ${r.status}`);
    }
    assert.deepEqual(unchecked, [], 'a route that is neither checked nor exempt');
    for (const e of EXEMPT) {
      assert.ok(e.why.length > 20, `exempt ${e.match} says why`);
      assert.ok(routes.some((p) => e.match.test(p)), `exempt ${e.match} matches a real route`);
    }
    for (const s of SENSITIVE) assert.ok(routes.some((p) => s.match.test(p)) || /recovery-codes/.test(String(s.match)), `sensitive ${s.match} matches a real route`);
  } finally { t.close(); }
});

test('161b: no token, a wrong one and another session\'s are refused; the right one goes through', async () => {
  const t = await start();
  try {
    const before = t.refusals();
    const none = await t.post('admin', '/staff/welcome/dismiss', {});
    assert.ok(expired(none), 'no token');
    assert.match(none.body, new RegExp(EXPIRED_WORDS.replace(/[.]/g, '\\.')));
    assert.ok(expired(await t.post('admin', '/staff/welcome/dismiss', { [FORM_FIELD]: 'not-the-token' })), 'a wrong token');
    assert.ok(expired(await t.post('admin', '/staff/welcome/dismiss', { [FORM_FIELD]: t.token('sales') })), 'another session\'s token');
    assert.equal(t.refusals(), before + 3, 'each refusal is in the audit log');
    const right = await t.post('admin', '/staff/welcome/dismiss', { [FORM_FIELD]: t.token('admin') });
    assert.equal(right.status, 303, 'the right token goes through');
    assert.equal(right.location, '/staff/help');
    const header = await t.post('admin', '/staff/welcome/dismiss', {}, { [FORM_HEADER]: t.token('admin') });
    assert.equal(header.status, 303, 'or in the header');
  } finally { t.close(); }
});

test('161b: a sensitive action needs a single-use token too; used once, old, or another session\'s is refused, and nothing changes', async () => {
  const t = await start();
  try {
    const fields = { email: 'new-161b@example.invalid', display_name: 'New Person 161b', role: 'SALES' };
    assert.ok(isSensitive('/staff/users/create'));
    const n = t.users();
    assert.ok(expired(await t.post('admin', '/staff/users/create', { ...fields, [FORM_FIELD]: t.token('admin') })), 'no single-use token');
    assert.equal(t.users(), n, 'nothing changed');
    const old = t.once('admin', Date.parse(t.made.app.now()) - 3 * 60 * 60 * 1000);
    assert.ok(expired(await t.post('admin', '/staff/users/create', { ...fields, [FORM_FIELD]: t.token('admin'), [ONCE_FIELD]: old })), 'an old one');
    assert.ok(expired(await t.post('admin', '/staff/users/create', { ...fields, [FORM_FIELD]: t.token('admin'), [ONCE_FIELD]: t.once('sales') })), 'another session\'s');
    assert.equal(t.users(), n, 'still nothing changed');
    const one = t.once('admin');
    const first = await t.post('admin', '/staff/users/create', { ...fields, [FORM_FIELD]: t.token('admin'), [ONCE_FIELD]: one });
    assert.ok(!expired(first), `the right pair goes through (${first.status})`);
    assert.equal(t.users(), n + 1, 'the login was made');
    const again = await t.post('admin', '/staff/users/create', { ...fields, email: 'again-161b@example.invalid', [FORM_FIELD]: t.token('admin'), [ONCE_FIELD]: one });
    assert.ok(expired(again), 'the same single-use token a second time');
    assert.equal(t.users(), n + 1, 'no second login');
    const why = t.made.app.db.all<{ detail: string }>("SELECT detail FROM audit_log WHERE kind = 'FORM_TOKEN_REFUSED' ORDER BY seq").map((r) => r.detail).join(' ');
    assert.match(why, /used before/);
  } finally { t.close(); }
});

test('161b: pages carry the tokens in our POST forms, a sensitive form its single-use one, and the scripts read the meta', async () => {
  const t = await start();
  try {
    const page = await t.send('admin', '/staff/users');
    assert.equal(page.status, 200);
    assert.ok(page.body.includes(`<meta name="cb-form" content="${t.token('admin')}">`), 'the meta for scripts');
    const forms = [...page.body.matchAll(/<form\b[^>]*method="post"[^>]*>([\s\S]{0,400})/gi)];
    assert.ok(forms.length > 0, 'the page has POST forms');
    for (const f of forms) assert.ok((f[1] ?? '').startsWith(`<input type="hidden" name="${FORM_FIELD}" value="${t.token('admin')}">`), 'every POST form starts with the token');
    const create = /<form\b[^>]*action="\/staff\/users\/create"[^>]*>([\s\S]{0,400})/i.exec(page.body);
    assert.ok(create !== null && (create[1] ?? '').includes(`name="${ONCE_FIELD}"`), 'the create form has a single-use token');
    for (const f of ['modules/assessment/address-lookup-script.ts', 'web/photo-upload-script.ts', 'modules/claims/register-import-script.ts', 'core/upload-pieces-script.ts', 'modules/crm/whatsapp-import-script.ts']) {
      const s = readFileSync(join(BACKEND, 'src', f), 'utf8');
      assert.match(s, /meta\[name="cb-form"\]/, `${f} reads the token`);
      assert.match(s, /'x-cb-form': cbForm\(\)/, `${f} sends it`);
    }
  } finally { t.close(); }
});

test('161b: the page step leaves GET forms and other sites\' forms alone, and reads where a form sends as a browser would', () => {
  const html = '<!doctype html><html><head><title>x</title></head><body>'
    + '<form method="get" action="/staff/search"></form>'
    + '<form method="post" action="https://elsewhere.example/pay"></form>'
    + '<form method="post"></form>'
    + '<form method="post" action="/staff/finance/abc/received"></form></body></html>';
  const out = withFormTokens(html, '/staff/welcome/dismiss', 'TOKEN', () => 'ONCE');
  assert.ok(out.includes('<form method="get" action="/staff/search"></form>'), 'a GET form is left alone');
  assert.ok(out.includes('<form method="post" action="https://elsewhere.example/pay"></form>'), 'our token never goes to another site');
  assert.ok(out.includes(`<form method="post"><input type="hidden" name="${FORM_FIELD}" value="TOKEN"></form>`), 'no action: the page itself, not sensitive');
  assert.ok(out.includes(`action="/staff/finance/abc/received"><input type="hidden" name="${FORM_FIELD}" value="TOKEN"><input type="hidden" name="${ONCE_FIELD}" value="ONCE">`), 'a payment form gets both');
  assert.ok(out.includes('<head><meta name="cb-form" content="TOKEN">'));
});

test('161b: the JSON API takes the tokens in headers', async () => {
  const t = await start();
  try {
    const who = await t.send('admin', '/api/whoami');
    assert.equal((JSON.parse(who.body) as { form_token?: string }).form_token, t.token('admin'));
    const no = await t.send('admin', '/api/account/recovery-codes', { method: 'POST' });
    assert.equal(no.status, 403);
    assert.equal((JSON.parse(no.body) as { error: string }).error, EXPIRED_WORDS);
    const onceAsk = await t.send('admin', '/api/once-token');
    const once = (JSON.parse(onceAsk.body) as { once_token: string }).once_token;
    const yes = await t.send('admin', '/api/account/recovery-codes', { method: 'POST', headers: { [FORM_HEADER]: t.token('admin'), [ONCE_HEADER]: once } });
    assert.notEqual(yes.status, 403, 'with both headers it goes through');
    const out = await t.send('sales', '/api/logout', { method: 'POST', headers: { [FORM_HEADER]: t.token('sales') } });
    assert.equal(out.status, 200, 'sign-out with the header');
  } finally { t.close(); }
});

test('161b: a multipart form carries its token in the form', async () => {
  const t = await start();
  try {
    const body = (token?: string) => {
      const fd = new FormData();
      if (token !== undefined) fd.append(FORM_FIELD, token);
      fd.append('file', new Blob(['invented 161b file'], { type: 'text/plain' }), 'note-161b.txt');
      return fd;
    };
    assert.ok(expired(await t.send('client', '/portal/documents', { method: 'POST', body: body() })), 'no token');
    const ok = await t.send('client', '/portal/documents', { method: 'POST', body: body(t.token('client')) });
    assert.ok(!expired(ok), `with the token the route answers (${ok.status})`);
  } finally { t.close(); }
});

test('161b: the route reads the form without our two fields', async () => {
  const req = Object.assign(Readable.from([Buffer.from(`${FORM_FIELD}=T&name=Ann&${ONCE_FIELD}=O&note=x`)]), {
    method: 'POST', url: '/staff/tasks', headers: { 'content-type': 'application/x-www-form-urlencoded' },
  }) as unknown as IncomingMessage;
  const cookie = 'invented-cookie-161b';
  const deps = { db: { run: () => ({ changes: 1, lastInsertRowid: 0 }) }, audit: {}, now: () => '2026-11-04T12:00:00.000Z' } as never;
  assert.equal(await formTokenRefusal(deps, req, '/staff/tasks', { cookie, user_id: 'u', role: 'ADMIN' }), 'a form token from another session');
  assert.equal((await readBody(req)).toString('utf8'), 'name=Ann&note=x');
});
