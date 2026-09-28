/**
 * PHASE 144 — PLAIN WORDS A 12-YEAR-OLD CAN READ, EVERYWHERE STAFF AND CLIENTS READ. 22 September 2026.
 *
 * Lakhbir, 18 September 2026: "It needs to be readable at a 12-year-old level and to the point." Every screen's words
 * were rewritten; 03-app/caprebate-plain-words-check.cjs keeps jargon out of src/web/*.ts. These tests prove the check
 * runs green on the tree and catches planted faults, and that the carried screens (items 6 to 10 of the phase) now read
 * in plain words while every rule under them holds: an unknown is still said, never shown as a date or £0; the portal
 * document page gives counts, never the file's words; the client still sees only what is theirs.
 * (Helpers copied from test/phase140.test.ts, which exports none.)
 */
/* PHASE 151j: this file tests other things through a password sign-in, so it builds the application with
   twoFactor: 'off'. The second step itself is proved in test/phase151j.test.ts, on the default (staff must). */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { createApp } from '../src/server.ts';
import { seed } from '../src/seed.ts';
import type { Actor } from '../src/authz.ts';
import * as D from '../src/web/documents.ts';
import { KEEP_ORIGINALS_QUESTION } from '../src/web/originals.ts';
import { pdfOf } from './document-fixtures.ts';
import { PLAIN_SWAPS } from '../src/web/voice.ts';
import { NAME_SWITCHES } from '../src/web/navigation.ts';

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
      const b = `----cb144${randomBytes(8).toString('hex')}`;
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
  const root = mkdtempSync(join(tmpdir(), 'cb-144-'));
  const clock = { now: '2026-09-21T10:00:00.000Z' };
  const made = await createApp(':memory:', { twoFactor: 'off',
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
    ['u-144-readonly', 'readonly@example.invalid', 'readonly@example.invalid', 'View-only Person', 'READ_ONLY', await made.app.hasher.hash(s.password), clock.now, clock.now]);
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

const CHECK = join(import.meta.dirname, '..', '..', '..', '03-app', 'caprebate-plain-words-check.cjs');
const visible = (html: string): string => html.replace(/<(script|style)[\s\S]*?<\/\1>/g, ' ').replace(/<[^>]+>/g, ' ').replace(/&[a-z#0-9]+;/g, ' ');
const banned = (html: string): string[] => {
  const t = visible(html);
  return PLAIN_SWAPS.filter(([re]) => re.test(t)).map(([, word]) => word);
};

describe('1 · the plain words check', () => {
  test('runs GREEN on the tree: no banned word and no sentence above grade 9 in anything a person reads', () => {
    const r = spawnSync(process.execPath, [CHECK], { encoding: 'utf8' });
    assert.equal(r.status, 0, r.stdout.split('\n').filter((l) => l.startsWith('FAIL')).slice(0, 20).join('\n'));
    assert.match(r.stdout, /GREEN/);
  });
  test('its self-test catches every planted fault and passes every clean control', () => {
    const out = execFileSync(process.execPath, [CHECK, '--self-test'], { encoding: 'utf8' });
    assert.match(out, /every planted fault caught, every control clean/);
    assert.equal(/MISSED|FALSE|NOT ON/.test(out), false, out);
  });
  test('the list carries every word the brief names, each with a plain swap', () => {
    const words = PLAIN_SWAPS.map(([, w]) => w);
    for (const w of ['fired', 'tier', 'provenance', 'derived', 'gate', 'receipt strip', 'hash', 'chain', 'N4', 'payload', 'stub', 'outbox', 'deletion clock']) {
      assert.ok(words.includes(w), `"${w}" is not on the plain-words list`);
    }
    for (const [, , swap] of PLAIN_SWAPS) assert.ok(swap.length > 0);
  });
});

describe('2 · the client step names are on, as Lakhbir answered on 22 September 2026', () => {
  test('the switch ships on', () => { assert.equal(NAME_SWITCHES.portalSteps, true); });
});

describe('3 · the carried screens read in plain words, and the rules under them hold', () => {
  test('item 7 · the portal document page gives counts ("We read 1 page."), not the twelve-step table, and says an unknown as a state', async () => {
    const w = await boot();
    try {
      const db = w.made.app.db;
      const r = D.createDocumentRequest({ db, audit: w.made.app.audit, now: w.made.app.now, newId: () => randomBytes(16).toString('hex') }, w.staff('SALES'),
        { business_id: w.business, claim_id: w.claim, type_code: 'LEASE', why: 'the term', holds_up: 'the survey', due_on: null });
      assert.equal(r.ok, true);
      const client = await w.signIn('client');
      const sent = await client.upload('/portal/documents', { request: r.ok ? r.id : '' }, PDF());
      assert.equal(sent.status, 303, sent.body);
      const doc = await client.req(`/portal/documents/${versionOf(w, newest(w))}`);
      assert.equal(doc.status, 200);
      assert.match(visible(doc.body), /We read 1 page\./);
      assert.equal(/receipt contract|twelve-step|does not narrate/i.test(doc.body), false, 'the twelve-step table is still drawn');
      assert.deepEqual(banned(doc.body), []);
      assert.equal(doc.body.includes('Annual rent 25000'), false, 'the portal page shows the file\'s words');
    } finally { w.close(); }
  });

  test('item 7 · a staff document page: "What we did with the file", and no deletion clock, receipt strip or UNSET', async () => {
    const w = await boot();
    try {
      const db = w.made.app.db;
      const r = D.createDocumentRequest({ db, audit: w.made.app.audit, now: w.made.app.now, newId: () => randomBytes(16).toString('hex') }, w.staff('SALES'),
        { business_id: w.business, claim_id: w.claim, type_code: 'LEASE', why: 'the term', holds_up: 'the survey', due_on: null });
      const client = await w.signIn('client');
      await client.upload('/portal/documents', { request: r.ok ? r.id : '' }, PDF());
      const admin = await w.signIn('admin');
      const page = await admin.req(`/staff/documents/${newest(w)}`);
      assert.equal(page.status, 200);
      assert.match(page.body, /What we did with the file/);
      assert.deepEqual(banned(page.body), []);
      const types = await admin.req('/staff/document-types');
      assert.equal(types.status, 200);
      assert.deepEqual(banned(types.body), []);
      assert.match(visible(types.body), /No deletion date set yet/, 'a type with no deletion date must say so as a state');
    } finally { w.close(); }
  });

  test('item 8 · Your account lists "Emails waiting to send", "Saved — not sent yet", and the kind in words — never "stubbed"', async () => {
    const w = await boot();
    try {
      const admin = await w.signIn('admin');
      const s = await admin.req('/staff/settings');
      assert.equal(s.status, 200);
      assert.match(s.body, /Emails waiting to send/);
      assert.equal(/stubbed|NOT SENT|>TEMPLATE<|>NOTIFICATION</.test(s.body), false);
      assert.deepEqual(banned(s.body), []);
    } finally { w.close(); }
  });

  test('item 9 · the retention list says "No deletion date set yet" and "No rule for this yet", never UNSET, NOT_COVERED or DERIVED', async () => {
    const w = await boot();
    try {
      const admin = await w.signIn('admin');
      const r = await admin.req('/staff/compliance/retention');
      assert.equal(r.status, 200);
      const t = visible(r.body);
      assert.match(t, /No deletion date set yet/);
      assert.match(t, /No rule for this yet/);
      assert.equal(/UNSET|NOT_COVERED|DERIVED, NOT APPROVED/.test(t), false);
    } finally { w.close(); }
  });

  test('the audit page and the Reports page carry no banned word; Reports still says an unknown is not counted as £0', async () => {
    const w = await boot();
    try {
      const admin = await w.signIn('admin');
      const audit = await admin.req('/staff/audit');
      assert.match(audit.body, /Audit log checked — nothing changed/);
      assert.deepEqual(banned(audit.body), []);
      const rep = await admin.req('/staff/reports');
      assert.equal(rep.status, 200);
      assert.deepEqual(banned(rep.body), []);
      assert.match(visible(rep.body), /not counted as £0/, 'the unknown estimates are no longer said apart (N4)');
    } finally { w.close(); }
  });
});
