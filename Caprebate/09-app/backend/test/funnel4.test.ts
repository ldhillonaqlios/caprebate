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
import { SITE_CSS } from '../src/web/assets.ts';
import { fixtureTransport, type Fixture } from '../src/connectors/http.ts';
import { secretsFromValues } from '../src/secrets.ts';
import { COMPANY_SEARCH } from '../src/connectors/company-search.ts';
import { ADDRESS_LOOKUP, addressLookupMissing, readAddresses } from '../src/connectors/address-lookup.ts';
import { CALL_POLICIES } from '../src/connectors/sources.ts';
import { MAX_DAYS } from '../src/web/slot-picker.ts';
import { SLOT_MINUTES } from '../src/web/schedule.ts';
import { localDate, localClock } from '../src/web/localtime.ts';

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
  return { req, post, cookie: () => cookie };
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
    for (const w of ['First name', 'Surname', 'Your position in the business', 'Telephone', 'Video call', 'Email', '1\\. Choose a date', '2\\. Choose a time']) assert.match(fig, new RegExp(w));
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
    ] as const) {
      const r = await c.post('/assessment/close', f as Record<string, string>);
      assert.equal(r.status, 400, JSON.stringify(f));
      assert.match(r.body, words);
    }
  });

  // 30 Sep 2026, Lakhbir: "1) choose date ... pull from the back end calendar ... 2) choose time", and calls of one hour.
  test('choose a date, then a time: both from the diaries, a row of dates, that day\'s hour-long times under it', async () => {
    const c = client();
    await toDetails(c);
    await c.post('/assessment/details', DETAILS);
    const fig = (await c.req('/assessment/figure')).body;
    const dates = [...fig.matchAll(/<label class="f4-date f4-d(\d+)"><input type="radio" name="day" value="(\d{4}-\d\d-\d\d)"( checked)?>/g)];
    assert.ok(dates.length >= 14 && dates.length <= MAX_DAYS, `${dates.length} dates offered`);
    assert.deepEqual(dates.map((m) => Number(m[1])), dates.map((_, i) => i), 'the date cards are numbered in order');
    assert.deepEqual(dates.filter((m) => m[3] !== undefined).map((m) => m[2]), [dates[0]![2]], 'the first date is chosen, so its times show at once');
    // Every time is on the hour, an hour long, and sits under its own date.
    const groups = [...fig.matchAll(/<div class="f4-times f4-t(\d+)">([\s\S]*?)<\/div><\/div>/g)];
    assert.equal(groups.length, dates.length);
    for (const g of groups) {
      const day = dates[Number(g[1])]![2];
      const times = [...g[2]!.matchAll(/name="slot" value="([^"]+)"> (\d\d:\d\d) – (\d\d:\d\d)/g)];
      assert.ok(times.length > 0, `no times under ${day}`);
      for (const t of times) {
        assert.equal(localDate(t[1]!), day, 'a time sits under another date');
        assert.equal(localClock(t[1]!), t[2]);
        assert.match(t[2]!, /:00$/, 'calls start on the hour');
        assert.equal(localClock(new Date(Date.parse(t[1]!) + 3_600_000).toISOString()), t[3], 'a call is an hour');
      }
    }
    assert.equal(SLOT_MINUTES, 60);
    assert.match(fig, /Each call lasts an hour\./);
    // With no JavaScript, one rule per date card shows its times; there is a rule for every card there can be.
    for (let i = 0; i < MAX_DAYS; i++) assert.ok(SITE_CSS.includes(`.f4-picker:has(.f4-d${i} input:checked) .f4-t${i}{display:block}`), `no rule for date ${i}`);
    assert.ok(!SITE_CSS.includes(`.f4-d${MAX_DAYS} input`));
  });

  test('a time hidden under another date is refused, a date with no time is refused, and the time chosen is held for an hour', async () => {
    const c = client();
    await toDetails(c);
    await c.post('/assessment/details', { ...DETAILS, b0_business: 'Picker Care Homes Limited', b1_business: 'Picker Dental LLP' });
    const fig = (await c.req('/assessment/figure')).body;
    const days = [...fig.matchAll(/name="day" value="(\d{4}-\d\d-\d\d)"/g)].map((m) => m[1]!);
    const later = [...fig.matchAll(/name="slot" value="([^"]+)"/g)].map((m) => m[1]!).filter((t) => t !== '' && localDate(t) === days[2]);
    const who = { first_name: 'Ada', surname: 'Invented', job_role: 'owner_director', channel: 'phone', phone: '01632 960000', contact_consent: 'on' };
    const hidden = await c.post('/assessment/close', { ...who, day: days[1]!, slot: later[0]! });
    assert.equal(hidden.status, 400);
    assert.match(hidden.body, /Choose a time on [A-Z][a-z]+day \d{1,2} [A-Z][a-z]+ — the time you had chosen is on /);
    assert.match(hidden.body, new RegExp(`name="day" value="${days[1]}" checked`), 'the date they were looking at stays chosen');
    const none = await c.post('/assessment/close', { ...who, day: days[2]! });
    assert.equal(none.status, 400);
    assert.match(none.body, /Choose a time on [A-Z][a-z]+day \d{1,2} [A-Z][a-z]+, or tick that none of the times suit you\./);
    const sent = await c.post('/assessment/close', { ...who, day: days[2]!, slot: later[1]! });
    assert.equal(sent.status, 200, sent.body.slice(0, 300));
    const held = made.app.db.get<{ starts_at: string; ends_at: string }>('SELECT starts_at, ends_at FROM bookings WHERE starts_at = ?', [later[1]!]);
    assert.ok(held !== undefined, 'the time was not held');
    assert.equal(Date.parse(held.ends_at) - Date.parse(held.starts_at), 60 * 60_000, 'the call is not an hour');
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
    // PHASE 153f (Word answer 164): no tick to send; a statement and the privacy notice link, then two optional boxes.
    assert.match(fig, /<div class="f4-consent"><p class="help">Sending this asks us to contact you about this enquiry\. You do not need to tick anything\. <a href="\/privacy\/">How we use your details<\/a>\.<\/p>[\s\S]*?name="whatsapp_optin"[\s\S]*?name="marketing_optin"[\s\S]*?<\/label><\/div>\s*<button class="cta" type="submit">Send<\/button>/);
    assert.equal(/name="contact_consent"/.test(fig), false, 'no contact tick box');
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

  // PHASE 153f, 4 October 2026 (Word answer 164): sending asks to be contacted; no tick is needed, and WhatsApp is its own box.
  test('PHASE 153f: sent with no tick at all, the contact is kept as asking to be contacted; the WhatsApp box is kept as ticked or not', async () => {
    for (const [name, wa] of [['Ivy', 'on'], ['Jo', '']] as const) {
      const c = client();
      await toDetails(c);
      await c.post('/assessment/details', { ...DETAILS, b0_business: `Invented ${name} Care Limited`, b1_business: `Invented ${name} Dental Limited` });
      const sent = await c.post('/assessment/close', { first_name: name, surname: 'Invented', job_role: 'owner_director', channel: 'email', email: `${name.toLowerCase()}.f4@example.invalid`, ...(wa === '' ? {} : { whatsapp_optin: wa }) });
      assert.equal(sent.status, 200, sent.body.slice(0, 300));
      const row = made.app.db.get<{ contact_consent: number; whatsapp_optin: number; marketing_optin: number }>(
        "SELECT contact_consent, whatsapp_optin, marketing_optin FROM contacts WHERE full_name = ? ORDER BY created_at LIMIT 1", [`${name} Invented`]);
      assert.deepEqual({ ...row }, { contact_consent: 1, whatsapp_optin: wa === 'on' ? 1 : 0, marketing_optin: 0 });
    }
  });

  // PHASE 153f, 4 October 2026: the six old screens are retired. This test said they still worked for a draft that uses
  // them (Q1 saved and moved on to Q1a, "Step 2 of 6"); the four-stage funnel's own tests above hold every rule they
  // asked, so an old link now opens stage 1.
  test('the six old screens are retired: an old link opens stage 1 of the four-stage funnel', async () => {
    const c = client();
    await c.req('/assessment');
    assert.equal((await c.post('/assessment/Q1', { own_prior_claim: 'no' })).location, '/assessment/buildings');
    assert.equal((await c.req('/assessment/Q1a')).location, '/assessment/buildings');
    assert.doesNotMatch((await c.req('/assessment/buildings')).body, /Step \d of 6/);
  });

  test('PHASE 153f: the six old screens are retired — every old link, GET or POST, with or without a draft, opens the four-stage funnel, and nothing recorded is changed', async () => {
    const db = made.app.db;
    // A four-stage draft part-way through (at stage 3), and a draft as the six old screens left one (on Q2).
    const c = client();
    await toDetails(c);
    const draftRow = (token: string) => db.get<{ state_json: string; screen: string; updated_at: string; submitted_assessment_id: string | null; closed_lead_id: string | null }>(
      'SELECT state_json, screen, updated_at, submitted_assessment_id, closed_lead_id FROM assessment_drafts WHERE token = ?', [token]);
    const funnelToken = /(?:^|; )cb_draft=([^;]+)/.exec(c.cookie())?.[1] ?? '';
    assert.notEqual(funnelToken, '', 'the four-stage draft has no cookie');
    assert.ok(JSON.parse(draftRow(funnelToken)!.state_json)['funnel'] === 4, 'the draft found is not the four-stage one');
    const oldToken = 'phase153f-old-six-screen-draft';
    const oldState = JSON.stringify({ own_prior_claim: 'no', previous_owner_claimed: 'dont_know', is_uk_taxpayer: 'yes', current_year_position: 'profitable',
      trigger_default: 'purchase', properties: [{ address: 'Old Record House, LE10 1DA', sector: 'care_homes', trigger: 'purchase', spend: 900000, date: '2022' }], contact: {} });
    db.run('INSERT INTO assessment_drafts (token, state_json, screen, created_at, updated_at) VALUES (?, ?, ?, ?, ?)', [oldToken, oldState, 'Q2', T, T]);

    const COUNT = {
      drafts: 'SELECT COUNT(*) AS n FROM assessment_drafts',
      assessments: 'SELECT COUNT(*) AS n FROM assessments',
      leads: 'SELECT COUNT(*) AS n FROM leads',
      organisations: 'SELECT COUNT(*) AS n FROM businesses',
    } as const;
    const counts = () => Object.fromEntries(Object.entries(COUNT).map(([k, q]) => [k, db.get<{ n: number }>(q)?.n ?? -1]));
    const before = { counts: counts(), funnel: { ...draftRow(funnelToken) }, old: { ...draftRow(oldToken) } };

    const OLD = ['Q1', 'Q1a', 'Q1b', 'Q1c', 'Q2', 'Q3'];
    const POSTED: Record<string, Record<string, string>> = {
      Q1: { own_prior_claim: 'yes' }, Q1a: { previous_owner_claimed: 'yes' }, Q1b: { is_uk_taxpayer: 'no' },
      Q1c: { trigger_default: 'fit_out' }, Q2: { p0_address: 'Changed, ZZ9 9ZZ', p0_sector: 'dental', add_property: 'on' }, Q3: { p0_works: 'yes' },
    };
    let n = 0;
    for (const cookie of [undefined, `cb_draft=${funnelToken}`, `cb_draft=${oldToken}`]) {
      for (const id of OLD) {
        for (const method of ['GET', 'POST'] as const) {
          const r = await fetch(`${base}/assessment/${id}`, {
            method, redirect: 'manual',
            headers: { ...(cookie === undefined ? {} : { cookie }), ...(method === 'POST' ? { 'content-type': 'application/x-www-form-urlencoded' } : {}) },
            ...(method === 'POST' ? { body: new URLSearchParams(POSTED[id]).toString() } : {}),
          });
          const where = `${method} /assessment/${id} ${cookie === undefined ? 'with no draft' : `with ${cookie}`}`;
          assert.equal(r.status, 303, `${where}: not a redirect`);
          assert.equal(r.headers.get('location'), '/assessment/buildings', `${where}: not sent to the four-stage funnel`);
          assert.deepEqual(r.headers.getSetCookie(), [], `${where}: a draft cookie was set`);
          await r.text();
          n++;
        }
      }
    }
    assert.equal(n, 36);
    assert.deepEqual(counts(), before.counts, 'a row was made or removed');
    assert.deepEqual({ ...draftRow(funnelToken) }, before.funnel, 'the four-stage draft was changed');
    assert.deepEqual({ ...draftRow(oldToken) }, before.old, 'the old six-screen draft was changed');
    // And the four-stage draft carries on where it was.
    assert.equal((await c.req('/assessment/figure')).location, '/assessment/details');
  });
});

// 30 Sep 2026, Lakhbir: "switch on companies house and postcodes.io". On for testing under a recorded waiver, with the
// privacy notice still unpublished (the free gate shut, as shipped). Recorded answers only: nothing here goes out.
describe('stage 3 lookups, switched on for testing', () => {
  const SEARCH: Fixture = { status: 200, headers: { 'content-type': 'application/json' }, body: JSON.stringify({ items: [
    { title: 'INVENTED CARE HOMES LIMITED', company_number: '12345678', company_status: 'active', address: { address_line_1: '9 Somewhere Road', postal_code: 'LE10 1AA' } },
  ] }) };
  const POSTCODE: Fixture = { status: 200, headers: { 'content-type': 'application/json' }, body: JSON.stringify({ status: 200, result: { postcode: 'LE10 1DA', admin_district: 'Hinckley and Bosworth', region: 'East Midlands', country: 'England' } }) };
  test('as shipped, with the notice unpublished: "Check postcode" is offered, and "Find this company" once the key is there; each sends only its own word', async () => {
    const was = { outside: made.app.outside, secrets: made.app.secrets };
    try {
      assert.equal(COMPANY_SEARCH.enabled, true);
      assert.equal(COMPANY_SEARCH.named_in_privacy_notice, false, 'the waiver never pretends the notice names it');
      assert.match(COMPANY_SEARCH.waiver_record ?? '', /"switch on companies house and postcodes\.io"/);
      const t = fixtureTransport({ 'GET /search/companies': SEARCH, 'GET /postcodes/LE101DA': POSTCODE });
      made.app.outside = t;
      delete made.app.startLookups;
      made.app.secrets = secretsFromValues({});
      const c = client();
      await toDetails(c);
      let page = (await c.req('/assessment/details')).body;
      assert.match(page, /Check postcode/);
      assert.doesNotMatch(page, /Find this company/, 'offered with no key');
      made.app.secrets = secretsFromValues({ COMPANIES_HOUSE_API_KEY: 'invented-companies-house-key-000' });
      page = (await c.req('/assessment/details')).body;
      assert.match(page, /Find this company/);
      await c.post('/assessment/details', { ...DETAILS, b0_business: 'invented care homes', find: 'company:0' });
      const asked = t.seen.find((x) => x.url.includes('/search/companies'));
      assert.ok(asked, 'Companies House was not asked');
      assert.equal(new URL(asked.url).searchParams.get('q'), 'invented care homes');
      assert.doesNotMatch(asked.url, /Invented%20Street|LE10|Hinckley/, 'more than the name went to Companies House');
      await c.post('/assessment/details', { ...DETAILS, find: 'postcode:0' });
      const pc = t.seen.filter((x) => x.url.includes('/postcodes/'));
      assert.equal(pc.length, 1);
      assert.match(pc[0]!.url, /\/postcodes\/LE101DA$/);
      page = (await c.req('/assessment/details')).body;
      assert.match(page, /INVENTED CARE HOMES LIMITED <span class="help">· company number 12345678 · active · registered office LE10 1AA<\/span>/);
      assert.match(page, /We found the postcode LE10 1DA: Hinckley and Bosworth, East Midlands, England\./);
      assert.doesNotMatch(page, /Somewhere Road/, 'more than the permitted fields reached the page');
    } finally { made.app.outside = was.outside; made.app.secrets = was.secrets; }
  });
});

// 30 Sep 2026, Lakhbir: "for address look up for the client rather than typeing this would be better" (GoAddress), and
// "sadique approves". Recorded answers only: nothing here goes out.
describe('"Find my address" (GoAddress)', () => {
  // The shape of GoAddress's real answer (the first live lookup, 30 Sep 2026), with invented addresses.
  const ANSWER: Fixture = { status: 200, headers: { 'content-type': 'application/json' }, body: JSON.stringify({
    postcode: 'LE101DA', total: 2, addresses: ['Invented Care Home, 1 Invented Street', '3 Invented Street'],
    new_address_res: [
      { addressid: 'a1', raw_address: 'Invented Care Home, 1 Invented Street', flat: null, house_no: null, building_name: 'Invented Care Home', organisation: null, street: '1 Invented Street', postcode: 'LE101DA', post_town: 'Hinckley', city: 'Hinckley and Bosworth', town: 'Hinckley', county: 'Leicestershire', country: 'England' },
      { addressid: 'a2', raw_address: '3 Invented Street', flat: null, house_no: '3', building_name: null, organisation: null, street: 'Invented Street', postcode: 'LE101DA', post_town: 'Hinckley', county: 'Leicestershire', country: 'England' }],
    new_address_res2: [
      { addressid: 'a1', line_1: 'Invented Care Home, 1 Invented Street', line_2: 'Leicestershire', line_3: 'LE101DA', line_4: 'England' },
      { addressid: 'a2', line_1: '3 Invented Street', line_2: 'Leicestershire', line_3: 'LE101DA', line_4: 'England' }],
    address_info: { postcode: 'LE101DA', post_town: 'Hinckley' }, extra_info: null, usage_today: 1, daily_limit: 100, remaining_today: 99 }) };
  test('switched on for testing and approved; needs only its key; the answer is read into lines, town and postcode', () => {
    assert.equal(ADDRESS_LOOKUP.enabled, true);
    assert.equal(ADDRESS_LOOKUP.named_in_privacy_notice, false, 'the waiver never pretends the notice names it');
    assert.match(ADDRESS_LOOKUP.waiver_record ?? '', /"sadique approves"/);
    assert.equal(CALL_POLICIES['GOADDRESS']?.international_transfer_approved, true);
    assert.deepEqual(addressLookupMissing(ADDRESS_LOOKUP, secretsFromValues({})), ['Put the GoAddress key in the key file: GOADDRESS_API_KEY.']);
    assert.deepEqual(addressLookupMissing(ADDRESS_LOOKUP, secretsFromValues({ GOADDRESS_API_KEY: 'k' })), []);
    assert.deepEqual(readAddresses(ANSWER.body, 'LE10 1DA').map((a) => [a.id, a.line1, a.town, a.postcode]), [
      ['a1', 'Invented Care Home, 1 Invented Street', 'Hinckley', 'LE10 1DA'], ['a2', '3 Invented Street', 'Hinckley', 'LE10 1DA']]);
    assert.deepEqual(readAddresses('not json', 'LE10 1DA'), []);
  });

  test('the postcode alone is sent; the person picks theirs and it fills the address; "not in the list" keeps what they typed', async () => {
    const was = { outside: made.app.outside, secrets: made.app.secrets };
    try {
      const t = fixtureTransport({ 'GET /api/address/LE101DA': ANSWER });
      made.app.outside = t;
      made.app.secrets = secretsFromValues({ GOADDRESS_API_KEY: 'invented-goaddress-token' });
      const c = client();
      await toDetails(c);
      let page = (await c.req('/assessment/details')).body;
      assert.match(page, /Find my address/);
      assert.doesNotMatch(page, /Check postcode/, 'both lookups offered');
      assert.ok(page.indexOf('name="b0_postcode"') < page.indexOf('name="b0_line1"'), 'the postcode should come first');
      await c.post('/assessment/details', { ...DETAILS, b0_line1: '', b0_town: '', find: 'address:0' });
      assert.equal(t.seen.length, 1);
      assert.match(t.seen[0]!.url, /\/api\/address\/LE101DA$/);
      assert.equal(t.seen[0]!.headers['authorization'], 'Bearer invented-goaddress-token');
      assert.equal(t.seen[0]!.body, undefined, 'something beside the postcode was sent');
      page = (await c.req('/assessment/details')).body;
      assert.match(page, /Choose your address/);
      assert.match(page, /name="b0_address_pick" value="a2"> 3 Invented Street, Hinckley<\/label>/);
      assert.match(page, /value="none"> My address is not in the list/);
      const next = await c.post('/assessment/details', { ...DETAILS, b0_line1: '', b0_town: '', b0_address_pick: 'a2' });
      assert.equal(next.location, '/assessment/figure', next.body.slice(0, 300));
      assert.match((await c.req('/assessment/figure')).body, /Building 1 · Care home — 3 Invented Street, Hinckley, LE10 1DA/);
      // "Not in the list": what they typed stands.
      const c2 = client();
      await toDetails(c2);
      await c2.post('/assessment/details', { ...DETAILS, find: 'address:0' });
      await c2.post('/assessment/details', { ...DETAILS, b0_line1: '9 Typed Road', b0_address_pick: 'none' });
      assert.match((await c2.req('/assessment/figure')).body, /Building 1 · Care home — 9 Typed Road, Hinckley, LE10 1DA/);
    } finally { made.app.outside = was.outside; made.app.secrets = was.secrets; }
  });
});
