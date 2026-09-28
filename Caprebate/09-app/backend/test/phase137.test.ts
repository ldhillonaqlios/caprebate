/**
 * PHASE 137 — THE LEADS PAGE AS CARDS, SPLIT SO A NEW LEAD CANNOT GET LOST. 21 September 2026.
 *
 * Lakhbir, 18 September 2026: "these should be CTA cards which the user can click on to display the information
 * underneath. A new lead can easily slip out of this whole pile, so it needs to be split up."
 *
 *   FOUR SECTIONS      → New, In progress, Later, Closed — in that order, each with its count; New never folded, Closed
 *                        folded. A website enquiry nobody has answered is in New, for the logins that work leads only.
 *   A CARD OPENS       → each card is a <details>: the summary carries the company, sector, source, how long it has
 *                        waited, owner and next step; the details carry how to reach them, the assessment, the checks.
 *   RED IS ONE RULE    → New turns red after more than one working day, and Home says exactly the same of the same lead;
 *                        Home's New leads row counts the same cards, website enquiries included.
 *   BANK HOLIDAYS      → a bank holiday is not a working day; the list fails this suite 90 days before it runs out.
 *   NOBODY OWNS IT     → one button, "Nobody owns this — take it", which makes the person pressing it the owner.
 *   LOG A CALL         → a completed Call task on the lead; a call where they answered makes a New lead Contacted.
 *   MARK AS LOST       → asks why, and refuses without a reason.
 *   ORDER              → waiting time, oldest first. No card carries a range or a value.
 *   LIST VIEW          → the table stays, at ?layout=list, and its filters keep it.
 *   HOME ON A PHONE    → the pipeline row's tiles are two to a row at phone width.
 *   RULES KEPT         → Read only sees the cards but no button; Accounting and Surveying are refused the page.
 *
 * Written against HTTP apart from the pure working-day cases, so it fails against the .bak-phase137 copies.
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
import { BANK_HOLIDAYS_EW, BANK_HOLIDAYS_KNOWN_TO, isWorkingDay, workingDaysSince } from '../src/web/working-days.ts';
import * as Home from '../src/web/home.ts';
import { SITE_CSS as CSS } from '../src/web/assets.ts';

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

function addLead(id: string, name: string, at: string, status = 'NEW', owner: string | null = null): void {
  made.app.db.run(
    'INSERT INTO leads (id, business_id, assessment_id, booking_id, claim_id, origin, source, introducer_id, prospect_organisation, ' +
      'prospect_sector, lead_date, owner_id, priority, next_action, next_action_due, status, lost_reason, lost_note, converted_at, created_at, updated_at) ' +
      "VALUES (?, NULL, NULL, NULL, NULL, 'STAFF', 'REFERRAL', NULL, ?, 'dental', ?, ?, 'NORMAL', NULL, NULL, ?, NULL, NULL, NULL, ?, ?)",
    [id, name, at, owner, status, at, at],
  );
}

const userId = (email: string): string => made.app.db.get<{ id: string }>('SELECT id FROM users WHERE email = ?', [email])?.id ?? '';

/** The section's own markup, from its opening tag to the next section. */
function section(body: string, key: string): string {
  const m = new RegExp(`<section class="leadsec" id="leads-${key}"[\\s\\S]*?</section>`).exec(body);
  return m?.[0] ?? '';
}
function card(body: string, id: string): string {
  const m = new RegExp(`<li class="leadcard[^"]*" id="lead-${id}">[\\s\\S]*?</details>([\\s\\S]*?)</li>`).exec(body);
  return m?.[0] ?? '';
}
function summaries(html: string): string[] {
  return [...html.matchAll(/<summary>\s*<span class="lc-name">[\s\S]*?<\/summary>/g)].map((m) => m[0]);
}

before(async () => {
  made = await createApp(':memory:', { twoFactor: 'off', documentRoot: mkdtempSync(join(tmpdir(), 'cb-137-')) });
  await new Promise<void>((r) => made.server.listen(0, '127.0.0.1', () => r()));
  const addr = made.server.address();
  base = `http://127.0.0.1:${typeof addr === 'object' && addr !== null ? addr.port : 0}`;
  const s = await seed(made.app.db, made.app.hasher, made.app.now);
  password = s.password;
  const t = made.app.now();
  made.app.db.run(
    'INSERT INTO users (id,email,email_canonical,display_name,role,password_hash,created_at,updated_at,business_id) VALUES (?,?,?,?,?,?,?,?,NULL)',
    ['u-readonly-137', 'readonly@example.invalid', 'readonly@example.invalid', 'Read-only Person', 'READ_ONLY', await made.app.hasher.hash(s.password), t, t],
  );
  const now = Date.parse(t);
  const ago = (days: number): string => new Date(now - days * 86_400_000).toISOString();
  addLead('l137-old', 'Oldest Waiting Dental Limited', ago(20));
  addLead('l137-mid', 'Middle Waiting Dental Limited', ago(12));
  addLead('l137-fresh', 'Fresh Arrival Dental Limited', t);
  addLead('l137-later', 'Saved For Later Dental Limited', ago(30), 'NURTURE', userId('sales@example.invalid'));
  addLead('l137-lost', 'Already Lost Dental Limited', ago(40), 'NURTURE', userId('sales@example.invalid'));
  made.app.db.run("UPDATE leads SET status = 'LOST', lost_reason = 'OUTSIDE_SCOPE' WHERE id = 'l137-lost'");
  made.app.db.run(
    'INSERT INTO website_enquiries (id, created_at, full_name, firm, email, phone, property_type, message, contact_consent, status) ' +
      "VALUES ('enq-137', ?, 'Invented Enquirer', 'Harbour Invented Dental Limited', 'enquirer@example.invalid', NULL, 'Dental practice', 'Two surgeries refitted', 1, 'NEW')",
    [ago(9)],
  );
  for (const who of ['admin', 'sales', 'accounting', 'surveying', 'readonly'] as const) clients.set(who, await signIn(who));
});
after(() => { made.close(); });

describe('working days and bank holidays — one rule for Home and Leads', () => {
  test('Friday to Monday is one working day, Friday to Tuesday two; a bank holiday Monday does not count', () => {
    assert.equal(workingDaysSince('2026-09-18T10:00:00Z', '2026-09-21T10:00:00Z'), 1);
    assert.equal(workingDaysSince('2026-09-18T10:00:00Z', '2026-09-22T10:00:00Z'), 2);
    // 31 August 2026 is the summer bank holiday: in on Friday 28th, one working day on Tuesday, two on Wednesday.
    assert.equal(isWorkingDay('2026-08-31'), false);
    assert.equal(workingDaysSince('2026-08-28T10:00:00Z', '2026-09-01T10:00:00Z'), 1);
    assert.equal(workingDaysSince('2026-08-28T10:00:00Z', '2026-09-02T10:00:00Z'), 2);
    // Christmas 2026: the 25th, and Boxing Day's substitute on Monday the 28th.
    assert.equal(workingDaysSince('2026-12-24T10:00:00Z', '2026-12-29T10:00:00Z'), 1);
  });

  test('Home reads the same function the Leads page reads', () => {
    assert.equal(Home.workingDaysSince, workingDaysSince);
  });

  test('the list is gov.uk\'s, and it has at least 90 days left to run (copy the next year in when this fails)', () => {
    for (const d of ['2026-04-03', '2026-04-06', '2026-05-04', '2026-05-25', '2027-12-27', '2028-01-03']) assert.ok(BANK_HOLIDAYS_EW.has(d), d);
    assert.equal(BANK_HOLIDAYS_EW.has('2026-12-26'), false, 'a Saturday is not listed; its substitute day is');
    // DELIBERATELY READS THE REAL CLOCK: this is the reminder that the list runs out.
    const in90 = new Date(Date.now() + 90 * 86_400_000).toISOString().slice(0, 10);
    assert.ok(in90 <= BANK_HOLIDAYS_KNOWN_TO,
      `The England and Wales bank holiday list in src/web/working-days.ts runs out on ${BANK_HOLIDAYS_KNOWN_TO}. Copy the next year in from https://www.gov.uk/bank-holidays.json.`);
  });
});

describe('four sections, New first and never folded', () => {
  test('New, In progress, Later, Closed — in that order, each with its count; only Closed is folded', async () => {
    const body = (await as('sales').get('/staff/leads')).body;
    const order = [...body.matchAll(/<section class="leadsec" id="leads-([a-z]+)"/g)].map((m) => m[1]);
    assert.deepEqual(order, ['new', 'going', 'later', 'closed']);
    assert.doesNotMatch(section(body, 'new'), /lc-fold/);
    assert.match(section(body, 'closed'), /<details class="lc-fold"><summary><h2/);
    const count = (k: string): number => Number(/<span class="lc-count">(\d+)<\/span>/.exec(section(body, k))?.[1] ?? '-1');
    const cards = (k: string): number => (section(body, k).match(/<li class="leadcard/g) ?? []).length;
    for (const k of ['new', 'going', 'later', 'closed']) assert.equal(count(k), cards(k), k);
    assert.match(section(body, 'new'), /Harbour Invented Dental Limited/, 'the unanswered website enquiry is in New');
    assert.match(section(body, 'later'), /Saved For Later Dental Limited/);
    assert.match(section(body, 'closed'), /Already Lost Dental Limited/);
  });

  test('oldest first in New, and never by value: no card summary carries a range or a pound sign', async () => {
    const body = (await as('admin').get('/staff/leads')).body;
    const names = [...section(body, 'new').matchAll(/<span class="lc-name">([^<]+)<\/span>/g)].map((m) => m[1]);
    const iOld = names.indexOf('Oldest Waiting Dental Limited');
    const iMid = names.indexOf('Middle Waiting Dental Limited');
    const iEnq = names.indexOf('Harbour Invented Dental Limited');
    const iFresh = names.indexOf('Fresh Arrival Dental Limited');
    assert.ok(iOld >= 0 && iOld < iMid && iMid < iEnq && iEnq < iFresh, names.join(' | '));
    for (const s of summaries(body)) assert.doesNotMatch(s, /£|Range/, s);
  });

  test('a card\'s summary is its face; opening it shows how to reach them, the assessment and the checks', async () => {
    const c = card((await as('sales').get('/staff/leads')).body, 'l137-mid');
    assert.match(c, /<details><summary>\s*<span class="lc-name">Middle Waiting Dental Limited<\/span>/);
    assert.match(c, /Dental · from Referral/);
    assert.match(c, /Nobody owns this yet/);
    for (const h of ['How to reach them', 'What the assessment captured', 'Before they can be a client']) assert.ok(c.includes(h), h);
    assert.ok(c.includes('href="/staff/leads/l137-mid"'), 'the full page is one click away');
  });
});

describe('red is one rule, and Home agrees', () => {
  test('a New lead is red after more than one working day, and the same lead is red on Home', async () => {
    const body = (await as('sales').get('/staff/leads')).body;
    assert.match(card(body, 'l137-old'), /^<li class="leadcard late"/);
    assert.match(card(body, 'l137-fresh'), /^<li class="leadcard"/);
    assert.match(card(body, 'l137-fresh'), /Came in today/);
    const home = (await as('sales').get('/staff')).body;
    const tile = (href: string): string => new RegExp(`<li class="tile hometile([^"]*)"><a class="tilelink" href="${href}">`).exec(home)?.[1] ?? 'missing';
    assert.match(tile('/staff/leads/l137-old'), /late/);
    assert.doesNotMatch(tile('/staff/leads/l137-fresh'), /late|missing/);
    assert.match(section(body, 'new'), /waiting too long/);
  });
});

describe('Home and Leads count New the same way', () => {
  test('Home\'s New leads count and "waiting too long" match the Leads page\'s New section, enquiry included', async () => {
    const leads = section((await as('sales').get('/staff/leads')).body, 'new');
    const home = (await as('sales').get('/staff')).body;
    const row = /<section class="homerow" aria-labelledby="row-new-leads">([\s\S]*?)<\/section>/.exec(home)?.[1] ?? '';
    const count = /<span class="tilecount">(\d+)<\/span>/.exec(row)?.[1];
    assert.equal(count, /<span class="lc-count">(\d+)<\/span>/.exec(leads)?.[1]);
    assert.equal(/(\d+) waiting too long/.exec(row)?.[1], /<span class="lc-latecount">(\d+) waiting too long/.exec(leads)?.[1]);
    assert.match(row, /href="\/staff\/leads#enquiry-enq-137"/, 'the enquiry is on Home, by its id — nothing personal in the address');
    assert.match(row, /href="\/staff\/leads#leads-new"/);
  });
});

describe('the buttons', () => {
  test('a lead with no owner shows one button, and pressing it makes you the owner', async () => {
    const c = card((await as('sales').get('/staff/leads')).body, 'l137-mid');
    assert.match(c, /Nobody owns this — take it/);
    assert.doesNotMatch(c, /Log a call|Mark as lost/, 'the other buttons wait until somebody owns it');
    const r = await as('sales').post('/staff/leads/l137-mid', { owner_id: userId('sales@example.invalid'), back: 'leads' });
    assert.equal(r.status, 303);
    assert.equal(r.location, '/staff/leads?done=saved#lead-l137-mid');
    assert.equal(made.app.db.get<{ owner_id: string }>('SELECT owner_id FROM leads WHERE id = ?', ['l137-mid'])?.owner_id, userId('sales@example.invalid'));
    const after = card((await as('sales').get('/staff/leads')).body, 'l137-mid');
    assert.doesNotMatch(after, /take it/);
    for (const b of ['Log a call', 'Email', 'Add next action', 'Make them a client', 'Mark as lost']) assert.ok(after.includes(b), b);
  });

  test('Log a call: say whether you spoke; a call they answered makes a New lead Contacted, with a completed Call task', async () => {
    assert.equal((await as('sales').post('/staff/leads/l137-mid/call', { note: 'x' })).status, 400, 'spoke is required');
    const r = await as('sales').post('/staff/leads/l137-mid/call', { spoke: 'yes', note: 'Spoke to the practice manager' });
    assert.equal(r.status, 303);
    assert.equal(r.location, '/staff/leads?done=called#lead-l137-mid');
    assert.equal(made.app.db.get<{ status: string }>('SELECT status FROM leads WHERE id = ?', ['l137-mid'])?.status, 'CONTACTED');
    const t = made.app.db.get<{ activity_type: string; status: string; description: string }>(
      "SELECT activity_type, status, description FROM staff_tasks WHERE lead_id = ? AND activity_type = 'CALL'", ['l137-mid']);
    assert.deepEqual({ ...t }, { activity_type: 'CALL', status: 'COMPLETED', description: 'Spoke to the practice manager' });
    const body = (await as('sales').get('/staff/leads')).body;
    assert.match(section(body, 'going'), /Middle Waiting Dental Limited/, 'it moved to In progress');
  });

  test('a call nobody answered leaves the lead New', async () => {
    await as('sales').post('/staff/leads/l137-old', { owner_id: userId('sales@example.invalid'), back: 'leads' });
    assert.equal((await as('sales').post('/staff/leads/l137-old/call', { spoke: 'no' })).status, 303);
    assert.equal(made.app.db.get<{ status: string }>('SELECT status FROM leads WHERE id = ?', ['l137-old'])?.status, 'NEW');
  });

  test('Mark as lost asks why, and refuses without a reason', async () => {
    assert.equal((await as('sales').post('/staff/leads/l137-old', { status: 'LOST', back: 'leads' })).status, 400);
    const reason = made.app.db.get<{ code: string }>("SELECT code FROM reason_lists WHERE list = 'LEAD_LOST' AND code <> 'OTHER' LIMIT 1")?.code ?? '';
    assert.notEqual(reason, '');
    const r = await as('sales').post('/staff/leads/l137-old', { status: 'LOST', lost_reason: reason, back: 'leads' });
    assert.equal(r.location, '/staff/leads?done=saved#lead-l137-old');
    assert.match(section((await as('sales').get('/staff/leads')).body, 'closed'), /Oldest Waiting Dental Limited/);
  });

  test('an enquiry closed from its card returns to the leads', async () => {
    const r = await as('sales').post('/staff/enquiries/enq-137/close', { back: 'leads' });
    assert.equal(r.location, '/staff/leads?done=closed#leads-new');
    assert.doesNotMatch(section((await as('sales').get('/staff/leads')).body, 'new'), /Harbour Invented/);
  });
});

describe('the same rules underneath', () => {
  test('Read only sees the cards and no button, and no website enquiry; Accounting and Surveying are refused', async () => {
    made.app.db.run(
      'INSERT INTO website_enquiries (id, created_at, full_name, firm, email, phone, property_type, message, contact_consent, status) ' +
        "VALUES ('enq-137b', ?, 'Second Enquirer', 'Private Enquiry Limited', 'second@example.invalid', NULL, 'GP / primary care', NULL, 1, 'NEW')",
      [made.app.now()],
    );
    const ro = (await as('readonly').get('/staff/leads')).body;
    assert.match(ro, /<section class="leadsec" id="leads-new"/);
    assert.doesNotMatch(ro, /take it|Log a call|Mark as lost|action="\/staff\/leads\/[^"]*\/call"/);
    assert.doesNotMatch(ro, /Private Enquiry Limited|second@example/);
    assert.equal((await as('readonly').post('/staff/leads/l137-fresh/call', { spoke: 'yes' })).status, 403);
    for (const who of ['accounting', 'surveying'] as const) assert.equal((await as(who).get('/staff/leads')).status, 403, who);
  });

  test('no personal data in any address the cards link to or post to', async () => {
    const body = (await as('sales').get('/staff/leads')).body;
    for (const m of body.matchAll(/(?:href|action)="([^"]+)"/g)) assert.doesNotMatch(m[1] ?? '', /@|%40|Enquirer/, m[1] ?? '');
  });
});

describe('Filter and List view', () => {
  test('the filters are behind one Filter button, open when a filter is on', async () => {
    assert.match((await as('sales').get('/staff/leads')).body, /<details class="filterbox"><summary>Filter<\/summary>/);
    const on = (await as('sales').get('/staff/leads?owner=none')).body;
    assert.match(on, /<details class="filterbox" open><summary>Filter — on<\/summary>/);
    assert.doesNotMatch(section(on, 'new'), /Private Enquiry Limited/, 'a filter is about leads; enquiries are not drawn');
  });

  test('List view is the table, and its filter form and sortable headings keep it', async () => {
    const body = (await as('sales').get('/staff/leads?layout=list')).body;
    assert.match(body, /<table class="stack">/);
    assert.match(body, /<a href="\/staff\/leads\?layout=list" aria-current="page">List view<\/a>/);
    assert.match(body, /<input type="hidden" name="layout" value="list">/);
    assert.match(body, /href="\/staff\/leads\?[^"]*layout=list[^"]*"[^>]*>Date<\/a>/);
    assert.doesNotMatch(body, /layout: not a filter/, 'layout is not reported as a filter it did not apply');
  });
});

describe('Home on a phone', () => {
  test('the pipeline row draws its tiles two to a row at phone width, and only that row', async () => {
    const home = (await as('sales').get('/staff')).body;
    assert.match(home, /aria-labelledby="row-pipeline"><h2 id="row-pipeline">Pipeline by stage<\/h2><ul class="tiles hometiles pairtiles">/);
    assert.equal((home.match(/pairtiles/g) ?? []).length, 1);
    const phone = /@media \(max-width:720px\)\{([\s\S]*?)\n\}/.exec(CSS)?.[1] ?? '';
    assert.match(phone, /\.hometiles\.pairtiles\{grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
  });
});
