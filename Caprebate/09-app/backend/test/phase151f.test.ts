/**
 * PHASE 151f, 25 September 2026 — THE ONLINE IDENTITY CHECK SWITCHED FROM VERIFF TO DIDIT.
 *
 * What Didit adds beyond what test/phase151.test.ts and test/phase151b.test.ts already prove for the check (now in
 * Didit's shapes): its second signature (X-Signature-V2, the HMAC of the sorted, compact JSON), the five-minute limit
 * on a result's age, a "still under way" status that is acknowledged and NOT kept, a webhook about something else that
 * is ignored, and migration 053 — Didit as a provider, Veriff still valid, and Didit's names for a person refused in
 * our copy. Recorded answers, INVENTED, no key and no network.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac, randomBytes } from 'node:crypto';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createApp } from '../src/server.ts';
import { seed } from '../src/seed.ts';
import type { Actor } from '../src/authz.ts';
import { fixtureTransport, type Fixture } from '../src/connectors/http.ts';
import { emptySecrets, secretsFromValues, SECRET_KEYS } from '../src/secrets.ts';
import {
  canonicalJson, IDENTITY_CHECK, IDENTITY_PROVIDER_NAME, IDENTITY_SESSION_ENDPOINT, readIdentityDecision, signatureHolds,
  timestampFresh, type IdentityCheckConfig,
} from '../src/connectors/identity-check.ts';
import { identityPassed, passEvidenceSentence, receiveIdentityResult, sendIdentityCheck } from '../src/web/identity-checks.ts';

const KEYS = { DIDIT_API_KEY: 'test-didit-key-not-real-151f', DIDIT_WEBHOOK_SECRET: 'test-didit-secret-not-real-151f', DIDIT_WORKFLOW_ID: '11111111-2222-3333-4444-151f00000001' };
const ON: IdentityCheckConfig = Object.freeze({ ...IDENTITY_CHECK, enabled: true, named_in_privacy_notice: true, named_in_engagement_letter: true });
const NOW = '2026-09-25T10:00:00.000Z';
const NOW_MS = Date.parse(NOW);
const TS = String(NOW_MS / 1000);
const mac = (s: string, secret = KEYS.DIDIT_WEBHOOK_SECRET) => createHmac('sha256', secret).update(s, 'utf8').digest('hex');
const SESSION = 'a1b2c3d4-0000-4000-8000-151f00000001';
const SESSION_OK: Fixture = { status: 201, body: JSON.stringify({ session_id: SESSION, url: 'https://verify.didit.me/en/session/INVENTED151F', status: 'Not Started' }) };

/* A body written the way a proxy might re-encode it: keys out of order, spaces, and a name with non-ASCII letters. */
const reordered = (status: string, check_ref = 'idc-151f') =>
  `{ "status": "${status}", "vendor_data": "${check_ref}", "webhook_type": "status.updated", "session_id": "${SESSION}", "created_at": 1790330400,
     "metadata": { "zeta": 1, "alpha": "Zoë Ångström" } }`;

describe('151f · the connector is Didit, and still off as shipped', () => {
  test('the provider is Didit, the switch is off, and the key file names three entries — the workflow id is not a secret', () => {
    assert.equal(IDENTITY_CHECK.provider, 'DIDIT');
    assert.equal(IDENTITY_CHECK.enabled, false);
    assert.equal(IDENTITY_PROVIDER_NAME, 'Didit');
    const mine = SECRET_KEYS.filter((k) => k.owner === 'DIDIT_IDV');
    assert.deepEqual(mine.map((k) => [k.name, k.secret]), [['DIDIT_API_KEY', true], ['DIDIT_WEBHOOK_SECRET', true], ['DIDIT_WORKFLOW_ID', false]]);
    assert.equal(SECRET_KEYS.filter((k) => /VERIFF/.test(k.name)).length, 0, 'a Veriff key is still named');
    const example = readFileSync(new URL('../secrets.example.env', import.meta.url), 'utf8');
    for (const k of mine) assert.match(example, new RegExp(`^${k.name}=$`, 'm'), `${k.name} is not in the example key file`);
    assert.doesNotMatch(example, /^VERIFF_/m);
  });
});

describe('151f · a result is believed only when a signature holds AND it is under five minutes old', () => {
  const secrets = secretsFromValues(KEYS);

  test('X-Signature-V2 — the HMAC of the sorted, compact JSON — holds on a body whose bytes were re-encoded', () => {
    const body = reordered('Approved');
    const v2 = mac(canonicalJson(JSON.parse(body)));
    assert.notEqual(v2, mac(body), 'the fixture must differ from its canonical form, or this proves nothing');
    const d = readIdentityDecision(body, { v2, raw: null, timestamp: TS }, secrets, NOW_MS);
    assert.equal(d.state, 'READ');
    assert.equal(d.state === 'READ' ? d.outcome : '', 'PASS');
    assert.equal(d.state === 'READ' ? d.check_ref : '', 'idc-151f');
    assert.equal(d.state === 'READ' ? d.decided_at : '', NOW);
  });

  test('the canonical form sorts keys at every level, keeps non-ASCII letters as they are, and adds no spaces', () => {
    assert.equal(canonicalJson({ b: 1, a: { d: 'Zoë', c: [ { y: 2, x: 1 } ] } }), '{"a":{"c":[{"x":1,"y":2}],"d":"Zoë"},"b":1}');
  });

  test('a V2 signature over the raw bytes, a raw signature over the canonical form, or a wrong secret, all fail', () => {
    const body = reordered('Approved');
    const canon = canonicalJson(JSON.parse(body));
    for (const s of [{ v2: mac(body), raw: null }, { v2: null, raw: mac(canon) }, { v2: mac(canon, 'another'), raw: mac(body, 'another') }, { v2: null, raw: null }]) {
      assert.equal(signatureHolds(body, { ...s, timestamp: TS }, KEYS.DIDIT_WEBHOOK_SECRET), false, JSON.stringify(s));
      assert.equal(readIdentityDecision(body, { ...s, timestamp: TS }, secrets, NOW_MS).state, 'REFUSED');
    }
  });

  test('a stale, a future, a missing or a malformed time is refused — even with a good signature on "Approved"', () => {
    const body = reordered('Approved');
    const raw = mac(body);
    for (const timestamp of [String(NOW_MS / 1000 - 301), String(NOW_MS / 1000 + 301), null, '', 'yesterday', '1.5']) {
      const d = readIdentityDecision(body, { v2: null, raw, timestamp }, secrets, NOW_MS);
      assert.equal(d.state, 'REFUSED', String(timestamp));
    }
    assert.equal(timestampFresh(String(NOW_MS / 1000 - 300), NOW_MS), true, 'five minutes exactly is inside the window');
    assert.equal(timestampFresh(String(NOW_MS / 1000 + 300), NOW_MS), true);
  });

  test('"still under way" is its own answer, not a result — and a webhook about something else is ignored', () => {
    for (const status of ['Not Started', 'In Progress', 'Awaiting User']) {
      const body = reordered(status);
      const d = readIdentityDecision(body, { v2: null, raw: mac(body), timestamp: TS }, secrets, NOW_MS);
      assert.equal(d.state, 'UNDER_WAY', status);
    }
    const other = JSON.stringify({ webhook_type: 'user.status.updated', status: 'ACTIVE' });
    assert.equal(readIdentityDecision(other, { v2: null, raw: mac(other), timestamp: TS }, secrets, NOW_MS).state, 'IGNORED');
    assert.equal(readIdentityDecision(other, { v2: null, raw: mac(other, 'wrong'), timestamp: TS }, secrets, NOW_MS).state, 'REFUSED',
      'an unsigned webhook is refused before its type is even read');
  });
});

async function world() {
  const made = await createApp(':memory:', { documentRoot: mkdtempSync(join(tmpdir(), 'cb-151f-')), now: () => NOW, sealKey: randomBytes(32) });
  const s = await seed(made.app.db, made.app.hasher, made.app.now);
  const db = made.app.db;
  const admin = { id: s.users.find((u) => u.role === 'ADMIN')!.id, role: 'ADMIN', business_id: null, disabled: false } as Actor;
  const c = db.get<{ id: string; business_id: string }>('SELECT id, business_id FROM contacts ORDER BY id LIMIT 1')!;
  db.run("INSERT INTO cdd_checks (id, business_id, claim_id, claimant_type, claimant_type_note, state, created_by, created_at, updated_at) VALUES ('cdd-151f', ?, NULL, 'LIMITED_COMPANY', NULL, 'IN_PROGRESS', ?, ?, ?)",
    [c.business_id, admin.id, NOW, NOW]);
  made.app.outside = fixtureTransport({ [`POST ${IDENTITY_SESSION_ENDPOINT}`]: SESSION_OK });
  made.app.secrets = secretsFromValues(KEYS);
  const sent = await sendIdentityCheck({ app: made.app, newId: () => 'idc-151f' }, admin,
    { business_id: c.business_id, contact_id: c.id, cdd_check_id: 'cdd-151f', first_name: 'Ada', last_name: 'Invented' }, { config: ON });
  assert.equal(sent.ok, true, sent.ok ? '' : sent.why);
  let n = 0;
  const audit = (kind: string) => db.all<{ object_id: string; detail: string }>('SELECT object_id, detail FROM audit_log WHERE kind = ? ORDER BY seq', [kind]);
  return { app: made.app, db, audit, newId: () => `res-151f-${++n}`, close: made.close };
}

describe('151f · receiving: a check under way is acknowledged and not kept; the answer that follows is', () => {
  test('In Progress then Approved: one result row, a PASS, the evidence filled in naming Didit', async () => {
    const w = await world();
    try {
      const going = reordered('In Progress');
      assert.deepEqual(receiveIdentityResult(w.app, w.newId, going, { v2: null, raw: mac(going), timestamp: TS }), { status: 200, outcome: null });
      assert.equal(w.db.get<{ n: number }>('SELECT COUNT(*) AS n FROM identity_check_results')?.n, 0, 'an under-way status was kept as a result');
      assert.equal(w.audit('IDENTITY_RESULT_NOT_KEPT').length, 1);
      assert.equal(identityPassed(w.db, 'cdd-151f'), false, 'under way must never read as a pass');
      const done = reordered('Approved');
      assert.deepEqual(receiveIdentityResult(w.app, w.newId, done, { v2: mac(canonicalJson(JSON.parse(done))), raw: null, timestamp: TS }), { status: 200, outcome: 'PASS' });
      assert.equal(w.db.get<{ n: number }>('SELECT COUNT(*) AS n FROM identity_check_results')?.n, 1);
      assert.equal(w.db.get<{ provider: string }>('SELECT provider FROM identity_checks')?.provider, 'DIDIT');
      assert.equal(w.db.get<{ v: string }>("SELECT verification_method AS v FROM cdd_checks WHERE id = 'cdd-151f'")?.v, passEvidenceSentence('2026-09-25'));
      assert.match(passEvidenceSentence('2026-09-25'), /with Didit: passed/);
    } finally { w.close(); }
  });

  test('an under-way word about a session we never sent is refused, and a stale Approved writes nothing', async () => {
    const w = await world();
    try {
      const stranger = reordered('In Progress').replace(SESSION, 'no-such-session');
      assert.equal(receiveIdentityResult(w.app, w.newId, stranger, { v2: null, raw: mac(stranger), timestamp: TS }).status, 404);
      const done = reordered('Approved');
      assert.equal(receiveIdentityResult(w.app, w.newId, done, { v2: null, raw: mac(done), timestamp: String(NOW_MS / 1000 - 3600) }).status, 401);
      assert.equal(w.db.get<{ n: number }>('SELECT COUNT(*) AS n FROM identity_check_results')?.n, 0);
      assert.equal(identityPassed(w.db, 'cdd-151f'), false);
    } finally { w.close(); }
  });
});

describe('151f · migration 053: Didit is a provider, Veriff stays valid, and Didit’s names for a person are never kept', () => {
  test('the provider column takes DIDIT and VERIFF and nothing else; the no-delete trigger survived the rebuild', async () => {
    const w = await world();
    try {
      const row = w.db.get<{ business_id: string; contact_id: string; sent_by: string }>("SELECT business_id, contact_id, sent_by FROM identity_checks WHERE id = 'idc-151f'")!;
      const ins = (id: string, provider: string) => w.db.run(
        'INSERT INTO identity_checks (id, business_id, contact_id, cdd_check_id, provider, session_id, link, sent_by, sent_at) VALUES (?, ?, ?, NULL, ?, ?, ?, ?, ?)',
        [id, row.business_id, row.contact_id, provider, `sess-${id}`, 'https://verify.didit.me/x', row.sent_by, NOW]);
      ins('idc-veriff', 'VERIFF');
      assert.throws(() => ins('idc-other', 'APLYID'), /CHECK constraint failed/);
      assert.throws(() => w.db.run('DELETE FROM identity_checks'), /kept as evidence/);
      const fk = w.db.all<Record<string, unknown>>('SELECT * FROM pragma_foreign_key_check');
      assert.deepEqual(fk, [], 'a foreign key dangles after the rebuild');
    } finally { w.close(); }
  });

  test('a copy carrying Didit’s names for the person, the document number or the whole decision is refused', async () => {
    const w = await world();
    try {
      for (const bad of [{ first_name: 'x' }, { last_name: 'x' }, { date_of_birth: '1970-01-01' }, { document_number: 'X1' }, { personal_number: 'X1' },
        { address: 'x' }, { portrait_image: 'x' }, { decision: {} }]) {
        assert.throws(() => w.db.run("INSERT INTO identity_check_results (id, identity_check_id, outcome, provider_status, decided_at, received_at, body_sha256, result_json) VALUES (?, 'idc-151f', 'PASS', 'Approved', NULL, ?, ?, ?)",
          [`r-${Object.keys(bad)[0]}`, NOW, '0'.repeat(64), JSON.stringify(bad)]), /never the person/, JSON.stringify(bad));
      }
    } finally { w.close(); }
  });

  test('switched off, sending stays refused with no keys — nothing about the switch changed', async () => {
    const w = await world();
    try {
      w.app.secrets = emptySecrets();
      const c = w.db.get<{ id: string; business_id: string }>('SELECT id, business_id FROM contacts ORDER BY id LIMIT 1')!;
      const admin = { id: w.db.get<{ id: string }>("SELECT id FROM users WHERE role = 'ADMIN' LIMIT 1")!.id, role: 'ADMIN', business_id: null, disabled: false } as Actor;
      const r = await sendIdentityCheck({ app: w.app, newId: () => 'x' }, admin, { business_id: c.business_id, contact_id: c.id, cdd_check_id: null, first_name: 'A', last_name: 'B' });
      assert.equal(r.ok, false);
      assert.match(r.ok ? '' : r.why, /privacy notice and in the engagement letter/);
    } finally { w.close(); }
  });
});
