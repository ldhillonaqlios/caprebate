/**
 * PHASE 143 — GRANTS AND CONTRIBUTIONS, A SCREEN THAT IS EASY TO USE. 22 September 2026. "Clean-up 10 of 11."
 *
 * Lakhbir, 18 September 2026: "Grants and contributions — this section is a mess, and although great and it works, the
 * UI is terrible." THE SCREEN CHANGED; THE RULES AND THE STORED DATA DID NOT.
 *
 *   ITS OWN SECTION   → "Grants and contributions" on the claim page, opening with one question and three answers
 *   NOT SURE          → recorded as not known, never as No; the valuation check stays shut; the client is asked, once
 *   A CARD PER GRANT  → who paid, how much, one plain line, where the figure came from, matched or not yet
 *   TOTALS            → in total, matched, not matched yet; an amount not known is counted apart, never as nothing
 *   STEP BY STEP      → one question per page, every step a POST, no skipping ahead, the effect shown before saving
 *   RULEBOOK F        → the effect depends on who paid: a public body reduces the claim, insurance money does not
 *   REMOVE            → asks why in a pop-up, refuses without a reason, keeps the record in the history and the audit log
 *   RULES KEPT        → a surveyor and Accounting never see it; a login that may not record cannot open a step
 *
 * Written against HTTP, so it fails against the .bak-phase143 copies.
 */

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../src/server.ts';
import { seed } from '../src/seed.ts';
import { SITE_CSS as CSS } from '../src/web/assets.ts';
import { grantsTraced } from '../src/web/claim-facts.ts';

type Made = Awaited<ReturnType<typeof createApp>>;
type Res = { status: number; location: string | null; body: string };
type Client = { get(path: string): Promise<Res>; post(path: string, f: Record<string, string>): Promise<Res> };
type Staff = 'admin' | 'sales' | 'accounting' | 'surveying';

let made: Made;
let base = '';
let password = '';
const clients = new Map<Staff, Client>();

async function signIn(who: Staff): Promise<Client> {
  const r = await fetch(`${base}/login`, {
    method: 'POST', redirect: 'manual', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ email: `${who}@example.invalid`, password }).toString(),
  });
  assert.equal(r.status, 303, `${who} could not sign in`);
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
const as = (who: Staff): Client => {
  const c = clients.get(who);
  assert.ok(c, who);
  return c;
};

type Sec = { id: string; open: boolean; html: string };
function sections(body: string): Sec[] {
  const starts = [...body.matchAll(/<details class="sec sec-([a-z]+)" id="([^"]+)"[^>]*>/g)];
  return starts.map((m, i) => ({
    id: m[2] ?? '', open: /\sopen>$/.test(m[0]),
    html: body.slice(m.index ?? 0, starts[i + 1]?.index ?? body.indexOf('</main>')),
  }));
}
const grantsSec = (body: string): Sec | undefined => sections(body).find((x) => x.id === 'claim-grants');

let claim = '';
let surveyed = '';

/** A whole grant, as the four steps would carry it to the save. */
const NHS = {
  kind: 'GRANT', payer_class: 'nhs', amount: '40000', amount_basis: 'agreement', source_id: 'CLIENT_DOC',
  traced_elements: 'the new treatment rooms', note: '', traced: 'YES',
};

before(async () => {
  made = await createApp(':memory:', { documentRoot: mkdtempSync(join(tmpdir(), 'cb-143-')) });
  await new Promise<void>((r) => made.server.listen(0, '127.0.0.1', () => r()));
  const addr = made.server.address();
  base = `http://127.0.0.1:${typeof addr === 'object' && addr !== null ? addr.port : 0}`;
  const s = await seed(made.app.db, made.app.hasher, made.app.now);
  password = s.password;
  for (const who of ['admin', 'sales', 'accounting', 'surveying'] as const) clients.set(who, await signIn(who));
  const job = made.app.db.get<{ claim_id: string }>(
    "SELECT j.claim_id FROM surveyor_jobs j JOIN users u ON u.id = j.surveyor_id WHERE u.email = 'surveying@example.invalid' AND j.claim_id IS NOT NULL LIMIT 1");
  surveyed = job?.claim_id ?? '';
  claim = made.app.db.get<{ id: string }>("SELECT id FROM claims WHERE stage = 'SURVEY' LIMIT 1")?.id ?? surveyed;
});
after(() => { made.close(); });

describe('its own section, one question first', () => {
  test('Admin and Sales see "Grants and contributions" with the question and Yes, No and Not sure; the facts no longer carry it', async () => {
    assert.ok(claim !== '', 'the seed has no claim');
    for (const who of ['admin', 'sales'] as const) {
      const r = await as(who).get(`/staff/claims/${claim}`);
      assert.equal(r.status, 200, who);
      const g = grantsSec(r.body);
      assert.ok(g, `${who}: no grants section`);
      assert.match(g.html, /<h2>Grants and contributions/);
      assert.match(g.html, /Did anyone else pay for any of this work\?/);
      for (const v of ['YES', 'NO', 'NOT_SURE']) assert.match(g.html, new RegExp(`name="answer" value="${v}"`), `${who}: no ${v}`);
      assert.match(g.html, /Not answered yet/, 'no answer is shown as an answer');
      const facts = sections(r.body).find((x) => x.id === 'claim-facts');
      assert.ok(facts);
      assert.equal(/Grants and contributions|Record the grant|name="payer_class"|value="GRANTS_EXIST"/.test(facts.html), false, 'the facts section still carries grants');
    }
  });

  test('a surveyor and Accounting never have it drawn', async () => {
    if (surveyed !== '') {
      const s = await as('surveying').get(`/staff/claims/${surveyed}`);
      assert.equal(s.status, 200);
      assert.equal(grantsSec(s.body), undefined, 'a surveyor was drawn the grants section');
    }
    const a = await as('accounting').get(`/staff/claims/${claim}`);
    if (a.status === 200) assert.equal(grantsSec(a.body), undefined, 'Accounting was drawn the grants section');
  });

  test('an answer needs who told us, and nothing is written without it', async () => {
    const before = made.app.db.all<{ id: string }>("SELECT id FROM claim_facts WHERE claim_id = ? AND fact_key = 'GRANTS_EXIST'", [claim]).length;
    const r = await as('sales').post(`/staff/claims/${claim}/grants/answer`, { answer: 'NO', source_id: '' });
    assert.notEqual(r.status, 303);
    assert.match(r.body, /Say who told us/);
    assert.equal(made.app.db.all<{ id: string }>("SELECT id FROM claim_facts WHERE claim_id = ? AND fact_key = 'GRANTS_EXIST'", [claim]).length, before);
  });
});

describe('Not sure is never No, and it asks the client', () => {
  test('Not sure records not known, keeps the valuation check shut, and puts ONE question to the client', async () => {
    for (let i = 0; i < 2; i += 1) {
      const r = await as('sales').post(`/staff/claims/${claim}/grants/answer`, { answer: 'NOT_SURE', source_id: 'CLIENT_ANSWER' });
      assert.equal(r.status, 303);
      assert.equal(r.location, `/staff/claims/${claim}?done=grants#claim-grants`, 'the address carries more than an id');
    }
    const fact = made.app.db.get<{ answer: string; value_text: string | null }>(
      "SELECT answer, value_text FROM claim_facts WHERE claim_id = ? AND fact_key = 'GRANTS_EXIST' ORDER BY rowid DESC LIMIT 1", [claim]);
    assert.equal(fact?.answer, 'UNKNOWN');
    assert.equal(fact?.value_text, null, 'Not sure was stored as a value');
    assert.equal(grantsTraced(made.app.db, claim).met, false, 'Not sure passed the valuation check');
    const asked = made.app.db.all<{ id: string }>(
      "SELECT id FROM client_tasks WHERE claim_id = ? AND fact_id = 'claim_fact.GRANTS_EXIST' AND state = 'OPEN'", [claim]);
    assert.equal(asked.length, 1, 'the client was asked more than once, or not at all');
    const page = await as('sales').get(`/staff/claims/${claim}?done=grants`);
    const g = grantsSec(page.body);
    assert.ok(g);
    assert.ok(g.open, 'the section was just changed and is closed');
    assert.match(g.html, />Not sure</);
    assert.match(g.html, /Asked the client — waiting/);
  });

  test('No passes the check with nothing listed; Yes with nothing listed does not', async () => {
    await as('sales').post(`/staff/claims/${claim}/grants/answer`, { answer: 'NO', source_id: 'CLIENT_ANSWER' });
    assert.equal(grantsTraced(made.app.db, claim).met, true);
    await as('sales').post(`/staff/claims/${claim}/grants/answer`, { answer: 'YES', source_id: 'CLIENT_ANSWER' });
    assert.equal(grantsTraced(made.app.db, claim).met, false);
    const g = grantsSec((await as('sales').get(`/staff/claims/${claim}`)).body);
    assert.ok(g);
    assert.match(g.html, /The answer is Yes\. Add who paid, below\./);
  });
});

describe('adding a grant, one question per step', () => {
  test('start is step 1 of 4, headed by the company, asking who paid', async () => {
    const r = await as('sales').post(`/staff/claims/${claim}/grants/new`, { go: 'start' });
    assert.equal(r.status, 200);
    assert.match(r.body, /Step 1 of 4/);
    assert.match(r.body, /<h2>Who paid\?<\/h2>/);
    const company = made.app.db.get<{ name: string }>('SELECT b.name FROM businesses b JOIN claims c ON c.business_id = b.id WHERE c.id = ?', [claim])?.name ?? '';
    assert.match(r.body, new RegExp(`<h1>${company.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/'/g, '(&#39;|&#x27;|\')')}</h1>`), 'the heading is not the company');
    assert.equal(/CR-\d{4}-\d{4}<\/h1>/.test(r.body), false);
  });

  test('each step checks its own answer, and a hand-made post cannot skip to the check page', async () => {
    const r1 = await as('sales').post(`/staff/claims/${claim}/grants/new`, { go: 'next', step: '1' });
    assert.match(r1.body, /Step 1 of 4/);
    assert.match(r1.body, /Choose who paid/);
    const skip = await as('sales').post(`/staff/claims/${claim}/grants/new`, { go: 'next', step: '4', traced: 'NO' });
    assert.match(skip.body, /Step 1 of 4/, 'a post skipped straight past step 1');
    const r2 = await as('sales').post(`/staff/claims/${claim}/grants/new`, { ...NHS, go: 'next', step: '1' });
    assert.match(r2.body, /Step 2 of 4/);
    assert.match(r2.body, /How much did they pay, and how do we know\?/);
    const bad = await as('sales').post(`/staff/claims/${claim}/grants/new`, { ...NHS, amount: 'lots', go: 'next', step: '2' });
    assert.match(bad.body, /Step 2 of 4/);
    assert.match(bad.body, /Write the amount in pounds/);
  });

  test('matched without saying what it paid for goes back to that step', async () => {
    const r = await as('sales').post(`/staff/claims/${claim}/grants/new`, { ...NHS, traced_elements: '', go: 'next', step: '4' });
    assert.match(r.body, /Step 3 of 4/);
    assert.match(r.body, /first write what it paid for/);
  });

  test('before saving, the effect is shown in plain words — and it follows Rulebook F on who paid', async () => {
    const nhs = await as('sales').post(`/staff/claims/${claim}/grants/new`, { ...NHS, go: 'next', step: '4' });
    assert.match(nhs.body, /Check it, then save/);
    assert.match(nhs.body, /This will reduce the claim on the items it paid for\./);
    assert.match(nhs.body, /The NHS paid £40,000 towards the new treatment rooms\./);
    const ins = await as('sales').post(`/staff/claims/${claim}/grants/new`, { ...NHS, payer_class: 'insurer', kind: 'CONTRIBUTION', go: 'next', step: '4' });
    assert.match(ins.body, /Insurance money after damage usually does not reduce the claim/);
    assert.equal(/This will reduce the claim/.test(ins.body), false, 'insurance money was said to reduce the claim (F-R7)');
    const landlord = await as('sales').post(`/staff/claims/${claim}/grants/new`, { ...NHS, payer_class: 'landlord_connected', go: 'next', step: '4' });
    assert.match(landlord.body, /This may reduce the claim.*Our tax adviser checks whether it does\./);
  });

  test('saving stores the same row as before, and the card reads as one plain line with a chip in words', async () => {
    const before = made.app.db.all<{ id: string }>('SELECT id FROM claim_grants WHERE claim_id = ?', [claim]).length;
    const r = await as('sales').post(`/staff/claims/${claim}/grants`, NHS);
    assert.equal(r.status, 303);
    assert.equal(r.location, `/staff/claims/${claim}?done=grants#claim-grants`);
    const row = made.app.db.get<{ payer_class: string; amount_pence: number; traced: string; traced_elements: string; amount_basis: string }>(
      'SELECT payer_class, amount_pence, traced, traced_elements, amount_basis FROM claim_grants WHERE claim_id = ? ORDER BY rowid DESC LIMIT 1', [claim]);
    assert.deepEqual({ ...row }, { payer_class: 'nhs', amount_pence: 4000000, traced: 'YES', traced_elements: 'the new treatment rooms', amount_basis: 'agreement' });
    assert.equal(made.app.db.all<{ id: string }>('SELECT id FROM claim_grants WHERE claim_id = ?', [claim]).length, before + 1);
    const g = grantsSec((await as('sales').get(`/staff/claims/${claim}`)).body);
    assert.ok(g);
    assert.match(g.html, /<p class="gwho">The NHS<\/p>/);
    assert.match(g.html, /The NHS paid £40,000 towards the new treatment rooms\./);
    assert.match(g.html, /Figure from the funding agreement/);
    assert.match(g.html, /Matched to the items it paid for/);
    assert.equal(grantsTraced(made.app.db, claim).met, true, 'one matched grant on a Yes should pass');
  });

  test('the totals: in total, matched, not matched yet — and an amount not known is never counted as nothing', async () => {
    await as('sales').post(`/staff/claims/${claim}/grants`, { ...NHS, payer_class: 'local_authority', amount: '10000', traced: 'NO', traced_elements: '' });
    await as('sales').post(`/staff/claims/${claim}/grants`, { ...NHS, payer_class: 'charity', amount: '', amount_basis: 'UNKNOWN', traced: 'UNKNOWN', traced_elements: '' });
    const g = grantsSec((await as('sales').get(`/staff/claims/${claim}`)).body);
    assert.ok(g);
    const totals = /<div class="stat-row gtotals">([\s\S]*?)<\/div>\s*<ul/.exec(g.html)?.[1] ?? '';
    assert.match(totals, /Grants in total<\/span><span class="stat">£50,000<\/span><span class="lab">and 1 with the amount not known/);
    assert.match(totals, /Matched<\/span><span class="stat">£40,000<\/span>/);
    assert.match(totals, /Not matched yet<\/span><span class="stat">£10,000<\/span><span class="lab">and 1 with the amount not known/);
    assert.match(g.html, /A charity paid towards this work\. We do not know how much yet\./);
    assert.equal(grantsTraced(made.app.db, claim).met, false, 'an unmatched grant passed the check');
  });
});

describe('Remove asks why, and keeps the record', () => {
  test('each card has a Remove pop-up with a reason box; no reason is refused; a reason removes it into the history', async () => {
    const page = await as('sales').get(`/staff/claims/${claim}`);
    const g = grantsSec(page.body);
    assert.ok(g);
    assert.match(g.html, /<button type="button" class="btn-quiet" popovertarget="rm-[A-Za-z0-9-]+">Remove<\/button>/);
    assert.match(g.html, /<div popover id="rm-[A-Za-z0-9-]+" class="gpop" role="dialog"/);
    assert.equal(/>Withdraw</.test(g.html), false, '"Withdraw" is still on the screen');
    const id = made.app.db.get<{ id: string }>("SELECT id FROM claim_grants WHERE claim_id = ? AND payer_class = 'charity'", [claim])?.id ?? '';
    const refused = await as('sales').post(`/staff/claims/${claim}/grants/${id}/withdraw`, { reason: '' });
    assert.notEqual(refused.status, 303);
    assert.equal(made.app.db.get<{ w: string | null }>('SELECT withdrawn_at AS w FROM claim_grants WHERE id = ?', [id])?.w, null);
    const ok = await as('sales').post(`/staff/claims/${claim}/grants/${id}/withdraw`, { reason: 'recorded twice' });
    assert.equal(ok.status, 303);
    const row = made.app.db.get<{ w: string | null; why: string | null }>('SELECT withdrawn_at AS w, withdraw_reason AS why FROM claim_grants WHERE id = ?', [id]);
    assert.ok(row?.w, 'the row was not kept');
    assert.equal(row?.why, 'recorded twice');
    const audit = made.app.db.all<{ kind: string }>("SELECT kind FROM audit_log WHERE kind = 'CLAIM_GRANT_WITHDRAWN'");
    assert.ok(audit.length >= 1, 'no audit entry');
    const after = grantsSec((await as('sales').get(`/staff/claims/${claim}`)).body);
    assert.ok(after);
    assert.match(after.html, /<summary>Removed \(1\)<\/summary>/);
    assert.match(after.html, /recorded twice/);
  });
});

describe('the rules underneath are kept', () => {
  test('a surveyor and Accounting cannot open a step or answer the question', async () => {
    for (const who of ['surveying', 'accounting'] as const) {
      const step = await as(who).post(`/staff/claims/${claim}/grants/new`, { go: 'start' });
      assert.notEqual(step.status, 200, `${who} opened a step`);
      assert.equal(/Who paid\?/.test(step.body), false, `${who} was drawn a step`);
      const ans = await as(who).post(`/staff/claims/${claim}/grants/answer`, { answer: 'NO', source_id: 'CLIENT_ANSWER' });
      assert.notEqual(ans.status, 303, `${who} answered`);
    }
  });

  test('the steps are POST only — nothing typed is ever put in the address', async () => {
    const r = await as('sales').get(`/staff/claims/${claim}/grants/new?payer_class=nhs&amount=40000`);
    assert.notEqual(r.status, 200);
    const step2 = await as('sales').post(`/staff/claims/${claim}/grants/new`, { ...NHS, go: 'next', step: '1' });
    assert.equal(/action="[^"]*\?/.test(step2.body.slice(step2.body.indexOf('<main'))), false, 'a step form posts to an address with a query');
  });

  test('phone width: the cards go one to a row and the pop-up fits the screen', () => {
    const phone = CSS.slice(CSS.indexOf('@media (max-width:720px)'));
    assert.match(phone, /\.gcards\{grid-template-columns:minmax\(0,1fr\)\}/);
    assert.match(CSS, /\.gpop\{[^}]*max-width:min\(28rem,calc\(100vw - 2rem\)\)/);
  });
});
