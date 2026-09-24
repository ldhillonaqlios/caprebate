/**
 * PHASE 134 — THE CLIENT IS THE COMPANY. 18 September 2026. "Back office and portal clean-up, 1 of 11."
 *
 * Lakhbir: "There is too much of an emphasis on the CR number - the main focus point should be the company name", and
 * "think about one business with multiple claims - all communication needs to be under one client's portal and
 * dashboard". The phase is DONE WHEN a company seeded with two properties and three claims shows one client page, three
 * claim tiles, one timeline and one portal listing three claims — and no staff screen uses the claim reference as a
 * heading or as link text, found by reading the RENDERED HTML of every screen every login reaches, not by eye.
 *
 *   ONE CLIENT PAGE      /staff/clients/:id carries the organisation's record and the research half; the organisation's
 *                        own address redirects there after asking exactly what it asked
 *   THREE TILES          one per claim, each opening the claim inside the company, under "Company > Property"
 *   ONE TIMELINE         every claim's events on the company's page, a note tagged with the claim it is about
 *   THE PORTAL           "Your claims": exactly this company's claims; another company's claim is 404
 *   NO REFERENCE LEADS   no <a>, <h1>–<h3> or <title> carries a claim reference, and no table row starts with one
 *   SEARCH               a company-name match ranks first
 *   THE SAME RULES       internal notes never reach the portal; a tag naming another company's claim is refused, by the
 *                        store and by the database
 *   EMAIL SUBJECTS       a client's email leads with the company; a staff notice does so only when Lakhbir switches it on
 */

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { createApp } from '../src/server.ts';
import { seed } from '../src/seed.ts';
import { createUser } from '../src/users.ts';
import * as E from '../src/web/engaged.ts';
import * as SE from '../src/web/search.ts';
import { companyFirst } from '../src/web/templates.ts';
import { NOTICE_SUBJECT_LEADS_WITH_COMPANY, noticeSubject } from '../src/web/automation.ts';
import type { Actor } from '../src/authz.ts';

type Made = Awaited<ReturnType<typeof createApp>>;
type Res = { status: number; location: string | null; body: string; type: string | null };
type Client = { get(path: string): Promise<Res>; post(path: string, form: Record<string, string>): Promise<Res> };
const STAFF = ['admin', 'sales', 'accounting', 'surveying', 'readonly'] as const;
type Login = (typeof STAFF)[number] | 'client' | 'elverton';

const REF = /CR-\d{4}-\d{4}/;
const ELVERTON = 'Elverton Private Hospital Limited';

let made: Made;
let base = '';
const clients = new Map<Login, Client>();
let elverton = '';
let corvale = '';
let claims: { id: string; business_id: string; claim_ref: string }[] = [];

async function signIn(email: string, password: string): Promise<Client> {
  const r = await fetch(`${base}/login`, {
    method: 'POST', redirect: 'manual', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ email, password }).toString(),
  });
  assert.equal(r.status, 303, `${email} could not sign in`);
  const cookie = r.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ');
  const call = async (path: string, init: RequestInit = {}): Promise<Res> => {
    const x = await fetch(base + path, { redirect: 'manual', ...init, headers: { cookie, ...(init.headers ?? {}) } });
    return { status: x.status, location: x.headers.get('location'), body: await x.text(), type: x.headers.get('content-type') };
  };
  return {
    get: (path) => call(path),
    post: (path, form) => call(path, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(form).toString() }),
  };
}

before(async () => {
  made = await createApp(':memory:', { documentRoot: mkdtempSync(join(tmpdir(), 'cb-134-')) });
  await new Promise<void>((r) => made.server.listen(0, '127.0.0.1', () => r()));
  const addr = made.server.address();
  base = `http://127.0.0.1:${typeof addr === 'object' && addr !== null ? addr.port : 0}`;
  const s = await seed(made.app.db, made.app.hasher, made.app.now);
  const db = made.app.db;
  const t = made.app.now();
  const hash = await made.app.hasher.hash(s.password);
  // The seed assigns the view-only login to nobody (Phase 132e), and its one client belongs to Corvale; this suite needs
  // a view-only login and a client of the company with three claims.
  db.run('INSERT INTO users (id,email,email_canonical,display_name,role,password_hash,created_at,updated_at,business_id) VALUES (?,?,?,?,?,?,?,?,NULL)',
    ['u-readonly-134', 'readonly@example.invalid', 'readonly@example.invalid', 'Read-only User', 'READ_ONLY', hash, t, t]);
  elverton = db.get<{ id: string }>('SELECT id FROM businesses WHERE name = ?', [ELVERTON])?.id ?? '';
  corvale = db.get<{ id: string }>("SELECT id FROM businesses WHERE name = 'Corvale Supported Living Limited'")?.id ?? '';
  createUser(db, made.app.now, { email: 'elverton@example.invalid', display_name: 'Client User', role: 'CLIENT', password_hash: hash, business_id: elverton });
  for (const who of STAFF) clients.set(who, await signIn(`${who}@example.invalid`, s.password));
  clients.set('client', await signIn('client@example.invalid', s.password));
  clients.set('elverton', await signIn('elverton@example.invalid', s.password));
  claims = db.all<{ id: string; business_id: string; claim_ref: string }>('SELECT id, business_id, claim_ref FROM claims ORDER BY claim_ref');
});
after(async () => { await new Promise<void>((r) => made.server.close(() => r())); });
const as = (who: Login): Client => clients.get(who) as Client;

/** The claim-tile list inside the "Claims" card. */
function tiles(body: string, id: string): string[] {
  // PHASE 138: the Claims card is now a coloured section (a <details>); its tiles are the first tile list after its id.
  const card = new RegExp(`<section class="card" id="${id}">([\\s\\S]*?)</section>`).exec(body)?.[1]
    ?? new RegExp(`<details class="sec sec-[a-z]+" id="${id}"[\\s\\S]*?(<ul class="tiles">[\\s\\S]*?</ul>)`).exec(body)?.[1] ?? '';
  return [...card.matchAll(/<li class="tile">([\s\S]*?)<\/li>/g)].map((m) => m[1] ?? '');
}

describe('the seeded company with two properties and three claims', () => {
  test('Elverton is seeded with two properties and three claims', () => {
    const db = made.app.db;
    assert.equal(db.get<{ n: number }>('SELECT COUNT(*) AS n FROM properties WHERE business_id = ?', [elverton])?.n, 2);
    assert.equal(db.get<{ n: number }>('SELECT COUNT(*) AS n FROM claims WHERE business_id = ?', [elverton])?.n, 3);
  });

  test('ONE CLIENT PAGE: the company’s name is the heading, three tiles each opening the claim inside it, one timeline', async () => {
    const r = await as('sales').get(`/staff/clients/${elverton}`);
    assert.equal(r.status, 200);
    assert.match(r.body, new RegExp(`<title>${ELVERTON}[^<]*</title>`), 'the tab title does not lead with the company');
    assert.match(r.body, new RegExp(`<h1>${ELVERTON}</h1>`), 'the heading is not the company’s name');
    const t = tiles(r.body, 'claims');
    assert.equal(t.length, 3, 'not three claim tiles');
    const mine = claims.filter((c) => c.business_id === elverton);
    for (const c of mine) {
      const tile = t.find((x) => x.includes(`/staff/clients/${elverton}/claims/${c.id}`));
      assert.ok(tile, `no tile opens ${c.claim_ref} inside the company`);
      assert.match(tile, new RegExp(`<span class="claimref">${c.claim_ref}</span>`), 'the reference is not the grey label');
      assert.doesNotMatch(tile, /<a [^>]*>[^<]*CR-/, 'a tile’s link text is the reference');
      const inside = await as('sales').get(`/staff/clients/${elverton}/claims/${c.id}`);
      assert.equal(inside.status, 200);
      assert.match(inside.body, new RegExp(`<nav class="crumbs"[^>]*><ol><li><a href="/staff/clients/${elverton}">${ELVERTON}</a></li>`), 'no "Company > Claim" breadcrumb');
      assert.match(inside.body, new RegExp(`<h1>${ELVERTON}</h1>`), 'the claim page’s heading is not the company');
    }
    // ONE timeline, and every claim is in it.
    assert.equal([...r.body.matchAll(/<div class="pnum">Everything with /g)].length, 1, 'not exactly one timeline');
    for (const c of mine) assert.ok(r.body.includes(`<span class="claimref">${c.claim_ref}</span>`));
    // The organisation's parts and the research half are both on the one page.
    // PHASE 138: coloured sections, not tabs; the old anchors are kept, #tasks and #missing inside Questions for the client.
    for (const tab of ['activity', 'questions', 'answers', 'sources', 'contacts', 'properties', 'documents', 'details']) {
      assert.match(r.body, new RegExp(`<details class="sec sec-[a-z]+" id="${tab}"`), `no ${tab} section`);
    }
    for (const inner of ['tasks', 'missing']) assert.ok(r.body.includes(`id="${inner}"`), `no #${inner}`);
  });

  test('a claim addressed under a company that is not its own is refused, as a claim that does not exist', async () => {
    const other = claims.find((c) => c.business_id !== elverton);
    assert.ok(other);
    assert.equal((await as('sales').get(`/staff/clients/${elverton}/claims/${other.id}`)).status, 403);
    assert.equal((await as('sales').get(`/staff/clients/${elverton}/claims/no-such-claim`)).status, 403);
  });

  test('/staff/organisations/:id is alive: it sends a reader to the one page, and still refuses whoever it refused', async () => {
    const r = await as('sales').get(`/staff/organisations/${elverton}?done=saved`);
    assert.equal(r.status, 303);
    assert.equal(r.location, `/staff/clients/${elverton}?done=saved`);
    assert.equal((await as('accounting').get(`/staff/organisations/${elverton}`)).status, 403);
    assert.equal((await as('surveying').get(`/staff/organisations/${elverton}`)).status, 403);
    assert.equal((await as('client').get(`/staff/organisations/${elverton}`)).status, 403);
    // The view-only login reads the organisation, and not the research half or a note.
    const ro = await as('readonly').get(`/staff/clients/${elverton}`);
    assert.equal(ro.status, 200);
    assert.equal(ro.body.includes('id="sources"'), false, 'the view-only login was given the research');
    assert.equal(ro.body.includes('Internal notes'), false, 'the view-only login was given the notes');
  });

  test('THE CLAIMS LIST: Company, Property, Stage, Next action, Owner — and Reference last, in grey', async () => {
    const r = await as('sales').get('/staff/claims');
    const head = /<thead><tr>([\s\S]*?)<\/tr><\/thead>/.exec(r.body)?.[1] ?? '';
    const cols = [...head.matchAll(/<th>([\s\S]*?)<\/th>/g)].map((m) => (m[1] ?? '').replace(/<span class="sorted">[^<]*<\/span>/, '').replace(/<[^>]+>/g, '').trim());
    assert.deepEqual(cols, ['Company', 'Property', 'Stage', 'Next action', 'Owner', 'Reference']);
    for (const c of claims) assert.ok(r.body.includes(`<td><span class="claimref">${c.claim_ref}</span></td>`), `${c.claim_ref} is not a grey label`);
  });
});

describe('ONE TIMELINE, AND WHAT TALKS TO THE CLIENT BELONGS TO THE COMPANY', () => {
  test('a note on the company may say which of its claims it is about; another company’s claim is refused', async () => {
    const mine = claims.find((c) => c.business_id === elverton);
    const other = claims.find((c) => c.business_id !== elverton);
    assert.ok(mine && other);
    const ok = await as('sales').post(`/staff/clients/${elverton}/notes`, { body: 'Phase 134 note about the annexe', claim_id: mine.id });
    assert.equal(ok.status, 303);
    assert.equal(made.app.db.get<{ claim_id: string | null }>("SELECT claim_id FROM internal_notes WHERE body = 'Phase 134 note about the annexe'")?.claim_id, mine.id);
    const page = await as('sales').get(`/staff/clients/${elverton}`);
    assert.ok(page.body.includes('Phase 134 note about the annexe'));
    const bad = await as('sales').post(`/staff/clients/${elverton}/notes`, { body: 'Phase 134 wrong claim', claim_id: other.id });
    assert.notEqual(bad.status, 303);
    assert.equal(made.app.db.get<{ n: number }>("SELECT COUNT(*) AS n FROM internal_notes WHERE body = 'Phase 134 wrong claim'")?.n, 0);
    // INTERNAL NOTES NEVER REACH A CLIENT.
    const portal = await as('elverton').get('/portal');
    assert.equal(portal.body.includes('Phase 134 note about the annexe'), false, 'an internal note reached the portal');
  });

  test('a question to the client may carry a claim — only one of the company’s own, by the store AND the database', () => {
    const db = made.app.db;
    const d = { db, audit: made.app.audit, now: made.app.now, newId: randomUUID };
    const sales: Actor = { id: db.get<{ id: string }>("SELECT id FROM users WHERE role = 'SALES'")?.id ?? '', role: 'SALES', business_id: null, disabled: false } as Actor;
    const mine = claims.find((c) => c.business_id === elverton);
    const other = claims.find((c) => c.business_id !== elverton);
    assert.ok(mine && other);
    const r = E.sendTaskToPortal(d, sales, elverton, { fact_id: null, question: 'Which year was the annexe fitted out?', why: 'w', holds_up: 'h', claim_id: mine.id });
    assert.equal(r.ok, true);
    assert.equal(db.get<{ claim_id: string | null }>("SELECT claim_id FROM client_tasks WHERE question = 'Which year was the annexe fitted out?'")?.claim_id, mine.id);
    assert.equal(E.sendTaskToPortal(d, sales, elverton, { fact_id: null, question: 'q', why: 'w', holds_up: 'h', claim_id: other.id }).ok, false);
    assert.throws(() => db.run(
      "INSERT INTO client_tasks (id, business_id, asked_by, question, why, holds_up, state, created_at, claim_id) VALUES ('ct-134', ?, ?, 'q', 'w', 'h', 'OPEN', ?, ?)",
      [elverton, sales.id, made.app.now(), other.id]), /own organisation/);
  });
});

describe('THE PORTAL: the company’s name, and "Your claims"', () => {
  test('a client of the company with three claims sees exactly three, each opening that claim’s progress', async () => {
    const r = await as('elverton').get('/portal');
    assert.equal(r.status, 200);
    assert.match(r.body, new RegExp(`<h1>${ELVERTON}</h1>`));
    assert.match(r.body, /<a href="\/portal" aria-current="page">Your claims<\/a>/, 'the tab is not "Your claims"');
    assert.equal(r.body.includes('>Your claim</a>'), false, 'the single "Your claim" tab is still there');
    const t = tiles(r.body, 'your-claims');
    assert.equal(t.length, 3);
    for (const c of claims.filter((x) => x.business_id === elverton)) {
      assert.ok(t.some((x) => x.includes(`/portal/claims/${c.id}`)), `no tile for ${c.claim_ref}`);
      const one = await as('elverton').get(`/portal/claims/${c.id}`);
      assert.equal(one.status, 200);
      assert.match(one.body, new RegExp(`<h1>${ELVERTON}</h1>`));
      assert.equal(/Hold reason|next action|Owner/i.test(one.body.replace(/<[^>]+>/g, ' ')), false, 'staff words reached the client');
    }
  });

  test('a client of company A asking for company B’s claim gets 404 — and so does a claim that does not exist', async () => {
    const other = claims.find((c) => c.business_id !== elverton);
    assert.ok(other);
    const a = await as('elverton').get(`/portal/claims/${other.id}`);
    const b = await as('elverton').get('/portal/claims/no-such-claim');
    assert.equal(a.status, 404);
    assert.equal(b.status, 404);
    assert.equal(a.body, b.body, 'another company’s claim and a missing claim read differently');
    assert.equal(a.body.includes(other.claim_ref), false);
    // A client naming another business is refused, as before.
    assert.equal((await as('elverton').get(`/portal?business=${corvale}`)).status, 403);
  });

  test('the Corvale client, with one claim, sees one', async () => {
    const r = await as('client').get('/portal');
    assert.equal(tiles(r.body, 'your-claims').length, made.app.db.get<{ n: number }>('SELECT COUNT(*) AS n FROM claims WHERE business_id = ?', [corvale])?.n);
  });
});

describe('NO STAFF SCREEN USES A CLAIM REFERENCE AS A HEADING OR AS LINK TEXT — every screen every login reaches', () => {
  /** Every same-origin page a login reaches from home, one example of each shape of address — the Phase 133a crawl. */
  async function crawl(c: Client, start: string): Promise<Map<string, Res>> {
    const seen = new Map<string, Res>();
    const shapes = new Set<string>();
    const queue = [start];
    while (queue.length > 0 && seen.size < 400) {
      const u = queue.shift() ?? '';
      if (seen.has(u)) continue;
      const r = await c.get(u);
      seen.set(u, r);
      if (r.status !== 200 || !(r.type ?? '').startsWith('text/html')) continue;
      for (const x of r.body.matchAll(/href="([^"#]+)"/g)) {
        const href = (x[1] ?? '').replace(/&amp;/g, '&');
        if (!href.startsWith('/') || href.startsWith('//')) continue;
        if (/^\/(assets|logout)|\.csv(\?|$)|\/upload\//.test(href)) continue;
        const shape = href.replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/gi, '{id}').replace(/=[^&]*/g, '=');
        if (shapes.has(shape)) continue;
        shapes.add(shape);
        queue.push(href);
      }
    }
    return seen;
  }

  /** What a person reads inside an element: tags stripped, entities left. */
  const text = (s: string): string => s.replace(/<[^>]+>/g, '').trim();

  function offences(path: string, body: string): string[] {
    const out: string[] = [];
    for (const m of body.matchAll(/<a\b[^>]*>([\s\S]*?)<\/a>/g)) if (REF.test(text(m[1] ?? ''))) out.push(`${path}: link text "${text(m[1] ?? '')}"`);
    for (const m of body.matchAll(/<(h1|h2|h3|title)\b[^>]*>([\s\S]*?)<\/\1>/g)) if (REF.test(text(m[2] ?? ''))) out.push(`${path}: ${m[1]} "${text(m[2] ?? '')}"`);
    for (const m of body.matchAll(/<tr>\s*<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/g)) if (REF.test(text(m[1] ?? '').slice(0, 12))) out.push(`${path}: a row starts with "${text(m[1] ?? '')}"`);
    return out;
  }

  for (const who of STAFF) {
    test(`${who}: the rendered HTML of every screen it reaches`, async () => {
      const pages = await crawl(as(who), '/staff');
      // The screens this phase changed are reached directly as well, in case no link leads a login to them.
      for (const c of claims) {
        for (const path of [`/staff/claims/${c.id}`, `/staff/clients/${c.business_id}/claims/${c.id}`, `/staff/clients/${c.business_id}`]) {
          if (!pages.has(path)) pages.set(path, await as(who).get(path));
        }
      }
      const found = [...pages].filter(([, r]) => r.status === 200 && (r.type ?? '').startsWith('text/html')).flatMap(([p, r]) => offences(p, r.body));
      assert.deepEqual(found, []);
      assert.ok([...pages.values()].some((r) => r.status === 200 && REF.test(r.body)), 'no page this login reached shows any claim reference at all — the check proved nothing');
    });
  }

  test('the check can fail: a link whose words are the reference is found', () => {
    assert.equal(offences('x', '<a href="/staff/claims/1">CR-2026-0001</a>').length, 1);
    assert.equal(offences('x', '<h1>CR-2026-0001 · Elverton</h1>').length, 1);
    assert.equal(offences('x', '<tr><td>CR-2026-0001</td><td>Elverton</td></tr>').length, 1);
    assert.equal(offences('x', '<a href="/staff/claims/1">Elverton — annexe</a> <span class="claimref">CR-2026-0001</span>').length, 0);
  });
});

describe('SEARCH: a company-name match ranks first', () => {
  test('searching the company finds the company first, then its claims, named by company and property', () => {
    const sales = { id: made.app.db.get<{ id: string }>("SELECT id FROM users WHERE role = 'SALES'")?.id ?? '', role: 'SALES', business_id: null, disabled: false } as Actor;
    const r = SE.search(made.app.db, sales, 'Elverton');
    assert.equal(r.hits[0]?.kind, 'ORGANISATION');
    assert.equal(r.hits[0]?.label, ELVERTON);
    const claimHits = r.hits.filter((x) => x.kind === 'CLAIM');
    assert.equal(claimHits.length, 3, 'the company’s claims are not found by its name');
    for (const x of claimHits) {
      assert.ok(x.label.startsWith(`${ELVERTON} — `), `a claim hit does not lead with the company: ${x.label}`);
      assert.equal(REF.test(x.label), false);
    }
    // Ranking is the order only: the same hits, whatever the order.
    const firstOther = r.hits.findIndex((x) => x.company === undefined || !x.company.includes('Elverton'));
    const lastMatch = r.hits.map((x) => x.company?.includes('Elverton') ?? false).lastIndexOf(true);
    assert.ok(firstOther === -1 || firstOther > lastMatch, 'a hit from another company ranks above a company-name match');
  });
});

describe('EMAIL SUBJECTS lead with the company', () => {
  test('a client’s email: the company in front, unless the subject already starts with it', () => {
    assert.equal(companyFirst('Documents we still need', 'Elverton Ltd'), 'Elverton Ltd — Documents we still need');
    assert.equal(companyFirst('Elverton Ltd — the next step on your claim', 'Elverton Ltd'), 'Elverton Ltd — the next step on your claim');
    assert.equal(companyFirst('Documents', null), 'Documents');
    assert.equal(companyFirst('x', 'A & B <Ltd>'), 'A &amp; B &lt;Ltd&gt; — x', 'the company’s name was not escaped');
    assert.equal(made.app.db.get<{ subject: string }>("SELECT subject FROM email_templates WHERE id = 'template-next-step'")?.subject,
      '{{organisation}} — the next step on your claim');
  });

  test('a staff notice: built both ways, and ON since Lakhbir answered (Word answer 71, Phase 151) — the company leads the subject', () => {
    assert.equal(NOTICE_SUBJECT_LEADS_WITH_COMPANY, true, 'Lakhbir answered yes on 24 September 2026: staff emails name the company');
    assert.equal(noticeSubject('A claim is now at Survey (CR-2026-0004)', null), 'A claim is now at Survey (CR-2026-0004)');
    assert.equal(noticeSubject('A claim is now at Survey (CR-2026-0004)', 'Dunmarrow Medical Practice Limited'),
      'Dunmarrow Medical Practice Limited — a claim is now at Survey (CR-2026-0004)');
  });
});
