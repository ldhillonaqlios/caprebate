/**
 * PHASE 133d — WHAT PHASE 133c LEFT IN THE APP. 17 September 2026.
 *
 *   D1 "(REQUIRED)"   → every page every login reaches: a control carrying `required` has "(required)" in words in its
 *                       label (src/web/required.ts, applied in page()); the three ways a label is found, and a planted
 *                       unlabelled field, are checked on markup directly.
 *   D2 THE STAGE BAR  → a step is never narrower than its longest word, so a label wraps rather than being cut.
 *   D5 LABEL AND FIELD → PHASE 133e. Every required control on every page is joined to its label the way a browser and a
 *                       screen reader join them — `for`/`id`, or an enclosing `<label>` — and never by position alone.
 *   D6 BESIDE THE FIELD, THE REST → PHASE 133e. One refused post per remaining back-office form whose store refuses
 *                       about one field: finance, introducers, the claim's facts, document types, automation rules,
 *                       templates, the account settings, Create a user, and the survey job.
 *   D4 BESIDE THE FIELD → the ten most-used forms, each posted refused: the refusal names its field, the message is drawn
 *                       straight after that field (after its label), the field is aria-invalid and described by the
 *                       message, and nothing else sits between them. A refusal naming no field stays at the top.
 *
 * Like test/phase133c.test.ts, everything the phase added is imported inside the test that needs it, so this file runs
 * against the pre-change copy (the .bak-phase133d files) and each test can be seen to fail there.
 */

type RequiredModule = {
  requiredWordsInMarkup: (html: string) => string;
  requiredWithoutWords: (html: string) => string[];
  requiredLabelledByPositionOnly?: (html: string) => string[];
};
const required = async (): Promise<RequiredModule> => (await import(`../src/web/${'required'}.ts`)) as unknown as RequiredModule;

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../src/server.ts';
import { seed } from '../src/seed.ts';
import { SITE_CSS } from '../src/web/assets.ts';

type Made = Awaited<ReturnType<typeof createApp>>;
type Res = { status: number; body: string; type: string | null };
type Client = { get(path: string): Promise<Res>; post(path: string, fields: Record<string, string>): Promise<Res> };
const LOGINS = ['admin', 'sales', 'accounting', 'surveying', 'client'] as const;
type Login = (typeof LOGINS)[number];

let made: Made;
let base = '';
const clients = new Map<Login, Client>();

before(async () => {
  made = await createApp(':memory:', { documentRoot: mkdtempSync(join(tmpdir(), 'cb-133d-')) });
  await new Promise<void>((r) => made.server.listen(0, '127.0.0.1', () => r()));
  const addr = made.server.address();
  base = `http://127.0.0.1:${typeof addr === 'object' && addr !== null ? addr.port : 0}`;
  const s = await seed(made.app.db, made.app.hasher, made.app.now);
  for (const who of LOGINS) {
    const r = await fetch(`${base}/login`, {
      method: 'POST', redirect: 'manual', headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ email: `${who}@example.invalid`, password: s.password }).toString(),
    });
    assert.equal(r.status, 303, `${who} could not sign in`);
    const cookie = r.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ');
    const wrap = async (x: Response): Promise<Res> => ({ status: x.status, body: await x.text(), type: x.headers.get('content-type') });
    clients.set(who, {
      async get(path) { return wrap(await fetch(base + path, { redirect: 'manual', headers: { cookie } })); },
      async post(path, fields) {
        return wrap(await fetch(base + path, { method: 'POST', redirect: 'manual', headers: { cookie, 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(fields).toString() }));
      },
    });
  }
});
after(() => made.close());
const as = (who: Login): Client => clients.get(who) as Client;

/** Every same-origin page a login reaches, one example of each shape of address (Phase 133a's crawl). */
async function crawl(c: Client, start: string): Promise<Map<string, Res>> {
  const seen = new Map<string, Res>();
  const shapes = new Set<string>();
  const queue = [start];
  while (queue.length > 0 && seen.size < 300) {
    const u = queue.shift() ?? '';
    if (seen.has(u)) continue;
    const r = await c.get(u);
    seen.set(u, r);
    if (r.status !== 200 || !(r.type ?? '').startsWith('text/html')) continue;
    for (const x of r.body.matchAll(/href="([^"#]+)"/g)) {
      const href = (x[1] ?? '').replace(/&amp;/g, '&');
      if (!href.startsWith('/') || href.startsWith('//')) continue;
      if (/^\/(assets|logout)|\.csv(\?|$)|\.json(\?|$)|\/upload\//.test(href)) continue;
      const shape = href.replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/gi, '{id}').replace(/=[^&]*/g, '=');
      if (shapes.has(shape)) continue;
      shapes.add(shape);
      queue.push(href);
    }
  }
  return seen;
}

/* ================================================================== *
 * D1 — "(required)" in words
 * ================================================================== */

describe('D1: every required field says so in words', () => {
  test('the three ways a label is found, a label that already says it, and a field with no label at all', async () => {
    const { requiredWordsInMarkup, requiredWithoutWords } = await required();
    assert.equal(typeof requiredWordsInMarkup, 'function', 'there is no required-words pass');
    assert.equal(requiredWordsInMarkup('<label>Task <input name="title" required></label>'),
      '<label>Task <span class="req">(required)</span> <input name="title" required></label>');
    assert.equal(requiredWordsInMarkup('<p><label for="a">Plant (£)</label> <input id="a" name="a" required></p>'),
      '<p><label for="a">Plant (£) <span class="req">(required)</span></label> <input id="a" name="a" required></p>');
    assert.equal(requiredWordsInMarkup('<label class="fl">Display name</label>\n<input class="fi" name="n" required>'),
      '<label class="fl">Display name <span class="req">(required)</span></label>\n<input class="fi" name="n" required>');
    const already = '<label>Answer <span class="req">(required)</span> <select name="answer" required></select></label>';
    assert.equal(requiredWordsInMarkup(already), already, 'the words were written twice');
    assert.equal(requiredWordsInMarkup('<label>Note <input name="note"></label><input type="hidden" name="k" required>'),
      '<label>Note <input name="note"></label><input type="hidden" name="k" required>', 'an optional or hidden field was marked');
    assert.deepEqual(requiredWithoutWords('<form><input name="orphan" required></form>'), ['orphan'], 'an unlabelled required field passed');
    assert.deepEqual(requiredWithoutWords('<label>Task <input name="title" required></label>'), ['title']);
  });

  for (const who of LOGINS) {
    test(`${who}: no page it reaches has a required field without "(required)" in its label`, async () => {
      const { requiredWithoutWords } = await required();
      const pages = [...(await crawl(as(who), who === 'client' ? '/portal' : '/staff'))]
        .filter(([, r]) => r.status === 200 && (r.type ?? '').startsWith('text/html'));
      assert.ok(pages.length >= 3, `${who} reached only ${pages.length} pages`);
      let fields = 0;
      const missing: string[] = [];
      for (const [u, r] of pages) {
        fields += [...r.body.matchAll(/<(input|select|textarea)\b[^>]*\srequired(?=[\s>/=])/g)].length;
        for (const name of requiredWithoutWords(r.body)) missing.push(`${u}: ${name}`);
      }
      assert.deepEqual(missing, [], `${who}: required fields with no words`);
      if (who !== 'client') assert.ok(fields > 0, `${who}: the crawl met no required field at all, so it proved nothing`);
    });
  }

  test('the public pages too: the home page and sign-in', async () => {
    const { requiredWithoutWords } = await required();
    for (const path of ['/login', '/']) {
      const body = await (await fetch(base + path)).text();
      assert.deepEqual(requiredWithoutWords(body), [], path);
    }
  });
});

/* ================================================================== *
 * D5 — the label is JOINED to its field, not merely placed near it   (Phase 133e)
 *
 * D1 put the words "(required)" into the label. That is what a person sees. It is not what a screen reader
 * announces: it reads the label a browser has JOINED to the control, by `for`/`id` or by the control sitting
 * inside the label. A bare <label class="fl"> before an <input> with no id is two unrelated elements, and the
 * words D1 added are read nowhere near the field — or not at all.
 * ================================================================== */

describe('D5: every required control is labelled by for/id or by an enclosing label, never by position', () => {
  test('the detector itself: the two real joins pass, position alone does not', async () => {
    const { requiredLabelledByPositionOnly: byPosition } = await required();
    assert.equal(typeof byPosition, 'function', 'there is no by-position detector');
    const f = byPosition as (html: string) => string[];
    assert.deepEqual(f('<label for="a">Name</label><input id="a" name="a" required>'), [], 'a for/id pair was reported');
    assert.deepEqual(f('<label>Name <input name="b" required></label>'), [], 'an enclosing label was reported');
    assert.deepEqual(f('<label class="fl">Name</label><input class="fi" name="c" required>'), ['c'],
      'a label that merely sits before the field was accepted');
    assert.deepEqual(f('<input name="d" required>'), ['d'], 'a field with no label at all was accepted');
    assert.deepEqual(f('<label class="fl">Name</label><input class="fi" name="e">'), [], 'an optional field was reported');
    assert.deepEqual(f('<input type="hidden" name="f" required>'), [], 'a hidden field was reported');
    assert.deepEqual(f('<label for="g">Name</label><input id="g" name="g" required><input class="fi" name="h" required>'), ['h'],
      'one joined and one not: the unjoined one must be the only finding');
  });

  for (const who of LOGINS) {
    test(`${who}: no page it reaches has a required control labelled by position alone`, async () => {
      const { requiredLabelledByPositionOnly: byPosition } = await required();
      const f = byPosition as (html: string) => string[];
      const pages = [...(await crawl(as(who), who === 'client' ? '/portal' : '/staff'))]
        .filter(([, r]) => r.status === 200 && (r.type ?? '').startsWith('text/html'));
      assert.ok(pages.length >= 3, `${who} reached only ${pages.length} pages`);
      let fields = 0;
      const loose: string[] = [];
      for (const [u, r] of pages) {
        fields += [...r.body.matchAll(/<(input|select|textarea)\b[^>]*\srequired(?=[\s>/=])/g)].length;
        for (const name of f(r.body)) loose.push(`${u}: ${name}`);
      }
      assert.deepEqual(loose, [], `${who}: required controls whose label is only nearby`);
      if (who !== 'client') assert.ok(fields > 0, `${who}: the crawl met no required field at all, so it proved nothing`);
    });
  }

  test('the public pages too: the home page and sign-in', async () => {
    const { requiredLabelledByPositionOnly: byPosition } = await required();
    const f = byPosition as (html: string) => string[];
    for (const path of ['/login', '/']) {
      const body = await (await fetch(base + path)).text();
      assert.deepEqual(f(body), [], path);
    }
  });
});

/* ================================================================== *
 * D2 — the stage bar wraps
 * ================================================================== */

describe('D2: the stage bar', () => {
  test('a step is never narrower than its longest word, and nothing cuts a label short', () => {
    const rule = /\.stagebar li\{([^}]*)\}/.exec(SITE_CSS)?.[1] ?? '';
    assert.match(rule, /min-width:max\([\d.]+rem,min-content\)/, 'a step can be narrower than its longest word, so the arrow cuts it');
    assert.equal(/text-overflow|white-space:nowrap|overflow:hidden/.test(rule), false, 'a step label is truncated');
    assert.match(SITE_CSS, /\.stagebar ol\{[^}]*overflow-x:auto/, 'with no room at all the bar does not scroll');
  });
});

/* ================================================================== *
 * D4 — a refusal beside its field, on the ten most-used forms
 * ================================================================== */

/** The three kinds of form field, as a regular expression group. */
const FIELD_TAGS = '(input|select|textarea)';

/** The refused page: the named field, marked and described, with its message straight after it. */
function assertBeside(body: string, field: string, words: RegExp, what: string): void {
  const id = `refusal-${field}`;
  const at = body.indexOf(`<p class="fielderr" id="${id}" role="alert">`);
  assert.ok(at > 0, `${what}: no message beside "${field}"`);
  // The field is the nearest control of that name BEFORE the message: a page can carry the same name in another form.
  const controls = [...body.slice(0, at).matchAll(new RegExp(`<${FIELD_TAGS}\\b[^>]*\\sname="${field}"[^>]*>`, 'g'))];
  const control = controls[controls.length - 1];
  assert.ok(control, `${what}: no "${field}" field before its message`);
  assert.match(control[0], /\saria-invalid="true"/, `${what}: "${field}" is not marked invalid`);
  assert.match(control[0], new RegExp(`\\saria-describedby="${id}"`), `${what}: "${field}" is not described by its message`);
  const between = body.slice((control.index ?? 0) + control[0].length, at);
  assert.equal(/<(input|select|textarea)\b/.test(between), false, `${what}: another field sits between "${field}" and its message`);
  assert.ok(between.length < 2500, `${what}: the message is ${between.length} characters from its field`);
  assert.equal(/<div class="formerr"/.test(body), false, `${what}: the message was drawn at the top of the form as well`);
  assert.equal(body.split(`id="${id}"`).length - 1, 1, `${what}: the message was drawn more than once`);
  const message = body.slice(at, body.indexOf('</p>', at));
  assert.match(message, words, `${what}: the message does not carry the refusal's words`);
}

describe('D4: the ten forms draw a refusal beside its field', () => {
  const one = (sql: string): { id: string } => { const r = made.app.db.get<{ id: string }>(sql); assert.ok(r, sql); return r; };

  test('1 the task: no title', async () => {
    const c = one("SELECT id FROM claims WHERE stage = 'SURVEY' LIMIT 1");
    const r = await as('sales').post('/staff/tasks', { claim_id: c.id, back: `/staff/claims/${c.id}`, title: '', description: 'kept 1', priority: 'HIGH' });
    assert.equal(r.status, 400);
    assertBeside(r.body, 'title', /Task not added\.[\s\S]*Say what the task is/, 'the task');
  });

  test('2 the next action: no owner', async () => {
    const c = one("SELECT id FROM claims WHERE stage = 'SURVEY' LIMIT 1");
    const r = await as('sales').post(`/staff/claims/${c.id}/next-action`, { title: 'Chase the plans', owner_id: '', due_on: '2026-10-01' });
    assert.equal(r.status, 400);
    assertBeside(r.body, 'owner_id', /Next action not set\.[\s\S]*has an owner/, 'the next action');
  });

  test('3 a lead: no source', async () => {
    const r = await as('sales').post('/staff/leads', { prospect_organisation: 'Kept Lead Name 3', prospect_sector: '', source: '' });
    assert.equal(r.status, 400);
    assertBeside(r.body, 'source', /Lead not recorded\.[\s\S]*Choose where the lead came from/, 'a lead');
    assert.match(r.body, /value="Kept Lead Name 3"/, 'what was typed was lost');
  });

  test('4 an enquiry check: no answer', async () => {
    const l = one("SELECT id FROM leads WHERE claim_id IS NULL AND status NOT IN ('CONVERTED','LOST') ORDER BY created_at LIMIT 1");
    const r = await as('sales').post(`/staff/leads/${l.id}/checks`, { check_key: 'TRADING_CLIENT', answer: '', note: 'kept 4' });
    assert.equal(r.status, 400);
    assertBeside(r.body, 'answer', /Check not recorded\.[\s\S]*not known is an answer/, 'an enquiry check');
  });

  test('5 a claim move: a hold with no reason; and a gate that is not ready stays at the top', async () => {
    const c = one("SELECT id FROM claims WHERE stage = 'SURVEY' LIMIT 1");
    const r = await as('sales').post(`/staff/claims/${c.id}/stage`, { kind: 'HOLD', reason: '' });
    assert.equal(r.status, 400);
    assertBeside(r.body, 'reason', /Not moved\.[\s\S]*A hold carries its reason/, 'a claim move');
    const g = await as('sales').post(`/staff/claims/${c.id}/stage`, { kind: 'FORWARD', to: 'VALUATION' });
    assert.equal(g.status, 400);
    assert.match(g.body, /<div class="formerr" role="alert"><strong>Not moved\.<\/strong> Not ready to move on/, 'a gate refusal names no field and should stay at the top');
    assert.equal(/class="fielderr"/.test(g.body), false, 'a gate refusal was pinned to a field');
  });

  test('6 the claim: an expected completion that is not a date', async () => {
    const c = one("SELECT id FROM claims WHERE stage = 'SURVEY' LIMIT 1");
    const r = await as('sales').post(`/staff/claims/${c.id}`, { expected_completion: 'soon' });
    assert.equal(r.status, 400);
    assertBeside(r.body, 'expected_completion', /Not saved\.[\s\S]*must be a date/, 'the claim');
  });

  test('7 the organisation: a website that is not one', async () => {
    const b = one('SELECT business_id AS id FROM claims LIMIT 1');
    const r = await as('sales').post(`/staff/organisations/${b.id}`, { website: 'our site' });
    assert.equal(r.status, 400);
    assertBeside(r.body, 'website', /Not saved\.[\s\S]*A website starts with https/, 'the organisation');
  });

  test('8 a contact: no name', async () => {
    const b = one('SELECT business_id AS id FROM claims LIMIT 1');
    const r = await as('sales').post(`/staff/organisations/${b.id}/contacts`, { full_name: '', job_title: 'Kept Title 8' });
    assert.equal(r.status, 400);
    assertBeside(r.body, 'full_name', /Contact not added\.[\s\S]*needs a name/, 'a contact');
  });

  test('9 a property: no name', async () => {
    const b = one('SELECT business_id AS id FROM claims LIMIT 1');
    const r = await as('sales').post(`/staff/organisations/${b.id}/properties`, { label: '', postcode: 'LE10 1AA' });
    assert.equal(r.status, 400);
    assertBeside(r.body, 'label', /Property not added\.[\s\S]*Give the property a name/, 'a property');
  });

  test('10 a document request: no reason, and the sentence starts with a capital', async () => {
    const c = one("SELECT id FROM claims WHERE stage = 'SURVEY' LIMIT 1");
    const page = (await as('sales').get(`/staff/claims/${c.id}`)).body;
    const type = /<form method="post" action="\/staff\/claims\/[^"]+\/document-requests">[\s\S]*?<option value="([^"]+)"/.exec(page)?.[1];
    assert.ok(type, 'the claim page offers no document request form to sales');
    const r = await as('sales').post(`/staff/claims/${c.id}/document-requests`, { type_code: type, why: '', holds_up: 'Kept 10' });
    assert.equal(r.status, 400);
    assertBeside(r.body, 'why', /Not requested\.<\/strong> Say why we need the document/, 'a document request');
  });
});

/* ================================================================== *
 * D6 — the remaining back-office forms, one refused post each        (Phase 133e)
 *
 * Phase 133d did the ten most-used forms. These are the rest: every other form whose store refuses about ONE
 * posted field. Each posts something the store must refuse, and the message has to land beside the field it
 * names — the same `assertBeside` the ten are held to, so there is one standard and not two.
 * ================================================================== */

describe('D6: the remaining back-office forms draw a refusal beside its field', () => {
  const one = (sql: string): { id: string } => { const r = made.app.db.get<{ id: string }>(sql); assert.ok(r, sql); return r; };

  test('11 finance: money recorded as arriving on a day that is not a date', async () => {
    const inv = made.app.db.get<{ id: string }>("SELECT id FROM invoices WHERE invoice_status <> 'CANCELLED' LIMIT 1");
    assert.ok(inv, 'the seed has no invoice, so this proves nothing');
    const r = await as('accounting').post(`/staff/finance/${inv.id}/received`, { received_on: 'the other day', amount: '1000', method: 'BANK_TRANSFER' });
    assert.equal(r.status, 400);
    assertBeside(r.body, 'received_on', /the day the money arrived, as a date/, 'finance');
  });

  test('12 introducers: a firm with no name', async () => {
    const r = await as('sales').post('/staff/introducers', { firm_name: '', introducer_type: '', notes: 'kept 12' });
    assert.equal(r.status, 400);
    assertBeside(r.body, 'firm_name', /needs its name/, 'an introducer');
  });

  test('13 the claim’s facts: a fact given neither a value nor "not known"', async () => {
    const c = one("SELECT id FROM claims LIMIT 1");
    const r = await as('sales').post(`/staff/claims/${c.id}/facts`, { fact_key: 'BUYER_ALTERATIONS_AMOUNT', answer: '', value: '', source_id: 'CLIENT_ANSWER' });
    assert.equal(r.status, 400);
    assertBeside(r.body, 'answer', /not known is an answer|record it as not known/, 'the claim’s facts');
  });

  test('14 document types: a type with no label', async () => {
    const r = await as('admin').post('/staff/document-types', { code: 'KEPT_TYPE_14', label: '', readers: 'STAFF', carries_value: '0' });
    assert.equal(r.status, 400);
    assertBeside(r.body, 'label', /label of up to 120 characters/, 'a document type');
  });

  test('15 automation rules: a rule with no label', async () => {
    const r = await as('admin').post('/staff/automation', { label: '', trigger_event: 'LEAD_CREATED', effect: 'TASKS', attach_to: 'SUBJECT', task_title: 'kept 15' });
    assert.equal(r.status, 400);
    assertBeside(r.body, 'label', /label a person can read/, 'an automation rule');
  });

  test('16 templates: a template with no subject', async () => {
    const r = await as('admin').post('/staff/templates', { label: 'Kept Template 16', subject: '', body: 'kept body 16' });
    assert.equal(r.status, 400);
    assertBeside(r.body, 'subject', /a label, a subject and a body/, 'a template');
  });

  test('17 the account settings: a display name of one character', async () => {
    const r = await as('sales').post('/staff/settings/profile', { display_name: 'x' });
    assert.equal(r.status, 400);
    assertBeside(r.body, 'display_name', /between 2 and 80 characters/, 'the account settings');
  });

  test('18 Create a user: a username that is not an email address', async () => {
    const r = await as('admin').post('/staff/users/create', { email: 'not-an-address', display_name: 'Kept User 18', role: 'SALES', password: 'a-long-enough-password' });
    assert.equal(r.status, 400);
    assertBeside(r.body, 'email', /does not look like an email address/, 'Create a user');
  });

  test('19 the survey job: a qualifying percentage that is not one', async () => {
    // Whether a job is still SEALED depends on what other tests did to it, so the route is chosen from its state:
    // commit while it is sealed, amend once it is not. Both refuse on the same field.
    const j = made.app.db.get<{ id: string; state: string }>('SELECT id, state FROM surveyor_jobs LIMIT 1');
    assert.ok(j, 'the seed has no surveyor job, so this proves nothing');
    const route = j.state === 'SEALED' ? 'commit' : 'amend';
    const r = await as('surveying').post(`/staff/survey/${j.id}/${route}`, {
      a_qualifying_plant: '250000', b_building: '500000', c_bare_land: '100000', qualifying_pct: 'not a number',
      basis: 'kept 19', reason: 'kept 19',
    });
    assert.equal(r.status, 400, `${route}: ${r.body.slice(0, 200)}`);
    assertBeside(r.body, 'qualifying_pct', /between 0 and 100/, `the survey job (${route})`);
  });
});
