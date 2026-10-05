/**
 * CRM 4 OF 10 — DOCUMENTS ON THE CLAIM: TYPES, VERSIONS, LINKS, REQUESTS, AND WHO
 * MAY SEE THEM. 11 September 2026.
 *
 * THE PHASE'S OWN PROOF LIST, AND WHERE EACH ONE IS BELOW:
 *
 *   "a new action denies by default and a test asserts the refusal for every
 *    role not granted it"                          → WHO MAY DO WHAT
 *   "a refusal per role per sensitivity"            → WHO MAY DO WHAT (the reader classes) and, over HTTP, ROLES ON THE WIRE
 *   "the receipt strip still running over every new type"
 *                                                    → THE STRIP OVER EVERY TYPE
 *   "a version test"                                → VERSIONS
 *   "a request closed by an upload and not by a click"
 *                                                    → REQUESTS — and end to end over HTTP, through the portal and the PUT
 *   "Call fireAutomation when a request is created, with a test"
 *                                                    → REQUESTS: the automation
 *   "flagged OVERDUE by the UK date on the claim, the owner's list and the
 *    landing page … never judged on the UTC date"   → REQUESTS: overdue
 *   "UNSET is a visible state, never a default"      → TYPES, and N4 — assert both
 *   "one lease can serve two claims"                 → LINKS
 *   "no name into the claim record"                  → LINKS: no person column; VERSIONS: a derived file name
 *   "extend its sources, never a second event log"   → the timeline, and the tables migration 013 adds
 */

/* PHASE 151j: this file tests other things through a password sign-in, so it builds the application with
   twoFactor: 'off'. The second step itself is proved in test/phase151j.test.ts, on the default (staff must). */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { createApp } from '../src/server.ts';
import { seed } from '../src/seed.ts';
import { APP_ROLES, type AppRole } from '../src/roles.ts';
import { can, REGISTERED_ACTIONS, NotAuthorised, type Actor, type Obj } from '../src/authz.ts';
import * as D from '../src/web/documents.ts';
import * as C from '../src/web/crm.ts';
import * as T from '../src/web/tasks.ts';
import * as TL from '../src/web/timeline.ts';
import * as E from '../src/web/engaged.ts';
import * as PO from '../src/web/portal.ts';
import { acceptClientBytes, finishUpload, eventsFor, issuedJob } from '../src/web/uploads.ts';
import { DOC_SPECS, HUMAN_READ_ONLY_TYPES, RET7, quarantineKeyFor } from '../src/web/upload-handler-port.ts';
import { pdfOf } from './document-fixtures.ts';
import { actor, signatureRecordFor } from './helpers.ts';

const T0 = '2026-09-08T12:00:00.000Z';
const SCRIPT = '<script>alert(1)</script><img src=x onerror=alert(2)>';
const MIGRATION = fileURLToPath(new URL('../migrations/013-documents-on-the-claim.sql', import.meta.url));

type Made = Awaited<ReturnType<typeof createApp>>;
type Res = { status: number; location: string | null; body: string };
type Client = {
  req(path: string, init?: RequestInit): Promise<Res>;
  post(path: string, fields: Record<string, string>): Promise<Res>;
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
      return { status: r.status, location: r.headers.get('location'), body: await r.text() };
    },
    post(path, fields) {
      return c.req(path, {
        method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams(fields).toString(),
      });
    },
  };
  return c;
}

type World = {
  made: Made;
  close(): void;
  signIn(who: string): Promise<Client>;
  staff(role: AppRole): Actor;
  client: Actor;
  /** The seeded survey job's organisation, its claim and its surveyor. */
  job: { business: string; claim: string; surveyor: string };
  clientClaim: string;
};

async function boot(): Promise<World> {
  const made = await createApp(':memory:', { twoFactor: 'off', documentRoot: mkdtempSync(join(tmpdir(), 'cb-docs-')) });
  await new Promise<void>((r) => made.server.listen(0, '127.0.0.1', () => r()));
  const addr = made.server.address();
  const base = `http://127.0.0.1:${typeof addr === 'object' && addr !== null ? addr.port : 0}`;
  const s = await seed(made.app.db, made.app.hasher, made.app.now);
  const byRole = (role: AppRole): { id: string; role: AppRole } => {
    const u = s.users.find((x) => x.role === role);
    assert.ok(u, role);
    return u;
  };
  const clientUser = made.app.db.get<{ id: string; business_id: string }>("SELECT id, business_id FROM users WHERE role = 'CLIENT' LIMIT 1");
  assert.ok(clientUser);
  const j = made.app.db.get<{ business_id: string; claim_id: string; surveyor_id: string }>(
    'SELECT business_id, claim_id, surveyor_id FROM surveyor_jobs WHERE surveyor_id IS NOT NULL AND claim_id IS NOT NULL LIMIT 1');
  assert.ok(j, 'the seed has an assigned survey job on a claim');
  const cc = made.app.db.get<{ id: string }>('SELECT id FROM claims WHERE business_id = ? ORDER BY claim_ref LIMIT 1', [clientUser.business_id]);
  assert.ok(cc);
  return {
    made, close: made.close,
    async signIn(who) {
      const c = makeClient(base);
      const r = await c.post('/login', { email: `${who}@example.invalid`, password: s.password });
      assert.equal(r.status, 303, `${who} could not sign in`);
      return c;
    },
    staff: (role) => ({ id: byRole(role).id, role, business_id: null, disabled: false }),
    client: { id: clientUser.id, role: 'CLIENT', business_id: clientUser.business_id, disabled: false },
    job: { business: j.business_id, claim: j.claim_id, surveyor: j.surveyor_id },
    clientClaim: cc.id,
  };
}

function deps(w: World): D.DocDeps & { store: Made['store'] } {
  return { db: w.made.app.db, audit: w.made.app.audit, now: w.made.app.now, newId: randomUUID, store: w.made.store };
}

/** An upload, the whole way: the link, the bytes, the handler's steps 2 to 7, and the receipt of a request. */
async function upload(w: World, who: Actor, args: Partial<D.StartArgs> & { business_id: string }, lines: readonly string[] = ['DEMISE AND TERM:', 'Annual rent 25000']) {
  const s = await D.startDocumentUpload(deps(w), who, { type_code: null, logical_document_id: null, request_id: null, claim_id: null, ...args });
  if (!s.ok) return { started: s, done: null };
  const token = new URL('http://x' + s.url).searchParams.get('token') ?? '';
  const up = { db: w.made.app.db, store: w.made.store, now: w.made.app.now, actor: who.id, newId: randomUUID, audit: w.made.app.audit };
  const written = await acceptClientBytes(up, { doc_id: s.doc_id, token, bytes: new Uint8Array(pdfOf([lines], { compress: true })) });
  assert.equal(written.ok, true, 'the bytes were accepted');
  const job = issuedJob(w.made.app.db, s.doc_id);
  assert.ok(job, 'the issued job is read back from the handler’s own step-1 row');
  const done = await finishUpload(up, job, written.ok ? written.written_at : T0);
  return { started: s, done };
}

function ok<X extends { ok: boolean }>(r: X): Extract<X, { ok: true }> {
  assert.equal(r.ok, true, `expected success: ${JSON.stringify(r)}`);
  return r as Extract<X, { ok: true }>;
}

function refused(r: { ok: boolean } & ({ ok: true } | { ok: false; why: string })): string {
  assert.equal(r.ok, false, 'expected a refusal');
  return r.ok ? '' : r.why;
}

/** A document of a type NO UPLOAD CAN CREATE — the fee invoice, the letter — written as its row would be. */
function insertDocument(w: World, business: string, type_code: string): string {
  const db = w.made.app.db;
  const lid = randomUUID();
  const seq = (db.get<{ m: number | null }>('SELECT MAX(seq) AS m FROM logical_documents WHERE business_id = ? AND type_code = ?', [business, type_code])?.m ?? 0) + 1;
  const admin = w.staff('ADMIN').id;
  db.run('INSERT INTO logical_documents (id, business_id, type_code, seq, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?)', [lid, business, type_code, seq, admin, T0]);
  db.run('INSERT INTO documents (id, business_id, uploaded_by, filename, state, created_at, logical_document_id, version_no, type_code) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [randomUUID(), business, admin, D.derivedFilename(type_code, seq, 1), 'DISCHARGED', T0, lid, 1, type_code]);
  return lid;
}

function linkByRow(w: World, lid: string, claim: string): void {
  w.made.app.db.run('INSERT INTO document_links (id, logical_document_id, claim_id, property_id, linked_by, linked_at) VALUES (?, ?, ?, NULL, ?, ?)',
    [randomUUID(), lid, claim, w.staff('ADMIN').id, T0]);
}

function plain<V>(v: V): V {
  return JSON.parse(JSON.stringify(v)) as V;
}

/* ================================================================== *
 * WHO MAY DO WHAT
 * ================================================================== */

const GRANTED: Readonly<Record<string, readonly AppRole[]>> = Object.freeze({
  'document.read_original': ['ADMIN', 'SALES', 'CLIENT'],
  'document.upload': ['ADMIN', 'SALES', 'CLIENT'],
  'document.link': ['ADMIN', 'SALES'],
  // PHASE 140: whether the client can see a file — the two roles that upload one.
  'document.show_to_client': ['ADMIN', 'SALES'],
  'document_type.read': ['ADMIN', 'SALES'],
  'document_type.write': ['ADMIN'],
  'document_request.read': ['ADMIN', 'SALES', 'CLIENT'],
  'document_request.create': ['ADMIN', 'SALES'],
  'document_request.withdraw': ['ADMIN', 'SALES'],
});

/** THE MOST FAVOURABLE OBJECT FOR EACH ROLE: claim evidence of their own organisation, on a job assigned to them. */
function favourable(action: string, role: AppRole): Obj {
  if (action === 'document.upload') return { type: 'business', id: 'biz-1' };
  if (action.startsWith('document_type.')) return { type: 'document_type', id: '__document_types__' };
  if (action.startsWith('document_request.')) return { type: 'document_request', id: 'r-1', business_id: 'biz-1' };
  // PHASE 140: shown to the client — the most favourable object says so; test/phase140.test.ts refuses the rest.
  // PHASE 153c: Sales opens a kept original only for its own clients — the most favourable object names them an owner.
  return { type: 'document', id: 'd-1', business_id: 'biz-1', readers: 'CLAIM_EVIDENCE', carries_value: false, letter_signed: true, assigned_surveyor_ids: [`u-${role}`], shown_to_client: true, owner_ids: [`u-${role}`] };
}

/** document.read, per reader class: who is admitted. Every other role is refused. */
const READS: readonly { readers: string; carries_value: boolean; letter_signed: boolean; admitted: readonly AppRole[] }[] = [
  { readers: 'CLAIM_EVIDENCE', carries_value: false, letter_signed: true, admitted: ['ADMIN', 'SALES', 'SURVEYING', 'CLIENT'] },
  { readers: 'CLAIM_TEAM', carries_value: false, letter_signed: true, admitted: ['ADMIN', 'SALES', 'CLIENT'] },
  { readers: 'CLAIM_TEAM', carries_value: true, letter_signed: true, admitted: ['ADMIN', 'SALES'] },
  { readers: 'FINANCE', carries_value: true, letter_signed: true, admitted: ['ADMIN', 'ACCOUNTING', 'CLIENT'] },
  { readers: 'ENGAGEMENT_LETTER', carries_value: true, letter_signed: false, admitted: ['ADMIN', 'SALES', 'CLIENT'] },
  { readers: 'ENGAGEMENT_LETTER', carries_value: true, letter_signed: true, admitted: ['ADMIN', 'SALES', 'ACCOUNTING', 'CLIENT'] },
];

describe('who may do what — the nine new actions, every role, and document.read per reader class', () => {
  test('each new action admits exactly the roles granted it, and REFUSES every other role — and a disabled user every one', () => {
    for (const [action, granted] of Object.entries(GRANTED)) {
      assert.ok(REGISTERED_ACTIONS.includes(action), `${action} is not registered`);
      for (const role of APP_ROLES.filter((r) => r !== 'READ_ONLY') /* Phase 132e: READ_ONLY is asserted rule by rule in test/authz.test.ts */) {
        const a = actor(role, `u-${role}`, 'biz-1');
        assert.equal(can(a, action, favourable(action, role)), granted.includes(role), `${role} on ${action}`);
      }
      assert.equal(can({ ...actor('ADMIN'), disabled: true }, action, favourable(action, 'ADMIN')), false, `disabled ADMIN on ${action}`);
    }
    assert.ok(REGISTERED_ACTIONS.includes('document.read'));
  });

  test('A REFUSAL PER ROLE PER SENSITIVITY: document.read admits each reader class’s roles, on the most favourable object, and refuses every other', () => {
    for (const r of READS) {
      for (const role of APP_ROLES.filter((r) => r !== 'READ_ONLY') /* Phase 132e: READ_ONLY is asserted rule by rule in test/authz.test.ts */) {
        const o: Obj = { type: 'document', id: 'd-1', business_id: 'biz-1', readers: r.readers, carries_value: r.carries_value, letter_signed: r.letter_signed, assigned_surveyor_ids: [`u-${role}`], shown_to_client: true };
        assert.equal(can(actor(role, `u-${role}`, 'biz-1'), 'document.read', o), r.admitted.includes(role),
          `${role} on ${r.readers}${r.carries_value ? ' (carries a value)' : ''}${r.letter_signed ? '' : ' (letter unsigned)'}: expected ${r.admitted.includes(role) ? 'allowed' : 'REFUSED'}`);
      }
    }
  });

  test('a surveyor off the job, a client of another organisation, a value-carrying document and an object without the fields are all refused', () => {
    const evidence: Obj = { type: 'document', id: 'd', business_id: 'biz-1', readers: 'CLAIM_EVIDENCE', carries_value: false, letter_signed: true, assigned_surveyor_ids: [] };
    assert.equal(can(actor('SURVEYING'), 'document.read', evidence), false, 'a surveyor read the evidence of a job not theirs');
    assert.equal(can(actor('CLIENT', 'u-c', 'biz-2'), 'document.read', evidence), false, 'a client read another organisation’s document');
    // THE LETTER'S FEE TERMS, TWICE: the table refuses this row, and can() refuses the object anyway.
    const valued: Obj = { ...evidence, carries_value: true, assigned_surveyor_ids: ['u-SURVEYING'] } as Obj;
    assert.equal(can(actor('SURVEYING'), 'document.read', valued), false, 'a surveyor read a document that can carry a value');
    const shapeless = { type: 'business', id: 'biz-1' } as unknown as Obj;
    for (const role of ['SALES', 'ACCOUNTING', 'SURVEYING', 'CLIENT'] as const) {
      assert.equal(can(actor(role, `u-${role}`, 'biz-1'), 'document.read', shapeless), false, `${role}: a predicate read a field the object does not have`);
    }
  });
});

/* ================================================================== *
 * TYPES
 * ================================================================== */

describe('document types — the CRM list, the Stage 2 list and the extraction specs; UNSET is a state', () => {
  test('the seeded list: every handler type exactly once with RET-7, and every CRM-list type with no receipt policy and an UNSET clock', async () => {
    const w = await boot();
    try {
      const types = D.typeList(w.made.app.db, w.staff('SALES'));
      const codes = types.map((t) => t.code);
      const handler = [...DOC_SPECS.map((s) => s.doc_type as string), ...(HUMAN_READ_ONLY_TYPES as readonly string[])];
      // Phase 151b: the tax return and the tax computation have receipt policies of their own (Word question 223).
      // Phase 146l: and the Land Registry official copy, read by a person (migration 056).
      assert.equal(new Set(handler).size, 14, 'the handler handles fourteen document types');
      for (const h of handler) {
        const matches = types.filter((t) => t.strip.policy === h);
        assert.equal(matches.length, 1, `exactly one type is received under the ${h} receipt policy`);
        assert.equal(matches[0]?.retention.ref, 'RET-7', `${h} carries RET-7`);
      }
      const stage2 = ['OM_MANUAL', 'GRANT_FUNDING_AGREEMENT', 'ASBESTOS_REGISTER', 'LEASE', 'CPSE_REPLIES', 'CONTRACTOR_COST_BREAKDOWN',
        'INSURANCE_REINSTATEMENT', 'FIRE_RISK_ASSESSMENT', 'SALE_CONTRACT', 'BUILDING_REGS_COMPLETION'];
      const crm = ['ENGAGEMENT_LETTER', 'COMPLETION_STATEMENT', 'VALUATION', 'ACCOUNTS', 'TAX_COMPUTATION', 'INVOICE', 'CONTRACTOR_INVOICE',
        'PLANS', 'SURVEY_PHOTOS', 'SURVEY_REPORT', 'CA_REPORT', 'CLAIM_DOCUMENTATION', 'CORRESPONDENCE', 'OTHER'];
      for (const c of [...stage2, 'PLANNING', ...crm]) assert.ok(codes.includes(c), `${c} is seeded`);
      assert.equal(types.find((t) => t.code === 'SALE_CONTRACT')?.label.includes('purchase contract'), true, 'the CRM list’s purchase contract is merged into the sale contract');
      for (const c of crm.filter((x) => x !== 'TAX_COMPUTATION')) {
        const t = types.find((x) => x.code === c);
        assert.equal(t?.strip.receivable, false, `${c} has no receipt policy`);
        assert.equal(t?.strip.label, D.NO_RECEIPT_POLICY);
        assert.equal(t?.retention.state, 'UNSET', `${c}'s clock is UNSET, not a default`);
      }
      assert.equal(RET7.approved, false, 'RET-7 is derived and not approved — if this changes, the reading below changes with it');
      assert.equal(types.find((t) => t.code === 'LEASE')?.retention.state, 'DERIVED_NOT_APPROVED');
      assert.equal(types.find((t) => t.code === 'LEASE')?.retention.computes_a_date, false);
      for (const t of types.filter((x) => x.carries_value)) assert.notEqual(t.readers.value, 'CLAIM_EVIDENCE', `${t.code} carries a value and is claim evidence`);
      assert.throws(() => D.typeList(w.made.app.db, w.staff('SURVEYING')), NotAuthorised);
      assert.throws(() => D.typeList(w.made.app.db, w.staff('ACCOUNTING')), NotAuthorised);
    } finally { w.close(); }
  });

  test('N4 — ASSERT BOTH: a clock set to UNSET and a clock never set read identically, and neither computes a date', () => {
    const never = D.retentionReading(undefined);
    assert.deepEqual(D.retentionReading(null), never);
    assert.deepEqual(D.retentionReading('RET-99'), never, 'a clock not on the list reads as no clock, never as a guess');
    assert.equal(never.state, 'UNSET');
    assert.equal(never.computes_a_date, false);
    assert.equal(never.label, D.RETENTION_UNSET);
  });

  test('ADMIN adds a type with no receipt policy: it is recorded and configurable, and nothing of it can be uploaded or requested', async () => {
    const w = await boot();
    try {
      const db = w.made.app.db;
      const admin = w.staff('ADMIN');
      assert.throws(() => D.createType(deps(w), w.staff('SALES'), { code: 'DILAPIDATIONS', label: 'Dilapidations schedule', readers: 'CLAIM_TEAM' }), NotAuthorised);
      ok(D.createType(deps(w), admin, { code: 'DILAPIDATIONS', label: 'Dilapidations schedule', readers: 'CLAIM_TEAM' }));
      const t = D.typeList(db, admin).find((x) => x.code === 'DILAPIDATIONS');
      assert.equal(t?.carries_value, true, 'fail closed: a new type carries a value unless somebody says it cannot');
      assert.equal(t?.strip.receivable, false);
      assert.equal(t?.retention.state, 'UNSET');
      const before = db.get<{ n: number }>('SELECT COUNT(*) AS n FROM documents')?.n;
      const r = await D.startDocumentUpload(deps(w), admin, { business_id: w.job.business, type_code: 'DILAPIDATIONS', logical_document_id: null, request_id: null, claim_id: null });
      assert.equal(refused(r), D.NO_RECEIPT_POLICY, 'refused BEFORE a link is issued');
      assert.equal(db.get<{ n: number }>('SELECT COUNT(*) AS n FROM documents')?.n, before, 'no row was written');
      assert.match(refused(D.createDocumentRequest(deps(w), admin, { business_id: w.job.business, claim_id: null, type_code: 'DILAPIDATIONS', why: 'x', holds_up: 'y', due_on: null })), /nothing could ever receive it/);
      assert.throws(() => db.run("UPDATE document_types SET handler_type = 'LEASE' WHERE code = 'DILAPIDATIONS'"), /only a migration binds a type to a receipt policy/);
      assert.throws(() => db.run(
        "INSERT INTO document_types (code, label, source, handler_type, readers, carries_value, active, ord, note, created_at, updated_at) VALUES ('X_TYPE','x','ADMIN','PLANNING','CLAIM_TEAM',1,1,999,'x',?,?)", [T0, T0]),
        /constraint|UNIQUE|CHECK/i, 'a type added by an administrator cannot carry a receipt policy');
      assert.match(refused(D.updateType(deps(w), admin, 'DILAPIDATIONS', { carries_value: '0' })), /never marked as not carrying one/);
      assert.throws(() => db.run("UPDATE document_types SET carries_value = 0 WHERE code = 'DILAPIDATIONS'"), /never marked as not carrying one/);
      assert.match(refused(D.updateType(deps(w), admin, 'INVOICE', { readers: 'CLAIM_EVIDENCE' })), /A surveyor would read it/);
      assert.throws(() => db.run("UPDATE document_types SET readers = 'CLAIM_EVIDENCE' WHERE code = 'INVOICE'"), /CHECK/i);
      assert.throws(() => db.run("DELETE FROM document_types WHERE code = 'DILAPIDATIONS'"), /never deleted/);
      const lines = db.all<{ kind: string; detail: string }>("SELECT kind, detail FROM audit_log WHERE kind LIKE 'DOCUMENT_TYPE_%'");
      assert.deepEqual(lines.map((l) => l.kind), ['DOCUMENT_TYPE_CREATED']);
    } finally { w.close(); }
  });
});

/* ================================================================== *
 * THE STRIP OVER EVERY TYPE
 * ================================================================== */

describe('the receipt strip still runs over every new type — and a type with no policy is never received', () => {
  test('every receivable type is uploaded through the one handler: steps 1 to 7 in order, the strip recorded, the original gone, the name derived', async () => {
    const w = await boot();
    try {
      const db = w.made.app.db;
      const receivable = D.receivableTypes(db);
      assert.equal(receivable.length, 14); // Phase 151b: the tax return and the tax computation; Phase 146l: the official copy
      for (const t of receivable) {
        const r = await upload(w, w.client, { business_id: w.client.business_id ?? '', type_code: t.code });
        const s = ok(r.started);
        assert.equal(r.done?.error, undefined, `${t.code} was refused by the handler: ${r.done?.error?.code ?? ''}`);
        assert.deepEqual(eventsFor(db, s.doc_id).map((e) => e.contract_step), [1, 2, 3, 4, 5, 6, 7], `${t.code}: every step, in the contract’s order`);
        const row = db.get<{ strip_recorded_at: string | null; quarantine_discharged_at: string | null; filename: string; version_no: number; type_code: string }>(
          'SELECT strip_recorded_at, quarantine_discharged_at, filename, version_no, type_code FROM documents WHERE id = ?', [s.doc_id]);
        assert.ok(row?.strip_recorded_at, `${t.code}: the strip is recorded`);
        assert.ok(row?.quarantine_discharged_at, `${t.code}: the discharge is recorded`);
        assert.equal(row?.type_code, t.code);
        assert.equal(row?.version_no, 1);
        assert.match(row?.filename ?? '', /^[a-z0-9-]+-\d+-version-1$/, `${t.code}: the file name is derived, never typed`);
        await assert.rejects(() => w.made.store.get(quarantineKeyFor(s.doc_id)), `${t.code}: the quarantine object is gone`);
      }
      const unreceivable = D.typeList(db, w.staff('ADMIN')).filter((t) => !t.strip.receivable);
      assert.ok(unreceivable.length >= 13); // Phase 151b: the tax computation left the unbound fourteen
      const before = db.get<{ n: number }>('SELECT COUNT(*) AS n FROM documents')?.n;
      for (const t of unreceivable) {
        const r = await D.startDocumentUpload(deps(w), w.client, { business_id: w.client.business_id ?? '', type_code: t.code, logical_document_id: null, request_id: null, claim_id: null });
        assert.equal(refused(r), D.NO_RECEIPT_POLICY, `${t.code} was given an upload link`);
      }
      assert.equal(db.get<{ n: number }>('SELECT COUNT(*) AS n FROM documents')?.n, before);
    } finally { w.close(); }
  });
});

/* ================================================================== *
 * VERSIONS
 * ================================================================== */

describe('versions — a new upload of the same document is a new version; nothing overwrites; each keeps its own clock', () => {
  test('two versions, the first untouched by the second, both on the page newest first, each with its own deletion clock', async () => {
    const w = await boot();
    try {
      const db = w.made.app.db;
      const sales = w.staff('SALES');
      const admin = w.staff('ADMIN');
      const v1 = ok((await upload(w, sales, { business_id: w.job.business, type_code: 'LEASE', claim_id: w.job.claim })).started);
      const rowOf = (id: string): unknown => plain(db.get('SELECT * FROM documents WHERE id = ?', [id]));
      const firstBefore = rowOf(v1.doc_id);

      // The type's clock changes between the two uploads: the first keeps RET-7, the second is UNSET.
      ok(D.updateType(deps(w), admin, 'LEASE', { retention_ref: '' }));
      const v2 = ok((await upload(w, w.client.business_id === w.job.business ? w.client : sales,
        { business_id: w.job.business, logical_document_id: v1.logical_document_id }, ['DEMISE AND TERM:', 'Annual rent 27500'])).started);
      assert.equal(v2.logical_document_id, v1.logical_document_id);
      assert.equal(v2.version_no, 2);
      assert.deepEqual(rowOf(v1.doc_id), firstBefore, 'THE FIRST VERSION IS BYTE FOR BYTE WHAT IT WAS');

      const p = D.documentPage(deps(w), sales, v1.logical_document_id, 'test', T0);
      assert.deepEqual(p.versions.map((v) => v.version_no), [2, 1], 'the history is visible, newest first');
      assert.equal(p.versions[1]?.clock.ref, 'RET-7', 'version 1 keeps the clock it arrived under');
      assert.deepEqual(p.versions[0]?.clock, D.retentionReading(null), 'version 2 arrived with the clock UNSET, and says so');
      assert.equal(p.versions.every((v) => v.received), true);
      ok(D.updateType(deps(w), admin, 'LEASE', { retention_ref: 'RET-7' }));

      const c = await w.signIn('sales');
      const page = await c.req(`/staff/documents/${v1.logical_document_id}`);
      assert.equal(page.status, 200);
      assert.equal(page.body.split('Read — we kept what we need').length - 1, 2, 'both versions are on the page');
      assert.match(page.body, /Version history/);

      // Refused by the store, and by the table.
      assert.match(refused(await D.startDocumentUpload(deps(w), sales, { business_id: w.job.business, type_code: 'FIRE_RISK_ASSESSMENT', logical_document_id: v1.logical_document_id, request_id: null, claim_id: null })), /same type/);
      assert.throws(() => db.run('UPDATE documents SET version_no = 5 WHERE id = ?', [v1.doc_id]), /nothing overwrites/);
      assert.throws(() => db.run("UPDATE documents SET filename = 'smith-lease-2019.pdf' WHERE id = ?", [v1.doc_id]), /nothing overwrites/);
      assert.throws(() => db.run('UPDATE documents SET retention_ref = NULL WHERE id = ?', [v1.doc_id]), /nothing overwrites/);
      assert.throws(() => db.run('DELETE FROM documents WHERE id = ?', [v1.doc_id]), /never deleted/);
      assert.throws(() => db.run('UPDATE logical_documents SET seq = 9 WHERE id = ?', [v1.logical_document_id]), /nothing about a document changes/);
      assert.throws(() => db.run('DELETE FROM logical_documents WHERE id = ?', [v1.logical_document_id]), /never deleted/);
      assert.throws(() => db.run(
        'INSERT INTO documents (id, business_id, uploaded_by, filename, state, created_at, logical_document_id, version_no, type_code) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [randomUUID(), w.job.business, sales.id, 'x', 'ISSUED', T0, v1.logical_document_id, 5, 'LEASE']), /next number/, 'a version cannot skip a number');
    } finally { w.close(); }
  });
});

/* ================================================================== *
 * LINKS
 * ================================================================== */

describe('links — a document belongs to its organisation and to any number of its claims and properties', () => {
  test('one lease serves two claims; a claim of another organisation is refused by the store and the table; a link is ended, never deleted; no person column', async () => {
    const w = await boot();
    try {
      const db = w.made.app.db;
      const sales = w.staff('SALES');
      const property = db.get<{ id: string }>('SELECT id FROM properties WHERE business_id = ? LIMIT 1', [w.job.business]);
      assert.ok(property);
      const second = C.insertClaim(db, w.made.app.now, randomUUID, {
        business_id: w.job.business, property_id: property.id, assessment_id: null, workstream: 'UNKNOWN', stage: 'ENQUIRY', owner_id: null, surveyor_id: null,
      }).id;
      const lease = ok((await upload(w, sales, { business_id: w.job.business, type_code: 'LEASE', claim_id: w.job.claim })).started).logical_document_id;
      const link = ok(D.linkDocument(deps(w), sales, lease, { claim_id: second, property_id: null }));
      for (const claim of [w.job.claim, second]) {
        assert.deepEqual(C.claimView(db, sales, claim).documents.documents.map((x) => x.id), [lease], 'the lease is on both claims');
      }
      assert.match(refused(D.linkDocument(deps(w), sales, lease, { claim_id: w.clientClaim, property_id: null })), /own organisation/);
      assert.throws(() => linkByRow(w, lease, w.clientClaim), /own organisation/);
      assert.throws(() => D.linkDocument(deps(w), w.staff('SURVEYING'), lease, { claim_id: second, property_id: null }), NotAuthorised);

      ok(D.unlinkDocument(deps(w), sales, link.id));
      assert.deepEqual(C.claimView(db, sales, second).documents.documents, [], 'no longer on the second claim');
      assert.ok(db.get<{ unlinked_at: string | null }>('SELECT unlinked_at FROM document_links WHERE id = ?', [link.id])?.unlinked_at, 'the ended link is kept');
      assert.throws(() => db.run('DELETE FROM document_links WHERE id = ?', [link.id]), /never deleted/);
      assert.throws(() => db.run('UPDATE document_links SET unlinked_at = NULL, unlinked_by = NULL WHERE id = ?', [link.id]), /ended once/);
      const events = TL.timelineFor(db, sales, { kind: 'claim', id: second }).events.map((e) => e.what);
      assert.ok(events.some((e) => /Lease, and any licence for alterations 1 was linked to this claim/.test(e)));
      assert.ok(events.some((e) => /was unlinked from this claim/.test(e)));

      for (const table of ['document_types', 'logical_documents', 'document_links']) {
        const cols = db.all<{ name: string }>('SELECT name FROM pragma_table_info(?)', [table]).map((r) => r.name);
        assert.deepEqual(cols.filter((c) => /(^|_)(name|surname|forename|person|title)($|_)/.test(c)), [], `${table} has a column that could hold a person`);
      }
    } finally { w.close(); }
  });
});

/* ================================================================== *
 * REQUESTS
 * ================================================================== */

describe('requests — a client question of kind DOCUMENT, RECEIVED by an upload and never by a click', () => {
  test('a request is refused every click — the portal, "answer here", a hand-written row — and received by an upload of its type only', async () => {
    const w = await boot();
    try {
      const db = w.made.app.db;
      const sales = w.staff('SALES');
      const business = w.client.business_id ?? '';
      const r = ok(D.createDocumentRequest(deps(w), sales, { business_id: business, claim_id: w.clientClaim, type_code: 'LEASE', why: 'It decides who owns the fixtures', holds_up: 'the survey', due_on: '2026-12-31' }));
      const state = (): string => D.requestState(db.get<{ state: string }>('SELECT state FROM client_tasks WHERE id = ?', [r.id])?.state ?? '');
      assert.equal(state(), 'REQUESTED');

      assert.equal(PO.answerTask(db, w.client, business, { task_id: r.id, dont_know: false, answer: 'I have sent it' }, w.made.app.now).why, D.RECEIVED_ONLY_BY_UPLOAD, 'the portal refused the click');
      assert.equal(refused(E.answerTaskHere(deps(w), sales, business, { task_id: r.id, dont_know: false, answer: 'they emailed it' })), D.RECEIVED_ONLY_BY_UPLOAD, '"answer here" refused the click');
      assert.throws(() => db.run(
        "UPDATE client_tasks SET state = 'ANSWERED', answer_state = 'ANSWERED', answer = 'sent', answered_at = ?, answered_by_role = 'STAFF' WHERE id = ?", [T0, r.id]),
        /E_RECEIVED_ONLY_BY_UPLOAD/, 'the table refused a request marked received with no upload');
      assert.equal(state(), 'REQUESTED');
      assert.equal(E.tasksFor(db, sales, business).some((t) => t.id === r.id), false, 'the business page’s questions panel does not offer it for answering');
      assert.equal(PO.tasks(db, w.client, business).some((t) => t.id === r.id), false, 'nor does the portal’s questions list');

      // An upload of ANOTHER type does not receive it.
      const other = await upload(w, w.client, { business_id: business, type_code: 'FIRE_RISK_ASSESSMENT' });
      assert.equal(other.done?.received_request, null);
      const otherDoc = ok(other.started).doc_id;
      assert.throws(() => db.run(
        "UPDATE client_tasks SET state = 'ANSWERED', answer_state = 'ANSWERED', answer = 'x', answered_at = ?, answered_by_role = 'STAFF', received_document_id = ? WHERE id = ?", [T0, otherDoc, r.id]),
        /E_RECEIVED_ONLY_BY_UPLOAD/, 'the table refused a request received by a document of another type');
      assert.equal(state(), 'REQUESTED');

      // An upload of the requested type, against it, receives it.
      const lease = await upload(w, w.client, { business_id: business, request_id: r.id });
      assert.equal(lease.done?.received_request, r.id);
      assert.equal(state(), 'RECEIVED');
      const row = db.get<{ received_document_id: string; answered_by_role: string; answer: string }>('SELECT received_document_id, answered_by_role, answer FROM client_tasks WHERE id = ?', [r.id]);
      assert.equal(row?.received_document_id, ok(lease.started).doc_id);
      assert.equal(row?.answered_by_role, 'CLIENT');
      assert.equal(row?.answer, D.RECEIVED_BY_UPLOAD);
      const audit = db.all<{ kind: string; detail: string }>("SELECT kind, detail FROM audit_log WHERE kind LIKE 'DOCUMENT_REQUEST%' ORDER BY seq");
      assert.deepEqual(audit.map((a) => a.kind), ['DOCUMENT_REQUESTED', 'DOCUMENT_REQUEST_RECEIVED']);
      assert.equal(audit.some((a) => a.detail.includes('fixtures')), false, 'what the request says it is for is not in the audit log');
      // Received, it is on the claim as received, and the version that answered it is linked to the claim it was asked on.
      const panel = C.claimView(db, sales, w.clientClaim).documents;
      assert.equal(panel.requests?.[0]?.state, 'RECEIVED');
      assert.equal(panel.documents.some((x) => x.id === ok(lease.started).logical_document_id), true);
      assert.match(refused(D.withdrawDocumentRequest(deps(w), sales, r.id)), /received by an upload/);
      assert.throws(() => db.run("UPDATE client_tasks SET state = 'WITHDRAWN', withdrawn_at = ?, withdrawn_by = ? WHERE id = ?", [T0, sales.id, r.id]), /E_RECEIVED_ONLY_BY_UPLOAD/);
    } finally { w.close(); }
  });

  test('a withdrawn request is not received by a later upload; a request for a type with no policy is refused by the store and the table', async () => {
    const w = await boot();
    try {
      const db = w.made.app.db;
      const sales = w.staff('SALES');
      const business = w.job.business;
      const r = ok(D.createDocumentRequest(deps(w), sales, { business_id: business, claim_id: w.job.claim, type_code: 'ASBESTOS_REGISTER', why: 'w', holds_up: 'h', due_on: null }));
      assert.throws(() => D.withdrawDocumentRequest(deps(w), w.staff('ACCOUNTING'), r.id), NotAuthorised);
      ok(D.withdrawDocumentRequest(deps(w), sales, r.id));
      const up = await upload(w, sales, { business_id: business, type_code: 'ASBESTOS_REGISTER' });
      assert.equal(up.done?.received_request, null, 'nothing open to receive');
      assert.equal(D.requestState(db.get<{ state: string }>('SELECT state FROM client_tasks WHERE id = ?', [r.id])?.state ?? ''), 'WITHDRAWN');
      assert.match(refused(D.createDocumentRequest(deps(w), sales, { business_id: business, claim_id: null, type_code: 'INVOICE', why: 'w', holds_up: 'h', due_on: null })), /nothing could ever receive it/);
      assert.throws(() => db.run(
        "INSERT INTO client_tasks (id, business_id, asked_by, question, why, holds_up, state, created_at, kind, requested_type) VALUES (?, ?, ?, 'q', 'w', 'h', 'OPEN', ?, 'DOCUMENT', 'INVOICE')",
        [randomUUID(), business, sales.id, T0]), /receipt policy/);
      assert.throws(() => D.createDocumentRequest(deps(w), w.staff('SURVEYING'), { business_id: business, claim_id: null, type_code: 'LEASE', why: 'w', holds_up: 'h', due_on: null }), NotAuthorised);
    } finally { w.close(); }
  });

  test('THE AUTOMATION: creating a request fires DOCUMENT_REQUESTED — with no rule nothing runs; with one, it runs and is recorded against the claim', async () => {
    const w = await boot();
    try {
      const db = w.made.app.db;
      const sales = w.staff('SALES');
      const none = ok(D.createDocumentRequest(deps(w), sales, { business_id: w.job.business, claim_id: w.job.claim, type_code: 'LEASE', why: 'w', holds_up: 'h', due_on: null }));
      assert.deepEqual(none.runs, [], 'no rule listens for it in the seed');
      assert.equal(db.get<{ n: number }>("SELECT COUNT(*) AS n FROM automation_runs WHERE trigger_event = 'DOCUMENT_REQUESTED'")?.n, 0);
      db.run(
        'INSERT INTO automation_rules (id, label, trigger_event, trigger_stage, trigger_activity, effect, task_title, task_description, task_activity_type, task_priority, ' +
          'due_in_days, assign_to, assign_role, attach_to, active, ord, source, created_at, updated_at) ' +
          "VALUES ('rule-chase-document', 'A document is requested: chase it', 'DOCUMENT_REQUESTED', NULL, NULL, 'FOLLOW_UP', 'Chase the requested document', NULL, " +
          "'DOCUMENT_REQUEST', NULL, 7, 'ROLE', 'SALES', 'SUBJECT', 1, 500, 'test', ?, ?)", [T0, T0]);
      const fired = ok(D.createDocumentRequest(deps(w), sales, { business_id: w.job.business, claim_id: w.job.claim, type_code: 'FIRE_RISK_ASSESSMENT', why: 'w', holds_up: 'h', due_on: null }));
      assert.equal(fired.runs.length, 1);
      assert.equal(fired.runs[0]?.outcome, 'RAN');
      assert.equal(fired.runs[0]?.tasks_created, 1);
      const run = db.get<{ trigger_event: string; claim_id: string | null }>("SELECT trigger_event, claim_id FROM automation_runs WHERE rule_id = 'rule-chase-document'");
      assert.equal(run?.trigger_event, 'DOCUMENT_REQUESTED');
      assert.equal(run?.claim_id, w.job.claim);
    } finally { w.close(); }
  });

  test('OVERDUE BY THE UK DATE, on the claim and the owner’s list — and N4: a request with no due date is neither overdue nor on time', async () => {
    const w = await boot();
    try {
      const db = w.made.app.db;
      const sales = w.staff('SALES');
      ok(D.createDocumentRequest(deps(w), sales, { business_id: w.job.business, claim_id: w.job.claim, type_code: 'LEASE', why: 'w', holds_up: 'h', due_on: '2026-09-10' }));
      ok(D.createDocumentRequest(deps(w), sales, { business_id: w.job.business, claim_id: w.job.claim, type_code: 'PLANNING', why: 'w', holds_up: 'h', due_on: null }));
      // 00:30 on 11 September in the UK is 23:30 on 10 September in UTC.
      const lateEvening = '2026-09-10T23:30:00.000Z';
      const panel = C.claimView(db, sales, w.job.claim, { now: lateEvening }).documents;
      const lease = panel.requests?.find((r) => r.type.code === 'LEASE');
      const planning = panel.requests?.find((r) => r.type.code === 'PLANNING');
      assert.equal(lease?.due.overdue, true, 'overdue by the UK date where the UTC date says it is due today');
      assert.equal(panel.overdue, 1);
      const mine = T.myWork(db, sales, lateEvening).document_requests_outstanding;
      assert.equal(mine.find((r) => r.type_label.startsWith('Lease'))?.due.overdue, true, 'on the owner’s list');
      for (const reading of [planning?.due, mine.find((r) => r.type_label.startsWith('Planning'))?.due]) {
        assert.equal(reading?.state, 'NO_DUE_DATE');
        assert.equal(reading?.overdue, false);
        assert.equal(reading?.label, T.NO_DUE_DATE);
      }
      assert.equal(C.claimView(db, sales, w.job.claim, { now: '2026-09-10T22:30:00.000Z' }).documents.overdue, 0, 'at 23:30 BST on the 10th it is due today, not overdue');
    } finally { w.close(); }
  });
});

/* ================================================================== *
 * OVER HTTP — THE PORTAL, THE PUT, THE LANDING PAGE, AND EVERY ROLE
 * ================================================================== */

describe('over HTTP — end to end, and every role on every sensitivity', () => {
  test('A REQUEST CLOSED BY AN UPLOAD: the client takes a link from the portal, PUTs the file, and the request is received; the link is used once', async () => {
    const w = await boot();
    try {
      const db = w.made.app.db;
      const sales = w.staff('SALES');
      const business = w.client.business_id ?? '';
      const r = ok(D.createDocumentRequest(deps(w), sales, { business_id: business, claim_id: w.clientClaim, type_code: 'LEASE', why: SCRIPT, holds_up: 'the survey', due_on: '2020-01-01' }));
      const client = await w.signIn('client');
      const portal = await client.req('/portal');
      assert.equal(portal.status, 200);
      // PHASE 140: the file goes with the form, and no page shows an upload address.
      assert.match(portal.body, /Send this file/);
      assert.equal(/PUT /.test(portal.body), false, 'the portal shows an HTTP PUT address');
      assert.equal(portal.body.includes('<script>alert(1)</script>'), false, 'a request’s text is escaped in the portal');
      assert.match(portal.body, /&lt;script&gt;/);

      const ticket = await client.post('/portal/documents', { request: r.id });
      assert.equal(ticket.status, 200);
      // PHASE 140: the older two-step route still answers a caller that posts without a file — its page is a form, with
      // no PUT address in it. The address is the form's own action; a PUT to it still works, for a caller that is not a browser.
      assert.equal(/PUT /.test(ticket.body), false, 'the ticket page shows an HTTP PUT address');
      const m = /action="(\/upload\/put\?token=[^&"]+)&(?:amp;)?doc=([A-Za-z0-9-]+)"/.exec(ticket.body);
      assert.ok(m, 'the ticket carries the one-use link');
      const put = `${m[1] ?? ''}&doc=${m[2] ?? ''}`;
      const bytes = pdfOf([['DEMISE AND TERM:', 'Annual rent 25000']], { compress: true });
      const sent = await client.req(put, { method: 'PUT', body: bytes, headers: { 'content-type': 'application/pdf' } });
      assert.equal(sent.status, 200, sent.body);
      assert.match(sent.body, /What we asked you for is now marked received/);
      assert.equal(D.requestState(db.get<{ state: string }>('SELECT state FROM client_tasks WHERE id = ?', [r.id])?.state ?? ''), 'RECEIVED');
      assert.deepEqual(eventsFor(db, m[2] ?? '').map((e) => e.contract_step), [1, 2, 3, 4, 5, 6, 7], 'the running application processed it, steps 3 to 7 included');

      const replay = await client.req(put, { method: 'PUT', body: bytes, headers: { 'content-type': 'application/pdf' } });
      assert.equal(replay.status, 409, 'a used link writes nothing');
      await assert.rejects(() => w.made.store.get(quarantineKeyFor(m[2] ?? '')), 'and nothing is back in quarantine');
      assert.match((await client.req('/portal')).body, /✓ Lease, and any licence for alterations — received/);
    } finally { w.close(); }
  });

  test('the landing page and the claim page flag an outstanding request OVERDUE; a request’s text is escaped on the claim page', async () => {
    const w = await boot();
    try {
      const sales = w.staff('SALES');
      ok(D.createDocumentRequest(deps(w), sales, { business_id: w.job.business, claim_id: w.job.claim, type_code: 'LEASE', why: SCRIPT, holds_up: SCRIPT, due_on: '2020-01-01' }));
      const c = await w.signIn('sales');
      const home = await c.req('/staff');
      assert.equal(home.status, 200);
      // PHASE 136: Home draws the late request as a red tile in "Today and overdue"; the full list is on Tasks.
      assert.match(home.body, /<li class="tile hometile late">[^]*?<span class="tileline">Document: [^<]+<\/span><span class="tileline when">\d+ days overdue \(1 Jan 2020\)<\/span>/); // Phase 133c: UK dates
      const tasks = await c.req('/staff/tasks');
      assert.match(tasks.body, /Documents you asked a client for that have not arrived/);
      const claim = await c.req(`/staff/claims/${w.job.claim}`);
      assert.equal(claim.status, 200);
      assert.match(claim.body, /1 OVERDUE/);
      assert.equal(claim.body.includes('<script>alert(1)</script>'), false, 'stored cross-site scripting on the claim page');
    } finally { w.close(); }
  });

  test('ROLES ON THE WIRE: claim evidence, the fee invoice and the letter — each role reaches exactly its own, the refusals audited, and the letter only once signed', async () => {
    const w = await boot();
    try {
      const db = w.made.app.db;
      const sales = w.staff('SALES');
      const lease = ok((await upload(w, sales, { business_id: w.job.business, type_code: 'LEASE', claim_id: w.job.claim })).started).logical_document_id;
      const invoice = insertDocument(w, w.job.business, 'INVOICE');
      const letter = insertDocument(w, w.job.business, 'ENGAGEMENT_LETTER');
      linkByRow(w, invoice, w.job.claim);
      linkByRow(w, letter, w.job.claim);
      db.run("UPDATE engagements SET letter_state = 'SENT', signed_at = NULL WHERE business_id = ?", [w.job.business]);

      const expect: Readonly<Record<string, Readonly<Record<string, number>>>> = {
        admin: { [lease]: 200, [invoice]: 200, [letter]: 200 },
        sales: { [lease]: 200, [invoice]: 403, [letter]: 200 },
        accounting: { [lease]: 403, [invoice]: 200, [letter]: 403 },
        surveying: { [lease]: 200, [invoice]: 403, [letter]: 403 },
      };
      for (const [who, docs] of Object.entries(expect)) {
        const c = await w.signIn(who);
        for (const [id, status] of Object.entries(docs)) {
          assert.equal((await c.req(`/staff/documents/${id}`)).status, status, `${who} on ${id === lease ? 'the lease' : id === invoice ? 'the fee invoice' : 'the unsigned letter'}`);
          assert.equal((await c.req(`/staff/documents/${id}/view.json`)).status, status, `${who} on the view.json`);
        }
        const types = await c.req('/staff/document-types');
        assert.equal(types.status, ['admin', 'sales'].includes(who) ? 200 : 403, `${who} on the document types`);
        const original = await c.req(`/staff/documents/${lease}/download`);
        // Word question 219 (24 Sep 2026): Sales may open a kept original too. None is kept here, so both get 410.
        assert.equal(original.status, ['admin', 'sales'].includes(who) ? 410 : 403, `${who} on the original`);
      }
      // THE LETTER, SIGNED: now Accounting reads it, and a surveyor still does not.
      db.run("UPDATE engagements SET letter_state = 'SIGNED', signed_at = ? WHERE business_id = ?", [T0, w.job.business]);
      signatureRecordFor(db, w.job.business, T0);
      assert.equal((await (await w.signIn('accounting')).req(`/staff/documents/${letter}`)).status, 200);
      assert.equal((await (await w.signIn('surveying')).req(`/staff/documents/${letter}`)).status, 403);

      // ACCOUNTING's claim view holds the invoice and the signed letter, and nothing else; a surveyor's the lease and no requests.
      const acc = C.claimView(db, w.staff('ACCOUNTING'), w.job.claim).documents;
      assert.deepEqual(acc.documents.map((x) => x.id).sort(), [invoice, letter].sort());
      assert.equal('requests' in acc, false);
      const sur = C.claimView(db, { id: w.job.surveyor, role: 'SURVEYING', business_id: null, disabled: false }, w.job.claim).documents;
      assert.deepEqual(sur.documents.map((x) => x.id), [lease]);
      assert.equal('requests' in sur, false);
      assert.equal(sur.may_request || sur.may_link || sur.may_upload, false);

      const refusedLines = db.all<{ outcome: string; actor_role: string }>("SELECT outcome, actor_role FROM audit_log WHERE kind = 'DOCUMENT_ACCESSED' AND outcome = 'REFUSED'");
      assert.ok(refusedLines.some((l) => l.actor_role === 'SURVEYING'), 'a surveyor’s refusal is recorded');
      assert.ok(refusedLines.some((l) => l.actor_role === 'ACCOUNTING'), 'an accountant’s refusal is recorded');
      const surveying = await w.signIn('surveying');
      assert.equal((await surveying.post(`/staff/claims/${w.job.claim}/document-requests`, { type_code: 'LEASE', why: 'w', holds_up: 'h' })).status, 403);
      assert.equal((await surveying.post(`/staff/claims/${w.job.claim}/documents`, { type_code: 'LEASE' })).status, 403);
      assert.equal((await surveying.post(`/staff/documents/${lease}/links`, { claim_id: w.job.claim })).status, 403);
    } finally { w.close(); }
  });
});

/* ================================================================== *
 * NOT A SECOND LOG, NOT A SECOND HANDLER
 * ================================================================== */

describe('extend, never rebuild — no event log, no second upload handler', () => {
  test('migration 013 creates exactly three tables, none of them a log; the timeline draws requests from client_tasks', async () => {
    const created = [...readFileSync(MIGRATION, 'utf8').matchAll(/CREATE TABLE (\w+)/g)].map((m) => m[1]);
    assert.deepEqual(created, ['document_types', 'logical_documents', 'document_links']);
    assert.equal(/ALTER TABLE (client_tasks|documents) RENAME|DROP TABLE/.test(readFileSync(MIGRATION, 'utf8')), false, 'extended, never rebuilt');
    const w = await boot();
    try {
      const sales = w.staff('SALES');
      ok(D.createDocumentRequest(deps(w), sales, { business_id: w.job.business, claim_id: w.job.claim, type_code: 'LEASE', why: 'w', holds_up: 'h', due_on: null }));
      const events = TL.timelineFor(w.made.app.db, sales, { kind: 'claim', id: w.job.claim }).events;
      assert.ok(events.some((e) => e.category === 'DOCUMENT' && /A document was requested from the client: Lease/.test(e.what)));
    } finally { w.close(); }
  });

  test('src/ names the upload handler through the port alone, and src/web/documents.ts calls no step of the contract itself', () => {
    const src = readFileSync(fileURLToPath(new URL('../src/web/documents.ts', import.meta.url)), 'utf8');
    assert.equal(/04-phase-work/.test(src), false);
    for (const step of ['issueUploadUrl', 'recordUploadComplete', 'processUpload', 'applyReceiptPolicy']) {
      assert.equal(new RegExp(`\\b${step}\\s*\\(`).test(src), false, `documents.ts calls ${step}`);
    }
  });
});
