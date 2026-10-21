/**
 * PHASE 133j, 18 September 2026 — THE WEBSITE, LINKED TO THE BACK END.
 *
 * Lakhbir: "is the front end of the website linked to the back end?" and "can we have a log in CTA button top right of
 * the website where customers and cap rebate users can log in", then, of `Caprebate site.html`, "this is what i want
 * the back end linked to". Client self-sign-up: "Yes, with email check".
 *
 * This drives the real application: the site served at `/`, its enquiry form, Sales working the enquiry, and a
 * person who finishes the assessment creating their own login and confirming it by email.
 */
/* PHASE 151j: this file tests other things through a password sign-in, so it builds the application with
   twoFactor: 'off'. The second step itself is proved in test/phase151j.test.ts, on the default (staff must). */
import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../src/server.ts';
import { buildSiteEdition, SITE_PATH } from '../src/web/public-site.ts';

const PASSWORD = 'a-very-long-development-password';
const T = '2026-09-08T00:00:00.000Z';
const ORIGIN = 'https://caprebate.example.invalid';

type Res = { status: number; body: string; location: string | null; headers: Headers };

function makeClient(base: string) {
  const c = {
    cookie: '',
    async req(path: string, init: RequestInit = {}): Promise<Res> {
      const headers = { ...(init.headers as Record<string, string> | undefined) };
      if (c.cookie !== '') headers['cookie'] = c.cookie;
      const r = await fetch(base + path, { redirect: 'manual', ...init, headers });
      const set = r.headers.getSetCookie();
      if (set.length > 0) {
        const jar = new Map(c.cookie.split('; ').filter(Boolean).map((x) => [x.split('=')[0] ?? '', x] as const));
        for (const s of set) { const first = s.split(';')[0] ?? ''; jar.set(first.split('=')[0] ?? '', first); }
        c.cookie = [...jar.values()].join('; ');
      }
      return { status: r.status, body: await r.text(), location: r.headers.get('location'), headers: r.headers };
    },
    post(path: string, fields: Record<string, string>, extra: Record<string, string> = {}) {
      return c.req(path, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', ...extra },
        body: new URLSearchParams(fields).toString() });
    },
  };
  return c;
}

let made: Awaited<ReturnType<typeof createApp>>;
let base = '';
before(async () => {
  made = await createApp(':memory:', { twoFactor: 'off', documentRoot: mkdtempSync(join(tmpdir(), 'cb-133j-')), publicOrigin: ORIGIN });
  await new Promise<void>((r) => made.server.listen(0, '127.0.0.1', () => r()));
  const addr = made.server.address();
  base = `http://127.0.0.1:${typeof addr === 'object' && addr !== null ? addr.port : 0}`;
  const hash = await made.app.hasher.hash(PASSWORD);
  for (const role of ['SALES', 'ACCOUNTING', 'READ_ONLY']) {
    const email = `${role.toLowerCase()}@example.invalid`;
    made.app.db.run('INSERT INTO users (id,email,email_canonical,display_name,role,password_hash,created_at,updated_at,business_id) ' +
      'VALUES (?,?,?,?,?,?,?,?,NULL)', [`u-${role}`, email, email, `${role} Person`, role, hash, T, T]);
  }
  for (const weekday of [0, 1, 2, 3, 4, 5, 6]) {
    made.app.db.run('INSERT INTO working_times (id, user_id, weekday, start_min, end_min) VALUES (?, ?, ?, ?, ?)',
      [`wt-${weekday}`, 'u-SALES', weekday, 0, 24 * 60]);
  }
});
after(() => made.close());

async function staff(role: string) {
  const c = makeClient(base);
  assert.equal((await c.post('/login', { email: `${role.toLowerCase()}@example.invalid`, password: PASSWORD })).status, 303);
  return c;
}

/** A visitor through the whole assessment to the thank-you page. */
async function funnel(): Promise<{ visitor: ReturnType<typeof makeClient>; page: Res }> {
  const visitor = makeClient(base);
  // PHASE 153f: the six old screens are retired; the same answers go through the four-stage funnel.
  await visitor.req('/assessment');
  await visitor.post('/assessment/buildings', { b0_sector: 'care_homes' });
  await visitor.post('/assessment/spend-on', { b0_trigger: 'purchase' });
  await visitor.post('/assessment/amounts', { b0_spend: '2400000', b0_date: '06/2021' });
  await visitor.post('/assessment/tax', { b0_tax: 'yes', b0_profit: 'profitable' });
  await visitor.post('/assessment/claims', { b0_prior: 'no', b0_seller: 'dont_know' });
  await visitor.post('/assessment/works', { b0_works: 'no' });
  await visitor.post('/assessment/details', { b0_business: 'Meadowcroft Care Limited', b0_entity: 'ltd', b0_line1: 'Meadowcroft House', b0_postcode: 'ZZ9 9ZZ' });
  const page = await visitor.post('/assessment/close', { first_name: 'A', surname: 'Person',
    job_role: 'owner_director', channel: 'email', email: 'a.person@example.invalid', contact_consent: 'on' });
  assert.equal(page.status, 200, 'the funnel did not close');
  return { visitor, page };
}

function outbox(kind: string): { to_email: string; body: string }[] {
  return made.app.db.all<{ to_email: string; body: string }>('SELECT to_email, body FROM outbox WHERE kind = ? ORDER BY created_at', [kind]);
}

/* ================================================================== */

describe('the website is served at / by the back end', () => {
  /* 29 SEPTEMBER 2026: `/` is the new home page (src/web/home-site.ts, tested in test/home-page.test.ts). What this
     phase asked of the website still holds there: Log in top right, every assessment link to the back end, and the
     enquiry form to /enquiry with the same fields. `Caprebate site.html`'s edition is still built and tested below. */
  test('/ is the home page, with Log in in the top bar and every assessment link going to the back end', async () => {
    const r = await makeClient(base).req('/');
    assert.equal(r.status, 200);
    assert.match(r.body, /<title>Capital Allowances for Healthcare Property \| Cap Rebate<\/title>/);
    // PHASE 160k, 21 OCTOBER 2026: the new home page's top bar is <header class="top">, and Log in is in its menu.
    const header = /<header class="top" id="top">([\s\S]*?)<\/header>/.exec(r.body)?.[1] ?? '';
    assert.match(header, /<a href="\/login">Log in<\/a>/, 'no Log in in the top bar');
    const assess = [...r.body.matchAll(/<a class="[^"]*" href="(\/assessment)"/g)].map((m) => m[1]);
    assert.ok(assess.length >= 4, 'the assessment links are gone');
    assert.match(r.body, /<form class="form" id="contactform" action="\/enquiry" method="post" novalidate/);
    for (const name of ['name', 'firm', 'email', 'phone', 'ptype', 'message']) assert.match(r.body, new RegExp(`name="${name}"`));
    assert.match(r.body, /<link rel="stylesheet" href="\/assets\/home.css">/);
    assert.match(r.body, /<script src="\/assets\/home.js"><\/script>/);
  });

  test('the site file’s edition still builds, with its style and script as two fixed assets', async () => {
    const c = makeClient(base);
    const css = await c.req('/assets/site-page.css');
    assert.equal(css.status, 200);
    assert.match(css.headers.get('content-type') ?? '', /^text\/css/);
    assert.match(css.body, /\.u-band\{/);
    const js = await c.req('/assets/site-page.js');
    assert.equal(js.status, 200);
    assert.match(js.body, /closest\('\[data-assess\]'\)/);
    assert.equal(js.headers.get('x-content-type-options'), 'nosniff');
  });

  test('the served edition is refused if anything inline is left', () => {
    const shell = (body: string) => `<html><head><style>a{}</style></head><body>${body}<script>1</script></body></html>`;
    assert.doesNotThrow(() => buildSiteEdition(shell('<a href="/x">x</a>')));
    assert.throws(() => buildSiteEdition(shell('<a href="#" onclick="go()">x</a>')), /event handler/);
    assert.throws(() => buildSiteEdition(shell('<p style="color:red">x</p>')), /style attribute/);
    assert.throws(() => buildSiteEdition(shell('<style>p{}</style>')), /inline <style>/);
    assert.throws(() => buildSiteEdition(shell('<a href="javascript:go()">x</a>')), /javascript: link/);
    assert.throws(() => buildSiteEdition('<html><body>no style block</body></html>'), /has no <style>/);
  });

  test('the site file itself carries no inline handler and no style attribute outside the in-page assessment', () => {
    const s = readFileSync(SITE_PATH, 'utf8');
    const page = s.slice(0, s.indexOf('<template id="assessTpl"'));
    const body = page.slice(page.indexOf('<body')).replace(/<script>[\s\S]*?<\/script>/, '');
    assert.equal(/\son[a-z]+\s*=/i.test(body), false, 'an inline event handler');
    assert.equal(/\sstyle\s*=/i.test(body), false, 'a style attribute');
    assert.equal(/prototype|isn't connected/i.test(body), false, 'build language');
  });

  test('a signed-in person pressing Log in goes to their own home', async () => {
    const c = await staff('SALES');
    const r = await c.req('/login');
    assert.equal(r.status, 303);
    assert.equal(r.location, '/staff');
  });
});

describe('the website enquiry form', () => {
  const good = { name: 'Enquiring Person', firm: 'Harbour Dental Limited', email: 'enquirer@example.invalid', phone: '01632 960222',
    ptype: 'Dental practice', message: 'We bought the building in 2022.' };

  test('a complete enquiry is kept, and the audit line names nobody', async () => {
    const r = await makeClient(base).post('/enquiry', good);
    assert.equal(r.status, 200);
    assert.match(r.body, /Thank you: that is with us\./);
    const row = made.app.db.get<{ full_name: string; email: string; property_type: string; status: string; contact_consent: number }>(
      'SELECT full_name, email, property_type, status, contact_consent FROM website_enquiries WHERE email = ?', [good.email]);
    assert.deepEqual({ ...row }, { full_name: good.name, email: good.email, property_type: 'Dental practice', status: 'NEW', contact_consent: 1 });
    const line = made.app.db.get<{ detail: string }>("SELECT detail FROM audit_log WHERE kind = 'WEBSITE_ENQUIRY_RECEIVED' ORDER BY seq DESC LIMIT 1");
    // 29 Sep 2026: the line also says whether the security check ran (src/connectors/turnstile.ts); no key here, so not.
    assert.deepEqual(JSON.parse(line?.detail ?? '{}'), { sector: 'dental', security_check: 'not_checked:no_secret' });
  });

  test('without a name, a real address or a listed property type, nothing is kept — and no tick is asked for (Phase 151)', async () => {
    const before = made.app.db.get<{ n: number }>('SELECT COUNT(*) AS n FROM website_enquiries')?.n;
    for (const bad of [{ name: '' }, { email: 'not-an-address' }, { ptype: 'Castle' }, { message: 'x'.repeat(2001) }]) {
      const r = await makeClient(base).post('/enquiry', { ...good, email: 'other@example.invalid', ...bad });
      assert.equal(r.status, 400, JSON.stringify(bad));
    }
    assert.equal(made.app.db.get<{ n: number }>('SELECT COUNT(*) AS n FROM website_enquiries')?.n, before);
  });

  test('Sales opens an enquiry as a lead, with a contact holding the person; it cannot be opened twice', async () => {
    const sales = await staff('SALES');
    const leads = await sales.req('/staff/leads');
    assert.match(leads.body, /<a href="\/staff\/enquiries">Website enquiries<\/a>: 1 waiting/);
    const list = await sales.req('/staff/enquiries');
    assert.equal(list.status, 200);
    assert.match(list.body, /Enquiring Person/);
    const id = /action="\/staff\/enquiries\/([^/]+)\/lead"/.exec(list.body)?.[1] ?? '';
    assert.notEqual(id, '');
    const opened = await sales.post(`/staff/enquiries/${id}/lead`, {});
    assert.equal(opened.status, 303);
    const leadId = /^\/staff\/leads\/([^?]+)\?done=created$/.exec(opened.location ?? '')?.[1] ?? '';
    const lead = made.app.db.get<{ source: string; prospect_organisation: string; prospect_sector: string }>(
      'SELECT source, prospect_organisation, prospect_sector FROM leads WHERE id = ?', [leadId]);
    assert.deepEqual({ ...lead }, { source: 'WEBSITE', prospect_organisation: 'Harbour Dental Limited', prospect_sector: 'dental' });
    const contact = made.app.db.get<{ email: string; contact_consent: number; marketing_optin: number }>(
      'SELECT email, contact_consent, marketing_optin FROM contacts WHERE lead_id = ?', [leadId]);
    assert.deepEqual({ ...contact }, { email: 'enquirer@example.invalid', contact_consent: 1, marketing_optin: 0 });
    assert.equal(made.app.db.get<{ status: string }>('SELECT status FROM website_enquiries WHERE id = ?', [id])?.status, 'LEAD');
    assert.equal((await sales.post(`/staff/enquiries/${id}/lead`, {})).status, 400);
    assert.doesNotMatch((await sales.req('/staff/enquiries')).body, /Enquiring Person/);
  });

  test('an enquiry can be closed, and logins that do not work leads cannot see the section', async () => {
    await makeClient(base).post('/enquiry', { ...good, name: 'Second Person', email: 'second@example.invalid' });
    const sales = await staff('SALES');
    const id = /action="\/staff\/enquiries\/([^/]+)\/close"/.exec((await sales.req('/staff/enquiries')).body)?.[1] ?? '';
    assert.equal((await sales.post(`/staff/enquiries/${id}/close`, {})).location, '/staff/enquiries?done=closed');
    assert.equal(made.app.db.get<{ status: string }>('SELECT status FROM website_enquiries WHERE id = ?', [id])?.status, 'CLOSED');
    for (const role of ['ACCOUNTING', 'READ_ONLY']) {
      const other = await staff(role);
      const r = await other.req('/staff/enquiries');
      assert.equal(r.status, 403, role);
      assert.doesNotMatch(r.body, /Second Person|second@example/, role);
    }
  });
});

describe('a client creates their own login after the assessment, checked by email', () => {
  test('offer, request, email, confirm: the login is a CLIENT of the organisation the assessment recorded', async () => {
    const { page } = await funnel();
    assert.match(page.body, /Follow your claim online/);
    const offer = /name="offer" value="([0-9a-f]{64})"/.exec(page.body)?.[1] ?? '';
    assert.notEqual(offer, '', 'the thank-you page offers no login');
    const stored = made.app.db.get<{ n: number }>('SELECT COUNT(*) AS n FROM client_signups WHERE offer_hash = ?', [offer]);
    assert.equal(stored?.n, 0, 'the offer token is stored in clear');

    const c = makeClient(base);
    const asked = await c.post('/account/create', { offer, email: 'New.Client@example.invalid', display_name: 'New Client', password: PASSWORD },
      { host: 'attacker.example' });
    assert.equal(asked.status, 200);
    assert.match(asked.body, /Check your email/);
    assert.equal(made.app.db.get<{ n: number }>("SELECT COUNT(*) AS n FROM users WHERE email_canonical = 'new.client@example.invalid'")?.n, 0,
      'a login exists before the address was confirmed');
    const mail = outbox('ACCOUNT_VERIFY').at(-1);
    assert.equal(mail?.to_email, 'New.Client@example.invalid');
    const link = new RegExp(`${ORIGIN.replace(/\./g, '\\.')}/account/verify\\?token=([0-9a-f]{64})`).exec(mail?.body ?? '');
    assert.ok(link !== null, 'the link is not built from the configured address');
    assert.doesNotMatch(mail?.body ?? '', /attacker/);
    const token = link[1] ?? '';

    const opened = await c.req(`/account/verify?token=${token}`);
    assert.equal(opened.status, 200);
    assert.match(opened.body, /<form method="post" action="\/account\/verify">/);
    assert.equal(made.app.db.get<{ n: number }>("SELECT COUNT(*) AS n FROM users WHERE email_canonical = 'new.client@example.invalid'")?.n, 0,
      'opening the link, without pressing the button, created the login');

    assert.equal((await c.post('/account/verify', { token })).status, 200);
    const user = made.app.db.get<{ role: string; business_id: string }>(
      "SELECT role, business_id FROM users WHERE email_canonical = 'new.client@example.invalid'");
    const business = made.app.db.get<{ id: string }>("SELECT id FROM businesses WHERE name = 'Meadowcroft Care Limited'");
    assert.deepEqual({ ...user }, { role: 'CLIENT', business_id: business?.id });
    assert.equal((await c.post('/account/verify', { token })).status, 400, 'the link worked twice');

    const client = makeClient(base);
    const signedIn = await client.post('/login', { email: 'new.client@example.invalid', password: PASSWORD });
    assert.equal(signedIn.location, '/portal');
    assert.equal((await client.req('/portal')).status, 200);
    const kinds = made.app.db.all<{ kind: string; detail: string }>(
      "SELECT kind, detail FROM audit_log WHERE kind IN ('CLIENT_SIGNUP_REQUESTED','CLIENT_SIGNUP_VERIFIED')");
    assert.deepEqual(kinds.map((k) => k.kind), ['CLIENT_SIGNUP_REQUESTED', 'CLIENT_SIGNUP_VERIFIED']);
    assert.equal(kinds.some((k) => /@/.test(k.detail)), false);
  });

  test('an address that already has a login gets the same screen, an email saying so, and nothing created', async () => {
    const { page } = await funnel();
    const offer = /name="offer" value="([0-9a-f]{64})"/.exec(page.body)?.[1] ?? '';
    const verifyBefore = outbox('ACCOUNT_VERIFY').length;
    const r = await makeClient(base).post('/account/create', { offer, email: 'sales@example.invalid', display_name: 'X', password: PASSWORD });
    assert.equal(r.status, 200);
    assert.match(r.body, /Check your email/);
    assert.equal(outbox('ACCOUNT_VERIFY').length, verifyBefore);
    assert.match(outbox('NOTIFICATION').at(-1)?.body ?? '', /You already have one/);
    assert.equal(made.app.db.get<{ role: string }>("SELECT role FROM users WHERE email_canonical = 'sales@example.invalid'")?.role, 'SALES');
  });

  test('a made-up offer, a short password and a made-up link are refused', async () => {
    const { page } = await funnel();
    const offer = /name="offer" value="([0-9a-f]{64})"/.exec(page.body)?.[1] ?? '';
    const c = makeClient(base);
    assert.equal((await c.post('/account/create', { offer: 'f'.repeat(64), email: 'z@example.invalid', display_name: 'Z', password: PASSWORD })).status, 400);
    assert.equal((await c.post('/account/create', { offer, email: 'z@example.invalid', display_name: 'Z', password: 'short' })).status, 400);
    assert.equal((await c.req(`/account/verify?token=${'0'.repeat(64)}`)).status, 400);
    assert.equal((await c.post('/account/verify', { token: '0'.repeat(64) })).status, 400);
    assert.equal(made.app.db.get<{ n: number }>("SELECT COUNT(*) AS n FROM users WHERE email_canonical = 'z@example.invalid'")?.n, 0);
  });
});
