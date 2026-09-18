/* =============================================================================
   CAPREBATE — COUNCIL AREA TO REGION, TESTS (Phase 110)

   Board item 13004035199, job 3 of three. Deferred out of Phase 107a.
   Run:  cd phase9 && node --test caprebate-region.test.ts

   ---------------------------------------------------------------------------
   NOT ONE PRICE-BOOK FIGURE IS IN THIS FILE, and R1 asserts that rather than
   leaving it to inspection. The thirteen NAMES are a vocabulary and are
   borrowed so that this project has one regional grouping instead of three;
   the thirteen FACTORS are quarantined data belonging to LEG-E4 and to a
   purchase nobody has made.
   ============================================================================= */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  PRICE_BOOK_REGIONS,
  REGION_NOT_CAPTURED,
  ONS_REGION_TO_PRICE_BOOK,
  COUNTRY_TO_PRICE_BOOK,
  RegionError,
  regionOf,
  regionKeyOf,
} from './caprebate-region.ts';

const A = (over: Record<string, unknown> = {}) => ({
  postcode: 'M1 1AE', lad_code: 'E08000003', lad_name: 'Manchester',
  country_code: 'E92000001', region_code: 'E12000002', ...over,
} as Parameters<typeof regionOf>[0]);

const codeOf = (fn: () => unknown): string => {
  try { fn(); return 'NO_THROW'; } catch (e) {
    const c = (e as { code?: string }).code;
    return typeof c === 'string' ? c : (e as Error).name;
  }
};

/* =============================================================================
   R. THE VOCABULARY
   ============================================================================= */

test('R1 thirteen names and NOT ONE FACTOR', () => {
  assert.equal(PRICE_BOOK_REGIONS.length, 13);
  assert.ok(PRICE_BOOK_REGIONS.every((r) => typeof r === 'string'));
  /* The mechanical version of the licence quarantine: nothing in this module
     may become a number. If a factor column is ever added, this fails. */
  const asText = JSON.stringify({ PRICE_BOOK_REGIONS, ONS_REGION_TO_PRICE_BOOK, COUNTRY_TO_PRICE_BOOK });
  assert.equal(/\d\.\d/.test(asText), false, 'a decimal appeared in the region vocabulary');
});

test('R2 the sentinel is a sentinel and is not one of the thirteen', () => {
  assert.equal(REGION_NOT_CAPTURED, 'region-not-captured');
  assert.equal((PRICE_BOOK_REGIONS as readonly string[]).includes(REGION_NOT_CAPTURED), false);
});

test('R3 every mapped code lands on a real region, or on London', () => {
  const names = new Set<string>(PRICE_BOOK_REGIONS);
  for (const code of Object.keys(ONS_REGION_TO_PRICE_BOOK)) {
    const r = ONS_REGION_TO_PRICE_BOOK[code];
    assert.ok(r === 'LONDON' || names.has(r), `${code} -> ${r}`);
  }
  for (const code of Object.keys(COUNTRY_TO_PRICE_BOOK)) {
    assert.ok(names.has(COUNTRY_TO_PRICE_BOOK[code]), code);
  }
});

/* =============================================================================
   S. THE LOOKUP — eleven of the thirteen need no judgement at all
   ============================================================================= */

test('S1 an English council resolves from its ONS region code', () => {
  assert.equal(regionOf(A()), 'North West');
  assert.equal(regionOf(A({ region_code: 'E12000009' })), 'South West');
  assert.equal(regionOf(A({ region_code: 'E12000003' })), 'Yorkshire and Humberside');
});

test('S2 Wales, Scotland and Northern Ireland are decided by COUNTRY, not by region', () => {
  /* Which matters: a per-country NSPL extract may not carry a region column at
     all, and each of the three is one region in the book anyway. */
  assert.equal(regionOf(A({ country_code: 'W92000004', region_code: null })), 'Wales');
  assert.equal(regionOf(A({ country_code: 'S92000003', region_code: null })), 'Scotland');
  assert.equal(regionOf(A({ country_code: 'N92000002', region_code: null })), 'Northern Ireland');
  /* And by the bare first letter, which is what the resolver falls back to
     when NSPL gives no country column. */
  assert.equal(regionOf(A({ country_code: 'W', region_code: null })), 'Wales');
});

test('S3 no region column means UNKNOWN, and it refuses', () => {
  assert.equal(codeOf(() => regionOf(A({ region_code: null }))), 'E_REGION_NOT_IN_SOURCE');
  try { regionOf(A({ region_code: '' })); } catch (e) {
    /* It has to send the reader to the ingest, because that is who can fix it. */
    assert.match((e as Error).message, /Re-run the ingest/);
    assert.match((e as Error).message, /unknown rather than absent/);
  }
});

test('S4 an unrecognised region code refuses rather than guessing', () => {
  /* THE SAFETY NET FOR THE ONE THING IN THIS MODULE THAT HAS NOT BEEN CHECKED
     AGAINST A REAL FILE. If ONS versions these codes the way it versions the
     column name, this fires on the first postcode instead of putting a
     plausible wrong region on a surveyor's screen. */
  assert.equal(codeOf(() => regionOf(A({ region_code: 'E12000099' }))),
    'E_REGION_CODE_UNRECOGNISED');
});

/* =============================================================================
   T. LONDON — the two that are a surveyor's judgement, worth 5%
   ============================================================================= */

test('T1 a London council refuses, and does not quietly take the cheaper option', () => {
  const london = A({ lad_code: 'E09000033', lad_name: 'Westminster',
                     region_code: 'E12000007', country_code: 'E92000001' });
  assert.equal(codeOf(() => regionOf(london)), 'E_LONDON_INNER_OUTER_UNRESOLVED');
  try { regionOf(london); } catch (e) {
    const m = (e as Error).message;
    assert.match(m, /Inner/);
    assert.match(m, /Outer/);
    /* Unknown is not a branch, and Outer London is the cheaper of the two —
       so a default would look exactly like an answer and would be the answer
       that suits us. */
    assert.match(m, /rather than taking the cheaper/);
    assert.match(m, /two published definitions/);
  }
});

test('T2 London is the ONLY unresolved one — the other twelve are decided', () => {
  const unresolved = Object.keys(ONS_REGION_TO_PRICE_BOOK)
    .filter((c) => ONS_REGION_TO_PRICE_BOOK[c] === 'LONDON');
  assert.deepEqual(unresolved, ['E12000007']);
});

/* =============================================================================
   U. THE KEY FORM — for a caller that must put SOMETHING in a column
   ============================================================================= */

test('U1 a derivable region comes back derived, with no reason attached', () => {
  const k = regionKeyOf(A());
  assert.equal(k.region, 'North West');
  assert.equal(k.derived, true);
  assert.equal(k.why, '');
});

test('U2 an underivable region comes back as the sentinel AND the reason', () => {
  /* The reason is the improvement. Before Phase 110 the screen printed
     "region-not-captured" and a surveyor had no way to know whether that was
     a missing postcode, a missing ingest or an open question. */
  const k = regionKeyOf(A({ region_code: null }));
  assert.equal(k.region, REGION_NOT_CAPTURED);
  assert.equal(k.derived, false);
  assert.match(k.why, /Re-run the ingest/);
});

test('U3 no authority at all is a distinct reason, not the same one', () => {
  const k = regionKeyOf(null);
  assert.equal(k.region, REGION_NOT_CAPTURED);
  assert.equal(k.derived, false);
  assert.match(k.why, /no postcode has been resolved/);
});

test('U4 London reaches the screen as the open question, not as a region', () => {
  const k = regionKeyOf(A({ lad_code: 'E09000033', lad_name: 'Westminster',
                            region_code: 'E12000007' }));
  assert.equal(k.region, REGION_NOT_CAPTURED);
  assert.match(k.why, /Inner/);
});

test('U5 regionKeyOf never throws — that is the difference between the two', () => {
  assert.doesNotThrow(() => regionKeyOf(A({ region_code: 'NONSENSE' })));
  assert.doesNotThrow(() => regionKeyOf(A({ country_code: '', region_code: null })));
  /* But regionOf does, and a caller picks the one that suits it. */
  assert.throws(() => regionOf(A({ region_code: 'NONSENSE' })), RegionError);
});

/* =============================================================================
   V. INNER LONDON — THE ONS FOURTEEN, BEHIND A SURVEYOR SWITCH (Phase 132e,
      16 September 2026). OFF.

   The list comes from an UNSIGNED draft answer in the surveyor's answer box,
   checked at ONS on 16 September 2026. It is not the surveyor's answer, so the
   switch stays off. These tests prove three things: off is exactly what London
   did before this phase, field by field; on puts each of the 33 councils where
   ONS puts it; and "not sure" behaves the same as nothing at all (N4).

   The new names are read through a namespace import rather than added to the
   list at the top, so that run against the pre-change module the tests above
   still load and pass, and only these fail.
   ============================================================================= */

import * as REGION from './caprebate-region.ts';

const SWITCH = 'SURVEYOR_INNER_LONDON_ONS_FOURTEEN';
const ON = { [SWITCH]: true };

/* Read at ONS on 16 September 2026: LAD to Inner and Outer London (December
   2022) lookup, and the LAD (April 2025) to ITL lookup. Written out here in
   full, not imported, so the test does not check the module against itself. */
const ONS_INNER: Record<string, string> = {
  E09000001: 'City of London', E09000007: 'Camden', E09000012: 'Hackney',
  E09000013: 'Hammersmith and Fulham', E09000014: 'Haringey', E09000019: 'Islington',
  E09000020: 'Kensington and Chelsea', E09000022: 'Lambeth', E09000023: 'Lewisham',
  E09000025: 'Newham', E09000028: 'Southwark', E09000030: 'Tower Hamlets',
  E09000032: 'Wandsworth', E09000033: 'Westminster',
};
const ONS_OUTER: Record<string, string> = {
  E09000002: 'Barking and Dagenham', E09000003: 'Barnet', E09000004: 'Bexley',
  E09000005: 'Brent', E09000006: 'Bromley', E09000008: 'Croydon', E09000009: 'Ealing',
  E09000010: 'Enfield', E09000011: 'Greenwich', E09000015: 'Harrow', E09000016: 'Havering',
  E09000017: 'Hillingdon', E09000018: 'Hounslow', E09000021: 'Kingston upon Thames',
  E09000024: 'Merton', E09000026: 'Redbridge', E09000027: 'Richmond upon Thames',
  E09000029: 'Sutton', E09000031: 'Waltham Forest',
};
const LONDON_ALL = { ...ONS_INNER, ...ONS_OUTER };
const LDN = (code: unknown, name: unknown = 'Somewhere in London') =>
  A({ postcode: 'SW1A 1AA', lad_code: code, lad_name: name, region_code: 'E12000007' });

/* Every switch value that is not the boolean true. Each must be off. */
const OFF_SHAPES: unknown[] = [
  undefined, null, {}, { [SWITCH]: false }, { [SWITCH]: undefined }, { [SWITCH]: null },
  { [SWITCH]: 'not sure' }, { [SWITCH]: 'Not Sure' }, { [SWITCH]: 'true' },
  { [SWITCH]: 'yes' }, { [SWITCH]: 1 }, 'not sure', true,
];

/* THE PRE-CHANGE REFUSAL, captured by running the Phase 110 module (the
   .bak-phase132e copy) on 16 September 2026, before any edit. Copied here
   word for word so a change to the message is caught, not just a change of
   code. */
const PRE_CHANGE_MESSAGE = (ladName: unknown) =>
  `[E_LONDON_INNER_OUTER_UNRESOLVED] ${ladName} is in London, and the price book splits London into Inner ` +
  '(1.05) and Outer (1.00) — a 5% difference on a whole cost plan. It does not ' +
  'say which boroughs are which, and there are two published definitions of ' +
  'Inner London in ordinary use. That is a surveyor\'s judgement and it has been ' +
  'asked; refusing until it is answered rather than taking the cheaper of the two.';

const errWhole = (fn: () => unknown) => {
  try { return { returned: fn() }; } catch (e) {
    const x = e as RegionError;
    return {
      isRegionError: e instanceof RegionError, isError: e instanceof Error,
      name: x.name, code: x.code, message: x.message, detail: x.detail,
      ownKeys: Object.keys(x).sort(),
    };
  }
};

test('V1 nothing is switched on, the list is marked an unsigned draft, and no cost factor is loaded', () => {
  assert.equal(REGION.SURVEYOR_INNER_LONDON_ONS_FOURTEEN, SWITCH);
  assert.deepEqual({ ...REGION.REGION_SWITCHES }, { [SWITCH]: false });
  assert.equal(Object.isFrozen(REGION.REGION_SWITCHES), true);
  assert.equal(REGION.INNER_LONDON_LIST_STATUS.status, 'UNSIGNED_DRAFT_ANSWER');
  assert.equal(REGION.INNER_LONDON_LIST_STATUS.waits_on, 'the chartered surveyor');
  assert.equal(REGION.INNER_LONDON_LIST_STATUS.checked_at_ons, '16 September 2026');
  assert.equal(REGION.INNER_LONDON_LIST_STATUS.regional_cost_factor_loaded, false);
  /* Leaving the switches out is the default, and the default refuses. */
  assert.equal(codeOf(() => regionOf(LDN('E09000014'))), 'E_LONDON_INNER_OUTER_UNRESOLVED');
});

test('V2 the lists are the ONS fourteen and nineteen, all 33 London councils, no overlap, no figure', () => {
  assert.deepEqual({ ...REGION.INNER_LONDON_ONS_FOURTEEN }, ONS_INNER);
  assert.deepEqual({ ...REGION.OUTER_LONDON_ONS_NINETEEN }, ONS_OUTER);
  assert.equal(Object.keys(ONS_INNER).length, 14);
  assert.equal(Object.keys(ONS_OUTER).length, 19);
  const inner = Object.keys(REGION.INNER_LONDON_ONS_FOURTEEN);
  assert.equal(inner.some((c) => c in REGION.OUTER_LONDON_ONS_NINETEEN), false);
  /* Where the two published lists disagree: ONS puts Haringey and Newham in,
     and Greenwich out; the 1963 Act does the opposite. */
  assert.equal(REGION.INNER_LONDON_ONS_FOURTEEN.E09000014, 'Haringey');
  assert.equal(REGION.INNER_LONDON_ONS_FOURTEEN.E09000025, 'Newham');
  assert.equal(REGION.OUTER_LONDON_ONS_NINETEEN.E09000011, 'Greenwich');
  /* The R1 quarantine rule extends to the new lists. */
  const asText = JSON.stringify({ i: REGION.INNER_LONDON_ONS_FOURTEEN, o: REGION.OUTER_LONDON_ONS_NINETEEN });
  assert.equal(/\d\.\d/.test(asText), false);
});

test('V3 switch OFF: every London council refuses exactly as before Phase 132e, field by field', () => {
  for (const [code, name] of Object.entries(LONDON_ALL)) {
    for (const off of OFF_SHAPES) {
      const got = errWhole(() => regionOf(LDN(code, name), off as never));
      assert.deepEqual(got, {
        isRegionError: true, isError: true, name: 'RegionError',
        code: 'E_LONDON_INNER_OUTER_UNRESOLVED', message: PRE_CHANGE_MESSAGE(name),
        detail: { lad_code: code, lad_name: name }, ownKeys: ['code', 'detail', 'name'],
      }, `${name} with switch ${JSON.stringify(off)}`);
      assert.deepEqual(regionKeyOf(LDN(code, name), off as never), {
        region: REGION_NOT_CAPTURED, derived: false, why: PRE_CHANGE_MESSAGE(name),
      }, `${name} key with switch ${JSON.stringify(off)}`);
    }
  }
  /* And the odd inputs refuse as they always did — including the pre-change
     quirk of printing "undefined" when no council name was given. */
  for (const off of OFF_SHAPES) {
    const got = errWhole(() => regionOf(A({ postcode: 'SW1A 1AA', lad_code: undefined, lad_name: undefined, region_code: 'E12000007' }), off as never)) as { message: string; code: string };
    assert.equal(got.code, 'E_LONDON_INNER_OUTER_UNRESOLVED');
    assert.equal(got.message, PRE_CHANGE_MESSAGE(undefined));
    assert.equal(codeOf(() => regionOf(LDN('not sure'), off as never)), 'E_LONDON_INNER_OUTER_UNRESOLVED');
  }
});

test('V4 N4 the switch: "not sure", absent, null, "true" and 1 all give the same result as off', () => {
  const off = errWhole(() => regionOf(LDN('E09000014', 'Haringey'), { [SWITCH]: false }));
  const offKey = regionKeyOf(LDN('E09000014', 'Haringey'), { [SWITCH]: false });
  for (const shape of OFF_SHAPES) {
    assert.deepEqual(errWhole(() => regionOf(LDN('E09000014', 'Haringey'), shape as never)), off,
      `switch ${JSON.stringify(shape)} must behave exactly as off`);
    assert.deepEqual(regionKeyOf(LDN('E09000014', 'Haringey'), shape as never), offKey);
  }
  /* The two N4 cases side by side, named. */
  assert.deepEqual(errWhole(() => regionOf(LDN('E09000014', 'Haringey'), { [SWITCH]: 'not sure' })),
                   errWhole(() => regionOf(LDN('E09000014', 'Haringey'), undefined)));
});

test('V5 switch ON: each of the fourteen is Inner London', () => {
  for (const [code, name] of Object.entries(ONS_INNER)) {
    assert.equal(regionOf(LDN(code, name), ON), 'Inner London', name);
    /* Matched on the code, so spacing and case in the code do not matter and
       the name is not read at all. */
    assert.equal(regionOf(LDN(` ${code.toLowerCase()} `, 'not the real name'), ON), 'Inner London', name);
    assert.deepEqual(regionKeyOf(LDN(code, name), ON), { region: 'Inner London', derived: true, why: '' });
  }
});

test('V6 switch ON: each of the other nineteen is Outer London, Greenwich included', () => {
  for (const [code, name] of Object.entries(ONS_OUTER)) {
    assert.equal(regionOf(LDN(code, name), ON), 'Outer London', name);
    assert.deepEqual(regionKeyOf(LDN(code, name), ON), { region: 'Outer London', derived: true, why: '' });
  }
});

test('V7 switch ON: a council outside London is not affected', () => {
  const outside = [
    A(),                                                                      // Manchester
    A({ region_code: 'E12000008', lad_code: 'E07000209', lad_name: 'Guildford' }),
    A({ country_code: 'W92000004', region_code: null, lad_code: 'W06000015', lad_name: 'Cardiff' }),
    /* An Inner London code outside the London region is not read as London. */
    A({ region_code: 'E12000008', lad_code: 'E09000033', lad_name: 'Westminster' }),
    A({ region_code: null }),
    A({ region_code: 'E12000099' }),
  ];
  for (const a of outside) {
    assert.deepEqual(errWhole(() => regionOf(a, ON)), errWhole(() => regionOf(a)), a.lad_name);
    assert.deepEqual(regionKeyOf(a, ON), regionKeyOf(a), a.lad_name);
  }
  assert.equal(regionOf(outside[0], ON), 'North West');
  assert.equal(regionOf(outside[3], ON), 'South East');
});

test('V8 N4 the council code, switch ON: "not sure" and absent refuse identically, and never fall to Outer London', () => {
  const absent = errWhole(() => regionOf(LDN(undefined), ON));
  assert.equal((absent as { code: string }).code, 'E_LONDON_BOROUGH_UNRECOGNISED');
  assert.equal((absent as { detail: { reason: string } }).detail.reason, 'not_stated');
  for (const notKnown of [undefined, null, '', '   ', 'not sure', 'Not Sure', ' unsure ', 'unknown', 42]) {
    assert.deepEqual(errWhole(() => regionOf(LDN(notKnown), ON)), absent,
      `lad_code ${JSON.stringify(notKnown)} must behave exactly as an absent one`);
    assert.deepEqual(regionKeyOf(LDN(notKnown), ON), regionKeyOf(LDN(undefined), ON));
    assert.equal(regionKeyOf(LDN(notKnown), ON).region, REGION_NOT_CAPTURED);
  }
  /* A code that is stated but is not one of the 33 refuses too, naming it. */
  const odd = errWhole(() => regionOf(LDN('E09000099'), ON)) as { code: string; message: string; detail: { reason: string } };
  assert.equal(odd.code, 'E_LONDON_BOROUGH_UNRECOGNISED');
  assert.equal(odd.detail.reason, 'not_in_ons_list');
  assert.match(odd.message, /E09000099/);
  assert.match(odd.message, /rather than taking the cheaper/);
  assert.equal(codeOf(() => regionOf(LDN('E08000003'), ON)), 'E_LONDON_BOROUGH_UNRECOGNISED');
  assert.doesNotThrow(() => regionKeyOf(LDN('E09000099'), ON));
});
