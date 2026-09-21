/**
 * CRM 2 OF 10 — LEADS: NOT A SECOND INTAKE. 10 September 2026.
 *
 * THE PHASE'S OWN WORDS, AND WHERE EACH IS PROVED:
 *
 *   "Backfill from assessments and bookings"            → THE SEED (and migration 010 in test/pipeline.test.ts)
 *   "NO LEAD SCORE"                                      → NO SCORE AND NO PERSON
 *   "Each recorded YES, NO or UNKNOWN with who recorded it. UNKNOWN does not pass."
 *                                                        → THE ENQUIRY GATE, both N4 readings asserted
 *   "Converting creates or links the organisation, property and claim WITHOUT
 *    RE-KEYING anything the assessment captured"          → CONVERTING OPENS THE CLAIM
 *   "keep the claim_ref series"                          → the series test
 *   the refusal for every role                           → OVER HTTP (and test/pipeline.test.ts)
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { createApp } from '../src/server.ts';
import { seed } from '../src/seed.ts';
import * as L from '../src/web/leads.ts';
import * as P from '../src/web/pipeline.ts';
import { actor, testApp } from './helpers.ts';

const T0 = '2026-09-08T00:00:00.000Z';
const SCRIPT = '<script>alert(1)</script><img src=x onerror=alert(2)>';

type App = Awaited<ReturnType<typeof testApp>>;
type Made = Awaited<ReturnType<typeof createApp>>;

function deps(app: { db: App['db']; audit: App['audit']; now: () => string }): P.PipelineDeps {
  return { db: app.db, audit: app.audit, now: app.now, newId: randomUUID };
}

function staff(app: App): void {
  for (const role of ['ADMIN', 'SALES'] as const) {
    app.db.run(
      'INSERT INTO users (id,email,email_canonical,display_name,role,password_hash,created_at,updated_at,business_id) ' +
        'VALUES (?,?,?,?,?,?,?,?,NULL)',
      [`u-${role}`, `${role.toLowerCase()}@example.invalid`, `${role.toLowerCase()}@example.invalid`, `${role} Person`, role, 'x', T0, T0]);
  }
}

/** An organisation as the funnel leaves it: a business, a property, an assessment — and, optionally, its lead. */
function funnelOrganisation(app: App, name: string, withLead = true): { business: string; property: string; assessment: string; lead: string | null } {
  const business = randomUUID();
  app.db.run('INSERT INTO businesses (id,name,sector,stage,created_at,source) VALUES (?,?,?,?,?,?)',
    [business, name, 'care_homes', 'ASSESSMENT_SUBMITTED', T0, 'WEBSITE']);
  const property = randomUUID();
  app.db.run('INSERT INTO properties (id,business_id,label,created_at) VALUES (?,?,?,?)', [property, business, `${name} — main site`, T0]);
  const assessment = randomUUID();
  app.db.run('INSERT INTO assessments (id,business_id,sector,submitted_at,shown_low_pence,shown_high_pence,created_at) VALUES (?,?,?,?,?,?,?)',
    [assessment, business, 'care_homes', T0, 1_000_00, 2_000_00, T0]);
  const lead = withLead ? L.openLeadForSubmission(app.db, randomUUID, { business_id: business, assessment_id: assessment, at: T0 }) : null;
  return { business, property, assessment, lead };
}

function yes(app: App, lead_id: string, answers: Partial<Record<P.CheckKey, 'YES' | 'NO' | 'UNKNOWN'>> = {
  UK_HEALTHCARE_PROPERTY: 'YES', TRADING_CLIENT: 'YES', OWNER_OR_AUTHORISED: 'YES', NO_CLAIM_CONFLICT: 'YES',
}): void {
  for (const [check_key, answer] of Object.entries(answers)) {
    const r = P.recordEnquiryCheck(deps(app), actor('SALES'), { lead_id }, { check_key, answer, note: null });
    assert.equal(r.ok, true, r.ok ? '' : r.why);
  }
}

function qualify(app: App, lead_id: string): void {
  const r = L.updateLead(deps(app), actor('SALES'), lead_id, { status: 'QUALIFIED' });
  assert.equal(r.ok, true, r.ok ? '' : r.why);
}

/* ------------------------------------------------------------- HTTP helpers */

type Res = { status: number; location: string | null; body: string };
type Client = { req(path: string, init?: RequestInit): Promise<Res>; post(path: string, fields: Record<string, string>): Promise<Res> };

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

async function bootSeeded(): Promise<{ made: Made; close(): void; signIn(who: string): Promise<Client> }> {
  const made = await createApp(':memory:', { documentRoot: mkdtempSync(join(tmpdir(), 'cb-leads-')) });
  await new Promise<void>((r) => made.server.listen(0, '127.0.0.1', () => r()));
  const addr = made.server.address();
  const base = `http://127.0.0.1:${typeof addr === 'object' && addr !== null ? addr.port : 0}`;
  const s = await seed(made.app.db, made.app.hasher, made.app.now);
  return {
    made, close: made.close,
    async signIn(who) {
      const c = makeClient(base);
      const r = await c.post('/login', { email: `${who}@example.invalid`, password: s.password });
      assert.equal(r.status, 303, `${who} could not sign in`);
      return c;
    },
  };
}

/* ================================================================== *
 * THE SEED, AND WHAT A LEAD CARRIES
 * ================================================================== */

describe('leads are not a second intake', () => {
  test('the seed: every organisation’s lead derived — CONVERTED onto the claim its assessment holds — and one referral that has not converted', async () => {
    const app = await testApp();
    try {
      await seed(app.db, app.hasher, app.now);
      const leads = app.db.all<{ status: string; business_id: string | null; claim_assessment: string | null; assessment_id: string | null; origin: string; booking_id: string | null }>(
        'SELECT l.status, l.business_id, c.assessment_id AS claim_assessment, l.assessment_id, l.origin, l.booking_id ' +
          'FROM leads l LEFT JOIN claims c ON c.id = l.claim_id');
      assert.equal(leads.length, 7);
      const converted = leads.filter((l) => l.status === 'CONVERTED');
      assert.equal(converted.length, 6);
      for (const l of converted) {
        assert.equal(l.claim_assessment, l.assessment_id, 'a lead converted onto a claim that does not hold its assessment');
        assert.equal(l.origin, 'ASSESSMENT');
        assert.ok(l.booking_id, 'the seeded booking is not on its lead');
      }
      const referral = leads.find((l) => l.status !== 'CONVERTED');
      assert.equal(referral?.business_id, null, 'the referral should not have an organisation yet');
      assert.equal(referral?.origin, 'REFERRAL');
    } finally { app.close(); }
  });

  test('NO SCORE AND NO PERSON: the leads table has no score, no probability and no field for a person', async () => {
    const app = await testApp();
    try {
      const cols = app.db.all<{ name: string }>('PRAGMA table_info(leads)').map((c) => c.name);
      assert.ok(cols.includes('priority') && cols.includes('source') && cols.includes('introducer_id'));
      for (const c of cols) {
        assert.equal(/score|probab|full_name|contact|email|phone|person/i.test(c), false, `leads.${c}`);
      }
    } finally { app.close(); }
  });
});

/* ================================================================== *
 * THE ENQUIRY GATE
 * ================================================================== */

describe('the enquiry gate — UNKNOWN and never-asked are the same answer, and neither passes', () => {
  test('on the seeded referral: ownership recorded NOT KNOWN and claim conflict never asked read identically, and the lead cannot be qualified', async () => {
    const app = await testApp();
    try {
      await seed(app.db, app.hasher, app.now);
      const referral = app.db.get<{ id: string }>("SELECT id FROM leads WHERE origin = 'REFERRAL'");
      assert.ok(referral);
      const gate = P.enquiryGate(app.db, { lead_id: referral.id });
      const owner = gate.checks.find((c) => c.key === 'OWNER_OR_AUTHORISED');
      const conflict = gate.checks.find((c) => c.key === 'NO_CLAIM_CONFLICT');
      assert.ok(owner && conflict);
      assert.equal(owner.recorded?.answer_given, 'UNKNOWN', 'the seed no longer records a NOT KNOWN');
      assert.equal(conflict.recorded, null, 'the seed no longer leaves a check unasked');
      assert.deepEqual({ a: owner.answer, p: owner.passes, r: owner.reading }, { a: conflict.answer, p: conflict.passes, r: conflict.reading });
      assert.equal(owner.passes, false, 'not known became a pass');
      assert.equal(conflict.passes, false, 'never asked became a pass');
      assert.equal(gate.open, false);

      const sales = app.db.get<{ id: string }>("SELECT id FROM users WHERE role = 'SALES'");
      assert.ok(sales);
      const r = L.updateLead(deps(app), actor('SALES', sales.id), referral.id, { status: 'QUALIFIED' });
      assert.equal(r.ok, false);
      assert.match(r.ok ? '' : r.why, /owner/);
      assert.match(r.ok ? '' : r.why, /claim conflict/);
    } finally { app.close(); }
  });

  test('a NO refuses; an answer is required and NOT KNOWN is one; the checks are append-only and the latest counts; four YES qualify', async () => {
    const app = await testApp();
    try {
      staff(app);
      const o = funnelOrganisation(app, 'Gate Limited');
      assert.ok(o.lead);
      assert.equal(P.recordEnquiryCheck(deps(app), actor('SALES'), { lead_id: o.lead }, { check_key: 'TRADING_CLIENT', answer: null, note: null }).ok, false,
        'a check was recorded with no answer');
      yes(app, o.lead, { UK_HEALTHCARE_PROPERTY: 'YES', TRADING_CLIENT: 'NO', OWNER_OR_AUTHORISED: 'YES', NO_CLAIM_CONFLICT: 'UNKNOWN' });
      assert.equal(L.updateLead(deps(app), actor('SALES'), o.lead, { status: 'QUALIFIED' }).ok, false, 'a NO qualified');
      yes(app, o.lead, { TRADING_CLIENT: 'YES', NO_CLAIM_CONFLICT: 'YES' });
      assert.equal(app.db.get<{ n: number }>('SELECT COUNT(*) AS n FROM enquiry_checks WHERE lead_id = ?', [o.lead])?.n, 6, 'an earlier answer was not kept');
      assert.throws(() => app.db.run("UPDATE enquiry_checks SET answer = 'YES'"), /append-only/);
      assert.throws(() => app.db.run('DELETE FROM enquiry_checks'), /append-only/);
      qualify(app, o.lead);
      const who = app.audit.entries().filter((e) => e.kind === 'ENQUIRY_CHECK_RECORDED').map((e) => e.actor_id);
      assert.ok(who.length === 6 && who.every((x) => x === 'u-SALES'), 'who recorded a check is not in the audit');
    } finally { app.close(); }
  });
});

/* ================================================================== *
 * CONVERTING OPENS THE CLAIM
 * ================================================================== */

describe('converting a qualified lead opens the claim — without re-keying anything', () => {
  test('only a qualified lead converts, and the gate is asked again at the write', async () => {
    const app = await testApp();
    try {
      staff(app);
      const o = funnelOrganisation(app, 'Asked Again Limited');
      assert.ok(o.lead);
      assert.equal(L.convertLead(deps(app), actor('SALES'), o.lead, {}).ok, false, 'a NEW lead converted');
      yes(app, o.lead);
      qualify(app, o.lead);
      // After qualifying, somebody records that the ownership is not known after all.
      yes(app, o.lead, { OWNER_OR_AUTHORISED: 'UNKNOWN' });
      const refused = L.convertLead(deps(app), actor('SALES'), o.lead, {});
      assert.equal(refused.ok, false, 'a qualified status stood in for the gate');
      assert.equal(app.db.get<{ n: number }>('SELECT COUNT(*) AS n FROM claims')?.n, 0);
      yes(app, o.lead, { OWNER_OR_AUTHORISED: 'YES' });
      const c = L.convertLead(deps(app), actor('SALES'), o.lead, {});
      assert.ok(c.ok, c.ok ? '' : c.why);
      const claim = app.db.get<{ business_id: string; property_id: string; assessment_id: string; stage: string; claim_ref: string }>(
        'SELECT business_id, property_id, assessment_id, stage, claim_ref FROM claims WHERE id = ?', [c.id]);
      assert.deepEqual({ ...claim, claim_ref: undefined }, {
        business_id: o.business, property_id: o.property, assessment_id: o.assessment, stage: 'ASSESSMENT', claim_ref: undefined,
      });
      assert.equal(claim?.claim_ref, 'CR-2026-0001', 'the claim reference series did not start where it should');
      const lead = app.db.get<{ status: string; claim_id: string; converted_at: string | null }>(
        'SELECT status, claim_id, converted_at FROM leads WHERE id = ?', [o.lead]);
      assert.equal(lead?.status, 'CONVERTED');
      assert.equal(lead?.claim_id, c.id);
      assert.ok(lead?.converted_at);
      assert.equal(app.db.get<{ n: number }>('SELECT COUNT(*) AS n FROM businesses')?.n, 1, 'converting re-keyed the organisation');
      assert.equal(app.db.get<{ n: number }>("SELECT COUNT(*) AS n FROM claim_stage_moves WHERE claim_id = ? AND kind = 'OPENED'", [c.id])?.n, 1);

      // The series continues through a second conversion; nothing hands back a number.
      const o2 = funnelOrganisation(app, 'Second Limited');
      assert.ok(o2.lead);
      yes(app, o2.lead);
      qualify(app, o2.lead);
      const c2 = L.convertLead(deps(app), actor('SALES'), o2.lead, {});
      assert.ok(c2.ok);
      assert.equal(app.db.get<{ r: string }>('SELECT claim_ref AS r FROM claims WHERE id = ?', [c2.id])?.r, 'CR-2026-0002');
    } finally { app.close(); }
  });

  test('a referral with no organisation converts only when linked to one — and takes that organisation’s assessment unless another lead holds it', async () => {
    const app = await testApp();
    try {
      staff(app);
      const made = L.createLead(deps(app), actor('SALES'), { prospect_organisation: 'Referred Care Limited', prospect_sector: 'care_homes', source: 'ACCOUNTANT' });
      assert.ok(made.ok, made.ok ? '' : made.why);
      assert.equal(app.db.get<{ o: string }>('SELECT origin AS o FROM leads WHERE id = ?', [made.id])?.o, 'REFERRAL');
      yes(app, made.id);
      qualify(app, made.id);
      const unlinked = L.convertLead(deps(app), actor('SALES'), made.id, {});
      assert.equal(unlinked.ok, false);
      assert.match(unlinked.ok ? '' : unlinked.why, /created by the assessment/);

      const held = funnelOrganisation(app, 'Held Limited', true);
      const dup = L.convertLead(deps(app), actor('SALES'), made.id, { business_id: held.business });
      assert.equal(dup.ok, false, 'a second lead took an assessment another lead holds');
      assert.match(dup.ok ? '' : dup.why, /already a lead/);

      const free = funnelOrganisation(app, 'Referred Care Limited', false);
      const c = L.convertLead(deps(app), actor('SALES'), made.id, { business_id: free.business });
      assert.ok(c.ok, c.ok ? '' : c.why);
      const lead = app.db.get<{ business_id: string; assessment_id: string; prospect_organisation: string | null }>(
        'SELECT business_id, assessment_id, prospect_organisation FROM leads WHERE id = ?', [made.id]);
      assert.deepEqual({ ...lead }, { business_id: free.business, assessment_id: free.assessment, prospect_organisation: null });
      assert.equal(app.db.get<{ a: string }>('SELECT assessment_id AS a FROM claims WHERE id = ?', [c.id])?.a, free.assessment);
    } finally { app.close(); }
  });

  test('a converted lead is final, and a lead is never deleted; a lost lead carries a listed reason', async () => {
    const app = await testApp();
    try {
      staff(app);
      const o = funnelOrganisation(app, 'Final Limited');
      assert.ok(o.lead);
      yes(app, o.lead);
      qualify(app, o.lead);
      assert.ok(L.convertLead(deps(app), actor('ADMIN'), o.lead, {}).ok);
      assert.throws(() => app.db.run("UPDATE leads SET status = 'LOST', lost_reason = 'OTHER', converted_at = NULL, claim_id = NULL WHERE id = ?", [o.lead]), /converted lead/);
      assert.throws(() => app.db.run('UPDATE leads SET claim_id = NULL WHERE id = ?', [o.lead]));
      assert.throws(() => app.db.run('DELETE FROM leads'), /never deleted/);
      assert.equal(L.updateLead(deps(app), actor('SALES'), o.lead, { next_action: 'call them' }).ok, false, 'a converted lead was edited');

      const lost = funnelOrganisation(app, 'Lost Limited');
      assert.ok(lost.lead);
      const up = (f: Record<string, string | null>) => L.updateLead(deps(app), actor('SALES'), lost.lead ?? '', f);
      assert.equal(up({ status: 'LOST' }).ok, false, 'lost with no reason');
      assert.equal(up({ status: 'LOST', lost_reason: 'NOT_ON_THE_LIST' }).ok, false, 'an unlisted reason');
      assert.equal(up({ status: 'LOST', lost_reason: 'OTHER' }).ok, false, '“another reason” with nothing written');
      assert.equal(up({ status: 'CONVERTED' }).ok, false, 'CONVERTED set by hand');
      assert.throws(() => app.db.run("UPDATE leads SET status = 'LOST', lost_reason = 'MADE_UP' WHERE id = ?", [lost.lead]), /lead lost list/);
      assert.equal(up({ status: 'LOST', lost_reason: 'CHOSE_NOT_TO_PROCEED' }).ok, true);
      const e = app.audit.entries().find((x) => x.kind === 'LEAD_UPDATED' && x.object_id === lost.lead);
      assert.equal(e?.detail['status'], 'LOST');
    } finally { app.close(); }
  });
});

/* ================================================================== *
 * OVER HTTP
 * ================================================================== */

describe('leads over HTTP, on the seed', () => {
  test('SALES works a lead end to end — records the checks, qualifies, converts — and lands on the claim it opened', async () => {
    const h = await bootSeeded();
    try {
      const db = h.made.app.db;
      const org = db.get<{ id: string }>("SELECT id FROM businesses WHERE name = 'Aldergate Care Group Limited'");
      assert.ok(org);
      const sales = await h.signIn('sales');
      const made = await sales.post('/staff/leads', { business_id: org.id, source: 'EXISTING_CLIENT', next_action: 'Ask about the second home' });
      assert.equal(made.status, 303);
      const id = /\/staff\/leads\/([A-Za-z0-9-]+)/.exec(made.location ?? '')?.[1] ?? '';
      for (const check_key of Object.keys(P.ENQUIRY_CHECKS)) {
        assert.equal((await sales.post(`/staff/leads/${id}/checks`, { check_key, answer: 'YES' })).status, 303);
      }
      assert.equal((await sales.post(`/staff/leads/${id}`, { status: 'QUALIFIED' })).status, 303);
      const converted = await sales.post(`/staff/leads/${id}/convert`, {});
      assert.equal(converted.status, 303, converted.body);
      const claim = /\/staff\/claims\/([A-Za-z0-9-]+)/.exec(converted.location ?? '')?.[1] ?? '';
      const page = await sales.req(`/staff/claims/${claim}`);
      assert.equal(page.status, 200);
      assert.match(page.body, /Stage and next move/); // Phase 133c renamed the panel, and Phase 138 made it a section; the ten stages are the stage bar's
      // A second claim for an existing client carries no assessment: the estimate belongs to the first.
      assert.equal(db.get<{ a: string | null }>('SELECT assessment_id AS a FROM claims WHERE id = ?', [claim])?.a, null);
      assert.equal(db.get<{ s: string }>('SELECT stage AS s FROM claims WHERE id = ?', [claim])?.s, 'ASSESSMENT');
    } finally { h.close(); }
  });

  test('STORED CROSS-SITE SCRIPTING: a referral’s organisation name, a lead’s next action and a claim’s hold reason are escaped', async () => {
    const h = await bootSeeded();
    try {
      const sales = await h.signIn('sales');
      const made = await sales.post('/staff/leads', { prospect_organisation: SCRIPT, source: 'REFERRAL', next_action: SCRIPT });
      assert.equal(made.status, 303);
      const id = /\/staff\/leads\/([A-Za-z0-9-]+)/.exec(made.location ?? '')?.[1] ?? '';
      const claim = h.made.app.db.get<{ id: string }>("SELECT id FROM claims WHERE stage = 'SURVEY' LIMIT 1");
      assert.ok(claim);
      assert.equal((await sales.post(`/staff/claims/${claim.id}/stage`, { kind: 'HOLD', reason: SCRIPT })).status, 303);
      for (const path of ['/staff/leads', `/staff/leads/${id}`, `/staff/claims/${claim.id}`, '/staff/pipeline']) {
        const page = await sales.req(path);
        assert.equal(page.status, 200, path);
        assert.equal(page.body.includes('<script>alert(1)</script>'), false, `a script tag reached ${path}`);
        assert.equal(/<img[\s>]/i.test(page.body), false, `an unescaped img tag reached ${path}`);
        assert.match(page.body, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/, `the value was not rendered at all on ${path}`);
      }
    } finally { h.close(); }
  });
});
