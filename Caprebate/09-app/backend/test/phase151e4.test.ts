/**
 * PHASE 151e, line 6, 28 September 2026 — CONTACT DETAILS ARE NOT OPTIONAL.
 *
 * Lakhbir, 28 September 2026: "we must get contact details it is a non negotiable", and, asked which rule, "both":
 *   1  a client cannot be saved without a contact with an email address or a telephone number - the website's funnel
 *      close refuses a blank or a wrong one for the channel chosen, saves nothing, and puts what was typed on the
 *      person's own contact;
 *   2  a client that already has none is flagged on its page until it has one, and a change that would leave a client
 *      with no contact we can reach is refused;
 *   3  an identity check goes only to a contact with an email address or a telephone number.
 * Invented people only, recorded answers, no network.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createApp } from '../src/server.ts';
import { seed, SEED_PASSWORD } from '../src/seed.ts';
import type { Actor } from '../src/authz.ts';
import { fixtureTransport } from '../src/connectors/http.ts';
import { secretsFromValues } from '../src/secrets.ts';
import { IDENTITY_CHECK, IDENTITY_SESSION_ENDPOINT, type IdentityCheckConfig } from '../src/connectors/identity-check.ts';
import { identityPanel, sendIdentityCheck, UNREACHABLE_CONTACT_WORDS } from '../src/web/identity-checks.ts';
import * as C from '../src/web/crm.ts';
import { contactValueProblem } from '../src/web/router.ts';

const NOW = '2026-09-28T10:00:00.000Z';

async function world() {
  const made = await createApp(':memory:', { documentRoot: mkdtempSync(join(tmpdir(), 'cb-151e4-')), now: () => NOW, sealKey: randomBytes(32) });
  await seed(made.app.db, made.app.hasher, made.app.now);
  await new Promise<void>((r) => made.server.listen(0, '127.0.0.1', () => r()));
  const a = made.server.address();
  const base = `http://127.0.0.1:${typeof a === 'object' && a !== null ? a.port : 0}`;
  const client = () => {
    let cookie = '';
    const req = async (path: string, init: RequestInit = {}) => {
      const headers = { ...(init.headers as Record<string, string> | undefined), ...(cookie === '' ? {} : { cookie }) };
      const r = await fetch(base + path, { redirect: 'manual', ...init, headers });
      const set = r.headers.getSetCookie();
      if (set.length > 0) cookie = set.map((x) => x.split(';')[0] ?? '').join('; ');
      return { status: r.status, body: await r.text() };
    };
    const post = (path: string, fields: Record<string, string>) =>
      req(path, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(fields).toString() });
    return { req, post };
  };
  const db = made.app.db;
  const admin = { id: db.get<{ id: string }>("SELECT id FROM users WHERE role = 'ADMIN' LIMIT 1")!.id, role: 'ADMIN', business_id: null, disabled: false } as Actor;
  const deps: C.CrmDeps = { db, audit: made.app.audit, now: made.app.now, newId: () => `id-151e4-${Math.random().toString(36).slice(2)}` };
  return { made, db, admin, deps, client, close: () => { made.server.close(); made.close(); } };
}

/** The website's assessment, as a person fills it in, up to the close. */
async function toTheClose(c: ReturnType<Awaited<ReturnType<typeof world>>['client']>) {
  await c.req('/assessment');
  await c.post('/assessment/Q1', { own_prior_claim: 'no' });
  await c.post('/assessment/Q1a', { previous_owner_claimed: 'dont_know' });
  await c.post('/assessment/Q1b', { is_uk_taxpayer: 'yes', current_year_position: 'profitable' });
  await c.post('/assessment/Q1c', { trigger_default: 'purchase' });
  await c.post('/assessment/Q2', { p0_address: 'Invented House, ZZ9 9ZZ', p0_sector: 'care_homes', p0_trigger: 'purchase', p0_spend: '2400000', p0_date: '06/2021' });
  await c.post('/assessment/Q3', { p0_works: 'no' });
  await c.req('/assessment/figure');
  const page = await c.req('/assessment/close');
  assert.equal(page.status, 200);
  return page.body;
}
const closeWith = (channel: string, contact_value: string) => ({
  full_name: 'Invented Person', business_name: 'Invented Care Limited', job_role: 'owner', channel, contact_value, contact_consent: 'on',
});
const count = (db: Awaited<ReturnType<typeof world>>['db'], sql: string) => db.get<{ n: number }>(sql)?.n ?? 0;

/* ================================================================== 1 · NO WAY TO REACH THEM, NO CLIENT */

describe('151e line 6 · 1 · the website cannot save a client without a way to reach them', () => {
  for (const [channel, value, why] of [
    ['email', '', /We need your email address/],
    ['email', '01632 960111', /does not look like an email address/],
    ['email', 'invented@nowhere', /does not look like an email address/],
    ['phone', '', /We need your telephone number/],
    ['phone', 'call me', /does not look like a telephone number/],
    ['phone', '0163', /does not look like a telephone number/],
  ] as const) {
    test(`${channel} with ${value === '' ? 'nothing' : `"${value}"`}: refused in words, and nothing is saved`, async () => {
      const w = await world();
      try {
        const c = w.client();
        const form = await toTheClose(c);
        assert.match(form, /name="contact_value" required/, 'the box is not marked as needed');
        const before = count(w.db, 'SELECT COUNT(*) AS n FROM businesses');
        const r = await c.post('/assessment/close', closeWith(channel, value));
        assert.equal(r.status, 400, r.body.slice(0, 200));
        assert.match(r.body, why);
        assert.equal(count(w.db, 'SELECT COUNT(*) AS n FROM businesses'), before, 'a client was saved with no way to reach them');
        assert.equal(count(w.db, "SELECT COUNT(*) AS n FROM contacts WHERE full_name = 'Invented Person'"), 0);
      } finally { w.close(); }
    });
  }

  for (const [channel, value, column] of [['email', 'invented.person@example.invalid', 'email'], ['phone', '01632 960111', 'phone']] as const) {
    test(`${channel} with a real-looking ${column}: the client is saved, and the person's own contact holds it`, async () => {
      const w = await world();
      try {
        const c = w.client();
        await toTheClose(c);
        const r = await c.post('/assessment/close', closeWith(channel, value));
        assert.equal(r.status, 200, r.body.slice(0, 300));
        const person = w.db.get<{ email: string | null; phone: string | null; business_id: string | null }>(
          "SELECT email, phone, business_id FROM contacts WHERE full_name = 'Invented Person'");
        assert.ok(person, 'no contact was written');
        assert.equal(person[column], value, 'the contact does not hold what the person typed');
        assert.ok(person.business_id !== null && C.reachableContacts(w.db, person.business_id) === 1, 'the new client has no contact we can reach');
      } finally { w.close(); }
    });
  }

  test('the rule itself: an email for email, a telephone number for a call or a text', () => {
    assert.equal(contactValueProblem('email', 'a@b.co'), undefined);
    assert.equal(contactValueProblem('phone', '+44 1632 960111'), undefined);
    assert.equal(contactValueProblem('sms_whatsapp', '07700 900123'), undefined);
    assert.match(contactValueProblem('sms_whatsapp', 'a@b.co') ?? '', /telephone number/);
    assert.match(contactValueProblem('phone', '1'.repeat(16)) ?? '', /telephone number/);
  });
});

/* ================================================================== 2 · FLAGGED UNTIL FIXED, AND NEVER UNDONE */

describe('151e line 6 · 2 · a client with no contact we can reach is flagged, and the last one cannot be taken away', () => {
  test('flagged on its page until one of its contacts has an email address or a telephone number', async () => {
    const w = await world();
    try {
      const bare = w.db.get<{ id: string }>('SELECT id FROM businesses b WHERE NOT EXISTS (SELECT 1 FROM contacts c WHERE c.business_id = b.id) ORDER BY id LIMIT 1')!;
      const staff = w.client();
      assert.equal((await staff.post('/login', { email: 'admin@example.invalid', password: SEED_PASSWORD })).status, 303);
      const flagged = await staff.req(`/staff/clients/${bare.id}`);
      assert.equal(flagged.status, 200);
      assert.match(flagged.body, /id="no-way-to-reach"/);
      assert.ok(flagged.body.includes(C.NO_WAY_TO_REACH_WORDS));
      // a contact with neither leaves it flagged
      assert.equal(C.addContact(w.deps, w.admin, bare.id, { full_name: 'Invented Nobody' }).ok, true);
      assert.match((await staff.req(`/staff/clients/${bare.id}`)).body, /id="no-way-to-reach"/);
      // one with a telephone number clears it
      assert.equal(C.addContact(w.deps, w.admin, bare.id, { full_name: 'Invented Somebody', phone: '01632 960222' }).ok, true);
      assert.doesNotMatch((await staff.req(`/staff/clients/${bare.id}`)).body, /id="no-way-to-reach"/);
    } finally { w.close(); }
  });

  test('clearing the only email and telephone a client has is refused; with another way to reach them, it is allowed', async () => {
    const w = await world();
    try {
      const bare = w.db.get<{ id: string }>('SELECT id FROM businesses b WHERE NOT EXISTS (SELECT 1 FROM contacts c WHERE c.business_id = b.id) ORDER BY id LIMIT 1')!;
      const one = C.addContact(w.deps, w.admin, bare.id, { full_name: 'Invented Only', email: 'only@example.invalid' });
      assert.ok(one.ok);
      const refused = C.updateContact(w.deps, w.admin, one.id, { email: '', phone: '' });
      assert.equal(refused.ok, false);
      assert.equal(refused.ok ? '' : refused.why, C.LAST_WAY_TO_REACH_WORDS);
      assert.equal(w.db.get<{ email: string }>('SELECT email FROM contacts WHERE id = ?', [one.id])?.email, 'only@example.invalid', 'it was cleared anyway');
      // changing it to another address is fine
      assert.equal(C.updateContact(w.deps, w.admin, one.id, { email: 'only.two@example.invalid' }).ok, true);
      // with a second contact we can reach, the first may lose its details
      assert.ok(C.addContact(w.deps, w.admin, bare.id, { full_name: 'Invented Second', phone: '01632 960333' }).ok);
      assert.equal(C.updateContact(w.deps, w.admin, one.id, { email: '', phone: '' }).ok, true);
      assert.equal(C.reachableContacts(w.db, bare.id), 1);
    } finally { w.close(); }
  });
});

/* ================================================================== 3 · A CHECK GOES ONLY TO SOMEONE WE CAN REACH */

const KEYS = { DIDIT_API_KEY: 'test-didit-key-not-real-151e4', DIDIT_WEBHOOK_SECRET: 'test-didit-secret-not-real-151e4', DIDIT_WORKFLOW_ID: '11111111-2222-3333-4444-151e40000000' };
const ON: IdentityCheckConfig = Object.freeze({ ...IDENTITY_CHECK, enabled: true, named_in_privacy_notice: true, named_in_engagement_letter: true, papers_waived_for_testing: false, waiver_record: null });

describe('151e line 6 · 3 · an identity check goes only to a contact with an email address or a telephone number', () => {
  test('a contact with neither: refused in words before anything is sent, and no row kept', async () => {
    const w = await world();
    try {
      const t = fixtureTransport({ [`POST ${IDENTITY_SESSION_ENDPOINT}`]: { status: 201, body: JSON.stringify({ session_id: 's-151e4', url: 'https://verify.didit.me/en/session/INVENTED151E4', status: 'Not Started' }) } });
      w.made.app.outside = t;
      w.made.app.secrets = secretsFromValues(KEYS);
      const bare = w.db.get<{ id: string }>('SELECT id FROM businesses b WHERE NOT EXISTS (SELECT 1 FROM contacts c WHERE c.business_id = b.id) ORDER BY id LIMIT 1')!;
      const nobody = C.addContact(w.deps, w.admin, bare.id, { full_name: 'Invented Nobody' });
      assert.ok(nobody.ok);
      const r = await sendIdentityCheck({ app: w.made.app, newId: () => 'idc-151e4' }, w.admin,
        { business_id: bare.id, contact_id: nobody.id, cdd_check_id: null, first_name: 'Invented', last_name: 'Nobody' }, { config: ON });
      assert.equal(r.ok, false);
      assert.equal(r.ok ? '' : r.why, UNREACHABLE_CONTACT_WORDS);
      assert.equal(t.seen.length, 0, 'a request left the server');
      assert.equal(count(w.db, 'SELECT COUNT(*) AS n FROM identity_checks'), 0);
    } finally { w.close(); }
  });

  test('the panel offers only the contacts we can reach, and names the others with what to add', async () => {
    const w = await world();
    try {
      const bare = w.db.get<{ id: string }>('SELECT id FROM businesses b WHERE NOT EXISTS (SELECT 1 FROM contacts c WHERE c.business_id = b.id) ORDER BY id LIMIT 1')!;
      const nobody = C.addContact(w.deps, w.admin, bare.id, { full_name: 'Invented Nobody' });
      assert.ok(nobody.ok);
      const list = () => w.db.all<{ id: string; full_name: string }>('SELECT id, full_name FROM contacts WHERE business_id = ? ORDER BY full_name', [bare.id]);
      const only = String(identityPanel(w.made.app, w.admin, { business_id: bare.id }, list()));
      assert.match(only, /id="identity-unreachable"/);
      assert.match(only, /Nobody we can reach yet\./);
      assert.ok(only.includes(`href="/staff/clients/${bare.id}#contacts"`));
      assert.doesNotMatch(only, /Send an identity check/, 'a form was offered with nobody to send it to');
      const some = C.addContact(w.deps, w.admin, bare.id, { full_name: 'Invented Somebody', email: 'somebody@example.invalid' });
      assert.ok(some.ok);
      const both = String(identityPanel(w.made.app, w.admin, { business_id: bare.id }, list()));
      assert.match(both, /Send an identity check/);
      assert.ok(both.includes(`<option value="${some.id}">`), 'the contact we can reach is not offered');
      assert.ok(!both.includes(`<option value="${nobody.id}">`), 'a contact we cannot reach is offered');
      assert.match(both, /Not offered:<\/strong> Invented Nobody has no email address or telephone number/);
    } finally { w.close(); }
  });
});
