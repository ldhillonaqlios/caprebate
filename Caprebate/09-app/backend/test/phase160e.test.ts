/**
 * PHASE 160e, 19 OCTOBER 2026 — THE STRESS TEST'S FIXES.
 *
 *   1  a document over Vercel's 4.5 MB a request arrives in pieces and is received as any document is: the portal's
 *      form, a message's file and the staff upload forms (src/web/upload-pieces.ts)
 *   2  a send in pieces is one person's, used once, every piece the size it said, and swept after a day
 *
 * The stress test sent a 6 MB document to the test website and Vercel refused it with its own page ("Request Entity Too
 * Large"), while the portal said "The most we take is 50 MB". Every person, business and file here is invented.
 */
/* This file signs in with a password only, so it builds the application with twoFactor: 'off'. */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import type { IncomingMessage } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes, randomUUID } from 'node:crypto';
import { createApp } from '../src/server.ts';
import { seed } from '../src/seed.ts';
import { Db, migrate } from '../src/db.ts';
import { FsObjectStore } from '../src/web/objectstore.ts';
import { PIECED_ABOVE, PIECE_BYTES, MAX_PIECED_BYTES, PIECES_PAGE_CSP, piecesPage, putPiece, startPieces, sweepPieces, takePieces } from '../src/web/upload-pieces.ts';
import { UPLOAD_PIECES_JS } from '../src/web/upload-pieces-script.ts';
import type { Actor } from '../src/authz.ts';
import { LOGIN_SOURCE_LIMIT, RESET_LIMIT, RESET_SOURCE_LIMIT } from '../src/auth.ts';
import { clientIp } from '../src/web/router.ts';

const MIGRATIONS = join(import.meta.dirname, '..', 'migrations');
/** A PDF of about `mb` megabytes that the upload checks accept: a header, invented words, and an end. */
const BIG_PDF = (mb: number) => new Uint8Array(Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.alloc(Math.round(mb * 1024 * 1024), 0x61), Buffer.from('\n%%EOF\n')]));

type Res = { status: number; body: string; headers: Headers };

async function boot() {
  const made = await createApp(':memory:', { twoFactor: 'off', documentRoot: mkdtempSync(join(tmpdir(), 'cb-160e-')), now: () => '2026-10-19T10:00:00.000Z', sealKey: randomBytes(32) });
  await new Promise<void>((r) => made.server.listen(0, '127.0.0.1', () => r()));
  const addr = made.server.address();
  const base = `http://127.0.0.1:${typeof addr === 'object' && addr !== null ? addr.port : 0}`;
  const s = await seed(made.app.db, made.app.hasher, made.app.now);
  async function signIn(who: string) {
    let cookie = '';
    const req = async (path: string, init: RequestInit = {}): Promise<Res> => {
      const headers = { ...(init.headers as Record<string, string> | undefined) };
      if (cookie !== '') headers['cookie'] = cookie;
      const r = await fetch(base + path, { redirect: 'manual', ...init, headers });
      const set = r.headers.getSetCookie();
      if (set.length > 0) cookie = set.map((x) => x.split(';')[0] ?? '').join('; ');
      return { status: r.status, body: await r.text(), headers: r.headers };
    };
    const r = await req('/login', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ email: `${who}@example.invalid`, password: s.password }).toString() });
    assert.equal(r.status, 303, `${who} could not sign in`);
    /** The page's script, step by step: start, each piece, then the form with its file box empty. */
    async function sendInPieces(bytes: Uint8Array): Promise<string> {
      const st = await req('/upload/pieces/start', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: `size=${String(bytes.length)}` });
      assert.equal(st.status, 200, st.body);
      const j = JSON.parse(st.body) as { ok: boolean; id: string; piece_bytes: number; pieces: number };
      for (let n = 0; n < j.pieces; n++) {
        const p = await req(`/upload/pieces/${j.id}/${String(n)}`, { method: 'PUT', headers: { 'content-type': 'application/octet-stream' }, body: bytes.slice(n * j.piece_bytes, (n + 1) * j.piece_bytes) });
        assert.equal(p.status, 200, p.body);
      }
      return j.id;
    }
    const formWith = (fields: Record<string, string>): FormData => {
      const fd = new FormData();
      for (const [k, v] of Object.entries(fields)) fd.append(k, v);
      fd.append('file', new Blob([]), ''); // what a browser sends for a disabled or empty file box
      return fd;
    };
    return { req, sendInPieces, formWith };
  }
  return { made, base, signIn, close: made.close, db: made.app.db };
}

const docCount = (db: Db): number => db.get<{ n: number }>('SELECT COUNT(*) AS n FROM documents')?.n ?? 0;

describe('1 · a document over 4.5 MB arrives in pieces and is received as any document is', () => {
  test('the portal page names the script, and its security policy lets it send to this site only', async () => {
    const b = await boot();
    try {
      const c = await b.signIn('client');
      const p = await c.req('/portal');
      assert.equal(p.status, 200);
      assert.match(p.body, /<form method="post" action="\/portal\/documents" enctype="multipart\/form-data" data-pieces>/);
      assert.match(p.body, /<script src="\/assets\/upload-pieces\.js" defer><\/script><\/body>/);
      const csp = p.headers.get('content-security-policy') ?? '';
      assert.match(csp, /script-src 'self';/);
      assert.match(csp, /connect-src 'self';/);
      assert.doesNotMatch(csp, /unsafe|https?:/);
      const js = await c.req('/assets/upload-pieces.js');
      assert.equal(js.status, 200);
      assert.equal(js.body, UPLOAD_PIECES_JS);
      assert.match(js.body, new RegExp(`var ABOVE = ${String(PIECED_ABOVE)};`));
    } finally { b.close(); }
  });

  test('a 9 MB lease sent in pieces through the portal form is received, and its pieces are gone', async () => {
    const b = await boot();
    try {
      const c = await b.signIn('client');
      const before = docCount(b.db);
      const pdf = BIG_PDF(9);
      assert.ok(pdf.length > 4.5 * 1000 * 1000, 'bigger than Vercel takes in one request');
      const id = await c.sendInPieces(pdf);
      const r = await c.req('/portal/documents', { method: 'POST', body: (() => { const f = c.formWith({ type_code: 'LEASE', pieces: id }); return f; })() });
      assert.equal(r.status, 303, r.body.slice(0, 400));
      assert.match(r.headers.get('location') ?? '', /^\/portal\?sent=1/);
      assert.equal(docCount(b.db), before + 1);
      const row = b.db.get<{ ended_how: string }>('SELECT ended_how FROM upload_pieces WHERE id = ?', [id]);
      assert.equal(row?.ended_how, 'TAKEN');
      // Taken once: the same id again is refused, in words.
      const again = await c.req('/portal/documents', { method: 'POST', body: c.formWith({ type_code: 'LEASE', pieces: id }) });
      assert.equal(again.status, 400);
      assert.match(again.body, /did not finish arriving/);
    } finally { b.close(); }
  });

  test('a big file attached to a portal message arrives in pieces too', async () => {
    const b = await boot();
    try {
      const c = await b.signIn('client');
      const before = docCount(b.db);
      const id = await c.sendInPieces(BIG_PDF(6));
      const r = await c.req('/portal/messages', { method: 'POST', body: c.formWith({ body: 'Here is the lease.', type_code: 'LEASE', pieces: id }) });
      assert.equal(r.status, 303, r.body.slice(0, 400));
      assert.equal(docCount(b.db), before + 1);
    } finally { b.close(); }
  });

  test('the checks every document gets still run on a file sent in pieces: a damaged PDF is refused', async () => {
    const b = await boot();
    try {
      const c = await b.signIn('client');
      const broken = new Uint8Array(Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.alloc(5 * 1024 * 1024, 0x61)]));
      const id = await c.sendInPieces(broken);
      const r = await c.req('/portal/documents', { method: 'POST', body: c.formWith({ type_code: 'LEASE', pieces: id }) });
      assert.equal(r.status, 400);
      assert.match(r.body, /damaged or incomplete/);
    } finally { b.close(); }
  });

  test('a file at or under the limit still goes whole with the form, as before', async () => {
    const b = await boot();
    try {
      const c = await b.signIn('client');
      const before = docCount(b.db);
      const fd = new FormData();
      fd.append('type_code', 'LEASE');
      fd.append('file', new Blob([BIG_PDF(1)], { type: 'application/pdf' }), 'lease.pdf');
      const r = await c.req('/portal/documents', { method: 'POST', body: fd });
      assert.equal(r.status, 303);
      assert.equal(docCount(b.db), before + 1);
    } finally { b.close(); }
  });

  test('the staff upload forms carry the script, and a claim document sent in pieces is received', async () => {
    const b = await boot();
    try {
      const s = await b.signIn('admin');
      const claim = b.db.get<{ id: string }>('SELECT id FROM claims ORDER BY created_at LIMIT 1');
      assert.ok(claim !== undefined, 'the seed has a claim');
      const page = await s.req(`/staff/claims/${claim.id}`);
      if (/action="\/staff\/claims\/[^"]+\/documents"/.test(page.body)) {
        assert.match(page.body, /\/documents" enctype="multipart\/form-data" class="uploadbox" data-pieces>/);
        assert.match(page.body, /\/assets\/upload-pieces\.js/);
      }
      const before = docCount(b.db);
      const id = await s.sendInPieces(BIG_PDF(5));
      const r = await s.req(`/staff/claims/${claim.id}/documents`, { method: 'POST', body: s.formWith({ type_code: 'LEASE', pieces: id }) });
      assert.equal(r.status, 303, r.body.slice(0, 400));
      assert.equal(docCount(b.db), before + 1);
      // The document's own page offers a new version, and names the script too (drawn by src/web/documents-pages.ts).
      const after = await s.req(r.headers.get('location') ?? `/staff/claims/${claim.id}`);
      const docId = /href="\/staff\/documents\/([A-Za-z0-9-]+)"/.exec(after.body)?.[1];
      assert.ok(docId !== undefined, 'the claim page links the document');
      const doc = { id: docId };
      const own = await s.req(`/staff/documents/${doc.id}`);
      assert.equal(own.status, 200);
      assert.match(own.body, /\/versions" enctype="multipart\/form-data" class="uploadbox" data-pieces>/);
      assert.ok(own.body.includes('<script src="/assets/upload-pieces.js" defer></script></body>'), 'the document page has an upload form and no script');
      assert.equal(own.headers.get('content-security-policy'), PIECES_PAGE_CSP);
      const v = await s.sendInPieces(BIG_PDF(5));
      const nv = await s.req(`/staff/documents/${doc.id}/versions`, { method: 'POST', body: s.formWith({ pieces: v }) });
      assert.equal(nv.status, 303, nv.body.slice(0, 400));
    } finally { b.close(); }
  });
});

describe('2 · a send in pieces is one person\'s, used once, the size it said, and swept after a day', () => {
  function world() {
    const db = new Db(':memory:');
    migrate(db, MIGRATIONS);
    const t = '2026-10-19T10:00:00.000Z';
    for (const id of ['u-a', 'u-b']) {
      db.run("INSERT INTO users (id,email,email_canonical,display_name,role,password_hash,created_at,updated_at,business_id) VALUES (?,?,?,?,'SALES','x',?,?,NULL)", [id, `${id}@example.invalid`, `${id}@example.invalid`, id, t, t]);
    }
    let now = t;
    const d = { db, now: () => now, newId: randomUUID };
    const store = new FsObjectStore({ root: mkdtempSync(join(tmpdir(), 'cb-160e-s-')), sealKey: randomBytes(32) });
    const A: Actor = { id: 'u-a', role: 'SALES', business_id: null, disabled: false };
    const B: Actor = { id: 'u-b', role: 'SALES', business_id: null, disabled: false };
    return { d, store, A, B, later: (ms: number) => { now = new Date(Date.parse(t) + ms).toISOString(); } };
  }

  test('the size decides the pieces; empty, too big and nonsense sizes are refused', () => {
    const w = world();
    const r = startPieces(w.d, w.A, String(PIECE_BYTES * 2 + 5));
    assert.ok(r.ok && r.pieces === 3 && r.piece_bytes === PIECE_BYTES);
    for (const bad of ['0', '', '-1', 'abc', String(MAX_PIECED_BYTES + 1)]) assert.equal(startPieces(w.d, w.A, bad).ok, false, bad);
  });

  test('another login cannot add to it or take it; a piece of the wrong size is refused; it is kept sealed', async () => {
    const w = world();
    const s = startPieces(w.d, w.A, String(PIECE_BYTES + 10));
    assert.ok(s.ok);
    assert.equal((await putPiece(w.d, w.store, w.B, s.id, '0', new Uint8Array(PIECE_BYTES))).ok, false);
    assert.equal((await putPiece(w.d, w.store, w.A, s.id, '0', new Uint8Array(PIECE_BYTES - 1))).ok, false);
    assert.equal((await putPiece(w.d, w.store, w.A, s.id, '2', new Uint8Array(10))).ok, false);
    const first = new Uint8Array(PIECE_BYTES).fill(7);
    assert.ok((await putPiece(w.d, w.store, w.A, s.id, '0', first)).ok);
    const kept = await w.store.takeIncoming(`survey-incoming/pieces/${s.id}/0`);
    assert.ok(kept !== null && !Buffer.from(kept).equals(Buffer.from(first)), 'a piece is never kept as it came');
    assert.ok((await putPiece(w.d, w.store, w.A, s.id, '1', new Uint8Array(10).fill(8))).ok);
    assert.equal((await takePieces(w.d, w.store, w.B, s.id)).ok, false);
    const got = await takePieces(w.d, w.store, w.A, s.id);
    assert.ok(got.ok && got.bytes.length === PIECE_BYTES + 10 && got.bytes[0] === 7 && got.bytes[PIECE_BYTES] === 8);
    assert.equal(await w.store.takeIncoming(`survey-incoming/pieces/${s.id}/0`), null, 'the pieces are removed once taken');
    assert.equal((await takePieces(w.d, w.store, w.A, s.id)).ok, false, 'used once');
  });

  test('a send missing a piece is refused and its pieces removed', async () => {
    const w = world();
    const s = startPieces(w.d, w.A, String(PIECE_BYTES + 10));
    assert.ok(s.ok);
    assert.ok((await putPiece(w.d, w.store, w.A, s.id, '0', new Uint8Array(PIECE_BYTES))).ok);
    assert.equal((await takePieces(w.d, w.store, w.A, s.id)).ok, false);
    assert.equal(await w.store.takeIncoming(`survey-incoming/pieces/${s.id}/0`), null);
  });

  test('a send not taken within a day is swept, with its pieces', async () => {
    const w = world();
    const s = startPieces(w.d, w.A, '100');
    assert.ok(s.ok);
    assert.ok((await putPiece(w.d, w.store, w.A, s.id, '0', new Uint8Array(100))).ok);
    assert.equal(await sweepPieces(w.d, w.store), 0, 'not yet a day');
    w.later(25 * 3600 * 1000);
    assert.equal(await sweepPieces(w.d, w.store), 1);
    assert.equal(await w.store.takeIncoming(`survey-incoming/pieces/${s.id}/0`), null);
    assert.equal(w.d.db.get<{ ended_how: string }>('SELECT ended_how FROM upload_pieces WHERE id = ?', [s.id])?.ended_how, 'SWEPT');
    assert.equal((await takePieces(w.d, w.store, w.A, s.id)).ok, false);
  });

  test('signed out, nothing can be started or sent; a piece over the size is refused before it is read', async () => {
    const b = await boot();
    try {
      const st = await fetch(`${b.base}/upload/pieces/start`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: 'size=10' });
      assert.equal(st.status, 401);
      const put = await fetch(`${b.base}/upload/pieces/${randomUUID()}/0`, { method: 'PUT', body: new Uint8Array(10) });
      assert.equal(put.status, 401);
      const c = await b.signIn('client');
      const big = await c.req(`/upload/pieces/${randomUUID()}/0`, { method: 'PUT', headers: { 'content-type': 'application/octet-stream' }, body: new Uint8Array(PIECE_BYTES + 1) });
      assert.equal(big.status, 413);
    } finally { b.close(); }
  });

  test('a page without an upload form is left as it was', () => {
    const h = { 'content-security-policy': "default-src 'none'" };
    assert.deepEqual(piecesPage(h, '<html><body><p>Hello</p></body></html>'), { headers: h, body: '<html><body><p>Hello</p></body></html>' });
  });
});

describe('3 · sign-in and password resets are slowed from one network address, as well as per email', () => {
  test('one password tried on many logins from one address is refused after the limit, and a right password with it', async () => {
    const b = await boot();
    try {
      const post = (path: string, f: Record<string, string>) => fetch(`${b.base}${path}`, { method: 'POST', redirect: 'manual', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(f).toString() });
      for (let i = 0; i < LOGIN_SOURCE_LIMIT; i++) {
        const r = await post('/login', { email: `spray${String(i)}@example.invalid`, password: 'Summer2026!' });
        assert.equal(r.status, 401);
      }
      const right = await post('/login', { email: 'client@example.invalid', password: 'change-this-seed-password' });
      assert.equal(right.status, 401, 'from this address, even a right password waits');
      assert.match(await right.text(), /those details did not match/);
      const rows = b.db.all<{ detail: string }>("SELECT detail FROM audit_log WHERE kind = 'RATE_LIMITED'");
      assert.ok(rows.some((r) => r.detail.includes('login_from_one_address')));
      assert.ok(rows.every((r) => !r.detail.includes('127.0.0.1')), 'the address is never written down');
    } finally { b.close(); }
  });

  test('password resets for many logins from one address stop sending after the limit, with the same page', async () => {
    const b = await boot();
    try {
      const before = b.db.get<{ n: number }>("SELECT COUNT(*) AS n FROM outbox WHERE subject LIKE 'Reset your%'")?.n ?? 0;
      const ask = () => fetch(`${b.base}/login/forgot`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: 'email=client%40example.invalid' });
      const pages = new Set<number>();
      for (let i = 0; i < RESET_SOURCE_LIMIT + 5; i++) { const r = await ask(); pages.add((await r.text()).length); }
      assert.equal(pages.size, 1, 'the same page every time');
      const after = b.db.get<{ n: number }>("SELECT COUNT(*) AS n FROM outbox WHERE subject LIKE 'Reset your%'")?.n ?? 0;
      assert.ok(after - before <= RESET_LIMIT, `at most ${String(RESET_LIMIT)} emails, not ${String(after - before)}`);
    } finally { b.close(); }
  });

  test('behind the test website\'s proxy the visitor\'s address is read from X-Forwarded-For, and only there', async () => {
    const src = readFileSync(join(import.meta.dirname, '..', '..', '..', '..', 'api', 'index.mjs'), 'utf8');
    assert.match(src, /process\.env\.CAPREBATE_TRUST_PROXY \?\?= '1';/);
    const req = { headers: { 'x-forwarded-for': '203.0.113.9, 10.0.0.1' }, socket: { remoteAddress: '10.0.0.1' } } as unknown as IncomingMessage;
    const was = process.env.CAPREBATE_TRUST_PROXY;
    try {
      delete process.env.CAPREBATE_TRUST_PROXY;
      assert.equal(clientIp(req), '10.0.0.1', 'anywhere else, a typed header is ignored');
      process.env.CAPREBATE_TRUST_PROXY = '1';
      assert.equal(clientIp(req), '203.0.113.9');
    } finally { if (was === undefined) delete process.env.CAPREBATE_TRUST_PROXY; else process.env.CAPREBATE_TRUST_PROXY = was; }
  });
});

describe('4 · a form sent from another website is refused', () => {
  test('a browser\'s cross-site post is refused before anything is read; our own and a service\'s are not', async () => {
    const b = await boot();
    try {
      const post = (headers: Record<string, string>) => fetch(`${b.base}/login`, { method: 'POST', redirect: 'manual', headers: { 'content-type': 'application/x-www-form-urlencoded', ...headers }, body: 'email=client%40example.invalid&password=change-this-seed-password' });
      const cross = await post({ 'sec-fetch-site': 'cross-site', origin: 'null' });
      assert.equal(cross.status, 403);
      assert.match(await cross.text(), /came from another website/);
      assert.equal((await post({ 'sec-fetch-site': 'same-origin', origin: 'null' })).status, 303, 'our own form, Origin null under no-referrer');
      assert.equal((await post({})).status, 303, 'no browser marks (a service, or an older browser): read as before');
      const page = await fetch(`${b.base}/login`, { headers: { 'sec-fetch-site': 'cross-site' } });
      assert.equal(page.status, 200, 'a link from another website still opens a page');
    } finally { b.close(); }
  });
});

describe('5 · every page with an upload form names the script, however it is drawn', () => {
  test('a crawl of the back office (Admin) and the portal finds no upload form left without it', async () => {
    const b = await boot();
    try {
      for (const [who, start] of [['admin', '/staff'], ['client', '/portal']] as const) {
        const c = await b.signIn(who);
        const seen = new Set<string>(); const queue: string[] = [start]; let forms = 0;
        while (queue.length > 0 && seen.size < 400) {
          const p = queue.shift() ?? ''; if (seen.has(p)) continue; seen.add(p);
          const r = await c.req(p);
          if (!(r.headers.get('content-type') ?? '').startsWith('text/html')) continue;
          if (/<form[^>]*enctype="multipart\/form-data"[^>]*data-pieces/.test(r.body)) {
            forms++;
            assert.ok(r.body.includes('<script src="/assets/upload-pieces.js" defer></script></body>'), `${p} (${who}) has an upload form and no script`);
            assert.equal(r.headers.get('content-security-policy'), PIECES_PAGE_CSP, `${p} (${who})`);
          }
          for (const m of r.body.matchAll(/href="(\/(?:staff|portal)[^"#?]*)"/g)) { const h = m[1] ?? ''; if (!seen.has(h) && !/logout|download|export|\.pdf|\.csv|\.ics/.test(h)) queue.push(h); }
        }
        assert.ok(forms > 0, `${who} reached no upload form`);
      }
    } finally { b.close(); }
  });
});
