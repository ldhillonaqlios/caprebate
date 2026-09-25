/**
 * PHASE 151, 24 September 2026 — BUILDING WHAT THE QUESTIONS DOCUMENT'S DEFINITIVE ANSWERS DECIDED.
 *
 * One file for the phase's back-end work, a section per decision. Every connector here is tested on recorded
 * answers shaped from the supplier's published documents, INVENTED, with no key and no network; every switch is
 * proved off as shipped.
 *
 *   1 · the online identity check (Veriff until Phase 151f, now Didit), built and switched off inside the anti-money-laundering check
 *   2 · roles a super admin can make, and the hard limits no role may break
 *   3 · the free postcode check at the address question (Postcodes.io), built and switched off behind the free gate
 *   4 · the smaller decisions: a leaver's photo deleted when their account is disabled
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';

import { fixtureTransport, RateLimiter, type CallDeps, type Fixture } from '../src/connectors/http.ts';
import { CALL_POLICIES } from '../src/connectors/sources.ts';
import { emptySecrets, secretsFromValues, SECRET_KEYS } from '../src/secrets.ts';
import {
  IDENTITY_CHECK, IDENTITY_CHECK_QUESTION, IDENTITY_SESSION_ENDPOINT, identityCheckMissing, readIdentityDecision,
  signatureHolds, startIdentityCheck, DIDIT_STATUS_OUTCOME, type IdentityCheckConfig,
} from '../src/connectors/identity-check.ts';
import { backendSwitchReadings } from '../src/web/case-stamp.ts';
import { testApp } from './helpers.ts';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { createApp } from '../src/server.ts';
import { seed } from '../src/seed.ts';
import { can, NotAuthorised, REGISTERED_ACTIONS, builtInHolds, type Actor } from '../src/authz.ts';
import { toQuarantineRole, isStaff } from '../src/roles.ts';
import { customRoleOf, roleRefusal, NEVER_GRANTED, SEALED_FROM_SURVEY } from '../src/custom-roles.ts';
import { makeRole, changeRole, retireRole } from '../src/web/role-editor.ts';
import { assignRole } from '../src/web/settings.ts';
import { checkPostcode, normalisePostcode, POSTCODE_CHECK, postcodeCheckMissing } from '../src/connectors/postcode-check.ts';
import { gateStatus } from '../src/connectors/registers.ts';
import { encodePng } from '../src/web/images.ts';
import { SOURCES as REGISTER_SOURCES, LICENCES, SUPPLIER_DOCS } from '../../../04-phase-work/phase3/caprebate-source-register.ts';

/* ================================================================== *
 * 1 · THE ONLINE IDENTITY CHECK
 * ================================================================== */

const KEYS = { DIDIT_API_KEY: 'test-didit-key-not-real-000', DIDIT_WEBHOOK_SECRET: 'test-didit-secret-not-real-000', DIDIT_WORKFLOW_ID: '11111111-2222-3333-4444-151f00000000' };
const ON: IdentityCheckConfig = Object.freeze({ ...IDENTITY_CHECK, enabled: true, named_in_privacy_notice: true, named_in_engagement_letter: true });
/* Shaped from docs.didit.me/sessions-api/create-session (read 25 September 2026, Phase 151f). Invented values. */
const SESSION_OK: Fixture = {
  status: 201,
  body: JSON.stringify({ session_id: 'f04bdb47-d3be-4b28-b028-a652feb060b5', session_number: 1, session_token: 'INVENTED0001', url: 'https://verify.didit.me/en/session/INVENTED0001', vendor_data: 'cdd-151', status: 'Not Started', workflow_id: '11111111-2222-3333-4444-151f00000000' }),
  headers: { 'content-type': 'application/json' },
};

async function rig(fixtures: Record<string, Fixture | readonly Fixture[]> = { [`POST ${IDENTITY_SESSION_ENDPOINT}`]: SESSION_OK }) {
  const app = await testApp();
  const t = fixtureTransport(fixtures);
  const deps: CallDeps = { audit: app.audit, now: app.now, transport: t, limiter: new RateLimiter(), sleep: async () => { /* no wait */ } };
  const calls = () => app.db.all<{ detail: string }>("SELECT detail FROM audit_log WHERE kind = 'CONNECTOR_CALLED' ORDER BY seq");
  const input = (over: Record<string, unknown> = {}) => ({
    first_name: 'Ada', last_name: 'Invented', check_ref: 'cdd-151',
    actor_id: 'u-ADMIN', actor_role: 'ADMIN', deps, secrets: secretsFromValues(KEYS), config: ON, ...over,
  });
  return { t, calls, input };
}

const sign = (body: string, secret = KEYS.DIDIT_WEBHOOK_SECRET) => createHmac('sha256', secret).update(body, 'utf8').digest('hex');
/* Didit dates each result; a fixed clock and a timestamp at it, so freshness is never the reason a test passes. */
const NOW_MS = Date.parse('2026-09-25T10:00:00.000Z');
const TS = String(NOW_MS / 1000);
const sig = (body: string, secret?: string) => ({ raw: sign(body, secret), v2: null, timestamp: TS });

describe('1 · the online identity check is built for real and switched off', () => {
  test('it ships off, the stamp reads its switch, and it quotes the open supervision question by its title', () => {
    assert.equal(IDENTITY_CHECK.enabled, false);
    assert.equal(IDENTITY_CHECK.provider, 'DIDIT');
    assert.equal(IDENTITY_CHECK_QUESTION, 'Which online identity check should clients use for the money-laundering rules: Veriff, Credas or APLYiD?');
    const s = backendSwitchReadings().find((r) => r.switch === 'IDENTITY_CHECK');
    assert.ok(s, 'the case stamp does not read the identity check switch');
    assert.equal(s.on, false);
  });

  test('as shipped it sends nothing and writes no call to the audit log — and says, in words, everything that is missing', async () => {
    const r = await rig();
    const out = await startIdentityCheck(r.input({ config: undefined, secrets: emptySecrets() }));
    assert.equal(out.state, 'NOT_SENT');
    assert.equal(r.t.seen.length, 0, 'a request was made while the check was off');
    assert.equal(r.calls().length, 0, 'an audit row of a call was written while the check was off');
    const why = out.state === 'NOT_SENT' ? out.why : '';
    for (const want of [/privacy notice and in the engagement letter/, /keys to the server/, /switch the identity check on/]) {
      assert.match(why, want);
    }
    // Word question 10 (24 Sep 2026): identity is checked whether or not money-laundering supervision applies.
    assert.doesNotMatch(why, /money-laundering/);
  });

  test('each precondition alone keeps it off: the two papers, the keys, the switch', async () => {
    const r = await rig();
    const cases: [string, Record<string, unknown>][] = [
      ['not named in the privacy notice', { config: { ...ON, named_in_privacy_notice: false } }],
      ['not named in the engagement letter', { config: { ...ON, named_in_engagement_letter: false } }],
      ['no keys', { secrets: emptySecrets() }],
      ['only the key', { secrets: secretsFromValues({ DIDIT_API_KEY: KEYS.DIDIT_API_KEY }) }],
      ['no workflow id', { secrets: secretsFromValues({ DIDIT_API_KEY: KEYS.DIDIT_API_KEY, DIDIT_WEBHOOK_SECRET: KEYS.DIDIT_WEBHOOK_SECRET }) }],
      ['the switch off', { config: { ...ON, enabled: false } }],
    ];
    for (const [what, over] of cases) {
      const out = await startIdentityCheck(r.input(over));
      assert.equal(out.state, 'NOT_SENT', what);
    }
    assert.equal(r.t.seen.length, 0);
  });

  test('switched on for a test, it sends the check we set up, our reference and the two names — nothing else — and returns the link', async () => {
    const r = await rig();
    const out = await startIdentityCheck(r.input());
    assert.equal(out.state, 'SENT');
    assert.equal(out.state === 'SENT' ? out.link : '', 'https://verify.didit.me/en/session/INVENTED0001');
    assert.equal(r.t.seen.length, 1);
    const sent = r.t.seen[0]!;
    assert.equal(new URL(sent.url).origin, 'https://verification.didit.me');
    assert.equal(sent.headers['x-api-key'], KEYS.DIDIT_API_KEY);
    const body = JSON.parse(sent.body ?? '{}') as Record<string, unknown>;
    assert.deepEqual(Object.keys(body).sort(), ['expected_details', 'language', 'vendor_data', 'workflow_id']);
    assert.equal(body['workflow_id'], KEYS.DIDIT_WORKFLOW_ID);
    assert.equal(body['vendor_data'], 'cdd-151');
    assert.deepEqual(body['expected_details'], { first_name: 'Ada', last_name: 'Invented' });
    const detail = JSON.parse(r.calls()[0]!.detail) as Record<string, unknown>;
    assert.equal(detail['service'], 'DIDIT_IDV');
    assert.ok(!JSON.stringify(detail).includes(KEYS.DIDIT_API_KEY), 'the key reached the audit log');
    assert.ok(!JSON.stringify(detail).includes('Invented'), 'a name reached the audit log');
  });

  test('a failed call, an unreadable answer and an answer with no link are each NOT_SENT, never a link', async () => {
    for (const f of [{ status: 500, body: '{}' }, { status: 201, body: 'not json' }, { status: 201, body: '{"session_id":"x"}' },
      { status: 201, body: '{"session_id":"x","url":"http://insecure.example"}' }, { status: 201, body: '{"session_id":"","url":"https://verify.didit.me/x"}' }] as Fixture[]) {
      const r = await rig({ [`POST ${IDENTITY_SESSION_ENDPOINT}`]: f });
      assert.equal((await startIdentityCheck(r.input())).state, 'NOT_SENT', f.body);
    }
  });

  test('the service is a processor in the EU on our list of places we may call, and its keys are named in the key file only', () => {
    const p = CALL_POLICIES['DIDIT_IDV'];
    assert.ok(p);
    assert.equal(p.base_url, 'https://verification.didit.me');
    assert.equal(p.region, 'EU');
    assert.equal(p.register_source, null);
    assert.deepEqual(SECRET_KEYS.filter((k) => k.owner === 'DIDIT_IDV').map((k) => k.name), ['DIDIT_API_KEY', 'DIDIT_WEBHOOK_SECRET', 'DIDIT_WORKFLOW_ID']);
    assert.deepEqual(identityCheckMissing(ON, secretsFromValues(KEYS)), []);
  });
});

describe('1 · a result is believed only when it is signed, and an unknown is never a pass (N4)', () => {
  const secrets = secretsFromValues(KEYS);
  const decision = (status: unknown) => JSON.stringify({ webhook_type: 'status.updated', session_id: 'sess-1', status, vendor_data: 'cdd-151', created_at: 1790330400, timestamp: 1790330400 });

  test('each documented status maps to its answer when signed', () => {
    for (const [status, want] of Object.entries(DIDIT_STATUS_OUTCOME)) {
      const b = decision(status);
      const d = readIdentityDecision(b, sig(b), secrets, NOW_MS);
      assert.equal(d.state, 'READ', status);
      assert.equal(d.state === 'READ' ? d.outcome : '', want, status);
    }
    const ok = decision('Approved');
    const d = readIdentityDecision(ok, sig(ok), secrets, NOW_MS);
    assert.equal(d.state === 'READ' ? d.check_ref : '', 'cdd-151');
  });

  test('an unknown status, a missing one, or a number is REFER — never PASS', () => {
    for (const status of ['Approved_maybe', 'approved', '', undefined, 9001, null]) {
      const b = decision(status);
      const d = readIdentityDecision(b, sig(b), secrets, NOW_MS);
      assert.equal(d.state, 'READ');
      assert.equal(d.state === 'READ' ? d.outcome : '', 'REFER', String(status));
    }
  });

  test('a bad, missing or wrong-secret signature is refused outright, even on an "approved" body', () => {
    const b = decision('Approved');
    for (const s of [null, '', 'zz', sign(b, 'another-secret-entirely'), sign(b + ' ')]) {
      assert.equal(readIdentityDecision(b, { raw: s, v2: null, timestamp: TS }, secrets, NOW_MS).state, 'REFUSED', String(s));
    }
    assert.equal(readIdentityDecision(b, sig(b), emptySecrets(), NOW_MS).state, 'REFUSED', 'no shared secret must not mean "anything goes"');
    assert.equal(signatureHolds(b, { raw: sign(b).toUpperCase(), v2: null, timestamp: TS }, KEYS.DIDIT_WEBHOOK_SECRET), true, 'hex case is not a difference');
  });
});

/* ================================================================== *
 * 2 · ROLES A SUPER ADMIN CAN MAKE
 * ================================================================== */

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
    postBytes: (path: string, bytes: Buffer) =>
      req(path, { method: 'POST', headers: { 'content-type': 'application/octet-stream' }, body: new Uint8Array(bytes) }),
  };
}

async function world() {
  const made = await createApp(':memory:', { documentRoot: mkdtempSync(join(tmpdir(), 'cb-151-')), now: () => '2026-09-24T10:00:00.000Z', sealKey: randomBytes(32) });
  await new Promise<void>((r) => made.server.listen(0, '127.0.0.1', () => r()));
  const addr = made.server.address();
  const base = `http://127.0.0.1:${typeof addr === 'object' && addr !== null ? addr.port : 0}`;
  const s = await seed(made.app.db, made.app.hasher, made.app.now);
  const db = made.app.db;
  const d = { db, audit: made.app.audit, now: made.app.now, hasher: made.app.hasher, newId: () => randomBytes(8).toString('hex') };
  const admin = { id: s.users.find((u) => u.role === 'ADMIN')!.id, role: 'ADMIN', business_id: null, disabled: false } as Actor;
  const sales = { id: s.users.find((u) => u.role === 'SALES')!.id, role: 'SALES', business_id: null, disabled: false } as Actor;
  const audit = (kind: string) => db.all<{ object_id: string; outcome: string; detail: string }>('SELECT object_id, outcome, detail FROM audit_log WHERE kind = ? ORDER BY seq', [kind]);
  /** A new staff user holding a made role, signed in over HTTP. */
  const person = async (role: string, email: string) => {
    db.run('INSERT INTO users (id,email,email_canonical,display_name,role,password_hash,created_at,updated_at,business_id) VALUES (?,?,?,?,?,?,?,?,NULL)',
      [`u-${email}`, email, email, 'Invented Person', 'SALES', await made.app.hasher.hash(s.password), '2026-09-24T10:00:00.000Z', '2026-09-24T10:00:00.000Z']);
    assignRole(d as never, admin, `u-${email}`, role);
    const c = client(base);
    const r = await c.post('/login', { email, password: s.password });
    assert.equal(r.status, 303, `${email} could not sign in`);
    return { id: `u-${email}`, c };
  };
  const signIn = async (email: string) => { const c = client(base); assert.equal((await c.post('/login', { email, password: s.password })).status, 303); return c; };
  return { made, db, d, admin, sales, audit, person, signIn, close: made.close };
}

const SURVEYOR_GRANTS = [
  { action: 'backoffice.enter', as_role: 'SURVEYING' }, { action: 'surveyor_job.enter', as_role: 'SURVEYING' },
  { action: 'surveyor_job.read', as_role: 'SURVEYING' }, { action: 'surveyor_job.commit', as_role: 'SURVEYING' },
];

describe('2 · roles a super admin can make — made, given, and decided on the server for each object', () => {
  test('the super admin makes a role, gives it to a person, and every step is in the audit log', async () => {
    const w = await world();
    try {
      const r = makeRole(w.d, w.admin, { name: 'Bookkeeper', grants: [
        { action: 'backoffice.enter', as_role: 'ACCOUNTING' }, { action: 'business.read', as_role: 'ACCOUNTING' },
        { action: 'invoice.read', as_role: 'ACCOUNTING' }, { action: 'invoice.record_received', as_role: 'ACCOUNTING' },
      ] });
      assert.equal(r.ok, true, r.ok ? '' : r.why);
      const key = r.ok ? r.role : '';
      assert.equal(key, 'ROLE_BOOKKEEPER');
      assert.ok(customRoleOf(key));
      assert.equal(isStaff(key as never), true);
      assert.equal(w.audit('ROLE_CREATED').length, 1);
      const p = await w.person(key, 'bookkeeper@example.invalid');
      assert.equal(w.audit('ROLE_ASSIGNED').at(-1)?.object_id, p.id);
      const who = { id: p.id, role: key, business_id: null, disabled: false } as unknown as Actor;
      assert.equal(can(who, 'invoice.read', { type: 'invoice', id: 'i', business_id: 'b' } as never), true);
      assert.equal(can(who, 'estimate.read', { type: 'estimate', id: 'e', business_id: 'b' } as never), false, 'a right it was not given');
      assert.equal(can(who, 'claim.read', { type: 'claim', id: 'c', business_id: 'b' } as never), false, 'a right it was not given');
      assert.equal(can({ ...who, disabled: true } as Actor, 'invoice.read', { type: 'invoice', id: 'i', business_id: 'b' } as never), false, 'a disabled person can do nothing');
      assert.equal((await p.c.get('/staff')).status < 400, true, 'the made role cannot open the back office');
    } finally { w.close(); }
  });

  test('a borrowed rule keeps its test on the object: a made surveyor signs off only their own job', async () => {
    const w = await world();
    try {
      const r = makeRole(w.d, w.admin, { name: 'Visiting surveyor', grants: SURVEYOR_GRANTS });
      assert.equal(r.ok, true, r.ok ? '' : r.why);
      const who = { id: 'u-made-surveyor', role: r.ok ? r.role : '', business_id: null, disabled: false } as unknown as Actor;
      const job = (surveyor_id: string | null) => ({ type: 'surveyor_job', id: 'j', business_id: 'b', surveyor_id } as never);
      assert.equal(can(who, 'surveyor_job.commit', job('u-made-surveyor')), true);
      assert.equal(can(who, 'surveyor_job.commit', job('somebody-else')), false, 'the object test was not carried with the rule');
    } finally { w.close(); }
  });

  test('only the super admin can make, change or retire a role — and a made role can never be given that power', async () => {
    const w = await world();
    try {
      assert.throws(() => makeRole(w.d, w.sales, { name: 'Sneaky', grants: [{ action: 'backoffice.enter', as_role: 'SALES' }] }), NotAuthorised);
      assert.throws(() => changeRole(w.d, w.sales, 'ROLE_ANY', { grants: [] }), NotAuthorised);
      assert.throws(() => retireRole(w.d, w.sales, 'ROLE_ANY'), NotAuthorised);
      for (const action of NEVER_GRANTED) {
        const r = makeRole(w.d, w.admin, { name: `Holds ${action}`, grants: [{ action: 'backoffice.enter', as_role: 'ADMIN' }, { action, as_role: 'ADMIN' }] });
        assert.equal(r.ok, false, action);
        assert.match(r.ok ? '' : r.why, /Only the super admin can create users, give roles or make roles/);
      }
    } finally { w.close(); }
  });
});

describe('2 · the hard limits: a role that would break one is refused with a plain sentence, and the refusal is audited', () => {
  test('a role that can survey may never see the estimate or a claim’s value — every sealed action refused', async () => {
    const w = await world();
    try {
      for (const sealed of SEALED_FROM_SURVEY) {
        const holder = (['ADMIN', 'SALES', 'ACCOUNTING'] as const).find((role) => builtInHolds(sealed, role));
        assert.ok(holder, `no built-in role holds ${sealed}`);
        const r = makeRole(w.d, w.admin, { name: `Surveyor who sees ${sealed}`, grants: [...SURVEYOR_GRANTS, { action: sealed, as_role: holder }] });
        assert.equal(r.ok, false, sealed);
        assert.equal(r.ok ? '' : r.why, 'A role that can survey can never see our estimate or a claim’s value. Take away one or the other.');
      }
      assert.equal(w.audit('ROLE_REFUSED').length, SEALED_FROM_SURVEY.length);
      assert.equal(w.db.get<{ n: number }>("SELECT COUNT(*) AS n FROM custom_roles")?.n, 0, 'a refused role was saved in part');
    } finally { w.close(); }
  });

  test('changing a made surveyor to add the estimate is refused too, and leaves the role as it was', async () => {
    const w = await world();
    try {
      const r = makeRole(w.d, w.admin, { name: 'Visiting surveyor', grants: SURVEYOR_GRANTS });
      const key = r.ok ? r.role : '';
      const c = changeRole(w.d, w.admin, key, { grants: [...SURVEYOR_GRANTS, { action: 'estimate.read', as_role: 'ADMIN' }] });
      assert.equal(c.ok, false);
      assert.deepEqual(customRoleOf(key)?.grants.map((g) => g.action).sort(), SURVEYOR_GRANTS.map((g) => g.action).sort());
      const ok = changeRole(w.d, w.admin, key, { grants: SURVEYOR_GRANTS.filter((g) => g.action !== 'surveyor_job.commit') });
      assert.equal(ok.ok, true);
      assert.equal(w.audit('ROLE_CHANGED').length, 1);
    } finally { w.close(); }
  });

  test('every other refusal is one plain sentence: no name, no rights, a client’s rule, a rule the role lacks, an unknown action, no way in', () => {
    const reg = REGISTERED_ACTIONS;
    const cases: [Parameters<typeof roleRefusal>[0], RegExp][] = [
      [{ name: '', grants: [{ action: 'backoffice.enter', as_role: 'SALES' }] }, /Give the role a name/],
      [{ name: 'Admin', grants: [{ action: 'backoffice.enter', as_role: 'SALES' }] }, /already the name of a built-in role/],
      [{ name: 'Nothing', grants: [] }, /at least one thing/],
      [{ name: 'Client view', grants: [{ action: 'backoffice.enter', as_role: 'SALES' }, { action: 'business.read', as_role: 'CLIENT' }] }, /never from a client/],
      [{ name: 'Sales survey', grants: [{ action: 'backoffice.enter', as_role: 'SALES' }, { action: 'surveyor_job.commit', as_role: 'SALES' }] }, /not something that built-in role can do/],
      [{ name: 'Made up', grants: [{ action: 'backoffice.enter', as_role: 'SALES' }, { action: 'money.print', as_role: 'ADMIN' }] }, /not something the back office does/],
      [{ name: 'Locked out', grants: [{ action: 'business.read', as_role: 'SALES' }] }, /must be able to open the back office/],
      [{ name: 'Twice', grants: [{ action: 'backoffice.enter', as_role: 'SALES' }, { action: 'backoffice.enter', as_role: 'ADMIN' }] }, /chosen once/],
    ];
    for (const [input, want] of cases) {
      const why = roleRefusal(input, reg, builtInHolds);
      assert.ok(why !== null, input.name);
      assert.match(why, want, input.name);
      assert.ok(!/[A-Z_]{4,}\./.test(why) && !/E_[A-Z]/.test(why), `not plain words: ${why}`);
    }
  });

  test('a role held by somebody cannot be retired; a retired role gives nobody anything', async () => {
    const w = await world();
    try {
      const r = makeRole(w.d, w.admin, { name: 'Bookkeeper', grants: [{ action: 'backoffice.enter', as_role: 'ACCOUNTING' }, { action: 'invoice.read', as_role: 'ACCOUNTING' }] });
      const key = r.ok ? r.role : '';
      const p = await w.person(key, 'keeper@example.invalid');
      assert.match((() => { const x = retireRole(w.d, w.admin, key); return x.ok ? '' : x.why; })(), /One person still has this role/);
      assignRole(w.d as never, w.admin, p.id, 'ACCOUNTING');
      assert.equal(retireRole(w.d, w.admin, key).ok, true);
      assert.equal(customRoleOf(key), undefined);
      const who = { id: p.id, role: key, business_id: null, disabled: false } as unknown as Actor;
      assert.equal(can(who, 'invoice.read', { type: 'invoice', id: 'i', business_id: 'b' } as never), false);
      assert.throws(() => w.db.run('DELETE FROM custom_roles'), /retired, never deleted/);
    } finally { w.close(); }
  });
});

describe('2 · payload-proof, for a role the super admin made: the surveyor never receives the estimate', () => {
  test('the quarantine treats a made role as the surveyor unless it holds the estimate itself — and an unknown role as the surveyor', async () => {
    const w = await world();
    try {
      const survey = makeRole(w.d, w.admin, { name: 'Visiting surveyor', grants: SURVEYOR_GRANTS });
      const salesish = makeRole(w.d, w.admin, { name: 'Job viewer', grants: [{ action: 'backoffice.enter', as_role: 'SALES' }, { action: 'surveyor_job.enter', as_role: 'SALES' }, { action: 'surveyor_job.read', as_role: 'SALES' }] });
      const manager = makeRole(w.d, w.admin, { name: 'Manager', grants: [{ action: 'backoffice.enter', as_role: 'ADMIN' }, { action: 'estimate.read', as_role: 'ADMIN' }] });
      assert.equal(toQuarantineRole((survey.ok ? survey.role : '') as never), 'SURVEYOR');
      assert.equal(toQuarantineRole((salesish.ok ? salesish.role : '') as never), 'SURVEYOR', 'a role without estimate.read would get the estimate through the payload');
      assert.equal(toQuarantineRole((manager.ok ? manager.role : '') as never), 'CLIENT_MANAGER');
      assert.equal(toQuarantineRole('ROLE_NOBODY_MADE_THIS' as never), 'SURVEYOR');
    } finally { w.close(); }
  });

  test('ON THE WIRE: a made surveyor’s survey payload carries no estimate key, while ADMIN’s carries it (the negative control)', async () => {
    const w = await world();
    try {
      const r = makeRole(w.d, w.admin, { name: 'Visiting surveyor', grants: SURVEYOR_GRANTS });
      const key = r.ok ? r.role : '';
      const p = await w.person(key, 'visiting@example.invalid');
      // A job NOT yet committed: after commitment the quarantine releases the estimate to the surveyor by design (N1).
      const job = w.db.get<{ id: string }>('SELECT id FROM surveyor_jobs WHERE committed_at IS NULL ORDER BY id LIMIT 1');
      assert.ok(job);
      w.db.run('UPDATE surveyor_jobs SET surveyor_id = ? WHERE id = ?', [p.id, job.id]);
      const mine = await p.c.get(`/staff/survey/${job.id}/payload.json`);
      assert.equal(mine.status, 200, mine.body.slice(0, 200));
      assert.equal('estimate' in (JSON.parse(mine.body) as object), false, 'THE MADE SURVEYOR RECEIVED THE ESTIMATE');
      // THE NEGATIVE CONTROL: the same request as ADMIN, where the estimate IS released. A check that cannot see it here
      // proves nothing above.
      const adminBody = JSON.parse((await (await w.signIn('admin@example.invalid')).get(`/staff/survey/${job.id}/payload.json`)).body) as object;
      assert.equal('estimate' in adminBody, true, 'the control could not see the estimate as ADMIN');
    } finally { w.close(); }
  });
});

/* ================================================================== *
 * 3 · THE FREE POSTCODE CHECK AT THE ADDRESS QUESTION
 * ================================================================== */

const OPEN = gateStatus({ precondition: { enabled: true, requires: 'test' } });
const SHUT = gateStatus({ precondition: { enabled: false, requires: 'a published privacy notice reachable from the address question' } });
const PC_ON = Object.freeze({ enabled: true, named_in_privacy_notice: true });
/* Shaped from a live answer on 24 Sep 2026 for the company's own registered office, cut to what we read. */
const LE10: Fixture = { status: 200, body: JSON.stringify({ status: 200, result: { postcode: 'LE10 1DA', country: 'England', region: 'East Midlands', admin_district: 'Hinckley and Bosworth', longitude: -1.369312, latitude: 52.541671 } }) };

async function pcRig(fixtures: Record<string, Fixture | readonly Fixture[]> = { 'GET /postcodes/LE101DA': LE10 }) {
  const app = await testApp();
  const t = fixtureTransport(fixtures);
  const deps: CallDeps = { audit: app.audit, now: app.now, transport: t, limiter: new RateLimiter(), sleep: async () => { /* no wait */ } };
  return { t, deps };
}

describe('3 · the free postcode check is built for real and switched off behind the free gate', () => {
  test('it ships off, the stamp reads it, and as shipped it sends nothing — with the gate shut or open', async () => {
    assert.equal(POSTCODE_CHECK.enabled, false);
    assert.equal(POSTCODE_CHECK.named_in_privacy_notice, false);
    assert.equal(backendSwitchReadings().find((r) => r.switch === 'POSTCODE_CHECK')?.on, false);
    const r = await pcRig();
    for (const gate of [SHUT, OPEN]) {
      const out = await checkPostcode({ postcode: 'LE10 1DA', gate, deps: r.deps });
      assert.equal(out.state, 'NOT_CHECKED');
    }
    assert.equal(r.t.seen.length, 0);
    assert.deepEqual(postcodeCheckMissing(POSTCODE_CHECK, SHUT), [
      'Publish the privacy notice and link it from the address question.', 'Name Postcodes.io in the privacy notice.', 'Then switch the postcode check on.']);
  });

  test('the free gate alone keeps it off, even with the switch on and the notice naming it — no second gate', async () => {
    const r = await pcRig();
    assert.equal((await checkPostcode({ postcode: 'LE10 1DA', gate: SHUT, deps: r.deps, config: PC_ON })).state, 'NOT_CHECKED');
    assert.equal(r.t.seen.length, 0);
    assert.deepEqual(postcodeCheckMissing(PC_ON, OPEN), []);
  });

  test('switched on for a test, it sends the postcode and nothing else, and fills in the council area, region and country', async () => {
    const r = await pcRig();
    const out = await checkPostcode({ postcode: ' le10  1da ', gate: OPEN, deps: r.deps, config: PC_ON });
    assert.deepEqual(out, { state: 'CHECKED', postcode: 'LE10 1DA', council_area: 'Hinckley and Bosworth', region: 'East Midlands', country: 'England' });
    assert.equal(r.t.seen.length, 1);
    const u = new URL(r.t.seen[0]!.url);
    assert.equal(u.origin + u.pathname, 'https://api.postcodes.io/postcodes/LE101DA');
    assert.equal(u.search, '');
    assert.equal(r.t.seen[0]!.body, undefined);
  });

  test('Northern Ireland, a malformed postcode, not found, and a failure are each a plain sentence — and none stops the client (N4)', async () => {
    const r = await pcRig({ 'GET /postcodes/ZZ99ZZ': { status: 404, body: '{"status":404,"error":"Postcode not found"}' }, 'GET /postcodes/SW1A2AA': { status: 503, body: '' } });
    const bt = await checkPostcode({ postcode: 'BT1 1AA', gate: OPEN, deps: r.deps, config: PC_ON });
    assert.equal(bt.state, 'NOT_CHECKED');
    assert.equal(r.t.seen.length, 0, 'a Northern Ireland postcode was sent');
    assert.equal((await checkPostcode({ postcode: 'not a postcode', gate: OPEN, deps: r.deps, config: PC_ON })).state, 'NOT_CHECKED');
    const nf = await checkPostcode({ postcode: 'ZZ9 9ZZ', gate: OPEN, deps: r.deps, config: PC_ON });
    assert.equal(nf.state, 'NOT_FOUND');
    const down = await checkPostcode({ postcode: 'SW1A 2AA', gate: OPEN, deps: r.deps, config: PC_ON });
    assert.equal(down.state, 'NOT_CHECKED', 'a failed check was read as an answer');
    for (const o of [bt, nf, down]) assert.match('why' in o ? o.why : '', /type your address in full/);
    assert.equal(normalisePostcode('ec1a1bb'), 'EC1A 1BB');
  });

  test('the source register carries it: a licence with its four attribution lines, a source on the same domain, and the pages read', () => {
    const src = REGISTER_SOURCES.find((s) => s.source_id === 'POSTCODES_IO');
    assert.ok(src);
    assert.equal(src.endpoint, 'https://api.postcodes.io');
    assert.equal(CALL_POLICIES['POSTCODES_IO']?.base_url, src.endpoint);
    const lic = LICENCES.find((l) => l.licence_id === src.licence_id);
    assert.ok(lic);
    for (const line of [/OS data/, /Royal Mail/, /Office for National Statistics/, /National Records of Scotland/]) assert.match(lic.attribution_text ?? '', line);
    assert.match(lic.notes, /Northern Ireland|BT/);
    assert.equal(SUPPLIER_DOCS.find((d) => d.source_id === 'POSTCODES_IO')?.read_on, '2026-09-24');
  });
});

/* ================================================================== *
 * 4 · THE SMALLER DECISIONS
 * ================================================================== */

describe('4 · a leaver’s photo is deleted when their account is disabled (Word answer 166)', () => {
  test('the super admin disables a person: their photo row and file go, and the audit log says so', async () => {
    const w = await world();
    try {
      const rgba = new Uint8Array(40 * 30 * 4).fill(200);
      const png = Buffer.from(encodePng({ width: 40, height: 30, rgba }));
      const sales = await w.signIn('sales@example.invalid');
      const up = await sales.postBytes('/staff/settings/photo', png);
      assert.equal(up.status, 303, 'the photo upload did not go through');
      const salesId = w.db.get<{ id: string }>("SELECT id FROM users WHERE email_canonical = 'sales@example.invalid'")!.id;
      const row = w.db.get<{ storage_key: string }>('SELECT storage_key FROM user_photos WHERE user_id = ?', [salesId]);
      assert.ok(row, 'no photo was stored to begin with');
      const admin = await w.signIn('admin@example.invalid');
      assert.equal((await admin.post(`/staff/users/${salesId}/disable`, {})).status, 303);
      assert.equal(w.db.get('SELECT user_id FROM user_photos WHERE user_id = ?', [salesId]), undefined, 'the leaver’s photo row survived');
      assert.equal(w.db.get<{ d: string | null }>('SELECT disabled_at AS d FROM users WHERE id = ?', [salesId])?.d !== null, true);
      const rows = w.audit('USER_UPDATED').filter((a) => a.object_id === salesId && /photo_deleted/.test(a.detail));
      assert.equal(rows.length, 1, 'the deletion is not in the audit log');
    } finally { w.close(); }
  });

  test('a refused disable deletes nothing: the last administrator keeps their photo', async () => {
    const w = await world();
    try {
      const rgba = new Uint8Array(40 * 30 * 4).fill(90);
      const admin = await w.signIn('admin@example.invalid');
      assert.equal((await admin.postBytes('/staff/settings/photo', Buffer.from(encodePng({ width: 40, height: 30, rgba })))).status, 303);
      // Admin cannot disable themselves; nothing is deleted when the disable is refused.
      await admin.post(`/staff/users/${w.admin.id}/disable`, {});
      assert.ok(w.db.get('SELECT user_id FROM user_photos WHERE user_id = ?', [w.admin.id]), 'a refused disable deleted the photo');
    } finally { w.close(); }
  });
});
