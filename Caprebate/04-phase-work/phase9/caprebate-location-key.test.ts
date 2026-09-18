/* =============================================================================
   CAPREBATE — THE LEG-E4 WIRING, TESTS (Phase 110)

   Board item 12993800139.
   Run:  cd phase9 && node --test caprebate-location-key.test.ts

   ---------------------------------------------------------------------------
   THE GROUP THAT MATTERS IS N. Everything else here is ordinary coverage; N
   is the group that exists because a wiring layer is exactly where a refusal
   turns into a silent 1.0, and because the phase that wrote it was told so in
   terms. Read N before changing anything in caprebate-location-key.ts.

   THE GATE IS FORCED ON OVER A HAND-BUILT FIXTURE in several tests below,
   through `gates`, which is the same mechanism suite I in the site harness
   uses. FORCING IT ON IN A TEST IS NOT SHIPPING IT ON: the shipped default is
   asserted separately, in N1, and the module-level gate is never mutated.
   ============================================================================= */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  resolveServedAuthority,
  locationKeyFor,
  locationFactorForPostcode,
  explainLocationKey,
  nationOf,
  LocationKeyError,
  LEG_E4_GATE,
  type ServedSet,
} from './caprebate-location-key.ts';
import { inMemoryPostcodeStore } from './caprebate-postcode-store.ts';
import type { PostcodeAuthorityTable } from './caprebate-postcode-authority.ts';
import COST_MODEL from './caprebate-cost-model.cjs';

const CM = COST_MODEL as unknown as {
  CB_P9_GATES: Record<string, boolean>;
  CB_LOCATION_FACTORS: { loaded: boolean };
};

const codeOf = (fn: () => unknown): string => {
  try { fn(); return 'NO_THROW'; } catch (e) {
    const c = (e as { code?: string }).code;
    return typeof c === 'string' ? c : (e as Error).name;
  }
};

const TABLE: PostcodeAuthorityTable = {
  table_id: 'CB_ONS_POSTCODE_AUTHORITY',
  source: 'HAND-TYPED TEST FIXTURE - not an ONS file',
  licence: 'n/a - fixture',
  loaded: true,
  verified_at: '2026-08-15T00:00:00.000Z',
  release: 'AUG_2026',
  release_year: 2026,
  record_count: 4,
  byPostcode: {
    'CF10 3NB': { lad_code: 'W06000015', lad_name: 'Cardiff', country_code: 'W', region_code: 'W99999999', terminated_on: null },
    'M1 1AE':   { lad_code: 'E08000003', lad_name: 'Manchester', country_code: 'E', region_code: 'E12000002', terminated_on: null },
    'EH1 1YZ':  { lad_code: 'S12000036', lad_name: 'City of Edinburgh', country_code: 'S', region_code: 'S99999999', terminated_on: null },
    'XX1 1AA':  { lad_code: 'Q99999999', lad_name: 'Nowhere', country_code: 'Q', region_code: null, terminated_on: null },
  },
};

const STORE = inMemoryPostcodeStore(TABLE);

/** As CB_JURIS.SERVED reads today: England and Wales, Phase 64. */
const SERVED_TODAY: ServedSet = { england: true, wales: true, scotland: false, ni: false };

/** The location-key half, filled by hand. The real one waits on GBP 330. */
const KEYS = {
  table_id: 'CB_LAD_TO_LOCATION_KEY',
  source: 'HAND-TYPED TEST FIXTURE',
  licence: 'n/a - fixture',
  loaded: true,
  verified_at: '2026-09-09',
  byLadCode: { W06000015: 'wales', E08000003: 'north_west' },
};

/** The price book's own factor table, invented. Never real figures. */
const FACTORS = {
  table_id: 'CB_LOCATION_FACTORS',
  source: 'HAND-INVENTED FIXTURE - no price book figure is in this repository',
  licence: 'n/a - fixture',
  loaded: true,
  verified_at: '2026-09-09',
  base_year: 2024,
  /* Phase 132: a declared base and price book, not a bare mean. */
  price_source: 'invented_book',
  index_base: { basis: 'national_mean', base_key: 'national_mean', base_value: 100 },
  factors: { wales: 87, north_west: 89, national_mean: 100 },
};

/** Phase 132: the price-book register and the contract-size scale LEG-E4 now needs. Invented. */
const PRICE_SOURCES = {
  table_id: 'CB_PRICE_SOURCES',
  source: 'HAND-INVENTED FIXTURE - describes no real price book',
  licence: 'n/a - fixture',
  loaded: true,
  verified_at: '2026-09-14',
  sources: {
    invented_book: {
      label: 'INVENTED BOOK',
      rates_include_oncosts: null,
      index_base: { basis: 'national_mean', base_key: 'national_mean', base_value: 100 },
      rates_priced_at_key: 'national_mean',
    },
  },
};
const CONTRACT_SIZE = {
  table_id: 'CB_CONTRACT_SIZE_ADJUSTMENT',
  source: 'HAND-INVENTED FIXTURE',
  licence: 'n/a - fixture',
  loaded: true,
  verified_at: '2026-09-14',
  assumed_contract_value: 3000000,
  quoted_as: 'percentage_adjustment',
  valid_from: 2000000,
  valid_to: 5000000,
  points: [[2000000, 10], [3000000, 0], [5000000, -5]],
};

const BOTH = { store: STORE, tables: { CB_LAD_TO_LOCATION_KEY: KEYS } };
const GATE_ON = {
  ...BOTH,
  gates: { [LEG_E4_GATE]: true },
  tables: { CB_LAD_TO_LOCATION_KEY: KEYS, CB_LOCATION_FACTORS: FACTORS,
    CB_PRICE_SOURCES: PRICE_SOURCES, CB_CONTRACT_SIZE_ADJUSTMENT: CONTRACT_SIZE },
};

/* =============================================================================
   M. THE CHAIN — and it stops where the purchase does
   ============================================================================= */

test('M1 a postcode resolves to a council area through the store', () => {
  const { authority, nation } = resolveServedAuthority('cf10 3nb', { store: STORE });
  assert.equal(authority.lad_name, 'Cardiff');
  assert.equal(authority.lad_code, 'W06000015');
  assert.equal(nation, 'wales');
  /* The attribution travels with the answer. It is a licence condition, not
     a nicety, and it cannot be produced without the release year. */
  assert.equal(authority.attribution.length, 3);
  assert.ok(authority.attribution.every((l) => !l.includes('[year]')));
});

test('M2 the chain refuses at the PURCHASE link and names which half is missing', () => {
  /* No CB_LAD_TO_LOCATION_KEY. This is the shipped state and it is the whole
     honest limit of the resolver: the postcode half is solved, the purchase
     half is not. The refusal is the resolver's own and is not re-implemented
     in the wiring — this asserts that it comes through unchanged. */
  assert.equal(codeOf(() => locationKeyFor('CF10 3NB', { store: STORE })),
    'E_LOCATION_KEY_TABLE_NOT_LOADED');
  try { locationKeyFor('CF10 3NB', { store: STORE }); } catch (e) {
    assert.match((e as Error).message, /has not been bought/);
    assert.match((e as Error).message, /postcode half of LEG-E4 is solved/);
    assert.match((e as Error).message, /Cardiff/);
  }
});

test('M3 with both halves present the chain completes', () => {
  const r = locationKeyFor('CF10 3NB', BOTH);
  assert.equal(r.location_key, 'wales');
  assert.equal(r.authority.lad_name, 'Cardiff');
});

test('M4 a council with no entry in the key table refuses with its OWN code', () => {
  /* Different from M2 on purpose: M2 is a purchase nobody made, this is a
     gap in a table that was bought. Two different people, two different
     codes, and neither is a national mean. */
  const partial = { ...KEYS, byLadCode: { E08000003: 'north_west' } };
  assert.equal(
    codeOf(() => locationKeyFor('CF10 3NB',
      { store: STORE, tables: { CB_LAD_TO_LOCATION_KEY: partial } })),
    'E_LAD_NOT_IN_LOCATION_KEY_TABLE');
});

/* =============================================================================
   N. THE GATE — the group that exists because wiring is where 1.0 comes from
   ============================================================================= */

test('N1 LEG-E4 ships false, and nothing in the wiring can turn it on', () => {
  assert.equal(CM.CB_P9_GATES[LEG_E4_GATE], false);
  /* And the factor table it would need is still empty, so even a gate flipped
     by hand could not produce a figure from a price book we have not bought. */
  assert.equal(CM.CB_LOCATION_FACTORS.loaded, false);
});

test('N2 gate OFF returns the cost model\'s own answer, and resolves nothing', () => {
  const direct = (COST_MODEL as unknown as {
    locationAndContractSizeFactor: (i: unknown, o?: unknown) => Record<string, unknown>;
  }).locationAndContractSizeFactor({}, {});

  /* The postcode is deliberate garbage. With the gate off it is never looked
     at, so this must not throw — and the object must be the cost model's,
     not one this file assembled to look like it. */
  const wired = locationFactorForPostcode('NOT A POSTCODE AT ALL', {}, { store: STORE });
  assert.deepEqual(wired, direct);
  assert.equal(wired.factor, 1);
  assert.equal(wired.applied, false);
  assert.deepEqual(wired.flags, ['LEG_E4_NO_REGIONAL_ADJUSTMENT']);
});

test('N3 gate ON with an unresolvable postcode THROWS — it does not fall back to 1.0', () => {
  /* THE ASSERTION THIS WHOLE FILE EXISTS FOR. Turn the gate on, give it a
     postcode the table does not hold, and the answer must be a refusal. A
     factor of 1.0 here would be a national mean nobody chose, applied to a
     claim, looking exactly like a deliberate answer. */
  assert.equal(
    codeOf(() => locationFactorForPostcode('ZZ99 9ZZ', {}, GATE_ON)),
    'E_POSTCODE_NOT_IN_TABLE');
});

test('N4 gate ON with no price-book key table THROWS at the purchase link', () => {
  assert.equal(
    codeOf(() => locationFactorForPostcode('CF10 3NB', {}, {
      store: STORE,
      gates: { [LEG_E4_GATE]: true },
      tables: { CB_LOCATION_FACTORS: FACTORS },
    })),
    'E_LOCATION_KEY_TABLE_NOT_LOADED');
});

test('N5 gate ON and everything present produces a real factor, once', () => {
  const r = locationFactorForPostcode('CF10 3NB',
    { price_source: 'invented_book', contract_value: 3000000 }, GATE_ON);
  assert.equal(r.applied, true);
  assert.equal(r.location_key, 'wales');
  assert.equal(r.location_factor, 0.87);
  assert.equal(r.lad_name, 'Cardiff');
  /* The attribution reaches the factor. An output can carry the figure only
     if it carries the licence lines with it. */
  assert.equal((r.attribution as string[]).length, 3);
  assert.ok((r.flags as string[]).includes('LEG_E4_APPLIED_TO_TOTAL'));
});

test('N6 the wiring never introduces a location_key of its own', () => {
  /* Gate on, table loaded, and NO postcode. The refusal has to come from the
     resolver's normalisation, not from a default key slipped in below. */
  const code = codeOf(() => locationFactorForPostcode(undefined, {}, GATE_ON));
  assert.equal(code, 'E_POSTCODE_REQUIRED');
});

/* =============================================================================
   O. JURISDICTION — where option (c) went, and why it is not a trim
   ============================================================================= */

test('O1 with no served set supplied there is NO jurisdiction check', () => {
  /* This is the resolver's existing, deliberate behaviour and it is about the
     ONS LICENCE, which covers Scotland. Conflating licence with coverage is
     the mistake this assertion prevents. */
  const { authority, nation } = resolveServedAuthority('EH1 1YZ', { store: STORE });
  assert.equal(authority.lad_name, 'City of Edinburgh');
  assert.equal(nation, 'scotland');
});

test('O2 a Scottish postcode refuses as OUTSIDE OUR COVERAGE, not as "not in table"', () => {
  const code = codeOf(() =>
    resolveServedAuthority('EH1 1YZ', { store: STORE, served: SERVED_TODAY }));
  assert.equal(code, 'E_OUTSIDE_SERVED_JURISDICTION');
  try { resolveServedAuthority('EH1 1YZ', { store: STORE, served: SERVED_TODAY }); }
  catch (e) {
    const m = (e as Error).message;
    /* Every one of these is load-bearing. The client must not be told we have
       no record of their address, and must not be told they have no claim. */
    assert.match(m, /OUTSIDE THE PART OF THE UK THIS SERVICE COVERS/);
    assert.match(m, /not a gap in the postcode table/);
    assert.match(m, /City of Edinburgh/);
    assert.match(m, /CB_JURIS/);
    assert.match(m, /UK-wide tax/);
    assert.equal((e as LocationKeyError).detail.nation, 'scotland');
  }
});

test('O3 the served set is READ, not defined here — widening it widens the service', () => {
  /* One boolean, Lakhbir's to flip, and the day it flips this passes with no
     re-ingest and no code change. That is the argument against trimming the
     table to England and Wales: a trim would have made this a data migration. */
  const withScotland: ServedSet = { ...SERVED_TODAY, scotland: true };
  const r = resolveServedAuthority('EH1 1YZ', { store: STORE, served: withScotland });
  assert.equal(r.authority.lad_name, 'City of Edinburgh');
  assert.equal(r.nation, 'scotland');
});

test('O4 England and Wales pass the served check today', () => {
  assert.equal(resolveServedAuthority('M1 1AE', { store: STORE, served: SERVED_TODAY }).nation,
    'england');
  assert.equal(resolveServedAuthority('CF10 3NB', { store: STORE, served: SERVED_TODAY }).nation,
    'wales');
});

test('O5 an undecidable nation refuses rather than defaulting to England', () => {
  assert.equal(
    codeOf(() => resolveServedAuthority('XX1 1AA', { store: STORE, served: SERVED_TODAY })),
    'E_NATION_NOT_DERIVABLE');
});

test('O6 nation comes from the GSS code, and falls back to the authority code', () => {
  assert.equal(nationOf({ country_code: 'W92000004', lad_code: 'W06000015' }), 'wales');
  assert.equal(nationOf({ country_code: '', lad_code: 'S12000036' }), 'scotland');
  assert.equal(nationOf({ country_code: 'N92000002', lad_code: 'N09000003' }), 'ni');
  assert.equal(nationOf({ country_code: '', lad_code: '' }), null);
});

/* =============================================================================
   P. STALENESS, APPLIED — job 3's policy reaching an actual answer
   ============================================================================= */

const staleTable = (verified_at: string): PostcodeAuthorityTable =>
  ({ ...TABLE, verified_at });

test('P1 a stale table still answers, and the flag travels WITH the answer', () => {
  const store = inMemoryPostcodeStore(staleTable('2026-01-01T00:00:00.000Z'));
  const { authority, freshness } = resolveServedAuthority('M1 1AE',
    { store, asAt: new Date('2026-09-09T00:00:00.000Z') });
  assert.equal(authority.lad_name, 'Manchester');
  assert.equal(freshness!.state, 'stale');
  /* The same array the terminated-postcode flag uses, so it reaches whatever
     consumes the answer rather than a log nobody reads. */
  assert.ok(authority.flags.includes('ONS_TABLE_STALE'));
});

test('P2 an expired table REFUSES, and it refuses before producing an answer', () => {
  const store = inMemoryPostcodeStore(staleTable('2024-01-01T00:00:00.000Z'));
  assert.equal(
    codeOf(() => resolveServedAuthority('M1 1AE',
      { store, asAt: new Date('2026-09-09T00:00:00.000Z') })),
    'E_ONS_TABLE_EXPIRED');
});

test('P3 with no clock supplied the policy does not run at all', () => {
  /* Deliberate: a caller that has not said what "now" is has not opted into a
     time-based refusal, and inventing one from the system clock inside a
     resolver would make the same input give different answers on different
     days with nothing in the call to say so. */
  const store = inMemoryPostcodeStore(staleTable('2000-01-01T00:00:00.000Z'));
  const { authority, freshness } = resolveServedAuthority('M1 1AE', { store });
  assert.equal(freshness, null);
  assert.deepEqual(authority.flags, []);
});

test('P4 a fresh table adds nothing', () => {
  const { authority, freshness } = resolveServedAuthority('M1 1AE',
    { store: STORE, asAt: new Date('2026-09-09T00:00:00.000Z') });
  assert.equal(freshness!.state, 'fresh');
  assert.deepEqual(authority.flags, []);
});

/* =============================================================================
   Q. EXPLAINING, WITHOUT ANSWERING
   ============================================================================= */

test('Q1 explain returns the reason and never a factor or a key', () => {
  const e = explainLocationKey('CF10 3NB', { store: STORE });
  assert.equal(e.ok, false);
  assert.equal(e.code, 'E_LOCATION_KEY_TABLE_NOT_LOADED');
  assert.match(e.message, /has not been bought/);
  assert.equal(Object.keys(e).sort().join(','), 'code,message,ok');
});

test('Q2 explain reports success without becoming a way to get a factor', () => {
  const e = explainLocationKey('CF10 3NB', BOTH);
  assert.equal(e.ok, true);
  assert.equal(e.code, null);
  assert.match(e.message, /wales/);
});

test('Q3 explain does not swallow a programming error', () => {
  /* It catches the two error types it knows about and rethrows anything else.
     A catch-all here would turn a bug in the resolver into a tidy "we could
     not derive it" on a screen, which is how a defect goes unnoticed. */
  assert.throws(() => explainLocationKey('CF10 3NB', {
    store: { loaded: true, licence: 'x', release: null, release_year: null,
             verified_at: null,
             get: () => { throw new TypeError('boom'); } },
  }), TypeError);
});
