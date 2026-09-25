/**
 * PHASE 151b, 25 September 2026 — FINISHING WHAT PHASE 151 DECIDED: THE SCREENS AND THE WIRING.
 *
 * One file for the back-end work this session did itself, a section per line of the phase. Every connector is tested
 * on recorded answers, INVENTED, with no key and no network; every switch is proved off as shipped. (The tax documents'
 * receipt policies, the signatory check and VAT in the no-claim test have files of their own:
 * phase151b-documents, phase151b-signatory and phase151b-vat.)
 *
 *   1 · the online identity check, wired in: a table, a button, the signed result, a PASS as evidence
 *   2 · the role editor's screens, the users page, and Accounting against Word answer 40
 *   3 · the postcode check at the address question, and "answer it myself" (Word answer 180)
 *   4 · the tax adviser's firm on the sign-off record (Word answer 169)
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac, randomBytes } from 'node:crypto';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createApp } from '../src/server.ts';
import { seed } from '../src/seed.ts';
import { NotAuthorised, type Actor } from '../src/authz.ts';
import { fixtureTransport, type Fixture } from '../src/connectors/http.ts';
import { secretsFromValues } from '../src/secrets.ts';
import { IDENTITY_CHECK, IDENTITY_SESSION_ENDPOINT, type IdentityCheckConfig } from '../src/connectors/identity-check.ts';
import {
  IDENTITY_HOOK_PATH, IDENTITY_SIGNATURE_HEADERS, identityChecks, identityPassed, passEvidenceSentence, receiveIdentityResult, sendIdentityCheck,
} from '../src/web/identity-checks.ts';
import { checkView } from '../src/web/compliance-aml.ts';
import type { Db } from '../src/db.ts';
import { builtInHolds, can, REGISTERED_ACTIONS } from '../src/authz.ts';
import { NEVER_GRANTED } from '../src/custom-roles.ts';
import { ACTION_WORDS, AREAS, offered } from '../src/web/role-editor-pages.ts';
import { gateStatus } from '../src/connectors/registers.ts';
import { newDraft, loadDraft } from '../src/web/assessment.ts';
import {
  ANSWER_MYSELF_LABEL, checkedLine, checkPropertyPostcodes, lookupsDeclined, lookupsOffered, postcodeIn, recordLookupsDeclined,
} from '../src/web/address-check.ts';
import { readFileSync } from 'node:fs';
import { randomUUID as uuid151b } from 'node:crypto';
import * as C from '../src/web/crm.ts';
import * as R from '../src/web/claim-record.ts';
import * as CF from './claim-fixtures.ts';
import { testApp } from './helpers.ts';
import { sourcesFor } from '../src/web/research.ts';
import { DECLINED_LINE } from '../src/web/address-check.ts';

/* ------------------------------------------------------------------ a running app, seeded, over HTTP */

type Res = { status: number; body: string };
function client(base: string) {
  let cookie = '';
  const req = async (path: string, init: RequestInit = {}): Promise<Res> => {
    const headers = { ...(init.headers as Record<string, string> | undefined) };
    if (cookie !== '') headers['cookie'] = cookie;
    const r = await fetch(base + path, { redirect: 'manual', ...init, headers });
    const set = r.headers.getSetCookie();
    if (set.length > 0) cookie = set.map((x) => x.split(';')[0] ?? '').join('; ');
    return { status: r.status, body: await r.text() };
  };
  return {
    get: (path: string) => req(path),
    post: (path: string, fields: Record<string, string>) =>
      req(path, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(fields).toString() }),
    raw: (path: string, body: string, headers: Record<string, string>) => req(path, { method: 'POST', headers, body }),
  };
}

async function world() {
  const made = await createApp(':memory:', { documentRoot: mkdtempSync(join(tmpdir(), 'cb-151b-')), now: () => '2026-09-25T10:00:00.000Z', sealKey: randomBytes(32) });
  await new Promise<void>((r) => made.server.listen(0, '127.0.0.1', () => r()));
  const addr = made.server.address();
  const base = `http://127.0.0.1:${typeof addr === 'object' && addr !== null ? addr.port : 0}`;
  const s = await seed(made.app.db, made.app.hasher, made.app.now);
  const db = made.app.db;
  const admin = { id: s.users.find((u) => u.role === 'ADMIN')!.id, role: 'ADMIN', business_id: null, disabled: false } as Actor;
  const sales = { id: s.users.find((u) => u.role === 'SALES')!.id, role: 'SALES', business_id: null, disabled: false } as Actor;
  const audit = (kind: string) => db.all<{ object_id: string; outcome: string; detail: string }>('SELECT object_id, outcome, detail FROM audit_log WHERE kind = ? ORDER BY seq', [kind]);
  const signIn = async (email: string) => { const c = client(base); assert.equal((await c.post('/login', { email, password: s.password })).status, 303, `${email} could not sign in`); return c; };
  return { made, app: made.app, db, admin, sales, audit, signIn, base, close: made.close };
}

/* ================================================================== *
 * 1 · THE ONLINE IDENTITY CHECK, WIRED IN
 * ================================================================== */

const KEYS = { DIDIT_API_KEY: 'test-didit-key-not-real-151b', DIDIT_WEBHOOK_SECRET: 'test-didit-secret-not-real-151b', DIDIT_WORKFLOW_ID: '11111111-2222-3333-4444-151b00000000' };
const ON: IdentityCheckConfig = Object.freeze({ ...IDENTITY_CHECK, enabled: true, named_in_privacy_notice: true, named_in_engagement_letter: true });
const SESSION = 'a1b2c3d4-0000-4000-8000-151b00000001';
const SESSION_OK: Fixture = {
  status: 201,
  body: JSON.stringify({ session_id: SESSION, session_number: 2, session_token: 'INVENTED151B', url: 'https://verify.didit.me/en/session/INVENTED151B', status: 'Not Started' }),
};
const sign = (body: string, secret = KEYS.DIDIT_WEBHOOK_SECRET) => createHmac('sha256', secret).update(body, 'utf8').digest('hex');
/* The time each signed result carries: the world's own fixed clock, 2026-09-25T10:00:00Z, in Unix seconds. */
const nowTs = () => String(Date.parse('2026-09-25T10:00:00.000Z') / 1000);
const sig = (body: string, secret?: string) => ({ raw: sign(body, secret), v2: null, timestamp: nowTs() });
/* Shaped from Didit's webhook (docs.didit.me/integration/webhooks, read 25 September 2026, Phase 151f), INVENTED, and
   deliberately carrying the person and the document number, so the test can prove neither is kept. */
const decision = (status: string, check_ref: string, session = SESSION) => JSON.stringify({
  event_id: 'e0000000-0000-4000-8000-151b00000001', webhook_type: 'status.updated', environment: 'sandbox',
  session_id: session, status, vendor_data: check_ref, created_at: 1790330700, timestamp: 1790330700,
  decision: {
    id_verifications: [{ node_id: 'n1', status: status === 'Approved' ? 'Approved' : 'Declined', document_type: 'Passport', issuing_state: 'GBR',
      first_name: 'Invented', last_name: 'Signatory', date_of_birth: '1970-01-01', document_number: 'INVENTED-DOC-151B', personal_number: 'INVENTED-ID-151B' }],
    liveness_checks: [{ node_id: 'n2', status: 'Approved' }],
    face_matches: [{ node_id: 'n3', status: 'Approved' }],
  },
});

/** An organisation and one of its contacts, from the seed. */
function aContact(db: Db) {
  const c = db.get<{ id: string; business_id: string }>('SELECT id, business_id FROM contacts ORDER BY id LIMIT 1');
  assert.ok(c, 'the seed has no contact');
  return c;
}

describe('1 · the online identity check is wired in — and off as shipped', () => {
  test('as shipped, pressing Send sends nothing, keeps no row, and says in words what is missing — without waiting on AML_IN_SCOPE', async () => {
    const w = await world();
    try {
      const t = fixtureTransport({ [`POST ${IDENTITY_SESSION_ENDPOINT}`]: SESSION_OK });
      w.app.outside = t;
      const c = aContact(w.db);
      const admin = await w.signIn('admin@example.invalid');
      const r = await admin.post('/staff/compliance/identity-checks', { business_id: c.business_id, contact_id: c.id, first_name: 'Ada', last_name: 'Invented' });
      assert.equal(r.status, 400, r.body.slice(0, 300));
      assert.match(r.body, /Not sent/);
      assert.match(r.body, /privacy notice and in the engagement letter/);
      assert.doesNotMatch(r.body, /money-laundering supervision|AML_IN_SCOPE/);
      assert.equal(t.seen.length, 0, 'a request left the server while the check was off');
      assert.equal(w.db.get<{ n: number }>('SELECT COUNT(*) AS n FROM identity_checks')?.n, 0);
      assert.equal(w.audit('IDENTITY_CHECK_NOT_SENT').length, 1);
      assert.ok(!w.audit('IDENTITY_CHECK_NOT_SENT')[0]!.detail.includes('Invented'), 'a name reached the audit log');
    } finally { w.close(); }
  });

  test('only a person who keeps the registers can send one: Sales is refused before anything happens', async () => {
    const w = await world();
    try {
      const c = aContact(w.db);
      await assert.rejects(() => sendIdentityCheck({ app: w.app, newId: () => 'x' }, w.sales,
        { business_id: c.business_id, contact_id: c.id, cdd_check_id: null, first_name: 'A', last_name: 'B' }), NotAuthorised);
      const sales = await w.signIn('sales@example.invalid');
      const r = await sales.post('/staff/compliance/identity-checks', { business_id: c.business_id, contact_id: c.id, first_name: 'A', last_name: 'B' });
      assert.equal(r.status, 403);
    } finally { w.close(); }
  });

  test('switched on for a test, from the client’s record: one row, the link, and no name in the row or the audit log', async () => {
    const w = await world();
    try {
      w.app.outside = fixtureTransport({ [`POST ${IDENTITY_SESSION_ENDPOINT}`]: SESSION_OK });
      w.app.secrets = secretsFromValues(KEYS);
      const c = aContact(w.db);
      const r = await sendIdentityCheck({ app: w.app, newId: () => 'idc-151b-1' }, w.admin,
        { business_id: c.business_id, contact_id: c.id, cdd_check_id: null, first_name: 'Ada', last_name: 'Invented' },
        { config: ON });
      assert.equal(r.ok, true, r.ok ? '' : r.why);
      const row = w.db.get<Record<string, unknown>>('SELECT * FROM identity_checks WHERE id = ?', ['idc-151b-1']);
      assert.ok(row);
      assert.equal(row['session_id'], SESSION);
      assert.equal(row['link'], 'https://verify.didit.me/en/session/INVENTED151B');
      assert.equal(row['provider'], 'DIDIT');
      assert.ok(!JSON.stringify(row).includes('Ada') && !JSON.stringify(row).includes('Invented'), 'a name was kept');
      assert.equal(w.audit('IDENTITY_CHECK_SENT').length, 1);
      assert.ok(!w.audit('IDENTITY_CHECK_SENT')[0]!.detail.includes('Ada'));
      assert.equal(identityChecks(w.db, { business_id: c.business_id })[0]?.outcome_words, 'No result yet', 'no result must never read as a pass');
    } finally { w.close(); }
  });

  test('a contact of another organisation, or a finished due diligence check, is refused in words', async () => {
    const w = await world();
    try {
      const c = aContact(w.db);
      const other = w.db.get<{ id: string }>('SELECT id FROM businesses WHERE id <> ? LIMIT 1', [c.business_id]);
      assert.ok(other);
      const r = await sendIdentityCheck({ app: w.app, newId: () => 'x' }, w.admin, { business_id: other.id, contact_id: c.id, cdd_check_id: null, first_name: 'A', last_name: 'B' });
      assert.equal(r.ok, false);
      assert.match(r.ok ? '' : r.why, /contact of this organisation/);
    } finally { w.close(); }
  });
});

describe('1 · the signed result: believed only when signed, kept as our own copy, and a PASS is evidence', () => {
  async function sent() {
    const w = await world();
    w.app.outside = fixtureTransport({ [`POST ${IDENTITY_SESSION_ENDPOINT}`]: SESSION_OK });
    w.app.secrets = secretsFromValues(KEYS);
    const c = aContact(w.db);
    // An OPEN due diligence check on the organisation, with nothing yet in "How it was verified".
    w.db.run("INSERT INTO cdd_checks (id, business_id, claim_id, claimant_type, claimant_type_note, state, created_by, created_at, updated_at) VALUES ('cdd-151b', ?, NULL, 'LIMITED_COMPANY', NULL, 'IN_PROGRESS', ?, '2026-09-25T09:00:00.000Z', '2026-09-25T09:00:00.000Z')",
      [c.business_id, w.admin.id]);
    const r = await sendIdentityCheck({ app: w.app, newId: () => 'idc-151b-2' }, w.admin,
      { business_id: c.business_id, contact_id: c.id, cdd_check_id: 'cdd-151b', first_name: 'Ada', last_name: 'Invented' }, { config: ON });
    assert.equal(r.ok, true, r.ok ? '' : r.why);
    let n = 0;
    return { ...w, c, newId: () => `res-${++n}` };
  }

  test('an approved result that is signed is kept — the decision only, never the person or the document number', async () => {
    const w = await sent();
    try {
      const body = decision('Approved', 'idc-151b-2');
      const r = receiveIdentityResult(w.app, w.newId, body, sig(body));
      assert.deepEqual(r, { status: 200, outcome: 'PASS' });
      const row = w.db.get<{ outcome: string; provider_status: string; result_json: string; body_sha256: string }>('SELECT outcome, provider_status, result_json, body_sha256 FROM identity_check_results');
      assert.ok(row);
      assert.equal(row.outcome, 'PASS');
      assert.equal(row.provider_status, 'Approved');
      assert.equal(row.body_sha256.length, 64);
      const copy = JSON.parse(row.result_json) as Record<string, unknown>;
      assert.equal(copy['document_type'], 'Passport');
      assert.equal(copy['document_country'], 'GBR');
      assert.equal(copy['liveness_status'], 'Approved');
      for (const never of ['Invented', 'Signatory', '1970-01-01', 'INVENTED-ID-151B', 'INVENTED-DOC-151B']) {
        assert.ok(!row.result_json.includes(never), `our copy kept ${never}`);
        assert.ok(!JSON.stringify(w.audit('IDENTITY_RESULT_RECEIVED')).includes(never), `the audit log kept ${never}`);
      }
    } finally { w.close(); }
  });

  test('a PASS fills an open check’s “How it was verified”, and the check no longer lists it as missing — a person still finishes it', async () => {
    const w = await sent();
    try {
      assert.ok(checkView(w.db, w.admin, 'cdd-151b').missing.includes('how it was verified'));
      const body = decision('Approved', 'idc-151b-2');
      receiveIdentityResult(w.app, w.newId, body, sig(body));
      assert.equal(identityPassed(w.db, 'cdd-151b'), true);
      const c = w.db.get<{ verification_method: string | null; state: string }>('SELECT verification_method, state FROM cdd_checks WHERE id = ?', ['cdd-151b']);
      assert.equal(c?.verification_method, passEvidenceSentence('2026-09-25'));
      assert.equal(c?.state, 'IN_PROGRESS', 'a PASS finished the check on its own');
      assert.ok(!checkView(w.db, w.admin, 'cdd-151b').missing.includes('how it was verified'));
      assert.equal(w.audit('CDD_CHECK_UPDATED').filter((a) => /IDENTITY_CHECK_PASSED/.test(a.detail)).length, 1);
    } finally { w.close(); }
  });

  test('a declined, a “try again” and an unknown status are never a pass, and never fill the evidence (N4)', async () => {
    const w = await sent();
    try {
      for (const [status, want] of [['Declined', 'FAIL'], ['Resubmitted', 'REFER'], ['something_new', 'REFER'], ['Abandoned', 'NOT_COMPLETED']] as const) {
        const body = decision(status, 'idc-151b-2');
        assert.equal(receiveIdentityResult(w.app, w.newId, body, sig(body)).outcome, want, status);
      }
      assert.equal(identityPassed(w.db, 'cdd-151b'), false);
      assert.equal(w.db.get<{ v: string | null }>('SELECT verification_method AS v FROM cdd_checks WHERE id = ?', ['cdd-151b'])?.v, null);
      assert.equal(w.db.get<{ n: number }>('SELECT COUNT(*) AS n FROM identity_check_results')?.n, 4, 'every result is kept');
    } finally { w.close(); }
  });

  test('a bad, missing or wrong-secret signature is refused, audited, and writes nothing — even on “approved”', async () => {
    const w = await sent();
    try {
      const body = decision('Approved', 'idc-151b-2');
      for (const s of [null, '', 'zz', sign(body, 'another-secret'), sign(`${body} `)]) {
        assert.deepEqual(receiveIdentityResult(w.app, w.newId, body, { raw: s, v2: null, timestamp: nowTs() }), { status: 401, outcome: null }, String(s));
      }
      assert.equal(w.db.get<{ n: number }>('SELECT COUNT(*) AS n FROM identity_check_results')?.n, 0);
      assert.equal(w.audit('IDENTITY_RESULT_REFUSED').length, 5);
      assert.equal(identityPassed(w.db, 'cdd-151b'), false);
    } finally { w.close(); }
  });

  test('a signed result for a check we never sent, or naming another check, is refused and writes nothing', async () => {
    const w = await sent();
    try {
      const stranger = decision('Approved', 'idc-151b-2', 'no-such-session');
      assert.equal(receiveIdentityResult(w.app, w.newId, stranger, sig(stranger)).status, 404);
      const crossed = decision('Approved', 'some-other-check');
      assert.equal(receiveIdentityResult(w.app, w.newId, crossed, sig(crossed)).status, 404);
      assert.equal(w.db.get<{ n: number }>('SELECT COUNT(*) AS n FROM identity_check_results')?.n, 0);
    } finally { w.close(); }
  });

  test('ON THE WIRE: the route needs no login, refuses a bad signature with 401, and accepts a good one', async () => {
    const w = await sent();
    try {
      const body = decision('Approved', 'idc-151b-2');
      const anon = client(w.base);
      const bad = await anon.raw(IDENTITY_HOOK_PATH, body, { 'content-type': 'application/json', [IDENTITY_SIGNATURE_HEADERS.raw]: sign(body, 'wrong'), [IDENTITY_SIGNATURE_HEADERS.timestamp]: nowTs() });
      assert.equal(bad.status, 401);
      assert.equal(bad.body, 'refused');
      const good = await anon.raw(IDENTITY_HOOK_PATH, body, { 'content-type': 'application/json', [IDENTITY_SIGNATURE_HEADERS.raw]: sign(body), [IDENTITY_SIGNATURE_HEADERS.timestamp]: nowTs() });
      assert.equal(good.status, 200);
      assert.equal(identityPassed(w.db, 'cdd-151b'), true);
    } finally { w.close(); }
  });

  test('the database refuses a copy that carries the person, and never lets a result change or go', async () => {
    const w = await sent();
    try {
      assert.throws(() => w.db.run("INSERT INTO identity_check_results (id, identity_check_id, outcome, provider_status, decided_at, received_at, body_sha256, result_json) VALUES ('r', 'idc-151b-2', 'PASS', 'approved', NULL, '2026-09-25', ?, ?)",
        ['0'.repeat(64), JSON.stringify({ person: { firstName: 'x' } })]), /never the person/);
      const body = decision('Approved', 'idc-151b-2');
      receiveIdentityResult(w.app, w.newId, body, sig(body));
      assert.throws(() => w.db.run("UPDATE identity_check_results SET outcome = 'FAIL'"), /never changes/);
      assert.throws(() => w.db.run('DELETE FROM identity_check_results'), /kept as evidence/);
      assert.throws(() => w.db.run('DELETE FROM identity_checks'), /kept as evidence/);
    } finally { w.close(); }
  });

  test('the screens: Admin sees the panel on the client’s page and on the check; Sales does not see it at all', async () => {
    const w = await sent();
    try {
      const admin = await w.signIn('admin@example.invalid');
      const page = await admin.get(`/staff/clients/${w.c.business_id}`);
      assert.equal(page.status, 200);
      assert.match(page.body, /Identity check/);
      assert.match(page.body, /Send an identity check/);
      assert.match(page.body, /No result yet/);
      const check = await admin.get('/staff/compliance/aml/checks/cdd-151b');
      assert.match(check.body, /Online identity check/);
      const sales = await w.signIn('sales@example.invalid');
      const theirs = await sales.get(`/staff/clients/${w.c.business_id}`);
      assert.equal(theirs.status, 200);
      assert.doesNotMatch(theirs.body, /Send an identity check/);
    } finally { w.close(); }
  });
});

/* ================================================================== *
 * 2 · THE ROLE EDITOR'S SCREENS, THE USERS PAGE, AND ACCOUNTING AGAINST WORD ANSWER 40
 * ================================================================== */

describe('2 · the role editor’s screens: every choice in words, grouped, borrowed from a built-in role', () => {
  test('every action the back office knows has words on the screen, or is the super admin’s alone — no code word reaches it', () => {
    for (const action of REGISTERED_ACTIONS) {
      assert.ok(ACTION_WORDS[action] !== undefined || NEVER_GRANTED.includes(action), `no words for ${action}`);
    }
    for (const [action, [area, label]] of Object.entries(ACTION_WORDS)) {
      assert.ok(REGISTERED_ACTIONS.includes(action), `words for ${action}, which the back office does not know`);
      assert.ok(AREAS.includes(area), `${action} is in no area`);
      assert.ok(!/[a-z]+\.[a-z_]+|_/.test(label), `a code word in “${label}”`);
    }
    const all = offered().flatMap((g) => g.items);
    for (const never of NEVER_GRANTED) assert.ok(!all.some((i) => i.action === never), `${never} is offered`);
    for (const i of all) assert.ok(i.from.length > 0 && i.from.every((r) => builtInHolds(i.action, r)), `${i.action} offered from a role that does not do it`);
  });

  test('the super admin makes a role on the screen, it is listed, offered on the users page by its name, and given to a person', async () => {
    const w = await world();
    try {
      const admin = await w.signIn('admin@example.invalid');
      assert.equal((await admin.get('/staff/admin/roles')).status, 200);
      const form = await admin.get('/staff/admin/roles/new');
      assert.equal(form.status, 200);
      assert.match(form.body, /Money/);
      assert.match(form.body, /Record a payment received, and chase one/);
      assert.match(form.body, /Like Accounting/);
      assert.doesNotMatch(form.body, /user\.create|role\.manage|Only the super admin can add people<\/span>/);
      const made = await admin.post('/staff/admin/roles', {
        name: 'Bookkeeper', 'g:backoffice.enter': 'ACCOUNTING', 'g:invoice.read': 'ACCOUNTING', 'g:invoice.record_received': 'ACCOUNTING', 'g:claim.read': '',
      });
      assert.equal(made.status, 303, made.body.slice(0, 300));
      const list = await admin.get('/staff/admin/roles');
      assert.match(list.body, /Bookkeeper/);
      assert.match(list.body, /3 things/);
      const users = await admin.get('/staff/users');
      assert.match(users.body, /value="ROLE_BOOKKEEPER"> Bookkeeper/);
      assert.match(users.body, /Make or change a role/);
      const accounting = w.db.get<{ id: string }>("SELECT id FROM users WHERE role = 'ACCOUNTING' LIMIT 1")!;
      assert.equal((await admin.post(`/staff/users/${accounting.id}/role`, { role: 'ROLE_BOOKKEEPER' })).status, 303);
      assert.equal(w.db.get<{ role: string }>('SELECT role FROM users WHERE id = ?', [accounting.id])?.role, 'ROLE_BOOKKEEPER');
      assert.match((await admin.get('/staff/users')).body, /<td>Bookkeeper<\/td>/, 'the users page shows the made role by its name');
      // A new staff user can be created straight into a made role.
      const created = await admin.post('/staff/users/create', { email: 'keeper2@example.invalid', display_name: 'Second Keeper', role: 'ROLE_BOOKKEEPER', password: 'a-long-enough-password' });
      assert.equal(created.status, 303, created.body.slice(0, 300));
    } finally { w.close(); }
  });

  test('a refusal shows roleRefusal’s own sentence, and nothing is saved', async () => {
    const w = await world();
    try {
      const admin = await w.signIn('admin@example.invalid');
      const r = await admin.post('/staff/admin/roles', {
        name: 'Surveyor who sees money', 'g:backoffice.enter': 'SURVEYING', 'g:surveyor_job.read': 'SURVEYING', 'g:estimate.read': 'ADMIN',
      });
      assert.equal(r.status, 400);
      assert.match(r.body, /A role that can survey can never see our estimate or a claim’s value\. Take away one or the other\./);
      assert.equal(w.db.get<{ n: number }>('SELECT COUNT(*) AS n FROM custom_roles')?.n, 0);
      assert.equal(w.audit('ROLE_REFUSED').length, 1);
    } finally { w.close(); }
  });

  test('change and retire on the screen; a held role cannot be retired; nobody but the super admin opens any of it', async () => {
    const w = await world();
    try {
      const admin = await w.signIn('admin@example.invalid');
      await admin.post('/staff/admin/roles', { name: 'Viewer', 'g:backoffice.enter': 'SALES', 'g:lead.read': 'SALES' });
      const page0 = await admin.get('/staff/admin/roles/ROLE_VIEWER');
      assert.equal(page0.status, 200);
      assert.match(page0.body, /name="g:lead\.read" value="SALES" checked/);
      assert.equal((await admin.post('/staff/admin/roles/ROLE_VIEWER', { 'g:backoffice.enter': 'SALES', 'g:pipeline.read': 'SALES' })).status, 303);
      assert.deepEqual(w.db.all<{ action: string }>('SELECT action FROM custom_role_grants WHERE role = ? ORDER BY action', ['ROLE_VIEWER']).map((g) => g.action), ['backoffice.enter', 'pipeline.read']);
      const salesId = w.sales.id;
      await admin.post(`/staff/users/${salesId}/role`, { role: 'ROLE_VIEWER' });
      const held = await admin.post('/staff/admin/roles/ROLE_VIEWER/retire', {});
      assert.equal(held.status, 400);
      assert.match(held.body, /One person still has this role/);
      await admin.post(`/staff/users/${salesId}/role`, { role: 'SALES' });
      assert.equal((await admin.post('/staff/admin/roles/ROLE_VIEWER/retire', {})).status, 303);
      assert.match((await admin.get('/staff/admin/roles')).body, /retired/);
      const accounting = await w.signIn('accounting@example.invalid');
      for (const path of ['/staff/admin/roles', '/staff/admin/roles/new']) assert.equal((await accounting.get(path)).status, 403, path);
      assert.equal((await accounting.post('/staff/admin/roles', { name: 'X', 'g:backoffice.enter': 'SALES' })).status, 403);
    } finally { w.close(); }
  });
});

/** The seeded claim invoice, made still owed again: its payments voided, as a person voids one recorded in error. */
function openInvoice(w: Awaited<ReturnType<typeof world>>): { id: string; business_id: string } {
  const inv = w.db.get<{ id: string; business_id: string }>("SELECT id, business_id FROM invoices WHERE claim_id IS NOT NULL AND invoice_status = 'SENT' LIMIT 1");
  assert.ok(inv, 'the seed has no sent claim invoice');
  w.db.run("UPDATE invoice_payments SET voided_at = '2026-09-25T09:00:00.000Z', voided_by = ?, void_reason = 'test: made owed again' WHERE invoice_id = ? AND voided_at IS NULL",
    [w.admin.id, inv.id]);
  return inv;
}

describe('2 · Accounting against Word answer 40: the clients area, told to raise, chases, records payment', () => {
  test('Accounting has a Clients tab — its billing view: who to chase and what is owed — and the client record stays refused', async () => {
    const w = await world();
    try {
      const acc = await w.signIn('accounting@example.invalid');
      const home = await acc.get('/staff');
      assert.match(home.body, /href="\/staff\/clients"/);
      const list = await acc.get('/staff/clients');
      assert.equal(list.status, 200, list.body.slice(0, 300));
      assert.match(list.body, /Fenmoor Nursing Homes Limited/);
      const fenmoor = { id: openInvoice(w).business_id };
      const page = await acc.get(`/staff/clients/${fenmoor.id}`);
      assert.equal(page.status, 200);
      assert.match(page.body, /Who to contact/);
      assert.match(page.body, /Record the chase/);
      assert.match(page.body, /overdue/i);
      // What the record carries and Accounting may not read: the answers, the lookups, the notes, where they came from.
      for (const never of [/What the client told us/, /Lookups/, /Internal note/i, /Came from/, /Run the research/]) assert.doesNotMatch(page.body, never);
      assert.equal((await acc.get('/staff/organisations')).status, 403);
      assert.equal(can({ id: 'a', role: 'ACCOUNTING', business_id: null, disabled: false } as Actor, 'organisation.read', { type: 'business', id: fenmoor.id }), false);
      assert.equal(can({ id: 'a', role: 'ACCOUNTING', business_id: null, disabled: false } as Actor, 'contact.read', { type: 'contact', id: 'c', business_id: fenmoor.id } as never), false);
      // Admin and Sales still see the whole record, not the billing view.
      const sales = await w.signIn('sales@example.invalid');
      assert.match((await sales.get(`/staff/clients/${fenmoor.id}`)).body, /Contacts/);
      assert.doesNotMatch((await sales.get(`/staff/clients/${fenmoor.id}`)).body, /Record the chase/);
    } finally { w.close(); }
  });

  test('Accounting records a chase: kept with the invoice, in the audit log without the note, and nothing is sent', async () => {
    const w = await world();
    try {
      const inv = openInvoice(w);
      const outboxBefore = w.db.get<{ n: number }>('SELECT COUNT(*) AS n FROM outbox')?.n ?? 0;
      const acc = await w.signIn('accounting@example.invalid');
      const r = await acc.post(`/staff/finance/${inv.id}/chase`, { chased_on: '2026-09-24', how: 'PHONE', note: 'Invented: promised by Friday' });
      assert.equal(r.status, 303, r.body.slice(0, 300));
      const row = w.db.get<{ how: string; chased_on: string }>('SELECT how, chased_on FROM invoice_chases WHERE invoice_id = ?', [inv.id]);
      assert.deepEqual({ ...row }, { how: 'PHONE', chased_on: '2026-09-24' });
      const a = w.audit('INVOICE_CHASED');
      assert.equal(a.length, 1);
      assert.ok(!a[0]!.detail.includes('Friday'), 'the note reached the audit log');
      assert.equal(w.db.get<{ n: number }>('SELECT COUNT(*) AS n FROM outbox')?.n ?? 0, outboxBefore, 'a chase sent something');
      assert.match((await acc.get(`/staff/clients/${inv.business_id}`)).body, /24 Sep 2026: A phone call/);
      // A future day, a way nobody offered, and Sales (which does not record money) are each refused.
      assert.equal((await acc.post(`/staff/finance/${inv.id}/chase`, { chased_on: '2026-10-01', how: 'PHONE' })).status, 400);
      assert.equal((await acc.post(`/staff/finance/${inv.id}/chase`, { chased_on: '2026-09-24', how: 'CARRIER_PIGEON' })).status, 400);
      assert.equal((await (await w.signIn('sales@example.invalid')).post(`/staff/finance/${inv.id}/chase`, { how: 'PHONE' })).status, 403);
      assert.throws(() => w.db.run('DELETE FROM invoice_chases'), /kept with the invoice/);
    } finally { w.close(); }
  });

  test('told when to raise the invoice (the invoice-stage task is Accounting’s), and recording payment is Accounting’s', async () => {
    const w = await world();
    try {
      const rule = w.db.get<Record<string, unknown>>("SELECT * FROM automation_rules WHERE id = 'rule-invoice-finance-task'");
      assert.ok(rule);
      assert.equal(rule['trigger_stage'], 'INVOICE');
      assert.equal(rule['effect'], 'CREATE_TASK');
      assert.equal(rule['active'], 1);
      assert.ok(Object.values(rule).includes('ACCOUNTING'), 'the invoice-stage task is not Accounting’s');
    } finally { w.close(); }
    assert.equal(can({ id: 'a', role: 'ACCOUNTING', business_id: null, disabled: false } as Actor, 'invoice.record_received', { type: 'invoice', id: 'i', business_id: 'b' }), true);
    assert.equal(can({ id: 'a', role: 'ACCOUNTING', business_id: null, disabled: false } as Actor, 'invoice.raise', { type: 'invoice', id: 'i', business_id: 'b' }), true);
  });
});

/* ================================================================== *
 * 3 · THE POSTCODE CHECK AT THE ADDRESS QUESTION, AND "ANSWER IT MYSELF" (WORD ANSWER 180)
 * ================================================================== */

const PC_ON = Object.freeze({ enabled: true, named_in_privacy_notice: true });
const GATE_OPEN = gateStatus({ precondition: { enabled: true, requires: 'test' } });
const GATE_SHUT = gateStatus({ precondition: { enabled: false, requires: 'a published privacy notice reachable from the address question' } });
const LE10: Fixture = { status: 200, body: JSON.stringify({ status: 200, result: { postcode: 'LE10 1DA', country: 'England', region: 'East Midlands', admin_district: 'Hinckley and Bosworth' } }) };

describe('3 · the postcode check runs on this server, and off it changes nothing', () => {
  test('as shipped, saving the property screen sends nothing, keeps nothing, and the screen is exactly the typed address', async () => {
    const w = await world();
    try {
      const t = fixtureTransport({ 'GET /postcodes/LE101DA': LE10 });
      w.app.outside = t;
      const draft = newDraft(w.db, w.app.now, () => 'draft-151b');
      const c = client(w.base);
      const headers = { cookie: `cb_draft=${draft.token}`, 'content-type': 'application/x-www-form-urlencoded' };
      const r = await c.raw('/assessment/Q2', new URLSearchParams({ p0_address: 'Invented House, LE10 1DA', lookups_declined: 'on' }).toString(), headers);
      assert.equal(r.status, 303);
      assert.equal(t.seen.length, 0, 'a postcode left the server while the check was off');
      const saved = loadDraft(w.db, draft.token)!;
      const p = ((saved.state as Record<string, unknown>)['properties'] as Record<string, unknown>[])[0]!;
      assert.equal(p['address'], 'Invented House, LE10 1DA', 'the typed address was changed');
      assert.equal('postcode_checked' in p, false);
      assert.equal('lookups_declined' in (saved.state as Record<string, unknown>), false, 'a choice nobody was offered was kept');
      const shown = await fetch(`${w.base}/assessment/Q2`, { headers: { cookie: `cb_draft=${draft.token}` } }).then((x) => x.text());
      assert.doesNotMatch(shown, /We found the postcode/);
      assert.doesNotMatch(shown, /answer the questions about the property myself/);
      assert.match(shown, /name="p0_address" value="Invented House, LE10 1DA"/);
    } finally { w.close(); }
  });

  test('switched on for a test: a checked postcode adds one line and nothing else; a failure, not found, Northern Ireland or no postcode keep nothing', async () => {
    const w = await world();
    try {
      w.app.outside = fixtureTransport({
        'GET /postcodes/LE101DA': LE10, 'GET /postcodes/ZZ99ZZ': { status: 404, body: '{"status":404}' }, 'GET /postcodes/SW1A2AA': { status: 503, body: '' },
      });
      const props = [
        { address: 'Invented House, le10 1da' }, { address: 'Nowhere, ZZ9 9ZZ' }, { address: 'Down, SW1A 2AA' }, { address: 'Belfast, BT1 1AA' }, { address: 'No postcode here' }, {},
      ];
      const kept = await checkPropertyPostcodes(w.app, props, false, { gate: GATE_OPEN, config: PC_ON });
      assert.deepEqual(kept[0], { postcode: 'LE10 1DA', council_area: 'Hinckley and Bosworth', region: 'East Midlands', country: 'England' });
      assert.deepEqual(kept.slice(1), [null, null, null, null, null]);
      assert.equal(checkedLine(kept[0]!), 'We found the postcode LE10 1DA: Hinckley and Bosworth, East Midlands, England.');
      // The free gate alone keeps it off — no second gate — and a client who chose to answer themselves is not checked.
      const t2 = fixtureTransport({ 'GET /postcodes/LE101DA': LE10 });
      w.app.outside = t2;
      assert.deepEqual(await checkPropertyPostcodes(w.app, [props[0]!], false, { gate: GATE_SHUT, config: PC_ON }), [null]);
      assert.deepEqual(await checkPropertyPostcodes(w.app, [props[0]!], true, { gate: GATE_OPEN, config: PC_ON }), [null]);
      assert.equal(t2.seen.length, 0);
    } finally { w.close(); }
  });

  test('the postcode is found in what the client typed, the last one, spaces and case forgiven', () => {
    assert.equal(postcodeIn('Meadowcroft House, le2 3qp'), 'LE2 3QP');
    assert.equal(postcodeIn('Unit 4, EC1A1BB London'), 'EC1A 1BB');
    assert.equal(postcodeIn('Moved from B1 1AA to M1 1AE'), 'M1 1AE');
    for (const none of ['', 'The Old Surgery', null, undefined]) assert.equal(postcodeIn(none), null);
  });

  test('the site file still makes no network call and names no postcode service', () => {
    const site = readFileSync(join(import.meta.dirname, '..', '..', '..', '..', 'Caprebate site.html'), 'utf8');
    assert.equal(/\bfetch\s*\(/.test(site), false, 'the site file calls fetch');
    assert.equal(/postcodes\.io/i.test(site), false);
    assert.equal(/XMLHttpRequest/.test(site), false);
  });
});

describe('3 · “answer it myself” (Word answer 180): offered only with the lookups, and kept when chosen', () => {
  test('off with the lookups: not offered while the free gate is shut, offered when it opens', () => {
    assert.equal(lookupsOffered(GATE_SHUT), false);
    assert.equal(lookupsOffered(GATE_OPEN), true);
    assert.equal(lookupsOffered(), false, 'the free gate is open as shipped');
    assert.match(ANSWER_MYSELF_LABEL, /answer the questions about the property myself/);
  });

  test('chosen, it is kept once with the organisation and audited; not chosen is no row, which is not a refusal', async () => {
    const w = await world();
    try {
      const b = w.db.get<{ id: string }>('SELECT id FROM businesses ORDER BY id LIMIT 1')!;
      assert.equal(lookupsDeclined(w.db, b.id), false);
      recordLookupsDeclined({ db: w.db, audit: w.app.audit, now: w.app.now }, b.id);
      recordLookupsDeclined({ db: w.db, audit: w.app.audit, now: w.app.now }, b.id);
      assert.equal(lookupsDeclined(w.db, b.id), true);
      assert.equal(w.audit('LOOKUPS_DECLINED').length, 1);
      assert.throws(() => w.db.run('DELETE FROM lookups_declined'), /kept with their file/);
    } finally { w.close(); }
  });
});

/* ================================================================== *
 * 4 · THE TAX ADVISER'S FIRM ON THE SIGN-OFF RECORD (WORD ANSWER 169)
 * ================================================================== */

describe('4 · the sign-off record keeps the adviser’s firm — not a person, and not a role in the firm’s place', () => {
  async function atSignOff() {
    const app = await testApp();
    const T0 = '2026-09-25T09:00:00.000Z';
    app.db.run("INSERT INTO users (id,email,email_canonical,display_name,role,password_hash,created_at,updated_at,business_id) VALUES ('u-SALES','s@example.invalid','s@example.invalid','Sales Person','SALES','x',?,?,NULL)", [T0, T0]);
    app.db.run("INSERT INTO users (id,email,email_canonical,display_name,role,password_hash,created_at,updated_at,business_id) VALUES ('u-SURVEYING','v@example.invalid','v@example.invalid','Surveying Person','SURVEYING','x',?,?,NULL)", [T0, T0]);
    app.db.run("INSERT INTO businesses (id,name,sector,stage,created_at) VALUES ('b-169','Firm Test Limited','dental','ASSESSMENT_SUBMITTED',?)", [T0]);
    app.db.run("INSERT INTO properties (id,business_id,label,created_at) VALUES ('p-169','b-169','Main site',?)", [T0]);
    app.db.run("INSERT INTO assessments (id,business_id,sector,submitted_at,shown_low_pence,shown_high_pence,created_at) VALUES ('a-169','b-169','dental',?,10000000,20000000,?)", [T0, T0]);
    const made = C.insertClaim(app.db, app.now, uuid151b, {
      business_id: 'b-169', property_id: 'p-169', assessment_id: 'a-169', workstream: 'PLANT_AND_MACHINERY', stage: 'TAX_ADVISER_SIGNOFF', owner_id: null, surveyor_id: null,
    });
    CF.commitmentOn(app, 'b-169', 'a-169', made.id);
    return { app, claim: made.id };
  }
  const input = (adviser: string) => ({
    adviser, credential: 'Chartered Tax Adviser', signed_on: '2026-09-01', scope: 'the whole claim', method_note: 'reviewed', figure: '2400000',
  });
  const sales = { id: 'u-SALES', role: 'SALES', business_id: null, disabled: false } as Actor;

  test('a role in the firm’s place and a person’s name are refused, in words; a firm is kept', async () => {
    const { app, claim } = await atSignOff();
    for (const bad of ['CAPREBATE_CTA', 'CLIENT_TAX_ADVISER', 'Jane Invented', '']) {
      const r = R.recordSignOff(CF.recordDeps(app), sales, claim, input(bad));
      assert.equal(r.ok, false, bad);
      assert.match(r.ok ? '' : r.why, /the adviser’s firm, as registered/, bad);
    }
    const ok = R.recordSignOff(CF.recordDeps(app), sales, claim, input('Invented Tax Advisers LLP'));
    assert.equal(ok.ok, true, ok.ok ? '' : ok.why);
    assert.equal(app.db.get<{ adviser: string }>('SELECT adviser FROM tax_adviser_signoffs WHERE claim_id = ?', [claim])?.adviser, 'Invented Tax Advisers LLP');
    assert.doesNotMatch(R.ADVISER_NAME_QUESTION, /\?$/, 'the form still asks the closed question');
  });
});

describe('3 · the research run leaves the free lookups alone for a client who chose to answer themselves', () => {
  test('declined, every free lookup reads “not looked up”, in words; absent, the gates decide as before', async () => {
    const w = await world();
    try {
      const b = w.db.get<{ id: string }>('SELECT id FROM businesses ORDER BY id LIMIT 1')!;
      const before = sourcesFor(w.db, w.admin, b.id).sources.filter((s) => s.tier === 'FREE' && s.state !== 'FIRED');
      assert.ok(before.length > 0);
      assert.ok(before.every((s) => s.detail !== DECLINED_LINE));
      recordLookupsDeclined({ db: w.db, audit: w.app.audit, now: w.app.now }, b.id);
      // A source we hold no licence for says so first — the harder blocker — and one already looked up keeps its answer.
      const after = sourcesFor(w.db, w.admin, b.id).sources.filter((s) => s.tier === 'FREE' && s.licence_gate === null && s.state !== 'FIRED' && s.state !== 'FAILED');
      assert.ok(after.length > 0);
      assert.ok(after.every((s) => s.state === 'NOT_PERMITTED_YET' && s.detail === DECLINED_LINE));
      assert.ok(sourcesFor(w.db, w.admin, b.id).sources.filter((s) => s.tier === 'PAID').every((s) => s.detail !== DECLINED_LINE), 'the choice reached the paid lookups');
    } finally { w.close(); }
  });
});
