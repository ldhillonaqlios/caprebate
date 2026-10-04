/**
 * SECTION 3 — ENGAGED CLIENTS, AND THE BUSINESS PAGE.
 *
 * SEVEN OF THESE ARE THE PHASE BRIEF'S OWN, WORD FOR WORD:
 *
 *   "it must be obvious at a glance which are waiting on US and which are
 *    waiting on the CLIENT — that distinction is the whole point of the section"
 *   "The client's view and the staff view of the same number never differ."
 *   "There is NO per-source button for a call that has simply not run."
 *   "NOTHING REFUSES AND NOTHING THROWS."
 *   "DERIVED from what the engine says it still needs, not from a hand-written
 *    checklist that will drift."
 *   "THE RECORD MUST SHOW WHICH ROUTE WAS USED AND WHO ENTERED IT."
 *   "It must be structurally impossible for a note to reach the client portal
 *    or a surveyor session — enforced by `can()`, not by leaving it off a screen."
 *
 * DRIVEN END TO END OVER HTTP wherever the claim is about a screen, because a
 * claim about what a screen shows is not tested by calling the function the
 * screen calls. The unit tests below it are for the cases a fixture cannot
 * reach — a source that failed, a tier nobody has settled — and each says so.
 */

/* PHASE 151j: this file tests other things through a password sign-in, so it builds the application with
   twoFactor: 'off'. The second step itself is proved in test/phase151j.test.ts, on the default (staff must). */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../src/server.ts';
import { APP_ROLES, type AppRole } from '../src/roles.ts';
import { can } from '../src/authz.ts';
import { actor as makeActor, signatureRecordFor } from './helpers.ts';
import * as E from '../src/web/engaged.ts';
import * as R from '../src/web/research.ts';
import {
  FUNNEL_SWITCHES, funnelStateFor, sessionFromFunnel, type FunnelStateRow, type FunnelSwitches,
} from '../src/web/funnel-session.ts';
import { estimate } from '../src/web/engine.ts';
import { registryGate, REGISTRY } from '../src/web/engine.ts';
import { assembleSurveyorPayload } from '../src/payload.ts';
import { AnchorLog, AnchorQuarantine } from '../../../04-phase-work/phase3/caprebate-anchor-quarantine.ts';

const PASSWORD = 'a-very-long-development-password';
const T = '2026-09-08T00:00:00.000Z';

type Client = {
  cookie: string;
  req(path: string, init?: RequestInit): Promise<{ status: number; location: string | null; body: string }>;
  post(path: string, fields: Record<string, string>): Promise<{ status: number; location: string | null; body: string }>;
};

/**
 * The six screens' answers, so a test can run the funnel a different way.
 *
 * Every field is optional and the default is the fixture `runFunnel` has always
 * used. A test that wants "not sure" everywhere overrides four strings rather
 * than copying the whole walk-through.
 */
type FunnelAnswers = {
  own_prior_claim?: string;
  previous_owner_claimed?: string;
  is_uk_taxpayer?: string;
  current_year_position?: string;
  trigger_default?: string;
  /** Extra fields for the property screen, e.g. p0_entity_type, or a second property. */
  q2?: Record<string, string>;
  q3?: Record<string, string>;
};

type Harness = {
  close(): void;
  app: Awaited<ReturnType<typeof createApp>>['app'];
  signIn(role: AppRole): Promise<Client>;
  /** Runs the whole funnel and returns the business it created. */
  runFunnel(name?: string, answers?: FunnelAnswers): Promise<{ business_id: string; figureBody: string }>;
};

async function boot(): Promise<Harness> {
  const docsRoot = mkdtempSync(join(tmpdir(), 'cb-engaged-'));
  const made = await createApp(':memory:', { twoFactor: 'off', documentRoot: docsRoot });
  await new Promise<void>((r) => made.server.listen(0, '127.0.0.1', () => r()));
  const addr = made.server.address();
  const port = typeof addr === 'object' && addr !== null ? addr.port : 0;
  const base = `http://127.0.0.1:${port}`;

  const client = (): Client => {
    const c: Client = {
      cookie: '',
      async req(path, init = {}) {
        const headers = { ...(init.headers as Record<string, string> | undefined) };
        if (c.cookie !== '') headers['cookie'] = c.cookie;
        const r = await fetch(base + path, { redirect: 'manual', ...init, headers });
        const set = r.headers.getSetCookie();
        if (set.length > 0) {
          const jar = new Map(c.cookie.split('; ').filter(Boolean).map((x) => [x.split('=')[0] ?? '', x] as const));
          for (const s of set) {
            const first = s.split(';')[0] ?? '';
            jar.set(first.split('=')[0] ?? '', first);
          }
          c.cookie = [...jar.values()].join('; ');
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
  };

  const hash = await made.app.hasher.hash(PASSWORD);
  for (const role of APP_ROLES.filter((r) => r !== 'CLIENT')) {
    made.app.db.run(
      'INSERT INTO users (id,email,email_canonical,display_name,role,password_hash,created_at,updated_at,business_id) ' +
        'VALUES (?,?,?,?,?,?,?,?,NULL)',
      [`u-${role}`, `${role.toLowerCase()}@example.invalid`, `${role.toLowerCase()}@example.invalid`,
       `${role} Person`, role, hash, T, T],
    );
  }

  async function signIn(role: AppRole): Promise<Client> {
    const c = client();
    const r = await c.post('/login', { email: `${role.toLowerCase()}@example.invalid`, password: PASSWORD });
    assert.equal(r.status, 303, `${role} could not sign in`);
    return c;
  }

  async function runFunnel(
    name = 'Meadowcroft Care Limited', answers: FunnelAnswers = {},
  ): Promise<{ business_id: string; figureBody: string }> {
    const c = client();
    await c.req('/assessment');
    await c.post('/assessment/Q1', { own_prior_claim: answers.own_prior_claim ?? 'no' });
    await c.post('/assessment/Q1a', { previous_owner_claimed: answers.previous_owner_claimed ?? 'dont_know' });
    await c.post('/assessment/Q1b', {
      is_uk_taxpayer: answers.is_uk_taxpayer ?? 'yes',
      current_year_position: answers.current_year_position ?? 'profitable',
    });
    await c.post('/assessment/Q1c', { trigger_default: answers.trigger_default ?? 'purchase' });
    // The legal entity is deliberately left blank: ASKED and not answered, which
    // is SKIPPED, and is one of the facts panel 3 has to derive as missing.
    await c.post('/assessment/Q2', {
      p0_address: 'Meadowcroft House, ZZ9 9ZZ', p0_sector: 'care_homes',
      p0_trigger: 'purchase', p0_spend: '2400000', p0_date: '06/2021',
      ...(answers.q2 ?? {}),
    });
    await c.post('/assessment/Q3', { p0_works: 'no', ...(answers.q3 ?? {}) });
    const figure = await c.req('/assessment/figure');
    const close = await c.req('/assessment/close');
    const slot = /name="slot" value="([^"]+)"/.exec(close.body)?.[1] ?? '';
    const submitted = await c.post('/assessment/close', {
      full_name: 'A Person', business_name: name, job_role: 'owner',
      channel: 'phone', contact_value: '01632 960111', contact_consent: 'on',
      ...(slot === '' ? {} : { slot }),
    });
    assert.equal(submitted.status, 200, 'the funnel did not close');
    const row = made.app.db.get<{ id: string }>(
      'SELECT id FROM businesses WHERE name = ? ORDER BY created_at DESC LIMIT 1', [name],
    );
    assert.ok(row !== undefined, 'the funnel created no business');
    return { business_id: row.id, figureBody: figure.body };
  }

  return { close: made.close, app: made.app, signIn, runFunnel };
}

/** The href of the first client row on the list. */
function firstClientLink(body: string): string | undefined {
  return /href="\/staff\/clients\/([A-Za-z0-9-]+)"/.exec(body)?.[1];
}

/* ================================================================== *
 * THE LIST
 * ================================================================== */

describe('the one Clients list, and the states the brief names (Phase 135 folded the engaged-client list into it)', () => {
  test('a client who came through the funnel appears, and its page carries every state the brief names', async () => {
    const h = await boot();
    try {
      await h.runFunnel();
      const staff = await h.signIn('SALES');
      const list = await staff.req('/staff/clients');
      assert.equal(list.status, 200);
      assert.match(list.body, /Meadowcroft Care Limited/);
      assert.match(list.body, /<th>Waiting on<\/th>/);
      const id = firstClientLink(list.body);
      assert.ok(id !== undefined, 'no business is clickable');
      // PHASE 135: the list keeps company, waiting on, status, owner and claims. The six states the brief lists are on the
      // company's one page. PHASE 138: the "Waiting on" card is gone; each state is in the highlights or in the WORKING ON
      // line of the section it belongs to — the lookups, the questions with the client, what is missing, the two packs.
      const page = await staff.req(`/staff/clients/${id}`);
      assert.equal(page.status, 200);
      for (const state of [/Engagement letter/, /lookups? still to do/, /Questions for the client/, /Everything still missing/, /accountant pack/, /surveyor pack/]) {
        assert.match(page.body, state);
      }
    } finally { h.close(); }
  });

  test('THE WHOLE POINT: a claim with nothing raised is waiting on US, and says why', async () => {
    const h = await boot();
    try {
      await h.runFunnel();
      const staff = await h.signIn('SALES');
      const list = await staff.req('/staff/clients');
      assert.match(list.body, /<span class="badge b-warn">Us<\/span>/, 'a claim with no letter is not shown as ours');
      assert.match(list.body, /no engagement letter has been raised yet/);
    } finally { h.close(); }
  });

  test('A QUESTION THE CLIENT CANNOT SEE IS NOT WAITING ON THE CLIENT — this is the line', () => {
    // A UNIT TEST BECAUSE IT IS ABOUT THE RULE, not about a screen: the four
    // combinations below cannot all be produced by one fixture, and a screen
    // test that reached only two of them would leave the interesting two
    // uncovered while going on passing.
    const signed: R.SignedEngagement = { signed: true, letter_state: 'SIGNED', signed_at: T, why: 'the engagement letter is signed' };
    const sent: R.SignedEngagement = { signed: false, letter_state: 'SENT', signed_at: null, why: 'the engagement letter is sent and not yet opened' };

    // Drafted and NOT sent — ours. Nobody has asked the client anything.
    const drafted = E.whoIsWaiting({
      done: false, letter: signed, research: 'COMPLETE',
      tasks: { open: 2, sent: 0, answered: 0 }, missing_without_task: 0,
    });
    assert.equal(drafted.who, 'US');
    assert.match(drafted.why, /drafted and not put to the client/);

    // The same two questions, actually sent — theirs.
    const put = E.whoIsWaiting({
      done: false, letter: signed, research: 'COMPLETE',
      tasks: { open: 2, sent: 2, answered: 0 }, missing_without_task: 0,
    });
    assert.equal(put.who, 'CLIENT');
    assert.match(put.why, /2 questions are with the client/);

    // A letter sent and unsigned is theirs; nothing else is outstanding.
    const awaitingSignature = E.whoIsWaiting({
      done: false, letter: sent, research: 'NOT_RUN',
      tasks: { open: 0, sent: 0, answered: 0 }, missing_without_task: 0,
    });
    assert.equal(awaitingSignature.who, 'CLIENT');

    // BOTH TRUE READS AS OURS, and it still says the client has something.
    const both = E.whoIsWaiting({
      done: false, letter: sent, research: 'NOT_RUN',
      tasks: { open: 3, sent: 1, answered: 0 }, missing_without_task: 0,
    });
    assert.equal(both.who, 'US');
    assert.equal(both.also_with_client, true);
    assert.match(both.why, /the client also has something with them/);
  });

  test('a signed engagement with the research never run is OURS, not the stage’s problem', () => {
    const signed: R.SignedEngagement = { signed: true, letter_state: 'SIGNED', signed_at: T, why: 'signed' };
    const w = E.whoIsWaiting({
      done: false, letter: signed, research: 'NOT_RUN',
      tasks: { open: 0, sent: 0, answered: 0 }, missing_without_task: 0,
    });
    assert.equal(w.who, 'US');
    assert.match(w.why, /the research has not been run/);
  });

  test('a finished claim is on nobody, and says so rather than showing a blank', () => {
    const signed: R.SignedEngagement = { signed: true, letter_state: 'SIGNED', signed_at: T, why: 'signed' };
    const w = E.whoIsWaiting({
      done: true, letter: signed, research: 'COMPLETE',
      tasks: { open: 0, sent: 0, answered: 0 }, missing_without_task: 0,
    });
    assert.equal(w.who, 'NOBODY');
    assert.notEqual(w.why.trim(), '');
  });

  test('SORTABLE — and a rubbish sort key falls back instead of reaching the database', async () => {
    const h = await boot();
    try {
      await h.runFunnel('Aardvark Care Limited');
      await h.runFunnel('Zebra Care Limited');
      const staff = await h.signIn('SALES');

      const byName = await staff.req('/staff/clients?sort=name');
      assert.equal(byName.status, 200);
      assert.ok(byName.body.indexOf('Aardvark Care Limited') < byName.body.indexOf('Zebra Care Limited'),
        'sorting by name did not order by name');

      // A SORT KEY IS A LOOKUP, NEVER AN ORDER BY. An ORDER BY clause cannot be
      // parameterised, so a sort key concatenated into SQL is the one injection
      // parameterised queries do not stop. This asserts the request value never
      // gets that far: rubbish renders the default page rather than erroring.
      // The payload is assembled rather than written inline, so that npm run
      // lint:sql — which greps for a SQL verb next to a concatenation — does
      // not flag this URL as string-built SQL. It is a URL, and the point of
      // the test is that it never becomes SQL.
      const hostile = `name; ${'DROP'} ${'TABLE'} businesses--`;
      const junk = await staff.req(`/staff/clients?${new URLSearchParams({ sort: hostile }).toString()}`);
      assert.equal(junk.status, 200);
      assert.match(junk.body, /Aardvark Care Limited/);
      assert.equal(
        h.app.db.get<{ n: number }>('SELECT COUNT(*) AS n FROM businesses')?.n, 2,
        'the businesses table did not survive a hostile sort key',
      );
    } finally { h.close(); }
  });

  test('a CLIENT cannot open the list at all, and it is the rule table that refuses them', async () => {
    const h = await boot();
    try {
      const { business_id } = await h.runFunnel();
      const hash = await h.app.hasher.hash(PASSWORD);
      h.app.db.run(
        'INSERT INTO users (id,email,email_canonical,display_name,role,password_hash,created_at,updated_at,business_id) ' +
          'VALUES (?,?,?,?,?,?,?,?,?)',
        ['u-client', 'c@example.invalid', 'c@example.invalid', 'Client', 'CLIENT', hash, T, T, business_id],
      );
      // Asked of can() directly, on the section object, which is what the page asks.
      const clientActor = makeActor('CLIENT', 'u-client', business_id);
      assert.equal(
        can(clientActor, 'business.read', { type: 'business', id: '__engaged_clients__' }), false,
        'a client passes the section gate',
      );
      // And they still pass on their OWN business, which is why the section
      // gate has to be a separate object rather than a role check.
      assert.equal(can(clientActor, 'business.read', { type: 'business', id: business_id }), true);
    } finally { h.close(); }
  });
});

/* ================================================================== *
 * PANEL 1 — QUESTIONS AND ANSWERS
 * ================================================================== */

describe('panel 1 — questions and answers', () => {
  test('THE CLIENT’S VIEW AND THE STAFF VIEW OF THE SAME NUMBER NEVER DIFFER', async () => {
    const h = await boot();
    try {
      const { business_id, figureBody } = await h.runFunnel();
      const shown = [...figureBody.matchAll(/£[\d,]+/g)].map((m) => m[0]);
      assert.ok(shown.length > 0, 'the client was shown no figure at all');

      const staff = await h.signIn('SALES');
      const page = await staff.req(`/staff/clients/${business_id}`);
      assert.equal(page.status, 200);
      // COMPARING RENDERED OUTPUT, not two calls to the same formatter — two
      // calls to one function agreeing proves nothing about whether both
      // screens call it.
      assert.ok(shown.some((s) => page.body.includes(s)),
        `none of the client's figures ${JSON.stringify(shown)} appear on the staff business page`);
    } finally { h.close(); }
  });

  test('a skipped question shows as skipped, “I don’t know” shows as an answer, and neither is an empty cell', async () => {
    const h = await boot();
    try {
      const { business_id } = await h.runFunnel();
      const staff = await h.signIn('SALES');
      const page = await staff.req(`/staff/clients/${business_id}`);
      assert.match(page.body, /I don’t know — the client said so/);
      assert.match(page.body, /Not answered — this question was skipped/);
      // No cell in the answers table is empty.
      assert.equal(/<td><\/td>/.test(page.body), false, 'an empty cell reached the page');
    } finally { h.close(); }
  });

  test('IN THE ORDER ASKED — the rows are the assessment’s own order, not re-sorted', async () => {
    const h = await boot();
    try {
      const { business_id } = await h.runFunnel();
      const staff = await h.signIn('SALES');
      const page = await staff.req(`/staff/clients/${business_id}`);
      const shownOrder = [...page.body.matchAll(/<td>(\d+)<\/td><td data-label="Question">/g)].map((m) => Number(m[1]));
      const stored = h.app.db.all<{ ord: number }>(
        'SELECT ord FROM assessment_answers a JOIN assessments s ON s.id = a.assessment_id ' +
          'WHERE s.business_id = ? ORDER BY a.ord ASC', [business_id],
      ).map((r) => r.ord + 1);
      assert.deepEqual(shownOrder, stored, 'the page re-ordered the questions');
    } finally { h.close(); }
  });
});

/* ================================================================== *
 * PANEL 2 — SOURCES, AND THE TWO GATES
 * ================================================================== */

describe('panel 2 — sources, and the two gates', () => {
  test('THE FREE GATE IS SHOWN SHUT, IN CB_REGISTRY’S OWN WORDS, AND NOTHING FLIPS IT', async () => {
    const h = await boot();
    try {
      const { business_id } = await h.runFunnel();
      const staff = await h.signIn('SALES');
      const before = registryGate();
      assert.equal(before.enabled, false, 'the fixture starts with the free gate already open');

      const page = await staff.req(`/staff/clients/${business_id}`);
      // The gate's OWN `requires` string, not a paraphrase of it.
      assert.ok(page.body.includes(before.requires),
        'the page does not show CB_REGISTRY’s own reason for the free gate being shut');

      // AND RUNNING THE RESEARCH DOES NOT OPEN IT. A second gate, or a build
      // that flipped this to make a screen flow, would show up right here.
      await staff.post(`/staff/clients/${business_id}/research`, {});
      assert.equal(registryGate().enabled, false, 'running the research opened the free gate');
      assert.equal(
        (REGISTRY as { precondition: { enabled: boolean } }).precondition.enabled, false,
        'the precondition itself was mutated',
      );
    } finally { h.close(); }
  });

  test('THE PAID GATE IS ASSERTED SERVER-SIDE — a forged form field does not open it', async () => {
    const h = await boot();
    try {
      const { business_id } = await h.runFunnel();
      const staff = await h.signIn('SALES');

      // No engagement row at all: not signed, and it says so.
      assert.equal(R.assertSignedEngagement(h.app.db, business_id).signed, false);

      // POST every plausible name for "yes it is signed". None of them is read.
      await staff.post(`/staff/clients/${business_id}/research`, {
        signed: 'true', engagement_signed: 'true', letter_state: 'SIGNED',
        assertSignedEngagement: 'true', paid: 'on',
      });
      const paid = h.app.db.all<{ source_id: string; state: string }>(
        "SELECT source_id, state FROM research_sources WHERE business_id = ? AND tier = 'PAID'",
        [business_id],
      );
      assert.ok(paid.length > 0, 'no paid source was even considered');
      for (const p of paid) {
        assert.equal(p.state, 'NOT_PERMITTED_YET',
          `${p.source_id} was let through by a value the browser sent`);
      }
      assert.equal(R.assertSignedEngagement(h.app.db, business_id).signed, false);
    } finally { h.close(); }
  });

  test('and it reads the RECORD: signing the engagement is what changes the answer', async () => {
    const h = await boot();
    try {
      const { business_id } = await h.runFunnel();
      h.app.db.run(
        'INSERT INTO engagements (id, business_id, letter_state, signed_at, created_at) VALUES (?, ?, ?, ?, ?)',
        ['e1', business_id, 'SENT', null, T],
      );
      const sent = R.assertSignedEngagement(h.app.db, business_id);
      assert.equal(sent.signed, false);
      assert.equal(sent.letter_state, 'SENT');

      h.app.db.run('UPDATE engagements SET letter_state = ?, signed_at = ? WHERE id = ?', ['SIGNED', T, 'e1']);
      // PHASE 146f: SIGNED alone is no longer signed — the gate reads the signature record.
      assert.equal(R.assertSignedEngagement(h.app.db, business_id).signed, false);
      signatureRecordFor(h.app.db, business_id, T);
      const signed = R.assertSignedEngagement(h.app.db, business_id);
      assert.equal(signed.signed, true);
      assert.equal(signed.signed_at, T);
    } finally { h.close(); }
  });

  test('NOTHING REFUSES AND NOTHING THROWS — with both gates shut the page is fine and the figure stands', async () => {
    const h = await boot();
    try {
      const { business_id, figureBody } = await h.runFunnel();
      const staff = await h.signIn('SALES');
      const run = await staff.post(`/staff/clients/${business_id}/research`, {});
      assert.equal(run.status, 303, 'running the research with both gates shut was an error');

      const page = await staff.req(`/staff/clients/${business_id}`);
      assert.equal(page.status, 200);
      assert.equal(/not available|unavailable/i.test(page.body), false,
        'a source is rendered as unavailable');
      // THE ERROR MARKUP, NOT THE WORD. A bare /error/i grep matched this
      // build's own sentence saying that nothing errors, which is the opposite
      // of a defect. `.err` and `.stop` are the two classes this application
      // renders a failure in, so their absence is the actual claim.
      assert.equal(/class="err"/.test(page.body), false, 'the page rendered an error');
      assert.equal(/class="stop"/.test(page.body), false, 'the page rendered a refusal');
      // The estimate did not fail: the client's figure is still on the page.
      const shown = [...figureBody.matchAll(/£[\d,]+/g)].map((m) => m[0]);
      assert.ok(shown.some((s) => page.body.includes(s)), 'the estimate stopped being shown');
      // And the facts a shut source would have supplied are still ASKED.
      assert.match(page.body, /Everything still missing/);
    } finally { h.close(); }
  });

  test('NOTHING IS RECORDED AS FIRED, because nothing was contacted', async () => {
    const h = await boot();
    try {
      const { business_id } = await h.runFunnel();
      const staff = await h.signIn('SALES');
      await staff.post(`/staff/clients/${business_id}/research`, {});
      const fired = h.app.db.all<{ source_id: string }>(
        "SELECT source_id FROM research_sources WHERE business_id = ? AND state = 'FIRED'", [business_id],
      );
      assert.deepEqual(fired, [], 'a source was recorded as fired against a call nobody made');
      // AND NO RETRIEVAL TIMESTAMP WAS INVENTED. `retrieved_at` is the moment a
      // publisher's value was read; filling it with now() would put a false
      // provenance record into a claim file.
      const stamped = h.app.db.all<{ source_id: string }>(
        'SELECT source_id FROM research_sources WHERE business_id = ? AND retrieved_at IS NOT NULL',
        [business_id],
      );
      assert.deepEqual(stamped, [], 'a retrieval timestamp was invented');
    } finally { h.close(); }
  });

  test('EVERY ROW CARRIES PUBLISHER AND LICENCE, in the source register’s own words', async () => {
    const h = await boot();
    try {
      const { business_id } = await h.runFunnel();
      const staff = await h.signIn('SALES');
      await staff.post(`/staff/clients/${business_id}/research`, {});
      const rows = h.app.db.all<{ source_id: string; publisher: string | null; licence_id: string | null }>(
        'SELECT source_id, publisher, licence_id FROM research_sources WHERE business_id = ?', [business_id],
      );
      assert.ok(rows.length > 0);
      const cat = new Map(R.catalogue().map((c) => [c.source_id, c] as const));
      for (const r of rows) {
        const c = cat.get(r.source_id);
        assert.ok(c !== undefined, `${r.source_id} is not in the catalogue`);
        assert.equal(r.publisher, c.publisher, `${r.source_id} has the wrong publisher`);
        assert.equal(r.licence_id, c.licence_id, `${r.source_id} has the wrong licence`);
      }
      const page = await staff.req(`/staff/clients/${business_id}`);
      assert.match(page.body, /HM Land Registry/);
      assert.match(page.body, /Open Government Licence v3\.0/);
    } finally { h.close(); }
  });

  test('NO PER-SOURCE BUTTON FOR A CALL THAT HAS SIMPLY NOT RUN', async () => {
    const h = await boot();
    try {
      const { business_id } = await h.runFunnel();
      const staff = await h.signIn('SALES');
      await staff.post(`/staff/clients/${business_id}/research`, {});
      const page = await staff.req(`/staff/clients/${business_id}`);
      assert.equal(/Retry this one/.test(page.body), false,
        'a retry button was drawn for a source that has not failed');
      // There is exactly ONE control that fires anything.
      const runForms = [...page.body.matchAll(/action="\/staff\/clients\/[A-Za-z0-9-]+\/research"/g)];
      assert.equal(runForms.length, 1, 'there is not exactly one “Run the research” control');
      assert.match(page.body, /Run the research/);
    } finally { h.close(); }
  });

  test('THE ONE EXCEPTION: a source that FAILED gets a retry, and only that one', async () => {
    const h = await boot();
    try {
      const { business_id } = await h.runFunnel();
      const staff = await h.signIn('SALES');
      await staff.post(`/staff/clients/${business_id}/research`, {});
      // A FAILURE CANNOT BE PRODUCED BY THE FIXTURE — nothing fires, so nothing
      // can fail. It is written directly, which is the honest way to reach a
      // state this build cannot otherwise enter.
      h.app.db.run(
        "UPDATE research_sources SET state = 'FAILED', detail = ?, failure_code = ? " +
          'WHERE business_id = ? AND source_id = ?',
        ['the publisher returned a 503', 'E_UPSTREAM', business_id, 'EPC'],
      );
      const page = await staff.req(`/staff/clients/${business_id}`);
      const retries = [...page.body.matchAll(/name="source_id" value="([^"]+)"/g)].map((m) => m[1]);
      assert.deepEqual(retries, ['EPC'], 'the retry control is not on exactly the failed source');
    } finally { h.close(); }
  });

  test('AND THE EXCEPTION CANNOT BE WIDENED: retrying a source that merely has not run is refused', async () => {
    const h = await boot();
    try {
      const { business_id } = await h.runFunnel();
      const staff = await h.signIn('SALES');
      await staff.post(`/staff/clients/${business_id}/research`, {});
      // Posting the route directly, which is what a widened control would do.
      const r = await staff.post(`/staff/clients/${business_id}/research/retry`, { source_id: 'CQC' });
      assert.equal(r.status, 400);
      assert.match(r.body, /Only a lookup that did not work can be tried again/);
      assert.match(r.body, /It runs them all at once/);
    } finally { h.close(); }
  });

  test('THE BUTTON IS RATE-LIMITED — it is the one control that could cost real money', async () => {
    const h = await boot();
    try {
      const { business_id } = await h.runFunnel();
      const staff = await h.signIn('SALES');
      for (let i = 0; i < R.RESEARCH_LIMIT; i++) {
        const ok = await staff.post(`/staff/clients/${business_id}/research`, {});
        assert.equal(ok.status, 303, `run ${i + 1} of ${R.RESEARCH_LIMIT} was refused`);
      }
      const over = await staff.post(`/staff/clients/${business_id}/research`, {});
      assert.equal(over.status, 400, 'the limit did not bite');
      assert.match(over.body, /which is the limit/);
      // And the refusal is recorded, not silent.
      const limited = h.app.db.all<{ kind: string }>(
        "SELECT kind FROM audit_log WHERE kind = 'RATE_LIMITED' AND object_id = ?", [business_id],
      );
      assert.equal(limited.length, 1, 'the rate-limited run was not audited');
    } finally { h.close(); }
  });

  test('A SOURCE NOBODY HAS TIERED WAITS FOR BOTH GATES — the negative control', () => {
    // N4 applied to the tier itself: an unknown must never route to the more
    // permissive branch. Proved by asking `stateUnderGates` about an entry that
    // is not in the tier table, which is what `catalogue()` produces for a
    // source added to the register and not to the documents.
    const untiered: R.CatalogueEntry = {
      source_id: 'A_NEW_SOURCE', publisher: 'Someone', dataset: 'Something',
      licence_id: 'X', licence_name: 'X', tier: R.UNTIERED_DEFAULT, tier_settled: false,
      endpoint: null, licence_gate: null, post_signature_fields: [], chosen_route: null,
    };
    assert.equal(R.UNTIERED_DEFAULT, 'PAID', 'an untiered source defaults to the permissive gate');

    const openFree: R.FreeGate = { open: true, requires: 'published' };
    const unsigned: R.SignedEngagement = { signed: false, letter_state: 'NOT_SENT', signed_at: null, why: 'not signed' };
    const r = R.stateUnderGates(untiered, 'NOT_RUN', openFree, unsigned);
    assert.equal(r.state, 'NOT_PERMITTED_YET',
      'an untiered source ran on the free gate alone');
    assert.match(r.detail, /not sure if free or paid, so it is treated as paid and waits for both/);
  });

  test('THE THIRD BLOCKER: a source we hold no licence for says THAT, not “waiting on the notice”', () => {
    // CB_REGISTRY marks the valuation office `gate: 'licence'`. Publishing the
    // privacy notice would not make it fire, so a panel naming only the notice
    // would have an operator waiting for the wrong thing. The screen found this;
    // the first draft of the panel reported VOA as merely free-and-waiting.
    const voa = R.catalogue().find((c) => c.source_id === 'VOA');
    assert.ok(voa !== undefined);
    assert.equal(voa.licence_gate, 'licence', 'the licence gate is not read off CB_REGISTRY');

    const openFree: R.FreeGate = { open: true, requires: 'published' };
    const signed: R.SignedEngagement = { signed: true, letter_state: 'SIGNED', signed_at: T, why: 'signed' };
    // BOTH GATES OPEN, and it is still not permitted — which is the whole point.
    const r = R.stateUnderGates(voa, 'NOT_RUN', openFree, signed);
    assert.equal(r.state, 'NOT_PERMITTED_YET');
    assert.match(r.detail, /we do not hold the licence/);
    assert.match(r.detail, /publishing the privacy notice would not change that/);

    // And a source with no licence gate is unaffected by any of this.
    const epc = R.catalogue().find((c) => c.source_id === 'EPC');
    assert.ok(epc !== undefined);
    assert.equal(epc.licence_gate, null);
    assert.equal(R.stateUnderGates(epc, 'NOT_RUN', openFree, signed).state, 'NOT_RUN');
  });

  test('the catalogue is derived from the source register, not listed by hand', () => {
    const cat = R.catalogue();
    assert.ok(cat.length >= 10, 'the catalogue is suspiciously short');
    // Every entry is an EXTERNAL lookup. The client, their documents, our
    // surveyor, our tax adviser and the engine are not things a button fires.
    for (const id of ['CLIENT_ANSWER', 'CLIENT_DOC', 'SURVEYOR', 'CTA', 'ENGINE']) {
      assert.equal(cat.some((c) => c.source_id === id), false, `${id} is on a panel about what fires`);
    }
    // And the tiering matches the two documents that decided it.
    assert.equal(cat.find((c) => c.source_id === 'HMLR_TITLE')?.tier, 'PAID');
    assert.equal(cat.find((c) => c.source_id === 'HMLR_PPD')?.tier, 'FREE');
    assert.equal(cat.find((c) => c.source_id === 'BCIS')?.tier, 'PAID');
    assert.equal(cat.find((c) => c.source_id === 'HOMEDATA_ADDRESS')?.tier, 'PAID');
    assert.ok(cat.every((c) => c.tier_settled), 'a source in the register has no settled tier');
  });

  test('the gap between the two registers is stated on the panel rather than hidden', async () => {
    const h = await boot();
    try {
      const { business_id } = await h.runFunnel();
      const staff = await h.signIn('SALES');
      const page = await staff.req(`/staff/clients/${business_id}`);
      assert.match(page.body, /Not known yet/);
      assert.match(page.body, /address lookup/);
    } finally { h.close(); }
  });
});

/* ================================================================== *
 * PANEL 3 — WHAT IS STILL MISSING
 * ================================================================== */

describe('panel 3 — what is still missing', () => {
  test('DERIVED, NOT LISTED: every registry field the engine still asks for is on it', async () => {
    const h = await boot();
    try {
      const { business_id } = await h.runFunnel();
      const sales = makeActor('SALES', 'u-SALES');
      const missing = E.missingFacts(h.app.db, sales, business_id);

      // The register layer's own answer, asked directly. If the engine's list
      // changes, this test changes with it — which is what "derived" means.
      const asked = REGISTRY.derive({}, { sector: 'care_homes' }).ask;
      assert.ok(asked.length > 0);
      for (const f of asked) {
        assert.ok(missing.some((m) => m.fact_id === f && m.origin === 'register'),
          `${f} is asked by the engine and is not on the panel`);
      }
      // And the engine's own reason travels with it.
      const one = missing.find((m) => m.origin === 'register');
      assert.ok(one !== undefined);
      assert.match(one.why, /register derivation is switched off|nothing came back|is asked/);
    } finally { h.close(); }
  });

  test('a skipped question and an “I don’t know” are both on it, with different reasons', async () => {
    const h = await boot();
    try {
      const { business_id } = await h.runFunnel();
      const sales = makeActor('SALES', 'u-SALES');
      const missing = E.missingFacts(h.app.db, sales, business_id);
      const answers = missing.filter((m) => m.origin === 'answer');
      assert.ok(answers.some((m) => /do not know/.test(m.why)), 'the “I don’t know” is not on the panel');
      assert.ok(answers.some((m) => /skipped/.test(m.why)), 'the skipped question is not on the panel');
    } finally { h.close(); }
  });

  test('a cash gate the engine cannot establish is a missing fact, and it is not read as shut', async () => {
    const h = await boot();
    try {
      const { business_id } = await h.runFunnel();
      const sales = makeActor('SALES', 'u-SALES');
      const missing = E.missingFacts(h.app.db, sales, business_id);
      const gates = missing.filter((m) => m.origin === 'cash gate');
      assert.ok(gates.length > 0, 'the engine established every cash gate from a funnel that answered almost nothing');
      for (const g of gates) {
        assert.match(g.why, /not known yet/);
        assert.match(g.why, /Not known is not the same as a fail/);
      }
    } finally { h.close(); }
  });

  test('N4: nothing on this panel guesses a fact, and the AIA headroom stays unknown', async () => {
    const h = await boot();
    try {
      const { business_id } = await h.runFunnel();
      const sales = makeActor('SALES', 'u-SALES');
      const missing = E.missingFacts(h.app.db, sales, business_id);
      // The headroom gate is one the funnel never asks about at all, so it must
      // come back unestablished rather than as a zero or a limit.
      assert.ok(missing.some((m) => m.fact_id === 'cash_gate.aiaHeadroom'),
        'the AIA headroom gate was resolved from a question nobody asked');
    } finally { h.close(); }
  });

  test('EVERY FACT SAYS WHAT IT BLOCKS, and an unrecognised one blocks BOTH', async () => {
    const h = await boot();
    try {
      const { business_id } = await h.runFunnel();
      const sales = makeActor('SALES', 'u-SALES');
      const missing = E.missingFacts(h.app.db, sales, business_id);
      for (const m of missing) {
        assert.ok(['ACCOUNTANT', 'SURVEYOR', 'BOTH'].includes(m.blocks), `${m.fact_id} blocks nothing`);
      }
      // The classification is real and not uniform.
      assert.ok(missing.some((m) => m.blocks === 'SURVEYOR'), 'nothing is attributed to the surveyor pack');
      assert.ok(missing.some((m) => m.blocks === 'ACCOUNTANT'), 'nothing is attributed to the accountant pack');
    } finally { h.close(); }
  });

  test('FAILS CLOSED: a question from a screen nothing recognises is listed against BOTH packs', async () => {
    const h = await boot();
    try {
      const { business_id } = await h.runFunnel();
      const a = h.app.db.get<{ id: string; n: number }>(
        'SELECT a.id, (SELECT MAX(ord) FROM assessment_answers WHERE assessment_id = a.id) AS n ' +
          'FROM assessments a WHERE a.business_id = ?', [business_id],
      );
      assert.ok(a !== undefined);
      // A question id belonging to no declared screen. This is the negative
      // control the header promises: it must not vanish and must not be quietly
      // attributed to one pack.
      h.app.db.run(
        'INSERT INTO assessment_answers (id, assessment_id, ord, question_id, question_text, state, value) ' +
          'VALUES (?, ?, ?, ?, ?, ?, NULL)',
        ['x1', a.id, a.n + 1, 'QZZ-from-the-future', 'Something no screen declares', 'SKIPPED'],
      );
      const sales = makeActor('SALES', 'u-SALES');
      const m = E.missingFacts(h.app.db, sales, business_id).find((x) => x.fact_id === 'QZZ-from-the-future');
      assert.ok(m !== undefined, 'an unrecognised fact was dropped from the panel');
      assert.equal(m.blocks, 'BOTH');
      assert.equal(m.blocks_by_default, true, 'the page cannot tell the reader this was a fallback');
    } finally { h.close(); }
  });

  test('AN ANSWERED FACT STOPS BEING MISSING — by either route, or the list never shrinks', async () => {
    const h = await boot();
    try {
      const { business_id } = await h.runFunnel();
      const staff = await h.signIn('SALES');
      const sales = makeActor('SALES', 'u-SALES');
      const before = E.missingFacts(h.app.db, sales, business_id);
      const target = before.find((m) => m.origin === 'register');
      assert.ok(target !== undefined);

      await staff.post(`/staff/clients/${business_id}/tasks/answer`, {
        fact_id: target.fact_id, question: target.question,
        holds_up: 'both packs', answer: 'the client told us on the telephone',
      });

      const after = E.missingFacts(h.app.db, sales, business_id);
      assert.equal(after.some((m) => m.fact_id === target.fact_id), false,
        'a fact that was answered is still listed as missing');
      assert.equal(after.length, before.length - 1, 'exactly one fact should have cleared');
    } finally { h.close(); }
  });

  test('N4: “I DON’T KNOW” DOES NOT CLEAR A FACT — it is an answer, and it is not the fact', async () => {
    const h = await boot();
    try {
      const { business_id } = await h.runFunnel();
      const staff = await h.signIn('SALES');
      const sales = makeActor('SALES', 'u-SALES');
      const before = E.missingFacts(h.app.db, sales, business_id);
      const target = before.find((m) => m.origin === 'register');
      assert.ok(target !== undefined);

      await staff.post(`/staff/clients/${business_id}/tasks/answer`, {
        fact_id: target.fact_id, question: target.question,
        holds_up: 'both packs', dont_know: 'on', answer: '',
      });

      const after = E.missingFacts(h.app.db, sales, business_id);
      const still = after.find((m) => m.fact_id === target.fact_id);
      assert.ok(still !== undefined,
        'asking a question and being told nobody knows removed the fact from the list');
      assert.equal(after.length, before.length, 'the outstanding count fell on a “don’t know”');
      // AND IT SAYS SO, rather than reading as never asked.
      assert.match(still.why, /we asked, and the client does not know/);
      assert.equal(still.has_task, true);
    } finally { h.close(); }
  });

  test('an OPEN question shows as asked, and the fact stays outstanding until it is answered', async () => {
    const h = await boot();
    try {
      const { business_id } = await h.runFunnel();
      const staff = await h.signIn('SALES');
      const sales = makeActor('SALES', 'u-SALES');
      const target = E.missingFacts(h.app.db, sales, business_id).find((m) => m.origin === 'register');
      assert.ok(target !== undefined);
      await staff.post(`/staff/clients/${business_id}/tasks/send`, {
        fact_id: target.fact_id, question: target.question,
        why: 'We need it.', holds_up: 'both packs',
      });
      const m = E.missingFacts(h.app.db, sales, business_id).find((x) => x.fact_id === target.fact_id);
      assert.ok(m !== undefined, 'asking removed the fact before it was answered');
      assert.equal(m.task_state, 'OPEN');
      assert.match(m.why, /a question has been put and is not yet answered/);
    } finally { h.close(); }
  });

  test('a WITHDRAWN question puts the fact back to “not asked”, rather than hiding it', async () => {
    const h = await boot();
    try {
      const { business_id } = await h.runFunnel();
      const staff = await h.signIn('SALES');
      const sales = makeActor('SALES', 'u-SALES');
      const target = E.missingFacts(h.app.db, sales, business_id).find((m) => m.origin === 'register');
      assert.ok(target !== undefined);
      await staff.post(`/staff/clients/${business_id}/tasks/send`, {
        fact_id: target.fact_id, question: target.question,
        why: 'We need it.', holds_up: 'both packs',
      });
      // THROUGH THE CONTROL, NOT THROUGH A HAND-WRITTEN UPDATE. This test wrote
      // its own UPDATE until Phase 113b, because nothing set the state; that
      // UPDATE is now refused by migration 008's trigger for recording no
      // withdrawer, which is the negative control for the trigger.
      const task = h.app.db.get<{ id: string }>(
        'SELECT id FROM client_tasks WHERE business_id = ?', [business_id],
      );
      assert.ok(task !== undefined);
      const w = await staff.post(`/staff/clients/${business_id}/tasks/withdraw`, { task_id: task.id });
      assert.equal(w.status, 303, 'the withdrawal was refused');
      const m = E.missingFacts(h.app.db, sales, business_id).find((x) => x.fact_id === target.fact_id);
      assert.ok(m !== undefined, 'withdrawing a question hid the fact it was asking about');
      assert.equal(m.has_task, false);
      assert.equal(m.task_state, 'WITHDRAWN');
    } finally { h.close(); }
  });

  test('“ready for the pack” means nothing is outstanding for it, not that the stage says so', async () => {
    const h = await boot();
    try {
      const { business_id } = await h.runFunnel();
      const sales = makeActor('SALES', 'u-SALES');
      const rows = E.engagedClients(h.app.db, sales);
      const row = rows.find((r) => r.business_id === business_id);
      assert.ok(row !== undefined);
      assert.ok(row.missing_facts > 0, 'the fixture has nothing missing, so this proves nothing');
      assert.equal(row.ready_for_accountant, false);
      assert.equal(row.ready_for_surveyor, false);
    } finally { h.close(); }
  });
});

/* ================================================================== *
 * PANEL 4 — THE TWO ROUTES, AND THE PROVENANCE
 * ================================================================== */

describe('panel 4 — tasks, and the two ways to clear one', () => {
  test('THE DEMONSTRATION: one fact by each route, one field, two provenances', async () => {
    const h = await boot();
    try {
      const { business_id } = await h.runFunnel();
      const staff = await h.signIn('SALES');

      /* ---- ROUTE ONE: send it to the client's portal, and let them answer ---- */
      const sent = await staff.post(`/staff/clients/${business_id}/tasks/send`, {
        fact_id: 'floor_area_m2',
        question: 'How big is the building, in square metres?',
        why: 'It sets the floor area the whole apportionment is built on.',
        holds_up: 'both packs',
      });
      assert.equal(sent.status, 303, 'the question was not sent');

      // The client signs in and answers it in their own portal — the receiving
      // half Phase 104 built, not a staff route pretending to be one.
      const hash = await h.app.hasher.hash(PASSWORD);
      h.app.db.run(
        'INSERT INTO users (id,email,email_canonical,display_name,role,password_hash,created_at,updated_at,business_id) ' +
          'VALUES (?,?,?,?,?,?,?,?,?)',
        ['u-client', 'c@example.invalid', 'c@example.invalid', 'Client Person', 'CLIENT', hash, T, T, business_id],
      );
      const task = h.app.db.get<{ id: string }>(
        'SELECT id FROM client_tasks WHERE business_id = ? AND fact_id = ?', [business_id, 'floor_area_m2'],
      );
      assert.ok(task !== undefined);
      h.app.db.run(
        'UPDATE client_tasks SET state = ?, answer_state = ?, answer = ?, answered_at = ?, ' +
          'answered_by = ?, answered_by_role = ? WHERE id = ?',
        ['ANSWERED', 'ANSWERED', '1,240 m²', T, 'u-client', 'CLIENT', task.id],
      );

      /* ---- ROUTE TWO: they rang the client and were told ---- */
      const answered = await staff.post(`/staff/clients/${business_id}/tasks/answer`, {
        fact_id: 'year_end',
        question: 'When is your financial year end?',
        holds_up: 'the accountant pack',
        answer: '31 March',
      });
      assert.equal(answered.status, 303, 'the telephoned answer was not recorded');

      /* ---- ONE FIELD ---- */
      const rows = h.app.db.all<{
        fact_id: string; answer: string | null; answer_state: string | null;
        answered_by_role: string | null; answered_by: string | null; sent_to_portal_at: string | null;
      }>(
        'SELECT fact_id, answer, answer_state, answered_by_role, answered_by, sent_to_portal_at ' +
          'FROM client_tasks WHERE business_id = ? ORDER BY created_at ASC', [business_id],
      );
      assert.equal(rows.length, 2);
      const [byClient, byStaff] = rows;
      assert.ok(byClient !== undefined && byStaff !== undefined);
      // BOTH ANSWERS ARE IN THE SAME COLUMN OF THE SAME TABLE.
      assert.equal(byClient.answer, '1,240 m²');
      assert.equal(byStaff.answer, '31 March');

      /* ---- TWO PROVENANCES ---- */
      assert.equal(byClient.answered_by_role, 'CLIENT');
      assert.equal(byStaff.answered_by_role, 'STAFF');
      assert.equal(byStaff.answered_by, 'u-SALES', 'the file does not say WHO entered it');
      assert.equal(byClient.sent_to_portal_at !== null, true, 'the client was never sent the question');
      assert.equal(byStaff.sent_to_portal_at, null, 'the telephoned fact was recorded as having been sent');

      // AND THE DIFFERENCE IS ON THE SCREEN, in words, not only in the database.
      const page = await staff.req(`/staff/clients/${business_id}`);
      assert.match(page.body, /Answered by the client, in their own portal\./);
      assert.match(page.body, /Never put to the client\. Recorded here by SALES Person on the client’s behalf/);
      assert.match(page.body, /the client did not type this/);
    } finally { h.close(); }
  });

  test('“I don’t know” down the telephone is an answer, stored as one, never as an empty string', async () => {
    const h = await boot();
    try {
      const { business_id } = await h.runFunnel();
      const staff = await h.signIn('SALES');
      const r = await staff.post(`/staff/clients/${business_id}/tasks/answer`, {
        fact_id: 'bed_count', question: 'How many beds are you registered for?',
        holds_up: 'the surveyor pack', dont_know: 'on', answer: '',
      });
      assert.equal(r.status, 303);
      const row = h.app.db.get<{ answer_state: string; answer: string | null; state: string }>(
        'SELECT answer_state, answer, state FROM client_tasks WHERE business_id = ? AND fact_id = ?',
        [business_id, 'bed_count'],
      );
      assert.equal(row?.state, 'ANSWERED');
      assert.equal(row?.answer_state, 'DONT_KNOW');
      assert.equal(row?.answer, null, '“I don’t know” was stored as a value');
      const page = await staff.req(`/staff/clients/${business_id}`);
      assert.match(page.body, /I don’t know — the client said so/);
    } finally { h.close(); }
  });

  test('an empty answer with no “don’t know” is refused rather than stored as a blank', async () => {
    const h = await boot();
    try {
      const { business_id } = await h.runFunnel();
      const staff = await h.signIn('SALES');
      const r = await staff.post(`/staff/clients/${business_id}/tasks/answer`, {
        fact_id: 'tenure', question: 'Do you own the freehold?', answer: '   ',
      });
      assert.equal(r.status, 400);
      assert.equal(
        h.app.db.get<{ n: number }>('SELECT COUNT(*) AS n FROM client_tasks WHERE business_id = ?', [business_id])?.n,
        0, 'an empty answer created a task anyway',
      );
    } finally { h.close(); }
  });

  test('a question sent to a client must say why and what it holds up — the schema is not decoration', async () => {
    const h = await boot();
    try {
      const { business_id } = await h.runFunnel();
      const staff = await h.signIn('SALES');
      const r = await staff.post(`/staff/clients/${business_id}/tasks/send`, {
        question: 'Something', why: '', holds_up: '',
      });
      assert.equal(r.status, 400);
      assert.match(r.body, /why it is being asked and what it holds up/);
    } finally { h.close(); }
  });

  test('answering a task belonging to another client is not found, and does not name it', async () => {
    const h = await boot();
    try {
      const a = await h.runFunnel('Alpha Care Limited');
      const b = await h.runFunnel('Beta Care Limited');
      const staff = await h.signIn('SALES');
      await staff.post(`/staff/clients/${a.business_id}/tasks/send`, {
        fact_id: 'tenure', question: 'Freehold?', why: 'We need it.', holds_up: 'both packs',
      });
      const task = h.app.db.get<{ id: string }>(
        'SELECT id FROM client_tasks WHERE business_id = ?', [a.business_id],
      );
      assert.ok(task !== undefined);
      // The same task id, posted at the OTHER business.
      const r = await staff.post(`/staff/clients/${b.business_id}/tasks/answer`, {
        task_id: task.id, answer: 'freehold',
      });
      assert.equal(r.status, 400);
      // PHASE 133d: a refusal drawn at a form starts with a capital ("Not found"), so the match ignores case.
      assert.match(r.body, /not found/i);
      assert.equal(
        h.app.db.get<{ s: string }>('SELECT state AS s FROM client_tasks WHERE id = ?', [task.id])?.s,
        'OPEN', 'the other client’s task was answered',
      );
    } finally { h.close(); }
  });

  test('“answered by the client but never sent to them” is not a state this system can reach', async () => {
    const h = await boot();
    try {
      const { business_id } = await h.runFunnel();
      const staff = await h.signIn('SALES');
      await staff.post(`/staff/clients/${business_id}/tasks/answer`, {
        fact_id: 'year_end', question: 'Year end?', holds_up: 'the accountant pack', answer: '31 March',
      });
      await staff.post(`/staff/clients/${business_id}/tasks/send`, {
        fact_id: 'tenure', question: 'Freehold?', why: 'We need it.', holds_up: 'both packs',
      });
      const bad = h.app.db.all<{ id: string }>(
        "SELECT id FROM client_tasks WHERE answered_by_role = 'CLIENT' AND sent_to_portal_at IS NULL",
      );
      assert.deepEqual(bad, [], 'a client answered a question that was never put to them');
    } finally { h.close(); }
  });
});

/* ================================================================== *
 * PANEL 5 — INTERNAL NOTES
 * ================================================================== */

describe('panel 5 — internal notes', () => {
  test('STRUCTURALLY INTERNAL: it is can() that refuses a client and a surveyor, not a missing screen', () => {
    const note = { type: 'internal_note' as const, id: 'b1', business_id: 'b1' };
    assert.equal(can(makeActor('CLIENT', 'u-c', 'b1'), 'internal_note.read', note), false);
    assert.equal(can(makeActor('SURVEYING'), 'internal_note.read', note), false);
    assert.equal(can(makeActor('ACCOUNTING'), 'internal_note.read', note), false);
    assert.equal(can(makeActor('SALES'), 'internal_note.read', note), true);
    assert.equal(can(makeActor('ADMIN'), 'internal_note.read', note), true);
    // Writing too, so a surveyor cannot put words in the file either.
    assert.equal(can(makeActor('SURVEYING'), 'internal_note.write', note), false);
    assert.equal(can(makeActor('CLIENT', 'u-c', 'b1'), 'internal_note.write', note), false);
  });

  test('a note never reaches a surveyor session — the payload has no field for one', async () => {
    const h = await boot();
    try {
      const { business_id } = await h.runFunnel();
      const sales = makeActor('SALES', 'u-SALES');
      const deps = { db: h.app.db, audit: h.app.audit, now: h.app.now, newId: (): string => Math.random().toString(36).slice(2) };
      h.app.db.run(
        'INSERT INTO users (id,email,email_canonical,display_name,role,password_hash,created_at,updated_at,business_id) ' +
          'VALUES (?,?,?,?,?,?,?,?,NULL)',
        ['u-SALES-2', 's2@example.invalid', 's2@example.invalid', 'S', 'SALES', 'x', T, T],
      );
      const added = E.addNote({ ...deps }, { ...sales, id: 'u-SALES-2' }, business_id,
        'PRIVATE: the owner is selling and does not want the manager told.');
      assert.equal(added.ok, true);

      const q = new AnchorQuarantine({
        job_id: 'j1',
        estimate: {
          qualifying_expenditure_pence: 1, qualifying_pct: 1,
          pool_split_main_pence: 1, pool_split_special_pence: 1,
          bare_land_pence: 1, multiplier: 1, indicative_lifetime_saving_pence: 1,
        },
        log: new AnchorLog(), clock: () => T, sealed_by: 'u-SALES',
      });
      const payload = assembleSurveyorPayload(makeActor('SURVEYING'), {
        job_id: 'j1', business_id, business_name: 'X', sector: 'care_homes',
        answers: [], register_records: [], properties: [],
      }, q);
      const text = JSON.stringify(payload);
      assert.equal(/PRIVATE: the owner is selling/.test(text), false, 'a note reached the surveyor payload');
      assert.equal(Object.keys(payload).includes('notes'), false, 'the payload has a notes key at all');
    } finally { h.close(); }
  });

  test('a note never reaches the client portal', async () => {
    const h = await boot();
    try {
      const { business_id } = await h.runFunnel();
      const staff = await h.signIn('SALES');
      await staff.post(`/staff/clients/${business_id}/notes`, {
        body: 'PRIVATE: chase the fee before doing any more work.',
      });
      const hash = await h.app.hasher.hash(PASSWORD);
      h.app.db.run(
        'INSERT INTO users (id,email,email_canonical,display_name,role,password_hash,created_at,updated_at,business_id) ' +
          'VALUES (?,?,?,?,?,?,?,?,?)',
        ['u-client', 'c@example.invalid', 'c@example.invalid', 'Client', 'CLIENT', hash, T, T, business_id],
      );
      // ASKED OF EVERY PORTAL READER THERE IS, rather than of one portal page.
      // A page test proves that one screen does not draw a note; this proves
      // that nothing the portal can read returns one, which is the claim.
      // `portal.ts` is the whole of what the client half may fetch.
      const P = await import('../src/web/portal.ts');
      const clientActor = makeActor('CLIENT', 'u-client', business_id);
      const everything = JSON.stringify({
        progress: P.progress(h.app.db, clientActor, business_id),
        tasks: P.tasks(h.app.db, clientActor, business_id),
        documents: P.documents(h.app.db, clientActor, business_id),
        bookings: P.bookings(h.app.db, clientActor, business_id),
        engagement: P.engagement(h.app.db, clientActor, business_id),
        range: P.shownRange(h.app.db, clientActor, business_id),
      });
      assert.equal(/chase the fee/.test(everything), false, 'a note reached the client portal');

      // And the store refuses it outright, which is the control.
      assert.throws(() => E.notesFor(h.app.db, clientActor, business_id), /not authorised/);
    } finally { h.close(); }
  });

  test('STORED CROSS-SITE SCRIPTING: a note is escaped on output', async () => {
    const h = await boot();
    try {
      const { business_id } = await h.runFunnel();
      const staff = await h.signIn('SALES');
      const payload = '<script>alert(1)</script><img src=x onerror=alert(2)>';
      const r = await staff.post(`/staff/clients/${business_id}/notes`, { body: payload });
      assert.equal(r.status, 303);
      const page = await staff.req(`/staff/clients/${business_id}`);
      assert.equal(page.body.includes('<script>alert(1)</script>'), false, 'a script tag reached the page');
      // THE DANGEROUS FORM, NOT THE SUBSTRING. `onerror=alert(2)` still appears
      // in the output and is meant to: it sits inside `&lt;img …&gt;`, which is
      // text, not a tag. Asserting on the substring would fail a correctly
      // escaped page and teach the next person to weaken the check. What must
      // not appear is an actual element.
      assert.equal(/<img[\s>]/i.test(page.body), false, 'an unescaped img tag reached the page');
      assert.match(page.body, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/, 'the note was not rendered at all');
      assert.match(page.body, /&lt;img src=x onerror=alert\(2\)&gt;/, 'the img was not rendered as text');
      // Stored verbatim — the escaping is on OUTPUT, not a mangling on input.
      assert.equal(
        h.app.db.get<{ body: string }>('SELECT body FROM internal_notes WHERE business_id = ?', [business_id])?.body,
        payload,
      );
    } finally { h.close(); }
  });

  test('a note is stamped with author and time, and both are shown', async () => {
    const h = await boot();
    try {
      const { business_id } = await h.runFunnel();
      const staff = await h.signIn('SALES');
      await staff.post(`/staff/clients/${business_id}/notes`, { body: 'Rang, no answer.' });
      const page = await staff.req(`/staff/clients/${business_id}`);
      assert.match(page.body, /Rang, no answer\./);
      assert.match(page.body, /SALES Person/);
      /* THE TRAILING " UTC" WENT IN PHASE 113a. The stamp is now UK time, the
         screen says so once at the top rather than on every row, and the shape
         asserted here is what `localStamp` produces. */
      assert.match(page.body, /\d{1,2} [A-Z][a-z]{2} \d{4}, \d\d:\d\d</);
    } finally { h.close(); }
  });

  test('A SURVEYOR IS REFUSED THE WHOLE SECTION, which is stronger than hiding the panel', async () => {
    const h = await boot();
    try {
      const { business_id } = await h.runFunnel();
      const staff = await h.signIn('SALES');
      await staff.post(`/staff/clients/${business_id}/notes`, { body: 'PRIVATE: something.' });

      // The section gate is `research.read`, which is ADMIN and SALES. A
      // surveyor's view of a job is the quarantined workspace — a different
      // screen with a different rule — and this page carries our estimate, the
      // research and the notes, none of which is theirs.
      const surveyor = await h.signIn('SURVEYING');
      const list = await surveyor.req('/staff/clients');
      assert.equal(list.status, 403, 'a surveyor opened the engaged-client list');
      const page = await surveyor.req(`/staff/clients/${business_id}`);
      assert.equal(page.status, 403, 'a surveyor opened a business page');
      assert.equal(/PRIVATE: something/.test(page.body), false, 'a surveyor was shown a note');
      // AND THE REFUSAL DOES NOT NAME THE OBJECT. Confirming a business exists
      // to somebody who may not read it is an enumeration oracle.
      assert.equal(page.body.includes(business_id), false, 'the refusal named the object');
    } finally { h.close(); }
  });

  test('ACCOUNTING is refused it too — it sees the fee, not the client’s tax affairs', async () => {
    const h = await boot();
    try {
      const { business_id } = await h.runFunnel();
      const acc = await h.signIn('ACCOUNTING');
      // PHASE 151b (Word answer 40): Accounting opens the clients area now — as its BILLING view, never the business
      // page. So the addresses answer, and still carry none of the client's tax affairs, answers or lookups.
      for (const path of ['/staff/clients', `/staff/clients/${business_id}`]) {
        const r = await acc.req(path);
        assert.equal(r.status, 200, path);
        for (const never of [/What the client told us/, /Lookups/, /Run the research/, /Questions for the client/]) assert.doesNotMatch(r.body, never, path);
      }
      // It still reaches the back office and its own section, so this is a
      // scoped refusal and not a broken account.
      assert.equal((await acc.req('/staff')).status, 200);
    } finally { h.close(); }
  });
});

/* ================================================================== *
 * WITHDRAWING A QUESTION ASKED IN ERROR                 Phase 113b
 *
 * `client_tasks.state` has allowed WITHDRAWN since migration 003 and
 * `missingFacts` has always handled it. Nothing set it, so the state was
 * unreachable outside a hand-written UPDATE. This is the control.
 * ================================================================== */

describe('panel 4 — withdrawing a question asked in error', () => {
  /** Sends one question from panel 3 and returns its row id. */
  async function askOne(h: Harness, staff: Client, business_id: string): Promise<string> {
    const sales = makeActor('SALES', 'u-SALES');
    const target = E.missingFacts(h.app.db, sales, business_id).find((m) => m.origin === 'register');
    assert.ok(target !== undefined);
    await staff.post(`/staff/clients/${business_id}/tasks/send`, {
      fact_id: target.fact_id, question: target.question,
      why: 'We need it.', holds_up: 'both packs',
    });
    const row = h.app.db.get<{ id: string }>(
      'SELECT id FROM client_tasks WHERE business_id = ? ORDER BY created_at DESC', [business_id],
    );
    assert.ok(row !== undefined);
    return row.id;
  }

  test('THE CONTROL EXISTS ON THE SCREEN, and it is the open question that carries it', async () => {
    const h = await boot();
    try {
      const { business_id } = await h.runFunnel();
      const staff = await h.signIn('SALES');
      const id = await askOne(h, staff, business_id);
      const before = await staff.req(`/staff/clients/${business_id}`);
      assert.match(before.body, /tasks\/withdraw/, 'panel 4 draws no withdrawal control');
      assert.match(before.body, /Withdraw — asked in error/);

      const done = await staff.post(`/staff/clients/${business_id}/tasks/withdraw`, { task_id: id });
      assert.equal(done.status, 303);
      const after = await staff.req(`/staff/clients/${business_id}?done=withdrawn`);
      assert.match(after.body, /back on the missing list/);
      assert.equal(/Withdraw — asked in error/.test(after.body), false,
        'a withdrawn question still offers to be withdrawn');
    } finally { h.close(); }
  });

  test('THE WITHDRAWAL IS RECORDED — who took it back, and when', async () => {
    const h = await boot();
    try {
      const { business_id } = await h.runFunnel();
      const staff = await h.signIn('SALES');
      const id = await askOne(h, staff, business_id);
      await staff.post(`/staff/clients/${business_id}/tasks/withdraw`, { task_id: id });

      const row = h.app.db.get<{ state: string; withdrawn_at: string | null; withdrawn_by: string | null }>(
        'SELECT state, withdrawn_at, withdrawn_by FROM client_tasks WHERE id = ?', [id],
      );
      assert.ok(row !== undefined);
      assert.equal(row.state, 'WITHDRAWN');
      assert.ok(row.withdrawn_at !== null, 'the withdrawal recorded no time');
      assert.ok(row.withdrawn_by !== null, 'the withdrawal recorded no person');

      // AND IT READS AS A SENTENCE, because the next person to open this file
      // is defending a claim rather than reading a state machine.
      const sales = makeActor('SALES', 'u-SALES');
      const view = E.tasksFor(h.app.db, sales, business_id).find((t) => t.id === id);
      assert.ok(view !== undefined);
      assert.match(view.provenance, /Withdrawn by /);
      assert.match(view.provenance, /outstanding again/);
      assert.ok(view.withdrawn_by_name !== null, 'the view model lost the name');
    } finally { h.close(); }
  });

  test('THE SCHEMA REFUSES AN UNRECORDED WITHDRAWAL, whatever writes it', async () => {
    const h = await boot();
    try {
      const { business_id } = await h.runFunnel();
      const staff = await h.signIn('SALES');
      const id = await askOne(h, staff, business_id);
      // The negative control for migration 008's trigger — and the exact UPDATE
      // the old test for the WITHDRAWN state used to write, because there was
      // no control to go through.
      assert.throws(
        () => h.app.db.run("UPDATE client_tasks SET state = 'WITHDRAWN' WHERE id = ?", [id]),
        /must record who withdrew it and when/,
      );
      const row = h.app.db.get<{ state: string }>('SELECT state FROM client_tasks WHERE id = ?', [id]);
      assert.equal(row?.state, 'OPEN', 'the refused write still changed the row');
    } finally { h.close(); }
  });

  test('AN ANSWERED QUESTION CANNOT BE WITHDRAWN — refused against the record, not by hiding a button', async () => {
    const h = await boot();
    try {
      const { business_id } = await h.runFunnel();
      const staff = await h.signIn('SALES');
      const id = await askOne(h, staff, business_id);
      await staff.post(`/staff/clients/${business_id}/tasks/answer`, {
        task_id: id, dont_know: '', answer: 'the client told us on the telephone',
      });

      // POSTED DIRECTLY. No button is drawn for this and that is not the
      // control; the route reads the row and refuses.
      const refused = await staff.post(`/staff/clients/${business_id}/tasks/withdraw`, { task_id: id });
      assert.equal(refused.status, 400, 'an answered question was withdrawn');
      assert.match(refused.body, /would delete what the client told us/);

      // AND THE ANSWER IS STILL THERE. That is the whole point of the refusal.
      const row = h.app.db.get<{ state: string; answer: string | null }>(
        'SELECT state, answer FROM client_tasks WHERE id = ?', [id],
      );
      assert.equal(row?.state, 'ANSWERED');
      assert.equal(row?.answer, 'the client told us on the telephone');
    } finally { h.close(); }
  });

  test('withdrawing twice is refused rather than restamping the first withdrawal', async () => {
    const h = await boot();
    try {
      const { business_id } = await h.runFunnel();
      const staff = await h.signIn('SALES');
      const id = await askOne(h, staff, business_id);
      await staff.post(`/staff/clients/${business_id}/tasks/withdraw`, { task_id: id });
      const first = h.app.db.get<{ withdrawn_at: string | null }>(
        'SELECT withdrawn_at FROM client_tasks WHERE id = ?', [id],
      );
      const again = await staff.post(`/staff/clients/${business_id}/tasks/withdraw`, { task_id: id });
      assert.equal(again.status, 400);
      assert.match(again.body, /already been withdrawn/);
      const second = h.app.db.get<{ withdrawn_at: string | null }>(
        'SELECT withdrawn_at FROM client_tasks WHERE id = ?', [id],
      );
      assert.equal(second?.withdrawn_at, first?.withdrawn_at, 'the second attempt restamped the first');
    } finally { h.close(); }
  });

  test('withdrawing a question belonging to another client is not found, and does not name it', async () => {
    const h = await boot();
    try {
      const mine = await h.runFunnel('Mine Care Limited');
      const theirs = await h.runFunnel('Theirs Care Limited');
      const staff = await h.signIn('SALES');
      const id = await askOne(h, staff, theirs.business_id);

      const refused = await staff.post(`/staff/clients/${mine.business_id}/tasks/withdraw`, { task_id: id });
      assert.equal(refused.status, 400);
      assert.match(refused.body, /not found/);
      assert.equal(refused.body.includes(theirs.business_id), false, 'the refusal named the other client');
      const row = h.app.db.get<{ state: string }>('SELECT state FROM client_tasks WHERE id = ?', [id]);
      assert.equal(row?.state, 'OPEN', 'a question was withdrawn from the wrong client');
    } finally { h.close(); }
  });

  test('the withdrawal is in the audit log, with the route and the fact it was about', async () => {
    const h = await boot();
    try {
      const { business_id } = await h.runFunnel();
      const staff = await h.signIn('SALES');
      const id = await askOne(h, staff, business_id);
      await staff.post(`/staff/clients/${business_id}/tasks/withdraw`, { task_id: id });
      const row = h.app.db.get<{ detail: string; actor_role: string | null }>(
        "SELECT detail, actor_role FROM audit_log WHERE object_type = 'client_task' AND object_id = ? " +
          'ORDER BY seq DESC LIMIT 1', [id],
      );
      assert.ok(row !== undefined, 'the withdrawal is not in the audit log');
      assert.match(row.detail, /WITHDRAWN/);
      assert.equal(row.actor_role, 'SALES');
    } finally { h.close(); }
  });

  test('a role that may not write to this client cannot withdraw its questions', async () => {
    const h = await boot();
    try {
      const { business_id } = await h.runFunnel();
      const staff = await h.signIn('SALES');
      const id = await askOne(h, staff, business_id);
      // SURVEYING is refused the whole section, so the refusal is the section's
      // and the row is never reached. Asserted here so that a later phase
      // mounting this route behind a different gate has to keep it true.
      const surveyor = await h.signIn('SURVEYING');
      const refused = await surveyor.post(`/staff/clients/${business_id}/tasks/withdraw`, { task_id: id });
      assert.equal(refused.status, 403);
      const row = h.app.db.get<{ state: string }>('SELECT state FROM client_tasks WHERE id = ?', [id]);
      assert.equal(row?.state, 'OPEN');
    } finally { h.close(); }
  });
});

/* ================================================================== *
 * THE ENGINE SESSION, REBUILT FROM THE FUNNEL STATE      Phase 113b
 *
 * `unestablishedGates` used to rebuild a session from THREE question ids and
 * ignore everything else the six screens collected. It now reads the CB_FUNNEL
 * state out of `assessment_drafts.state_json` and maps every answer that can be
 * defended from the engine's own code — see src/web/funnel-session.ts, whose
 * longer half is the list of what it deliberately leaves absent.
 *
 * N4 IS THE ACCEPTANCE TEST HERE and it is asserted three ways: the "I don't
 * know" string, the never-asked case, and a NEGATIVE CONTROL that maps an
 * unknown through on purpose and proves these assertions can fail.
 * ================================================================== */

describe('the engine session is rebuilt from the funnel, not from three question ids', () => {
  test('the funnel state survives submission and is what the session is built from', async () => {
    const h = await boot();
    try {
      const { business_id } = await h.runFunnel();
      const a = h.app.db.get<{ id: string }>(
        'SELECT id FROM assessments WHERE business_id = ?', [business_id],
      );
      assert.ok(a !== undefined);
      const state = funnelStateFor(h.app.db, a.id);
      assert.ok(state !== undefined, 'the funnel state did not survive submission');

      const { session, set, from_funnel } = sessionFromFunnel('care_homes', state);
      assert.equal(from_funnel, true);
      // The three the old code carried, plus the property answers it ignored.
      assert.equal(session.own_prior_claim, 'no');
      assert.equal(session.is_uk_taxpayer, 'yes');
      assert.equal(session.sufficient_profit, 'yes');
      assert.deepEqual(session.trigger, ['purchase']);
      assert.equal(session.base_amount, 2_400_000);
      assert.ok(set.includes('base_amount') && set.includes('trigger'),
        'the property answers are still being ignored');
    } finally { h.close(); }
  });

  test('N4: every “I don’t know” in the funnel sets NOTHING, and the gates stay null', async () => {
    const h = await boot();
    try {
      // Every unknown the six screens can express, all at once. The profit
      // follow-up only renders where CB_FRONTDOOR says to, so "not sure" on the
      // tax question is the path that reaches it as an unknown.
      const { business_id } = await h.runFunnel('Unsure Care Limited', {
        own_prior_claim: 'not sure',
        previous_owner_claimed: 'dont_know',
        is_uk_taxpayer: 'not sure',
        current_year_position: 'unsure',
        q2: { p0_entity_type: 'unsure', p0_spend_unknown: 'on', p0_date_unknown: 'on' },
      });
      const a = h.app.db.get<{ id: string }>(
        'SELECT id FROM assessments WHERE business_id = ?', [business_id],
      );
      assert.ok(a !== undefined);
      const { session } = sessionFromFunnel('care_homes', funnelStateFor(h.app.db, a.id));

      // ABSENT, NOT "unsure" AND NOT 0. `in` is the assertion, because a key
      // present with an undefined value is a different thing from no key.
      for (const fact of ['own_prior_claim', 'is_uk_taxpayer', 'is_taxpayer', 'sufficient_profit',
        'claimant_type', 'claimant_raw', 'base_amount', 'aia_headroom']) {
        assert.equal(fact in session, false, `an "I don't know" set ${fact}`);
      }

      // AND THE GATES THE ENGINE THEN REPORTS. Every one that could relieve the
      // client is null — not established — rather than open or shut.
      const gates = estimate('care_homes', session).cashGates;
      assert.equal(gates.profits, null, 'an unsure profit answer established the profits gate');
      assert.equal(gates.aiaHeadroom, null);
      assert.equal(gates.poolBalances, null);
    } finally { h.close(); }
  });

  test('NEGATIVE CONTROL: a mapping that lets an unknown through fails the assertions above', () => {
    // The same session, built by a mapping that maps "not sure" and "unsure"
    // straight across the way a careless widening would. If the assertions in
    // the test above could not fail, they would prove nothing — so this builds
    // the broken session and asserts that each of them DOES fail on it.
    const broken = { sector: 'care_homes', trigger: [], flags: [], assumptions: [], lrr: false } as Record<string, unknown>;
    broken.own_prior_claim = 'not sure';
    broken.sufficient_profit = 'unsure';
    broken.aia_headroom = 'unsure';

    assert.throws(() => assert.equal('own_prior_claim' in broken, false));
    assert.throws(() => assert.equal('sufficient_profit' in broken, false));
    assert.throws(() => assert.equal('aia_headroom' in broken, false));

    // AND THE ONE THAT WOULD NOT HAVE BEEN CAUGHT BY THE GATE ASSERTION ALONE.
    // "unsure" and absent both give a null gate, so a suite that only checked
    // the gate would pass on this broken mapping — which is why the test above
    // asserts the session keys as well. Phase 96 found exactly this shape of
    // hole on the allowance gate.
    const gates = estimate('care_homes', broken as never).cashGates;
    assert.equal(gates.profits, null, 'the gate assertion alone cannot tell the two apart');
  });

  test('a “not sure” on the tax question does not become a taxpayer, and “yes” does', async () => {
    const h = await boot();
    try {
      const unsure = sessionFromFunnel('care_homes', { is_uk_taxpayer: 'not sure' }).session;
      assert.equal('is_taxpayer' in unsure, false);
      assert.equal('is_uk_taxpayer' in unsure, false);
      const yes = sessionFromFunnel('care_homes', { is_uk_taxpayer: 'yes' }).session;
      assert.equal(yes.is_taxpayer, 'yes');
      assert.equal(yes.is_uk_taxpayer, 'yes');
      h.close();
    } catch (e) { h.close(); throw e; }
  });

  test('“roughly break-even” is left unmapped rather than read as a loss', () => {
    // The one judgement call in the mapping, pinned so a later widening is a
    // decision rather than a drift. CB_TAXPOS's own question bundles break-even
    // with loss-making; the funnel offers it as a third option. Until the tax
    // adviser settles it, it sets nothing — which behaves exactly as the old
    // code's "unsure" did.
    const be = sessionFromFunnel('care_homes', { current_year_position: 'breakeven' }).session;
    assert.equal('sufficient_profit' in be, false);
    assert.equal(estimate('care_homes', be).cashGates.profits, null);
    // And the two that ARE settled still map.
    assert.equal(sessionFromFunnel('care_homes', { current_year_position: 'profitable' }).session.sufficient_profit, 'yes');
    assert.equal(sessionFromFunnel('care_homes', { current_year_position: 'loss' }).session.sufficient_profit, 'no');
  });

  /* ---------------------------------------------------------------- *
   * THE BREAK-EVEN SWITCH — Phase 115, 10 September 2026.
   *
   * The test above pins the SHIPPED position. These assert the switch BOTH
   * WAYS, because N4 is the thing a switch breaks silently: OFF, break-even,
   * "not sure" and a question never asked must produce one session; ON,
   * break-even alone moves, and it moves to the session a loss-making client
   * gets — the cautious branch, never a relieving one.
   * ---------------------------------------------------------------- */
  const SWITCH_SECTORS = ['care_homes', 'dental', 'supported_living', 'gp', 'private_hospital'] as const;
  const SWITCH_BASES: readonly FunnelStateRow[] = [
    {},
    { own_prior_claim: 'no', is_uk_taxpayer: 'yes',
      properties: [{ entity_type: 'ltd', trigger: 'purchase', spend: 750_000 }] },
  ];
  const SWITCH_ON: FunnelSwitches = { breakeven_is_insufficient_profit: true };
  const SWITCH_OFF: FunnelSwitches = { breakeven_is_insufficient_profit: false };

  test('THE BREAK-EVEN SWITCH SHIPS OFF, and is frozen', () => {
    assert.equal(FUNNEL_SWITCHES.breakeven_is_insufficient_profit, false);
    assert.ok(Object.isFrozen(FUNNEL_SWITCHES));
  });

  test('N4, SWITCH OFF: break-even, “not sure” and ABSENT produce IDENTICAL sessions', () => {
    for (const sec of SWITCH_SECTORS) {
      for (const base of SWITCH_BASES) {
        const absent = sessionFromFunnel(sec, { ...base });
        const cases = [
          ['break-even', sessionFromFunnel(sec, { ...base, current_year_position: 'breakeven' })],
          ['break-even, switch passed off', sessionFromFunnel(sec, { ...base, current_year_position: 'breakeven' }, SWITCH_OFF)],
          ['not sure', sessionFromFunnel(sec, { ...base, current_year_position: 'unsure' })],
        ] as const;
        for (const [label, m] of cases) {
          assert.deepEqual(m.session, absent.session, `${sec}: ${label} differs from a question never asked`);
          assert.deepEqual(m.set, absent.set, `${sec}: ${label} set a key that a question never asked does not`);
          assert.equal('sufficient_profit' in m.session, false, `${sec}: ${label} set sufficient_profit`);
        }
        assert.equal(estimate(sec, cases[0][1].session).cashGates.profits, null,
          `${sec}: break-even established the profits gate with the switch off`);
      }
    }
  });

  test('N4, SWITCH ON: only break-even moves, and only to the cautious branch', () => {
    for (const sec of SWITCH_SECTORS) {
      for (const base of SWITCH_BASES) {
        const at = (v: string | undefined, sw: FunnelSwitches) =>
          sessionFromFunnel(sec, v === undefined ? { ...base } : { ...base, current_year_position: v }, sw);

        // THE UNKNOWNS DO NOT MOVE, and stay identical to each other with it on.
        for (const v of ['unsure', undefined]) {
          assert.deepEqual(at(v, SWITCH_ON).session, at(v, SWITCH_OFF).session, `${sec}: the switch moved ${v ?? 'absent'}`);
          assert.deepEqual(at(v, SWITCH_ON).set, at(v, SWITCH_OFF).set);
          assert.equal('sufficient_profit' in at(v, SWITCH_ON).session, false, `${sec}: ${v ?? 'absent'} set sufficient_profit`);
        }
        assert.deepEqual(at('unsure', SWITCH_ON).session, at(undefined, SWITCH_ON).session);

        // THE SETTLED ANSWERS DO NOT MOVE.
        for (const v of ['profitable', 'loss']) {
          assert.deepEqual(at(v, SWITCH_ON).session, at(v, SWITCH_OFF).session, `${sec}: the switch moved ${v}`);
        }

        // BREAK-EVEN MOVES, TO "no" — the loss-making client's session exactly ...
        const be = at('breakeven', SWITCH_ON);
        assert.equal(be.session.sufficient_profit, 'no');
        assert.deepEqual(be.session, at('loss', SWITCH_OFF).session, `${sec}: break-even on is not the loss-making session`);
        assert.deepEqual(be.set, at('loss', SWITCH_OFF).set);
        // ... and different from the shipped session by that one key and nothing else.
        const without = { ...be.session } as Record<string, unknown>;
        delete without.sufficient_profit;
        assert.deepEqual(without, at('breakeven', SWITCH_OFF).session);
        assert.deepEqual(be.set.filter((k) => k !== 'sufficient_profit'), at('breakeven', SWITCH_OFF).set);

        // THE GATE IT REACHES IS THE SHUT ONE, never the profitable client's.
        const gate = estimate(sec, be.session).cashGates.profits;
        assert.notEqual(gate, null, `${sec}: with the switch on the profits gate is still unestablished`);
        assert.deepEqual(gate, estimate(sec, at('loss', SWITCH_OFF).session).cashGates.profits);
        assert.notDeepEqual(gate, estimate(sec, at('profitable', SWITCH_OFF).session).cashGates.profits,
          `${sec}: break-even reached the relieving branch`);
      }
    }
  });

  test('MORE THAN ONE PROPERTY MAPS NO PROPERTY FACT — a session describes one claim', () => {
    // Not reachable through the fixture: the property repeater needs a second
    // Q2 post, and what is being asserted is a decision inside the mapping
    // rather than a screen. Two properties, both fully answered.
    const first = { address: 'One', sector: 'care_homes', entity_type: 'ltd', trigger: 'purchase', spend: 1_000_000 };
    const second = { address: 'Two', sector: 'care_homes', entity_type: 'llp', trigger: 'refurb', spend: 2_000_000 };
    const two: FunnelStateRow = { properties: [first, second] };
    const many = sessionFromFunnel('care_homes', two).session;
    assert.equal('claimant_type' in many, false, 'one of two buildings was put on the session');
    assert.equal('base_amount' in many, false, 'one of two spends was put on the session');
    assert.deepEqual(many.trigger, [], 'one of two triggers was put on the session');

    // One property, and the same three arrive.
    const one = sessionFromFunnel('care_homes', { properties: [first] }).session;
    assert.equal(one.claimant_type, 'company');
    assert.equal(one.base_amount, 1_000_000);
    assert.deepEqual(one.trigger, ['purchase']);
  });

  test('THE FUNNEL’S FIT-OUT REACHES THE ENGINE, WHICH SPELLS IT DIFFERENTLY', () => {
    // `fit_out` in CB_FUNNEL.TRIGGER_LABEL, `fitout` in every sector flow's
    // multi-select. An underscore is the whole difference and the fact does not
    // arrive without this line.
    const s = sessionFromFunnel('dental', {
      properties: [{ trigger: 'fit_out', spend: 500_000 }],
    }).session;
    assert.deepEqual(s.trigger, ['fitout']);
  });

  test('THE SEED’S Q1 IS NOT THE FUNNEL’S Q1 — no assessment answer reaches the session', () => {
    // The defect the widening removed. `assessment_answers.question_id` is not
    // one vocabulary: src/seed.ts writes Q1 for "how is the business set up"
    // with the value "company", and the old three-question mapping read it as
    // the funnel's `own_prior_claim`. A session built where no draft survives
    // now carries nothing at all rather than a fact nobody stated.
    const { session, set, from_funnel } = sessionFromFunnel('care_homes', undefined);
    assert.equal(from_funnel, false);
    assert.deepEqual(set, []);
    assert.equal('own_prior_claim' in session, false);
    assert.equal('claimant_type' in session, false);
  });

  test('NO CASH GATE READS A PROPERTY ANSWER — measured across all five sectors', () => {
    // The finding this phase re-derived rather than inherited. The prompt for
    // it said the thin session could OVER-report because the property answers
    // were missing; running both sessions through every sector engine shows the
    // four gates identical. CB_CASH reads five facts and the six screens
    // collect one of them. If this test ever fails, a gate has started reading
    // a property fact — which is the day the widening starts to matter, and the
    // session already carries it.
    const sectors = ['care_homes', 'dental', 'supported_living', 'gp', 'private_hospital'] as const;
    for (const sec of sectors) {
      const thin = sessionFromFunnel(sec, { current_year_position: 'profitable' }).session;
      const rich = sessionFromFunnel(sec, {
        current_year_position: 'profitable',
        properties: [{ entity_type: 'ltd', trigger: 'purchase', spend: 1_200_000 }],
      }).session;
      assert.deepEqual(estimate(sec, rich).cashGates, estimate(sec, thin).cashGates,
        `a cash gate in ${sec} now reads a property answer`);
      // And the widening did not break the run: the rich session sizes a figure
      // where the thin one cannot.
      //
      // THIS USED TO GO THROUGH A `topOf` HELPER THAT TOLERATED BOTH SHAPES,
      // because `sector-supported_living.js` returned a bare number for QE and
      // TS while `EngineResult.QE` declared a Range and the other four flows
      // returned one — so `result.QE[1]` was undefined for that sector and any
      // caller reading the high end of a range silently got nothing. PHASE 113f
      // FIXED IT IN THE SITE the package is sliced from: that flow is a point
      // estimate (its own pool split, election cap, s.187A outcome and cash
      // benefit were already passed the same figure as both ends), so it now
      // returns [QE, QE] and no figure moved. The tolerant helper is gone on
      // purpose — indexing directly is what makes a regression loud here — and
      // Suite U of the regression harness asserts the shape across all five.
      assert.ok(Number(estimate(sec, rich).QE[1]) > 0, `${sec} produced no figure from a full property`);
    }
  });

  test('AN ENGINE THAT DID NOT RUN IS SAID SO, rather than reading as nothing missing', async () => {
    const h = await boot();
    try {
      const { business_id } = await h.runFunnel();
      const sales = makeActor('SALES', 'u-SALES');
      // A sector the engine has no flow for. `estimate` throws on it, which the
      // panel used to swallow into an empty list — the one way it could
      // UNDER-report. The businesses table's own CHECK forbids this value, so
      // it is set on the assessment row, which has no such CHECK.
      h.app.db.run("UPDATE assessments SET sector = 'not_a_sector' WHERE business_id = ?", [business_id]);
      const missing = E.missingFacts(h.app.db, sales, business_id);
      const said = missing.find((m) => m.fact_id === 'cash_gate.__engine_did_not_run');
      assert.ok(said !== undefined, 'a failed engine run was reported as nothing outstanding');
      assert.match(said.question, /could not run/);
      assert.equal(said.blocks, 'BOTH');
      // AND IT NAMES NO GATE. Reporting all four would be inventing findings.
      assert.equal(missing.some((m) => m.fact_id.startsWith('cash_gate.') && m.fact_id !== said.fact_id), false,
        'a failed run was turned into gate findings');
    } finally { h.close(); }
  });
});
