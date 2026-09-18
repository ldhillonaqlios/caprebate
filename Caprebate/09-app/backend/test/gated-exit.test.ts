/**
 * THE GATED EXIT — the funnel's only gate, and the call it offers.
 *
 * WRITTEN AS TWO REPRODUCTIONS BEFORE EITHER FAULT WAS REPAIRED, 11 September
 * 2026, and run red first. CRM 2 of 10 found both while re-deriving the premise
 * that a gated exit is already a lead:
 *
 *   1. `CB_FRONTDOOR.gateQ1b` returns `{ gated: true }` for a business with no UK
 *      tax bill. The renderer read a field called `stop`, which the engine has
 *      never returned — and the hand-written declaration beside the generated
 *      package named `stop` too, so the compiler agreed with the mistake. The
 *      gate never fired: "no" at Q1b went on to Q1c and, in the end, a figure.
 *      Red before: nextScreen returned 'Q1c'; the POST redirected to Q1c.
 *
 *   2. The reasoned negative offers a call. The close took the sector from the
 *      first property, a prospect stopped at Q1b has none, and the POST answered
 *      500 — the lead a reasoned negative exists to keep was lost, and nothing
 *      was written. Red before: status 500.
 *
 * N4 IS ASSERTED BOTH WAYS, ON PURPOSE. The engine reversed itself on 3 September
 * 2026: "not sure" CONTINUES, with the condition printed on the figure. A suite
 * that tests only the "not sure" string leaves never-asked uncovered, so every
 * assertion below that reads one reads the other.
 *
 * THE DECISION THE THIRD PART TESTS is row E22 of the CRM disposition table: a
 * contact and a booking may BELONG TO A LEAD until the lead has an organisation.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { createApp } from '../src/server.ts';
import { seed } from '../src/seed.ts';
import { BOOKING, FRONTDOOR, FUNNEL } from '../src/web/engine.ts';
import { nextScreen, type FunnelState } from '../src/web/assessment.ts';
import { isBookable } from '../src/web/schedule.ts';
import * as L from '../src/web/leads.ts';
import * as P from '../src/web/pipeline.ts';
import { actor, testApp } from './helpers.ts';

/* ------------------------------------------------------------- fixtures */

const T0 = '2026-09-08T00:00:00.000Z';

type Res = { status: number; location: string | null; body: string };
type Client = { req(path: string, init?: RequestInit): Promise<Res>; post(path: string, fields: Record<string, string>): Promise<Res> };
type Made = Awaited<ReturnType<typeof createApp>>;
type AppDb = Made['app']['db'];

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

async function boot(withSeed = false): Promise<{ made: Made; client(): Client; signIn(who: string): Promise<Client>; close(): void }> {
  const made = await createApp(':memory:', { documentRoot: mkdtempSync(join(tmpdir(), 'cb-gated-')) });
  await new Promise<void>((r) => made.server.listen(0, '127.0.0.1', () => r()));
  const addr = made.server.address();
  const base = `http://127.0.0.1:${typeof addr === 'object' && addr !== null ? addr.port : 0}`;
  const password = withSeed ? (await seed(made.app.db, made.app.hasher, made.app.now)).password : '';
  return {
    made, client: () => makeClient(base), close: made.close,
    async signIn(who) {
      const c = makeClient(base);
      const r = await c.post('/login', { email: `${who}@example.invalid`, password });
      assert.equal(r.status, 303, `${who} could not sign in`);
      return c;
    },
  };
}

/** A state holding one Q1b answer — or, for `undefined`, a state that was never asked. */
function stateWith(v: string | undefined): FunnelState {
  const s = { ...FUNNEL.blankState() } as Record<string, unknown>;
  if (v === undefined) delete s['is_uk_taxpayer'];
  else s['is_uk_taxpayer'] = v;
  return s as unknown as FunnelState;
}

async function toQ1b(c: Client): Promise<void> {
  assert.equal((await c.req('/assessment')).location, '/assessment/Q1');
  assert.equal((await c.post('/assessment/Q1', { own_prior_claim: 'no' })).location, '/assessment/Q1a');
  assert.equal((await c.post('/assessment/Q1a', { previous_owner_claimed: 'dont_know' })).location, '/assessment/Q1b');
}

async function stoppedAtQ1b(c: Client): Promise<void> {
  await toQ1b(c);
  assert.equal((await c.post('/assessment/Q1b', { is_uk_taxpayer: 'no' })).location, '/assessment/no-claim');
}

const NO_TAX_MESSAGE = String(FRONTDOOR.gateQ1b(stateWith('no')).message);
const CONDITION = String(FRONTDOOR.gateQ1b(stateWith('not sure')).condition);

/** Each count is a literal statement: no SQL is assembled, even in a test (npm run lint:sql). */
const COUNTS = {
  businesses: 'SELECT COUNT(*) AS n FROM businesses',
  assessments: 'SELECT COUNT(*) AS n FROM assessments',
  leads: 'SELECT COUNT(*) AS n FROM leads',
  contacts: 'SELECT COUNT(*) AS n FROM contacts',
  bookings: 'SELECT COUNT(*) AS n FROM bookings',
} as const;

function count(db: AppDb, table: keyof typeof COUNTS): number {
  return db.get<{ n: number }>(COUNTS[table])?.n ?? -1;
}

/* ================================================================== *
 * 1 · THE GATE STOPS — READING THE ENGINE'S OWN FIELD
 * ================================================================== */

describe('the funnel’s only gate stops, and reads the engine’s own field', () => {
  test('"no" and "charity" reach the reasoned negative; "not sure" and never-asked do not, and read identically (N4, both)', () => {
    for (const v of ['no', 'charity']) {
      assert.equal(FRONTDOOR.gateQ1b(stateWith(v)).gated, true, `the engine gates ${v}`);
      assert.equal(nextScreen(stateWith(v), 'Q1b'), 'gated_exit', `the renderer stops ${v}`);
    }
    const unsure = FRONTDOOR.gateQ1b(stateWith('not sure'));
    const never = FRONTDOOR.gateQ1b(stateWith(undefined));
    assert.deepEqual(unsure, never, 'not sure and never-asked are the same reading');
    assert.equal(unsure.gated, false);
    assert.equal(nextScreen(stateWith('not sure'), 'Q1b'), 'Q1c');
    assert.equal(nextScreen(stateWith(undefined), 'Q1b'), 'Q1c');
    assert.equal(nextScreen(stateWith('yes'), 'Q1b'), 'Q1c');
  });

  test('over HTTP: "no" at Q1b lands on the reasoned negative, the page names the gate in words, and neither a figure nor a later screen can be reached past it', async () => {
    const h = await boot();
    try {
      const c = h.client();
      await stoppedAtQ1b(c);

      const page = await c.req('/assessment/no-claim');
      assert.equal(page.status, 200);
      assert.ok(page.body.includes(NO_TAX_MESSAGE), 'the screen names the gate that fired, in the engine’s words');

      for (const path of ['/assessment/figure', '/assessment/Q1c', '/assessment/Q2', '/assessment/Q3']) {
        const r = await c.req(path);
        assert.equal(r.location, '/assessment/no-claim', `${path} is not reachable past the gate`);
        assert.equal(/You could be entitled/.test(r.body), false, `${path} produced a figure`);
      }
      assert.equal((await c.post('/assessment/Q2', { p0_sector: 'care_homes' })).location, '/assessment/no-claim',
        'a POST past the gate is refused before anything is applied');

      // A reasoned negative is not a trap: the client can correct the answer.
      assert.equal((await c.post('/assessment/Q1b', { is_uk_taxpayer: 'yes', current_year_position: 'profitable' })).location, '/assessment/Q1c');
      assert.notEqual((await c.req('/assessment/no-claim')).status, 200, 'the reasoned negative is not drawn for a draft the gate does not stop');
    } finally { h.close(); }
  });

  test('over HTTP, N4 both ways: "not sure" and an absent answer go on to a figure that prints the condition, and never see the reasoned negative', async () => {
    const h = await boot();
    try {
      const entity = Object.keys(FUNNEL.ENTITY_LABEL)[0] ?? '';
      for (const answer of [{ is_uk_taxpayer: 'not sure' }, {}] as Record<string, string>[]) {
        const what = Object.keys(answer).length === 0 ? 'absent' : 'not sure';
        const c = h.client();
        await toQ1b(c);
        assert.equal((await c.post('/assessment/Q1b', answer)).location, '/assessment/Q1c', `${what} continues`);
        assert.notEqual((await c.req('/assessment/no-claim')).status, 200, `${what} is not shown the reasoned negative`);
        assert.equal((await c.post('/assessment/Q1c', { trigger_default: 'purchase' })).location, '/assessment/Q2');
        assert.equal((await c.post('/assessment/Q2', {
          p0_address: '1 Example Street', p0_sector: 'care_homes', p0_entity_type: entity, p0_spend: '750000', p0_date: '2024-05',
        })).location, '/assessment/Q3');
        assert.equal((await c.post('/assessment/Q3', { p0_works: 'no' })).location, '/assessment/figure');
        const figure = await c.req('/assessment/figure');
        assert.equal(figure.status, 200);
        assert.ok(figure.body.includes(CONDITION), `${what}: the figure carries the condition on its face`);
      }
    } finally { h.close(); }
  });
});

/* ================================================================== *
 * 2 · THE CALL FROM THE REASONED NEGATIVE IS KEPT
 * ================================================================== */

describe('the call a reasoned negative offers is kept', () => {
  test('REPRODUCTION — POST /assessment/close with no property answers 200, not 500, and the call is written', async () => {
    const h = await boot();
    try {
      const db = h.made.app.db;
      const c = h.client();
      await toQ1b(c);
      await c.post('/assessment/Q1b', { is_uk_taxpayer: 'no' });
      const before = count(db, 'leads');
      const sent = await c.post('/assessment/close', {
        full_name: 'Pat Example', channel: 'email', contact_value: 'pat@example.invalid', contact_consent: 'on',
      });
      assert.equal(sent.status, 200, 'the close from the reasoned negative answered with a server error');
      assert.equal(count(db, 'leads'), before + 1, 'and the call it asked for was written nowhere');
    } finally { h.close(); }
  });

  test('the close at a gated exit writes a GATED_EXIT lead with no organisation, and the person and the call belong to it — and nothing claims a figure', async () => {
    const h = await boot();
    try {
      const db = h.made.app.db;
      const c = h.client();
      await stoppedAtQ1b(c);

      const form = await c.req('/assessment/close');
      assert.equal(form.status, 200);
      const gated = BOOKING.offerAt('gated_exit') as { heading: string };
      const close = BOOKING.offerAt('funnel_close') as { body: string };
      assert.ok(form.body.includes(gated.heading), 'the close speaks as the gated exit’s offer');
      assert.equal(form.body.includes(close.body), false, 'the close does not refer to a figure the prospect was never shown');

      const before = {
        businesses: count(db, 'businesses'), assessments: count(db, 'assessments'),
        leads: count(db, 'leads'), contacts: count(db, 'contacts'), bookings: count(db, 'bookings'),
      };
      const sent = await c.post('/assessment/close', {
        full_name: 'Pat Example', business_name: 'Example Dental Limited', job_role: FUNNEL.ROLES[0]?.[0] ?? '',
        channel: 'email', contact_value: 'pat@example.invalid', contact_consent: 'on',
      });
      assert.equal(sent.status, 200);

      assert.equal(count(db, 'businesses'), before.businesses, 'no organisation: there is no sector to give one');
      assert.equal(count(db, 'assessments'), before.assessments, 'no assessment: no figure was produced');
      assert.equal(count(db, 'leads'), before.leads + 1);
      assert.equal(count(db, 'contacts'), before.contacts + 1);
      assert.equal(count(db, 'bookings'), before.bookings + 1);

      const lead = db.get<Record<string, unknown> & { id: string }>(
        "SELECT id, origin, source, status, business_id, assessment_id, booking_id, claim_id, prospect_organisation, prospect_sector FROM leads WHERE origin = 'GATED_EXIT'");
      assert.ok(lead);
      const { id: leadId, ...rest } = lead;
      assert.deepEqual({ ...rest }, {
        origin: 'GATED_EXIT', source: 'WEBSITE', status: 'NEW', business_id: null, assessment_id: null, booking_id: null,
        claim_id: null, prospect_organisation: 'Example Dental Limited', prospect_sector: null,
      });

      const person = db.get<Record<string, unknown>>(
        'SELECT business_id, lead_id, full_name, job_role, contact_consent, marketing_optin, email, phone FROM contacts WHERE lead_id = ?', [leadId]);
      assert.deepEqual({ ...person }, {
        business_id: null, lead_id: leadId, full_name: 'Pat Example', job_role: FUNNEL.ROLES[0]?.[0] ?? null,
        contact_consent: 1, marketing_optin: 0, email: 'pat@example.invalid', phone: null,
      });
      const call = db.get<Record<string, unknown>>(
        'SELECT business_id, lead_id, channel, entry_point, starts_at FROM bookings WHERE lead_id = ?', [leadId]);
      assert.deepEqual({ ...call }, { business_id: null, lead_id: leadId, channel: 'email', entry_point: 'gated_exit', starts_at: null });

      const line = db.get<{ detail: string }>("SELECT detail FROM audit_log WHERE kind = 'LEAD_CREATED' AND object_id = ?", [leadId]);
      assert.ok(line);
      assert.deepEqual(JSON.parse(line.detail), { business: null, origin: 'GATED_EXIT', route: 'gated_exit' });
      assert.equal(/Pat|example\.invalid|Dental/.test(line.detail), false, 'the audit line carries ids only');

      assert.equal(/range you were shown/i.test(sent.body), false, 'the thank-you prints no range the prospect was never shown');
      assert.equal(/£/.test(sent.body), false);
      assert.equal(/assessment has been recorded/i.test(sent.body), false, 'no assessment was recorded, so the page does not say one was');

      assert.equal((await c.req('/assessment/close')).location, '/assessment', 'a closed gated exit is finished: replaying it writes nothing');
      assert.equal(count(db, 'leads'), before.leads + 1);
    } finally { h.close(); }
  });

  test('a gated-exit close with no name, no channel or no consent is refused with the form, and writes nothing', async () => {
    const h = await boot();
    try {
      const db = h.made.app.db;
      const c = h.client();
      await stoppedAtQ1b(c);
      const before = { leads: count(db, 'leads'), contacts: count(db, 'contacts'), bookings: count(db, 'bookings') };
      for (const fields of [
        { channel: 'email', contact_consent: 'on' },
        { full_name: 'Pat Example', contact_consent: 'on' },
        { full_name: 'Pat Example', channel: 'email' },
      ] as Record<string, string>[]) {
        const r = await c.post('/assessment/close', fields);
        assert.equal(r.status, 400);
      }
      assert.deepEqual({ leads: count(db, 'leads'), contacts: count(db, 'contacts'), bookings: count(db, 'bookings') }, before);
    } finally { h.close(); }
  });
});

/* ================================================================== *
 * 3 · THE PERSON AND THE CALL BELONG TO THE LEAD UNTIL IT HAS AN ORGANISATION
 * ================================================================== */

describe('a contact and a booking may belong to a lead until it has an organisation (row E22)', () => {
  test('over HTTP on the seed: a telephone call asked for at the reasoned negative holds its slot where the clash check looks, is in the calendar, and its lead shows who asked — to SALES, and not to SURVEYING', async () => {
    const h = await boot(true);
    try {
      const db = h.made.app.db;
      const c = h.client();
      await stoppedAtQ1b(c);
      const form = await c.req('/assessment/close');
      const slot = /name="slot" value="(\d{4}-[^"]+)"/.exec(form.body)?.[1];
      assert.ok(slot, 'the seed’s working times offer a slot at the gated exit’s close');

      const sent = await c.post('/assessment/close', {
        full_name: 'Robin Example', business_name: 'Example Care Limited', channel: 'phone',
        contact_value: '01632 960123', contact_consent: 'on', slot,
      });
      assert.equal(sent.status, 200);
      assert.match(sent.body, /We have held/);

      const lead = db.get<{ id: string }>("SELECT id FROM leads WHERE origin = 'GATED_EXIT' AND prospect_organisation = 'Example Care Limited'");
      assert.ok(lead);
      const call = db.get<{ id: string; business_id: string | null; starts_at: string | null; assigned_to: string | null }>(
        'SELECT id, business_id, starts_at, assigned_to FROM bookings WHERE lead_id = ?', [lead.id]);
      assert.ok(call);
      assert.equal(call.business_id, null);
      assert.equal(call.starts_at, slot);
      assert.ok(call.assigned_to !== null);
      const again = isBookable(db, slot, { forUser: call.assigned_to, now: h.made.app.now() });
      assert.equal(again.ok, false, 'the moment is held: the same person cannot be booked into it twice');
      assert.equal(db.get<{ phone: string | null }>('SELECT phone FROM contacts WHERE lead_id = ?', [lead.id])?.phone, '01632 960123');

      const sales = await h.signIn('sales');
      const week = await sales.req(`/staff/calendar?view=week&date=${slot.slice(0, 10)}`);
      assert.equal(week.status, 200);
      assert.ok(week.body.includes('Example Care Limited — a lead, no organisation yet'), 'the call is in the calendar, not lost behind an inner join');
      const booking = await sales.req(`/staff/calendar/${call.id}`);
      assert.equal(booking.status, 200);
      assert.ok(booking.body.includes(`/staff/leads/${lead.id}`), 'the booking leads to its lead');
      const leadPage = await sales.req(`/staff/leads/${lead.id}`);
      assert.equal(leadPage.status, 200);
      assert.ok(leadPage.body.includes('Robin Example') && leadPage.body.includes('01632 960123'), 'SALES sees who asked, and how to reach them');

      const surveying = await h.signIn('surveying');
      const refused = await surveying.req(`/staff/leads/${lead.id}`);
      assert.notEqual(refused.status, 200);
      assert.equal(refused.body.includes('Robin Example'), false);
    } finally { h.close(); }
  });

  test('converting the lead once an organisation exists moves THE SAME contact and booking onto it — nothing copied, nothing re-keyed', async () => {
    const app = await testApp();
    const d: P.PipelineDeps = { db: app.db, audit: app.audit, now: app.now, newId: randomUUID };
    for (const role of ['ADMIN', 'SALES'] as const) {
      app.db.run(
        'INSERT INTO users (id,email,email_canonical,display_name,role,password_hash,created_at,updated_at,business_id) VALUES (?,?,?,?,?,?,?,?,NULL)',
        [`u-${role}`, `${role.toLowerCase()}@example.invalid`, `${role.toLowerCase()}@example.invalid`, `${role} Person`, role, 'x', T0, T0]);
    }
    const lead = L.openLeadForGatedExit(app.db, randomUUID, { prospect_organisation: 'Example Care Limited', at: T0 });
    const contact = randomUUID();
    app.db.run('INSERT INTO contacts (id, business_id, lead_id, full_name, contact_consent, marketing_optin, email, created_at) VALUES (?, NULL, ?, ?, 1, 0, ?, ?)',
      [contact, lead, 'Robin Example', 'robin@example.invalid', T0]);
    const booking = randomUUID();
    app.db.run("INSERT INTO bookings (id, business_id, lead_id, channel, entry_point, created_at) VALUES (?, NULL, ?, 'email', 'gated_exit', ?)",
      [booking, lead, T0]);

    // Later the prospect took the assessment, and it created their organisation.
    const org = randomUUID();
    app.db.run('INSERT INTO businesses (id,name,sector,stage,created_at,source) VALUES (?,?,?,?,?,?)',
      [org, 'Example Care Limited', 'care_homes', 'ASSESSMENT_SUBMITTED', T0, 'WEBSITE']);
    app.db.run('INSERT INTO properties (id,business_id,label,created_at) VALUES (?,?,?,?)', [randomUUID(), org, 'Example Care — main site', T0]);
    app.db.run('INSERT INTO assessments (id,business_id,sector,submitted_at,shown_low_pence,shown_high_pence,created_at) VALUES (?,?,?,?,?,?,?)',
      [randomUUID(), org, 'care_homes', T0, 1_000_00, 2_000_00, T0]);

    for (const check_key of Object.keys(P.ENQUIRY_CHECKS)) {
      const r = P.recordEnquiryCheck(d, actor('SALES'), { lead_id: lead }, { check_key, answer: 'YES', note: null });
      assert.equal(r.ok, true, r.ok ? '' : r.why);
    }
    const q = L.updateLead(d, actor('SALES'), lead, { status: 'QUALIFIED' });
    assert.equal(q.ok, true, q.ok ? '' : q.why);
    const before = { contacts: count(app.db, 'contacts'), bookings: count(app.db, 'bookings') };
    const converted = L.convertLead(d, actor('SALES'), lead, { business_id: org });
    assert.equal(converted.ok, true, converted.ok ? '' : converted.why);

    assert.deepEqual({ contacts: count(app.db, 'contacts'), bookings: count(app.db, 'bookings') }, before, 'no row was copied');
    assert.deepEqual({ ...app.db.get('SELECT business_id, lead_id FROM contacts WHERE id = ?', [contact]) }, { business_id: org, lead_id: lead });
    assert.deepEqual({ ...app.db.get('SELECT business_id, lead_id FROM bookings WHERE id = ?', [booking]) }, { business_id: org, lead_id: lead });
    assert.deepEqual({ ...app.db.get('SELECT status, business_id, booking_id FROM leads WHERE id = ?', [lead]) },
      { status: 'CONVERTED', business_id: org, booking_id: booking });

    // And once the lead has an organisation, its rows cannot be pointed at another.
    const other = randomUUID();
    app.db.run('INSERT INTO businesses (id,name,sector,stage,created_at,source) VALUES (?,?,?,?,?,?)',
      [other, 'Somebody Else Limited', 'dental', 'ASSESSMENT_SUBMITTED', T0, 'WEBSITE']);
    assert.throws(() => app.db.run('UPDATE contacts SET business_id = ? WHERE id = ?', [other, contact]), /own organisation/);
    assert.throws(() => app.db.run('UPDATE bookings SET business_id = ? WHERE id = ?', [other, booking]), /own organisation/);
  });

  test('the rebuilt tables: a row needs an organisation or a lead, every index and trigger survived, and the DO_NOT_CONTACT control still refuses through a contact’s address', async () => {
    const app = await testApp();
    const db = app.db;
    assert.throws(() => db.run("INSERT INTO contacts (id, full_name, contact_consent, marketing_optin, created_at) VALUES ('c-none', 'Nobody', 1, 0, ?)", [T0]), /CHECK constraint/);
    assert.throws(() => db.run("INSERT INTO bookings (id, channel, entry_point, created_at) VALUES ('k-none', 'email', 'gated_exit', ?)", [T0]), /CHECK constraint/);

    const names = db.all<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE tbl_name IN ('contacts','bookings') AND name NOT LIKE 'sqlite_autoindex%' AND type IN ('index','trigger') ORDER BY name")
      .map((r) => r.name);
    assert.deepEqual(names, [
      'bookings_business_idx',
      // Phase 132e (migration 025): a client may cancel their own call, and a cancellation is final on its row.
      'bookings_cancel_is_final', 'bookings_cancel_names_who_and_when', 'bookings_cancel_not_on_insert',
      'bookings_id_business_uq', 'bookings_lead_idx',
      'bookings_lead_same_organisation_insert', 'bookings_lead_same_organisation_update',
      'contacts_business_idx', 'contacts_contact_type_insert', 'contacts_contact_type_update',
      // CRM 5 of 10 (migration 014, which rebuilt contacts again for a person at an introducing firm): the index on
      // the firm, and the trigger that keeps a person at their firm. Every name before it survived that rebuild too.
      'contacts_introducer_fixed', 'contacts_introducer_idx',
      // CRM 3 of 10 (migration 012): two triggers deriving the last contact, and two retiring the follow-up column.
      'contacts_last_contact_derived_insert', 'contacts_last_contact_derived_update',
      'contacts_lead_idx', 'contacts_lead_same_organisation_insert', 'contacts_lead_same_organisation_update',
      'contacts_next_follow_up_retired_insert', 'contacts_next_follow_up_retired_update',
    ]);
    assert.throws(() => db.run("INSERT INTO contacts (id, business_id, lead_id, full_name, contact_consent, marketing_optin, contact_type, created_at) VALUES ('c-bad', NULL, NULL, 'X', 1, 0, 'NOT_A_TYPE', ?)", [T0]));
    assert.equal(db.all('SELECT * FROM pragma_foreign_key_check').length, 0);

    const dnc = randomUUID();
    db.run('INSERT INTO businesses (id,name,sector,stage,created_at,source) VALUES (?,?,?,?,?,?)',
      [dnc, 'Do Not Contact Limited', 'gp', 'ASSESSMENT_SUBMITTED', T0, 'WEBSITE']);
    db.run("UPDATE businesses SET client_status = 'DO_NOT_CONTACT' WHERE id = ?", [dnc]);
    db.run('INSERT INTO contacts (id, business_id, full_name, contact_consent, marketing_optin, email, created_at) VALUES (?, ?, ?, 0, 0, ?, ?)',
      [randomUUID(), dnc, 'Finance Contact', 'finance@dnc.example.invalid', T0]);
    assert.throws(() => db.run(
      "INSERT INTO outbox (id, created_at, to_email, subject, body, kind, sent_at, transport, business_id) VALUES (?, ?, ?, 'x', 'x', 'CALENDAR_INVITE', NULL, 'STUB', NULL)",
      [randomUUID(), T0, 'FINANCE@dnc.example.invalid']), /E_DO_NOT_CONTACT/);
  });
});
