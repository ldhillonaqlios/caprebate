/**
 * PHASE 138 — THE CLIENT PAGE: COLOURED SECTIONS THAT FOLD, EACH SAYING WHAT WE ARE WORKING ON, WHAT WE NEED AND WHERE IT
 * COMES FROM. 21 September 2026. "Back office and portal clean-up, 5 of 11."
 *
 * Lakhbir, 18 September 2026: "The sections within the portal when looking at the clients all seem to blur into one. The
 * different sections should be coloured, in collapsible boxes, and when we are working on a particular section it should
 * show what we are working on, what data is needed and where the data is coming from."
 *
 *   ONE SECTION        → every section of the client page and the claim page is a <details> with a coloured band, an
 *                        icon and a word for its kind, a heading and a status chip in words
 *   THREE LINES        → each opens with WORKING ON, WE NEED, COMING FROM, in that order
 *   WE NEED ASKS       → a missing fact is a line with an "Ask the client" button; once asked it says "Asked — waiting"
 *   OPEN AND CLOSED    → a Done section starts closed, a section being worked on starts open; a person's own choice wins,
 *                        is kept on the server per person, and is never in the address
 *   COLOURS            → one per kind, from the brand tokens alone, and never colour alone
 *   THE BLOAT CUT      → the "Waiting on" card, the claim page's duplicated fields and its copy of the contacts are gone;
 *                        no hidden tab heading and no numbered heading remains
 *   RULES KEPT         → Read only gets no ask and no research; a surveyor's claim page has no money and no figures;
 *                        Accounting's has money and no facts; a bad section key or return address is refused
 *
 * Written against HTTP, so it fails against the .bak-phase138 copies.
 */

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../src/server.ts';
import { seed } from '../src/seed.ts';
import { SITE_CSS as CSS, BRAND_TOKENS } from '../src/web/assets.ts';

type Made = Awaited<ReturnType<typeof createApp>>;
type Res = { status: number; location: string | null; body: string };
type Client = { get(path: string): Promise<Res>; post(path: string, f: Record<string, string>): Promise<Res> };
type Staff = 'admin' | 'sales' | 'accounting' | 'surveying' | 'readonly';

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

/** Every section on a page: its id, kind, whether it is open, and its markup up to the next section. */
type Sec = { id: string; kind: string; open: boolean; html: string };
function sections(body: string): Sec[] {
  const starts = [...body.matchAll(/<details class="sec sec-([a-z]+)" id="([^"]+)"[^>]*>/g)];
  return starts.map((m, i) => ({
    kind: m[1] ?? '', id: m[2] ?? '', open: /\sopen>$/.test(m[0]),
    html: body.slice(m.index ?? 0, starts[i + 1]?.index ?? body.indexOf('</main>')),
  }));
}
const sec = (body: string, id: string): Sec => {
  const s = sections(body).find((x) => x.id === id);
  assert.ok(s, `no section #${id}`);
  return s;
};

let biz = '';        // a company whose page has something still missing
let claim = '';      // a claim of a company, with a surveyor job
let surveyed = '';   // a claim assigned to the seeded surveyor

before(async () => {
  made = await createApp(':memory:', { documentRoot: mkdtempSync(join(tmpdir(), 'cb-138-')) });
  await new Promise<void>((r) => made.server.listen(0, '127.0.0.1', () => r()));
  const addr = made.server.address();
  base = `http://127.0.0.1:${typeof addr === 'object' && addr !== null ? addr.port : 0}`;
  const s = await seed(made.app.db, made.app.hasher, made.app.now);
  password = s.password;
  const t = made.app.now();
  made.app.db.run(
    'INSERT INTO users (id,email,email_canonical,display_name,role,password_hash,created_at,updated_at,business_id) VALUES (?,?,?,?,?,?,?,?,NULL)',
    ['u-readonly-138', 'readonly@example.invalid', 'readonly@example.invalid', 'Read-only Person', 'READ_ONLY', await made.app.hasher.hash(s.password), t, t],
  );
  for (const who of ['admin', 'sales', 'accounting', 'surveying', 'readonly'] as const) clients.set(who, await signIn(who));
  for (const b of made.app.db.all<{ id: string }>('SELECT id FROM businesses ORDER BY name')) {
    const page = await as('sales').get(`/staff/clients/${b.id}`);
    if (page.status === 200 && page.body.includes('>Ask the client</button>')) { biz = b.id; break; }
  }
  const job = made.app.db.get<{ claim_id: string }>(
    "SELECT j.claim_id FROM surveyor_jobs j JOIN users u ON u.id = j.surveyor_id WHERE u.email = 'surveying@example.invalid' AND j.claim_id IS NOT NULL LIMIT 1");
  surveyed = job?.claim_id ?? '';
  claim = made.app.db.get<{ id: string }>("SELECT id FROM claims WHERE stage = 'SURVEY' LIMIT 1")?.id ?? surveyed;
});
after(() => { made.close(); });

describe('one section component, on both pages', () => {
  test('the client page is coloured sections in the order of the bloat cut, each with a band, an icon, a word and a chip', async () => {
    assert.ok(biz !== '', 'the seed has no company with anything missing');
    const r = await as('sales').get(`/staff/clients/${biz}`);
    assert.equal(r.status, 200);
    const all = sections(r.body);
    // Phase 139 added "Check and tell the client" after the claims; Phase 142 added "Chat" before the activity.
    assert.deepEqual(all.map((x) => x.id), ['claims', 'checks', 'questions', 'chat', 'activity', 'details', 'contacts', 'properties', 'sources', 'answers', 'documents']);
    const words: Record<string, string> = { company: 'Company', property: 'Property', facts: 'Facts and figures', documents: 'Documents', money: 'Money', messages: 'Messages' };
    for (const x of all) {
      assert.match(x.html, /<span class="secicon" aria-hidden="true"><svg /, `#${x.id} has no icon`);
      assert.match(x.html, new RegExp(`<span class="seckind">${words[x.kind] ?? '?'}</span>`), `#${x.id} does not say its kind in words`);
      assert.match(x.html, /<summary>[\s\S]*<h2>[\s\S]*<\/h2>\s*<span class="badge[^"]*">(Not started|Working on it|Waiting for the client|Done)<\/span><\/summary>/, `#${x.id} has no status chip in words`);
    }
    assert.deepEqual(new Set(all.map((x) => x.kind)), new Set(['facts', 'messages', 'company', 'property', 'documents']));
  });

  test('every section opens with WORKING ON, WE NEED and COMING FROM, in that order', async () => {
    for (const path of [`/staff/clients/${biz}`, `/staff/claims/${claim}`]) {
      const r = await as('sales').get(path);
      assert.equal(r.status, 200, path);
      assert.ok(sections(r.body).length >= 5, `${path}: not drawn as sections`);
      for (const x of sections(r.body)) {
        const three = /<dl class="three">\s*<dt>Working on<\/dt><dd>[\s\S]+?<\/dd>\s*<dt>We need<\/dt><dd>[\s\S]+?<\/dd>\s*<dt>Coming from<\/dt><dd>[\s\S]+?<\/dd>\s*<\/dl>/.exec(x.html);
        assert.ok(three, `${path} #${x.id}: the three lines are not first, or not in order`);
        assert.ok(x.html.indexOf('<dl class="three">') < x.html.indexOf('<div class="secbody">') + 40, `${path} #${x.id}: something comes before the three lines`);
      }
    }
  });

  test('the claim page is sections too, and its duplicates are gone', async () => {
    const r = await as('sales').get(`/staff/claims/${claim}`);
    assert.equal(r.status, 200);
    const ids = sections(r.body).map((x) => x.id);
    for (const id of ['move', 'claim-facts', 'claim-figures', 'claim-property', 'claim-team', 'claim-documents', 'activity']) assert.ok(ids.includes(id), `no #${id}`);
    // Sales reads the multi-site discount (fee_discount.read) and nothing else of the money: no fee, no invoice.
    const money = sections(r.body).find((x) => x.id === 'claim-money');
    if (money !== undefined) assert.equal(/Our estimated fee|<h3>Invoices<\/h3>/.test(money.html), false, 'Sales was drawn the fee or the invoices');
    assert.equal(/The organisation(’|')s contacts/.test(r.body), false, 'the claim page still repeats the contacts');
    assert.equal(/<div class="pnum">The claim<\/div>/.test(r.body), false, 'the claim page still repeats its own fields');
    const hl = /<header class="highlights">[\s\S]*?<\/header>/.exec(r.body)?.[0] ?? '';
    assert.equal(/<dt>Property<\/dt>/.test(hl), false, 'the highlights repeat the property');
    assert.match(sec(r.body, 'move').html, /Every move so far/, 'the move history is not behind "More detail"');
    // PHASE 143: grants and contributions left this fold for a section of their own (test/phase143.test.ts).
    assert.match(sec(r.body, 'claim-facts').html, /<details id="record-fact"><summary>Record a fact or an owner<\/summary>/);
  });

  test('THE BLOAT CUT: no "Waiting on" card, no hidden tab heading, no numbered heading', async () => {
    const pages = [`/staff/clients/${biz}`, `/staff/claims/${claim}`, '/staff/finance'];
    for (const path of pages) {
      const who: Staff = path === '/staff/finance' ? 'accounting' : 'sales';
      const got = await as(who).get(path);
      assert.equal(got.status, 200, path);
      const b = got.body;
      assert.equal(/class="panelhead"/.test(b), false, `${path}: a hidden tab heading`);
      assert.equal(/<h[23][^>]*>\s*[0-9]+ · /.test(b), false, `${path}: a numbered heading`);
    }
    const c = (await as('sales').get(`/staff/clients/${biz}`)).body;
    assert.equal(/<div class="card-h"><h2>Waiting on<\/h2>/.test(c), false, 'the "Waiting on" card is still drawn');
    assert.equal(/Two gates, and both are shut/.test(c), false, 'the lookups still open with three paragraphs');
    assert.equal(/>fired</.test(c), false, '"fired" is still a word on the page');
  });
});

describe('WE NEED asks the client', () => {
  test('a missing fact is a line with an "Ask the client" button; pressing it puts it with the client and the line says so', async () => {
    const before = await as('sales').get(`/staff/clients/${biz}`);
    const withAsk = sections(before.body).find((x) => /<dt>We need<\/dt><dd><ul class="needs">[\s\S]*?>Ask the client<\/button>/.test(x.html));
    assert.ok(withAsk, 'no WE NEED line carries an ask');
    const form = /<form method="post" action="(\/staff\/clients\/[^"]+\/tasks\/send)" class="inline">([\s\S]*?)<\/form>/.exec(withAsk.html);
    assert.ok(form, 'the ask is not a form to the question route');
    const fields = Object.fromEntries([...(form[2] ?? '').matchAll(/<input type="hidden" name="([^"]+)" value="([^"]*)">/g)].map((m) => [m[1] ?? '', (m[2] ?? '').replace(/&#39;/g, "'").replace(/&amp;/g, '&').replace(/&quot;/g, '"')]));
    const sent = await as('sales').post(form[1] ?? '', fields);
    assert.equal(sent.status, 303);
    const afterPage = await as('sales').get(`/staff/clients/${biz}`);
    const same = sec(afterPage.body, withAsk.id);
    assert.match(same.html, /Asked — waiting/, 'the asked fact does not say it is waiting');
    assert.equal(made.app.db.get<{ n: number }>("SELECT COUNT(*) AS n FROM client_tasks WHERE business_id = ? AND fact_id = ? AND state = 'OPEN'", [biz, fields['fact_id'] ?? ''])?.n, 1);
  });

  test('a claim fact asked from the claim page goes to the client naming the claim, and then says "Asked — waiting"', async () => {
    const r = await as('sales').get(`/staff/claims/${claim}`);
    const facts = sec(r.body, 'claim-facts');
    const form = /<form method="post" action="(\/staff\/clients\/[^"]+\/tasks\/send)" class="inline">([\s\S]*?)<\/form>/.exec(facts.html);
    assert.ok(form, 'no claim fact can be asked');
    const fields = Object.fromEntries([...(form[2] ?? '').matchAll(/<input type="hidden" name="([^"]+)" value="([^"]*)">/g)].map((m) => [m[1] ?? '', (m[2] ?? '').replace(/&#39;/g, "'").replace(/&amp;/g, '&').replace(/&quot;/g, '"')]));
    assert.equal(fields['claim_id'], claim);
    assert.match(fields['fact_id'] ?? '', /^claim_fact\./);
    assert.equal((await as('sales').post(form[1] ?? '', fields)).status, 303);
    assert.match(sec((await as('sales').get(`/staff/claims/${claim}`)).body, 'claim-facts').html, /Asked — waiting/);
  });

  test('Read only reads the company but is offered no ask, no questions, no lookups and no notes', async () => {
    const r = await as('readonly').get(`/staff/clients/${biz}`);
    assert.equal(r.status, 200);
    assert.equal(/>Ask the client</.test(r.body), false, 'Read only was offered an ask');
    const ids = sections(r.body).map((x) => x.id);
    for (const hidden of ['questions', 'sources', 'answers']) assert.equal(ids.includes(hidden), false, `Read only was drawn #${hidden}`);
    assert.equal(r.body.includes('Internal notes'), false);
    assert.equal((await as('readonly').post(`/staff/clients/${biz}/tasks/send`, { fact_id: 'x', question: 'q', why: 'w', holds_up: 'h' })).status === 303, false, 'Read only could ask the client');
  });
});

describe('open and closed, remembered per person', () => {
  test('a Done section starts closed and a section being worked on starts open', async () => {
    const r = await as('sales').get(`/staff/clients/${biz}`);
    assert.ok(sections(r.body).length >= 5, 'the client page is not drawn as sections');
    assert.ok(sections(r.body).some((x) => x.open) && sections(r.body).some((x) => !x.open), 'every section is open, or every one closed');
    for (const x of sections(r.body)) {
      const chip = /<span class="badge[^"]*">(Not started|Working on it|Waiting for the client|Done)<\/span><\/summary>/.exec(x.html)?.[1];
      if (chip === 'Done' || chip === 'Not started') assert.equal(x.open, false, `#${x.id} is ${chip} and open`);
      else assert.equal(x.open, true, `#${x.id} is ${chip ?? '?'} and closed`);
    }
  });

  test('"keep this open for me" is kept for that person only, on the server, never in the address; "Let the page decide" undoes it', async () => {
    const page = `/staff/clients/${biz}`;
    const before = sec((await as('sales').get(page)).body, 'contacts');
    assert.equal(before.open, false, 'contacts started open, so the test proves nothing');
    const kept = await as('sales').post('/staff/me/sections', { section: 'client.contacts', open: 'yes', back: page, anchor: 'contacts' });
    assert.equal(kept.status, 303);
    assert.equal(kept.location, `${page}#contacts`, 'sent somewhere other than back to the section');
    const mine = sec((await as('sales').get(page)).body, 'contacts');
    assert.equal(mine.open, true, 'the choice was not kept');
    assert.match(mine.html, /You keep this open\./);
    assert.equal(sec((await as('admin').get(page)).body, 'contacts').open, false, 'one person’s choice reached another');
    assert.equal(made.app.db.get<{ n: number }>("SELECT COUNT(*) AS n FROM audit_log WHERE kind = 'SECTION_PREFERENCE_SET'")?.n, 1, 'the choice was not audited once');
    // Never in the address: the page's links and forms carry no section choice.
    assert.equal(/href="[^"]*(section|open)=/.test((await as('sales').get(page)).body), false, 'a link carries a section choice');
    await as('sales').post('/staff/me/sections', { section: 'client.contacts', open: 'auto', back: page, anchor: 'contacts' });
    assert.equal(sec((await as('sales').get(page)).body, 'contacts').open, false, '"Let the page decide" did not undo it');
    assert.equal(made.app.db.get<{ n: number }>("SELECT COUNT(*) AS n FROM section_prefs")?.n, 0);
  });

  test('a section key off the list, a choice that is not yes, no or auto, or a return address that is not one of the two pages is refused, and nothing is written', async () => {
    const page = `/staff/clients/${biz}`;
    for (const bad of [
      { section: 'client.nonsense', open: 'yes', back: page, anchor: 'x' },
      { section: 'client.contacts', open: 'maybe', back: page, anchor: 'x' },
      { section: 'client.contacts', open: 'yes', back: 'https://example.com/steal', anchor: 'x' },
      { section: 'client.contacts', open: 'yes', back: `${page}?email=someone@example.invalid`, anchor: 'x' },
      { section: 'client.contacts', open: 'yes', back: '//example.com', anchor: 'x' },
    ]) {
      const r = await as('sales').post('/staff/me/sections', bad);
      assert.notEqual(r.status, 303, `refused nothing: ${JSON.stringify(bad)}`);
    }
    assert.equal(made.app.db.get<{ n: number }>("SELECT COUNT(*) AS n FROM section_prefs")?.n, 0);
  });

  test('after a change the section it was made in is open, whatever the person keeps', async () => {
    const page = `/staff/clients/${biz}`;
    await as('sales').post('/staff/me/sections', { section: 'client.company', open: 'no', back: page, anchor: 'details' });
    assert.equal(sec((await as('sales').get(page)).body, 'details').open, false);
    assert.equal(sec((await as('sales').get(`${page}?done=saved`)).body, 'details').open, true);
    await as('sales').post('/staff/me/sections', { section: 'client.company', open: 'auto', back: page, anchor: 'details' });
  });
});

describe('colours, from the brand tokens, and never colour alone', () => {
  test('six kinds, six different bands, each built from brand tokens only', () => {
    const tokens = new Set(Object.keys(BRAND_TOKENS));
    const bands = new Map<string, string>();
    for (const kind of ['company', 'property', 'facts', 'documents', 'money', 'messages']) {
      const m = new RegExp(`\\.sec-${kind}\\{--band:([^}]+)\\}`).exec(CSS);
      assert.ok(m, `no band for ${kind}`);
      const v = m[1] ?? '';
      assert.equal(/#[0-9a-f]{3,8}\b|rgb\(|hsl\(/i.test(v), false, `${kind}'s band is not a brand token: ${v}`);
      for (const t of v.matchAll(/var\(--([a-z-]+)\)/g)) assert.ok(tokens.has(t[1] ?? ''), `${kind} uses --${t[1] ?? ''}, not a brand token`);
      bands.set(kind, v);
    }
    assert.equal(new Set(bands.values()).size, 6, 'two kinds share a colour');
    assert.match(CSS, /@media \(max-width:720px\)\{[\s\S]*dl\.three\{grid-template-columns:minmax\(0,1fr\)\}/, 'the three lines do not stack on a phone');
  });
});

describe('rules kept', () => {
  test('a surveyor’s claim page has no money and no figures; Accounting’s has money and no facts or figures', async () => {
    assert.ok(surveyed !== '', 'the seed has no claim assigned to the surveyor');
    const sv = await as('surveying').get(`/staff/claims/${surveyed}`);
    assert.equal(sv.status, 200);
    const svIds = sections(sv.body).map((x) => x.id);
    for (const no of ['claim-money', 'claim-figures']) assert.equal(svIds.includes(no), false, `the surveyor was drawn #${no}`);
    assert.equal(/>Ask the client</.test(sv.body), false, 'the surveyor was offered an ask');
    const ac = await as('accounting').get(`/staff/claims/${claim}`);
    assert.equal(ac.status, 200);
    const acIds = sections(ac.body).map((x) => x.id);
    assert.ok(acIds.includes('claim-money'), 'Accounting was not drawn the money');
    for (const no of ['claim-facts', 'claim-figures']) assert.equal(acIds.includes(no), false, `Accounting was drawn #${no}`);
  });

  test('no script, no style attribute and no id used twice on either page', async () => {
    for (const path of [`/staff/clients/${biz}`, `/staff/claims/${claim}`]) {
      const got = await as('admin').get(path);
      assert.equal(got.status, 200, path);
      const b = got.body;
      assert.equal(/<script|\sstyle=|\son[a-z]+=/i.test(b), false, `${path}: a script, a style attribute or a handler`);
      const ids = [...b.matchAll(/\sid="([^"]+)"/g)].map((x) => x[1] ?? '');
      assert.deepEqual([...new Set(ids.filter((id, i) => ids.indexOf(id) !== i))], [], `${path}: an id used twice`);
    }
  });
});
