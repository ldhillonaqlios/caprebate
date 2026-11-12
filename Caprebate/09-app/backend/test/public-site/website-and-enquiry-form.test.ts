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
   twoFactor: 'off'. The second step itself is proved in test/core/sign-in-steps.test.ts, on the default (staff must). */
import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../../src/app/server.ts';
import { buildSiteEdition, SITE_PATH } from '../../src/modules/public-site/public-site.ts';

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
async function funnel(email = 'a.person@example.invalid'): Promise<{ visitor: ReturnType<typeof makeClient>; page: Res }> {
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
    job_role: 'owner_director', channel: 'email', email, contact_consent: 'on' });
  assert.equal(page.status, 200, 'the funnel did not close');
  return { visitor, page };
}

function outbox(kind: string): { to_email: string; body: string }[] {
  return made.app.db.all<{ to_email: string; body: string }>('SELECT to_email, body FROM outbox WHERE kind = ? ORDER BY created_at', [kind]);
}

/* ================================================================== */

describe('the website is served at / by the back end', () => {
  /* 29 SEPTEMBER 2026: `/` is the new home page (src/modules/public-site/home-site.ts, tested in test/public-site/home-page.test.ts). What this
     phase asked of the website still holds there: Log in top right, every assessment link to the back end, and the
     enquiry form to /enquiry with the same fields. `Caprebate site.html`'s edition is still built and tested below. */
  test('/ is the home page, with Log in in the top bar and every assessment link going to the back end', async () => {
    const r = await makeClient(base).req('/');
    assert.equal(r.status, 200);
    assert.match(r.body, /<title>Capital Allowances for Healthcare Property \| Cap Rebate<\/title>/);
    // PHASE 160k, 21 OCTOBER 2026: the new home page's top bar is <header class="top">, and Log in is in its menu.
    const header = /<header class="top" id="top">([\s\S]*?)<\/header>/.exec(r.body)?.[1] ?? '';
    // PHASE 160o, 28 OCTOBER 2026: Log in is a person icon in the menu, its words kept for screen readers
    assert.match(header, /<a href="\/login" title="Log in">[\s\S]*?<span class="nav-login-t">Log in<\/span><\/a>/, 'no Log in in the top bar');
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
    // 29 Sep 2026: the line also says whether the security check ran (src/integrations/connectors/turnstile.ts); no key here, so not.
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
    // Phase 161m2: the branded login-exists email (emails.py), to the address that has a login.
    const told = made.app.db.get<{ subject: string; body: string; html: string | null }>(
      "SELECT subject, body, html_body AS html FROM outbox WHERE to_email = 'sales@example.invalid' AND kind = 'NOTIFICATION' ORDER BY rowid DESC LIMIT 1");
    assert.equal(told?.subject, 'You already have a Cap Rebate login');
    assert.match(told?.body ?? '', /It already has one\./);
    assert.ok(told?.html?.includes('>You already have a login</h1>') === true, 'no branded HTML version');
    assert.ok(told?.html?.includes(`href="${ORIGIN}/login"`) === true, 'the button does not open the sign-in page');
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

/* ================================================================== *
 * PHASE 161m2, 11 November 2026: THE BRANDED EMAILS OF AN ENQUIRY, AN ASSESSMENT AND A CLIENT'S OWN LOGIN
 * (emails.py: enquiry-received, staff-new-enquiry, assessment-complete, confirm-login, welcome). Four of them are new:
 * proved red on the code before this phase, where an enquiry, a finished assessment and a confirmed login sent nothing
 * (each "exactly one" below found none), and the confirmation email had no HTML version.
 * ================================================================== */

type Mail = { to_email: string; subject: string; body: string; html: string | null; kind: string };
const mailsTo = (to: string): Mail[] =>
  made.app.db.all<Mail>('SELECT to_email, subject, body, html_body AS html, kind FROM outbox WHERE to_email = ? ORDER BY rowid', [to]);
/** An address marked do not contact: the channel address of an organisation so marked. */
function doNotContact(address: string): void {
  made.app.db.run('INSERT INTO businesses (id, name, sector, stage, contact_email, contact_phone, created_at) VALUES (?, ?, ?, ?, ?, NULL, ?)',
    [`b-dnc-${address}`, `Do Not Contact ${address}`, 'dental', 'ENQUIRY', address, T]);
  made.app.db.run("UPDATE businesses SET client_status = 'DO_NOT_CONTACT' WHERE id = ?", [`b-dnc-${address}`]);
}

describe('161m2 · an enquiry: a thank you to the person, and a note to Sales with no personal details', () => {
  const enquiry = { name: 'Rosa Invented', firm: 'Quayside Dental Limited', email: 'rosa.161m2@example.invalid', phone: '01632 960999',
    ptype: 'Dental practice', message: 'A private note about our building, 2019.' };

  test('enquiry-received: exactly one email to the person, by their first name', async () => {
    assert.equal((await makeClient(base).post('/enquiry', enquiry)).status, 200);
    const mine = mailsTo(enquiry.email);
    assert.equal(mine.length, 1, 'not exactly one email to the person');
    const m = mine[0]!;
    assert.equal(m.subject, 'Thank you for your enquiry');
    assert.ok(m.html !== null && m.html.includes('>Thank you, Rosa</h1>'), 'no branded HTML version, or not by first name');
    assert.match(m.body, /^Thank you, Rosa\n\nWe have your enquiry about your property\. One of our team will read it and reply within one working day\.\n/);
    assert.match(m.body, /- On the call we explain what you could claim and how we work\. There is no charge for this\./);
  });

  test('staff-new-enquiry: one email to each Sales login, the organisation, sector and time only, and the back office link', async () => {
    const before = mailsTo('sales@example.invalid').length;
    assert.equal((await makeClient(base).post('/enquiry', { ...enquiry, firm: 'Quayside Two Limited', email: 'rosa2.161m2@example.invalid' })).status, 200);
    const news = mailsTo('sales@example.invalid').slice(before);
    assert.equal(news.length, 1, 'not exactly one email to Sales');
    const m = news[0]!;
    assert.equal(m.subject, 'New enquiry: Quayside Two Limited');
    assert.match(m.body, /^A new enquiry has come in\n\nOrganisation: Quayside Two Limited\nSector: Dental practice\nReceived: .+\n\nWe have told them we will reply within one working day\./);
    assert.ok(m.html !== null && m.html.includes('BACK OFFICE') && m.html.includes(`href="${ORIGIN}/staff/enquiries"`), 'not the back office layout, or no link');
    for (const personal of ['Rosa', 'rosa2.161m2', '01632 960999', 'private note']) {
      assert.ok(!m.body.includes(personal) && !m.html.includes(personal), `the staff email carries ${personal}`);
    }
    // Nobody but Sales: the accounting and read-only logins get nothing.
    for (const other of ['accounting@example.invalid', 'read_only@example.invalid']) {
      assert.equal(mailsTo(other).filter((x) => x.subject.startsWith('New enquiry')).length, 0, other);
    }
  });

  test('an address marked do not contact is not written to; the enquiry is still kept, and Sales still told', async () => {
    doNotContact('blocked.161m2@example.invalid');
    const before = mailsTo('sales@example.invalid').length;
    assert.equal((await makeClient(base).post('/enquiry', { ...enquiry, firm: 'Blocked Dental Limited', email: 'blocked.161m2@example.invalid' })).status, 200);
    assert.equal(mailsTo('blocked.161m2@example.invalid').length, 0, 'a do-not-contact address was written to');
    assert.equal(made.app.db.get<{ n: number }>("SELECT COUNT(*) AS n FROM website_enquiries WHERE email = 'blocked.161m2@example.invalid'")?.n, 1);
    assert.equal(mailsTo('sales@example.invalid').length, before + 1);
  });

  test('a refused enquiry sends nothing at all', async () => {
    const before = made.app.db.get<{ n: number }>('SELECT COUNT(*) AS n FROM outbox')?.n;
    assert.equal((await makeClient(base).post('/enquiry', { ...enquiry, email: 'refused.161m2@example.invalid', ptype: 'Castle' })).status, 400);
    assert.equal(made.app.db.get<{ n: number }>('SELECT COUNT(*) AS n FROM outbox')?.n, before);
  });
});

describe('161m2 · the assessment: the figure the person was shown, by email', () => {
  test('assessment-complete: exactly one email, the "up to" figure the page showed, and a button to book a call', async () => {
    const { page } = await funnel('assess.161m2@example.invalid');
    const shown = /The figure you were shown: <strong>up to (£[0-9,]+)<\/strong>/.exec(page.body)?.[1];
    assert.ok(shown !== undefined, 'the thank-you page shows no figure');
    const mine = mailsTo('assess.161m2@example.invalid').filter((m) => m.kind === 'NOTIFICATION');
    assert.equal(mine.length, 1, 'not exactly one assessment email');
    const m = mine[0]!;
    assert.equal(m.subject, 'Your Cap Rebate assessment: what happens next');
    assert.ok(m.body.includes(`Indicative figure of capital allowances: Up to ${shown}\n`), m.body);
    assert.match(m.body, /Based on your answers about Meadowcroft House, ZZ9 9ZZ, the capital allowances you may be able to claim are:/);
    assert.match(m.body, /Our fee is 3% of the capital allowances identified\. We charge it only once we deliver our report\./);
    assert.ok(m.html !== null && m.html.includes('>Thank you for completing our assessment</h1>'), 'no branded HTML version');
    assert.ok(m.html.includes(`href="${ORIGIN}/portal#appointment"`), 'no call was booked, and the button does not book one');
  });

  test('an address marked do not contact gets no assessment email; the assessment is still kept', async () => {
    doNotContact('assess.dnc.161m2@example.invalid');
    const { page } = await funnel('assess.dnc.161m2@example.invalid');
    assert.match(page.body, /We have your assessment/);
    assert.equal(mailsTo('assess.dnc.161m2@example.invalid').length, 0);
  });
});

describe('161m2 · a client\'s own login: the confirmation, then one welcome', () => {
  async function asked(email: string): Promise<{ c: ReturnType<typeof makeClient>; token: string }> {
    const { page } = await funnel(`f.${email}`);
    const offer = /name="offer" value="([0-9a-f]{64})"/.exec(page.body)?.[1] ?? '';
    const c = makeClient(base);
    assert.equal((await c.post('/account/create', { offer, email, display_name: 'Welcome Client', password: PASSWORD })).status, 200);
    const m = mailsTo(email).find((x) => x.kind === 'ACCOUNT_VERIFY');
    const token = /\/account\/verify\?token=([0-9a-f]{64})/.exec(m?.body ?? '')?.[1] ?? '';
    assert.notEqual(token, '', 'no confirmation link');
    return { c, token };
  }

  test('confirm-login: branded, the link behind the button and in the text, and the security note', async () => {
    await asked('confirm.161m2@example.invalid');
    const m = mailsTo('confirm.161m2@example.invalid').find((x) => x.kind === 'ACCOUNT_VERIFY')!;
    assert.equal(m.subject, 'Confirm your Cap Rebate login');
    assert.match(m.body, /^Confirm your login\n\nPlease confirm this is your email address to finish setting up your Cap Rebate login\.\n\nThe link works once, for 24 hours\./);
    const link = new RegExp(`Confirm my login: (${ORIGIN.replace(/\./g, '\\.')}/account/verify\\?token=[0-9a-f]{64})\n`).exec(m.body)?.[1];
    assert.ok(link !== undefined, m.body);
    assert.ok(m.html !== null && m.html.includes('>Confirm your login</h1>') && m.html.includes(`href="${link}"`), 'no branded HTML version, or no link');
    assert.match(m.body, /We will never ask for your password, sign-in code or bank details/);
  });

  test('welcome: exactly one, to the new login\'s address, once the login is confirmed, and never again', async () => {
    const { c, token } = await asked('welcome.161m2@example.invalid');
    assert.equal(mailsTo('welcome.161m2@example.invalid').filter((x) => x.subject === 'Welcome to your Cap Rebate portal').length, 0, 'welcomed before confirming');
    assert.equal((await c.post('/account/verify', { token })).status, 200);
    const welcome = mailsTo('welcome.161m2@example.invalid').filter((x) => x.subject === 'Welcome to your Cap Rebate portal');
    assert.equal(welcome.length, 1, 'not exactly one welcome');
    const m = welcome[0]!;
    assert.equal(m.kind, 'NOTIFICATION');
    assert.match(m.body, /^Welcome to your portal\n\nYour login is ready\. Your portal is where you can:\n\n- see where your claim is, step by step;/);
    assert.ok(m.html !== null && m.html.includes('>Welcome to your portal</h1>') && m.html.includes(`href="${ORIGIN}/portal"`), 'no branded HTML version, or no link');
    // the link works once: a second press makes no login and no second welcome
    assert.equal((await c.post('/account/verify', { token })).status, 400);
    assert.equal(mailsTo('welcome.161m2@example.invalid').filter((x) => x.subject === 'Welcome to your Cap Rebate portal').length, 1);
  });

  test('a login for an organisation marked do not contact is made, and is not welcomed', async () => {
    const { c, token } = await asked('welcome.dnc.161m2@example.invalid');
    // the organisation this login is for: the offer's
    const biz = made.app.db.get<{ id: string; was: string | null }>(
      'SELECT b.id, b.client_status AS was FROM client_signups s JOIN businesses b ON b.id = s.business_id ORDER BY s.rowid DESC LIMIT 1')!;
    made.app.db.run("UPDATE businesses SET client_status = 'DO_NOT_CONTACT' WHERE id = ?", [biz.id]);
    try {
      assert.equal((await c.post('/account/verify', { token })).status, 200);
      assert.equal(made.app.db.get<{ n: number }>("SELECT COUNT(*) AS n FROM users WHERE email_canonical = 'welcome.dnc.161m2@example.invalid'")?.n, 1);
      assert.equal(mailsTo('welcome.dnc.161m2@example.invalid').filter((x) => x.subject === 'Welcome to your Cap Rebate portal').length, 0);
    } finally {
      made.app.db.run('UPDATE businesses SET client_status = ? WHERE id = ?', [biz.was, biz.id]);
    }
  });
});
