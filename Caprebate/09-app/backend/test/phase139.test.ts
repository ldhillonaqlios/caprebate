/**
 * PHASE 139 — WHERE EACH FACT CAME FROM, AN APPROVE BOX, AND TELLING THE CLIENT WHAT CAP REBATE HAS DONE.
 * 21 September 2026. "Back office and portal clean-up, 6 of 11."
 *
 * Lakhbir, 18 September 2026: "When viewing the client's portfolio there needs to be where the information has come from
 * (API) with a secondary approve box. When a user clicks approve this then pushes the details to say Cap Rebate has
 * completed this to the client - the idea is that we can then manage the flow to the customer."
 *
 *   SOURCE AND TICK   → every fact from a register or the client has a source chip, the date it arrived and a
 *                        "Checked and approved" box; a tick is audited with who and when; taking it off asks why
 *   STEPS             → a step is complete only when it has a fact, every fact is ticked and nothing is missing
 *   TELL THE CLIENT   → never automatic; the portal then says "Cap Rebate has checked your company details", with the date
 *   THE WIRE          → the portal never carries a register value, a figure, the sealed estimate, a reason, a fact
 *                        reference or a staff name — searched for by value in the raw response, the payload-proof way
 *   TAKE BACK         → Admin only, with a reason; the portal says "being re-checked" and the step does not vanish
 *   RESEARCH          → one "Run the research" button, and no tick beside a call — approval is on the results
 *   CARRIED FROM 138  → the property page and a lead's page are sections; their keys are kept; a client's answer to a
 *                        claim fact is offered in the Approve box and ticking it records the fact
 *   RULES KEPT        → Surveying, Accounting and Read only get no Approve box and are refused the routes
 *
 * Written against HTTP, so it fails against the .bak-phase139 copies.
 */

/* PHASE 151j: this file tests other things through a password sign-in, so it builds the application with
   twoFactor: 'off'. The second step itself is proved in test/phase151j.test.ts, on the default (staff must). */
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../src/server.ts';
import { seed } from '../src/seed.ts';
import { createUser } from '../src/users.ts';
import { ingestRegisterRecord } from '../src/stubs/registers.ts';
import { newId } from '../src/users.ts';
import { SITE_CSS as CSS } from '../src/web/assets.ts';
import { SECTION_KEYS } from '../src/web/sections.ts';

type Made = Awaited<ReturnType<typeof createApp>>;
type Res = { status: number; location: string | null; body: string };
type Client = { get(path: string): Promise<Res>; post(path: string, f: Record<string, string>): Promise<Res> };
type Login = 'admin' | 'sales' | 'accounting' | 'surveying' | 'readonly' | 'client' | 'client4';

let made: Made;
let base = '';
let password = '';
const clients = new Map<Login, Client>();

async function signIn(email: string): Promise<Client> {
  const r = await fetch(`${base}/login`, {
    method: 'POST', redirect: 'manual', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ email, password }).toString(),
  });
  assert.equal(r.status, 303, `${email} could not sign in`);
  const cookie = r.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ');
  const go = async (path: string, init: RequestInit = {}): Promise<Res> => {
    const x = await fetch(base + path, { redirect: 'manual', ...init, headers: { cookie, ...(init.headers as Record<string, string> | undefined) } });
    return { status: x.status, location: x.headers.get('location'), body: await x.text() };
  };
  return {
    get: (path) => go(path),
    post: (path, f) => go(path, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(f).toString() }),
  };
}
const as = (who: Login): Client => {
  const c = clients.get(who);
  assert.ok(c, who);
  return c;
};

/** The markup of one section, from its <details> to the next section. */
function sec(body: string, id: string): string {
  const starts = [...body.matchAll(/<details class="sec sec-[a-z]+" id="([^"]+)"[^>]*>/g)];
  const i = starts.findIndex((m) => m[1] === id);
  assert.ok(i >= 0, `no section #${id}`);
  const start = starts[i]?.index ?? 0;
  return body.slice(start, starts[i + 1]?.index ?? body.indexOf('</main>'));
}

/** One step's block on a staff page. */
function stepHtml(body: string, claim: string | null, key: string): string {
  const id = `step-${claim ?? 'company'}-${key.toLowerCase()}`;
  const i = body.indexOf(`id="${id}"`);
  assert.ok(i >= 0, `no step ${id}`);
  const rest = body.slice(i + 1);
  const next = rest.search(/<div class="step(?: step-[a-z-]+)?"[ >]/);
  return body.slice(i, next < 0 ? undefined : i + 1 + next);
}

/** The ref on the first "Checked and approved" form inside some markup. */
function refsIn(html: string): string[] {
  return [...html.matchAll(/<form method="post" action="[^"]+\/checks\/approve" class="tickform">[\s\S]*?name="ref" value="([^"]+)"/g)].map((m) => m[1] ?? '');
}

const db = () => made.app.db;
let corvale = '';        // the seeded client's company (b3)
let dunmarrow = '';      // a company with register records on its main site (b4)
let dunmarrowSite = '';  // the claim on Dunmarrow's main site
let dunmarrowBranch = '';// the claim at INVOICE on its branch surgery
let proofValue = '';     // a register value planted for the wire proof
const REASON_UNTICK = 'Planted-untick-reason-7Q3';
const REASON_BACK = 'Planted-takeback-reason-9Z1';

before(async () => {
  made = await createApp(':memory:', { twoFactor: 'off', documentRoot: mkdtempSync(join(tmpdir(), 'cb-139-')) });
  await new Promise<void>((r) => made.server.listen(0, '127.0.0.1', () => r()));
  const addr = made.server.address();
  base = `http://127.0.0.1:${typeof addr === 'object' && addr !== null ? addr.port : 0}`;
  const s = await seed(db(), made.app.hasher, made.app.now);
  password = s.password;
  const t = made.app.now();
  db().run(
    'INSERT INTO users (id,email,email_canonical,display_name,role,password_hash,created_at,updated_at,business_id) VALUES (?,?,?,?,?,?,?,?,NULL)',
    ['u-readonly-139', 'readonly@example.invalid', 'readonly@example.invalid', 'Read-only Person', 'READ_ONLY', await made.app.hasher.hash(s.password), t, t],
  );
  corvale = db().get<{ business_id: string }>("SELECT business_id FROM users WHERE email = 'client@example.invalid'")?.business_id ?? '';
  dunmarrow = db().get<{ id: string }>("SELECT id FROM businesses WHERE name LIKE 'Dunmarrow%'")?.id ?? '';
  dunmarrowSite = db().get<{ id: string }>("SELECT c.id FROM claims c JOIN properties p ON p.id = c.property_id WHERE c.business_id = ? AND p.label LIKE '%main site'", [dunmarrow])?.id ?? '';
  dunmarrowBranch = db().get<{ id: string }>("SELECT c.id FROM claims c JOIN properties p ON p.id = c.property_id WHERE c.business_id = ? AND p.label LIKE '%branch surgery'", [dunmarrow])?.id ?? '';
  // A client login for Dunmarrow, so a claim fact can be answered in a real portal.
  createUser(db(), made.app.now, { email: 'client4@example.invalid', display_name: 'Dunmarrow Client', role: 'CLIENT', password_hash: await made.app.hasher.hash(s.password), business_id: dunmarrow });
  // A seeded register record for the client's own company, with a value nothing else on the site says.
  proofValue = 'INVENTED-CO-PROOF-0139';
  ingestRegisterRecord(db(), newId, made.app.now, corvale, {
    sourceId: 'CH_COMPANY', entityId: proofValue,
    fields: { company_number: proofValue, company_status: 'active', sic_codes: '87900', accounts_year_end: '09-30', incorporation_date: '2011-02-17' },
  });
  for (const [who, email] of [['admin', 'admin@example.invalid'], ['sales', 'sales@example.invalid'], ['accounting', 'accounting@example.invalid'],
    ['surveying', 'surveying@example.invalid'], ['readonly', 'readonly@example.invalid'], ['client', 'client@example.invalid'],
    ['client4', 'client4@example.invalid']] as const) clients.set(who, await signIn(email));
});
after(() => { made.close(); });

describe('where each fact came from, and the Approve box', () => {
  test('beside every register fact: a source chip, the date it arrived and a "Checked and approved" box', async () => {
    const r = await as('sales').get(`/staff/clients/${dunmarrow}`);
    assert.equal(r.status, 200);
    const checks = sec(r.body, 'checks');
    assert.match(checks, /<h2>Check and tell the client/);
    const site = stepHtml(checks, dunmarrowSite, 'PROPERTY');
    for (const chip of ['EPC register', 'Care regulator']) assert.ok(site.includes(`<span class="chip">${chip}</span>`), `no ${chip} chip`);
    assert.match(site, /<strong>Floor area \(square metres\)<\/strong>/);
    assert.match(site, /· arrived \d{1,2} [A-Z][a-z]{2} 20\d\d/, 'no arrival date');
    assert.ok(refsIn(site).length >= 13, 'not every register fact has a box');
    assert.match(site, /<button type="submit" class="tickbox" aria-pressed="false"><span class="box" aria-hidden="true"><\/span> Checked and approved<\/button>/);
    // No tick is on the lookups themselves: approval is on the results, never on the calls.
    const sources = sec(r.body, 'sources');
    assert.equal(sources.includes('Checked and approved'), false, 'a tick beside a lookup');
    assert.equal((sources.match(/>Run the research</g) ?? []).length, 1, 'not exactly one Run the research button');
  });

  test('ticking is recorded and audited with who and when; taking it off asks why, and is audited too', async () => {
    const page = await as('sales').get(`/staff/clients/${dunmarrow}`);
    const ref = refsIn(stepHtml(page.body, dunmarrowSite, 'PROPERTY'))[0] ?? '';
    const ok = await as('sales').post(`/staff/clients/${dunmarrow}/checks/approve`, { ref, back: 'client' });
    assert.equal(ok.status, 303);
    assert.equal(ok.location, `/staff/clients/${dunmarrow}?done=checked#checks`);
    const sales = db().get<{ id: string }>("SELECT id FROM users WHERE email = 'sales@example.invalid'")?.id;
    const row = db().get<{ action: string; actor_id: string; at: string }>('SELECT action, actor_id, at FROM fact_approvals WHERE fact_ref = ?', [ref]);
    assert.equal(row?.action, 'APPROVED'); assert.equal(row?.actor_id, sales); assert.ok(row?.at);
    const audit = db().get<{ n: number }>("SELECT COUNT(*) AS n FROM audit_log WHERE kind = 'FACT_APPROVED' AND actor_id = ?", [sales ?? '']);
    assert.equal(audit?.n, 1);
    const after1 = await as('sales').get(`/staff/clients/${dunmarrow}`);
    assert.match(stepHtml(after1.body, dunmarrowSite, 'PROPERTY'), /Checked and approved\s*<span class="help">by Sales User, /);
    // Twice is refused; so is a ref that is not this company's.
    assert.notEqual((await as('sales').post(`/staff/clients/${dunmarrow}/checks/approve`, { ref, back: 'client' })).status, 303);
    assert.notEqual((await as('sales').post(`/staff/clients/${corvale}/checks/approve`, { ref, back: 'client' })).status, 303);
    // Taking it off without a reason is refused and writes nothing; with one, it is recorded.
    const bare = await as('sales').post(`/staff/clients/${dunmarrow}/checks/unapprove`, { ref, back: 'client', reason: '  ' });
    assert.notEqual(bare.status, 303);
    assert.equal(db().get<{ n: number }>("SELECT COUNT(*) AS n FROM fact_approvals WHERE action = 'UNAPPROVED'")?.n, 0);
    const off = await as('sales').post(`/staff/clients/${dunmarrow}/checks/unapprove`, { ref, back: 'client', reason: REASON_UNTICK });
    assert.equal(off.status, 303);
    assert.equal(db().get<{ reason: string }>("SELECT reason FROM fact_approvals WHERE action = 'UNAPPROVED' AND fact_ref = ?", [ref])?.reason, REASON_UNTICK);
    assert.equal(db().get<{ n: number }>("SELECT COUNT(*) AS n FROM audit_log WHERE kind = 'FACT_UNAPPROVED'")?.n, 1);
    // The log only grows.
    assert.throws(() => db().run('DELETE FROM fact_approvals'));
    assert.throws(() => db().run("UPDATE fact_approvals SET action = 'APPROVED'"));
  });
});

describe('steps, and telling the client', () => {
  test('a step is complete only when every fact in it is ticked — and telling is never automatic', async () => {
    const before1 = await as('sales').get(`/staff/clients/${dunmarrow}`);
    const booked = stepHtml(before1.body, dunmarrowSite, 'SURVEY_BOOKED');
    assert.match(booked, /<span class="chip">Surveyor<\/span>/);
    assert.equal(booked.includes('>Tell the client and move on</button>'), false, 'offered before the fact is ticked');
    // Pressing it anyway is refused, and nothing is written.
    const early = await as('sales').post(`/staff/clients/${dunmarrow}/steps/tell`, { step: 'SURVEY_BOOKED', claim_id: dunmarrowSite, back: 'client' });
    assert.notEqual(early.status, 303);
    assert.equal(db().get<{ n: number }>('SELECT COUNT(*) AS n FROM client_step_notices')?.n, 0);
    // An empty step is not complete, and neither is a step with a fact still missing.
    assert.notEqual((await as('sales').post(`/staff/clients/${dunmarrow}/steps/tell`, { step: 'REPORT', claim_id: dunmarrowSite, back: 'client' })).status, 303);
    assert.match(stepHtml(before1.body, dunmarrowSite, 'PROPERTY'), /still missing/);
    // Tick its one fact: the step is ready, and still nobody has been told.
    const ref = refsIn(booked)[0] ?? '';
    assert.equal((await as('sales').post(`/staff/clients/${dunmarrow}/checks/approve`, { ref, back: 'client' })).status, 303);
    const ready = await as('sales').get(`/staff/clients/${dunmarrow}`);
    const b2 = stepHtml(ready.body, dunmarrowSite, 'SURVEY_BOOKED');
    assert.match(b2, /Ready to tell the client/);
    assert.ok(b2.includes('>Tell the client and move on</button>'));
    assert.equal(db().get<{ n: number }>('SELECT COUNT(*) AS n FROM client_step_notices')?.n, 0, 'told without anyone pressing the button');
  });

  test('the client\'s own company: they answer in the portal, staff tick each answer, press Tell the client, and the portal says so with the date', async () => {
    // Nothing shows on the portal before anyone is told.
    const p0 = await as('client').get('/portal');
    assert.match(p0.body, /<h2>What Cap Rebate has done<\/h2>/);
    assert.equal(p0.body.includes('Cap Rebate has checked your company details'), false);
    // Ask for the three company facts still missing, and answer them as the client.
    for (const fact_id of ['entity_type', 'year_end', 'incorporation_date']) {
      const sent = await as('sales').post(`/staff/clients/${corvale}/tasks/send`, { fact_id, question: `Tell us: ${fact_id}`, why: 'We need it.', holds_up: 'your claim' });
      assert.equal(sent.status, 303, fact_id);
    }
    for (const t of db().all<{ id: string; fact_id: string }>("SELECT id, fact_id FROM client_tasks WHERE business_id = ? AND state = 'OPEN' AND fact_id IN ('entity_type','year_end','incorporation_date')", [corvale])) {
      const a = await as('client').post(`/portal/tasks/${t.id}`, { answer: t.fact_id === 'entity_type' ? 'A limited company' : t.fact_id === 'year_end' ? '30 September' : '17 February 2011' });
      assert.equal(a.status, 303);
    }
    const page = await as('sales').get(`/staff/clients/${corvale}`);
    const co = stepHtml(page.body, null, 'COMPANY');
    assert.equal((co.match(/<span class="chip">You told us<\/span>/g) ?? []).length, 3, 'the client\'s answers are not shown as "You told us"');
    assert.ok(co.includes('<span class="chip">Companies House</span>'));
    assert.match(co, /0 of 8 checked/);
    for (const ref of refsIn(co)) assert.equal((await as('sales').post(`/staff/clients/${corvale}/checks/approve`, { ref, back: 'client' })).status, 303, ref);
    const ready = stepHtml((await as('sales').get(`/staff/clients/${corvale}`)).body, null, 'COMPANY');
    assert.match(ready, /Ready to tell the client/);
    const told = await as('sales').post(`/staff/clients/${corvale}/steps/tell`, { step: 'COMPANY', claim_id: '', back: 'client' });
    assert.equal(told.status, 303);
    assert.equal(db().get<{ n: number }>("SELECT COUNT(*) AS n FROM audit_log WHERE kind = 'CLIENT_STEP_TOLD'")?.n, 1);
    const p1 = await as('client').get('/portal');
    const card = p1.body.slice(p1.body.indexOf('id="done-so-far"'), p1.body.indexOf('</section>', p1.body.indexOf('id="done-so-far"')));
    assert.match(card, /✓<\/span> Cap Rebate has checked your company details<span class="help">, \d{1,2} [A-Z][a-z]{2} 20\d\d<\/span>/);
    // Told once; a second press is refused.
    assert.notEqual((await as('sales').post(`/staff/clients/${corvale}/steps/tell`, { step: 'COMPANY', claim_id: '', back: 'client' })).status, 303);
  });

  test('THE WIRE: the portal carries no register value, figure, sealed estimate, reason, fact reference or staff name', async () => {
    // Put a reason on the record that must never travel: an untick with a planted reason on the client's own company.
    const co = stepHtml((await as('sales').get(`/staff/clients/${corvale}`)).body, null, 'COMPANY');
    void co;
    const aRef = db().get<{ fact_ref: string }>("SELECT fact_ref FROM fact_approvals WHERE business_id = ? AND fact_ref LIKE 'reg.%' LIMIT 1", [corvale])?.fact_ref ?? '';
    assert.ok(aRef !== '');
    const forbidden: string[] = [
      proofValue, '87900', '09-30', '2011-02-17', REASON_UNTICK, REASON_BACK,
      'reg.', 'ans.', 'cf.', 'fact_ref', 'Sales User', 'Admin User', 'Checked and approved', 'Companies House', 'You told us',
    ];
    for (const e of db().all<Record<string, unknown>>('SELECT * FROM estimates WHERE business_id = ?', [corvale])) {
      for (const [k, v] of Object.entries(e)) {
        if (['id', 'assessment_id', 'business_id', 'sealed_at'].includes(k) || v === null) continue;
        forbidden.push(String(v));
        if (typeof v === 'number' && k.endsWith('_pence')) forbidden.push((v / 100).toLocaleString('en-GB', { maximumFractionDigits: 0 }));
      }
    }
    for (const path of ['/portal', ...db().all<{ id: string }>('SELECT id FROM claims WHERE business_id = ?', [corvale]).map((c) => `/portal/claims/${c.id}`)]) {
      const r = await as('client').get(path);
      assert.equal(r.status, 200, path);
      const card = r.body.slice(r.body.indexOf('id="done-so-far"'));
      const cardOnly = card.slice(0, card.indexOf('</section>'));
      for (const x of forbidden) {
        if (x.length < 4) continue;
        assert.equal(cardOnly.includes(x), false, `${path}: the steps card carries "${x}"`);
        // The whole page, too — except the client's own range and answers, which the portal shows by design elsewhere.
        if (!/^\d[\d,]*$/.test(x)) assert.equal(r.body.includes(x), false, `${path}: the portal carries "${x}"`);
      }
    }
  });

  test('only Admin can take a step back, with a reason; the portal then says "being re-checked" and never the reason', async () => {
    const f = { step: 'COMPANY', claim_id: '', back: 'client', reason: REASON_BACK };
    const bySales = await as('sales').post(`/staff/clients/${corvale}/steps/take-back`, f);
    assert.equal(bySales.status, 403, 'Sales took a step back');
    assert.equal(stepHtml((await as('sales').get(`/staff/clients/${corvale}`)).body, null, 'COMPANY').includes('Take this step back'), false);
    assert.notEqual((await as('admin').post(`/staff/clients/${corvale}/steps/take-back`, { ...f, reason: '' })).status, 303, 'taken back with no reason');
    const byAdmin = await as('admin').post(`/staff/clients/${corvale}/steps/take-back`, f);
    assert.equal(byAdmin.status, 303);
    assert.equal(db().get<{ n: number }>("SELECT COUNT(*) AS n FROM audit_log WHERE kind = 'CLIENT_STEP_TAKEN_BACK'")?.n, 1);
    const p = await as('client').get('/portal');
    assert.match(p.body, /↻<\/span> Your company details are being re-checked<span class="help">, since \d{1,2} [A-Z][a-z]{2} 20\d\d<\/span>/);
    assert.equal(p.body.includes('Cap Rebate has checked your company details'), false);
    assert.equal(p.body.includes(REASON_BACK), false, 'the reason reached the client');
    // Staff see who took it back and why.
    assert.match(stepHtml((await as('admin').get(`/staff/clients/${corvale}`)).body, null, 'COMPANY'), new RegExp(`Taken back on .* by Admin User: ${REASON_BACK}`));
    // It can be told again once it is re-checked.
    assert.equal((await as('sales').post(`/staff/clients/${corvale}/steps/tell`, { step: 'COMPANY', claim_id: '', back: 'client' })).status, 303);
    assert.match((await as('client').get('/portal')).body, /Cap Rebate has checked your company details/);
    assert.throws(() => db().run('DELETE FROM client_step_notices'));
  });
});

describe('carried from Phase 138', () => {
  test('a client\'s answer to a claim fact is offered in the Approve box, and ticking it records the fact as "You told us"', async () => {
    const claimPage = `/staff/clients/${dunmarrow}/claims/${dunmarrowBranch}`;
    const ask = await as('sales').post(`/staff/clients/${dunmarrow}/tasks/send`, {
      fact_id: 'claim_fact.ACCOUNTING_PERIOD_START', claim_id: dunmarrowBranch,
      question: 'Can you tell us this: the first day of the accounting period?', why: 'We need this to finish your claim.', holds_up: 'this claim',
    });
    assert.equal(ask.status, 303);
    const t = db().get<{ id: string }>("SELECT id FROM client_tasks WHERE fact_id = 'claim_fact.ACCOUNTING_PERIOD_START' AND state = 'OPEN'");
    assert.ok(t);
    assert.equal((await as('client4').post(`/portal/tasks/${t.id}`, { answer: '2025-04-01' })).status, 303);
    const r = await as('sales').get(claimPage);
    const checks = sec(r.body, 'claim-checks');
    const tax = stepHtml(checks, dunmarrowBranch, 'TAX');
    const line = tax.slice(tax.indexOf(`value="ans.${t.id}"`) - 600, tax.indexOf(`value="ans.${t.id}"`) + 900);
    assert.match(tax, /<span class="chip">You told us<\/span> <strong>The accounting period the spend falls in: its first day<\/strong>/);
    assert.match(line, /<input id="[^"]+" name="value" type="date" value="2025-04-01" required>/, 'the client\'s answer is not offered as the fact');
    const before1 = db().get<{ n: number }>("SELECT COUNT(*) AS n FROM claim_facts WHERE claim_id = ? AND fact_key = 'ACCOUNTING_PERIOD_START'", [dunmarrowBranch])?.n ?? 0;
    const ok = await as('sales').post(`/staff/clients/${dunmarrow}/checks/approve`, { ref: `ans.${t.id}`, value: '2025-04-01', back: `claim:${dunmarrowBranch}` });
    assert.equal(ok.status, 303);
    assert.equal(ok.location, `${claimPage}?done=checked#claim-checks`);
    const f = db().get<{ id: string; value_date: string; source_id: string }>(
      "SELECT id, value_date, source_id FROM claim_facts WHERE claim_id = ? AND fact_key = 'ACCOUNTING_PERIOD_START' ORDER BY recorded_at DESC, rowid DESC LIMIT 1", [dunmarrowBranch]);
    assert.equal(f?.value_date, '2025-04-01'); assert.equal(f?.source_id, 'CLIENT_ANSWER');
    assert.equal((db().get<{ n: number }>("SELECT COUNT(*) AS n FROM claim_facts WHERE claim_id = ? AND fact_key = 'ACCOUNTING_PERIOD_START'", [dunmarrowBranch])?.n ?? 0) - before1, 1);
    // The recorded fact is ticked, and the answer is not listed a second time.
    const after1 = stepHtml(sec((await as('sales').get(claimPage)).body, 'claim-checks'), dunmarrowBranch, 'TAX');
    assert.equal(after1.includes(`value="ans.${t.id}"`), false, 'the answer is listed twice');
    assert.equal(db().get<{ action: string }>('SELECT action FROM fact_approvals WHERE fact_ref = ?', [`cf.${f?.id ?? ''}`])?.action, 'APPROVED');
    // A value the fact cannot take is refused, and nothing is recorded or ticked.
    const t2 = await as('sales').post(`/staff/clients/${dunmarrow}/tasks/send`, {
      fact_id: 'claim_fact.ACCOUNTING_PERIOD_END', claim_id: dunmarrowBranch, question: 'The last day?', why: 'We need it.', holds_up: 'this claim' });
    assert.equal(t2.status, 303);
    const t2id = db().get<{ id: string }>("SELECT id FROM client_tasks WHERE fact_id = 'claim_fact.ACCOUNTING_PERIOD_END' AND state = 'OPEN'")?.id ?? '';
    assert.equal((await as('client4').post(`/portal/tasks/${t2id}`, { answer: 'end of March' })).status, 303);
    const bad = await as('sales').post(`/staff/clients/${dunmarrow}/checks/approve`, { ref: `ans.${t2id}`, value: 'end of March', back: `claim:${dunmarrowBranch}` });
    assert.notEqual(bad.status, 303);
    assert.equal(db().get<{ n: number }>('SELECT COUNT(*) AS n FROM fact_approvals WHERE fact_ref = ?', [`ans.${t2id}`])?.n, 0);
  });

  test('the property page and a lead\'s page are coloured sections, not tabs; their keys are kept and their addresses accepted', async () => {
    const prop = db().get<{ id: string }>('SELECT property_id AS id FROM claims WHERE id = ?', [dunmarrowSite])?.id ?? '';
    const lead = db().get<{ id: string }>('SELECT id FROM leads LIMIT 1')?.id ?? '';
    for (const [path, ids] of [[`/staff/properties/${prop}`, ['details', 'related', 'documents', 'activity']], [`/staff/leads/${lead}`, ['details', 'related', 'activity']]] as const) {
      const r = await as('sales').get(path);
      assert.equal(r.status, 200, path);
      assert.equal(r.body.includes('class="rtabs'), false, `${path} still has tabs`);
      const found = [...r.body.matchAll(/<details class="sec sec-[a-z]+" id="([^"]+)"/g)].map((m) => m[1]);
      assert.deepEqual(found, [...ids], path);
      for (const id of ids) {
        const s = sec(r.body, id);
        assert.match(s, /<dt>Working on<\/dt>[\s\S]*<dt>We need<\/dt>[\s\S]*<dt>Coming from<\/dt>/, `${path}#${id} lacks the three lines`);
        assert.match(s, /<span class="secicon" aria-hidden="true"><svg /);
      }
      const key = path.includes('/properties/') ? 'property.details' : 'lead.details';
      assert.ok(SECTION_KEYS.includes(key));
      const kept = await as('sales').post('/staff/me/sections', { section: key, open: 'no', back: path, anchor: 'details' });
      assert.equal(kept.status, 303, path);
      assert.equal(kept.location, `${path}#details`);
    }
    const words = sec((await as('sales').get(`/staff/leads/${lead}`)).body, 'details').replace(/<[^>]+>/g, ' ');
    assert.equal(/\bgate\b/i.test(words), false, 'the lead page says "gate" where a person reads it');
    // An address that is not one of the pages is still refused.
    assert.notEqual((await as('sales').post('/staff/me/sections', { section: 'property.details', open: 'no', back: '/staff/properties/x?y=1', anchor: 'details' })).status, 303);
  });
});

describe('rules kept', () => {
  test('Surveying, Accounting and Read only get no Approve box, and are refused every route', async () => {
    for (const who of ['surveying', 'accounting', 'readonly'] as const) {
      for (const path of [`/staff/clients/${dunmarrow}`, `/staff/claims/${dunmarrowBranch}`]) {
        const r = await as(who).get(path);
        assert.equal(r.body.includes('Checked and approved'), false, `${who} on ${path} sees a tick`);
        assert.equal(r.body.includes('Tell the client'), false, `${who} on ${path} can tell the client`);
      }
      for (const [route, f] of [['checks/approve', { ref: 'reg.x.y' }], ['steps/tell', { step: 'COMPANY', claim_id: '' }]] as const) {
        const r = await as(who).post(`/staff/clients/${dunmarrow}/${route}`, { ...f, back: 'client' });
        assert.equal(r.status, 403, `${who} ${route}`);
      }
    }
    // A client cannot reach a staff route either.
    assert.notEqual((await as('client').post(`/staff/clients/${corvale}/steps/tell`, { step: 'COMPANY', claim_id: '', back: 'client' })).status, 303);
  });

  test('the claim page carries the claim\'s steps; the client page every claim\'s; no claim reference is a heading', async () => {
    const r = await as('sales').get(`/staff/claims/${dunmarrowBranch}`);
    const c = sec(r.body, 'claim-checks');
    for (const k of ['PROPERTY', 'TAX', 'SURVEY_BOOKED', 'SURVEY_DONE', 'TAX_ADVISER', 'REPORT']) stepHtml(c, dunmarrowBranch, k);
    for (const k of ['SURVEY_DONE', 'TAX_ADVISER', 'REPORT']) assert.match(stepHtml(c, dunmarrowBranch, k), /<span class="chip">(Surveyor|Tax adviser|Cap Rebate)<\/span>/, k);
    // No figure travels with a survey or a sign-off, even to staff, in this box.
    const fig = db().get<{ figure_pence: number }>('SELECT figure_pence FROM tax_adviser_signoffs WHERE claim_id = ?', [dunmarrowBranch])?.figure_pence;
    if (fig !== undefined) assert.equal(c.includes((fig / 100).toLocaleString('en-GB')), false, 'the tax adviser\'s figure is in the Approve box');
    const client = await as('sales').get(`/staff/clients/${dunmarrow}`);
    assert.equal(/<h[1-3][^>]*>[^<]*CR-20\d\d-\d{4}/.test(sec(client.body, 'checks')), false, 'a claim reference is a heading');
  });

  test('at phone width the tick and its box stack, and the step card wraps', () => {
    const phone = CSS.slice(CSS.indexOf('@media (max-width:720px)'));
    assert.match(phone, /\.tickform\{display:block\}/);
    assert.match(phone, /\.tickform input,\.tickform select\{width:100%;max-width:none\}/);
    assert.match(CSS, /\.stephead\{display:flex;flex-wrap:wrap/);
    assert.match(CSS, /\.check\{[^}]*overflow-wrap:anywhere/);
    // A long unbroken value in a list (a sign-off record's code, on the claim page's Figures) wraps rather than widening the page.
    assert.match(phone, /dd\{overflow-wrap:anywhere;min-width:0\}/);
  });

  test('after a tick the person is sent back to the step they were in, open; an address that is not a step is ignored', async () => {
    const page = await as('sales').get(`/staff/clients/${dunmarrow}`);
    const prop = stepHtml(page.body, dunmarrowSite, 'PROPERTY');
    assert.match(prop, /<details class="facts"><summary>Check the \d+ facts<\/summary>/, 'a long step is not folded');
    const anchor = `step-${dunmarrowSite}-property`;
    const ref = refsIn(prop)[0] ?? '';
    const r = await as('sales').post(`/staff/clients/${dunmarrow}/checks/approve`, { ref, back: 'client', at: anchor });
    assert.equal(r.location, `/staff/clients/${dunmarrow}?done=checked&step=${anchor}#${anchor}`);
    const again = await as('sales').get(r.location ?? '');
    assert.match(stepHtml(again.body, dunmarrowSite, 'PROPERTY'), /<details class="facts" open><summary>/, 'the step just worked in is not open');
    const ref2 = refsIn(stepHtml(again.body, dunmarrowSite, 'PROPERTY'))[0] ?? '';
    const bad = await as('sales').post(`/staff/clients/${dunmarrow}/checks/approve`, { ref: ref2, back: 'client', at: 'step-x/../../staff?y=1' });
    assert.equal(bad.location, `/staff/clients/${dunmarrow}?done=checked#checks`);
  });
});
