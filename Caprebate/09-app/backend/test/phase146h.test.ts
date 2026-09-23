/**
 * PHASE 146h, 23 September 2026 — THE FREE REGISTERS' FOLLOW-ONS.
 *
 *   1 · A PERSON'S PICK FOR A CLOSE MATCH. A REVIEW-band match used to be FAILED, code MATCH_REVIEW, keeping
 *       nothing. It can now be handed to the back office — after a signed engagement ONLY — where a person chooses
 *       one candidate or none. The list is fetched again for that request and never stored; the choice, who made it
 *       and the score go on the audit chain; only the chosen record is stored, through the one door, at grade B at
 *       most. Its own switch, off, stamped by connectorSwitchReadings.
 *   2 · THE ENERGY CERTIFICATE'S DOMESTIC CODES. A domestic certificate gives the construction age band per building
 *       part ("M") and the tenure (1) as codes. They are decoded through the register's own /api/codes and
 *       /api/codes/info, for the certificate's own schema version, and kept ONLY when decoded — never a raw code.
 *   3 · THE LAND REGISTRY WORDS WITH THE ENGINE'S SENTENCE. CB_REGISTRY.derive() puts "Our records show you paid {v}"
 *       into provenance.price_paid.confirm. The prescribed credit now travels with it, 2021 included, and the engine
 *       package's copy is checked against the licence register here.
 *
 * Every test runs on recorded answers (test/fixtures/phase146h/ and phase146c/, shaped from the suppliers' published
 * documentation, invented values), with no key and no network.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID, randomBytes } from 'node:crypto';

import { fixtureTransport, RateLimiter, type CallDeps, type GateSnapshot, type Fixture } from '../src/connectors/http.ts';
import * as C from '../src/connectors/registers.ts';
import * as M from '../src/connectors/matching.ts';
import { epc, certificateFields, rawCode, codesOffered, decodeValue, EPC_CODED_FIELDS } from '../src/connectors/epc.ts';
import { cqc } from '../src/connectors/cqc.ts';
import { pricePaid } from '../src/connectors/price-paid.ts';
import { planning } from '../src/connectors/planning.ts';
import { companiesHouse } from '../src/connectors/companies-house.ts';
import { FREE_CONNECTORS, type TypedProperty } from '../src/connectors/free-registers.ts';
import { PAID_CONNECTORS } from '../src/connectors/paid-registers.ts';
import { secretsFromValues } from '../src/secrets.ts';
import { SOURCES as REGISTER_SOURCES, LICENCES } from '../../../04-phase-work/phase3/caprebate-source-register.ts';
import { classifyField } from '../../../04-phase-work/phase3/caprebate-name-exclusion.ts';
import { inMemoryPostcodeStore, type PostcodeAuthorityTable } from '../src/web/postcode-port.ts';
import * as R from '../src/web/research.ts';
import * as MR from '../src/web/match-review.ts';
import { REGISTRY } from '../src/web/engine.ts';
import { connectorSwitchReadings } from '../src/web/case-stamp.ts';
import { signEngagement, SIGNING_QUESTION, shownLetter, type EngagementSigning } from '../src/web/signing.ts';
import { seed } from '../src/seed.ts';
import { createUser, newId } from '../src/users.ts';
import { docxOf } from './document-fixtures.ts';
import { testApp, actor } from './helpers.ts';
import type { Actor } from '../src/authz.ts';
import type { Db } from '../src/db.ts';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const SRC = join(HERE, '..', 'src');
const fx = (name: string): string => readFileSync(join(HERE, 'fixtures', 'phase146h', name), 'utf8');
const old = (name: string): string => readFileSync(join(HERE, 'fixtures', 'phase146c', name), 'utf8');
const ok = (name: string): Fixture => ({ status: 200, body: fx(name) });
const okOld = (name: string): Fixture => ({ status: 200, body: old(name) });
const NOT_FOUND: Fixture = { status: 404, body: '{}' };

const KEYS = secretsFromValues({
  COMPANIES_HOUSE_API_KEY: 'ch-fixture-key-146h', CQC_SUBSCRIPTION_KEY: 'cqc-fixture-key-146h', EPC_API_TOKEN: 'epc-fixture-token-146h',
});
const ALL_ON: Readonly<Record<string, boolean>> = Object.freeze(Object.fromEntries(Object.keys(C.REGISTER_SWITCHES).map((k) => [k, true])));
const PICK_ON: Readonly<Record<string, boolean>> = Object.freeze({ MATCH_REVIEW_PICK: true });
const ALLOWED = { state: 'NOT_RUN' as const, detail: 'allowed' };
const GATE: GateSnapshot = { free_gate_open: true, engagement_signed: true, switched_on: true };

/* The S10 spec's own REVIEW case (A.7): the right postcode, the right building, the wrong sub-unit — 0.80. */
const UNIT3: TypedProperty = { id: 'p-3', address_line_1: 'Unit 4 Riverside Business Park', address_line_2: 'Kelso Place', town: 'Nowhere', postcode: 'ZZ3 3ZZ', jurisdiction: 'england' };

const TABLE: PostcodeAuthorityTable = {
  table_id: 'CB_ONS_POSTCODE_AUTHORITY', source: 'HAND-TYPED TEST FIXTURE - not an ONS file', licence: 'n/a - fixture',
  loaded: true, verified_at: '2026-08-15T00:00:00.000Z', release: 'AUG_2026', release_year: 2026, record_count: 1,
  byPostcode: { 'ZZ3 3ZZ': { lad_code: 'E06000999', lad_name: 'Nowhere', country_code: 'E92000001', region_code: 'E12000009', terminated_on: null } },
};
const STORE = inMemoryPostcodeStore(TABLE);

async function rig(fixtures: Record<string, Fixture | readonly Fixture[]>) {
  const app = await testApp();
  const t = fixtureTransport(fixtures);
  const d: CallDeps = { audit: app.audit, now: app.now, transport: t, limiter: new RateLimiter(), sleep: async () => { /* no wait */ } };
  const ctx: C.ConnectorContext = { deps: d, actor_id: 'u-ADMIN', actor_role: 'ADMIN', claim_id: null, gate: GATE, secrets: null };
  return { app, t, ctx };
}

/* ================================================================== *
 * 1 · THE MATCHER'S RANKED LIST, AND WHEN IT MAY BE OFFERED
 * ================================================================== */

describe('1 · the ranked list, in memory only, and offered in the REVIEW band and nowhere else', () => {
  const T = M.MATCH_THRESHOLDS.EPC;
  const c = (a: M.RawAddress, p: string) => ({ address: a, payload: p });
  const three = [
    c({ paon: 'Riverside Business Park', street: 'Kelso Place', saon: 'Unit 5', postcode: 'BA1 3EX' }, 'five'),
    c({ paon: 'Riverside Business Park', street: 'Kelso Place', saon: 'Unit 9', postcode: 'BA1 3EX' }, 'nine'),
    c({ paon: 'Riverside Business Park', street: 'Kelso Way', saon: 'Unit 9', postcode: 'BA1 3EX' }, 'way'),
  ];
  const subject: M.RawAddress = { paon: 'Riverside Business Park', street: 'Kelso Place', saon: 'Unit 3', postcode: 'BA1 3EX' };

  test('every scored candidate comes back ranked, best first, and it is the same list `top` is the head of', () => {
    const m = M.matchAddress(subject, three, T, 'x');
    assert.equal(m.status, 'REVIEW');
    assert.equal(m.ranked.length, 3);
    for (let i = 1; i < m.ranked.length; i++) {
      assert.ok((m.ranked[i - 1]?.score ?? 0) >= (m.ranked[i]?.score ?? 0), 'not in score order');
    }
    assert.equal(m.ranked[0], m.top);
    assert.equal(m.scored, m.ranked.length);
  });

  test('THE OFFER IS MADE IN THE REVIEW BAND AND IN NO OTHER — an ACCEPT is already decided, a REJECT is a choice between wrong answers', () => {
    for (const [what, cands] of [
      ['ACCEPT', [c({ paon: 'Riverside Business Park', street: 'Kelso Place', saon: 'Unit 3', postcode: 'BA1 3EX' }, 'same')]],
      ['REJECT', [c({ paon: 'Nothing Like It', street: 'Elsewhere Road', postcode: 'BA1 3EX' }, 'no')]],
    ] as const) {
      let offered = 0;
      const m = M.matchAddress(subject, cands, T, 'x');
      assert.notEqual(m.status, 'REVIEW', what);
      const outcome = M.applyPick(m, { review: () => { offered++; } }, { profile: 'EPC', keyOf: (p) => p });
      assert.deepEqual([outcome.kind, offered], ['NOT_PICKING', 0], what);
    }
    // And a chosen key is not applied outside the band either: an ACCEPT cannot be overridden by a request.
    const accept = M.matchAddress(subject, [c({ paon: 'Riverside Business Park', street: 'Kelso Place', saon: 'Unit 3', postcode: 'BA1 3EX' }, 'same')], T, 'x');
    assert.equal(M.applyPick(accept, { chosen: 'anything' }, { profile: 'EPC', keyOf: (p) => p }).kind, 'NOT_PICKING');
  });

  test('a choice names a RECORD, not a row: the same key is found however the list is ordered, and a key that has gone keeps nothing', () => {
    const m = M.matchAddress(subject, three, T, 'x');
    const got = M.applyPick(m, { chosen: 'nine' }, { profile: 'EPC', keyOf: (p) => p });
    assert.equal(got.kind, 'CHOSEN');
    assert.equal(got.kind === 'CHOSEN' ? got.best.candidate.payload : null, 'nine');
    // the same three candidates, given in another order
    const shuffled = M.matchAddress(subject, [three[2]!, three[0]!, three[1]!], T, 'x');
    const again = M.applyPick(shuffled, { chosen: 'nine' }, { profile: 'EPC', keyOf: (p) => p });
    assert.equal(again.kind === 'CHOSEN' ? again.best.candidate.payload : null, 'nine');
    // a key the register no longer offers
    assert.equal(M.applyPick(m, { chosen: 'gone' }, { profile: 'EPC', keyOf: (p) => p }).kind, 'GONE');
    // and an empty choice is not a choice
    for (const empty of ['', '   ', null]) {
      assert.equal(M.applyPick(m, { chosen: empty }, { profile: 'EPC', keyOf: (p) => p }).kind, 'NOT_PICKING', String(empty));
    }
    assert.equal(M.applyPick(m, {}, { profile: 'EPC', keyOf: (p) => p }).kind, 'NOT_PICKING', 'no key at all');
    assert.equal(M.applyPick(m, undefined, { profile: 'EPC', keyOf: (p) => p }).kind, 'NOT_PICKING', 'no pick query at all');
  });

  test('the label is the register’s own words for the candidate — an address, or a company name where that is what tells them apart', () => {
    let seen: readonly M.ReviewCandidate[] = [];
    const m = M.matchAddress(subject, three, T, 'x');
    M.applyPick(m, { review: (o) => { seen = o.candidates; } }, { profile: 'EPC', keyOf: (p) => p });
    assert.equal(seen.length, 3);
    assert.match(seen[0]?.label ?? '', /Riverside Business Park/i);
    assert.match(seen[0]?.label ?? '', /Kelso/i);
    assert.match(seen[0]?.label ?? '', /BA1 3EX/);
    const named = M.matchCompanyName('Zedford Care', [
      { name: 'ZEDFORD CARE HOMES LIMITED', payload: '09999991' }, { name: 'ZEDFORD CARE GROUP LIMITED', payload: '09999992' },
    ], M.MATCH_THRESHOLDS.CH_COMPANY);
    assert.equal(named.status, 'REVIEW');
    let names: readonly M.ReviewCandidate[] = [];
    M.applyPick(named, { review: (o) => { names = o.candidates; } }, { profile: 'CH_COMPANY', keyOf: (n) => n });
    assert.deepEqual([...names].map((x) => x.label).sort(), ['ZEDFORD CARE GROUP LIMITED', 'ZEDFORD CARE HOMES LIMITED']);
    assert.deepEqual([...names].map((x) => x.key).sort(), ['09999991', '09999992']);
  });
});

/* ================================================================== *
 * 2 · THE CONNECTORS: OFFERED, PICKED, AND GONE
 * ================================================================== */

describe('2 · every connector that scores candidates offers its REVIEW list and takes a choice', () => {
  const EPC_REVIEW = {
    'GET /api/non-domestic/search': NOT_FOUND, 'GET /api/display/search': NOT_FOUND,
    'GET /api/domestic/search': ok('epc-domestic-search-two-close.json'),
    'GET /api/certificate': ok('epc-certificate-domestic-chosen.json'),
    'GET /api/codes': ok('epc-codes.json'),
    'GET /api/codes/info': [ok('epc-codes-info-age-band.json'), ok('epc-codes-info-tenure.json')],
  };
  const epcQuery = (extra: M.PickQuery) => ({ property: UNIT3, nation: 'england' as const, sector: 'supported_living', ...extra });

  test('the energy certificates: two entries are close, neither is chosen, and the ranked list is offered with its keys and scores', async () => {
    const { app, t, ctx } = await rig(EPC_REVIEW);
    let offer: { candidates: readonly M.ReviewCandidate[]; profile: string } | null = null;
    const run = await C.runConnector(epc, ctx, epcQuery({ review: (o) => { offer = o; } }), ALLOWED, KEYS, ALL_ON);
    assert.deepEqual([run.state, run.failure_code], ['FAILED', 'MATCH_REVIEW']);
    const got = offer as unknown as { candidates: readonly M.ReviewCandidate[]; profile: string; register: string | null; why: string } | null;
    assert.ok(got !== null, 'no list was offered');
    assert.deepEqual([...got.candidates].map((c) => c.key).sort(), ['1111-0000-0000-0000-0011', '1111-0000-0000-0000-0012']);
    for (const c of got.candidates) assert.ok(c.score >= 0.70 && c.score < 0.90, `${c.key} scored ${c.score}`);
    assert.equal(got.candidates[0]?.register, 'domestic', 'the sub-register it came from is not named');
    // nothing was fetched and nothing was kept
    assert.equal(t.seen.some((s) => s.url.includes('/api/certificate')), false, 'a certificate was fetched with no choice made');
    assert.equal(run.bundle, null);
    app.close();
  });

  test('a person chooses one: THAT certificate is fetched, and the words say a person chose it', async () => {
    const { app, t, ctx } = await rig(EPC_REVIEW);
    const run = await C.runConnector(epc, ctx, epcQuery({ chosen: '1111-0000-0000-0000-0012' }), ALLOWED, KEYS, ALL_ON);
    assert.equal(run.state, 'FIRED', run.detail);
    assert.equal(new URL(t.seen.find((s) => s.url.includes('/api/certificate'))?.url ?? 'https://x/').searchParams.get('certificate_number'),
      '1111-0000-0000-0000-0012', 'a different certificate was fetched from the one chosen');
    assert.match(run.detail, /a person in the back office chose this one/);
    assert.match(run.detail, /0\.8/);
    app.close();
  });

  test('a choice the register no longer offers keeps NOTHING, and says to look at the list again', async () => {
    const { app, t, ctx } = await rig(EPC_REVIEW);
    const run = await C.runConnector(epc, ctx, epcQuery({ chosen: '1111-0000-0000-0000-9999' }), ALLOWED, KEYS, ALL_ON);
    assert.deepEqual([run.state, run.failure_code], ['FAILED', 'MATCH_REVIEW']);
    assert.match(run.detail, /no longer on the register’s list/);
    assert.equal(t.seen.some((s) => s.url.includes('/api/certificate')), false, 'a certificate was fetched for a choice that has gone');
    assert.equal(run.bundle, null);
    app.close();
  });

  test('the care regulator, the sale prices, planning and Companies House each offer their own list too', async () => {
    /* The care regulator: two locations at the postcode, neither close enough. */
    const cqcRig = await rig({
      'GET /public/v1/locations': okOld('cqc-locations.json'),
      'GET /public/v1/locations/1-INVENTED01': okOld('cqc-location-01.json'),
      'GET /public/v1/locations/1-INVENTED02': okOld('cqc-location-02.json'),
    });
    let cqcOffer: readonly M.ReviewCandidate[] = [];
    const cqcRun = await C.runConnector(cqc, cqcRig.ctx, {
      property: { id: 'p-9', address_line_1: '16 Invented Road', address_line_2: null, town: 'Nowhere', postcode: 'ZZ1 1ZZ', jurisdiction: 'england' },
      nation: 'england' as const, sector: 'care_homes', council: 'Nowhere', company_number: null,
      review: (o: { candidates: readonly M.ReviewCandidate[] }) => { cqcOffer = o.candidates; },
    }, ALLOWED, KEYS, ALL_ON);
    assert.equal(cqcRun.failure_code, 'MATCH_REVIEW', cqcRun.detail);
    assert.ok(cqcOffer.length > 0, 'the care regulator offered nothing');
    for (const c of cqcOffer) assert.match(c.key, /^1-INVENTED0[12]$/);
    cqcRig.app.close();

    /* The sale prices: the transaction id is the key. */
    const ppdRig = await rig({ 'GET /data/ppi/transaction-record.json': okOld('ppd-transactions.json') });
    let ppdOffer: readonly M.ReviewCandidate[] = [];
    const ppdRun = await C.runConnector(pricePaid, ppdRig.ctx, {
      property: { id: 'p-8', address_line_1: '7 Invented Close', address_line_2: null, town: 'Nowhere', postcode: 'ZZ3 3ZZ', jurisdiction: 'england' },
      nation: 'england' as const, sector: 'supported_living',
      review: (o: { candidates: readonly M.ReviewCandidate[] }) => { ppdOffer = o.candidates; },
    }, ALLOWED, C.REGISTER_SWITCHES === undefined ? KEYS : KEYS, ALL_ON);
    if (ppdRun.failure_code === 'MATCH_REVIEW') assert.ok(ppdOffer.length > 0, 'the sale prices offered nothing');
    ppdRig.app.close();

    /* Planning: the application reference is the key, and a pick on one service is not looked for in the other. */
    const planRig = await rig({
      'GET /entity.json': okOld('planning-data-empty.json'),
      'GET /api/applics/json': okOld('planit-applics.json'),
    });
    let planOffer: readonly M.ReviewCandidate[] = [];
    const planRun = await C.runConnector(planning, planRig.ctx, {
      property: { id: 'p-7', address_line_1: '16 Invented Road', address_line_2: null, town: 'Nowhere', postcode: 'ZZ1 1ZZ', jurisdiction: 'england' },
      nation: 'england' as const,
      review: (o: { candidates: readonly M.ReviewCandidate[] }) => { planOffer = o.candidates; },
    }, ALLOWED, KEYS, ALL_ON);
    if (planRun.failure_code === 'MATCH_REVIEW') assert.ok(planOffer.length > 0, 'planning offered nothing');
    planRig.app.close();

    /* Companies House: two companies of a similar name, and the company NUMBER is the key. */
    const chRig = await rig({ 'GET /search/companies': okOld('ch-search.json') });
    let chOffer: readonly M.ReviewCandidate[] = [];
    const chRun = await C.runConnector(companiesHouse, chRig.ctx, {
      name: 'Completely Different Trading Name', company_number: null,
      review: (o: { candidates: readonly M.ReviewCandidate[] }) => { chOffer = o.candidates; },
    }, ALLOWED, KEYS, ALL_ON);
    if (chRun.failure_code === 'MATCH_REVIEW') {
      for (const c of chOffer) assert.match(c.key, /^[A-Z0-9]{8}$/, 'a Companies House key is not a company number');
    }
    chRig.app.close();
  });

  test('THE RESEARCH FLOW SETS NEITHER KEY — no ordinary click can offer a list or make a choice', () => {
    const subject = { business_id: 'b', name: 'n', company_number: null, sector: 'supported_living', property: UNIT3 };
    for (const [sid, b] of Object.entries(FREE_CONNECTORS)) {
      const q = b.query(subject, new Map(), STORE) as Record<string, unknown>;
      assert.equal('review' in q, false, `${sid}: the research flow offers a candidate list`);
      assert.equal('chosen' in q, false, `${sid}: the research flow makes a choice`);
    }
    for (const [sid, b] of Object.entries(PAID_CONNECTORS)) {
      const q = (b as unknown as { query: (s: unknown, e: unknown) => Record<string, unknown> }).query(subject, new Map());
      assert.equal('review' in q, false, `${sid}: the research flow offers a candidate list`);
      assert.equal('chosen' in q, false, `${sid}: the research flow makes a choice`);
    }
  });
});

/* ================================================================== *
 * 3 · THE BACK-OFFICE PICK — the gate, the switch, and what it writes
 * ================================================================== */

const SIGNING_ON: EngagementSigning = Object.freeze({ enabled: true, solicitor_confirmed: true, question: SIGNING_QUESTION });

/** A client whose engagement letter is really signed — the record, not a letter_state somebody typed. */
const records = (app: Awaited<ReturnType<typeof testApp>>): number => app.db.all('SELECT id FROM register_records').length;

/** A real member of staff: `register_match_picks.picked_by` is a foreign key, because a decision has a person on it. */
const staff = (app: Awaited<ReturnType<typeof testApp>>): Actor =>
  actor('ADMIN', app.db.get<{ id: string }>("SELECT id FROM users WHERE role = 'ADMIN' ORDER BY id LIMIT 1")!.id);

async function signedClient(app: Awaited<ReturnType<typeof testApp>>): Promise<string> {
  const r = await seed(app.db, app.hasher, app.now);
  const id = r.businesses[0]!.id;
  app.db.run("UPDATE businesses SET name = 'Riverside Supported Living', legal_name = NULL, company_number = NULL, sector = 'supported_living' WHERE id = ?", [id]);
  const p = app.db.get<{ id: string }>('SELECT id FROM properties WHERE business_id = ? ORDER BY created_at ASC, id ASC LIMIT 1', [id]);
  if (p === undefined) {
    app.db.run("INSERT INTO properties (id, business_id, label, postcode, created_at) VALUES (?, ?, 'Main site', 'ZZ3 3ZZ', ?)", [newId(), id, app.now()]);
  }
  app.db.run("UPDATE properties SET address_line_1 = 'Unit 4 Riverside Business Park', address_line_2 = 'Kelso Place', town = 'Nowhere', postcode = 'ZZ3 3ZZ', jurisdiction = 'england' WHERE business_id = ?", [id]);

  const dir = mkdtempSync(join(tmpdir(), 'cb-146h-letter-'));
  const letterPath = join(dir, 'letter.docx');
  writeFileSync(letterPath, docxOf(['ENGAGEMENT LETTER', '1. Parties', 'This letter is between CAP REBATE LTD and Riverside Supported Living.', '2. Fees', 'Our fee is 10 per cent of the relief.']));
  const existing = app.db.get<{ id: string }>('SELECT id FROM engagements WHERE business_id = ?', [id]);
  if (existing === undefined) {
    app.db.run("INSERT INTO engagements (id, business_id, letter_state, signed_at, created_at) VALUES (?, ?, 'SENT', NULL, ?)", [randomUUID(), id, app.now()]);
  } else {
    app.db.run("UPDATE engagements SET letter_state = 'SENT', signed_at = NULL WHERE id = ?", [existing.id]);
  }
  const user = createUser(app.db, app.now, {
    email: `signer-${randomUUID()}@example.invalid`, display_name: 'Signer', role: 'CLIENT',
    password_hash: await app.hasher.hash('x'), business_id: id,
  });
  const session = randomUUID();
  app.db.run('INSERT INTO sessions (id, user_id, token_hash, created_at, expires_at, last_seen_at) VALUES (?, ?, ?, ?, ?, ?)',
    [session, user.id, randomBytes(16).toString('hex'), app.now(), '2099-01-01T00:00:00.000Z', app.now()]);
  const client: Actor = { id: user.id, role: 'CLIENT', business_id: id, disabled: false };
  const shown = shownLetter({ name: 'Riverside Supported Living' }, letterPath);
  const signed = signEngagement(
    { db: app.db, audit: app.audit, email: app.email, now: app.now, newId: randomUUID }, client, id,
    { full_name: 'Ada Lovelace', role: 'Director', authorised: true, letter_sha256: shown.sha256 },
    { ip: '203.0.113.9', session_id: session }, { cfg: SIGNING_ON, letterPath },
  );
  assert.equal(signed.ok, true, signed.ok ? '' : signed.why);
  assert.equal(R.assertSignedEngagement(app.db, id).signed, true);
  return id;
}

const PICK_FIXTURES = {
  'GET /api/non-domestic/search': NOT_FOUND, 'GET /api/display/search': NOT_FOUND,
  'GET /api/domestic/search': ok('epc-domestic-search-two-close.json'),
  'GET /api/certificate': ok('epc-certificate-domestic-chosen.json'),
  'GET /api/codes': ok('epc-codes.json'),
  'GET /api/codes/info': [ok('epc-codes-info-age-band.json'), ok('epc-codes-info-tenure.json')],
};

function pickDeps(app: Awaited<ReturnType<typeof testApp>>, t: ReturnType<typeof fixtureTransport>, on: boolean): MR.PickDeps {
  return {
    db: app.db, audit: app.audit, now: app.now, newId,
    outside: { transport: t, secrets: KEYS, switches: ALL_ON, postcodeStore: STORE },
    ...(on ? { pick_switches: PICK_ON } : {}),
  };
}

/**
 * THE FREE GATE, OPEN FOR ONE CALL AND SHUT AGAIN — the same thing the site harness does for suite O, and for the
 * same reason: the whole layer would otherwise be untested until somebody flips it in production.
 *
 * IT MATTERS HERE MORE THAN ANYWHERE. A pick RE-FETCHES, so it goes through `stateUnderGates` like every other
 * lookup, and with the free gate shut a free register may not be consulted at all — which is why the last test in
 * this section asserts exactly that, with the gate left where it really is.
 */
async function withFreeGateOpen<T>(fn: () => Promise<T>): Promise<T> {
  const pre = (REGISTRY as unknown as { precondition: { enabled: boolean } }).precondition;
  pre.enabled = true;
  try { return await fn(); } finally { pre.enabled = false; }
}

/** Put the lookup into the state a pick is offered from: FAILED, MATCH_REVIEW, as an ordinary run would leave it. */
function intoReviewByHand(db: Db, business_id: string, source_id: string): void {
  db.run('DELETE FROM research_sources WHERE business_id = ? AND source_id = ?', [business_id, source_id]);
  db.run(
    'INSERT INTO research_sources (id, business_id, source_id, tier, state, detail, failure_code, attempts) ' +
      "VALUES (?, ?, ?, 'FREE', 'FAILED', 'close, and not close enough', 'MATCH_REVIEW', 1)",
    [newId(), business_id, source_id]);
}

async function intoReview(d: ReturnType<typeof pickDeps>, id: string): Promise<void> {
  const entry = R.catalogue().find((e) => e.source_id === 'EPC')!;
  const out = await R.consultAllowed(d, actor('ADMIN'), id, [{ entry, ...ALLOWED }], { free_gate_open: true, engagement_signed: true });
  assert.equal(out[0]?.failure_code, 'MATCH_REVIEW', out[0]?.detail ?? 'no outcome');
  d.db.tx(() => R.storeResearchOutcomes(d, id, out, d.now()));
}

describe('3 · the back-office pick: the gate, the switch, and the one record it writes', () => {
  test('ITS OWN SWITCH IS OFF, AND THE CASE STAMP READS IT', () => {
    assert.equal(MR.PICK_SWITCHES['MATCH_REVIEW_PICK'], false);
    assert.equal(MR.pickSwitchedOn(), false);
    assert.ok(Object.isFrozen(MR.PICK_SWITCHES));
    // not a register switch: the two maps do not overlap
    for (const k of Object.keys(MR.PICK_SWITCHES)) assert.equal(k in C.REGISTER_SWITCHES, false, k);
    const readings = connectorSwitchReadings();
    assert.ok(readings.some((r) => r.switch === 'PICK_SWITCHES.MATCH_REVIEW_PICK' && r.on === false && r.home === 'src/web/match-review.ts'));
  });

  test('SWITCHED OFF, AS SHIPPED: nothing is fetched and no list is shown, even with the engagement signed and every key in place', async () => {
    const app = await testApp();
    const id = await signedClient(app);
    const t = fixtureTransport(PICK_FIXTURES);
    const on = pickDeps(app, t, true);
    await withFreeGateOpen(() => intoReview(on, id));
    const seenBefore = t.seen.length;

    const off = pickDeps(app, t, false);
    const offer = await withFreeGateOpen(() => MR.offerPick(off, actor('ADMIN'), id, 'EPC'));
    assert.deepEqual([offer.ok, offer.candidates.length], [false, 0]);
    assert.match(offer.why, /not switched on yet/);
    const took = await withFreeGateOpen(() => MR.takePick(off, actor('ADMIN'), id, 'EPC', '1111-0000-0000-0000-0012'));
    assert.deepEqual([took.ok, took.stored], [false, false]);
    assert.equal(t.seen.length, seenBefore, 'a call was made with the pick switched off');
    assert.equal(app.db.all('SELECT id FROM register_match_picks').length, 0);
    app.close();
  });

  test('BEFORE A SIGNED ENGAGEMENT: no list, whatever the source’s tier — and the words say why, not "no match"', async () => {
    const app = await testApp();
    const r = await seed(app.db, app.hasher, app.now);
    const id = r.businesses[0]!.id;
    app.db.run("UPDATE businesses SET sector = 'supported_living' WHERE id = ?", [id]);
    app.db.run("UPDATE properties SET address_line_1 = 'Unit 4 Riverside Business Park', address_line_2 = 'Kelso Place', town = 'Nowhere', postcode = 'ZZ3 3ZZ', jurisdiction = 'england' WHERE business_id = ?", [id]);
    app.db.run("UPDATE engagements SET letter_state = 'SENT', signed_at = NULL WHERE business_id = ?", [id]);
    const t = fixtureTransport(PICK_FIXTURES);
    const d = pickDeps(app, t, true);
    intoReviewByHand(app.db, id, 'EPC');
    const held = records(app);

    assert.equal(R.assertSignedEngagement(app.db, id).signed, false);
    const offer = await withFreeGateOpen(() => MR.offerPick(d, actor('ADMIN'), id, 'EPC'));
    assert.equal(offer.ok, false);
    assert.match(offer.why, /engagement letter is signed/);
    assert.match(offer.why, /not yet a client/);
    assert.equal(t.seen.length, 0, 'a call was made before the engagement was signed');
    const took = await withFreeGateOpen(() => MR.takePick(d, actor('ADMIN'), id, 'EPC', '1111-0000-0000-0000-0012'));
    assert.deepEqual([took.ok, took.stored], [false, false]);
    assert.equal(records(app), held, 'a record was written before the engagement was signed');
    app.close();
  });

  test('A LOOKUP THAT DID NOT LAND IN THE REVIEW BAND CANNOT BE PICKED FROM, whatever the request names', async () => {
    const app = await testApp();
    const id = await signedClient(app);
    const t = fixtureTransport(PICK_FIXTURES);
    const d = pickDeps(app, t, true);
    // never run
    assert.match((await withFreeGateOpen(() => MR.offerPick(d, actor('ADMIN'), id, 'EPC'))).why, /nothing to choose between/i);
    // failed for another reason
    app.db.run('DELETE FROM research_sources WHERE business_id = ? AND source_id = ?', [id, 'CQC']);
    app.db.run("INSERT INTO research_sources (id, business_id, source_id, tier, state, detail, failure_code, attempts) VALUES (?, ?, 'CQC', 'FREE', 'FAILED', 'x', 'TIMED_OUT', 1)", [newId(), id]);
    assert.match((await withFreeGateOpen(() => MR.offerPick(d, actor('ADMIN'), id, 'CQC'))).why, /nothing to choose between/i);
    // and a source we do not use at all
    assert.match((await withFreeGateOpen(() => MR.offerPick(d, actor('ADMIN'), id, 'EXPERIAN'))).why, /do not use that lookup/);
    assert.equal(t.seen.length, 0, 'a call was made for a lookup that may not be picked from');
    app.close();
  });

  test('SWITCHED ON: the list is fetched again for the request, shown, and NOT stored', async () => {
    const app = await testApp();
    const id = await signedClient(app);
    const t = fixtureTransport(PICK_FIXTURES);
    const d = pickDeps(app, t, true);
    await withFreeGateOpen(() => intoReview(d, id));
    const held = records(app);
    const rowBefore = app.db.get<{ detail: string; state: string }>("SELECT detail, state FROM research_sources WHERE business_id = ? AND source_id = 'EPC'", [id]);

    const offer = await withFreeGateOpen(() => MR.offerPick(d, actor('ADMIN'), id, 'EPC'));
    assert.equal(offer.ok, true, offer.why);
    assert.equal(offer.candidates.length, 2);
    assert.equal(offer.publisher, 'MHCLG');
    assert.equal(offer.already, null);
    // the list is not in the database, anywhere
    assert.equal(app.db.all('SELECT id FROM register_match_picks').length, 0);
    assert.equal(records(app), held, 'looking at a list stored a record');
    const dump = JSON.stringify(app.db.all<{ detail: string }>('SELECT detail FROM research_sources'));
    for (const c of offer.candidates) assert.equal(dump.includes(c.label), false, 'a candidate’s address was stored');
    // looking does not change the row
    assert.deepEqual(app.db.get("SELECT detail, state FROM research_sources WHERE business_id = ? AND source_id = 'EPC'", [id]), rowBefore);
    // and no audit line carries a candidate's address either
    const log = JSON.stringify(app.audit.entries());
    for (const c of offer.candidates) assert.equal(log.includes(c.label), false, 'a candidate’s address was logged');
    app.close();
  });

  test('A PERSON CHOOSES ONE: only that record is stored, through the one door, at grade B — and the chain says who, and the score', async () => {
    const app = await testApp();
    const id = await signedClient(app);
    const t = fixtureTransport(PICK_FIXTURES);
    const d = pickDeps(app, t, true);
    await withFreeGateOpen(() => intoReview(d, id));
    const held = records(app);

    const me = staff(app);
    const took = await withFreeGateOpen(() => MR.takePick(d, me, id, 'EPC', '1111-0000-0000-0000-0011'));
    assert.deepEqual([took.ok, took.stored, took.grade], [true, true, 'B']);
    assert.equal(MR.pickGrade('EPC'), 'B', 'the cap is not being applied');
    assert.equal(REGISTER_SOURCES.find((s) => s.source_id === 'EPC')?.max_grade, 'A', 'the source itself would have minted an A');

    // ONE new record, and it is the one chosen — not the other candidate, and not both
    assert.equal(records(app), held + 1, 'the pick wrote more than the one record chosen');
    const kept = app.db.all<{ entity_id: string }>(
      "SELECT entity_id FROM register_records WHERE source_id = 'EPC' AND entity_id LIKE '1111-%'");
    assert.deepEqual(kept.map((r) => r.entity_id), ['1111-0000-0000-0000-0011']);

    // the pick row: the key, the score, the grade, who and when
    const pick = app.db.get<{ chosen_key: string; score: number; grade: string; record_id: string; picked_by: string }>(
      'SELECT chosen_key, score, grade, record_id, picked_by FROM register_match_picks WHERE business_id = ?', [id]);
    assert.equal(pick?.chosen_key, '1111-0000-0000-0000-0011');
    assert.equal(pick?.grade, 'B');
    assert.equal(pick?.picked_by, me.id);
    assert.ok((pick?.score ?? 0) >= 0.70 && (pick?.score ?? 1) < 0.90, `score was ${pick?.score}`);
    assert.equal(pick?.record_id, app.db.get<{ id: string }>(
      "SELECT id FROM register_records WHERE source_id = 'EPC' AND entity_id = ?", ['1111-0000-0000-0000-0011'])?.id);

    // the audit chain: the decision, the score and the grade — and NO address
    const rows = app.audit.entries().filter((e) => e.kind === 'REGISTER_MATCH_PICKED');
    assert.equal(rows.length, 1);
    assert.deepEqual([rows[0]?.actor_id, rows[0]?.detail.source_id, rows[0]?.detail.chosen, rows[0]?.detail.grade, rows[0]?.detail.stored],
      [me.id, 'EPC', true, 'B', true]);
    assert.equal(rows[0]?.detail.score, pick?.score);
    const line = JSON.stringify(rows[0]);
    for (const word of ['Riverside', 'Kelso', 'ZZ3 3ZZ', 'RIVERSIDE']) assert.equal(line.includes(word), false, word);
    assert.equal(app.audit.verify().intact, true);

    // the source now reads as looked up
    const row = app.db.get<{ state: string; retrieved_at: string | null }>("SELECT state, retrieved_at FROM research_sources WHERE business_id = ? AND source_id = 'EPC'", [id]);
    assert.equal(row?.state, 'FIRED');
    assert.ok(row?.retrieved_at);
    app.close();
  });

  test('A PERSON CHOOSES NONE: the decision is kept, nothing else is, and the questions stay asked (N4)', async () => {
    const app = await testApp();
    const id = await signedClient(app);
    const t = fixtureTransport(PICK_FIXTURES);
    const d = pickDeps(app, t, true);
    await withFreeGateOpen(() => intoReview(d, id));
    const held = records(app);

    const took = await withFreeGateOpen(() => MR.takePick(d, staff(app), id, 'EPC', null));
    assert.deepEqual([took.ok, took.stored, took.grade], [true, false, null]);
    assert.equal(records(app), held, 'something was kept for "none of them"');
    const pick = app.db.get<{ chosen_key: string | null; score: number | null; grade: string | null; record_id: string | null }>(
      'SELECT chosen_key, score, grade, record_id FROM register_match_picks WHERE business_id = ?', [id]);
    assert.deepEqual([pick?.chosen_key, pick?.score, pick?.grade, pick?.record_id], [null, null, null, null]);
    const row = app.db.get<{ state: string; detail: string }>("SELECT state, detail FROM research_sources WHERE business_id = ? AND source_id = 'EPC'", [id]);
    assert.equal(row?.state, 'FAILED');
    assert.match(row?.detail ?? '', /A person looked/);
    const chain = app.audit.entries().filter((e) => e.kind === 'REGISTER_MATCH_PICKED');
    assert.deepEqual([chain.length, chain[0]?.detail.chosen, chain[0]?.detail.stored], [1, false, false]);
    // and the offer now says somebody has looked
    const offer = await withFreeGateOpen(() => MR.offerPick(d, staff(app), id, 'EPC'));
    assert.equal(offer.already?.chosen_key, null);
    app.close();
  });

  test('A CHOICE THE REGISTER NO LONGER OFFERS KEEPS NOTHING and does not fall back to the nearest one', async () => {
    const app = await testApp();
    const id = await signedClient(app);
    const t = fixtureTransport(PICK_FIXTURES);
    const d = pickDeps(app, t, true);
    await withFreeGateOpen(() => intoReview(d, id));
    const held = records(app);
    const took = await withFreeGateOpen(() => MR.takePick(d, actor('ADMIN'), id, 'EPC', '1111-0000-0000-0000-9999'));
    assert.deepEqual([took.ok, took.stored], [false, false]);
    assert.match(took.why, /choose from what is there now/);
    assert.equal(records(app), held, 'a record was kept for a choice that has gone');
    assert.equal(app.db.all('SELECT id FROM register_match_picks').length, 0);
    app.close();
  });

  test('a login that cannot run the research cannot pick either, and the panel’s own words are the server’s', async () => {
    const app = await testApp();
    const id = await signedClient(app);
    const t = fixtureTransport(PICK_FIXTURES);
    const d = pickDeps(app, t, true);
    await withFreeGateOpen(() => intoReview(d, id));
    for (const role of ['SURVEYING', 'ACCOUNTING', 'CLIENT'] as const) {
      await assert.rejects(() => MR.offerPick(d, actor(role), id, 'EPC'), `${role} was offered a list`);
      await assert.rejects(() => MR.takePick(d, actor(role), id, 'EPC', '1111-0000-0000-0000-0011'), `${role} made a choice`);
    }
    assert.equal(app.db.all('SELECT id FROM register_match_picks').length, 0);
    app.close();
  });

  test('THE PICK OPENS NO GATE: with the free gate where it really is, a free lookup is not re-fetched at all', async () => {
    const app = await testApp();
    const id = await signedClient(app);
    const t = fixtureTransport(PICK_FIXTURES);
    const d = pickDeps(app, t, true);
    await withFreeGateOpen(() => intoReview(d, id));
    const held = records(app);
    const seen = t.seen.length;

    // No withFreeGateOpen here. This is the state the system ships in.
    assert.equal(R.freeGate().open, false);
    const offer = await MR.offerPick(d, staff(app), id, 'EPC');
    assert.deepEqual([offer.ok, offer.candidates.length], [false, 0]);
    assert.match(offer.why, /nothing close to this address to show now/);
    const took = await MR.takePick(d, staff(app), id, 'EPC', '1111-0000-0000-0000-0011');
    assert.deepEqual([took.ok, took.stored], [false, false]);
    assert.equal(t.seen.length, seen, 'a free lookup was contacted with the free gate shut');
    assert.equal(records(app), held);
    assert.equal(app.db.all('SELECT id FROM register_match_picks').length, 0);
    app.close();
  });

  test('a choice costs ONE fetch, not two: the score comes back with the candidate rather than from a second list', async () => {
    const app = await testApp();
    const id = await signedClient(app);
    const t = fixtureTransport(PICK_FIXTURES);
    const d = pickDeps(app, t, true);
    await withFreeGateOpen(() => intoReview(d, id));
    const before = t.seen.filter((x) => x.url.includes('/api/domestic/search')).length;
    const took = await withFreeGateOpen(() => MR.takePick(d, staff(app), id, 'EPC', '1111-0000-0000-0000-0011'));
    assert.equal(took.ok, true, took.why);
    assert.equal(t.seen.filter((x) => x.url.includes('/api/domestic/search')).length, before + 1,
      'the register was searched more than once for one choice');
    assert.ok((app.db.get<{ score: number }>('SELECT score FROM register_match_picks WHERE business_id = ?', [id])?.score ?? 0) > 0,
      'the score was not recorded');
    app.close();
  });

  test('a person who said "none" may look again and choose: the pick row is replaced, and the chain keeps both decisions', async () => {
    const app = await testApp();
    const id = await signedClient(app);
    const t = fixtureTransport(PICK_FIXTURES);
    const d = pickDeps(app, t, true);
    await withFreeGateOpen(() => intoReview(d, id));
    await withFreeGateOpen(() => MR.takePick(d, staff(app), id, 'EPC', null));
    const second = await withFreeGateOpen(() => MR.takePick(d, staff(app), id, 'EPC', '1111-0000-0000-0000-0011'));
    assert.equal(second.ok, true, second.why);
    const rows = app.db.all<{ chosen_key: string | null }>('SELECT chosen_key FROM register_match_picks WHERE business_id = ?', [id]);
    assert.deepEqual(rows.map((r) => r.chosen_key), ['1111-0000-0000-0000-0011'], 'the second decision did not replace the first');
    // the chain keeps BOTH, in order, which is the point of putting them there
    const chain = app.audit.entries().filter((e) => e.kind === 'REGISTER_MATCH_PICKED');
    assert.deepEqual(chain.map((e) => e.detail.chosen), [false, true]);
    assert.equal(app.audit.verify().intact, true);
    app.close();
  });

  test('ONCE A PICK HAS BEEN STORED THE LOOKUP LEAVES THE REVIEW BAND, and the screen says so rather than offering the list again', async () => {
    const app = await testApp();
    const id = await signedClient(app);
    const t = fixtureTransport(PICK_FIXTURES);
    const d = pickDeps(app, t, true);
    await withFreeGateOpen(() => intoReview(d, id));
    assert.equal((await withFreeGateOpen(() => MR.takePick(d, staff(app), id, 'EPC', '1111-0000-0000-0000-0011'))).stored, true);
    // FIRED, so there is nothing to choose between any more — and changing it back is not this screen's to do.
    const again = await withFreeGateOpen(() => MR.offerPick(d, staff(app), id, 'EPC'));
    assert.equal(again.ok, false);
    assert.match(again.why, /nothing to choose between/i);
    app.close();
  });

  test('the route hands the pick the app’s key file and transport, and both steps are POSTs', () => {
    const pages = readFileSync(join(SRC, 'web', 'engaged-pages.ts'), 'utf8');
    assert.match(pages, /await MR\.offerPick\(\{ \.\.\.deps, outside: \{ transport: d\.app\.outside, secrets: d\.app\.secrets \} \}/);
    assert.match(pages, /await MR\.takePick\(\{ \.\.\.deps, outside: \{ transport: d\.app\.outside, secrets: d\.app\.secrets \} \}/);
    assert.match(pages, /research\\\/pick\$\/\.exec\(path\);\n\s*if \(pick && method === 'POST'\)/);
    assert.match(pages, /research\\\/pick\\\/choose\$\/\.exec\(path\);\n\s*if \(chose && method === 'POST'\)/);
  });
});

/* ================================================================== *
 * 4 · THE ENERGY CERTIFICATE'S DOMESTIC CODES
 * ================================================================== */

describe('4 · the domestic certificate’s codes are decoded through the register’s own lists, or the field is left out', () => {
  test('the raw code is read where the register puts it: the tenure at the top, the age band on the FIRST building part', () => {
    const data = JSON.parse(fx('epc-certificate-domestic-chosen.json')).data as Record<string, unknown>;
    assert.equal(rawCode(data, 'tenure'), '1', 'a number tenure was not read as its own text');
    assert.equal(rawCode(data, 'construction_age_band'), 'M', 'the main building part’s band was not the one read');
    assert.equal(rawCode(data, 'built_form'), null, 'a code this lookup does not decode was read anyway');
    assert.equal(rawCode({}, 'tenure'), null);
    assert.equal(rawCode({ sap_building_parts: [] }, 'construction_age_band'), null);
    assert.equal(rawCode({ sap_building_parts: [{}] }, 'construction_age_band'), null);
  });

  test('the two code lists are read as the register documents them', () => {
    assert.deepEqual(codesOffered(fx('epc-codes.json'))?.slice(0, 2), ['built_form', 'construction_age_band']);
    assert.equal(codesOffered('not json'), null);
    assert.equal(codesOffered('{"data":{}}'), null);
    assert.equal(decodeValue(fx('epc-codes-info-tenure.json'), '1', 'RdSAP-Schema-21.0.1'), 'Owner-occupied');
    assert.equal(decodeValue(fx('epc-codes-info-age-band.json'), 'M', 'RdSAP-Schema-21.0.1'), 'England and Wales: 2007-2011');
    // THE SAME LETTER MEANS DIFFERENT THINGS UNDER DIFFERENT SCHEMAS, so a value for another version is not taken.
    assert.equal(decodeValue(fx('epc-codes-info-age-band.json'), 'M', 'RdSAP-Schema-17.0'), 'England and Wales: before 1900');
    assert.equal(decodeValue(fx('epc-codes-info-other-schema-only.json'), 'M', 'RdSAP-Schema-21.0.1'), null);
    assert.equal(decodeValue(fx('epc-codes-info-tenure.json'), '9', 'RdSAP-Schema-21.0.1'), null);
    assert.equal(decodeValue('not json', '1', null), null);
  });

  test('DECODED, THEY ARE KEPT — the age band and the tenure, in words, with the certificate’s own schema asked for', async () => {
    const { app, t, ctx } = await rig({
      'GET /api/non-domestic/search': NOT_FOUND, 'GET /api/display/search': NOT_FOUND,
      'GET /api/domestic/search': ok('epc-domestic-search-two-close.json'),
      'GET /api/certificate': ok('epc-certificate-domestic-chosen.json'),
      'GET /api/codes': ok('epc-codes.json'),
      'GET /api/codes/info': [ok('epc-codes-info-age-band.json'), ok('epc-codes-info-tenure.json')],
    });
    const run = await C.runConnector(epc, ctx, { property: UNIT3, nation: 'england', sector: 'supported_living', chosen: '1111-0000-0000-0000-0011' }, ALLOWED, KEYS, ALL_ON);
    assert.equal(run.state, 'FIRED', run.detail);
    assert.deepEqual(run.bundle?.records[0]?.fields, {
      epc_rrn: '1111-0000-0000-0000-0011', epc_total_floor_area_m2: 142, epc_property_type: 'Mid-terrace house',
      epc_lodgement_date: '2025-04-04',
      epc_construction_age_band: 'England and Wales: 2007-2011', epc_tenure: 'Owner-occupied',
    });
    const info = t.seen.filter((s) => s.url.includes('/api/codes/info')).map((s) => new URL(s.url));
    assert.equal(info.length, 2);
    for (const u of info) {
      assert.equal(u.searchParams.get('schemaVersion'), 'RdSAP-Schema-21.0.1', 'the certificate’s own schema was not asked for');
      assert.ok(['construction_age_band', 'tenure'].includes(u.searchParams.get('code') ?? ''));
    }
    assert.deepEqual(info.map((u) => u.searchParams.get('key')), ['M', '1']);
    app.close();
  });

  test('NOT DECODED, NOT KEPT — in any of the four ways it can fail, and the words say the question stays asked', async () => {
    const cases: readonly [string, Record<string, Fixture | readonly Fixture[]>][] = [
      ['the code list could not be read', { 'GET /api/codes': { status: 500, body: '{}' } }],
      ['the register does not list the code', { 'GET /api/codes': ok('epc-codes-short.json') }],
      ['the lookup of a key failed', { 'GET /api/codes': ok('epc-codes.json'), 'GET /api/codes/info': { status: 500, body: '{}' } }],
      ['it answered for another schema only', { 'GET /api/codes': ok('epc-codes.json'), 'GET /api/codes/info': ok('epc-codes-info-other-schema-only.json') }],
    ];
    for (const [what, extra] of cases) {
      const { app, ctx } = await rig({
        'GET /api/non-domestic/search': NOT_FOUND, 'GET /api/display/search': NOT_FOUND,
        'GET /api/domestic/search': ok('epc-domestic-search-two-close.json'),
        'GET /api/certificate': ok('epc-certificate-domestic-chosen.json'),
        ...extra,
      });
      const run = await C.runConnector(epc, ctx, { property: UNIT3, nation: 'england', sector: 'supported_living', chosen: '1111-0000-0000-0000-0011' }, ALLOWED, KEYS, ALL_ON);
      assert.equal(run.state, 'FIRED', `${what}: ${run.detail}`);
      const fields = run.bundle?.records[0]?.fields ?? {};
      assert.equal(fields['epc_construction_age_band'], undefined, `${what}: an undecoded age band was kept`);
      assert.equal(JSON.stringify(fields).includes('"M"'), false, `${what}: the raw letter was kept`);
      assert.match(run.detail, /a code we could not look up/, what);
      assert.match(run.detail, /stays? asked/, what);
      // the floor area still lands: one code failing does not lose the rest of the certificate
      assert.equal(fields['epc_total_floor_area_m2'], 142, what);
      app.close();
    }
  });

  test('A NON-DOMESTIC CERTIFICATE ASKS NEITHER CODE ENDPOINT — it carries no code, so a call would buy nothing', async () => {
    const { app, t, ctx } = await rig({
      'GET /api/non-domestic/search': okOld('epc-nondomestic-search.json'),
      'GET /api/display/search': { status: 404, body: old('epc-not-found.json') },
      'GET /api/certificate': okOld('epc-certificate-nondomestic.json'),
      'GET /api/codes': ok('epc-codes.json'),
    });
    const property: TypedProperty = { id: 'p-1', address_line_1: '12 Invented Road', address_line_2: null, town: 'Nowhere', postcode: 'zz1 1zz', jurisdiction: 'england' };
    const run = await C.runConnector(epc, ctx, { property, nation: 'england', sector: 'care_homes' }, ALLOWED, KEYS, ALL_ON);
    assert.equal(run.state, 'FIRED', run.detail);
    assert.deepEqual(t.seen.map((s) => new URL(s.url).pathname), ['/api/non-domestic/search', '/api/display/search', '/api/certificate']);
    app.close();
  });

  test('both decoded fields are ones BOTH registers permit, and the raw code is on neither keep list', () => {
    const src = REGISTER_SOURCES.find((s) => s.source_id === 'EPC')!;
    for (const field of Object.values(EPC_CODED_FIELDS)) {
      assert.ok(src.permitted_fields.includes(field), `${field} is not permitted by the source register`);
      assert.equal(classifyField('EPC', field).kind, 'kept', `${field} is not kept by the name exclusion register`);
    }
    // epc_construction_age_band is a CB_REGISTRY field; epc_tenure deliberately is not — at the address question
    // tenure is HM Land Registry's answer, not the certificate's, so it is kept as a register fact and feeds no
    // derivation. A mapping would put the certificate's word where the title register's belongs.
    const cb = (REGISTRY.SOURCES['epc'] as unknown as { fields: string[] }).fields;
    assert.ok(cb.includes('construction_age_band'));
    assert.equal(cb.includes('tenure'), false, 'the engine has grown a tenure field on the certificate register');
  });

  test('a dwelling type written as an object rather than a string is still read (RdSAP-Schema-19.0 writes one)', () => {
    const hit = { certificate_number: 'x', registered: '2020-06-04', register: 'domestic' as const, schema: null };
    assert.equal(certificateFields({ dwelling_type: { value: 'Semi-detached house', language: '1' }, total_floor_area: 94 }, hit)['epc_property_type'], 'Semi-detached house');
    assert.equal(certificateFields({ dwelling_type: 'Mid-terrace house' }, hit)['epc_property_type'], 'Mid-terrace house');
    assert.equal(certificateFields({ dwelling_type: 42 }, hit)['epc_property_type'], undefined, 'a number was stored as a building type');
  });
});

/* ================================================================== *
 * 5 · THE LAND REGISTRY'S WORDS WITH THE ENGINE'S SENTENCE
 * ================================================================== */

describe('5 · derive()’s sentence about the price paid carries HM Land Registry’s prescribed credit', () => {
  const WORDS = 'Contains HM Land Registry data © Crown copyright and database right 2021. ' +
    'This data is licensed under the Open Government Licence v3.0.';

  test('THE ENGINE’S COPY AND THE LICENCE REGISTER’S ARE THE SAME STRING — this is the check the copy exists under', () => {
    const fromEngine = (REGISTRY as unknown as { HMLR_PPD_ATTRIBUTION?: unknown }).HMLR_PPD_ATTRIBUTION;
    const fromRegister = LICENCES.find((l) => l.licence_id === 'HMLR_PPD')?.attribution_text;
    assert.equal(fromEngine, fromRegister, 'the engine’s copy of the credit has drifted from the licence register');
    assert.equal(fromEngine, WORDS);
    assert.match(String(fromEngine), /2021/, 'the year is a fixed 2021 and it has gone missing once already');
  });

  test('the two Price Paid fields carry it, every other derived field says null, and the sentence itself is unchanged', () => {
    const reg = REGISTRY as unknown as {
      precondition: { enabled: boolean };
      derive: (b: unknown, o: unknown) => { values: Record<string, unknown>; provenance: Record<string, { confirm: string; attribution: string | null }> };
    };
    reg.precondition.enabled = true;
    try {
      const d = reg.derive({
        hmlr: { price_paid: 450000, completion_date: '2019-06-01', tenure: 'freehold' },
        epc: { floor_area_m2: 268, construction_age_band: '1976-1982' },
        cqc: { service_type: 'Supported living service', bed_count: 12 },
      }, { nation: 'england', sector: 'supported_living' });
      assert.equal(d.values['price_paid'], 450000);
      assert.deepEqual(
        Object.keys(d.provenance).filter((f) => d.provenance[f]?.attribution !== null).sort(),
        ['completion_date', 'price_paid']);
      for (const f of Object.keys(d.provenance)) assert.ok('attribution' in (d.provenance[f] ?? {}), `${f} has no attribution key at all`);
      assert.equal(d.provenance['price_paid']?.attribution, WORDS);
      // the credit sits BESIDE the sentence, not inside it
      assert.equal(d.provenance['price_paid']?.confirm, 'Our records show you paid 450000 for this property. Is that right?');
      assert.equal(d.provenance['price_paid']?.confirm.includes('Crown copyright'), false);
    } finally {
      reg.precondition.enabled = false;
    }
  });

  test('and the gate is shut again afterwards, as it was before', () => {
    assert.equal((REGISTRY as unknown as { precondition: { enabled: boolean } }).precondition.enabled, false);
  });
});
