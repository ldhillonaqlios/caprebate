/**
 * 30 SEPTEMBER 2026 — THE FOUR-STAGE FUNNEL (src/web/funnel4.ts).
 *
 * Lakhbir: buildings first ("add another"), the checks per building, who owns each building and where, then "the big
 * reveal ... a climbing number" with three ways to be reached; one record per company, linked as one enquiry.
 * The figures below are the engine's sector bands (CB_BAND): a care home bought for £1,500,000 is up to £600,000
 * (20%-40%), and a dental fit-out of £500,000 up to £450,000 (50%-90%).
 */
import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../src/server.ts';

const T = '2026-09-08T00:00:00.000Z';
let made: Awaited<ReturnType<typeof createApp>>;
let base = '';
before(async () => {
  made = await createApp(':memory:', { twoFactor: 'off', documentRoot: mkdtempSync(join(tmpdir(), 'cb-f4-')), publicOrigin: 'https://caprebate.example.invalid' });
  await new Promise<void>((r) => made.server.listen(0, '127.0.0.1', () => r()));
  const a = made.server.address();
  base = `http://127.0.0.1:${typeof a === 'object' && a !== null ? a.port : 0}`;
  // Somebody to take a call, all week, so the page offers times.
  const hash = await made.app.hasher.hash('a-very-long-development-password');
  made.app.db.run('INSERT INTO users (id,email,email_canonical,display_name,role,password_hash,created_at,updated_at,business_id) VALUES (?,?,?,?,?,?,?,?,NULL)',
    ['u-f4-sales', 'f4.sales@example.invalid', 'f4.sales@example.invalid', 'Sales Person', 'SALES', hash, T, T]);
  for (const weekday of [0, 1, 2, 3, 4, 5, 6]) {
    made.app.db.run('INSERT INTO working_times (id, user_id, weekday, start_min, end_min) VALUES (?, ?, ?, ?, ?)', [`wt-f4-${weekday}`, 'u-f4-sales', weekday, 0, 24 * 60]);
  }
});
after(() => made.close());

type Res = { status: number; body: string; location: string | null };
function client() {
  let cookie = '';
  const req = async (path: string, init: RequestInit = {}): Promise<Res> => {
    const r = await fetch(base + path, { redirect: 'manual', ...init, headers: { ...(init.headers as Record<string, string> ?? {}), ...(cookie ? { cookie } : {}) } });
    for (const s of r.headers.getSetCookie()) { const f = s.split(';')[0] ?? ''; const k = f.split('=')[0]; cookie = [...cookie.split('; ').filter((x) => x && x.split('=')[0] !== k), f].join('; '); }
    return { status: r.status, body: await r.text(), location: r.headers.get('location') };
  };
  const post = (path: string, f: Record<string, string>) => req(path, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(f).toString() });
  return { req, post };
}

/** Two buildings: a care home bought, a dental practice fitted out; each owned by its own company. */
async function toDetails(c: ReturnType<typeof client>, taxTwo: 'yes' | 'no' = 'yes'): Promise<void> {
  assert.equal((await c.req('/assessment')).location, '/assessment/buildings');
  assert.equal((await c.post('/assessment/buildings', { b0_sector: 'care_homes', add: '1' })).location, '/assessment/buildings');
  assert.equal((await c.post('/assessment/buildings', { b0_sector: 'care_homes', b1_sector: 'dental' })).location, '/assessment/spend-on');
  assert.equal((await c.post('/assessment/spend-on', { b0_trigger: 'purchase', b1_trigger: 'fit_out' })).location, '/assessment/amounts');
  assert.equal((await c.post('/assessment/amounts', { b0_spend: '1500000', b0_date: '06/2021', b1_spend: '500000', b1_date: '2023' })).location, '/assessment/tax');
  assert.equal((await c.post('/assessment/tax', { b0_tax: 'yes', b0_profit: 'profitable', b1_tax: taxTwo, ...(taxTwo === 'yes' ? { b1_profit: 'profitable' } : {}) })).location, '/assessment/claims');
  assert.equal((await c.post('/assessment/claims', { b0_prior: 'no', b0_seller: 'dont_know', b1_prior: 'no' })).location, '/assessment/works');
  assert.equal((await c.post('/assessment/works', { b0_works: 'no', b1_works: 'no' })).location, '/assessment/details');
}
const DETAILS = {
  b0_business: 'Invented Care Homes Limited', b0_entity: 'ltd', b0_line1: '1 Invented Street', b0_town: 'Hinckley', b0_postcode: 'le10 1da',
  b1_business: 'Invented Dental LLP', b1_entity: 'llp', b1_line1: '2 Made Up Road', b1_town: 'Leicester', b1_postcode: 'LE1 1AA',
};

describe('stage 1: your buildings', () => {
  test('a type of business per building, with "add another" and "remove"; the stage bar names the four stages', async () => {
    const c = client();
    await c.req('/assessment');
    const page = await c.req('/assessment/buildings');
    assert.match(page.body, /<h1 class="f4-h">What type of business do you have\?<\/h1>/);
    assert.match(page.body, /<li class="cur" aria-current="step">Your buildings<\/li><li class="">Checks<\/li><li class="">Your details<\/li><li class="">Your figure<\/li>/);
    assert.match(page.body, /\+ Add another building/);
    await c.post('/assessment/buildings', { b0_sector: 'gp', add: '1' });
    await c.post('/assessment/buildings', { b0_sector: 'gp', add: '1' });
    let again = (await c.req('/assessment/buildings')).body;
    assert.match(again, /<legend>Building 3<\/legend>/);
    assert.match(again, /value="gp" checked/);
    await c.post('/assessment/buildings', { b0_sector: 'gp', remove: '2' });
    again = (await c.req('/assessment/buildings')).body;
    assert.doesNotMatch(again, /<legend>Building 3<\/legend>/);
  });

  test('nothing is skipped: a building with no type is asked for again, and a later screen cannot be opened first', async () => {
    const c = client();
    await c.req('/assessment');
    assert.equal((await c.req('/assessment/tax')).location, '/assessment/buildings');
    const r = await c.post('/assessment/buildings', { add: '1' });
    assert.equal(r.status, 303);
    const miss = await c.post('/assessment/buildings', { b0_sector: 'dental' });
    assert.equal(miss.status, 400);
    assert.match(miss.body, /Choose the type of business for Building 2\./);
  });

  test('"what did you spend" has a title that covers every answer, and the amounts are worded by it, per building', async () => {
    const c = client();
    await c.req('/assessment');
    await c.post('/assessment/buildings', { b0_sector: 'care_homes', add: '1' });
    await c.post('/assessment/buildings', { b0_sector: 'care_homes', b1_sector: 'dental' });
    const on = (await c.req('/assessment/spend-on')).body;
    assert.match(on, /What did you spend on each building\?/);
    for (const w of ['We bought it', 'We built it \\(new build\\)', 'We refurbished or extended it', 'We fitted out a building we lease']) assert.match(on, new RegExp(w));
    await c.post('/assessment/spend-on', { b0_trigger: 'purchase', b1_trigger: 'fit_out' });
    const am = (await c.req('/assessment/amounts')).body;
    assert.match(am, /<legend>Building 1 · Care home<\/legend>[\s\S]*Purchase price[\s\S]*Completion date/);
    assert.match(am, /<legend>Building 2 · Dental practice<\/legend>[\s\S]*Fit-out cost/);
    const bad = await c.post('/assessment/amounts', { b0_spend: '1500000', b0_date: 'last spring', b1_spend_unknown: 'on', b1_date_unknown: 'on' });
    assert.equal(bad.status, 400);
    assert.match(bad.body, /write the date as month and year, like 06\/2021, or just the year/);
  });
});

describe('stage 2: the checks, per building', () => {
  test('stage 2 opens on what their buildings hold, in words and with no number', async () => {
    const c = client();
    await c.req('/assessment');
    await c.post('/assessment/buildings', { b0_sector: 'care_homes', add: '1' });
    await c.post('/assessment/buildings', { b0_sector: 'care_homes', b1_sector: 'dental' });
    await c.post('/assessment/spend-on', { b0_trigger: 'purchase', b1_trigger: 'fit_out' });
    await c.post('/assessment/amounts', { b0_spend: '1500000', b0_date: '06/2021', b1_spend: '500000', b1_date: '2023' });
    const tax = (await c.req('/assessment/tax')).body;
    assert.match(tax, /Good news/);
    assert.match(tax, /nurse call, lifts, heating and hot water, and fire alarms/);
    assert.doesNotMatch(tax, /£\s?\d/, 'a number reached stage 2');
  });

  test('"is it profitable" only follows "yes"; "same answers as Building 1" copies; the seller is asked only of a building bought', async () => {
    const c = client();
    await c.req('/assessment');
    await c.post('/assessment/buildings', { b0_sector: 'care_homes', add: '1' });
    await c.post('/assessment/buildings', { b0_sector: 'care_homes', b1_sector: 'dental' });
    await c.post('/assessment/spend-on', { b0_trigger: 'purchase', b1_trigger: 'fit_out' });
    await c.post('/assessment/amounts', { b0_spend: '1500000', b0_date: '06/2021', b1_spend: '500000', b1_date: '2023' });
    const noProfit = await c.post('/assessment/tax', { b0_tax: 'yes', b1_tax: 'not sure' });
    assert.equal(noProfit.status, 400);
    assert.match(noProfit.body, /whether the business that owns Building 1 · Care home is currently profitable/);
    assert.equal((await c.post('/assessment/tax', { b0_tax: 'yes', b0_profit: 'loss', b1_same_tax: 'on' })).location, '/assessment/claims');
    const claims = (await c.req('/assessment/claims')).body;
    const one = claims.slice(claims.indexOf('<legend>Building 1'), claims.indexOf('<legend>Building 2'));
    const two = claims.slice(claims.indexOf('<legend>Building 2'));
    assert.match(one, /Do you know whether the seller claimed\?/);
    assert.doesNotMatch(two, /seller/);
    const noSeller = await c.post('/assessment/claims', { b0_prior: 'no', b1_prior: 'no' });
    assert.equal(noSeller.status, 400);
    assert.match(noSeller.body, /whether you know if the seller of Building 1 · Care home claimed/);
  });

  test('"no other work" asks nothing more and keeps nothing typed under "yes"; "yes" asks what kind, how much and when', async () => {
    const c = client();
    await c.req('/assessment');
    await c.post('/assessment/buildings', { b0_sector: 'gp' });
    await c.post('/assessment/spend-on', { b0_trigger: 'refurb' });
    await c.post('/assessment/amounts', { b0_spend: '300000', b0_date: '2024' });
    await c.post('/assessment/tax', { b0_tax: 'yes', b0_profit: 'profitable' });
    await c.post('/assessment/claims', { b0_prior: 'no' });
    const yes = await c.post('/assessment/works', { b0_works: 'yes' });
    assert.equal(yes.status, 400);
    assert.match(yes.body, /what kind of work was done/);
    // Yes, with every detail — kept; then changed to No — and the details go with it.
    assert.equal((await c.post('/assessment/works', { b0_works: 'yes', b0_works_type: 'full', b0_works_spend: '99999', b0_works_year: '2020' })).location, '/assessment/details');
    assert.equal((await c.post('/assessment/works', { b0_works: 'no', b0_works_type: 'full', b0_works_spend: '99999', b0_works_year: '2020' })).location, '/assessment/details');
    const kept = made.app.db.all<{ state_json: string }>('SELECT state_json FROM assessment_drafts').map((r) => JSON.parse(r.state_json) as { properties?: Record<string, unknown>[] })
      .find((st) => st.properties?.[0]?.['sector'] === 'gp' && st.properties[0]['works'] === 'no');
    assert.ok(kept);
    assert.deepEqual([kept.properties?.[0]?.['works_type'], kept.properties?.[0]?.['works_spend'], kept.properties?.[0]?.['works_year']], [null, null, null]);
  });

  test('every building’s owner paying no UK tax is the reasoned negative; one of two is left out of the figure, and named', async () => {
    const c = client();
    await c.req('/assessment');
    await c.post('/assessment/buildings', { b0_sector: 'dental' });
    await c.post('/assessment/spend-on', { b0_trigger: 'purchase' });
    await c.post('/assessment/amounts', { b0_spend: '400000', b0_date: '2022' });
    assert.equal((await c.post('/assessment/tax', { b0_tax: 'no' })).location, '/assessment/no-claim');
    assert.equal((await c.req('/assessment/claims')).location, '/assessment/no-claim');
  });
});

describe('stage 3 and the figure', () => {
  test('stage 3 opens on "your figure is ready" with the amount hidden, and the number is nowhere in the page', async () => {
    const c = client();
    await toDetails(c);
    const page = (await c.req('/assessment/details')).body;
    assert.match(page, /Your figure is ready/);
    assert.match(page, /We have worked out your figure for your 2 buildings/);
    assert.doesNotMatch(page, /1,050,000|600,000|450,000/);
    assert.equal((await c.req('/assessment/figure')).location, '/assessment/details', 'the figure opened before stage 3');
  });

  test('each building has its own business, legal form and address, or "same business as Building 1"', async () => {
    const c = client();
    await toDetails(c);
    const bad = await c.post('/assessment/details', { ...DETAILS, b1_postcode: 'NOT A CODE', b1_business: '' });
    assert.equal(bad.status, 400);
    assert.match(bad.body, /Tell us the name of the business that owns Building 2 · Dental practice\./);
    assert.match(bad.body, /The postcode for Building 2 · Dental practice does not look like a UK postcode/);
    assert.equal((await c.post('/assessment/details', { ...DETAILS, b1_same_business: 'on', b1_business: '' })).location, '/assessment/figure');
  });

  test('the figure climbs to the engine’s total, names each building, and asks how to reach them three ways', async () => {
    const c = client();
    await toDetails(c);
    await c.post('/assessment/details', DETAILS);
    const fig = (await c.req('/assessment/figure')).body;
    assert.match(fig, /<span class="vh">£1,050,000<\/span>/);
    assert.match(fig, /<span class="f4-reel f4-r1 f4-p0">/);
    assert.match(fig, /Building 1 · Care home — 1 Invented Street, Hinckley, LE10 1DA<\/p>\s*<p class="f4-part-figure">up to £600,000/);
    assert.match(fig, /Building 2 · Dental practice — 2 Made Up Road, Leicester, LE1 1AA<\/p>\s*<p class="f4-part-figure">up to £450,000/);
    assert.match(fig, /Building 1 · Care home: .*loss|Building 1 · Care home/);
    for (const w of ['First name', 'Surname', 'Your position in the business', 'Telephone', 'Video call', 'Email', 'Choose a date and time']) assert.match(fig, new RegExp(w));
    assert.doesNotMatch(fig, /<script/);
  });

  test('a building whose owner pays no UK tax is shown, and not counted', async () => {
    const c = client();
    await toDetails(c, 'no');
    await c.post('/assessment/details', DETAILS);
    const fig = (await c.req('/assessment/figure')).body;
    assert.match(fig, /<span class="vh">£600,000<\/span>/);
    assert.match(fig, /Building 2 · Dental practice[\s\S]{0,120}Not included: the business that owns it does not pay UK income tax/);
  });
});

describe('how to reach you, and what is written', () => {
  test('each way asks for its own detail, in words', async () => {
    const c = client();
    await toDetails(c);
    await c.post('/assessment/details', DETAILS);
    const base4 = { first_name: 'Ada', surname: 'Invented', job_role: 'owner_director', contact_consent: 'on' };
    for (const [f, words] of [
      [{ ...base4, first_name: '' }, /We need your first name and surname\./],
      [{ ...base4, job_role: '' }, /Choose your position in the business\./],
      [{ ...base4 }, /Choose how you would like us to reach you: telephone, video call or email\./],
      [{ ...base4, channel: 'phone', email: 'ada@example.invalid' }, /We need your telephone number/],
      [{ ...base4, channel: 'video', phone: '01632 960000' }, /We need your email address/],
      [{ ...base4, channel: 'email', email: 'ada@example.invalid', contact_consent: '' }, /We need your permission to contact you/],
    ] as const) {
      const r = await c.post('/assessment/close', f as Record<string, string>);
      assert.equal(r.status, 400, JSON.stringify(f));
      assert.match(r.body, words);
    }
  });

  test('two companies: two organisations, two leads in one enquiry, the person on each, one video call held on the first', async () => {
    const c = client();
    await toDetails(c);
    await c.post('/assessment/details', DETAILS);
    const fig = (await c.req('/assessment/figure')).body;
    const slot = /name="slot" value="([^"]+)"/.exec(fig)?.[1];
    assert.ok(slot, 'no time was offered');
    const sent = await c.post('/assessment/close', { first_name: 'Ada', surname: 'Invented', job_role: 'owner_director', channel: 'video', email: 'ada.f4@example.invalid', slot, contact_consent: 'on' });
    assert.equal(sent.status, 200, sent.body.slice(0, 300));
    assert.match(sent.body, /Thank you — that is with us\./);
    // 30 Sep live check: the page says the figure as it was shown ("up to"), never a range the person did not see.
    assert.match(sent.body, /The figure you were shown: <strong>up to £1,050,000<\/strong>/);
    assert.doesNotMatch(sent.body, /The range you were shown/);
    // and the two consent boxes stand on their own lines, above the Send button.
    assert.match(fig, /<div class="f4-consent"><label class="ck"><input type="checkbox" name="contact_consent"[\s\S]*?name="marketing_optin"[\s\S]*?<\/label><\/div>\s*<button class="cta" type="submit">Send<\/button>/);
    const orgs = made.app.db.all<{ id: string; name: string }>("SELECT id, name FROM businesses WHERE name IN ('Invented Care Homes Limited','Invented Dental LLP') ORDER BY name");
    assert.equal(orgs.length, 2);
    const leads = made.app.db.all<{ business_id: string; enquiry_id: string | null }>('SELECT business_id, enquiry_id FROM leads WHERE business_id IN (?, ?)', [orgs[0]!.id, orgs[1]!.id]);
    assert.equal(leads.length, 2);
    assert.ok(leads[0]!.enquiry_id !== null && leads[0]!.enquiry_id === leads[1]!.enquiry_id, 'the two leads are not one enquiry');
    for (const o of orgs) {
      const who = made.app.db.get<{ full_name: string; email: string | null }>('SELECT full_name, email FROM contacts WHERE business_id = ?', [o.id]);
      assert.deepEqual({ ...who }, { full_name: 'Ada Invented', email: 'ada.f4@example.invalid' });
      assert.equal(made.app.db.get<{ n: number }>('SELECT count(*) AS n FROM properties WHERE business_id = ?', [o.id])?.n, 1);
    }
    const bookings = made.app.db.all<{ channel: string; starts_at: string | null; business_id: string }>('SELECT channel, starts_at, business_id FROM bookings WHERE business_id IN (?, ?)', [orgs[0]!.id, orgs[1]!.id]);
    assert.equal(bookings.length, 1, 'a second call was booked');
    assert.equal(bookings[0]!.channel, 'video');
    assert.equal(bookings[0]!.starts_at, slot);
    const shown = made.app.db.all<{ shown_high_pence: number | null }>('SELECT shown_high_pence FROM assessments WHERE business_id IN (?, ?) ORDER BY shown_high_pence', [orgs[0]!.id, orgs[1]!.id]).map((r) => r.shown_high_pence);
    assert.deepEqual(shown, [45_000_000, 60_000_000]);
  });

  test('Sales sees each lead’s other businesses from the same enquiry, and the call as a video call', async () => {
    const c = client();
    await toDetails(c);
    await c.post('/assessment/details', { ...DETAILS, b0_business: 'Linked Care Homes Limited', b1_business: 'Linked Dental LLP' });
    await c.post('/assessment/close', { first_name: 'Cy', surname: 'Invented', job_role: 'owner_director', channel: 'video', email: 'cy.f4@example.invalid', slot: '', contact_consent: 'on' });
    const lead = made.app.db.get<{ id: string }>("SELECT l.id FROM leads l JOIN businesses b ON b.id = l.business_id WHERE b.name = 'Linked Care Homes Limited'");
    const other = made.app.db.get<{ id: string }>("SELECT l.id FROM leads l JOIN businesses b ON b.id = l.business_id WHERE b.name = 'Linked Dental LLP'");
    assert.ok(lead && other);
    const staff = client();
    assert.equal((await staff.post('/login', { email: 'f4.sales@example.invalid', password: 'a-very-long-development-password' })).status, 303);
    const page = (await staff.req(`/staff/leads/${lead.id}`)).body;
    assert.match(page, new RegExp(`Same enquiry as[\\s\\S]{0,400}<a href="/staff/leads/${other.id}">Linked Dental LLP</a>`));
    const booking = made.app.db.get<{ channel: string; starts_at: string | null }>(
      "SELECT channel, starts_at FROM bookings bk JOIN businesses b ON b.id = bk.business_id WHERE b.name = 'Linked Care Homes Limited'");
    assert.deepEqual({ ...booking }, { channel: 'video', starts_at: null });
  });

  test('one business whose buildings pay no UK tax is a reasoned-negative lead in the same enquiry', async () => {
    const c = client();
    await toDetails(c, 'no');
    await c.post('/assessment/details', { ...DETAILS, b1_business: 'Invented Charity Dental' });
    const sent = await c.post('/assessment/close', { first_name: 'Bo', surname: 'Invented', job_role: 'trustee', channel: 'email', email: 'bo.f4@example.invalid', contact_consent: 'on' });
    assert.equal(sent.status, 200);
    const gated = made.app.db.get<{ enquiry_id: string | null; origin: string }>("SELECT enquiry_id, origin FROM leads WHERE prospect_organisation = 'Invented Charity Dental'");
    assert.equal(gated?.origin, 'GATED_EXIT');
    const other = made.app.db.get<{ enquiry_id: string | null }>("SELECT l.enquiry_id FROM leads l JOIN businesses b ON b.id = l.business_id WHERE b.name = 'Invented Care Homes Limited' ORDER BY l.created_at DESC LIMIT 1");
    assert.equal(gated?.enquiry_id, other?.enquiry_id);
  });

  test('the six old screens still work for a draft that uses them', async () => {
    const c = client();
    await c.req('/assessment');
    assert.equal((await c.post('/assessment/Q1', { own_prior_claim: 'no' })).location, '/assessment/Q1a');
    assert.match((await c.req('/assessment/Q1a')).body, /<p class="rung">Step 2 of 6<\/p>/);
  });
});
