/**
 * 29 SEPTEMBER 2026 — "AM I ELIGIBLE?" ASKS THE COMPANY AND THE PROPERTY FIRST.
 *
 * Lakhbir: "with the am i eligible we should be asking for address and company name"; the address by Postcodes.io
 * (free), the questions on the first screen. Companies House's name search and the postcode check are built and SHIP
 * OFF behind their gates; these tests open them only on recorded answers (nothing reaches either service).
 */
import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../src/server.ts';
import { fixtureTransport, liveTransport, type Fixture } from '../src/connectors/http.ts';
import { secretsFromValues } from '../src/secrets.ts';
import { COMPANY_SEARCH } from '../src/connectors/company-search.ts';
import { POSTCODE_CHECK } from '../src/connectors/postcode-check.ts';
import { SCREEN_IDS } from '../src/web/assessment.ts';

let made: Awaited<ReturnType<typeof createApp>>;
let base = '';
before(async () => {
  made = await createApp(':memory:', { twoFactor: 'off', documentRoot: mkdtempSync(join(tmpdir(), 'cb-start-')), publicOrigin: 'https://caprebate.example.invalid' });
  await new Promise<void>((r) => made.server.listen(0, '127.0.0.1', () => r()));
  const a = made.server.address();
  base = `http://127.0.0.1:${typeof a === 'object' && a !== null ? a.port : 0}`;
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
const START = { business_name: 'Invented Care Homes Limited', line1: '1 Invented Street', town: 'Hinckley', postcode: 'le10 1da' };

async function walkToClose(c: ReturnType<typeof client>): Promise<Res> {
  await c.post('/assessment/Q1', { own_prior_claim: 'no' });
  await c.post('/assessment/Q1a', { previous_owner_claimed: 'dont_know' });
  await c.post('/assessment/Q1b', { is_uk_taxpayer: 'yes', current_year_position: 'profitable' });
  await c.post('/assessment/Q1c', { trigger_default: 'purchase' });
  const q2 = await c.req('/assessment/Q2');
  const address = /name="p0_address" value="([^"]*)"/.exec(q2.body)?.[1] ?? '';
  await c.post('/assessment/Q2', { p0_address: address.replace(/&amp;/g, '&'), p0_sector: 'care_homes', p0_entity_type: 'ltd', p0_trigger: 'purchase', p0_spend: '1500000', p0_date: '06/2021' });
  await c.post('/assessment/Q3', { p0_works: 'no' });
  return c.req('/assessment/close');
}

describe('the first screen, as shipped (both lookups off)', () => {
  test('"Am I eligible?" opens on the company and the property, step 1 of 7; the six questions follow as steps 2 to 7', async () => {
    made.app.outside = liveTransport; delete made.app.startLookups;
    const c = client();
    assert.equal((await c.req('/assessment')).location, '/assessment/start');
    const s = await c.req('/assessment/start');
    assert.equal(s.status, 200);
    assert.match(s.body, /<p class="rung">Step 1 of 7<\/p>/);
    assert.match(s.body, /<h2>Your business and your property<\/h2>/);
    for (const name of ['business_name', 'line1', 'town', 'postcode']) assert.match(s.body, new RegExp(`name="${name}"`));
    assert.doesNotMatch(s.body, /Find my company|Check postcode/, 'a lookup is offered while its gate is shut');
    assert.equal(SCREEN_IDS.length, 6, 'the six questions are still six');
    const q1 = await c.req('/assessment/Q1');
    assert.match(q1.body, /<p class="rung">Step 2 of 7<\/p>/);
  });

  test('nothing is missing without a plain word for it; nothing moves on until it is given', async () => {
    const c = client();
    await c.req('/assessment');
    const r = await c.post('/assessment/start', { business_name: '', line1: '', town: '', postcode: 'not a postcode' });
    assert.equal(r.status, 400);
    assert.match(r.body, /Tell us the name of your company or business\./);
    assert.match(r.body, /Tell us the building name or number, and the street\./);
    assert.match(r.body, /That does not look like a UK postcode\./);
    assert.equal((await c.post('/assessment/start', START)).location, '/assessment/Q1');
  });

  test('the answers carry through: the property’s address, the last page’s name, and the records a sent assessment makes', async () => {
    const c = client();
    await c.req('/assessment');
    await c.post('/assessment/start', START);
    const q2 = await c.req('/assessment/Q2');
    assert.match(q2.body, /name="p0_address" value="1 Invented Street, Hinckley, le10 1da"/);
    const close = await walkToClose(c);
    assert.match(close.body, /name="business_name" value="Invented Care Homes Limited"/);
    const sent = await c.post('/assessment/close', { full_name: 'Invented Person', business_name: '', job_role: 'owner_director', channel: 'email', contact_value: 'start.test@example.invalid', contact_consent: 'on' });
    assert.equal(sent.status, 200, 'the assessment did not send');
    const biz = made.app.db.get<{ id: string; name: string; company_number: string | null }>(
      "SELECT id, name, company_number FROM businesses WHERE name = 'Invented Care Homes Limited'");
    assert.ok(biz, 'the business was not kept under the name given first');
    assert.equal(biz.company_number, null);
    const prop = made.app.db.get<{ label: string; postcode: string | null }>('SELECT label, postcode FROM properties WHERE business_id = ?', [biz.id]);
    assert.deepEqual({ ...prop }, { label: '1 Invented Street, Hinckley, le10 1da', postcode: 'LE10 1DA' });
  });
});

describe('the first screen with its lookups switched on (recorded answers only)', () => {
  const OPEN = { free_enabled: true, free_requires: 'the privacy notice', paid_requires_signed_engagement: true } as const;
  const ON = { enabled: true, named_in_privacy_notice: true } as const;
  const SEARCH: Fixture = { status: 200, headers: { 'content-type': 'application/json' }, body: JSON.stringify({ items: [
    { title: 'INVENTED CARE HOMES LIMITED', company_number: '12345678', company_status: 'active', company_type: 'ltd',
      address: { address_line_1: '9 Somewhere Road', postal_code: 'LE10 1AA' }, officers: [{ name: 'A PERSON' }] },
    { title: 'INVENTED CARE HOMES (MIDLANDS) LTD', company_number: 'SC123456', company_status: 'dissolved', address: { postal_code: 'EH1 1AA' } },
  ] }) };
  const POSTCODE: Fixture = { status: 200, headers: { 'content-type': 'application/json' }, body: JSON.stringify({ status: 200, result: { postcode: 'LE10 1DA', admin_district: 'Hinckley and Bosworth', region: 'East Midlands', country: 'England' } }) };
  const on = () => {
    const t = fixtureTransport({ 'GET /search/companies': SEARCH, 'GET /postcodes/LE101DA': POSTCODE });
    made.app.outside = t;
    made.app.secrets = secretsFromValues({ COMPANIES_HOUSE_API_KEY: 'invented-companies-house-key-000' });
    made.app.startLookups = { gate: OPEN, company: ON, postcode: ON };
    return t;
  };

  test('both switches ship off', () => {
    assert.deepEqual({ ...COMPANY_SEARCH }, { enabled: false, named_in_privacy_notice: false });
    assert.equal(POSTCODE_CHECK.enabled, false);
  });

  test('"Find my company" sends only the name, lists what the register permits, and a choice names the business and keeps its number', async () => {
    const t = on();
    const c = client();
    await c.req('/assessment');
    assert.match((await c.req('/assessment/start')).body, /Find my company/);
    const find = await c.post('/assessment/start', { ...START, business_name: 'invented care homes', find: 'company' });
    assert.equal(find.location, '/assessment/start#company');
    const sent = t.seen.find((x) => x.url.includes('/search/companies'));
    assert.ok(sent);
    assert.equal(new URL(sent.url).searchParams.get('q'), 'invented care homes');
    assert.equal(sent.url.includes('Invented%20Street') || sent.url.includes('LE10'), false, 'the address went to Companies House');
    const page = (await c.req('/assessment/start')).body;
    assert.match(page, /INVENTED CARE HOMES LIMITED <span class="help">· company number 12345678 · active · registered office LE10 1AA<\/span>/);
    assert.match(page, /value="none"> None of these/);
    assert.doesNotMatch(page, /A PERSON|Somewhere Road|ltd<\/span>/, 'more than the permitted fields reached the page');
    assert.equal((await c.post('/assessment/start', { ...START, company_number: '12345678' })).location, '/assessment/Q1');
    await walkToClose(c);
    await c.post('/assessment/close', { full_name: 'Invented Person', business_name: '', job_role: 'owner_director', channel: 'email', contact_value: 'picked@example.invalid', contact_consent: 'on' });
    const biz = made.app.db.get<{ name: string; company_number: string | null }>("SELECT name, company_number FROM businesses WHERE company_number = '12345678'");
    assert.deepEqual({ ...biz }, { name: 'INVENTED CARE HOMES LIMITED', company_number: '12345678' });
  });

  test('a name changed after a company was chosen is no longer that company', async () => {
    on();
    const c = client();
    await c.req('/assessment');
    await c.post('/assessment/start', { ...START, find: 'company' });
    await c.post('/assessment/start', { ...START, company_number: '12345678' });
    await c.post('/assessment/start', { ...START, business_name: 'A Different Business' });
    const page = (await c.req('/assessment/start')).body;
    assert.match(page, /value="A Different Business"/);
    assert.doesNotMatch(page, /value="12345678" checked/);
  });

  test('"Check postcode" asks Postcodes.io about the postcode alone and says where it is', async () => {
    const t = on();
    const c = client();
    await c.req('/assessment');
    assert.equal((await c.post('/assessment/start', { ...START, find: 'postcode' })).location, '/assessment/start#property');
    const sent = t.seen.filter((x) => x.url.includes('/postcodes/'));
    assert.equal(sent.length, 1);
    assert.match(sent[0]?.url ?? '', /\/postcodes\/LE101DA$/);
    assert.match((await c.req('/assessment/start')).body, /We found the postcode LE10 1DA: Hinckley and Bosworth, East Midlands, England\./);
  });

  test('with the gate shut again, nothing is offered and nothing is sent', async () => {
    const t = on();
    delete made.app.startLookups;
    const c = client();
    await c.req('/assessment');
    const page = (await c.req('/assessment/start')).body;
    assert.doesNotMatch(page, /Find my company|Check postcode/);
    await c.post('/assessment/start', { ...START, find: 'company' });
    await c.post('/assessment/start', { ...START, find: 'postcode' });
    assert.equal(t.seen.length, 0);
  });
});
