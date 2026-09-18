/**
 * CRM 1 OF 10 — THE BACKBONE: ORGANISATIONS, CONTACTS, PROPERTIES AND THE CLAIM
 * RECORD. 10 September 2026.
 *
 * THE PHASE'S OWN PROOF LIST, WORD FOR WORD, AND WHERE EACH ONE IS BELOW:
 *
 *   "a new action denies by default and a test asserts the refusal for every
 *    role not granted it"                                  → WHO MAY DO WHAT
 *   "the payload proof extended to the new claim and property routes"
 *                                                          → N1, OVER HTTP
 *   "the DO_NOT_CONTACT refusal"                           → DO_NOT_CONTACT
 *   "UNKNOWN and never-asked existing_ca_claimed behaving identically"
 *                                                          → N4
 *   "copy the stored cross-site scripting test the business page's internal
 *    notes already have"                                   → STORED XSS
 *   "at least one business with two properties and one property with two
 *    claims"                                               → THE CLAIM RECORD
 *
 * DRIVEN OVER HTTP WHEREVER THE CLAIM IS ABOUT WHAT A RESPONSE CONTAINS, because
 * a claim about a response is not tested by calling the function the response
 * calls. The view models are called directly where the claim is about a rule.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { createApp } from '../src/server.ts';
import { seed } from '../src/seed.ts';
import { APP_ROLES, type AppRole } from '../src/roles.ts';
import { can, REGISTERED_ACTIONS, type Obj } from '../src/authz.ts';
import { quarantinedKeysAndValues } from '../src/payload.ts';
import { inMemoryPostcodeStore, type PostcodeAuthorityTable } from '../src/web/postcode-port.ts';
import * as C from '../src/web/crm.ts';
import * as L from '../src/web/leads.ts';
import * as P from '../src/web/pipeline.ts';
import { actor, testApp, keys, scalars } from './helpers.ts';

const PASSWORD = 'a-very-long-development-password';
const T = '2026-09-08T00:00:00.000Z';
const SCRIPT = '<script>alert(1)</script><img src=x onerror=alert(2)>';

/**
 * A SEALED VALUE FOUND AS A NUMBER IN THE TEXT — never as part of a longer number.
 *
 * THE FLAKE CRM 8 OF 10 COULD NOT NAME, NAMED BY CRM 9 OF 10 ON 12 SEPTEMBER 2026. This file searched the surveyor's
 * raw response with `body.includes(String(v))`. The seed's estimate carries a qualifying percentage of 0.3 and a
 * multiplier of 0.25, and the seeded application runs on the real clock, so a timestamp in the claim's timeline —
 * `…T08:31:10.312Z` — contains "0.3" whenever the seconds end in 0 and the milliseconds fall between 300 and 399:
 * about one run in eighty-five, which is the one 611 in 612 seen inside the figure drift checker. Proved by slowing
 * the clock so every timestamp read `…X0.300Z` (red every time) and `…X0.400Z` (green). A digit or a point either
 * side means the text is a different number, and the leak this test exists for is still found — the test below
 * says so both ways.
 */
function numberInText(text: string, v: unknown): boolean {
  const escaped = String(v).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?<![\\d.])${escaped}(?!\\d)`).test(text);
}

test('numberInText finds a leaked 0.3 and a leaked pence figure, and not the milliseconds of a timestamp', () => {
  assert.equal(numberInText('{"qualifying_pct":0.3,"x":1}', 0.3), true, 'a real leak was not found');
  assert.equal(numberInText('{"multiplier":0.25}', 0.25), true, 'a real leak was not found');
  assert.equal(numberInText('<td>72000000</td>', 72000000), true, 'a real leak was not found');
  assert.equal(numberInText('{"at":"2026-09-12T08:31:10.312Z"}', 0.3), false, 'a timestamp was read as the value');
  assert.equal(numberInText('{"at":"2026-09-12T08:31:20.254Z"}', 0.25), false, 'a timestamp was read as the value');
  assert.equal(numberInText('{"ratio":0.3898}', 0.3), false, 'a longer number was read as the value');
});

type Res = { status: number; location: string | null; body: string };
type Client = {
  req(path: string, init?: RequestInit): Promise<Res>;
  post(path: string, fields: Record<string, string>): Promise<Res>;
};
type Made = Awaited<ReturnType<typeof createApp>>;

function makeClient(base: string): Client {
  let cookie = '';
  const c: Client = {
    async req(path, init = {}) {
      const headers = { ...(init.headers as Record<string, string> | undefined) };
      if (cookie !== '') headers['cookie'] = cookie;
      const r = await fetch(base + path, { redirect: 'manual', ...init, headers });
      const set = r.headers.getSetCookie();
      if (set.length > 0) {
        const jar = new Map(cookie.split('; ').filter(Boolean).map((x) => [x.split('=')[0] ?? '', x] as const));
        for (const s of set) {
          const first = s.split(';')[0] ?? '';
          jar.set(first.split('=')[0] ?? '', first);
        }
        cookie = [...jar.values()].join('; ');
      }
      return { status: r.status, location: r.headers.get('location'), body: await r.text() };
    },
    post(path, fields) {
      return c.req(path, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams(fields).toString(),
      });
    },
  };
  return c;
}

async function listen(made: Made): Promise<string> {
  await new Promise<void>((r) => made.server.listen(0, '127.0.0.1', () => r()));
  const addr = made.server.address();
  return `http://127.0.0.1:${typeof addr === 'object' && addr !== null ? addr.port : 0}`;
}

/** An application with one user per staff role, and the funnel to create a client. */
async function bootFunnel(): Promise<{
  made: Made; close(): void; signIn(role: AppRole): Promise<Client>;
  runFunnel(name: string, q2?: Record<string, string>): Promise<string>;
}> {
  const made = await createApp(':memory:', { documentRoot: mkdtempSync(join(tmpdir(), 'cb-crm-')) });
  const base = await listen(made);
  const hash = await made.app.hasher.hash(PASSWORD);
  for (const role of APP_ROLES.filter((r) => r !== 'CLIENT')) {
    made.app.db.run(
      'INSERT INTO users (id,email,email_canonical,display_name,role,password_hash,created_at,updated_at,business_id) ' +
        'VALUES (?,?,?,?,?,?,?,?,NULL)',
      [`u-${role}`, `${role.toLowerCase()}@example.invalid`, `${role.toLowerCase()}@example.invalid`,
        `${role} Person`, role, hash, T, T],
    );
  }
  return {
    made,
    close: made.close,
    async signIn(role) {
      const c = makeClient(base);
      const r = await c.post('/login', { email: `${role.toLowerCase()}@example.invalid`, password: PASSWORD });
      assert.equal(r.status, 303, `${role} could not sign in`);
      return c;
    },
    async runFunnel(name, q2 = {}) {
      const c = makeClient(base);
      await c.req('/assessment');
      await c.post('/assessment/Q1', { own_prior_claim: 'no' });
      await c.post('/assessment/Q1a', { previous_owner_claimed: 'dont_know' });
      await c.post('/assessment/Q1b', { is_uk_taxpayer: 'yes', current_year_position: 'profitable' });
      await c.post('/assessment/Q1c', { trigger_default: 'purchase' });
      await c.post('/assessment/Q2', {
        p0_address: 'Meadowcroft House, ZZ9 9ZZ', p0_sector: 'care_homes',
        p0_trigger: 'purchase', p0_spend: '2400000', p0_date: '06/2021', ...q2,
      });
      await c.post('/assessment/Q3', { p0_works: 'no' });
      await c.req('/assessment/figure');
      const close = await c.req('/assessment/close');
      const slot = /name="slot" value="([^"]+)"/.exec(close.body)?.[1] ?? '';
      const submitted = await c.post('/assessment/close', {
        full_name: 'A Person', business_name: name, job_role: 'owner',
        channel: 'phone', contact_value: '01632 960111', contact_consent: 'on',
        ...(slot === '' ? {} : { slot }),
      });
      /* CRM 5 of 10 — THE ONE FLAKE, EXPLAINED. On 11 September this close answered 404 once in a full run and never
         in this file alone. Its handler cannot answer 404: the request reached ANOTHER PROCESS's server. The server
         above listened on every address, and a program bound to 127.0.0.1 on the same port — which the kernel allows
         beside a wildcard bind — takes a request to 127.0.0.1. Every test server now binds 127.0.0.1 itself, which the
         kernel refuses to share, and test/introducers.test.ts holds that line. If it ever recurs, this says who answered. */
      assert.equal(submitted.status, 200,
        `the funnel did not close — HTTP ${submitted.status} from ${base}, body: ${submitted.body.slice(0, 300)}`);
      const row = made.app.db.get<{ id: string }>(
        'SELECT id FROM businesses WHERE name = ? ORDER BY created_at DESC LIMIT 1', [name]);
      assert.ok(row, 'the funnel created no business');
      return row.id;
    },
  };
}

/** The seeded demonstration data, served, with the seed's own sign-ins. */
async function bootSeeded(): Promise<{ made: Made; close(): void; signIn(who: string): Promise<Client> }> {
  const made = await createApp(':memory:', { documentRoot: mkdtempSync(join(tmpdir(), 'cb-crm-seed-')) });
  const base = await listen(made);
  const s = await seed(made.app.db, made.app.hasher, made.app.now);
  return {
    made,
    close: made.close,
    async signIn(who) {
      const c = makeClient(base);
      const r = await c.post('/login', { email: `${who}@example.invalid`, password: s.password });
      assert.equal(r.status, 303, `${who} could not sign in`);
      return c;
    },
  };
}

function deps(app: Made['app'] | Awaited<ReturnType<typeof testApp>>): C.CrmDeps {
  return { db: app.db, audit: app.audit, now: app.now, newId: randomUUID };
}

/**
 * CRM 2 of 10: the funnel records a lead and the claim opens when it converts.
 * Records the four enquiry checks as YES, qualifies the lead and converts it, as
 * SALES — the path a person takes — and returns the claim it opened.
 */
function qualifyAndConvert(app: Made['app'], lead_id: string): string {
  const d = deps(app);
  const sales = actor('SALES', 'u-SALES');
  for (const check_key of Object.keys(P.ENQUIRY_CHECKS)) {
    const r = P.recordEnquiryCheck(d, sales, { lead_id }, { check_key, answer: 'YES', note: null });
    assert.equal(r.ok, true, r.ok ? '' : r.why);
  }
  const q = L.updateLead(d, sales, lead_id, { status: 'QUALIFIED' });
  assert.equal(q.ok, true, q.ok ? '' : q.why);
  const c = L.convertLead(d, sales, lead_id, {});
  assert.ok(c.ok, c.ok ? '' : c.why);
  return c.id;
}

function leadOf(app: Made['app'], business_id: string): string {
  const r = app.db.get<{ id: string }>('SELECT id FROM leads WHERE business_id = ? ORDER BY created_at LIMIT 1', [business_id]);
  assert.ok(r, 'the organisation has no lead');
  return r.id;
}

function businessNamed(app: { db: Made['app']['db'] }, name: string): string {
  const r = app.db.get<{ id: string }>('SELECT id FROM businesses WHERE name = ?', [name]);
  assert.ok(r, `no business named ${name}`);
  return r.id;
}

/* ================================================================== *
 * THE CLAIM RECORD
 * ================================================================== */

describe('the claim record — one organisation, many properties; one property, many claims', () => {
  test('the seed has a claim for every business, an organisation with two properties, and a property with two claims', async () => {
    const app = await testApp();
    try {
      await seed(app.db, app.hasher, app.now);
      const without = app.db.all(
        'SELECT b.id FROM businesses b WHERE NOT EXISTS (SELECT 1 FROM claims c WHERE c.business_id = b.id)');
      assert.deepEqual(without, [], 'a seeded business has no claim, so an existing screen has nothing to read');
      const twoProperties = app.db.all<{ business_id: string }>(
        'SELECT business_id FROM properties GROUP BY business_id HAVING COUNT(*) >= 2');
      assert.ok(twoProperties.length >= 1, 'no organisation holds two properties');
      const twoClaims = app.db.all<{ property_id: string }>(
        'SELECT property_id FROM claims WHERE property_id IS NOT NULL GROUP BY property_id HAVING COUNT(*) >= 2');
      assert.ok(twoClaims.length >= 1, 'no property holds two claims');
      // And the two claims on one property are two different reliefs, which is why there are two.
      const ws = app.db.all<{ workstream: string }>(
        'SELECT workstream FROM claims WHERE property_id = ? ORDER BY workstream', [twoClaims[0]?.property_id ?? '']);
      assert.equal(new Set(ws.map((w) => w.workstream)).size, 2);
    } finally { app.close(); }
  });

  test('a reference is a human series, unique and never reused — and a claim can be neither deleted nor re-numbered', async () => {
    const app = await testApp();
    try {
      app.db.run('INSERT INTO businesses (id,name,sector,stage,created_at) VALUES (?,?,?,?,?)',
        ['b-1', 'Refs Limited', 'dental', 'ASSESSMENT_SUBMITTED', T]);
      const a = C.insertClaim(app.db, () => T, randomUUID, {
        business_id: 'b-1', property_id: null, assessment_id: null, workstream: 'UNKNOWN', stage: null, owner_id: null, surveyor_id: null,
      });
      const b = C.insertClaim(app.db, () => T, randomUUID, {
        business_id: 'b-1', property_id: null, assessment_id: null, workstream: 'LAND_REMEDIATION', stage: null, owner_id: null, surveyor_id: null,
      });
      assert.equal(a.claim_ref, 'CR-2026-0001');
      assert.equal(b.claim_ref, 'CR-2026-0002');
      assert.throws(() => app.db.run('DELETE FROM claims WHERE id = ?', [a.id]), /never deleted/);
      assert.throws(() => app.db.run('UPDATE claims SET claim_ref = ? WHERE id = ?', ['CR-2026-0001', b.id]), /reference/);
      assert.throws(() => app.db.run('UPDATE claim_ref_series SET last_n = 1'), /only ever moves forward/);
      assert.throws(() => app.db.run('DELETE FROM claim_ref_series'), /never reused/);
      // The next one continues the series; nothing handed back a number.
      const c = C.insertClaim(app.db, () => T, randomUUID, {
        business_id: 'b-1', property_id: null, assessment_id: null, workstream: 'UNKNOWN', stage: null, owner_id: null, surveyor_id: null,
      });
      assert.equal(c.claim_ref, 'CR-2026-0003');
    } finally { app.close(); }
  });

  test('a claim cannot point at another organisation’s property, and its stage is a key stages.ts knows', async () => {
    const app = await testApp();
    try {
      app.db.run('INSERT INTO businesses (id,name,sector,stage,created_at) VALUES (?,?,?,?,?)', ['b-1', 'One Limited', 'gp', 'AT_SURVEY', T]);
      app.db.run('INSERT INTO businesses (id,name,sector,stage,created_at) VALUES (?,?,?,?,?)', ['b-2', 'Two Limited', 'gp', 'AT_SURVEY', T]);
      app.db.run('INSERT INTO properties (id,business_id,label,created_at) VALUES (?,?,?,?)', ['p-1', 'b-1', 'One site', T]);
      assert.throws(() => C.insertClaim(app.db, () => T, randomUUID, {
        business_id: 'b-2', property_id: 'p-1', assessment_id: null, workstream: 'UNKNOWN', stage: null, owner_id: null, surveyor_id: null,
      }), /FOREIGN KEY/);
      // CRM 2 of 10 replaced the vocabulary: the procedure's stages are accepted, and the six old keys refused.
      assert.throws(() => C.insertClaim(app.db, () => T, randomUUID, {
        business_id: 'b-1', property_id: 'p-1', assessment_id: null, workstream: 'UNKNOWN', stage: 'AT_SURVEY', owner_id: null, surveyor_id: null,
      }), /operating procedure/);
      assert.doesNotThrow(() => C.insertClaim(app.db, () => T, randomUUID, {
        business_id: 'b-1', property_id: 'p-1', assessment_id: null, workstream: 'UNKNOWN', stage: 'ENQUIRY', owner_id: null, surveyor_id: null,
      }));
    } finally { app.close(); }
  });

  test('the funnel records a LEAD and no claim; converting the qualified lead opens the first claim — first property, its assessment, ASSESSMENT — audited', async () => {
    const h = await bootFunnel();
    try {
      const id = await h.runFunnel('Funnel Claims Limited');
      // CRM 2 of 10, disposition row E3: no claim until the enquiry gate is passed.
      assert.equal(h.made.app.db.get<{ n: number }>('SELECT COUNT(*) AS n FROM claims WHERE business_id = ?', [id])?.n, 0,
        'the funnel opened a claim with the enquiry gate never asked');
      const lead = h.made.app.db.get<{ id: string; status: string; source: string; origin: string; booking_id: string | null }>(
        'SELECT id, status, source, origin, booking_id FROM leads WHERE business_id = ?', [id]);
      assert.ok(lead);
      assert.equal(lead.status, 'NEW');
      assert.equal(lead.source, 'WEBSITE');
      assert.equal(lead.origin, 'ASSESSMENT');
      assert.ok(lead.booking_id, 'the funnel close’s booking is not tied to its lead');
      assert.ok(h.made.app.audit.entries().some((e) => e.kind === 'LEAD_CREATED' && e.detail['route'] === 'funnel_close'));

      qualifyAndConvert(h.made.app, lead.id);
      const claims = h.made.app.db.all<{ property_id: string; assessment_id: string; stage: string; workstream: string }>(
        'SELECT property_id, assessment_id, stage, workstream FROM claims WHERE business_id = ?', [id]);
      assert.equal(claims.length, 1);
      const first = h.made.app.db.get<{ id: string }>(
        'SELECT id FROM properties WHERE business_id = ? ORDER BY created_at, id LIMIT 1', [id]);
      const assessment = h.made.app.db.get<{ id: string }>('SELECT id FROM assessments WHERE business_id = ?', [id]);
      assert.equal(claims[0]?.property_id, first?.id);
      assert.equal(claims[0]?.assessment_id, assessment?.id);
      // The enquiry gate was passed on the lead, so the claim opens at the procedure's second stage.
      assert.equal(claims[0]?.stage, 'ASSESSMENT');
      // Derived, not defaulted: nothing on the funnel's path seals an estimate.
      assert.equal(claims[0]?.workstream, 'UNKNOWN');
      assert.equal(h.made.app.db.get<{ source: string }>('SELECT source FROM businesses WHERE id = ?', [id])?.source, 'WEBSITE');
      assert.ok(h.made.app.audit.entries().some((e) => e.kind === 'CLAIM_CREATED' && e.detail['route'] === 'lead_conversion'));
      assert.ok(h.made.app.audit.entries().some((e) => e.kind === 'LEAD_CONVERTED'));
    } finally { h.close(); }
  });
});

/* ================================================================== *
 * WHO MAY DO WHAT
 * ================================================================== */

const GRANTED: Readonly<Record<string, readonly AppRole[]>> = Object.freeze({
  'organisation.read': ['ADMIN', 'SALES'],
  'organisation.write': ['ADMIN', 'SALES'],
  'contact.read': ['ADMIN', 'SALES'],
  'contact.write': ['ADMIN', 'SALES'],
  'property.enter': ['ADMIN', 'SALES', 'SURVEYING'],
  'property.read': ['ADMIN', 'SALES', 'SURVEYING'],
  'property.write': ['ADMIN', 'SALES'],
  'claim.enter': ['ADMIN', 'SALES', 'ACCOUNTING', 'SURVEYING'],
  'claim.read': ['ADMIN', 'SALES', 'ACCOUNTING', 'SURVEYING'],
  'claim.read_value': ['ADMIN', 'SALES'],
  'claim.create': ['ADMIN', 'SALES'],
  'claim.write': ['ADMIN', 'SALES'],
});

/**
 * The object each action is asked of. The surveyor IS on every property and
 * claim here, so that a refusal below is the ROLE being refused — not the
 * object test failing for some other reason and the refusal passing by accident.
 */
function objectFor(action: string): Obj {
  const noun = action.split('.')[0];
  if (noun === 'organisation') return { type: 'business', id: 'biz-1' };
  if (noun === 'contact') return { type: 'contact', id: 'ct-1', business_id: 'biz-1' };
  if (noun === 'property') return { type: 'property', id: 'p-1', business_id: 'biz-1', assigned_surveyor_ids: ['u-SURVEYING'] };
  return { type: 'claim', id: 'c-1', business_id: 'biz-1', assigned_surveyor_ids: ['u-SURVEYING'] };
}

describe('who may do what — every new action, every role', () => {
  test('each new action admits exactly the roles granted it, and REFUSES every other role', () => {
    for (const [action, granted] of Object.entries(GRANTED)) {
      assert.ok(REGISTERED_ACTIONS.includes(action), `${action} is not registered`);
      for (const role of APP_ROLES.filter((r) => r !== 'READ_ONLY') /* Phase 132e: READ_ONLY is asserted rule by rule in test/authz.test.ts */) {
        const a = actor(role, `u-${role}`, role === 'CLIENT' ? 'biz-1' : null);
        assert.equal(can(a, action, objectFor(action)), granted.includes(role),
          `${role} on ${action}: expected ${granted.includes(role) ? 'allowed' : 'REFUSED'}`);
      }
    }
  });

  test('SURVEYING reaches a property or a claim only through an assigned job — nobody assigned is nobody', () => {
    const s = actor('SURVEYING');
    for (const type of ['property', 'claim'] as const) {
      assert.equal(can(s, `${type}.read`, { type, id: 'x', business_id: 'biz-1', assigned_surveyor_ids: [] }), false);
      assert.equal(can(s, `${type}.read`, { type, id: 'x', business_id: 'biz-1', assigned_surveyor_ids: ['u-someone-else'] }), false);
      assert.equal(can(s, `${type}.read`, { type, id: 'x', business_id: 'biz-1', assigned_surveyor_ids: ['u-SURVEYING'] }), true);
    }
  });

  test('a disabled user is refused every new action', () => {
    for (const action of Object.keys(GRANTED)) {
      assert.equal(can({ ...actor('ADMIN'), disabled: true }, action, objectFor(action)), false, action);
    }
  });
});

/* ================================================================== *
 * N1, AND THE ROLE BOUNDARIES, OVER HTTP ON THE SEED
 * ================================================================== */

describe('N1 and the role boundaries, over HTTP, on the seeded data', () => {
  test('SURVEYING opens the claim and property of an assigned job, and nothing else — naming a surveyor on a claim grants nothing', async () => {
    const h = await bootSeeded();
    try {
      const db = h.made.app.db;
      const job = db.get<{ business_id: string; assessment_id: string }>(
        "SELECT j.business_id, j.assessment_id FROM surveyor_jobs j JOIN users u ON u.id = j.surveyor_id WHERE u.role = 'SURVEYING' LIMIT 1");
      assert.ok(job);
      const mine = db.get<{ id: string }>('SELECT id FROM claims WHERE assessment_id = ?', [job.assessment_id]);
      const myProperty = db.get<{ id: string }>('SELECT id FROM properties WHERE business_id = ? LIMIT 1', [job.business_id]);
      const elverton = businessNamed(h.made.app, 'Elverton Private Hospital Limited');
      const theirs = db.all<{ id: string }>('SELECT id FROM claims WHERE business_id = ?', [elverton]);
      const theirProperty = db.get<{ id: string }>('SELECT id FROM properties WHERE business_id = ? LIMIT 1', [elverton]);
      assert.ok(mine && myProperty && theirProperty && theirs.length === 3); // Phase 134: Elverton's annexe has a claim of its own

      const s = await h.signIn('surveying');
      assert.equal((await s.req(`/staff/claims/${mine.id}`)).status, 200);
      assert.equal((await s.req(`/staff/properties/${myProperty.id}`)).status, 200);
      for (const c of theirs) assert.equal((await s.req(`/staff/claims/${c.id}/view.json`)).status, 403);
      assert.equal((await s.req(`/staff/properties/${theirProperty.id}/view.json`)).status, 403);
      assert.equal((await s.req(`/staff/organisations/${job.business_id}`)).status, 403);
      assert.doesNotMatch((await s.req('/staff/properties')).body, /Elverton/);
      assert.doesNotMatch((await s.req('/staff/claims')).body, /Elverton/);

      // NAMING the surveyor on another organisation's claim is a record, not a grant.
      const surveyor = db.get<{ id: string }>("SELECT id FROM users WHERE role = 'SURVEYING'");
      db.run('UPDATE claims SET surveyor_id = ? WHERE business_id = ?', [surveyor?.id ?? '', elverton]);
      for (const c of theirs) assert.equal((await s.req(`/staff/claims/${c.id}`)).status, 403);
    } finally { h.close(); }
  });

  test('no sealed estimate field reaches SURVEYING on the claim or property routes — by name, by value or as text — and ADMIN receives all seven', async () => {
    const h = await bootSeeded();
    try {
      const db = h.made.app.db;
      const jobs = db.all<{ business_id: string; assessment_id: string }>(
        'SELECT business_id, assessment_id FROM surveyor_jobs WHERE surveyor_id IS NOT NULL');
      assert.ok(jobs.length >= 1);
      const s = await h.signIn('surveying');
      const admin = await h.signIn('admin');
      for (const job of jobs) {
        const est = db.get<Record<string, number>>(
          'SELECT qualifying_expenditure_pence, qualifying_pct, pool_split_main_pence, pool_split_special_pence, ' +
            'bare_land_pence, multiplier, indicative_lifetime_saving_pence FROM estimates WHERE assessment_id = ?',
          [job.assessment_id]);
        assert.ok(est);
        const { keys: badKeys, values: badValues } = quarantinedKeysAndValues(est as never);
        assert.equal(badKeys.length, 7);
        const claim = db.get<{ id: string }>('SELECT id FROM claims WHERE assessment_id = ?', [job.assessment_id]);
        const property = db.get<{ id: string }>(
          'SELECT property_id AS id FROM claims WHERE assessment_id = ?', [job.assessment_id]);
        assert.ok(claim && property);

        for (const path of [`/staff/claims/${claim.id}/view.json`, `/staff/properties/${property.id}/view.json`]) {
          const r = await s.req(path);
          assert.equal(r.status, 200, path);
          const body = JSON.parse(r.body) as unknown;
          const present = [...keys(body)];
          const values = [...scalars(body)];
          for (const k of badKeys) assert.equal(present.includes(k), false, `SURVEYING ${path}: field ${k} leaked`);
          for (const v of badValues) {
            assert.equal(values.includes(v), false, `SURVEYING ${path}: value ${String(v)} leaked`);
            assert.equal(numberInText(r.body, v), false, `SURVEYING ${path}: '${String(v)}' is in the text`);
          }
          // Not ANY key called `value` — a reading of the tenure carries one — but
          // the claim's value object, at the top of a claim, or on a claim line.
          const top = body as { value?: unknown; claims?: readonly { value?: unknown }[] };
          assert.equal('value' in (top as object), false, `SURVEYING ${path}: the claim value is present at all`);
          for (const line of top.claims ?? []) assert.equal('value' in line, false, `SURVEYING ${path}: a claim line carries a value`);

          // THE NEGATIVE CONTROL. The same search as ADMIN must find every one,
          // or a search that finds nothing proves nothing.
          const ra = await admin.req(path);
          const bodyA = JSON.parse(ra.body) as unknown;
          const presentA = [...keys(bodyA)];
          const valuesA = [...scalars(bodyA)];
          for (const k of badKeys) assert.ok(presentA.includes(k), `ADMIN ${path}: field ${k} was not found — the search is blind`);
          for (const v of badValues) assert.ok(valuesA.includes(v), `ADMIN ${path}: value ${String(v)} was not found`);
        }
        for (const path of [`/staff/claims/${claim.id}`, `/staff/properties/${property.id}`]) {
          const r = await s.req(path);
          assert.equal(r.status, 200, path);
          for (const v of badValues) assert.equal(numberInText(r.body, v), false, `SURVEYING page ${path}: '${String(v)}'`);
        }
      }
    } finally { h.close(); }
  });

  test('ACCOUNTING reads a claim as client, reference and money — and is refused the organisation, the property and the value', async () => {
    const h = await bootSeeded();
    try {
      const db = h.made.app.db;
      const b4 = businessNamed(h.made.app, 'Dunmarrow Medical Practice Limited');
      const claim = db.get<{ id: string; claim_ref: string }>(
        'SELECT id, claim_ref FROM claims WHERE business_id = ? AND assessment_id IS NOT NULL', [b4]);
      const property = db.get<{ id: string }>('SELECT id FROM properties WHERE business_id = ?', [b4]);
      assert.ok(claim && property);
      const a = await h.signIn('accounting');
      const r = await a.req(`/staff/claims/${claim.id}/view.json`);
      assert.equal(r.status, 200);
      const body = JSON.parse(r.body) as Record<string, unknown>;
      // CRM 3 of 10 added `timeline` — ACCOUNTING's is built from `invoice.read` alone; test/tasks.test.ts pins what is in it.
      // CRM 4 of 10 adds `documents`, built forwards from `document.read` — for ACCOUNTING the fee invoice
      // and the signed letter and nothing else (disposition row E38); test/documents.test.ts holds that.
      // Phase 132e adds `fee_discounts` — a proposed multi-site discount on our fee, recorded and never applied, which is
      // money and nothing else (src/web/fee-discounts.ts, `fee_discount.read`).
      assert.deepEqual(Object.keys(body).sort(), ['claim_ref', 'client', 'documents', 'fee_discounts', 'id', 'may_write', 'money', 'timeline']);
      assert.equal(body['claim_ref'], claim.claim_ref);
      assert.ok(Array.isArray(body['money']) && body['money'].length >= 1, 'the money is missing');
      // By KEY, at any depth. (A text search for "register" finds the VAT
      // sentence's "not VAT registered", which is money and is meant to be there.)
      const nested = [...keys(body)];
      for (const k of ['value', 'estimate', 'shown_range', 'qualifying_expenditure_pence', 'claim_value_pence',
        'answers', 'notes', 'register_records', 'header', 'overview', 'contacts', 'edit']) {
        assert.equal(nested.includes(k), false, `ACCOUNTING's claim carries '${k}'`);
      }
      assert.equal(r.body.includes('30000000'), false, 'the claim value reached ACCOUNTING');
      assert.equal((await a.req(`/staff/organisations/${b4}`)).status, 403);
      assert.equal((await a.req('/staff/organisations')).status, 403);
      assert.equal((await a.req('/staff/properties')).status, 403);
      assert.equal((await a.req(`/staff/properties/${property.id}/view.json`)).status, 403);
    } finally { h.close(); }
  });

  test('SALES sees the value; a CLIENT is refused every CRM route', async () => {
    const h = await bootSeeded();
    try {
      const b4 = businessNamed(h.made.app, 'Dunmarrow Medical Practice Limited');
      const claim = h.made.app.db.get<{ id: string }>('SELECT id FROM claims WHERE business_id = ? AND assessment_id IS NOT NULL', [b4]);
      assert.ok(claim);
      const sales = await h.signIn('sales');
      const v = JSON.parse((await sales.req(`/staff/claims/${claim.id}/view.json`)).body) as { value?: { established: boolean } };
      assert.equal(v.value?.established, true);
      const client = makeClient('');
      void client;
      const c = await h.signIn('client');
      for (const path of ['/staff/organisations', `/staff/organisations/${b4}`, '/staff/properties', '/staff/claims', `/staff/claims/${claim.id}/view.json`]) {
        assert.equal((await c.req(path)).status, 403, `CLIENT reached ${path}`);
      }
    } finally { h.close(); }
  });
});

/* ================================================================== *
 * DO_NOT_CONTACT
 * ================================================================== */

describe('DO_NOT_CONTACT is a control, not a label', () => {
  test('the outbox refuses to queue anything to that organisation — through the transport and at the database', async () => {
    const app = await testApp();
    try {
      app.db.run('INSERT INTO businesses (id,name,sector,stage,contact_email,created_at) VALUES (?,?,?,?,?,?)',
        ['b-dnc', 'Quiet Limited', 'dental', 'ASSESSMENT_SUBMITTED', 'office@quiet.example.invalid', T]);
      app.db.run('INSERT INTO users (id,email,email_canonical,display_name,role,password_hash,created_at,updated_at,business_id) VALUES (?,?,?,?,?,?,?,?,?)',
        ['u-sales', 'sales@example.invalid', 'sales@example.invalid', 'Sales', 'SALES', 'x', T, T, null]);
      app.db.run('INSERT INTO users (id,email,email_canonical,display_name,role,password_hash,created_at,updated_at,business_id) VALUES (?,?,?,?,?,?,?,?,?)',
        ['u-client', 'Owner@Quiet.example.invalid', 'owner@quiet.example.invalid', 'Client', 'CLIENT', 'x', T, T, 'b-dnc']);
      const count = (): number => app.db.get<{ n: number }>('SELECT COUNT(*) AS n FROM outbox')?.n ?? -1;
      const d = deps(app);
      const added = C.addContact(d, actor('SALES', 'u-sales'), 'b-dnc', { full_name: 'Books Contact', contact_type: 'ACCOUNTANT', email: 'books@firm.example.invalid' });
      assert.equal(added.ok, true);

      // Marked through the store, by a person, and audited as the control it is.
      const marked = C.updateOrganisation(d, actor('SALES', 'u-sales'), 'b-dnc', { client_status: 'DO_NOT_CONTACT' });
      assert.equal(marked.ok, true);
      assert.ok(app.audit.entries().some((e) => e.kind === 'ORGANISATION_UPDATED' && e.detail['client_status'] === 'DO_NOT_CONTACT'));

      const msg = { subject: 's', body: 'b', kind: 'NOTIFICATION' as const };
      for (const m of [
        { ...msg, to_email: 'anyone@example.invalid', business_id: 'b-dnc' },       // by organisation
        { ...msg, to_email: 'OFFICE@quiet.example.invalid' },                       // its channel, any case
        { ...msg, to_email: 'books@firm.example.invalid' },                         // one of its contacts
        { ...msg, to_email: 'owner@quiet.example.invalid', kind: 'PASSWORD_RESET' as const }, // a login of its own
      ]) {
        const r = app.email.send(m);
        assert.equal(r.refused, 'DO_NOT_CONTACT', `queued to ${m.to_email}`);
        assert.equal(r.id, null);
      }
      assert.equal(count(), 0, 'a refused message still wrote a row');

      // AND AT THE DATABASE, for a caller that goes round the transport.
      assert.throws(() => app.db.run(
        'INSERT INTO outbox (id, created_at, to_email, subject, body, kind, business_id) VALUES (?,?,?,?,?,?,?)',
        ['o-1', T, 'someone@example.invalid', 's', 'b', 'NOTIFICATION', 'b-dnc']), /E_DO_NOT_CONTACT/);
      assert.throws(() => app.db.run(
        'INSERT INTO outbox (id, created_at, to_email, subject, body, kind) VALUES (?,?,?,?,?,?)',
        ['o-2', T, 'office@quiet.example.invalid', 's', 'b', 'NOTIFICATION']), /E_DO_NOT_CONTACT/);

      // THE NEGATIVE CONTROL: the same organisation, no longer marked, is written to.
      assert.equal(C.updateOrganisation(d, actor('SALES', 'u-sales'), 'b-dnc', { client_status: 'ACTIVE' }).ok, true);
      const ok = app.email.send({ ...msg, to_email: 'office@quiet.example.invalid', business_id: 'b-dnc' });
      assert.equal(ok.refused, null);
      assert.equal(count(), 1);
    } finally { app.close(); }
  });

  test('the store refuses a status that is not on the list, and a blank one', async () => {
    const app = await testApp();
    try {
      app.db.run('INSERT INTO businesses (id,name,sector,stage,created_at) VALUES (?,?,?,?,?)', ['b-1', 'Listed Limited', 'gp', 'AT_SURVEY', T]);
      const d = deps(app);
      assert.equal(C.updateOrganisation(d, actor('SALES'), 'b-1', { client_status: 'SLEEPING' }).ok, false);
      assert.equal(C.updateOrganisation(d, actor('SALES'), 'b-1', { client_status: null }).ok, false);
      assert.throws(() => app.db.run("UPDATE businesses SET client_status = 'SLEEPING'"), /client-status list/);
      assert.throws(() => C.updateOrganisation(d, actor('ACCOUNTING'), 'b-1', { website: 'https://x.example.invalid' }), /not authorised/);
    } finally { app.close(); }
  });
});

/* ================================================================== *
 * N4
 * ================================================================== */

describe('N4 — existing capital allowances claimed: UNKNOWN and never-asked are the same answer', () => {
  test('the two readings are identical, and neither rules a prior claim out — only a recorded NO does', () => {
    assert.deepEqual(C.priorClaimPosition(null), C.priorClaimPosition('UNKNOWN'));
    assert.equal(C.priorClaimPosition(null).known, false);
    assert.equal(C.priorClaimRuledOut(null), false, 'never asked became a pass');
    assert.equal(C.priorClaimRuledOut('UNKNOWN'), false, 'not known became a pass');
    assert.equal(C.priorClaimRuledOut('YES'), false);
    assert.equal(C.priorClaimRuledOut('NO'), true, 'the reading cannot pass at all, so the two refusals above prove nothing');
    assert.deepEqual(C.tenureReading(null), C.tenureReading('UNKNOWN'));
  });

  test('on the seed, a property recorded UNKNOWN and a property never asked render the same words, on the page and on the wire', async () => {
    const h = await bootSeeded();
    try {
      const db = h.made.app.db;
      const unknownP = db.get<{ id: string }>("SELECT id FROM properties WHERE existing_ca_claimed = 'UNKNOWN' LIMIT 1");
      const neverP = db.get<{ id: string }>('SELECT id FROM properties WHERE existing_ca_claimed IS NULL LIMIT 1');
      assert.ok(unknownP && neverP, 'the seed does not show both states');
      const sales = await h.signIn('sales');
      const a = JSON.parse((await sales.req(`/staff/properties/${unknownP.id}/view.json`)).body) as { existing_ca_claimed: unknown };
      const b = JSON.parse((await sales.req(`/staff/properties/${neverP.id}/view.json`)).body) as { existing_ca_claimed: unknown };
      assert.deepEqual(a.existing_ca_claimed, b.existing_ca_claimed);
      const label = C.priorClaimPosition(null).label;
      assert.ok((await sales.req(`/staff/properties/${unknownP.id}`)).body.includes(label));
      assert.ok((await sales.req(`/staff/properties/${neverP.id}`)).body.includes(label));
    } finally { h.close(); }
  });

  test('an acquisition price of nothing is refused rather than stored as zero', async () => {
    const app = await testApp();
    try {
      app.db.run('INSERT INTO businesses (id,name,sector,stage,created_at) VALUES (?,?,?,?,?)', ['b-1', 'Zero Limited', 'gp', 'AT_SURVEY', T]);
      app.db.run('INSERT INTO properties (id,business_id,label,created_at) VALUES (?,?,?,?)', ['p-1', 'b-1', 'Site', T]);
      assert.equal(C.updateProperty(deps(app), actor('SALES'), 'p-1', { acquisition_price: '0' }, { store: null }).ok, false);
      assert.throws(() => app.db.run('UPDATE properties SET acquisition_price_pence = 0'), /CHECK/);
      assert.equal(C.updateProperty(deps(app), actor('SALES'), 'p-1', { acquisition_price: '£642,500' }, { store: null }).ok, true);
      assert.equal(app.db.get<{ p: number }>('SELECT acquisition_price_pence AS p FROM properties')?.p, 64_250_000);
    } finally { app.close(); }
  });
});

/* ================================================================== *
 * N2
 * ================================================================== */

describe('N2 — a previous owner or an occupier is a company or a role, never a person', () => {
  test('the guard', () => {
    for (const person of ['John Smith', 'Mrs Jane Doe', 'Dr A Patel', 'smith']) {
      assert.equal(C.isCompanyOrRoleToken(person), false, `${person} was accepted`);
    }
    for (const ok of ['Aldergate Holdings Limited', 'Smith Ltd', 'Brackenfell Dental Partnership LLP', 'Example plc',
      'Care Homes Cyfyngedig', 'INDIVIDUAL_NOT_RECORDED', 'DEVELOPER']) {
      assert.equal(C.isCompanyOrRoleToken(ok), true, `${ok} was refused`);
    }
  });

  test('the store refuses a person on either field, and says what to record instead', async () => {
    const app = await testApp();
    try {
      app.db.run('INSERT INTO businesses (id,name,sector,stage,created_at) VALUES (?,?,?,?,?)', ['b-1', 'Owners Limited', 'gp', 'AT_SURVEY', T]);
      app.db.run('INSERT INTO properties (id,business_id,label,created_at) VALUES (?,?,?,?)', ['p-1', 'b-1', 'Site', T]);
      const d = deps(app);
      const person = C.updateProperty(d, actor('SALES'), 'p-1', { previous_owner: 'John Smith' }, { store: null });
      assert.equal(person.ok, false);
      assert.match(person.ok ? '' : person.why, /INDIVIDUAL_NOT_RECORDED/);
      assert.equal(C.updateProperty(d, actor('SALES'), 'p-1', { occupier: 'Jane Doe' }, { store: null }).ok, false);
      assert.equal(C.updateProperty(d, actor('SALES'), 'p-1', { previous_owner: 'INDIVIDUAL_NOT_RECORDED', occupier: 'Owners Limited' }, { store: null }).ok, true);
      assert.equal(app.db.get<{ p: string }>('SELECT previous_owner AS p FROM properties')?.p, 'INDIVIDUAL_NOT_RECORDED');
    } finally { app.close(); }
  });
});

/* ================================================================== *
 * DERIVE, DO NOT RE-KEY
 * ================================================================== */

const TABLE: PostcodeAuthorityTable = {
  table_id: 'CB_ONS_POSTCODE_AUTHORITY',
  source: 'HAND-TYPED TEST FIXTURE - not an ONS file',
  licence: 'n/a - fixture',
  loaded: true,
  verified_at: '2026-08-15T00:00:00.000Z',
  release: 'AUG_2026',
  release_year: 2026,
  record_count: 2,
  byPostcode: {
    'CF10 3NB': { lad_code: 'W06000015', lad_name: 'Cardiff', country_code: 'W92000004', region_code: 'W99999999', terminated_on: null },
    'EH1 1YZ': { lad_code: 'S12000036', lad_name: 'City of Edinburgh', country_code: 'S92000003', region_code: 'S99999999', terminated_on: null },
  },
};

describe('derive, do not re-key — a fact the build already holds is never asked again', () => {
  test('the jurisdiction comes from the postcode wherever the resolver can, and a recorded one is then refused', async () => {
    const app = await testApp();
    const store = inMemoryPostcodeStore(TABLE);
    try {
      app.db.run('INSERT INTO businesses (id,name,sector,stage,created_at) VALUES (?,?,?,?,?)', ['b-1', 'Nations Limited', 'dental', 'AT_SURVEY', T]);
      app.db.run('INSERT INTO properties (id,business_id,label,postcode,created_at) VALUES (?,?,?,?,?)', ['p-1', 'b-1', 'Cardiff site', 'CF10 3NB', T]);
      const d = deps(app);
      const refused = C.updateProperty(d, actor('SALES'), 'p-1', { jurisdiction: 'england' }, { store });
      assert.equal(refused.ok, false);
      assert.match(refused.ok ? '' : refused.why, /already known from the postcode/);
      const v = C.propertyView(app.db, actor('SALES'), 'p-1', { store });
      assert.equal(v.jurisdiction.value, 'wales');
      assert.equal(v.jurisdiction.derived, true);

      // With no table configured nothing derives, so it may be recorded ...
      assert.equal(C.updateProperty(d, actor('SALES'), 'p-1', { jurisdiction: 'wales' }, { store: null }).ok, true);
      assert.match(C.propertyView(app.db, actor('SALES'), 'p-1', { store: null }).jurisdiction.label, /recorded by staff/);
      // ... and the moment a postcode derives one, the recorded answer is cleared rather than left to disagree.
      assert.equal(C.updateProperty(d, actor('SALES'), 'p-1', { postcode: 'EH1 1YZ' }, { store }).ok, true);
      assert.equal(app.db.get<{ j: string | null }>('SELECT jurisdiction AS j FROM properties')?.j, null);
      assert.equal(C.propertyView(app.db, actor('SALES'), 'p-1', { store }).jurisdiction.value, 'scotland');
    } finally { app.close(); }
  });

  test('the legal name and number come from the Companies House record, and are then not asked', async () => {
    const app = await testApp();
    try {
      await seed(app.db, app.hasher, app.now);
      const b2 = businessNamed(app, 'Brackenfell Dental Partnership LLP');
      const v = C.organisationView(app.db, actor('SALES'), b2);
      assert.equal(v.legal_name.derived, true);
      assert.equal(v.legal_name.value, 'Brackenfell Dental Partnership LLP');
      assert.equal(v.company_number.value, 'INVENTED-CO-0002');
      assert.equal(C.updateOrganisation(deps(app), actor('SALES'), b2, { legal_name: 'Something Else Limited' }).ok, false);
      assert.equal(C.updateOrganisation(deps(app), actor('SALES'), b2, { company_number: '00000000' }).ok, false);
    } finally { app.close(); }
  });

  test('the claimant type comes from the client’s own entity answer — and "not sure" derives nothing', async () => {
    const h = await bootFunnel();
    try {
      const ltd = await h.runFunnel('Answered Limited', { p0_entity_type: 'ltd' });
      const unsure = await h.runFunnel('Unsure Holdings', { p0_entity_type: 'unsure' });
      const a = C.organisationView(h.made.app.db, actor('SALES', 'u-SALES'), ltd);
      assert.equal(a.claimant_type.value, 'COMPANY');
      assert.equal(a.claimant_type.derived, true);
      assert.equal(C.updateOrganisation(deps(h.made.app), actor('SALES', 'u-SALES'), ltd, { claimant_type: 'LLP' }).ok, false);
      const b = C.organisationView(h.made.app.db, actor('SALES', 'u-SALES'), unsure);
      assert.equal(b.claimant_type.derived, false);
      assert.equal(b.claimant_type.value, null);
      assert.equal(C.updateOrganisation(deps(h.made.app), actor('SALES', 'u-SALES'), unsure, { claimant_type: 'PARTNERSHIP' }).ok, true);
    } finally { h.close(); }
  });
});

/* ================================================================== *
 * STORED CROSS-SITE SCRIPTING — the internal-notes test, copied to three fields
 * ================================================================== */

describe('STORED CROSS-SITE SCRIPTING', () => {
  test('a contact’s notes, a property’s construction notes and a claim’s next action are escaped on output, and stored verbatim', async () => {
    const h = await bootFunnel();
    try {
      const id = await h.runFunnel('Escaping Limited');
      qualifyAndConvert(h.made.app, leadOf(h.made.app, id));
      const staff = await h.signIn('SALES');
      const db = h.made.app.db;

      assert.equal((await staff.post(`/staff/organisations/${id}/contacts`, { full_name: 'Notes Contact', notes: SCRIPT })).status, 303);
      const property = db.get<{ id: string }>('SELECT id FROM properties WHERE business_id = ? LIMIT 1', [id]);
      const claim = db.get<{ id: string }>('SELECT id FROM claims WHERE business_id = ? LIMIT 1', [id]);
      assert.ok(property && claim);
      assert.equal((await staff.post(`/staff/properties/${property.id}`, { construction_notes: SCRIPT })).status, 303);
      // CRM 3 of 10: the next action is a task, set in its own panel with an owner and a due date.
      const salesUser = db.get<{ id: string }>("SELECT id FROM users WHERE role = 'SALES' LIMIT 1");
      assert.ok(salesUser);
      assert.equal((await staff.post(`/staff/claims/${claim.id}/next-action`, { title: SCRIPT, owner_id: salesUser.id, due_on: '2026-12-31' })).status, 303);

      for (const path of [`/staff/clients/${id}`, `/staff/properties/${property.id}`, `/staff/claims/${claim.id}`]) {
        const page = await staff.req(path);
        assert.equal(page.status, 200, path);
        assert.equal(page.body.includes('<script>alert(1)</script>'), false, `a script tag reached ${path}`);
        // THE DANGEROUS FORM, NOT THE SUBSTRING — see the internal-notes test this copies.
        assert.equal(/<img[\s>]/i.test(page.body), false, `an unescaped img tag reached ${path}`);
        assert.match(page.body, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/, `the value was not rendered at all on ${path}`);
        assert.match(page.body, /&lt;img src=x onerror=alert\(2\)&gt;/, `the img was not rendered as text on ${path}`);
      }
      assert.equal(db.get<{ v: string }>("SELECT notes AS v FROM contacts WHERE full_name = 'Notes Contact'")?.v, SCRIPT);
      assert.equal(db.get<{ v: string }>('SELECT construction_notes AS v FROM properties WHERE id = ?', [property.id])?.v, SCRIPT);
      assert.equal(db.get<{ v: string }>('SELECT title AS v FROM staff_tasks WHERE claim_id = ? AND is_next_action = 1', [claim.id])?.v, SCRIPT);
    } finally { h.close(); }
  });
});

/* ================================================================== *
 * THE FULL SPECIFICATION'S FIRST ACCEPTANCE CRITERION
 * ================================================================== */

describe('an organisation, a contact, a property and a linked claim — without duplicating anything', () => {
  test('SALES does all four over HTTP; each write is audited with no value in the log line; the accountant never becomes a user', async () => {
    const h = await bootFunnel();
    try {
      const db = h.made.app.db;
      const id = await h.runFunnel('Linked Records Limited');
      qualifyAndConvert(h.made.app, leadOf(h.made.app, id));
      const users = db.get<{ n: number }>('SELECT COUNT(*) AS n FROM users')?.n;
      const staff = await h.signIn('SALES');

      assert.match((await staff.req('/staff/organisations')).body, /Linked Records Limited/);
      // Phase 134: the organisation's address sends the reader to the one client page.
      assert.equal((await staff.req(`/staff/organisations/${id}`)).location, `/staff/clients/${id}`);
      assert.equal((await staff.req(`/staff/clients/${id}`)).status, 200);
      assert.equal((await staff.post(`/staff/organisations/${id}/contacts`, {
        full_name: 'Accountant Contact', contact_type: 'ACCOUNTANT', email: 'books@firm.example.invalid',
      })).status, 303);
      const added = await staff.post(`/staff/organisations/${id}/properties`, { label: 'Second site', postcode: 'zz9 8zz' });
      assert.equal(added.status, 303);
      const pid = /\/staff\/properties\/([A-Za-z0-9-]+)/.exec(added.location ?? '')?.[1] ?? '';
      const opened = await staff.post(`/staff/properties/${pid}/claims`, { workstream: 'STRUCTURES_AND_BUILDINGS' });
      assert.equal(opened.status, 303);
      const cid = /\/staff\/claims\/([A-Za-z0-9-]+)/.exec(opened.location ?? '')?.[1] ?? '';

      const page = await staff.req(`/staff/claims/${cid}`);
      assert.equal(page.status, 200);
      const ref = db.get<{ claim_ref: string }>('SELECT claim_ref FROM claims WHERE id = ?', [cid])?.claim_ref ?? 'missing';
      assert.ok(page.body.includes(ref));
      assert.match(page.body, /Linked Records Limited/);
      assert.match(page.body, /Second site/);
      assert.match(page.body, /Structures and buildings/);

      // Nothing was keyed twice: one organisation, its two properties, its two claims, its two contacts.
      assert.equal(db.get<{ n: number }>("SELECT COUNT(*) AS n FROM businesses WHERE name = 'Linked Records Limited'")?.n, 1);
      assert.equal(db.get<{ n: number }>('SELECT COUNT(*) AS n FROM properties WHERE business_id = ?', [id])?.n, 2);
      assert.equal(db.get<{ n: number }>('SELECT COUNT(*) AS n FROM claims WHERE business_id = ?', [id])?.n, 2);
      assert.equal(db.get<{ n: number }>('SELECT COUNT(*) AS n FROM contacts WHERE business_id = ?', [id])?.n, 2);
      assert.equal(db.get<{ postcode: string }>('SELECT postcode FROM properties WHERE id = ?', [pid])?.postcode, 'ZZ9 8ZZ');
      // A client's accountant is a contact, never a user.
      assert.equal(db.get<{ n: number }>('SELECT COUNT(*) AS n FROM users')?.n, users);

      const kinds = h.made.app.audit.entries().map((e) => e.kind);
      for (const k of ['CONTACT_CREATED', 'PROPERTY_CREATED', 'CLAIM_CREATED'] as const) assert.ok(kinds.includes(k), `${k} was not audited`);
      const logged = JSON.stringify(h.made.app.audit.entries().map((e) => e.detail));
      assert.equal(/Accountant Contact|books@|Second site/.test(logged), false, 'a value that was written reached a log line');
      assert.equal(h.made.app.audit.verify().intact, true);
    } finally { h.close(); }
  });
});
