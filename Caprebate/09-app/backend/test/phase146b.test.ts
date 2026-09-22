/**
 * PHASE 146b, 22 September 2026 — THE CONNECTOR FOUNDATION.
 *
 * The key file outside the repository, the one way to call outside, one audit row per call, and the connector shape
 * with a switch per lookup, every one off. Every test here runs on recorded answers (`fixtureTransport`): no key, no
 * network. The Companies House answer below is shaped from its published company profile resource.
 */
import { test, describe, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, readdirSync, symlinkSync, mkdirSync, rmSync, realpathSync } from 'node:fs';
import { tmpdir, homedir } from 'node:os';
import { join } from 'node:path';
import { inspect } from 'node:util';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import {
  SECRET_KEYS, loadSecrets, secretsFromValues, emptySecrets, redactSecrets, forgetRegisteredSecretsForTest,
  parseSecretsFile, secretsPath, repositoryRoot, isInside,
} from '../src/secrets.ts';
import { callOutside, fixtureTransport, liveTransport, RateLimiter, policyRefusal, type CallDeps, type GateSnapshot } from '../src/connectors/http.ts';
import { CALL_POLICIES } from '../src/connectors/sources.ts';
import * as C from '../src/connectors/registers.ts';
import * as S from '../src/stubs/registers.ts';
import { AuditLog, AuditError } from '../src/audit.ts';
import { SOURCES as REGISTER_SOURCES } from '../../../04-phase-work/phase3/caprebate-source-register.ts';
import * as R from '../src/web/research.ts';
import * as E from '../src/web/engaged.ts';
import { panel2 } from '../src/web/engaged-pages.ts';
import { seed } from '../src/seed.ts';
import { newId } from '../src/users.ts';
import { testApp, actor } from './helpers.ts';

const BACKEND = fileURLToPath(new URL('../', import.meta.url));
const SRC = join(BACKEND, 'src');
const REPO = repositoryRoot(SRC);

const FAKE_CH_KEY = 'ch-fixture-key-0000-1111';
const FAKE_EPC_TOKEN = 'epc-fixture-token-2222-3333';
const SHUT: GateSnapshot = { free_gate_open: false, engagement_signed: false, switched_on: false };
const OPEN: GateSnapshot = { free_gate_open: true, engagement_signed: true, switched_on: true };

afterEach(() => forgetRegisteredSecretsForTest());

function outside(): string { return mkdtempSync(join(tmpdir(), 'cb146b-')); }

async function deps(transport: ReturnType<typeof fixtureTransport>, more: Partial<CallDeps> = {}) {
  const app = await testApp();
  const waits: number[] = [];
  const d: CallDeps = {
    audit: app.audit, now: app.now, transport, limiter: new RateLimiter(),
    sleep: async (ms) => { waits.push(ms); }, ...more,
  };
  const rows = () => app.db.all<{ kind: string; outcome: string; actor_id: string | null; object_id: string | null; detail: string }>(
    "SELECT kind, outcome, actor_id, object_id, detail FROM audit_log WHERE kind = 'CONNECTOR_CALLED' ORDER BY seq");
  return { app, d, waits, rows };
}

const CH_PROFILE = JSON.stringify({
  company_name: 'DUNMARROW MEDICAL PRACTICE LIMITED', company_number: '09999999', company_status: 'active',
  date_of_creation: '2014-03-01', type: 'ltd', sic_codes: ['86210'],
  registered_office_address: { address_line_1: '1 Example Street', locality: 'Nowhere Town', postal_code: 'ZZ1 1ZZ' },
});

/** A Companies House company profile connector, the shape 146c builds for real. */
const chProfile = C.defineConnector<{ company_number: string }>({
  source_id: 'CH_COMPANY', service_id: 'COMPANIES_HOUSE', owner: 'COMPANIES_HOUSE', needs: ['COMPANIES_HOUSE_API_KEY'],
  request: (q, secrets) => ({
    endpoint: '/company/{company_number}', params: { company_number: q.company_number },
    headers: { authorization: 'Basic ' + Buffer.from(`${secrets?.get('COMPANIES_HOUSE_API_KEY') ?? ''}:`).toString('base64') },
  }),
  toBundle: (body) => {
    let j: Record<string, unknown>;
    try { j = JSON.parse(body) as Record<string, unknown>; } catch { return null; }
    if (typeof j.company_number !== 'string') return null;
    const fields: Record<string, unknown> = { company_number: j.company_number, company_name: j.company_name };
    if (typeof j.company_status === 'string') fields.company_status = j.company_status;
    if (Array.isArray(j.sic_codes)) fields.sic_codes = j.sic_codes;
    if (typeof j.date_of_creation === 'string') fields.incorporation_date = j.date_of_creation;
    return { records: [{ sourceId: 'CH_COMPANY', entityId: j.company_number, fields }], facts: fields };
  },
});

/* ================================================================== *
 * 1 · THE KEY FILE
 * ================================================================== */

describe('the key file is read from outside the repository, and each key goes only to its owner', () => {
  test('a key file outside the repository is read, and a connector reads its own key and no other', () => {
    const dir = outside();
    const f = join(dir, 'keys.env');
    writeFileSync(f, `# a comment\nexport COMPANIES_HOUSE_API_KEY="${FAKE_CH_KEY}"\nEPC_API_TOKEN=${FAKE_EPC_TOKEN}\nNOT_OURS=zzz\n`, { mode: 0o600 });
    const s = loadSecrets({ env: { CAPREBATE_SECRETS: f }, repoRoot: REPO });
    assert.equal(s.state, 'LOADED');
    assert.deepEqual(s.names(), ['COMPANIES_HOUSE_API_KEY', 'EPC_API_TOKEN']);
    assert.deepEqual(s.unknown_names(), ['NOT_OURS']);
    assert.equal(s.readable_by_others, false);
    assert.equal(s.forOwner('EPC').get('EPC_API_TOKEN'), FAKE_EPC_TOKEN);
    assert.equal(s.forOwner('EPC').get('COMPANIES_HOUSE_API_KEY'), null, 'the EPC connector read Companies House’s key');
    assert.equal(s.forOwner('CQC').get('EPC_API_TOKEN'), null);
    assert.equal(s.forOwner('EPC').get('NOT_OURS'), null);
    assert.deepEqual(s.forOwner('HMLR_TITLE').missing(), ['HMLR_BG_USERNAME', 'HMLR_BG_PASSWORD', 'HMLR_BG_CERT_PATH', 'HMLR_BG_CERT_PASSPHRASE']);
    rmSync(dir, { recursive: true });
  });

  test('A KEY FILE INSIDE THE REPOSITORY IS REFUSED — directly, and through a link from outside that points in', () => {
    const repo = outside();
    mkdirSync(join(repo, '.git'));
    const inside = join(repo, 'sub', 'keys.env');
    mkdirSync(join(repo, 'sub'));
    writeFileSync(inside, `EPC_API_TOKEN=${FAKE_EPC_TOKEN}\n`);
    const direct = loadSecrets({ env: { CAPREBATE_SECRETS: inside }, repoRoot: repo });
    assert.equal(direct.state, 'REFUSED_INSIDE_REPOSITORY');
    assert.deepEqual(direct.names(), []);
    assert.equal(direct.forOwner('EPC').get('EPC_API_TOKEN'), null);
    const away = outside();
    const link = join(away, 'keys.env');
    symlinkSync(inside, link);
    assert.equal(loadSecrets({ env: { CAPREBATE_SECRETS: link }, repoRoot: repo }).state, 'REFUSED_INSIDE_REPOSITORY');
    assert.equal(repositoryRoot(join(repo, 'sub')), realpathSync(repo));
    rmSync(repo, { recursive: true }); rmSync(away, { recursive: true });
  });

  test('the default key file is ~/.caprebate-secrets.env, and it is outside this repository', () => {
    assert.equal(secretsPath({}), join(homedir(), '.caprebate-secrets.env'));
    assert.equal(isInside(secretsPath({}), REPO), false);
    assert.equal(isInside(join(REPO, 'Caprebate', 'x.env'), REPO), true);
  });

  test('no key file, and an empty one, are STATES — nothing throws, and a switched-on connector reads NOT_CONFIGURED', () => {
    const none = loadSecrets({ env: { CAPREBATE_SECRETS: join(outside(), 'absent.env') }, repoRoot: REPO });
    assert.equal(none.state, 'NO_FILE');
    const on = { CH_COMPANY: true };
    assert.deepEqual(chProfile.configured(none, on), { state: 'NOT_CONFIGURED', why: 'not set up yet: the key file has no COMPANIES_HOUSE_API_KEY' });
    assert.equal(chProfile.configured(secretsFromValues({ COMPANIES_HOUSE_API_KEY: FAKE_CH_KEY }), on).state, 'READY');
    assert.equal(chProfile.configured(secretsFromValues({ COMPANIES_HOUSE_API_KEY: FAKE_CH_KEY })).state, 'SWITCHED_OFF', 'a key alone turned a connector on');
  });

  test('the store never prints a key — as a string, as JSON, or inspected', () => {
    const s = secretsFromValues({ COMPANIES_HOUSE_API_KEY: FAKE_CH_KEY, EPC_API_TOKEN: FAKE_EPC_TOKEN });
    for (const shown of [String(s), JSON.stringify(s), inspect(s), String(s.forOwner('EPC')), JSON.stringify(s.forOwner('EPC')), inspect(s.forOwner('EPC'))]) {
      assert.equal(shown.includes(FAKE_CH_KEY) || shown.includes(FAKE_EPC_TOKEN), false, shown);
    }
    assert.match(String(s), /COMPANIES_HOUSE_API_KEY/);
  });

  test('every loaded key is removed from text, and the audit chain refuses a detail that carries one', async () => {
    secretsFromValues({ EPC_API_TOKEN: FAKE_EPC_TOKEN });
    assert.equal(redactSecrets(`Bearer ${FAKE_EPC_TOKEN} failed`), 'Bearer [key removed] failed');
    const app = await testApp();
    assert.throws(() => app.audit.append({ at: app.now(), kind: 'CONNECTOR_CALLED', outcome: 'ERROR', detail: { note: `x ${FAKE_EPC_TOKEN}` } }), AuditError);
    assert.throws(() => app.audit.append({ at: app.now(), kind: 'CONNECTOR_CALLED', outcome: 'ERROR', detail: { list: [FAKE_EPC_TOKEN] } }), AuditError);
    app.close();
  });

  test('parsing: quotes, export, comments and blank values', () => {
    const m = parseSecretsFile('A_B="x y"\n# C=1\nexport D=\'q\'\nE=\n lower=1\n');
    assert.deepEqual([...m], [['A_B', 'x y'], ['D', 'q']]);
  });

  test('secrets.example.env lists every key name, in order, and holds no value', () => {
    const text = readFileSync(join(BACKEND, 'secrets.example.env'), 'utf8');
    const lines = text.split('\n').filter((l) => /^[A-Z]/.test(l));
    assert.deepEqual(lines.map((l) => l.split('=')[0]), SECRET_KEYS.map((k) => k.name));
    for (const l of lines) assert.match(l, /^[A-Z0-9_]+=$/, `a value in the example: ${l.split('=')[0]}`);
    for (const need of ['ANTHROPIC_API_KEY', 'COMPANIES_HOUSE_API_KEY', 'CQC_SUBSCRIPTION_KEY', 'EPC_API_TOKEN', 'HOMEDATA_API_KEY',
      'HMLR_BG_USERNAME', 'IONOS_SMTP_HOST', 'IONOS_SMTP_PORT', 'IONOS_SMTP_USER', 'IONOS_SMTP_PASSWORD', 'GA4_MEASUREMENT_ID']) {
      assert.ok(lines.some((l) => l.startsWith(need + '=')), need);
    }
  });

  test('THE ALLOW-LIST CANNOT PICK UP A KEY FILE: git ignores one dropped anywhere in the tree, and keeps the example', () => {
    const rel = (p: string) => p;
    const ignored = (p: string): boolean => {
      try { execFileSync('git', ['check-ignore', '-q', rel(p)], { cwd: REPO, stdio: 'ignore' }); return true; } catch { return false; }
    };
    for (const p of ['Caprebate/09-app/backend/.caprebate-secrets.env', 'Caprebate/09-app/backend/caprebate-secrets.env',
      'Caprebate/09-app/backend/src/keys.env', 'Caprebate/03-app/secrets.json', 'Caprebate/09-app/backend/bg.p12',
      'Caprebate/09-app/engine/client.pem', 'Caprebate/09-app/.env']) {
      assert.equal(ignored(p), true, `${p} could be committed`);
    }
    assert.equal(ignored('Caprebate/09-app/backend/secrets.example.env'), false);
    assert.equal(ignored('Caprebate/09-app/backend/src/secrets.ts'), false);
  });
});

/* ================================================================== *
 * 2 · ONE WAY TO CALL OUTSIDE
 * ================================================================== */

describe('one way to call outside, and every call is written down', () => {
  test('NO FILE UNDER src/ BUT src/connectors/http.ts CALLS fetch', () => {
    const hits: string[] = [];
    for (const f of readdirSync(SRC, { recursive: true }) as string[]) {
      if (!f.endsWith('.ts')) continue;
      const text = readFileSync(join(SRC, f), 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
      // A call of the global `fetch`, not a method of that name being declared (`fetch(ctx, query) {` / `): Promise<…>;`).
      if (/(?<![\w.])fetch\s*\((?![^)]*\)\s*[:{])|globalThis\.fetch|\bundici\b|\bhttps?\.(request|get)\s*\(/.test(text)) hits.push(f);
    }
    assert.deepEqual(hits, ['connectors/http.ts']);
  });

  test('a good call: the address from the register, one audit row, the endpoint as a template, query NAMES but never values', async () => {
    const t = fixtureTransport({ 'GET /search/companies': { status: 200, body: '{"items":[]}' } });
    const { app, d, rows } = await deps(t);
    const r = await callOutside(d, {
      service_id: 'COMPANIES_HOUSE', endpoint: '/search/companies', query: { q: 'Smith Care Homes', items_per_page: '5' },
      actor_id: 'u-SALES', actor_role: 'SALES', claim_id: 'claim-1', gate: OPEN,
    });
    assert.equal(r.outcome, 'OK');
    assert.equal(r.attempts, 1);
    assert.equal(t.seen[0]?.url.startsWith('https://api.company-information.service.gov.uk/search/companies?'), true);
    const a = rows();
    assert.equal(a.length, 1, 'not exactly one audit row');
    const row = a[0]!;
    assert.deepEqual([row.outcome, row.actor_id, row.object_id], ['ALLOWED', 'u-SALES', 'claim-1']);
    const detail = JSON.parse(row.detail) as Record<string, unknown>;
    assert.deepEqual(detail.query_keys, ['items_per_page', 'q']);
    assert.equal(detail.endpoint, '/search/companies');
    assert.equal(row.detail.includes('Smith'), false, 'a searched name reached the audit chain');
    assert.deepEqual([detail.free_gate_open, detail.engagement_signed, detail.switched_on, detail.result, detail.region], [true, true, true, 'OK', 'UK']);
    assert.equal(typeof detail.latency_ms, 'number');
    app.close();
  });

  test('the path values are encoded and never recorded', async () => {
    const t = fixtureTransport({ 'GET /company/09999999': { status: 200, body: CH_PROFILE } });
    const { app, d, rows } = await deps(t);
    await callOutside(d, { service_id: 'COMPANIES_HOUSE', endpoint: '/company/{company_number}', params: { company_number: '09999999' }, actor_id: null, claim_id: null, gate: SHUT });
    assert.equal(JSON.parse(rows()[0]!.detail).endpoint, '/company/{company_number}');
    assert.equal(rows()[0]!.detail.includes('09999999'), false);
    const bad = await callOutside(d, { service_id: 'COMPANIES_HOUSE', endpoint: '/company/{company_number}', params: {}, actor_id: null, claim_id: null, gate: SHUT });
    assert.equal(bad.outcome, 'REFUSED');
    app.close();
  });

  test('RETRIES ON 429 AND 5xx ONLY — Retry-After honoured, backoff grows, a 404 is not retried', async () => {
    const t = fixtureTransport({
      'GET /a': [{ status: 429, body: '', headers: { 'retry-after': '2' } }, { status: 503, body: '' }, { status: 200, body: '{}' }],
      'GET /b': { status: 404, body: '{}' },
      'GET /c': { status: 500, body: '' },
    });
    const { app, d, waits } = await deps(t);
    const call = (endpoint: string) => callOutside(d, { service_id: 'COMPANIES_HOUSE', endpoint, actor_id: null, claim_id: null, gate: SHUT });
    const a = await call('/a');
    assert.deepEqual([a.outcome, a.attempts], ['OK', 3]);
    assert.deepEqual(waits, [2000, 1000], 'Retry-After was not honoured, or the backoff did not grow');
    const b = await call('/b');
    assert.deepEqual([b.outcome, b.status, b.attempts], ['HTTP_ERROR', 404, 1]);
    const c = await call('/c');
    assert.deepEqual([c.outcome, c.status, c.attempts], ['HTTP_ERROR', 500, CALL_POLICIES.COMPANIES_HOUSE!.max_attempts], 'retries were not bounded');
    app.close();
  });

  test('a time-out and a broken connection are reported, not retried, and nothing throws', async () => {
    const t = fixtureTransport({ 'GET /slow': { status: 200, body: '{}', delay_ms: 200 }, 'GET /gone': { status: 0, body: '', network_error: true } });
    const { app, d } = await deps(t, { policy_override: { timeout_ms: 20 } });
    const slow = await callOutside(d, { service_id: 'EPC', endpoint: '/slow', actor_id: null, claim_id: null, gate: SHUT });
    assert.deepEqual([slow.outcome, slow.attempts], ['TIMEOUT', 1]);
    const gone = await callOutside(d, { service_id: 'EPC', endpoint: '/gone', actor_id: null, claim_id: null, gate: SHUT });
    assert.deepEqual([gone.outcome, gone.attempts], ['NETWORK', 1]);
    app.close();
  });

  test('an answer larger than the cap is dropped, declared or not', async () => {
    const big = 'x'.repeat(5000);
    const t = fixtureTransport({ 'GET /big': { status: 200, body: big }, 'GET /said': { status: 200, body: big, headers: { 'content-length': '5000' } } });
    const { app, d } = await deps(t, { policy_override: { max_bytes: 1000 } });
    for (const e of ['/big', '/said']) {
      const r = await callOutside(d, { service_id: 'EPC', endpoint: e, actor_id: null, claim_id: null, gate: SHUT });
      assert.deepEqual([r.outcome, r.body], ['TOO_LARGE', null], e);
    }
    app.close();
  });

  test('COMPANIES HOUSE: 600 calls in 5 minutes, and the 601st is not made', async () => {
    let now = 1_000_000;
    const limiter = new RateLimiter(() => now);
    const p = CALL_POLICIES.COMPANIES_HOUSE!;
    assert.deepEqual([p.rate.limit, p.rate.window_ms], [600, 5 * 60 * 1000]);
    for (let i = 0; i < 600; i++) assert.equal(limiter.take('COMPANIES_HOUSE', p.rate.limit, p.rate.window_ms), true, `call ${i + 1}`);
    const t = fixtureTransport({ 'GET /x': { status: 200, body: '{}' } });
    const { app, d, rows } = await deps(t, { limiter });
    const r = await callOutside(d, { service_id: 'COMPANIES_HOUSE', endpoint: '/x', actor_id: 'u-SALES', claim_id: null, gate: SHUT });
    assert.equal(r.outcome, 'RATE_LIMITED');
    assert.equal(t.seen.length, 0, 'the call was made over the limit');
    assert.equal(rows()[0]?.outcome, 'REFUSED');
    now += p.rate.window_ms;
    assert.equal((await callOutside(d, { service_id: 'COMPANIES_HOUSE', endpoint: '/x', actor_id: null, claim_id: null, gate: SHUT })).outcome, 'OK');
    app.close();
  });

  test('refused before anything is sent: no address yet, outside the UK and EU unapproved, not in the list, and a live call from a test', async () => {
    const t = fixtureTransport({});
    const { app, d, rows } = await deps(t);
    const call = (service_id: string, dd: CallDeps = d) => callOutside(dd, { service_id, endpoint: '/x', actor_id: null, claim_id: null, gate: SHUT });
    assert.match((await call('HMLR_TITLE')).why, /address is not confirmed/);
    assert.match((await call('CLAUDE_DOCUMENTS')).why, /outside the UK and EU/);
    assert.match((await call('NOBODY')).why, /not in the list/);
    const live = await call('EPC', { ...d, transport: liveTransport, env: { NODE_TEST_CONTEXT: 'child-v8' } });
    assert.match(live.why, /tests use recorded answers/);
    assert.equal(t.seen.length, 0);
    assert.equal(rows().length, 4, 'a refused call wrote no audit row');
    assert.ok(rows().every((r) => r.outcome === 'REFUSED'));
    app.close();
  });

  test('an error that carries a key is kept with the key removed', async () => {
    secretsFromValues({ EPC_API_TOKEN: FAKE_EPC_TOKEN });
    const t = Object.assign(async () => { throw new TypeError(`bad header Bearer ${FAKE_EPC_TOKEN}`); }, { seen: [] });
    const { app, d, rows } = await deps(t);
    const r = await callOutside(d, { service_id: 'EPC', endpoint: '/x', actor_id: null, claim_id: null, gate: SHUT });
    assert.equal(r.outcome, 'NETWORK');
    assert.equal(r.why.includes(FAKE_EPC_TOKEN), false);
    assert.match(r.why, /\[key removed\]/);
    assert.equal(rows().length, 1);
    app.close();
  });

  test('every service we may call is https, in the UK or EU unless a transfer is approved, and sits on its register source’s domain', () => {
    const domain = (u: string) => new URL(u).hostname.split('.').slice(-3).join('.');
    for (const p of Object.values(CALL_POLICIES)) {
      if (p.base_url !== null) assert.equal(new URL(p.base_url).protocol, 'https:', p.service_id);
      if (p.region !== 'UK' && p.region !== 'EU') assert.notEqual(policyRefusal(p), null, `${p.service_id} can be called outside the UK and EU`);
      if (p.register_source === null || p.base_url === null) continue;
      const src = REGISTER_SOURCES.find((s) => s.source_id === p.register_source);
      assert.ok(src?.endpoint, `${p.service_id}: no register endpoint`);
      assert.equal(domain(p.base_url), domain(src.endpoint), `${p.service_id} is not on the register source’s domain`);
    }
  });
});

/* ================================================================== *
 * 3 · THE CONNECTOR SHAPE, THE SWITCHES, THE GATES
 * ================================================================== */

describe('the connector shape keeps the gates, and every switch is off', () => {
  test('the moved functions are the same functions, reached from the old path and the new', () => {
    assert.equal(S.gateStatus, C.gateStatus);
    assert.equal(S.planResearch, C.planResearch);
    assert.equal(S.REGISTER_SWITCHES, C.REGISTER_SWITCHES);
  });

  test('EVERY LOOKUP THE PANEL LISTS HAS A SWITCH, AND EVERY ONE IS OFF — an absent one and a non-true one read off', () => {
    for (const e of R.catalogue()) {
      assert.ok(Object.hasOwn(C.REGISTER_SWITCHES, e.source_id), `${e.source_id} has no switch`);
      assert.equal(C.REGISTER_SWITCHES[e.source_id], false, `${e.source_id} ships switched on`);
    }
    assert.equal(C.switchedOn('NOT_A_SOURCE'), false);
    assert.equal(C.switchedOn('EPC', { EPC: 'true' } as unknown as Record<string, boolean>), false);
    assert.throws(() => { (C.REGISTER_SWITCHES as Record<string, boolean>).EPC = true; });
  });

  const permitted = { state: 'NOT_RUN' as const, detail: 'allowed' };
  const keys = () => secretsFromValues({ COMPANIES_HOUSE_API_KEY: FAKE_CH_KEY });

  test('a shut gate sends nothing — whatever the switch and the key', async () => {
    const t = fixtureTransport({ 'GET /company/09999999': { status: 200, body: CH_PROFILE } });
    const { app, d } = await deps(t);
    const ctx = { deps: d, actor_id: 'u-SALES', claim_id: null, gate: SHUT, secrets: null };
    const run = await C.runConnector(chProfile, ctx, { company_number: '09999999' },
      { state: 'NOT_PERMITTED_YET', detail: 'free lookups wait until our privacy notice is published' }, keys(), { CH_COMPANY: true });
    assert.deepEqual([run.state, run.readiness], ['NOT_PERMITTED_YET', 'GATE_SHUT']);
    assert.equal(t.seen.length, 0);
    app.close();
  });

  test('allowed but switched off sends nothing and says "not switched on"; switched on with no key says which key', async () => {
    const t = fixtureTransport({ 'GET /company/09999999': { status: 200, body: CH_PROFILE } });
    const { app, d } = await deps(t);
    const ctx = { deps: d, actor_id: null, claim_id: null, gate: SHUT, secrets: null };
    const off = await C.runConnector(chProfile, ctx, { company_number: '09999999' }, permitted, keys());
    assert.deepEqual([off.state, off.readiness], ['NOT_RUN', 'SWITCHED_OFF']);
    assert.match(off.detail, /not switched on/);
    const nokey = await C.runConnector(chProfile, ctx, { company_number: '09999999' }, permitted, emptySecrets(), { CH_COMPANY: true });
    assert.deepEqual([nokey.state, nokey.readiness], ['NOT_RUN', 'NOT_CONFIGURED']);
    assert.match(nokey.detail, /COMPANIES_HOUSE_API_KEY/);
    assert.equal(t.seen.length, 0);
    app.close();
  });

  test('switched on, keyed and allowed: one call with its own key, a bundle that the one door accepts', async () => {
    const t = fixtureTransport({ 'GET /company/09999999': { status: 200, body: CH_PROFILE } });
    const { app, d, rows } = await deps(t);
    const run = await C.runConnector(chProfile, { deps: d, actor_id: 'u-SALES', claim_id: 'claim-1', gate: OPEN, secrets: null },
      { company_number: '09999999' }, permitted, keys(), { CH_COMPANY: true });
    assert.equal(run.state, 'FIRED');
    assert.equal(t.seen[0]?.headers.authorization, 'Basic ' + Buffer.from(FAKE_CH_KEY + ':').toString('base64'));
    assert.equal(rows().length, 1);
    assert.equal(rows()[0]!.detail.includes(FAKE_CH_KEY), false);
    const r = await seed(app.db, app.hasher, app.now);
    const rec = run.bundle?.records[0];
    assert.ok(rec);
    const id = S.ingestRegisterRecord(app.db, newId, app.now, r.businesses[0]!.id, rec);
    assert.ok(app.db.get('SELECT id FROM register_records WHERE id = ?', [id]));
    app.close();
  });

  test('N4: an answer that fails or cannot be read is FAILED with no facts — never a zero, never a guess', async () => {
    const t = fixtureTransport({ 'GET /company/1': { status: 404, body: '{"errors":[]}' }, 'GET /company/2': { status: 200, body: 'not json' } });
    const { app, d } = await deps(t);
    const ctx = { deps: d, actor_id: null, claim_id: null, gate: OPEN, secrets: null };
    for (const n of ['1', '2']) {
      const run = await C.runConnector(chProfile, ctx, { company_number: n }, permitted, keys(), { CH_COMPANY: true });
      assert.deepEqual([run.state, run.bundle], ['FAILED', null], n);
    }
    const throwing = C.defineConnector<null>({ source_id: 'EPC', service_id: 'EPC', owner: null, needs: [],
      request: () => { throw new Error('boom'); }, toBundle: () => null });
    const run = await C.runConnector(throwing, ctx, null, permitted, emptySecrets(), { EPC: true });
    assert.equal(run.state, 'FAILED');
    app.close();
  });

  test('THE RESEARCH PANEL SAYS "not switched on" beside every lookup, and that none is switched on', async () => {
    const app = await testApp();
    const r = await seed(app.db, app.hasher, app.now);
    const admin = actor('ADMIN');
    const id = r.businesses[0]!.id;
    const s = R.sourcesFor(app.db, admin, id);
    assert.ok(s.sources.length > 0);
    assert.ok(s.sources.every((x) => x.switched_on === false));
    const html = String(panel2(E.businessPage(app.db, admin, id), s));
    assert.match(html, /none is switched on yet, so no lookup is made/);
    assert.equal((html.match(/<td data-label="Switched on">not switched on<\/td>/g) ?? []).length, s.sources.length);
    app.close();
  });
});
