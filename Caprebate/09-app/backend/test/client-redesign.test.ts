/**
 * 30 SEPTEMBER 2026 — THE CLIENT PAGE, LAID OUT AGAIN; AND "TELL THE CLIENT AND MOVE ON"
 * (src/web/client-layout.ts, src/web/tell-and-move.ts).
 *
 * Lakhbir: "the whole interfact for a client needs to be designed ... look at the quick action, i feel like email the
 * client can change to chat ... we need something which shows which API's have fired and been completed and we then need
 * a CTA next to where it says 'tell the client' when this is clicked the stage moves along and it then notifies the client
 * on their portal and email". Chosen: "Move it when allowed" and "Yes, build it". On the seeded demo data.
 */
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../src/server.ts';
import { seed } from '../src/seed.ts';
import { createUser } from '../src/users.ts';

let made: Awaited<ReturnType<typeof createApp>>;
let base = '';
type Res = { status: number; body: string; location: string | null };
type Client = { get: (p: string) => Promise<Res>; post: (p: string, f: Record<string, string>) => Promise<Res> };
const clients = new Map<string, Client>();
let password = '';
async function signIn(email: string): Promise<Client> {
  const r = await fetch(`${base}/login`, { method: 'POST', redirect: 'manual', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ email, password }).toString() });
  const cookie = r.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ');
  const go = async (path: string, init: RequestInit = {}): Promise<Res> => {
    const x = await fetch(base + path, { redirect: 'manual', ...init, headers: { cookie, ...(init.headers as Record<string, string> | undefined) } });
    return { status: x.status, body: await x.text(), location: x.headers.get('location') };
  };
  return { get: (p) => go(p), post: (p, f) => go(p, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(f).toString() }) };
}
const as = (who: string): Client => clients.get(who)!;
const db = () => made.app.db;
let dunmarrow = '', branch = '', mainSite = '';

/** The refs on the "Checked and approved" forms inside one step's block. */
function refsOfStep(body: string, claim: string, key: string): string[] {
  const id = `step-${claim}-${key.toLowerCase()}`;
  const i = body.indexOf(`id="${id}"`);
  assert.ok(i >= 0, `no step ${id}`);
  const rest = body.slice(i + 1);
  const next = rest.search(/<div class="step(?: step-[a-z-]+)?"[ >]/);
  const block = body.slice(i, next < 0 ? undefined : i + 1 + next);
  return [...block.matchAll(/action="[^"]+\/checks\/approve" class="tickform">[\s\S]*?name="ref" value="([^"]+)"/g)].map((m) => m[1] ?? '');
}

before(async () => {
  made = await createApp(':memory:', { twoFactor: 'off', documentRoot: mkdtempSync(join(tmpdir(), 'cb-cr-')), publicOrigin: 'https://caprebate.example.invalid' });
  await new Promise<void>((r) => made.server.listen(0, '127.0.0.1', () => r()));
  const a = made.server.address();
  base = `http://127.0.0.1:${typeof a === 'object' && a !== null ? a.port : 0}`;
  const s = await seed(db(), made.app.hasher, made.app.now);
  password = s.password;
  dunmarrow = db().get<{ id: string }>("SELECT id FROM businesses WHERE name LIKE 'Dunmarrow%'")!.id;
  branch = db().get<{ id: string }>("SELECT c.id FROM claims c JOIN properties p ON p.id = c.property_id WHERE c.business_id = ? AND p.label LIKE '%branch surgery'", [dunmarrow])!.id;
  mainSite = db().get<{ id: string }>("SELECT c.id FROM claims c JOIN properties p ON p.id = c.property_id WHERE c.business_id = ? AND p.label LIKE '%main site'", [dunmarrow])!.id;
  createUser(db(), made.app.now, { email: 'client4@example.invalid', display_name: 'Dunmarrow Client', role: 'CLIENT', password_hash: await made.app.hasher.hash(s.password), business_id: dunmarrow });
  for (const [who, email] of [['sales', 'sales@example.invalid'], ['client4', 'client4@example.invalid']] as const) clients.set(who, await signIn(email));
});
after(() => made.close());

describe('the client page, laid out again', () => {
  test('the header: the client\'s six steps as a bar, and Chat, Log a call and Files — "Email the client" is gone', async () => {
    const r = await as('sales').get(`/staff/clients/${dunmarrow}`);
    assert.equal(r.status, 200);
    const bar = /<ol class="cprogress"[\s\S]*?<\/ol>/.exec(r.body)?.[0] ?? '';
    assert.equal((bar.match(/<li /g) ?? []).length, 6);
    assert.match(bar, /<li class="now" aria-current="step"><span class="bar"><\/span><span class="name">Expert sign-off<\/span><\/li>/, 'Dunmarrow is at survey: "Expert sign-off"');
    assert.equal((bar.match(/class="done"/g) ?? []).length, 3);
    const actions = /<div class="cactions">[\s\S]*?<\/div>/.exec(r.body)?.[0] ?? '';
    assert.match(actions, new RegExp(`<a class="cta chatbtn" href="/staff/clients/${dunmarrow}\\?chat=all#chat">Chat`));
    assert.match(actions, /<a class="btn" href="#add-task">Log a call<\/a>/);
    assert.match(actions, /class="filesbtn"/);
    assert.match(actions, /<summary>More<\/summary>[\s\S]*Add a contact[\s\S]*Write an email/);
    assert.doesNotMatch(r.body, />Email the client</);
  });

  test('every section is still on the page, in tabs; the conversation shows first; a link to a section opens its tab', async () => {
    const r = await as('sales').get(`/staff/clients/${dunmarrow}`);
    const tabs = [...r.body.matchAll(/<a href="#tab-([a-z]+)" class="ctab-link ctl-[a-z]+( is-default)?">([^<]+)<\/a>/g)];
    assert.deepEqual(tabs.map((m) => m[3]), ['Chat', 'Claims', 'Properties', 'Questions', 'People', 'Checks', 'Files', 'Activity']);
    assert.deepEqual(tabs.filter((m) => m[2] !== undefined).map((m) => m[1]), ['chat'], 'the conversation is not the first tab shown');
    for (const [tab, secs] of [['chat', ['chat']], ['people', ['details', 'contacts']], ['checks', ['checks', 'sources']], ['activity', ['activity']]] as const) {
      const start = r.body.indexOf(`id="tab-${tab}"`);
      const end = r.body.indexOf('<div class="ctab ', start + 1);
      const panel = r.body.slice(start, end < 0 ? undefined : end);
      for (const s of secs) assert.match(panel, new RegExp(`<details class="sec sec-[a-z]+" id="${s}"`), `#${s} is not in the ${tab} tab`);
    }
    // After adding a contact, the People tab shows first.
    const after = await as('sales').get(`/staff/clients/${dunmarrow}?done=contact`);
    assert.match(after.body, /class="ctab-link ctl-people is-default"/);
    // The tabs are CSS alone: a link to anything in a tab shows it; nothing is scripted or styled inline.
    assert.equal(/<script|\sstyle=/i.test(r.body), false);
  });

  test('the lookups at a glance: each with its state, and how many are done', async () => {
    const r = await as('sales').get(`/staff/clients/${dunmarrow}`);
    const card = /<section class="clookups"[\s\S]*?<\/section>/.exec(r.body)?.[0] ?? '';
    assert.match(card, /Lookups <span class="help">\d+ of \d+ done<\/span>/);
    assert.match(card, /<p class="lk-summary">(<span class="lk lk-g-[a-z-]+">(Failed|Done|Waiting|Not run yet|Not switched on) \d+<\/span>)+<\/p>/);
    const rows = [...card.matchAll(/<li><span>([^<]+)<span class="help"> · [^<]+<\/span><\/span> <span class="lk lk-[a-z-]+( lk-off)?">([^<]+)<\/span><\/li>/g)].map((m) => [m[0], m[1], m[3]]);
    assert.ok(rows.length >= 5, `${rows.length} lookups listed`);
    for (const row of rows) assert.match(row[2] ?? '', /^(Done · .+|Failed|Not run yet|Waiting|Not switched on)$/);
    // The counts are the rows: "X of Y done" and each group's number agree with the lookups listed under them.
    const doneRows = rows.filter((x) => /^Done · /.test(x[2] ?? '')).length;
    assert.match(card, new RegExp(`Lookups <span class="help">${doneRows} of ${rows.length} done</span>`));
    const groups = [...card.matchAll(/<span class="lk lk-g-[a-z-]+">(Failed|Done|Waiting|Not run yet|Not switched on) (\d+)<\/span>/g)];
    assert.equal(groups.reduce((n, g) => n + Number(g[2]), 0), rows.length);
    assert.match(card, /href="#sources"/);
  });
});

describe('"Tell the client and move on"', () => {
  test('the next step shows what it waits for; ticked, it offers "Tell the client and move on"', async () => {
    db().run("UPDATE claims SET stage = 'SURVEY' WHERE id = ?", [branch]);
    const r = await as('sales').get(`/staff/clients/${dunmarrow}`);
    const card = /<section class="cnext"[\s\S]*?<\/section>/.exec(r.body)?.[0] ?? '';
    assert.match(card, /Next step/);
    assert.doesNotMatch(card, /Tell the client and move on/, 'offered before anything is ticked');
    assert.match(card, /Open the checks<\/a>/);
    for (const key of ['SURVEY_BOOKED', 'SURVEY_DONE']) {
      for (const ref of refsOfStep(r.body, branch, key)) assert.equal((await as('sales').post(`/staff/clients/${dunmarrow}/checks/approve`, { ref, back: 'client' })).status, 303);
    }
    const ready = await as('sales').get(`/staff/clients/${dunmarrow}`);
    const card2 = /<section class="cnext"[\s\S]*?<\/section>/.exec(ready.body)?.[0] ?? '';
    assert.match(card2, /<button type="submit" class="cta">Tell the client and move on<\/button>/);
    assert.match(card2, /Survey booked/);
  });

  test('told: the portal shows it, the client is emailed (no fact, no figure), and the claim waits until every step on its stage is told', async () => {
    const outboxBefore = db().get<{ n: number }>('SELECT count(*) AS n FROM outbox')!.n;
    const r = await as('sales').post(`/staff/clients/${dunmarrow}/steps/tell`, { step: 'SURVEY_BOOKED', claim_id: branch, back: 'client' });
    assert.equal(r.status, 303, r.body.slice(0, 300));
    assert.match(r.location ?? '', /done=told(-emailed)?/);
    assert.doesNotMatch(r.location ?? '', /told-moved/, 'moved before "survey done" was told');
    assert.equal(db().get<{ s: string }>('SELECT stage AS s FROM claims WHERE id = ?', [branch])!.s, 'SURVEY');
    const mail = db().get<{ to_email: string; subject: string; body: string }>("SELECT to_email, subject, body FROM outbox WHERE kind = 'NOTIFICATION' ORDER BY rowid DESC LIMIT 1");
    assert.equal(db().get<{ n: number }>('SELECT count(*) AS n FROM outbox')!.n, outboxBefore + 1);
    assert.ok(mail !== undefined);
    assert.equal(mail.subject, 'Cap Rebate news: we have booked your survey');
    assert.match(mail.body, /^Cap Rebate has booked your survey\./);
    assert.match(mail.body, /https:\/\/caprebate\.example\.invalid\/portal/);
    assert.doesNotMatch(mail.body, /£|\d{2,}\s*sq|surveyor_job|SURVEY_/, 'a figure or an internal word in the email');
    const portal = await as('client4').get('/portal');
    assert.match(portal.body, /Cap Rebate has booked your survey/);
  });

  test('the last step on the stage told: the claim moves on through its usual checks — or stays, and the page says why', async () => {
    const movesBefore = db().get<{ n: number }>('SELECT count(*) AS n FROM claim_stage_moves WHERE claim_id = ?', [branch])!.n;
    const r = await as('sales').post(`/staff/clients/${dunmarrow}/steps/tell`, { step: 'SURVEY_DONE', claim_id: branch, back: 'client' });
    assert.equal(r.status, 303, r.body.slice(0, 300));
    const stage = db().get<{ s: string }>('SELECT stage AS s FROM claims WHERE id = ?', [branch])!.s;
    if (/told-moved/.test(r.location ?? '')) {
      assert.equal(stage, 'VALUATION', 'said moved but did not move');
      assert.equal(db().get<{ n: number }>('SELECT count(*) AS n FROM claim_stage_moves WHERE claim_id = ?', [branch])!.n, movesBefore + 1, 'the move was not recorded like every other');
      const mail = db().get<{ body: string }>("SELECT body FROM outbox WHERE kind = 'NOTIFICATION' ORDER BY rowid DESC LIMIT 1");
      assert.match(mail?.body ?? '', /We are now moving on to the next phase: /);
      // Now at Valuation, whose one step ("survey done") is already told: it does not move by itself, and the card says why.
      const page = await as('sales').get(`/staff/clients/${dunmarrow}`);
      const card = /<section class="cnext"[\s\S]*?<\/section>/.exec(page.body)?.[0] ?? '';
      assert.match(card, /<div class="cblocks"><p><strong>[^<]*branch surgery[^<]*:<\/strong> It stays at [^<]*(until: |give the claim a next action)/, 'the page does not say why the claim is held');
    } else {
      assert.equal(stage, 'SURVEY', 'said stayed but moved');
      const page = await as('sales').get(`/staff/clients/${dunmarrow}`);
      const card = /<section class="cnext"[\s\S]*?<\/section>/.exec(page.body)?.[0] ?? '';
      assert.match(card, /<div class="cblocks"><p><strong>[^<]*branch surgery[^<]*:<\/strong> It stays at [^:]+(: | until: )/, 'the page does not say why the claim did not move');
    }
    // Either way the main site, whose "survey done" is not told, has not moved.
    assert.equal(db().get<{ s: string }>('SELECT stage AS s FROM claims WHERE id = ?', [mainSite])!.s, 'SURVEY');
  });
});
