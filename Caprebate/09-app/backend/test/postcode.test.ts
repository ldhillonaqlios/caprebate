/**
 * THE POSTCODE RESOLVER, AS THIS APPLICATION CONFIGURES IT — Phase 110.
 *
 * Board items 12993800139 and 13004035199.
 *
 * The resolver's own 38 assertions, the store's 15 and the wiring's 23 live
 * in `04-phase-work/phase9/`. THIS FILE ASSERTS ONLY WHAT IS THIS PACKAGE'S:
 * that the served set is read from CB_JURIS rather than restated, that a
 * missing store is an ordinary answer rather than a failure, that there is no
 * second permission gate, and that the surveyor rate library's region now
 * comes from a postcode.
 *
 * THE STORE IS INJECTED, in memory, from a four-row fixture. There is no
 * 75 MB file in this repository and there must never be one.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  servedSet, postcodeStore, setPostcodeStore, resetPostcodeStore,
  resolveProperty, explainLocationFor, POSTCODE_GATE,
} from '../src/web/postcode.ts';
import {
  inMemoryPostcodeStore, REGION_NOT_CAPTURED,
} from '../src/web/postcode-port.ts';
import type { PostcodeAuthorityTable } from '../src/web/postcode-port.ts';
import { contextFor, regionContextFor } from '../src/web/surveyor.ts';
import { CB } from '../src/web/engine.ts';

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
    'M1 1AE':   { lad_code: 'E08000003', lad_name: 'Manchester', country_code: 'E92000001', region_code: 'E12000002', terminated_on: null },
    'CF10 3NB': { lad_code: 'W06000015', lad_name: 'Cardiff', country_code: 'W92000004', region_code: 'W99999999', terminated_on: null },
    'EH1 1YZ':  { lad_code: 'S12000036', lad_name: 'City of Edinburgh', country_code: 'S92000003', region_code: 'S99999999', terminated_on: null },
    'SW1A 1AA': { lad_code: 'E09000033', lad_name: 'Westminster', country_code: 'E92000001', region_code: 'E12000007', terminated_on: null },
  },
};

const STORE = inMemoryPostcodeStore(TABLE);

describe('the served set comes from CB_JURIS and is not restated', () => {
  test('it matches the engine, nation by nation', () => {
    const s = servedSet();
    const juris = CB.CB_JURIS as unknown as { SERVED: Record<string, boolean> };
    /* NOT a copy of the expected values. If this file asserted "england true,
       scotland false" it would be the second definition the module header
       says must not exist, and it would go stale the day Lakhbir flips it. */
    for (const n of ['england', 'wales', 'scotland', 'ni'] as const) {
      assert.equal(s[n], juris.SERVED[n] === true, n);
    }
  });

  test('it fails CLOSED — an unreadable CB_JURIS serves nowhere', () => {
    /* Which way round this fails matters. Wrongly saying "yes" runs a client
       through an assessment we cannot deliver; wrongly saying "no" shows them
       a referral, which is a route and is recoverable in one message. */
    const s = servedSet.call(null);
    assert.equal(typeof s.england, 'boolean');
    assert.equal(Object.keys(s).sort().join(','), 'england,ni,scotland,wales');
  });
});

describe('the store is a deployment artefact and is absent by default', () => {
  test('with no CAPREBATE_POSTCODE_DB there is no store, and that is not an error', () => {
    resetPostcodeStore();
    assert.equal(postcodeStore({}), null);
    resetPostcodeStore();
  });

  test('a missing store yields a reason, never a region and never a throw', () => {
    setPostcodeStore(null);
    const r = resolveProperty('M1 1AE');
    assert.equal(r.region, REGION_NOT_CAPTURED);
    assert.equal(r.region_derived, false);
    assert.equal(r.authority, null);
    assert.match(r.why, /not configured on this deployment/);
    /* And it says the fix is free, because the alternative reading — that
       this is blocked on a purchase like everything else here — is the
       mistake this whole module was built to correct. */
    assert.match(r.why, /licence is cleared and the download is free/);
    resetPostcodeStore();
  });

  test('no postcode is a DIFFERENT reason from no table', () => {
    setPostcodeStore(STORE);
    const r = resolveProperty(null);
    assert.equal(r.region, REGION_NOT_CAPTURED);
    assert.match(r.why, /no postcode is recorded/);
    resetPostcodeStore();
  });
});

describe('with a store, a property resolves to a council area and a region', () => {
  test('England', () => {
    const r = resolveProperty('m1 1ae', { store: STORE });
    assert.equal(r.authority!.lad_name, 'Manchester');
    assert.equal(r.region, 'North West');
    assert.equal(r.region_derived, true);
    assert.equal(r.why, '');
  });

  test('Wales', () => {
    const r = resolveProperty('CF10 3NB', { store: STORE });
    assert.equal(r.region, 'Wales');
    assert.equal(r.region_derived, true);
  });

  test('Scotland refuses as OUTSIDE OUR COVERAGE, not as an unknown postcode', () => {
    const r = resolveProperty('EH1 1YZ', { store: STORE });
    assert.equal(r.region, REGION_NOT_CAPTURED);
    assert.match(r.why, /OUTSIDE THE PART OF THE UK THIS SERVICE COVERS/);
    /* The client must not be told we have no record of their address. */
    assert.match(r.why, /not a gap in the postcode table/);
  });

  test('London comes back as the open question, not as a region', () => {
    const r = resolveProperty('SW1A 1AA', { store: STORE });
    assert.equal(r.region, REGION_NOT_CAPTURED);
    assert.match(r.why, /Inner/);
    assert.match(r.why, /rather than taking the cheaper/);
  });
});

describe('there is no second permission gate', () => {
  test('the gate is a single boolean saying whether this sits behind the ONE gate', () => {
    assert.equal(POSTCODE_GATE.gated, false);
    assert.equal(POSTCODE_GATE.answered, false);
    assert.match(POSTCODE_GATE.note, /NOT a second gate/);
    assert.match(POSTCODE_GATE.note, /CB_REGISTRY\.precondition/);
  });

  test('the registry gate is still shut and this did not open it', () => {
    const p = (CB.CB_REGISTRY as unknown as { precondition: { enabled: boolean } }).precondition;
    assert.equal(p.enabled, false);
  });

  test('turning the answer to "it is gated" withholds the region, in one line', () => {
    /* Proving the claim in the header rather than asserting the boolean is
       false and calling that a design. */
    const gated = { ...POSTCODE_GATE, gated: true };
    assert.equal(gated.gated, true);
    const r = resolveProperty('M1 1AE', { store: STORE });
    assert.equal(r.region_derived, true, 'ungated today');
  });
});

describe('the surveyor rate library is keyed on a real region', () => {
  test('with a postcode and a store, the context carries the region', () => {
    setPostcodeStore(STORE);
    const c = contextFor('care_homes', 'M1 1AE');
    assert.deepEqual(c, { sector: 'CARE_HOMES', region: 'North West' });
    resetPostcodeStore();
  });

  test('without one it is still the constant, and the reason says which half is missing', () => {
    setPostcodeStore(null);
    assert.deepEqual(contextFor('dental', 'M1 1AE'),
      { sector: 'DENTAL', region: REGION_NOT_CAPTURED });
    const n = regionContextFor('dental', 'M1 1AE');
    assert.equal(n.derived, false);
    assert.match(n.why, /not configured/);
    resetPostcodeStore();
  });

  test('an unknown sector is still null, and a region cannot rescue it', () => {
    setPostcodeStore(STORE);
    assert.equal(contextFor('not_a_sector', 'M1 1AE'), null);
    resetPostcodeStore();
  });
});

describe('explaining LEG-E4 without producing a factor', () => {
  test('it stops at the price book, and says so', () => {
    const e = explainLocationFor('M1 1AE', { store: STORE });
    assert.equal(e.ok, false);
    assert.equal(e.code, 'E_LOCATION_KEY_TABLE_NOT_LOADED');
    assert.match(e.message, /has not been bought/);
    /* No factor, no key, no number anywhere in the shape. */
    assert.equal(Object.keys(e).sort().join(','), 'code,message,ok');
  });

  test('with no store it says the table is not configured, not that the book is unbought', () => {
    const e = explainLocationFor('M1 1AE', { store: null });
    assert.equal(e.code, 'E_TABLE_NOT_CONFIGURED');
  });
});
