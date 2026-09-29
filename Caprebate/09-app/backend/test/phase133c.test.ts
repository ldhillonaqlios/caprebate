/**
 * PHASE 133c — A CRM A NEW USER CAN PICK UP COLD, IN THE CAP REBATE BRAND. 17 September 2026.
 *
 *   THE BRAND        → no white text on Cap Mint in the stylesheet, and the rule refuses a planted one; every text/ground
 *                      pairing the tokens use passes 4.5:1; the logo served is the supplied file, byte for byte.
 *   THE VOICE        → no page any login reaches carries an exclamation mark in its visible text, or a word from the
 *                      brand book's avoid list; the name a person reads is "Cap Rebate" on every page.
 *   UK DATES         → no page any login reaches shows an ISO date ("2026-09-24") in its visible text.
 *   EMPTY ROWS       → no field reads "not recorded", "not on hold" or "not lost"; the enquiry checks' and the claim's
 *                      facts' "not known" answers ARE shown.
 *   FORMS            → a refused form keeps what was typed, on the page it was typed on, with the refusal beside it.
 *   FIRST VISIT      → the welcome card shows once, stays dismissed, and the dismissal is audited once.
 *   SWITCHES         → the menu names and the client's step names, in both positions.
 *   NEXT STEP        → a claim that is not ready says what is still needed in plain words, with the action that fixes it.
 *   HELP             → every login's Help link opens its training section; the help content matches the user guide.
 *
 * Run with CB_133C_DUMP=1 to print every breach found instead of stopping at the first.
 *
 * WHAT THIS FILE IMPORTS AT THE TOP EXISTED BEFORE THE PHASE. Anything the phase added (the brand tokens, the next-step
 * table) is imported inside the test that needs it, so the same file runs, test by test, against the pre-change copy
 * (the .bak-phase133c files) to prove each test can fail. The record of that run is in 04-phase-work/phase133c/.
 */

type AssetsModule = { BRAND_TOKENS: Readonly<Record<string, string>>; TEXT_PAIRINGS: readonly (readonly [string, string])[]; whiteOnMintRules: (css: string) => string[] };
type NextStepModule = {
  claimNextStep: (id: string, gate: { open: boolean; needs: { what: string; met: boolean }[] } | undefined, moves: { forward: { to: string; label: string; open: boolean } | null } | undefined, hold: undefined) => unknown;
  hasPlainReading: (what: string) => boolean;
};
const assets = async (): Promise<AssetsModule> => (await import('../src/web/assets.ts')) as unknown as AssetsModule;
const nextStep = async (): Promise<NextStepModule> => (await import(`../src/web/${'next-step'}.ts`)) as unknown as NextStepModule;

/* PHASE 151j: this file tests other things through a password sign-in, so it builds the application with
   twoFactor: 'off'. The second step itself is proved in test/phase151j.test.ts, on the default (staff must). */
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createApp } from '../src/server.ts';
import { seed } from '../src/seed.ts';
import { SITE_CSS } from '../src/web/assets.ts';
import { gateOut } from '../src/web/pipeline.ts';
import { PROCEDURE_KEYS } from '../src/web/stages.ts';
import { avoidHits } from '../src/web/voice.ts';

type Made = Awaited<ReturnType<typeof createApp>>;
type Res = { status: number; location: string | null; body: string; type: string | null };
type Client = { get(path: string): Promise<Res>; post(path: string, fields: Record<string, string>): Promise<Res> };

const LOGINS = ['admin', 'sales', 'accounting', 'surveying', 'readonly', 'client'] as const;
type Login = (typeof LOGINS)[number];
const DUMP = process.env['CB_133C_DUMP'] === '1';

async function boot(opts: { names?: { portalSteps: boolean } } = {}): Promise<{ made: Made; base: string; signIn(who: Login): Promise<Client> }> {
  const made = await createApp(':memory:', { twoFactor: 'off', documentRoot: mkdtempSync(join(tmpdir(), 'cb-133c-')), ...(opts.names === undefined ? {} : { names: opts.names }) });
  await new Promise<void>((r) => made.server.listen(0, '127.0.0.1', () => r()));
  const addr = made.server.address();
  const base = `http://127.0.0.1:${typeof addr === 'object' && addr !== null ? addr.port : 0}`;
  const s = await seed(made.app.db, made.app.hasher, made.app.now);
  const t = made.app.now();
  made.app.db.run(
    'INSERT INTO users (id,email,email_canonical,display_name,role,password_hash,created_at,updated_at,business_id) VALUES (?,?,?,?,?,?,?,?,NULL)',
    ['u-readonly-133c', 'readonly@example.invalid', 'readonly@example.invalid', 'Read-only Person', 'READ_ONLY', await made.app.hasher.hash(s.password), t, t],
  );
  return {
    made, base,
    async signIn(who) {
      const r = await fetch(`${base}/login`, {
        method: 'POST', redirect: 'manual', headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ email: `${who}@example.invalid`, password: s.password }).toString(),
      });
      assert.equal(r.status, 303, `${who} could not sign in`);
      const cookie = r.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ');
      const wrap = async (x: Response): Promise<Res> => ({ status: x.status, location: x.headers.get('location'), body: await x.text(), type: x.headers.get('content-type') });
      return {
        async get(path) { return wrap(await fetch(base + path, { redirect: 'manual', headers: { cookie } })); },
        async post(path, fields) {
          return wrap(await fetch(base + path, { method: 'POST', redirect: 'manual', headers: { cookie, 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(fields).toString() }));
        },
      };
    },
  };
}

/** Every same-origin page a login reaches from its home — one example of each shape of address, as Phase 133a's test. */
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
      // 29 Sep 2026: `/` is the public home page: its title is the search engines' ("… | Cap Rebate", SEO-SPEC.md) and its
      // voice is checked in test/home-page.test.ts. The notices page's "Back to the home page" link made it reachable.
      if (href === '/') continue;
      if (/^\/(assets|logout)|\.csv(\?|$)|\.json(\?|$)|\/upload\//.test(href)) continue;
      const shape = href.replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/gi, '{id}').replace(/=[^&]*/g, '=');
      if (shapes.has(shape)) continue;
      shapes.add(shape);
      queue.push(href);
    }
  }
  return seen;
}

/**
 * THE TEXT A PERSON READS. The head, every tag and every attribute go; so do two things that are not our words: code (a
 * command or an identifier) and a textarea's contents (what somebody typed).
 *
 * PHASE 133d, 17 September 2026: THE ENGAGEMENT LETTER IS NO LONGER EXEMPT. Until today its own clauses (drawn in
 * <div class="letter"> and quoted in <q class="letter-quote">) were cut out here, because the letter named the adviser
 * "Caprebate". Phase 133d renamed the party "Cap Rebate" in the .docx, so the letter is held to the same name and voice
 * as every other page. Proved red on the pre-change letter and green on the new one (04-phase-work/phase133d/).
 */
function visible(body: string): string {
  let b = body.replace(/<head>[\s\S]*?<\/head>/, '');
  b = b.replace(/<code>[\s\S]*?<\/code>/g, ' ').replace(/<textarea\b[^>]*>[\s\S]*?<\/textarea>/g, ' ');
  return b.replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\s+/g, ' ');
}

/**
 * The brand book's avoid list (slide 15, and slides 14 and 52). PHASE 133d moved it to src/web/voice.ts, so the public
 * site's brand check (03-app/caprebate-brand-check.cjs) reads the same list; `avoidHits` allows "capital gains" only
 * where the text distinguishes it ("not against capital gains tax", as the letter says), and "guaranteed-use".
 */
const avoidIn = (text: string): string[] => avoidHits(text).map((x) => `"${x.word}": …${x.context}…`);

const breaches: string[] = [];
function breach(ok: boolean, what: string): void {
  if (ok) return;
  if (DUMP) { breaches.push(what); return; }
  assert.fail(what);
}

let h: Awaited<ReturnType<typeof boot>>;
const clients = new Map<Login, Client>();
const pagesOf = new Map<Login, Map<string, Res>>();
before(async () => {
  h = await boot();
  for (const who of LOGINS) {
    clients.set(who, await h.signIn(who));
    pagesOf.set(who, await crawl(clients.get(who) as Client, who === 'client' ? '/portal' : '/staff'));
  }
});
after(() => {
  h.made.close();
  if (DUMP) console.log(`\n${breaches.length} breaches\n${[...new Set(breaches)].join('\n')}`);
});
const as = (who: Login): Client => clients.get(who) as Client;
const htmlPages = (who: Login): [string, Res][] => [...(pagesOf.get(who) ?? new Map<string, Res>())].filter(([, r]) => r.status === 200 && (r.type ?? '').startsWith('text/html'));

/* ================================================================== *
 * THE BRAND
 * ================================================================== */

function lum(hex: string): number {
  const n = hex.replace('#', '');
  const c = [0, 2, 4].map((i) => parseInt(n.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * (c[0] ?? 0) + 0.7152 * (c[1] ?? 0) + 0.0722 * (c[2] ?? 0);
}
const ratio = (a: string, b: string): number => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return ((x ?? 0) + 0.05) / ((y ?? 0) + 0.05); };

describe('the Cap Rebate brand', () => {
  test('no white text on Cap Mint anywhere in the stylesheet — and the rule refuses a planted one', async () => {
    const { whiteOnMintRules } = await assets();
    assert.equal(typeof whiteOnMintRules, 'function', 'the stylesheet has no white-on-mint rule');
    assert.deepEqual(whiteOnMintRules(SITE_CSS), []);
    assert.deepEqual(whiteOnMintRules('.x{background:var(--mint);color:#fff}'), ['.x']);
    assert.deepEqual(whiteOnMintRules('.y{color:var(--on-accent);background-color:#ABEDD8}'), ['.y']);
    assert.deepEqual(whiteOnMintRules('.z{background:var(--mint);color:var(--ink)}'), []);
  });

  test('the tokens are the brand book’s, and every text/ground pairing passes 4.5:1', async () => {
    const { BRAND_TOKENS, TEXT_PAIRINGS } = await assets();
    assert.ok(BRAND_TOKENS !== undefined && TEXT_PAIRINGS !== undefined, 'the stylesheet has no brand tokens');
    assert.equal(BRAND_TOKENS['mint'], '#ABEDD8');
    assert.equal(BRAND_TOKENS['ink'], '#111111');
    assert.equal(BRAND_TOKENS['mist'], '#F2F8F6');
    assert.equal(BRAND_TOKENS['body'], '#333333');
    assert.equal(BRAND_TOKENS['mut'], '#6B7280');
    for (const [fg, bg] of TEXT_PAIRINGS) {
      const r = ratio(BRAND_TOKENS[fg] ?? '#000000', BRAND_TOKENS[bg] ?? '#000000');
      assert.ok(r >= 4.5, `--${fg} on --${bg} is ${r.toFixed(2)}:1`);
    }
    for (const [fg, bg] of TEXT_PAIRINGS) assert.equal(fg === 'white' && bg === 'mint', false, 'white on mint is listed as a pairing');
  });

  test('the type is the brand book’s: the heading and body stacks, the scale, body never below 14 px, tabular figures, no italic headings', () => {
    assert.match(SITE_CSS, /"Bookman Old Style","Roboto Slab",Georgia,"Times New Roman",serif/);
    assert.match(SITE_CSS, /Calibri,"Segoe UI",Inter,Arial,Helvetica,sans-serif/);
    assert.match(SITE_CSS, /h1\{font-size:44px/);
    assert.match(SITE_CSS, /h2\{font-size:32px/);
    assert.match(SITE_CSS, /h3\{font-size:24px/);
    assert.match(SITE_CSS, /body\{margin:0;font:16px\/1\.6/);
    assert.match(SITE_CSS, /font-variant-numeric:tabular-nums/);
    assert.match(SITE_CSS, /font-style:normal/);
    assert.equal(/body\.app\{[^}]*font-size:15px/.test(SITE_CSS), false, 'the staff body is still 15 px');
    for (const m of SITE_CSS.matchAll(/font-size:(\d+)px/g)) {
      const px = Number(m[1]);
      assert.ok(px >= 12, `a ${px} px size is below the 12 px caption`);
    }
  });

  test('the logo served is the supplied file, byte for byte; the sign-in page and the portal show it; the back office shows the name; the invented "C" is gone', async () => {
    const served = Buffer.from(await (await fetch(`${h.base}/assets/cap-rebate-logo.png`)).arrayBuffer());
    const supplied = readFileSync(join(import.meta.dirname, '..', '..', '..', '04-phase-work', 'phase133c', 'brand-assets', 'caprebate_logo_monoink_924.png'));
    assert.equal(Buffer.compare(served, supplied), 0);
    // 29 SEPTEMBER 2026: the public pages (sign-in among them) wear the new home page's mark — the supplied lockup's
    // calculator drawn as a house — with the name beside it. The portal keeps the supplied lockup; the back office the name.
    const login = await (await fetch(`${h.base}/login`)).text();
    assert.match(login, /<a class="brandmark" href="\/" aria-label="Cap Rebate, home"><svg class="mark" viewBox="0 0 48 48"[^>]*><path class="mk" pathLength="1" d="M14 43 H34[^"]*"\/>/);
    assert.match(login, /<span class="wm">Cap Rebate<\/span><\/a>/);
    assert.match((await as('client').get('/portal')).body, /<img src="\/assets\/cap-rebate-logo.png"/);
    const staff = (await as('sales').get('/staff')).body;
    assert.match(staff, /<a class="brand" href="\/staff">Cap Rebate<\/a>/);
    assert.equal(/class="mark"/.test(staff), false, 'the back office draws a mark');
    assert.equal(/>C<\/span>|class="mark">C/.test(login), false, 'the invented "C" square is still drawn');
  });
});

/* ================================================================== *
 * THE VOICE, THE NAME AND UK DATES — on every page every login reaches
 * ================================================================== */

describe('what a person reads', () => {
  for (const who of LOGINS) {
    test(`${who}: no exclamation mark, no avoid-list word, the name is "Cap Rebate", every date is UK, no empty row, no Why? inside a paragraph`, () => {
      const pages = htmlPages(who);
      assert.ok(pages.length >= 3, `${who} reached only ${pages.length} pages`);
      for (const [u, r] of pages) {
        const text = visible(r.body);
        breach(!text.includes('!'), `${who} ${u}: an exclamation mark: …${text.slice(Math.max(0, text.indexOf('!') - 60), text.indexOf('!') + 5)}`);
        for (const hit of avoidIn(text)) breach(false, `${who} ${u}: ${hit}`);
        breach(/<title>[^<]* · Cap Rebate<\/title>/.test(r.body), `${who} ${u}: the title does not end "· Cap Rebate"`);
        const cr = /Caprebate/.exec(text);
        breach(cr === null, `${who} ${u}: "Caprebate" in what a person reads: …${cr === null ? '' : text.slice(Math.max(0, cr.index - 60), cr.index + 40)}`);
        for (const m of text.matchAll(/\b\d{4}-\d{2}-\d{2}\b/g)) {
          breach(false, `${who} ${u}: an ISO date: …${text.slice(Math.max(0, (m.index ?? 0) - 60), (m.index ?? 0) + 25)}`);
        }
        for (const m of r.body.matchAll(/<dd>([\s\S]*?)<\/dd>/g)) {
          const v = visible(m[1] ?? '').trim().toLowerCase();
          breach(!['not recorded', 'not on hold', 'not lost', 'none recorded'].includes(v), `${who} ${u}: a field reads "${v}"`);
        }
        for (const m of r.body.matchAll(/<th>([^<]*)<\/th>\s*<td>([\s\S]*?)<\/td>/g)) {
          const v = visible(m[2] ?? '').trim().toLowerCase();
          breach(!['not recorded', 'not on hold', 'not lost', 'none recorded'].includes(v), `${who} ${u}: the row "${m[1] ?? ''}" reads "${v}"`);
        }
        for (const m of r.body.matchAll(/<p\b[^>]*>((?:(?!<\/p>)[\s\S])*?)<details/g)) {
          breach(/<\/p>/.test(m[1] ?? '') , `${who} ${u}: a <details> inside a <p>`);
        }
      }
    });
  }

  test('the public pages and the sign-in page: the same voice, the same name', async () => {
    for (const path of ['/', '/login']) {
      const r = await fetch(h.base + path, { redirect: 'follow' });
      const text = visible(await r.text());
      assert.equal(text.includes('!'), false, `${path}: an exclamation mark`);
      assert.deepEqual(avoidIn(text), [], `${path}: an avoid-list word`);
      assert.equal(/Caprebate/.test(text), false, `${path}: "Caprebate"`);
      assert.equal(/prototype|in this build/i.test(text), false, `${path}: build language`);
    }
  });

  test('the client portal carries no build or prototype language', () => {
    for (const [u, r] of htmlPages('client')) {
      const text = visible(r.body);
      breach(!/prototype|in this build|stubbed|the engine runs|external call/i.test(text.replace(/The engine runs → a narrowed estimate/g, '')),
        `client ${u}: build language: ${/prototype|in this build|stubbed|external call/i.exec(text)?.[0] ?? ''}`);
    }
  });

  test('"not known" is an answer: the lead’s enquiry checks and the claim’s facts still show it', async () => {
    const lead = h.made.app.db.get<{ id: string }>("SELECT id FROM leads WHERE claim_id IS NULL ORDER BY created_at LIMIT 1");
    assert.ok(lead);
    const lp = visible((await as('sales').get(`/staff/leads/${lead.id}`)).body);
    assert.match(lp, /Not known/, 'the enquiry checks do not show a not-known answer');
    assert.match(lp, /Check Answer Last recorded/);
    const claim = h.made.app.db.get<{ id: string }>("SELECT id FROM claims WHERE stage = 'SURVEY' LIMIT 1");
    assert.ok(claim);
    const cp = visible((await as('sales').get(`/staff/claims/${claim.id}`)).body);
    assert.match(cp, /The claim’s facts/); // PHASE 138: the section's heading
    assert.match(cp, /not known/i, 'the claim’s facts do not show a not-known answer');
    assert.match(cp, /Allowances claimed before\? not known/, 'a deciding "not known" was hidden as an empty row');
    assert.equal(/Hold reason not on hold|Lost reason not lost/.test(cp), false);
  });

  if (DUMP) test('dump', () => { /* the after hook prints */ });
});

/* ================================================================== *
 * UK DATES — the one helper
 * ================================================================== */

describe('UK dates', () => {
  test('the helper reads the UK day, never UTC, and words a due date', async () => {
    const L = await import('../src/web/localtime.ts');
    assert.equal(L.ukDate('2026-09-24'), '24 Sep 2026');
    assert.equal(L.ukDate('2026-09-16T23:30:00.000Z'), '17 Sep 2026', 'a late-evening instant in BST is the next UK day');
    assert.equal(L.localStamp('2026-09-17T11:32:00.000Z'), '17 Sep 2026, 12:32');
    assert.equal(L.localStamp('2026-09-17T11:32:00.000Z', '2026-09-17T22:59:00.000Z'), 'Today, 12:32');
    assert.equal(L.localStamp('2026-09-17T11:32:00.000Z', '2026-09-17T23:01:00.000Z'), 'Yesterday, 12:32', 'midnight is UK midnight');
    assert.equal(L.localStamp('2026-12-17T11:32:00.000Z'), '17 Dec 2026, 11:32', 'GMT in winter');
    assert.equal(L.dueWords('2026-09-20', '2026-09-17T12:00:00.000Z'), 'Due in 3 days (20 Sep 2026)');
    assert.equal(L.dueWords('2026-09-14', '2026-09-17T12:00:00.000Z'), '3 days overdue (14 Sep 2026)');
    assert.equal(L.dueWords('2026-09-16', '2026-09-17T12:00:00.000Z'), '1 day overdue (16 Sep 2026)');
    assert.equal(L.dueWords('2026-09-18', '2026-09-17T23:30:00.000Z'), 'Due today (18 Sep 2026)', 'counted from the UK date, not the UTC one');
    assert.equal(L.dueWords(null, '2026-09-17T12:00:00.000Z'), '', 'no due date is no words, never on time');
  });
});

/* ================================================================== *
 * FORMS, FIRST VISIT, SWITCHES, NEXT STEP, HELP
 * ================================================================== */

describe('a new user can use it', () => {
  test('a refused form keeps what was typed, on the page it was typed on, with the refusal beside the field', async () => {
    const claim = h.made.app.db.get<{ id: string }>("SELECT id FROM claims WHERE stage = 'SURVEY' LIMIT 1");
    assert.ok(claim);
    const back = `/staff/claims/${claim.id}`;
    const r = await as('sales').post('/staff/tasks', {
      claim_id: claim.id, back, title: '', description: 'Keep this typed sentence 4471', due_on: '2026-10-02', priority: 'HIGH',
    });
    assert.equal(r.status, 400);
    const form = /<form method="post" action="\/staff\/tasks">([\s\S]*?)<\/form>/.exec(r.body);
    assert.ok(form, 'the page the form was typed on was not drawn again');
    const inner = form[1] ?? '';
    // PHASE 133d (D4): the store names the field, so the refusal is drawn beside the title, not at the top of the form.
    assert.match(inner, /<input name="title" required[^>]*aria-invalid="true" aria-describedby="refusal-title"><\/label><p class="fielderr" id="refusal-title" role="alert"><strong>Task not added\.<\/strong>/);
    assert.match(inner, /<textarea name="description">Keep this typed sentence 4471<\/textarea>/);
    assert.match(inner, /name="due_on" type="date" value="2026-10-02"/);
    assert.match(inner, /<option value="HIGH" selected>/);
    assert.match(r.body, /<details open id="add-task">/, 'the form was left closed');
    // PHASE 138: the claim page has no tabs; the coloured section holding the form is opened instead.
    const holder = /<details[^>]*\sid="activity"[^>]*>/.exec(r.body)?.[0] ?? '';
    assert.match(holder, /class="sec sec-messages"/, 'the form is not in the Messages and activity section');
    assert.match(holder, /\sopen[\s>]/, 'the section holding the form was not shown');
  });

  test('the welcome card shows once (on Help since Phase 136), stays dismissed, and the dismissal is audited once', async () => {
    const before1 = (await as('accounting').get('/staff/help')).body;
    assert.match(before1, /Welcome to Cap Rebate/);
    assert.equal(/Welcome to Cap Rebate/.test((await as('accounting').get('/staff')).body), false, 'Phase 136: the welcome is not on Home');
    for (const j of before1.matchAll(/<p class="jobs">([\s\S]*?)<\/p>/g)) {
      for (const a of (j[1] ?? '').matchAll(/href="([^"#]+)/g)) assert.equal((await as('accounting').get(a[1] ?? '')).status, 200, `a welcome job for accounting: ${a[1] ?? ''}`);
    }
    assert.equal((await as('accounting').post('/staff/welcome/dismiss', {})).status, 303);
    assert.equal(/Welcome to Cap Rebate/.test((await as('accounting').get('/staff/help')).body), false, 'the card came back');
    await as('accounting').post('/staff/welcome/dismiss', {});
    assert.equal(/Welcome to Cap Rebate/.test((await as('accounting').get('/staff/help')).body), false);
    const n = h.made.app.db.get<{ n: number }>("SELECT COUNT(*) AS n FROM audit_log WHERE kind = 'WELCOME_DISMISSED' AND actor_id = (SELECT id FROM users WHERE email = 'accounting@example.invalid')");
    assert.equal(n?.n, 1);
    assert.match((await as('sales').get('/staff/help')).body, /Welcome to Cap Rebate/, 'one person hiding it hid it for another');
    for (const who of ['admin', 'surveying', 'readonly', 'client'] as const) {
      const home = (await as(who).get(who === 'client' ? '/portal' : '/staff/help')).body;
      for (const j of home.matchAll(/<p class="jobs">([\s\S]*?)<\/p>/g)) {
        for (const a of (j[1] ?? '').matchAll(/href="([^"#]+)/g)) assert.equal((await as(who).get(a[1] ?? '')).status, 200, `a welcome job for ${who}: ${a[1] ?? ''}`);
      }
    }
  });

  test('"The data this page was built from" shows to Admin only, and its address still answers who it answered', async () => {
    const claim = h.made.app.db.get<{ id: string }>("SELECT id FROM claims WHERE stage = 'SURVEY' LIMIT 1");
    assert.ok(claim);
    assert.match((await as('admin').get(`/staff/claims/${claim.id}`)).body, /The data this page was built from/);
    for (const who of ['sales', 'readonly', 'surveying'] as const) {
      const r = await as(who).get(`/staff/claims/${claim.id}`);
      if (r.status !== 200) continue;
      assert.equal(/The data this page was built from/.test(r.body), false, `${who} is shown the developer link`);
    }
    assert.equal((await as('sales').get(`/staff/claims/${claim.id}/view.json`)).status, 200);
  });

  test('the next step comes first: a claim that is not ready says what is needed in plain words, with the action that fixes it', async () => {
    const claim = h.made.app.db.get<{ id: string }>("SELECT id FROM claims WHERE stage = 'SURVEY' AND id NOT IN (SELECT j.claim_id FROM surveyor_jobs j JOIN surveyor_commitments sc ON sc.job_id = j.id) LIMIT 1");
    assert.ok(claim);
    const body = (await as('sales').get(`/staff/claims/${claim.id}`)).body;
    const side = /<aside class="side"[\s\S]*?<\/aside>/.exec(body)?.[0] ?? '';
    assert.ok(side.indexOf('Next step') >= 0 && side.indexOf('Next step') < side.indexOf('Next action'), 'the next step is not first in the panel');
    assert.match(side, /<span class="badge">Not ready yet<\/span>/);
    assert.match(side, /The surveyor’s figures/);
    assert.match(side, /href="#add-task">Ask the surveyor<\/a>/);
    assert.match(side, /href="#stage-needs">See everything this stage needs<\/a>/);
    assert.equal(/badge b-stop">shut</.test(body), false, 'a gate still reads "shut" in red');
    assert.equal(/<ul class="steps">/.test(body), false, 'the second ten-stage list is still on the claim page');
    assert.match(body, /<details id="stage-needs"><summary>See everything this stage needs<\/summary>/);
    // The move button, when the gate is ready.
    const { claimNextStep } = await nextStep();
    const ready = claimNextStep('c1', { open: true, needs: [] }, { forward: { to: 'VALUATION', label: 'Valuation', open: true } }, undefined);
    assert.deepEqual(ready, { kind: 'move', action: '/staff/claims/c1/stage', to: 'VALUATION', label: 'Valuation' });
  });

  test('every need a gate reads on the seed has a plain reading', async () => {
    const { hasPlainReading } = await nextStep();
    const db = h.made.app.db;
    const claims = db.all<{ id: string }>('SELECT * FROM claims');
    const seen = new Set<string>();
    for (const c of claims) {
      for (const k of PROCEDURE_KEYS) {
        for (const n of gateOut(db, c as never, k).needs) seen.add(n.what);
      }
    }
    assert.ok(seen.size >= 10, `only ${seen.size} needs read`);
    for (const what of seen) assert.ok(hasPlainReading(what), `no plain reading for: ${what}`);
  });

  test('Help: every login’s Help link opens a training section; the client’s carries no trainer’s exercise; the content matches the guide', async () => {
    for (const who of LOGINS) {
      const home = (await as(who).get(who === 'client' ? '/portal' : '/staff')).body;
      const href = /<a class="helplink" href="([^"]+)">Help<\/a>/.exec(home)?.[1]?.replace(/&amp;/g, '&');
      assert.ok(href, `${who} has no Help link`);
      const r = await as(who).get(href);
      assert.equal(r.status, 200, `${who}: ${href}`);
      if (who === 'client') {
        assert.match(r.body, /Send this answer/);
        assert.equal(/Try it on the demo|Check yourself/.test(r.body), false);
      } else {
        assert.match(r.body, /Training, from the user guide/);
        assert.match(r.body, /What it is for/);
      }
    }
    assert.match((await as('sales').get('/staff/help?screen=B17')).body, /<h1>Claims<\/h1>/);
    execFileSync(process.execPath, [join(import.meta.dirname, '..', 'tools', 'build-help.cjs'), '--check']);
  });
});

describe('the names — built, switched on by Lakhbir (Phase 144), and both positions work', () => {
  test('as shipped since Phase 144: the menu carries Phase 135\'s names, and the portal the plain step names', async () => {
    // PHASE 135: the menu names are no longer a switch. "Introducer fees" is the section's name; the other two proposed
    // names no longer apply (Engaged clients became the one Clients list; Next actions became a filter on Tasks).
    const menu = (await as('accounting').get('/staff')).body;
    assert.match(menu, /<a href="\/staff\/introducer-rewards">Introducer fees<\/a>/);
    assert.equal(/>Engaged clients<\/a>|>Reward model<\/a>|>Next actions<\/a>/.test(menu), false);
    assert.match((await as('sales').get('/staff')).body, /<a href="\/staff\/clients">Clients<\/a>/);
    const portal = (await as('client').get('/portal')).body;
    assert.match(portal, /1 Your estimate/);
    assert.equal(/The engine runs → a narrowed estimate/.test(portal), false);
  });

  test('off: the business flow\'s own step names come back', async () => {
    const off = await boot({ names: { portalSteps: false } });
    try {
      const portal = (await (await off.signIn('client')).get('/portal')).body;
      assert.match(portal, /The engine runs → a narrowed estimate/);
      assert.equal(/1 Your estimate/.test(portal), false);
    } finally { off.made.close(); }
  });

  test('on: the proposed step names, and still no avoid-list word', async () => {
    const on = await boot({ names: { portalSteps: true } });
    try {
      const portal = (await (await on.signIn('client')).get('/portal')).body;
      for (const name of ['1 Your estimate', '2 Engagement letter signed', '3 We research your property', '4 Expert sign-off', '5 Claim filed', '6 Aftercare']) {
        assert.ok(portal.includes(name), `the portal does not show "${name}"`);
      }
      assert.equal(/The engine runs/.test(portal), false);
      const text = visible(portal);
      assert.deepEqual(avoidIn(text), [], 'the proposed names page carries an avoid-list word');
      assert.equal(text.includes('!'), false);
    } finally { on.made.close(); }
  });
});
