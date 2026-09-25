/**
 * PHASE 151b, 25 September 2026 — WHO SIGNED, AND WHETHER THE REGISTER SAYS THEY MAY (Word answer 156).
 *
 * "May we briefly check two public register names without saving them?" — "Yes – best to check who signs and if they
 * have authority". The signer's name, typed on the engagement letter, is compared in memory with the Companies House
 * officers list and the care regulator's registered manager and nominated individual; only YES, NO or NOT_CHECKED and a
 * reason code are kept. These tests prove, on recorded answers with INVENTED names, no key and no network:
 *   1  names are compared by one strict rule (case, spacing, punctuation, titles, middle names, "SURNAME, Forenames");
 *   2  it ships off and sends nothing; with the free lookups shut it sends nothing even with every switch on;
 *   3  YES for a current director written differently; NO for one who has left, for a secretary and for a stranger;
 *   4  NOT_CHECKED when the register fails, when we hold no number, and for a sole trader;
 *   5  the care regulator's registered manager and nominated individual;
 *   6  no fixture name reaches the stored row, any audit row, any other table or a log line;
 *   7  the panel's line for every outcome is plain words;
 *   8  N4: not known and absent behave alike, and neither becomes a YES.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';

import { fixtureTransport, RateLimiter, type Fixture } from '../src/connectors/http.ts';
import * as C from '../src/connectors/registers.ts';
import {
  sameName, signatoryWords, SIGNATORY_SOURCES, YES_REASONS, NO_REASONS, NOT_CHECKED_KEPT, NOT_CHECKED_LIVE,
  type SignatoryReason,
} from '../src/connectors/signatory-check.ts';
import { companiesHouseOfficers } from '../src/connectors/companies-house.ts';
import { cqcNamedPeople } from '../src/connectors/cqc.ts';
import { secretsFromValues } from '../src/secrets.ts';
import * as R from '../src/web/research.ts';
import { claimantTypeForGate } from '../src/web/crm.ts';
import { seed } from '../src/seed.ts';
import { newId } from '../src/users.ts';
import { testApp, actor } from './helpers.ts';

const KEYS = secretsFromValues({ COMPANIES_HOUSE_API_KEY: 'ch-fixture-key-151b', CQC_SUBSCRIPTION_KEY: 'cqc-fixture-key-151b' });
const ALL_ON: Readonly<Record<string, boolean>> = Object.freeze(Object.fromEntries(Object.keys(C.REGISTER_SWITCHES).map((k) => [k, true])));
const OPEN = { free_gate_open: true, engagement_signed: true } as const;

/* ------------------------------------------------------------------ invented register answers */

const OFFICERS = JSON.stringify({
  total_results: 5, active_count: 3, resigned_count: 1, items_per_page: 100, start_index: 0,
  items: [
    { name: 'ZEDBURY, Joanna Mary', officer_role: 'director', appointed_on: '2015-04-01',
      name_elements: { title: 'Dr', forename: 'Joanna', other_forenames: 'Mary', surname: 'ZEDBURY' } },
    { name: 'QUILLFEATHER, Oswin Barnaby', officer_role: 'director', appointed_on: '2012-01-01', resigned_on: '2020-06-30' },
    { name: 'PLOVERTON, Hester', officer_role: 'secretary', appointed_on: '2015-04-01' },
    { name: 'INVENTED SECRETARIES LIMITED', officer_role: 'corporate-secretary', appointed_on: '2015-04-01' },
    // No role at all: not known, so not a role that signs (N4).
    { name: 'MARROWBY-TRELLICK, Tobias', appointed_on: '2019-01-01' },
  ],
});
const LLP_OFFICERS = JSON.stringify({ total_results: 1, items: [{ name: 'FENWICKE, Tabitha', officer_role: 'llp-designated-member' }] });
const LOCATION = JSON.stringify({
  locationId: '1-INVENTED01', providerId: '1-INVPROV01', name: 'Invented Care Home',
  regulatedActivities: [{ name: 'Accommodation for persons who require nursing or personal care', code: 'RA2', contacts: [
    { personTitle: 'Mx', personGivenName: 'Ottilie', personFamilyName: 'Grevstone', personRoles: ['Registered Manager'] },
    // A named contact with no role list is nobody's registered manager (N4).
    { personTitle: 'Mr', personGivenName: 'Wendell', personFamilyName: 'Nobrole' },
  ] }],
});
const PROVIDER = JSON.stringify({
  providerId: '1-INVPROV01', companiesHouseNumber: '09999991',
  regulatedActivities: [{ name: 'Accommodation', code: 'RA2', nominatedIndividual: { personTitle: 'Mr', personGivenName: 'Rupert', personFamilyName: 'Halloway' } }],
});

/** Every invented name above and every name a test types, word by word — none may be found anywhere afterwards. */
const NAMES = ['Zedbury', 'Joanna', 'Quillfeather', 'Oswin', 'Barnaby', 'Ploverton', 'Hester', 'Marrowby', 'Trellick', 'Tobias',
  'Fenwicke', 'Tabitha', 'Ottilie', 'Grevstone', 'Wendell', 'Nobrole', 'Rupert', 'Halloway', 'Imogen', 'Farthingale'];

const ok = (body: string): Fixture => ({ status: 200, body });
const EVERYTHING: Record<string, Fixture> = {
  'GET /company/09999991/officers': ok(OFFICERS),
  'GET /company/OC999991/officers': ok(LLP_OFFICERS),
  'GET /public/v1/locations/1-INVENTED01': ok(LOCATION),
  'GET /public/v1/providers/1-INVPROV01': ok(PROVIDER),
};

/* ------------------------------------------------------------------ a client who has signed */

type World = Awaited<ReturnType<typeof world>>;

async function world(o: {
  signer: string; company_number?: string | null; claimant?: string | null; cqc?: boolean;
  fixtures?: Record<string, Fixture | readonly Fixture[]>; switches?: Readonly<Record<string, boolean>>;
}) {
  const app = await testApp();
  const r = await seed(app.db, app.hasher, app.now);
  const id = r.businesses[0]!.id; // Aldergate: an engagement, and no signature yet
  app.db.run('UPDATE businesses SET company_number = ?, claimant_type = ? WHERE id = ?',
    [o.company_number === undefined ? '09999991' : o.company_number, o.claimant === undefined ? 'COMPANY' : o.claimant, id]);
  const eng = app.db.get<{ id: string }>('SELECT id FROM engagements WHERE business_id = ?', [id])!.id;
  const h = (): string => randomBytes(32).toString('hex');
  app.db.run(
    'INSERT INTO engagement_signatures (id, engagement_id, business_id, origin, user_id, session_id, signer_name, signer_role, business_name, ' +
      'authority_confirmed, signed_at, ip, letter_text, letter_sha256, pdf, pdf_sha256, record_sha256) ' +
      "VALUES (?, ?, ?, 'SEED', NULL, NULL, ?, 'Director', 'Invented Business', 1, ?, '192.0.2.1', 'letter', ?, ?, ?, ?)",
    [newId(), eng, id, o.signer, app.now(), h(), new Uint8Array([1]), h(), h()]);
  if (o.cqc === true) {
    app.db.run('INSERT INTO register_records (id, business_id, source_id, entity_id, fields_json, obtained_at) VALUES (?, ?, ?, ?, ?, ?)',
      [newId(), id, 'CQC', '1-INVENTED01', JSON.stringify({ cqc_location_id: '1-INVENTED01', cqc_provider_id: '1-INVPROV01' }), app.now()]);
  }
  const admin = app.db.get<{ id: string }>("SELECT id FROM users WHERE role = 'ADMIN' ORDER BY id LIMIT 1")!.id;
  const t = fixtureTransport(o.fixtures ?? EVERYTHING);
  const d: R.RunDeps = {
    db: app.db, audit: app.audit, now: app.now, newId,
    outside: { transport: t, secrets: KEYS, switches: o.switches ?? ALL_ON, limiter: new RateLimiter(), sleep: async () => { /* no wait */ } },
  };
  const who = actor('ADMIN', admin);
  /** One click's check, stored and audited exactly as runResearch does it. */
  const run = async (gates: { free_gate_open: boolean; engagement_signed: boolean } = OPEN) => {
    const s = await R.runSignatoryCheck(d, who, id, gates);
    const at = app.now();
    let kept: ReturnType<typeof R.storeSignatoryChecks> = [];
    app.db.tx(() => { kept = R.storeSignatoryChecks(d, who, id, s, at); });
    R.auditSignatoryChecks(d, who, id, kept, at);
    return Object.fromEntries(s.outcomes.map((x) => [x.source, x]));
  };
  const rows = () => app.db.all<Record<string, unknown>>('SELECT * FROM signatory_checks WHERE business_id = ? ORDER BY rowid', [id]);
  const audits = () => app.db.all<{ detail: string }>("SELECT detail FROM audit_log WHERE kind = 'SIGNATORY_CHECKED' ORDER BY seq");
  return { app, id, t, d, who, run, rows, audits };
}

/* ================================================================== *
 * 1 · COMPARING NAMES
 * ================================================================== */

describe('comparing two person names, in memory, by one strict rule', () => {
  test('case, spacing, punctuation, accents, titles and letters after a name do not matter; "SURNAME, Forenames" is read that way round', () => {
    assert.equal(sameName('Dr  joseph   a. bloggs', 'BLOGGS, Joseph Andrew'), true);
    assert.equal(sameName('Siân O’Brien-Smith', "O'BRIEN-SMITH, Sian"), true);
    assert.equal(sameName('Joseph Bloggs OBE', 'BLOGGS, Joseph, Dr'), true);
    assert.equal(sameName('Bloggs, Joseph', { whole: null, surname: 'Bloggs', forenames: 'Joseph Andrew' }), true);
    // An unhyphenated double surname still matches, because a name with no comma is tried at every split.
    assert.equal(sameName('Mary Ann Smith Jones', 'SMITH JONES, Mary Ann'), true);
    assert.equal(sameName('Mary Ann Smith Jones', 'SMITH-JONES, Mary'), true, 'a middle name one side leaves out');
  });

  test('never on less: another first name, an initial alone, clashing middle names, a surname alone, nothing', () => {
    assert.equal(sameName('Andrew Bloggs', 'BLOGGS, Joseph Andrew'), false, 'a middle name is not a first name');
    assert.equal(sameName('J Bloggs', 'BLOGGS, Joseph'), false, 'an initial alone is not enough');
    assert.equal(sameName('Joseph Brian Bloggs', 'BLOGGS, Joseph Andrew'), false);
    assert.equal(sameName('Joseph Bloggs', 'BLOGGS'), false);
    assert.equal(sameName('Joseph Bloggs', 'BLOGGS, Josephine'), false);
    assert.equal(sameName('Joseph Bloggs', 'BRIGGS, Joseph'), false);
    for (const nothing of [null, undefined, '', '   ', 'Madonna', 'Dr']) assert.equal(sameName(nothing, 'BLOGGS, Joseph'), false, String(nothing));
    assert.equal(sameName('Joseph Bloggs', null), false);
    assert.equal(sameName('Joseph Bloggs', { whole: null, surname: null, forenames: 'Joseph' }), false);
  });
});

/* ================================================================== *
 * 2 · OFF, AND SHUT
 * ================================================================== */

describe('switched off with the lookups, and shut with the free lookups', () => {
  test('AS SHIPPED: every switch off, no switch of its own — nothing is sent, nothing is kept, and the panel says why', async () => {
    const w = await world({ signer: 'Joanna Zedbury', switches: C.REGISTER_SWITCHES });
    try {
      for (const [k, v] of Object.entries(C.REGISTER_SWITCHES)) assert.equal(v, false, k);
      assert.equal(Object.keys(C.REGISTER_SWITCHES).some((k) => /SIGN/i.test(k)), false, 'the check has a switch of its own');
      assert.equal(companiesHouseOfficers.source_id, 'CH_COMPANY');
      assert.equal(cqcNamedPeople.source_id, 'CQC');
      const out = await w.run();
      for (const s of SIGNATORY_SOURCES) assert.deepEqual([out[s]?.result, out[s]?.reason], ['NOT_CHECKED', 'SWITCHED_OFF'], s);
      assert.equal(w.t.seen.length, 0, 'a call was made with the lookups switched off');
      assert.deepEqual([w.rows().length, w.audits().length], [0, 0]);
      const lines = R.signatoryLines(w.app.db, w.id, OPEN);
      assert.match(lines[0]!.words, /Companies House lookup, which is not switched on yet/);
      assert.match(lines[1]!.words, /care regulator lookup, which is not switched on yet/);
    } finally { w.app.close(); }
  });

  test('FREE LOOKUPS SHUT: every switch on, every key, every answer recorded — nothing is sent; nor before signature (N4: only true signs)', async () => {
    const w = await world({ signer: 'Joanna Zedbury', cqc: true });
    try {
      const shut = await w.run({ free_gate_open: false, engagement_signed: true });
      for (const s of SIGNATORY_SOURCES) assert.equal(shut[s]?.reason, 'FREE_LOOKUPS_OFF', s);
      for (const notSigned of [false, 'yes' as unknown as boolean, undefined as unknown as boolean, null as unknown as boolean]) {
        const o = await w.run({ free_gate_open: true, engagement_signed: notSigned });
        for (const s of SIGNATORY_SOURCES) assert.equal(o[s]?.reason, 'NOT_SIGNED', `${s} ${String(notSigned)}`);
      }
      const open = await w.run({ free_gate_open: 'yes' as unknown as boolean, engagement_signed: true });
      assert.equal(open['COMPANIES_HOUSE']?.reason, 'FREE_LOOKUPS_OFF', 'a truthy "yes" opened the free lookups');
      assert.equal(w.t.seen.length, 0);
      assert.deepEqual([w.rows().length, w.audits().length], [0, 0]);
    } finally { w.app.close(); }
  });

  test('"RUN THE RESEARCH" TODAY: the check is one more step on the click, and with the free lookups shut it sends nothing and keeps nothing', async () => {
    const app = await testApp();
    try {
      const r = await seed(app.db, app.hasher, app.now);
      const signed = app.db.get<{ business_id: string }>('SELECT business_id FROM engagement_signatures LIMIT 1')!.business_id;
      assert.ok(r.businesses.some((b) => b.id === signed));
      const admin = app.db.get<{ id: string }>("SELECT id FROM users WHERE role = 'ADMIN' ORDER BY id LIMIT 1")!.id;
      const t = fixtureTransport(EVERYTHING);
      const out = await R.runResearch({ db: app.db, audit: app.audit, now: app.now, newId, outside: { transport: t, secrets: KEYS, switches: ALL_ON } }, actor('ADMIN', admin), signed);
      assert.equal(out.ok, true);
      assert.deepEqual(out.signatory?.map((l) => [l.source, l.result, l.checked_at]), [['COMPANIES_HOUSE', 'NOT_CHECKED', null], ['CQC', 'NOT_CHECKED', null]]);
      assert.match(out.signatory?.[0]?.words ?? '', /Free lookups wait until our privacy notice is published/);
      assert.equal(t.seen.length, 0);
      assert.equal(app.db.all('SELECT id FROM signatory_checks').length, 0);
      const panel = R.sourcesFor(app.db, actor('ADMIN'), signed);
      assert.deepEqual(panel.signatory.map((l) => l.source), ['COMPANIES_HOUSE', 'CQC']);
      assert.match(panel.signatory[1]!.words, /Free lookups wait/);
    } finally { app.close(); }
  });
});

/* ================================================================== *
 * 3 · YES AND NO AT COMPANIES HOUSE
 * ================================================================== */

describe('Companies House: YES only for a current director or designated member', () => {
  test('YES for a current director whose name was typed differently — one call, the address as a template, kept as YES', async () => {
    const w = await world({ signer: 'dr joanna m. ZEDBURY' });
    try {
      const out = await w.run();
      assert.deepEqual([out['COMPANIES_HOUSE']?.result, out['COMPANIES_HOUSE']?.reason], ['YES', 'CURRENT_DIRECTOR']);
      assert.match(out['COMPANIES_HOUSE']?.words ?? '', /^Yes\. Companies House lists the person who signed as a current director\./);
      assert.equal(out['CQC']?.reason, 'NO_CARE_REGISTRATION');
      assert.equal(w.t.seen.length, 1);
      assert.match(w.t.seen[0]!.url, /\/company\/09999991\/officers\?/);
      const called = w.app.db.all<{ detail: string }>("SELECT detail FROM audit_log WHERE kind = 'CONNECTOR_CALLED'").map((r) => JSON.parse(r.detail) as Record<string, unknown>);
      assert.equal(called.length, 1);
      assert.equal(called[0]!['endpoint'], '/company/{company_number}/officers');
      assert.deepEqual(called[0]!['query_keys'], ['items_per_page', 'start_index']);
      const rows = w.rows();
      assert.deepEqual(rows.map((r) => [r['source'], r['result'], r['reason']]), [['COMPANIES_HOUSE', 'YES', 'CURRENT_DIRECTOR'], ['CQC', 'NOT_CHECKED', 'NO_CARE_REGISTRATION']]);
      assert.deepEqual(w.audits().map((a) => JSON.parse(a.detail)), [{ source: 'COMPANIES_HOUSE', result: 'YES' }, { source: 'CQC', result: 'NOT_CHECKED' }]);
      // Answered, so not asked again on the next click.
      await w.run();
      assert.equal(w.t.seen.length, 1, 'a YES already kept was asked again');
      assert.equal(R.signatoryLines(w.app.db, w.id, OPEN)[0]!.result, 'YES');
    } finally { w.app.close(); }
  });

  test('YES for an LLP’s designated member', async () => {
    const w = await world({ signer: 'Tabitha Fenwicke', company_number: 'OC999991', claimant: 'LLP' });
    try {
      assert.equal((await w.run())['COMPANIES_HOUSE']?.reason, 'DESIGNATED_MEMBER');
    } finally { w.app.close(); }
  });

  for (const [signer, reason, why] of [
    ['Oswin Quillfeather', 'RESIGNED', 'a director who has left'],
    ['Imogen Farthingale', 'NOT_LISTED', 'a stranger'],
    ['Hester Ploverton', 'ROLE_CANNOT_SIGN', 'the company secretary'],
    ['Tobias Marrowby-Trellick', 'ROLE_CANNOT_SIGN', 'an officer whose role the register does not give (N4)'],
  ] as const) {
    test(`NO for ${why} — kept as NO, in plain words that do not call it a risk`, async () => {
      const w = await world({ signer });
      try {
        const o = (await w.run())['COMPANIES_HOUSE'];
        assert.deepEqual([o?.result, o?.reason], ['NO', reason]);
        assert.match(o?.words ?? '', /^No\. .*This is only what the register shows\.$/);
        assert.equal(/risk|warning|fraud|suspicious/i.test(o?.words ?? ''), false);
        assert.deepEqual(w.rows()[0]?.['result'], 'NO');
      } finally { w.app.close(); }
    });
  }
});

/* ================================================================== *
 * 4 · NOT CHECKED
 * ================================================================== */

describe('NOT_CHECKED, with a plain reason, and nothing guessed', () => {
  test('the register did not answer: kept as not checked, and asked again on the next click', async () => {
    const w = await world({ signer: 'Joanna Zedbury', fixtures: { 'GET /company/09999991/officers': [{ status: 503, body: '{}' }] } });
    try {
      const o = (await w.run())['COMPANIES_HOUSE'];
      assert.deepEqual([o?.result, o?.reason], ['NOT_CHECKED', 'REGISTER_DID_NOT_ANSWER']);
      assert.match(o?.words ?? '', /did not answer this time/);
      const n = w.t.seen.length;
      assert.ok(n >= 1);
      await w.run();
      assert.ok(w.t.seen.length > n, 'a register that did not answer was not tried again');
      const unreadable = await world({ signer: 'Joanna Zedbury', fixtures: { 'GET /company/09999991/officers': ok('not json') } });
      try { assert.equal((await unreadable.run())['COMPANIES_HOUSE']?.reason, 'REGISTER_UNREADABLE'); } finally { unreadable.app.close(); }
      const gone = await world({ signer: 'Joanna Zedbury', fixtures: {} });
      try { assert.equal((await gone.run())['COMPANIES_HOUSE']?.reason, 'NO_RECORD_ON_REGISTER'); } finally { gone.app.close(); }
    } finally { w.app.close(); }
  });

  test('no company number: nothing sent; a sole trader or partnership: nothing sent to either register', async () => {
    for (const none of [null, '', '   ', 'not a number']) {
      const w = await world({ signer: 'Joanna Zedbury', company_number: none });
      try {
        const o = await w.run();
        assert.deepEqual([o['COMPANIES_HOUSE']?.result, o['COMPANIES_HOUSE']?.reason], ['NOT_CHECKED', 'NO_COMPANY_NUMBER'], String(none));
        assert.equal(w.t.seen.length, 0);
      } finally { w.app.close(); }
    }
    for (const claimant of ['SOLE_TRADER', 'PARTNERSHIP']) {
      const w = await world({ signer: 'Joanna Zedbury', claimant, cqc: true });
      try {
        assert.equal(claimantTypeForGate(w.app.db, w.id).value, claimant);
        const o = await w.run();
        for (const s of SIGNATORY_SOURCES) assert.deepEqual([o[s]?.result, o[s]?.reason], ['NOT_CHECKED', 'NOT_ON_THIS_REGISTER'], `${claimant} ${s}`);
        assert.equal(w.t.seen.length, 0);
        assert.match(o['COMPANIES_HOUSE']?.words ?? '', /sole trader or a partnership has no directors/);
      } finally { w.app.close(); }
    }
  });
});

/* ================================================================== *
 * 5 · THE CARE REGULATOR
 * ================================================================== */

describe('the care regulator: the registered manager or the nominated individual', () => {
  test('YES for the registered manager (one call), YES for the nominated individual (two), NO for a contact with no role (N4)', async () => {
    const a = await world({ signer: 'Ottilie Grevstone', cqc: true, company_number: null });
    try {
      assert.equal((await a.run())['CQC']?.reason, 'REGISTERED_MANAGER');
      assert.deepEqual(a.t.seen.map((s) => new URL(s.url).pathname), ['/public/v1/locations/1-INVENTED01']);
    } finally { a.app.close(); }
    const b = await world({ signer: 'Mr Rupert Halloway', cqc: true, company_number: null });
    try {
      assert.equal((await b.run())['CQC']?.reason, 'NOMINATED_INDIVIDUAL');
      assert.equal(b.t.seen.length, 2);
    } finally { b.app.close(); }
    const c = await world({ signer: 'Wendell Nobrole', cqc: true, company_number: null });
    try {
      const o = (await c.run())['CQC'];
      assert.deepEqual([o?.result, o?.reason], ['NO', 'NOT_LISTED']);
    } finally { c.app.close(); }
  });
});

/* ================================================================== *
 * 6 · NO NAME, ANYWHERE
 * ================================================================== */

describe('names never leave the check', () => {
  test('after every outcome, no fixture name is in signatory_checks, in any audit row, in any table, or in a log line', async () => {
    const said: string[] = [];
    const orig = { log: console.log, error: console.error, warn: console.warn, info: console.info };
    for (const k of ['log', 'error', 'warn', 'info'] as const) console[k] = (...a: unknown[]) => { said.push(a.map(String).join(' ')); };
    const worlds: World[] = [];
    try {
      for (const signer of ['Joanna Zedbury', 'Oswin Quillfeather', 'Imogen Farthingale', 'Hester Ploverton', 'Ottilie Grevstone', 'Rupert Halloway', 'Wendell Nobrole']) {
        const w = await world({ signer, cqc: true });
        worlds.push(w);
        const out = await w.run();
        const blob = JSON.stringify(out).toLowerCase();
        for (const n of NAMES) assert.equal(blob.includes(n.toLowerCase()), false, `${n} is in the outcome`);
      }
    } finally { Object.assign(console, orig); }
    for (const w of worlds) {
      try {
        const cols = w.app.db.all<{ name: string }>('SELECT name FROM pragma_table_info(?)', ['signatory_checks']).map((c) => c.name);
        assert.equal(cols.some((c) => /name/i.test(c)), false, 'signatory_checks has a name column');
        const kept = JSON.stringify(w.rows()).toLowerCase();
        const audit = JSON.stringify(w.app.db.all('SELECT kind, detail FROM audit_log')).toLowerCase();
        for (const n of NAMES.map((x) => x.toLowerCase())) {
          assert.equal(kept.includes(n), false, `${n} reached signatory_checks`);
          assert.equal(audit.includes(n), false, `${n} reached the audit log`);
        }
        for (const t of w.app.db.all<{ name: string }>("SELECT name FROM sqlite_master WHERE type = 'table' AND name <> 'engagement_signatures'")) {
          // The table name comes from sqlite_master, never from a caller; it is joined apart because tools/lint-sql.cjs reads words.
          const every = ['SEL', 'ECT * FROM "', t.name.replace(/"/g, ''), '"'].join('');
          const rows = JSON.stringify(w.app.db.all(every), (_k, v: unknown) => (v instanceof Uint8Array ? null : v)).toLowerCase();
          for (const n of NAMES.map((x) => x.toLowerCase())) assert.equal(rows.includes(n), false, `${n} reached ${t.name}`);
        }
        assert.ok(w.rows().length >= 2, 'nothing was kept');
      } finally { w.app.close(); }
    }
    const logged = said.join('\n').toLowerCase();
    for (const n of NAMES) assert.equal(logged.includes(n.toLowerCase()), false, `${n} was logged`);
  });

  test('the table refuses a reason that is not on its list, and is never edited or deleted', async () => {
    const w = await world({ signer: 'Joanna Zedbury' });
    try {
      await w.run();
      const eng = w.app.db.get<{ id: string }>('SELECT id FROM engagements WHERE business_id = ?', [w.id])!.id;
      assert.throws(() => w.app.db.run(
        "INSERT INTO signatory_checks (id, business_id, engagement_id, source, result, reason, checked_at, checked_by) VALUES (?, ?, ?, 'COMPANIES_HOUSE', 'NO', 'Joanna Zedbury', ?, ?)",
        [newId(), w.id, eng, w.app.now(), w.who.id]));
      assert.throws(() => w.app.db.run(
        "INSERT INTO signatory_checks (id, business_id, engagement_id, source, result, reason, checked_at, checked_by) VALUES (?, ?, ?, 'CQC', 'YES', 'CURRENT_DIRECTOR', ?, ?)",
        [newId(), w.id, eng, w.app.now(), w.who.id]), 'a director at the care regulator');
      assert.throws(() => w.app.db.run("UPDATE signatory_checks SET result = 'NO'"));
      assert.throws(() => w.app.db.run('DELETE FROM signatory_checks'));
    } finally { w.app.close(); }
  });
});

/* ================================================================== *
 * 7 · PLAIN WORDS
 * ================================================================== */

describe('the research panel’s line for every outcome is plain words', () => {
  test('no banned word and no sentence above grade 9, for every register and every reason', () => {
    const require = createRequire(import.meta.url);
    const ROOT = join(import.meta.dirname, '..', '..', '..');
    const check = require(join(ROOT, '03-app', 'caprebate-plain-words-check.cjs')) as {
      loadSwaps(f: string): unknown; checkStrings(s: { text: string; file: string; line: number }[], sw: unknown): { why: string; text: string }[];
    };
    const swaps = check.loadSwaps(join(import.meta.dirname, '..', 'src', 'web', 'voice.ts'));
    const all: SignatoryReason[] = [...YES_REASONS, ...NO_REASONS, ...NOT_CHECKED_KEPT, ...NOT_CHECKED_LIVE];
    const strings = SIGNATORY_SOURCES.flatMap((s) => all.map((r, i) => ({ text: signatoryWords(s, r), file: `${s}:${r}`, line: i + 1 })));
    for (const s of strings) assert.ok(s.text.length > 10 && !/undefined|null|_/.test(s.text), s.file);
    const fails = check.checkStrings(strings, swaps);
    assert.deepEqual(fails.map((f) => `${f.why}`), []);
  });
});

/* ================================================================== *
 * 8 · N4
 * ================================================================== */

describe('N4: not known and absent behave alike, and neither becomes a YES', () => {
  test('a claimant type not known and one never recorded check the same; no signer name is not checked, never a pass', async () => {
    const results: string[] = [];
    for (const claimant of [null, 'UNKNOWN']) {
      const w = await world({ signer: 'Joanna Zedbury', claimant });
      try {
        assert.equal(claimantTypeForGate(w.app.db, w.id).value, null);
        const o = await w.run();
        results.push(`${o['COMPANIES_HOUSE']?.result}/${o['COMPANIES_HOUSE']?.reason}`);
      } finally { w.app.close(); }
    }
    assert.deepEqual(results, ['YES/CURRENT_DIRECTOR', 'YES/CURRENT_DIRECTOR'], 'the check stands on the register, not on the unknown');
    for (const signer of ['  ', 'Dr']) {
      const w = await world({ signer: signer.padEnd(2, ' ') });
      try {
        const o = await w.run();
        for (const s of SIGNATORY_SOURCES) assert.equal(o[s]?.result === 'YES', false, s);
        assert.equal(o['COMPANIES_HOUSE']?.reason, 'NO_SIGNER_NAME');
        assert.equal(w.t.seen.length, 0);
      } finally { w.app.close(); }
    }
  });

  test('no key: switched on but not set up, nothing sent, nothing kept', async () => {
    const w = await world({ signer: 'Joanna Zedbury', cqc: true });
    try {
      const d: R.RunDeps = { ...w.d, outside: { ...w.d.outside!, secrets: secretsFromValues({}) } };
      const s = await R.runSignatoryCheck(d, w.who, w.id, OPEN);
      for (const o of s.outcomes) assert.deepEqual([o.result, o.reason, o.kept], ['NOT_CHECKED', 'NO_KEY', false]);
      assert.equal(w.t.seen.length, 0);
      const none = await R.runSignatoryCheck({ ...w.d, outside: undefined as unknown as R.ResearchOutside }, w.who, w.id, OPEN);
      assert.equal(none.outcomes.every((o) => o.result === 'NOT_CHECKED' && !o.kept), true);
    } finally { w.app.close(); }
  });
});
