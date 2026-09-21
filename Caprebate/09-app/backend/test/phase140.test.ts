/**
 * PHASE 140 — THE CLIENT'S FILES: A FOLDER ON EVERY CLIENT, A REAL UPLOAD FOR STAFF, WHO MAY SEE A FILE, AND KEEP_ORIGINALS.
 * "Back office and portal clean-up, 7 of 11." 21 September 2026.
 *
 *   1 · a folder button with a count in the client page's header, opening the company's files in folders
 *   2 · a staff upload that is a file picker (and takes a dropped file), through EXACTLY the client's path — steps 1 to 7 of
 *       the receipt contract — and no HTTP PUT address on any screen, staff or portal
 *   3 · on upload, staff choose whether the client can see the file; the default is no, and the server holds it
 *   4 · KEEP_ORIGINALS, built and switched off: off, nothing is kept and the folder says so; on, the original is kept
 *       encrypted, opened only by Admin, and deleted when its days are up
 *   5 · /staff/documents is on no menu; asked for one company it sends the reader to that company's files
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { createApp } from '../src/server.ts';
import { seed } from '../src/seed.ts';
import { can, type Actor, type Obj } from '../src/authz.ts';
import * as D from '../src/web/documents.ts';
import * as PO from '../src/web/portal.ts';
import { eventsFor } from '../src/web/uploads.ts';
import { durableKeyFor, quarantineKeyFor } from '../src/web/upload-handler-port.ts';
import { KEEP_ORIGINALS, KEEP_ORIGINALS_QUESTION, READ_AND_DELETED, keptDays, seal, unseal } from '../src/web/originals.ts';
import { backendSwitchReadings } from '../src/web/case-stamp.ts';
import { pdfOf } from './document-fixtures.ts';
import { actor } from './helpers.ts';

type Made = Awaited<ReturnType<typeof createApp>>;
type Res = { status: number; location: string | null; body: string; bytes: Buffer; type: string | null };
type Client = {
  req(path: string, init?: RequestInit): Promise<Res>;
  post(path: string, fields: Record<string, string>): Promise<Res>;
  upload(path: string, fields: Record<string, string>, file: Uint8Array | null): Promise<Res>;
};

function makeClient(base: string): Client {
  let cookie = '';
  const c: Client = {
    async req(path, init = {}) {
      const headers = { ...(init.headers as Record<string, string> | undefined) };
      if (cookie !== '') headers['cookie'] = cookie;
      const r = await fetch(base + path, { redirect: 'manual', ...init, headers });
      const set = r.headers.getSetCookie();
      if (set.length > 0) cookie = set.map((x) => x.split(';')[0] ?? '').join('; ');
      const bytes = Buffer.from(await r.arrayBuffer());
      return { status: r.status, location: r.headers.get('location'), body: bytes.toString('utf8'), bytes, type: r.headers.get('content-type') };
    },
    post(path, fields) {
      return c.req(path, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(fields).toString() });
    },
    /** A browser's form with a file: multipart/form-data, as the file picker (or a file dropped on it) sends it. */
    upload(path, fields, file) {
      const b = `----cb140${randomBytes(8).toString('hex')}`;
      const parts: Buffer[] = [];
      for (const [k, v] of Object.entries(fields)) parts.push(Buffer.from(`--${b}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${v}\r\n`, 'utf8'));
      if (file !== null) {
        parts.push(Buffer.from(`--${b}\r\nContent-Disposition: form-data; name="file"; filename="smith-lease-2019.pdf"\r\nContent-Type: application/pdf\r\n\r\n`, 'utf8'));
        parts.push(Buffer.from(file), Buffer.from('\r\n'));
      }
      parts.push(Buffer.from(`--${b}--\r\n`));
      return c.req(path, { method: 'POST', headers: { 'content-type': `multipart/form-data; boundary=${b}` }, body: Buffer.concat(parts) });
    },
  };
  return c;
}

type World = {
  made: Made; root: string; close(): void; clock: { now: string };
  signIn(who: string): Promise<Client>;
  staff(role: 'ADMIN' | 'SALES' | 'ACCOUNTING' | 'SURVEYING'): Actor;
  client: Actor; business: string; claim: string;
};

async function boot(opts: { keep?: boolean; key?: boolean; days?: number | null } = {}): Promise<World> {
  const root = mkdtempSync(join(tmpdir(), 'cb-140-'));
  const clock = { now: '2026-09-21T10:00:00.000Z' };
  const made = await createApp(':memory:', {
    documentRoot: root, now: () => clock.now,
    ...(opts.keep === true ? { keepOriginals: { enabled: true, retention_days: opts.days === undefined ? 30 : opts.days, question: KEEP_ORIGINALS_QUESTION } } : {}),
    sealKey: opts.key === false ? null : randomBytes(32),
  });
  await new Promise<void>((r) => made.server.listen(0, '127.0.0.1', () => r()));
  const addr = made.server.address();
  const base = `http://127.0.0.1:${typeof addr === 'object' && addr !== null ? addr.port : 0}`;
  const s = await seed(made.app.db, made.app.hasher, made.app.now);
  // The view-only login the seed leaves out: it reads a company and may write nothing.
  made.app.db.run('INSERT INTO users (id,email,email_canonical,display_name,role,password_hash,created_at,updated_at,business_id) VALUES (?,?,?,?,?,?,?,?,NULL)',
    ['u-140-readonly', 'readonly@example.invalid', 'readonly@example.invalid', 'View-only Person', 'READ_ONLY', await made.app.hasher.hash(s.password), clock.now, clock.now]);
  const cu = made.app.db.get<{ id: string; business_id: string }>("SELECT id, business_id FROM users WHERE role = 'CLIENT' LIMIT 1");
  assert.ok(cu);
  const claim = made.app.db.get<{ id: string }>('SELECT id FROM claims WHERE business_id = ? ORDER BY claim_ref LIMIT 1', [cu.business_id]);
  assert.ok(claim);
  const byRole = (role: string): string => {
    const u = s.users.find((x) => x.role === role);
    assert.ok(u, role);
    return u.id;
  };
  return {
    made, root, close: made.close, clock,
    async signIn(who) {
      const c = makeClient(base);
      const r = await c.post('/login', { email: `${who}@example.invalid`, password: s.password });
      assert.equal(r.status, 303, `${who} could not sign in`);
      return c;
    },
    staff: (role) => ({ id: byRole(role), role, business_id: null, disabled: false }),
    client: { id: cu.id, role: 'CLIENT', business_id: cu.business_id, disabled: false },
    business: cu.business_id, claim: claim.id,
  };
}

const PDF = (): Uint8Array => new Uint8Array(pdfOf([['DEMISE AND TERM:', 'Annual rent 25000']], { compress: true }));
const newest = (w: World): string => w.made.app.db.get<{ id: string }>('SELECT id FROM logical_documents ORDER BY created_at DESC, rowid DESC LIMIT 1')?.id ?? '';
const versionOf = (w: World, lid: string): string => w.made.app.db.get<{ id: string }>('SELECT id FROM documents WHERE logical_document_id = ? ORDER BY version_no DESC LIMIT 1', [lid])?.id ?? '';

/* ================================================================== */

describe('3 · who may see a file — the server holds it, and the default is no', () => {
  test('a client is refused a document that does not say it is shown to them — absent and false alike — and admitted when it says so', () => {
    const base: Obj = { type: 'document', id: 'd', business_id: 'biz-1', readers: 'CLAIM_EVIDENCE', carries_value: false, letter_signed: true, assigned_surveyor_ids: [] };
    const client = actor('CLIENT', 'u-c', 'biz-1');
    assert.equal(can(client, 'document.read', base), false, 'ABSENT admitted a client (N4: not known is not a yes)');
    assert.equal(can(client, 'document.read', { ...base, shown_to_client: false } as Obj), false, 'false admitted a client');
    assert.equal(can(client, 'document.read', { ...base, shown_to_client: true } as Obj), true);
    assert.equal(can(client, 'document.read_original', base), false, 'the original, absent');
    // A released client report is released by the tax adviser's sign-off, which is the decision to show it.
    assert.equal(can(client, 'document.read', { ...base, readers: 'CLAIM_TEAM', carries_value: true, released_to_client: true } as Obj), true);
    // Staff are untouched by it: the flag is about the client and nobody else.
    for (const role of ['ADMIN', 'SALES'] as const) assert.equal(can(actor(role), 'document.read', { ...base, shown_to_client: false } as Obj), true, role);
  });

  test('document.show_to_client: Admin and Sales only — never the client, a surveyor, Accounting or the view-only login', () => {
    const o: Obj = { type: 'document', id: 'd', business_id: 'biz-1', readers: 'CLAIM_EVIDENCE', carries_value: false, letter_signed: true, assigned_surveyor_ids: ['u-SURVEYING'] };
    for (const [role, want] of [['ADMIN', true], ['SALES', true], ['ACCOUNTING', false], ['SURVEYING', false], ['READ_ONLY', false]] as const) {
      assert.equal(can(actor(role, `u-${role}`), 'document.show_to_client', o), want, role);
    }
    assert.equal(can(actor('CLIENT', 'u-c', 'biz-1'), 'document.show_to_client', o), false, 'CLIENT');
  });

  test('NO ROW AT ALL: a document staff made is not shown, and one the client made is theirs — read, never assumed', async () => {
    const w = await boot();
    try {
      const db = w.made.app.db;
      const mk = (by: string, code: string): string => {
        const id = `l-${code}-${by}`;
        const seq = (db.get<{ m: number | null }>('SELECT MAX(seq) AS m FROM logical_documents WHERE business_id = ? AND type_code = ?', [w.business, code])?.m ?? 0) + 1;
        db.run('INSERT INTO logical_documents (id, business_id, type_code, seq, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?)', [id, w.business, code, seq, by, w.clock.now]);
        return id;
      };
      const ours = mk(w.staff('SALES').id, 'LEASE');
      const theirs = mk(w.client.id, 'LEASE');
      assert.equal(db.get<{ n: number }>('SELECT COUNT(*) AS n FROM document_visibility')?.n, 0);
      assert.equal(D.shownToClient(db, ours), false, 'a staff document with no row was shown');
      assert.equal(D.shownToClient(db, theirs), true);
    } finally { w.close(); }
  });

  test('the answer only ever grows: a row is never edited and never deleted', async () => {
    const w = await boot();
    try {
      const c = await w.signIn('sales');
      assert.equal((await c.upload(`/staff/clients/${w.business}/files`, { type_code: 'LEASE' }, PDF())).status, 303);
      const db = w.made.app.db;
      assert.throws(() => db.run('UPDATE document_visibility SET shown_to_client = 1'), /never edited/);
      assert.throws(() => db.run('DELETE FROM document_visibility'), /never deleted/);
    } finally { w.close(); }
  });
});

describe('2 · a staff upload is a file picker, and it is the client’s own path', () => {
  test('SALES UPLOADS A FILE WITH THE FORM: steps 1 to 7 of the receipt contract ran, the quarantined copy is gone, the name is ours, and the client cannot see it', async () => {
    const w = await boot();
    try {
      const db = w.made.app.db;
      const sales = await w.signIn('sales');
      const r = await sales.upload(`/staff/clients/${w.business}/files`, { type_code: 'LEASE', claim_id: w.claim }, PDF());
      assert.equal(r.status, 303, r.body);
      assert.equal(r.location, `/staff/clients/${w.business}/files?folder=ours&done=uploaded`);
      const lid = newest(w);
      const v = versionOf(w, lid);
      assert.deepEqual(eventsFor(db, v).map((e) => e.contract_step), [1, 2, 3, 4, 5, 6, 7], 'the handler ran every step');
      await assert.rejects(() => w.made.store.get(quarantineKeyFor(v)), 'the quarantined copy is gone');
      const row = db.get<{ filename: string; original_kept_at: string | null }>('SELECT filename, original_kept_at FROM documents WHERE id = ?', [v]);
      assert.equal(row?.filename, 'lease-1-version-1', 'the client’s file name is never kept (N2)');
      assert.equal(row?.original_kept_at, null, 'KEEP_ORIGINALS is off: nothing kept');
      assert.equal(db.get<{ n: number }>('SELECT COUNT(*) AS n FROM document_links WHERE logical_document_id = ? AND claim_id = ?', [lid, w.claim])?.n, 1, 'linked to the claim chosen');
      // THE DEFAULT IS NO, AND THE SERVER HOLDS IT: the portal does not list it, and asking for it by id is refused.
      assert.equal(D.shownToClient(db, lid), false);
      assert.equal(PO.documents(db, w.client, w.business).some((x) => x.logical_document_id === lid), false, 'the portal listed a file staff did not show');
      assert.throws(() => PO.document(db, w.client, v), 'the client opened it by id');
      const client = await w.signIn('client');
      assert.equal((await client.req(`/portal/documents/${v}`)).status, 403);
      // The folder page, the client page and the claim page show no upload address anywhere.
      for (const p of [`/staff/clients/${w.business}/files`, `/staff/clients/${w.business}`, `/staff/claims/${w.claim}`, `/staff/documents/${lid}`]) {
        const page = await sales.req(p);
        assert.ok(page.status === 200 || page.status === 303, `${p} ${page.status}`);
        assert.equal(/HTTP PUT|PUT \/upload|\/upload\/put/.test(page.body), false, `${p} shows an upload address`);
      }
    } finally { w.close(); }
  });

  test('TICKED, THE CLIENT SEES IT: the portal lists it, and taking the tick away hides it again — each change audited', async () => {
    const w = await boot();
    try {
      const db = w.made.app.db;
      const sales = await w.signIn('sales');
      assert.equal((await sales.upload(`/staff/clients/${w.business}/files`, { type_code: 'LEASE', shown_to_client: 'yes' }, PDF())).status, 303);
      const lid = newest(w);
      assert.equal(PO.documents(db, w.client, w.business).some((x) => x.logical_document_id === lid), true);
      const hide = await sales.post(`/staff/documents/${lid}/shown`, { shown_to_client: 'no', folder: 'ours' });
      assert.equal(hide.status, 303);
      assert.equal(hide.location, `/staff/clients/${w.business}/files?folder=ours&done=hidden`);
      assert.equal(PO.documents(db, w.client, w.business).some((x) => x.logical_document_id === lid), false);
      assert.equal((await sales.post(`/staff/documents/${lid}/shown`, { shown_to_client: 'yes' })).status, 303);
      assert.equal(D.shownToClient(db, lid), true);
      const kinds = db.all<{ kind: string }>("SELECT kind FROM audit_log WHERE kind IN ('DOCUMENT_SHOWN_TO_CLIENT','DOCUMENT_HIDDEN_FROM_CLIENT') ORDER BY seq").map((r) => r.kind);
      assert.deepEqual(kinds, ['DOCUMENT_HIDDEN_FROM_CLIENT', 'DOCUMENT_SHOWN_TO_CLIENT']);
      for (const who of ['accounting', 'surveying']) {
        assert.equal((await (await w.signIn(who)).post(`/staff/documents/${lid}/shown`, { shown_to_client: 'no' })).status, 403, who);
      }
      assert.equal((await (await w.signIn('client')).post(`/staff/documents/${lid}/shown`, { shown_to_client: 'no' })).status === 303, false, 'a client changed it');
    } finally { w.close(); }
  });

  test('A FILE WE DO NOT ACCEPT IS REFUSED BEFORE ANYTHING IS WRITTEN; a login that may not upload is refused before the body is read', async () => {
    const w = await boot();
    try {
      const db = w.made.app.db;
      const before = db.get<{ n: number }>('SELECT COUNT(*) AS n FROM logical_documents')?.n;
      const sales = await w.signIn('sales');
      const bad = await sales.upload(`/staff/clients/${w.business}/files`, { type_code: 'LEASE' }, new Uint8Array(Buffer.from('<?php echo 1; ?>')));
      assert.equal(bad.status, 400);
      assert.match(bad.body, /We cannot take that kind of file/);
      const none = await sales.upload(`/staff/clients/${w.business}/files`, { type_code: 'LEASE' }, null);
      assert.equal(none.status, 400);
      assert.match(none.body, /Choose a file first/);
      assert.equal(db.get<{ n: number }>('SELECT COUNT(*) AS n FROM logical_documents')?.n, before, 'a refused file left a document behind');
      // The view-only login reads the company and may upload nothing: refused before a byte of the body is read, so even a
      // body that is not a file at all is answered "not allowed", never "that is not a file".
      const ro = await w.signIn('readonly');
      assert.equal((await ro.req(`/staff/clients/${w.business}/files`)).status, 200, 'the view-only login reads the folder');
      assert.equal((await ro.post(`/staff/clients/${w.business}/files`, { type_code: 'LEASE' })).status, 403);
      assert.equal((await ro.post(`/staff/claims/${w.claim}/documents`, { type_code: 'LEASE' })).status, 403);
      for (const who of ['accounting', 'surveying']) {
        const c = await w.signIn(who);
        assert.equal((await c.upload(`/staff/clients/${w.business}/files`, { type_code: 'LEASE' }, PDF())).status, 403, who);
        assert.equal((await c.upload(`/staff/claims/${w.claim}/documents`, { type_code: 'LEASE' }, PDF())).status, 403, `${who} on the claim`);
      }
      // A claim of another company cannot be chosen.
      const other = db.get<{ id: string }>('SELECT id FROM claims WHERE business_id <> ? LIMIT 1', [w.business]);
      assert.ok(other);
      assert.equal((await sales.upload(`/staff/clients/${w.business}/files`, { type_code: 'LEASE', claim_id: other.id }, PDF())).status, 400);
    } finally { w.close(); }
  });

  test('THE CLAIM PAGE AND A NEW VERSION take the file with the form too, and land where the person was', async () => {
    const w = await boot();
    try {
      const sales = await w.signIn('sales');
      const r = await sales.upload(`/staff/claims/${w.claim}/documents`, { type_code: 'FIRE_RISK_ASSESSMENT' }, PDF());
      assert.equal(r.status, 303, r.body);
      assert.equal(r.location, `/staff/clients/${w.business}/files?folder=claim-${w.claim}&done=uploaded`);
      const lid = newest(w);
      const v2 = await sales.upload(`/staff/documents/${lid}/versions`, {}, PDF());
      assert.equal(v2.status, 303, v2.body);
      assert.equal(w.made.app.db.get<{ n: number }>('SELECT COUNT(*) AS n FROM documents WHERE logical_document_id = ?', [lid])?.n, 2);
      assert.equal(D.shownToClient(w.made.app.db, lid), false, 'a new version keeps its document’s answer');
    } finally { w.close(); }
  });

  test('THE PORTAL: the client sends a file against a request in one step, and it is received — no link page, no PUT address', async () => {
    const w = await boot();
    try {
      const db = w.made.app.db;
      const r = D.createDocumentRequest({ db, audit: w.made.app.audit, now: w.made.app.now, newId: () => randomBytes(16).toString('hex') },
        w.staff('SALES'), { business_id: w.business, claim_id: w.claim, type_code: 'LEASE', why: 'the term', holds_up: 'the survey', due_on: null });
      assert.equal(r.ok, true);
      const client = await w.signIn('client');
      const portal = await client.req('/portal');
      assert.match(portal.body, /enctype="multipart\/form-data"/);
      assert.equal(/PUT /.test(portal.body), false);
      const sent = await client.upload('/portal/documents', { request: r.ok ? r.id : '' }, PDF());
      assert.equal(sent.status, 303, sent.body);
      assert.equal(sent.location, '/portal?sent=1#documents');
      assert.equal(D.requestState(db.get<{ state: string }>('SELECT state FROM client_tasks WHERE id = ?', [r.ok ? r.id : ''])?.state ?? ''), 'RECEIVED');
      const lid = newest(w);
      assert.equal(D.shownToClient(db, lid), true, 'a file the client sent is theirs to see');
      assert.match((await client.req('/portal?sent=1')).body, /Thank you. We have your file./);
      const doc = await client.req(`/portal/documents/${versionOf(w, lid)}`);
      assert.equal(doc.status, 200);
      assert.ok(doc.body.includes(READ_AND_DELETED), 'the portal says what happened to the original, not a broken link');
      assert.equal(doc.body.includes('Ask for the original'), false);
    } finally { w.close(); }
  });
});

describe('1 · the folder, and the button that opens it', () => {
  test('THE CLIENT PAGE HAS A FILES BUTTON WITH A COUNT; the folder shows From the client, From Cap Rebate, Asked for, and one per claim', async () => {
    const w = await boot();
    try {
      const sales = await w.signIn('sales');
      await sales.upload(`/staff/clients/${w.business}/files`, { type_code: 'LEASE', claim_id: w.claim }, PDF());
      const client = await w.signIn('client');
      await client.upload('/portal/documents', { type_code: 'FIRE_RISK_ASSESSMENT' }, PDF());
      const page = await sales.req(`/staff/clients/${w.business}`);
      assert.match(page.body, new RegExp(`<a class="filesbtn" href="/staff/clients/${w.business}/files">[^]*?<span class="filecount" aria-label="2 files">2</span></a>`));
      const f = await sales.req(`/staff/clients/${w.business}/files`);
      assert.equal(f.status, 200);
      for (const name of ['From the client', 'From Cap Rebate', 'Asked for — still waiting']) assert.ok(f.body.includes(name), name);
      assert.match(f.body, new RegExp(`href="/staff/clients/${w.business}/files\\?folder=claim-${w.claim}"`));
      assert.match(f.body, /The client · \d+ \w+ 2026/, 'who sent it and when');
      assert.match(f.body, /Cap Rebate — [^·<]+ · \d+ \w+ 2026/);
      assert.match(f.body, /We read 1 page\./, 'what we read from it');
      assert.ok(f.body.includes(READ_AND_DELETED), 'no original kept, and it says so — never a broken link');
      assert.match(f.body, /Only Cap Rebate can see this/);
      assert.match(f.body, /The client can see this/);
      // A folder narrows the list, by key only.
      const ours = await sales.req(`/staff/clients/${w.business}/files?folder=ours`);
      assert.equal((ours.body.match(/class="tile filecard/g) ?? []).length, 1);
      const nonsense = await sales.req(`/staff/clients/${w.business}/files?folder=<script>`);
      assert.equal(nonsense.status, 200);
      assert.equal(nonsense.body.includes('<script>'), false);
      // The upload form: a file picker drawn as a drop area, the tick unticked.
      assert.match(f.body, /<label class="dropzone" for="upload-file">[^]*?<input id="upload-file" type="file" name="file"/);
      assert.match(f.body, /<input type="checkbox" name="shown_to_client" value="yes">/);
      assert.equal(/name="shown_to_client" value="yes" checked/.test(f.body), false, 'the default is no');
    } finally { w.close(); }
  });

  test('A LOGIN SEES IN A FOLDER ONLY WHAT IT COULD OPEN: Accounting sees no lease, a surveyor is not let in, and neither gets the upload form', async () => {
    const w = await boot();
    try {
      await (await w.signIn('sales')).upload(`/staff/clients/${w.business}/files`, { type_code: 'LEASE' }, PDF());
      const acc = await (await w.signIn('accounting')).req(`/staff/clients/${w.business}/files`);
      if (acc.status === 200) {
        assert.equal(/class="tile filecard/.test(acc.body), false, 'Accounting saw a lease');
        assert.equal(acc.body.includes('id="upload-file"'), false);
      } else {
        assert.equal(acc.status, 403);
      }
      const sur = await (await w.signIn('surveying')).req(`/staff/clients/${w.business}/files`);
      assert.equal(sur.status, 403);
      const client = await (await w.signIn('client')).req(`/staff/clients/${w.business}/files`);
      assert.notEqual(client.status, 200, 'a client reached a staff folder');
    } finally { w.close(); }
  });
});

describe('5 · /staff/documents is on no menu, and sends a company’s reader to its files', () => {
  test('asked for one company it redirects to that company’s files; the list stays reachable; no menu links it', async () => {
    const w = await boot();
    try {
      const sales = await w.signIn('sales');
      const r = await sales.req(`/staff/documents?organisation=${w.business}`);
      assert.equal(r.status, 303);
      assert.equal(r.location, `/staff/clients/${w.business}/files`);
      const list = await sales.req('/staff/documents');
      assert.equal(list.status, 200);
      const nav = /<nav class="appnav[^]*?<\/nav>/.exec(list.body)?.[0] ?? '';
      assert.equal(nav.includes('href="/staff/documents"'), false, 'Documents came back as a menu entry');
    } finally { w.close(); }
  });
});

describe('4 · KEEP_ORIGINALS — built, and switched off', () => {
  test('SHIPPED OFF, and stamped: off in the source, no kept days on the store, and the case stamp reads it', async () => {
    assert.equal(KEEP_ORIGINALS.enabled, false);
    assert.equal(KEEP_ORIGINALS.retention_days, null);
    assert.equal(KEEP_ORIGINALS.question, 'Should we keep the files clients upload, or keep deleting them once read?');
    assert.deepEqual(backendSwitchReadings().filter((x) => x.switch === 'KEEP_ORIGINALS'), [{ switch: 'KEEP_ORIGINALS', on: false, home: 'src/web/originals.ts' }]);
    const w = await boot();
    try { assert.equal(w.made.store.keptDays, null); } finally { w.close(); }
  });

  test('ON IN ALL THREE WAYS OR OFF: no key, no period, a nonsense period or not enabled — each keeps nothing', () => {
    const k = randomBytes(32);
    const q = KEEP_ORIGINALS_QUESTION;
    assert.equal(keptDays({ enabled: true, retention_days: 30, question: q }, k), 30);
    assert.equal(keptDays({ enabled: true, retention_days: 30, question: q }, null), null, 'no key');
    assert.equal(keptDays({ enabled: true, retention_days: 30, question: q }, randomBytes(16)), null, 'a short key');
    assert.equal(keptDays({ enabled: true, retention_days: null, question: q }, k), null, 'no period (N4)');
    assert.equal(keptDays({ enabled: true, retention_days: 0, question: q }, k), null);
    assert.equal(keptDays({ enabled: true, retention_days: 2.5, question: q }, k), null);
    assert.equal(keptDays({ enabled: false, retention_days: 30, question: q }, k), null);
    const sealed = seal(k, Buffer.from('%PDF-1.4 hello'));
    assert.equal(unseal(k, sealed).toString(), '%PDF-1.4 hello');
    assert.throws(() => unseal(randomBytes(32), sealed), 'another key opened it');
    const tampered = Buffer.from(sealed); tampered[tampered.length - 1] = (tampered[tampered.length - 1] ?? 0) ^ 1;
    assert.throws(() => unseal(k, tampered), 'a changed file opened');
  });

  test('ON, WITHOUT A KEY: the store refuses to keep an original, so nothing is kept and the upload still goes through', async () => {
    const w = await boot({ keep: true, key: false });
    try {
      assert.equal(w.made.store.keptDays, null);
      assert.equal((await (await w.signIn('sales')).upload(`/staff/clients/${w.business}/files`, { type_code: 'LEASE' }, PDF())).status, 303);
      assert.equal(existsSync(join(w.root, durableKeyFor(versionOf(w, newest(w))))), false);
    } finally { w.close(); }
  });

  test('SWITCHED ON: the handler keeps the original, ENCRYPTED; Admin opens it and the opening is audited; Sales cannot; when its days are up it is deleted', async () => {
    const w = await boot({ keep: true, days: 30 });
    try {
      const db = w.made.app.db;
      const bytes = PDF();
      assert.equal((await (await w.signIn('sales')).upload(`/staff/clients/${w.business}/files`, { type_code: 'LEASE' }, bytes)).status, 303);
      const lid = newest(w);
      const v = versionOf(w, lid);
      const row = db.get<{ original_kept_at: string | null; original_delete_after: string | null }>('SELECT original_kept_at, original_delete_after FROM documents WHERE id = ?', [v]);
      assert.ok(row?.original_kept_at, 'kept');
      assert.equal(row?.original_delete_after, '2026-10-21T10:00:00.000Z', '30 days after it was read');
      const onDisk = readFileSync(join(w.root, durableKeyFor(v)));
      assert.equal(onDisk.subarray(0, 4).toString('latin1') === '%PDF', false, 'the kept original is in the clear');
      assert.equal(Buffer.from(bytes).equals(onDisk), false);
      await assert.rejects(() => w.made.store.get(quarantineKeyFor(v)), 'and the quarantined copy is still deleted');
      // The handler kept it by its own rule: step 6 says so.
      assert.equal((eventsFor(db, v).find((e) => e.contract_step === 6)?.detail as { raw_file_promoted?: boolean }).raw_file_promoted, true);

      const admin = await w.signIn('admin');
      const folder = await admin.req(`/staff/clients/${w.business}/files`);
      assert.match(folder.body, new RegExp(`<a href="/staff/documents/${lid}/download">Open the original</a>`));
      const got = await admin.req(`/staff/documents/${lid}/download`);
      assert.equal(got.status, 200);
      assert.equal(got.type, 'application/pdf');
      assert.ok(got.bytes.equals(Buffer.from(bytes)), 'Admin got the original back, byte for byte');
      assert.equal(db.get<{ n: number }>("SELECT COUNT(*) AS n FROM audit_log WHERE kind = 'DOCUMENT_ORIGINAL_OPENED'")?.n, 1);
      const sales = await w.signIn('sales');
      assert.equal((await sales.req(`/staff/documents/${lid}/download`)).status, 403, 'Sales opened an original');
      assert.match((await sales.req(`/staff/clients/${w.business}/files`)).body, /We kept the original. Only Admin can open it./);

      // Its days are up: the next opening deletes it first, and says so.
      w.clock.now = '2026-10-22T10:00:00.000Z';
      // A month on, the session has lapsed too: sign in again.
      const late = await (await w.signIn('admin')).req(`/staff/documents/${lid}/download`);
      assert.equal(late.status, 410);
      assert.match(late.body, /See what we took from it/);
      assert.equal(existsSync(join(w.root, durableKeyFor(v))), false, 'the kept original outlived its days');
      assert.ok(db.get<{ original_deleted_at: string | null }>('SELECT original_deleted_at FROM documents WHERE id = ?', [v])?.original_deleted_at);
      assert.equal(db.get<{ n: number }>("SELECT COUNT(*) AS n FROM audit_log WHERE kind = 'DOCUMENT_ORIGINAL_DELETED'")?.n, 1);
    } finally { w.close(); }
  });

  test('SHIPPED OFF: Admin asking for the original gets the plain answer and a way to what we took from it', async () => {
    const w = await boot();
    try {
      await (await w.signIn('sales')).upload(`/staff/clients/${w.business}/files`, { type_code: 'LEASE' }, PDF());
      const lid = newest(w);
      const r = await (await w.signIn('admin')).req(`/staff/documents/${lid}/download`);
      assert.equal(r.status, 410);
      assert.match(r.body, /We read each file and then delete it/);
      assert.match(r.body, new RegExp(`<a href="/staff/documents/${lid}">See what we took from it</a>`));
    } finally { w.close(); }
  });
});
