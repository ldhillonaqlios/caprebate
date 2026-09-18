/* =============================================================================
   CAPREBATE — POSTCODE TO BILLING AUTHORITY RESOLVER, TESTS (Phase 9)

   Board item 12991298199.

   Run:  cd phase9 && node --test caprebate-postcode-authority.test.ts

   ---------------------------------------------------------------------------
   EVERY FIXTURE IN THIS FILE IS A HANDFUL OF ROWS TYPED BY HAND.

   No ONS file has been downloaded into this repository. The three postcodes
   used below — CF10 3NB, SW1A 1AA, M1 1AE — and the GSS codes they map to are
   the ones that were verified against the ONS live service on 7 September
   2026, and they are here as a SHAPE CHECK on the resolver, not as data. The
   real table is 2.7 million rows and arrives by ingest, not by being typed
   into a test file.
   ============================================================================= */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  ONS_LICENCE,
  PostcodeAuthorityError,
  normalisePostcode,
  postcodeArea,
  CB_ONS_POSTCODE_AUTHORITY,
  CB_LAD_TO_LOCATION_KEY,
  resolveBillingAuthority,
  resolveLocationKey,
  attributionFor,
  ingestNspl,
  createNsplIngest,
  onsFetchNotWired,
  tableIsStale,
  ONS_TABLE_MAX_AGE_DAYS,
  NSPL_COLUMNS_VERIFIED,
  type PostcodeAuthorityTable,
} from './caprebate-postcode-authority.ts';

const codeOf = (fn: () => unknown): string => {
  try { fn(); return 'NO_THROW'; } catch (e) {
    return e instanceof PostcodeAuthorityError ? e.code : (e as Error).name;
  }
};

const TABLE_FIXTURE: PostcodeAuthorityTable = {
  table_id: 'CB_ONS_POSTCODE_AUTHORITY',
  source: 'HAND-TYPED TEST FIXTURE - not an ONS file',
  licence: 'n/a - fixture',
  loaded: true,
  verified_at: '2026-09-07',
  release: 'AUG_2026',
  release_year: 2026,
  record_count: 4,
  byPostcode: {
    'CF10 3NB': { lad_code: 'W06000015', lad_name: 'Cardiff', country_code: 'W', terminated_on: null },
    'SW1A 1AA': { lad_code: 'E09000033', lad_name: 'Westminster', country_code: 'E', terminated_on: null },
    'M1 1AE':   { lad_code: 'E08000003', lad_name: 'Manchester', country_code: 'E', terminated_on: null },
    'M1 1AF':   { lad_code: 'E08000003', lad_name: 'Manchester', country_code: 'E', terminated_on: '2019-08-01' },
  },
};

const KEYS_FIXTURE = {
  table_id: 'CB_LAD_TO_LOCATION_KEY',
  source: 'HAND-TYPED TEST FIXTURE',
  licence: 'n/a - fixture',
  loaded: true,
  verified_at: '2026-09-07',
  byLadCode: { W06000015: 'cardiff', E09000033: 'london_inner' },
};

const ON = { tables: { CB_ONS_POSTCODE_AUTHORITY: TABLE_FIXTURE } };
const ON_BOTH = {
  tables: {
    CB_ONS_POSTCODE_AUTHORITY: TABLE_FIXTURE,
    CB_LAD_TO_LOCATION_KEY: KEYS_FIXTURE,
  },
};

/* =============================================================================
   A. NOTHING SHIPPED
   ============================================================================= */

test('A1 both tables ship empty, and say why in different terms', () => {
  assert.equal(CB_ONS_POSTCODE_AUTHORITY.loaded, false);
  assert.deepEqual(CB_ONS_POSTCODE_AUTHORITY.byPostcode, {});
  assert.equal(CB_ONS_POSTCODE_AUTHORITY.verified_at, null);
  assert.equal(CB_ONS_POSTCODE_AUTHORITY.record_count, 0);

  assert.equal(CB_LAD_TO_LOCATION_KEY.loaded, false);
  assert.deepEqual(CB_LAD_TO_LOCATION_KEY.byLadCode, {});

  /* THE TWO REASONS ARE NOT THE SAME REASON, and the licence strings have to
     say so — one is an ingest nobody has run, the other is money nobody has
     spent. A reader who conflates them will think buying the book is enough. */
  assert.match(CB_ONS_POSTCODE_AUTHORITY.licence, /^CLEARED/);
  assert.match(CB_LAD_TO_LOCATION_KEY.licence, /^NOT PURCHASED/);
});

test('A2 with nothing injected, the resolver refuses on the empty shipped table', () => {
  assert.equal(codeOf(() => resolveBillingAuthority('CF10 3NB')), 'E_TABLE_NOT_LOADED');
});

test('A3 the fetcher refuses, and NOT on licence grounds', () => {
  return onsFetchNotWired('https://example.invalid/nspl.zip').then(
    () => assert.fail('the fetcher must never resolve'),
    (e: PostcodeAuthorityError) => {
      assert.equal(e.code, 'E_NO_NETWORK_CALL_IN_ENGINE');
      /* The distinction from the VOA connector matters: that one refuses
         because of a licence and will one day stop refusing. This one refuses
         because the engine makes no network calls, and never stops. */
      assert.match(e.message, /licence IS cleared/);
      assert.match(e.message, /No network call has been attempted/);
    },
  );
});

/* =============================================================================
   B. Postcode normalisation — shape only, on purpose
   ============================================================================= */

test('B1 normalisation is canonical: uppercase, one space before the last three', () => {
  for (const raw of ['cf10 3nb', 'CF103NB', '  cf10   3nb  ', 'Cf10-3Nb']) {
    assert.equal(normalisePostcode(raw), 'CF10 3NB', `failed on ${raw}`);
  }
  assert.equal(normalisePostcode('m1 1ae'), 'M1 1AE');
  assert.equal(normalisePostcode('sw1a1aa'), 'SW1A 1AA');
  assert.equal(normalisePostcode('B1 1AA'), 'B1 1AA');
});

test('B2 every UK postcode shape is accepted', () => {
  /* AA9A 9AA, A9A 9AA, A9 9AA, A99 9AA, AA9 9AA, AA99 9AA — all six.
     A pattern that rejects one of these is a client who cannot be served,
     reported as "malformed" rather than as our bug. */
  for (const pc of ['EC1A 1BB', 'W1A 0AX', 'M1 1AE', 'B33 8TH', 'CR2 6XH', 'DN55 1PT']) {
    assert.equal(codeOf(() => normalisePostcode(pc)), 'NO_THROW', `rejected ${pc}`);
  }
});

test('B3 garbage refuses rather than returning an empty answer', () => {
  assert.equal(codeOf(() => normalisePostcode('')), 'E_POSTCODE_REQUIRED');
  assert.equal(codeOf(() => normalisePostcode('   ')), 'E_POSTCODE_REQUIRED');
  assert.equal(codeOf(() => normalisePostcode(undefined)), 'E_POSTCODE_REQUIRED');
  assert.equal(codeOf(() => normalisePostcode(12345)), 'E_POSTCODE_REQUIRED');
  assert.equal(codeOf(() => normalisePostcode('NOT A POSTCODE')), 'E_POSTCODE_MALFORMED');
  assert.equal(codeOf(() => normalisePostcode('CF1')), 'E_POSTCODE_MALFORMED');
  assert.equal(codeOf(() => normalisePostcode('CF10 3NBX')), 'E_POSTCODE_MALFORMED');
});

test('B4 GIR 0AA is admitted by shape and refused by the table, not the parser', () => {
  /* It is a real postcode with no local authority. The parser has no business
     deciding that; the table does, and its message is the useful one. */
  assert.equal(normalisePostcode('gir0aa'), 'GIR 0AA');
  assert.equal(codeOf(() => resolveBillingAuthority('GIR 0AA', ON)), 'E_POSTCODE_NOT_IN_TABLE');
});

test('B5 postcodeArea reads the letters before the first digit', () => {
  assert.equal(postcodeArea('CF10 3NB'), 'CF');
  assert.equal(postcodeArea('M1 1AE'), 'M');
  assert.equal(postcodeArea('BT1 5GS'), 'BT');
});

/* =============================================================================
   C. The resolver
   ============================================================================= */

test('C1 the three postcodes verified against the live ONS service resolve', () => {
  assert.equal(resolveBillingAuthority('CF10 3NB', ON).lad_code, 'W06000015');
  assert.equal(resolveBillingAuthority('SW1A 1AA', ON).lad_code, 'E09000033');
  assert.equal(resolveBillingAuthority('M1 1AE', ON).lad_code, 'E08000003');
  assert.equal(resolveBillingAuthority('cf10 3nb', ON).lad_name, 'Cardiff');
});

test('C2 an unlisted postcode REFUSES — it does not fall back to anything', () => {
  /* Same discipline as LEG-E4's unlisted region: a nearby authority or a
     national default would be an invented answer that looks like a real one. */
  assert.equal(codeOf(() => resolveBillingAuthority('CF10 3NX', ON)), 'E_POSTCODE_NOT_IN_TABLE');
});

test('C3 a terminated postcode refuses by default and is flagged when accepted', () => {
  assert.equal(codeOf(() => resolveBillingAuthority('M1 1AF', ON)), 'E_POSTCODE_TERMINATED');
  const forced = resolveBillingAuthority('M1 1AF', { ...ON, allowTerminated: true });
  assert.equal(forced.lad_code, 'E08000003');
  assert.equal(forced.terminated_on, '2019-08-01');
  assert.ok(forced.flags.includes('POSTCODE_TERMINATED_ACCEPTED'));
});

test('C4 Northern Ireland refuses on LICENCE grounds, before the table is even read', () => {
  /* Asserted against the EMPTY shipped table on purpose. If the licence check
     ran after the table check this would report E_TABLE_NOT_LOADED, and the
     day somebody ingests a table it would silently start resolving BT
     postcodes we are not licensed to use commercially. */
  assert.equal(codeOf(() => resolveBillingAuthority('BT1 5GS')), 'E_POSTCODE_NORTHERN_IRELAND');
  assert.equal(codeOf(() => resolveBillingAuthority('BT1 5GS', ON)), 'E_POSTCODE_NORTHERN_IRELAND');
});

test('C5 Scotland is NOT excluded — the carve-out is Northern Ireland alone', () => {
  /* This matters commercially: widening to Scotland is free, widening to
     Northern Ireland costs a licence. A blanket "Great Britain only" reading
     would have wrongly blocked Scotland too. */
  assert.equal(ONS_LICENCE.excluded_territory.postcode_area, 'BT');
  const scots: PostcodeAuthorityTable = {
    ...TABLE_FIXTURE,
    byPostcode: {
      'EH1 1YZ': { lad_code: 'S12000036', lad_name: 'City of Edinburgh', country_code: 'S', terminated_on: null },
    },
  };
  const r = resolveBillingAuthority('EH1 1YZ', { tables: { CB_ONS_POSTCODE_AUTHORITY: scots } });
  assert.equal(r.lad_code, 'S12000036');
});

test('C6 every answer carries the three attribution lines the licence requires', () => {
  const r = resolveBillingAuthority('CF10 3NB', ON);
  assert.equal(r.attribution.length, 3);
  assert.ok(r.attribution.some((l) => /Ordnance|OS data/.test(l)));
  assert.ok(r.attribution.some((l) => /Royal Mail/.test(l)));
  assert.ok(r.attribution.some((l) => /Office for National Statistics/.test(l)));
  /* the year is substituted, not left as a placeholder in a client report */
  assert.ok(r.attribution.every((l) => !l.includes('[year]')));
  assert.ok(r.attribution.some((l) => l.includes('2026')));
});

test('C7 an un-ingested table renders the placeholder rather than a wrong year', () => {
  const lines = attributionFor(CB_ONS_POSTCODE_AUTHORITY);
  assert.ok(lines.every((l) => l.includes('[year]') || !/\d{4}/.test(l)));
});

/* =============================================================================
   D. The chain to LEG-E4 — and the honest limit
   ============================================================================= */

test('D1 the chain refuses at the PURCHASE link, with a different code from the ingest link', () => {
  /* The whole point of the item. Resolving the postcode removes one of the two
     things in LEG-E4's way. Somebody reading only the board could conclude it
     removes both. */
  const e = codeOf(() => resolveLocationKey('CF10 3NB', ON));
  assert.equal(e, 'E_LOCATION_KEY_TABLE_NOT_LOADED');
  assert.notEqual(e, 'E_TABLE_NOT_LOADED');
});

test('D2 the refusal names what was resolved, so the message is not a dead end', () => {
  try {
    resolveLocationKey('CF10 3NB', ON);
    assert.fail('should have refused');
  } catch (e) {
    const err = e as PostcodeAuthorityError;
    assert.match(err.message, /Cardiff/);
    assert.match(err.message, /W06000015/);
    assert.match(err.message, /price book has not been bought/);
    assert.equal(err.detail.lad_code, 'W06000015');
  }
});

test('D3 with both tables loaded the full chain returns a location key', () => {
  const r = resolveLocationKey('CF10 3NB', ON_BOTH);
  assert.equal(r.location_key, 'cardiff');
  assert.equal(r.authority.lad_name, 'Cardiff');
  /* and that key is the shape LEG-E4's own fixture is keyed on */
  assert.equal(typeof r.location_key, 'string');
});

test('D4 a LAD absent from the price book map refuses rather than defaulting to the mean', () => {
  assert.equal(codeOf(() => resolveLocationKey('M1 1AE', ON_BOTH)),
    'E_LAD_NOT_IN_LOCATION_KEY_TABLE');
});

/* =============================================================================
   E. Ingest
   ============================================================================= */

/* The REAL August 2026 header, trimmed to the columns this module reads.
   Verified by downloading NSPL_AUG_2026.zip on 8 September 2026 — the local
   authority column is `lad26cd`, not the `laua` this module first assumed. */
const HEADER = 'pcd7,pcd8,pcds,dointr,doterm,lad26cd,ctry26cd';
const NAMES = { W06000015: 'Cardiff', E08000003: 'Manchester' };
const META = { release: 'AUG_2026', release_year: 2026, verified_at: '2026-09-08' };

test('E1 a good file ingests and the table becomes usable', () => {
  const csv = [
    HEADER,
    'CF1 1AA,CF1  1AA,CF10 3NB,199801,,W06000015,W92000004',
    'M1 1AE,M1  1AE,M1 1AE,199801,,E08000003,E92000001',
  ].join('\n');
  const { table, quarantined } = ingestNspl(csv, NAMES, META);
  assert.equal(quarantined.length, 0);
  assert.equal(table.loaded, true);
  assert.equal(table.record_count, 2);
  assert.equal(table.release, 'AUG_2026');
  assert.equal(resolveBillingAuthority('CF10 3NB',
    { tables: { CB_ONS_POSTCODE_AUTHORITY: table } }).lad_name, 'Cardiff');
});

test('E2 a bad ROW is quarantined with a reason; it never throws and never vanishes', () => {
  const csv = [
    HEADER,
    'CF1 1AA,CF1  1AA,CF10 3NB,199801,,W06000015,W92000004',
    'XX,XX,NOT A POSTCODE,199801,,E08000003,E92000001',
    'M1 1AE,M1  1AE,M1 1AE,199801,,,E92000001',
    'CF1 1AA,CF1  1AA,CF10 3NB,199801,,W06000015,W92000004',
    'short,row',
  ].join('\n');
  const { table, quarantined } = ingestNspl(csv, NAMES, META);
  assert.equal(table.record_count, 1);
  const codes = quarantined.map((q) => q.code).sort();
  assert.deepEqual(codes, [
    'E_BAD_COLUMN_COUNT', 'E_DUPLICATE_POSTCODE', 'E_MALFORMED_POSTCODE', 'E_MISSING_LAD_CODE',
  ]);
  /* every quarantined row keeps its line number and its raw text, so a human
     can go and look at it rather than being told a count */
  for (const q of quarantined) {
    assert.ok(q.line_number > 1);
    assert.ok(q.raw_line.length > 0);
    assert.ok(q.reason.length > 0);
  }
});

test('E3 Northern Ireland rows are dropped AT INGEST, not merely refused at lookup', () => {
  /* Keeping them and refusing later would mean holding data we are not
     licensed to use commercially, which is the thing the carve-out forbids. */
  const csv = [
    HEADER,
    'BT1 5GS,BT1  5GS,BT1 5GS,199801,,N09000003,N92000002',
    'CF1 1AA,CF1  1AA,CF10 3NB,199801,,W06000015,W92000004',
  ].join('\n');
  const { table, quarantined } = ingestNspl(csv, NAMES, META);
  assert.equal(table.record_count, 1);
  assert.equal(Object.keys(table.byPostcode).some((p) => p.startsWith('BT')), false);
  assert.equal(quarantined[0].code, 'E_NORTHERN_IRELAND_ROW');
});

test('E4 a terminated row is kept, with its date — it is a fact, not a defect', () => {
  const csv = [HEADER, 'M1 1AF,M1  1AF,M1 1AF,199801,201908,E08000003,E92000001'].join('\n');
  const { table, quarantined } = ingestNspl(csv, NAMES, META);
  assert.equal(quarantined.length, 0);
  assert.equal(table.byPostcode['M1 1AF'].terminated_on, '201908');
});

test('E5 a bad FILE throws, and the column assumption is named in the message', () => {
  assert.equal(codeOf(() => ingestNspl('', NAMES, META)), 'E_EMPTY_FILE');
  assert.equal(codeOf(() => ingestNspl(HEADER, NAMES, META)), 'E_MISSING_HEADER');

  const wrong = ['pcds,doterm,council', 'CF10 3NB,,W06000015'].join('\n');
  assert.equal(codeOf(() => ingestNspl(wrong, NAMES, META)), 'E_UNKNOWN_COLUMN');
  try {
    ingestNspl(wrong, NAMES, META);
  } catch (e) {
    /* THE MESSAGE IS THE POINT. ONS renames this column every release, so the
       likeliest reader of this error is a quarterly refresh six months from
       now — and they must be told that, not left to think the file is corrupt. */
    assert.match((e as Error).message, /versioned local-authority pattern/);
    assert.match((e as Error).message, /renames this column each\s+release/);
  }
});

test('E5b the local-authority column is VERSIONED, and a future release still ingests', () => {
  /* THE DEFECT THIS PREVENTS IS A TIME BOMB. ONS publishes quarterly and this
     table refreshes quarterly, so a hard-coded column name fails on roughly
     the fourth refresh and presents as a corrupt download. Every vintage of
     the name must keep working, and the table must record which it used. */
  for (const col of ['lad26cd', 'lad25cd', 'lad27cd', 'laua']) {
    const csv = [`pcds,doterm,${col}`, 'CF10 3NB,,W06000015'].join('\n');
    const { table } = ingestNspl(csv, NAMES, META);
    assert.equal(table.record_count, 1, `failed on ${col}`);
    assert.equal(table.lad_column_used, col,
      'the table must record which column it was actually built from');
  }
});

test('E5c the UTF-8 byte-order mark on the ONS files does not break the header', () => {
  /* Left in place the BOM makes the first column unmatchable while looking
     identical in the error message printed beside it. The real ONS names file
     carries one. */
  const csv = ['\uFEFFpcds,doterm,lad26cd', 'CF10 3NB,,W06000015'].join('\n');
  const { table } = ingestNspl(csv, NAMES, META);
  assert.equal(table.record_count, 1);
});

test('E5d the country code is read from the file where ONS gives it', () => {
  const withCtry = ingestNspl(
    ['pcds,doterm,lad26cd,ctry26cd', 'CF10 3NB,,W06000015,W92000004'].join('\n'), NAMES, META);
  assert.equal(withCtry.table.byPostcode['CF10 3NB'].country_code, 'W92000004');
  /* and falls back to the GSS code's first letter where it does not */
  const without = ingestNspl(
    ['pcds,doterm,lad26cd', 'CF10 3NB,,W06000015'].join('\n'), NAMES, META);
  assert.equal(without.table.byPostcode['CF10 3NB'].country_code, 'W');
});

test('E6 the column names are an argument, so correcting the assumption is a one-liner', () => {
  const csv = ['postcode,end_date,council', 'CF10 3NB,,W06000015'].join('\n');
  const { table } = ingestNspl(csv, NAMES, META,
    { postcode: 'postcode', terminated: 'end_date', lad_code: 'council' });
  assert.equal(table.record_count, 1);
  assert.equal(table.byPostcode['CF10 3NB'].lad_name, 'Cardiff');
  /* and the default is now the VERIFIED name, not the old assumption */
  assert.equal(NSPL_COLUMNS_VERIFIED.lad_code, 'lad26cd');
  assert.equal(NSPL_COLUMNS_VERIFIED.postcode, 'pcds');
  assert.equal(NSPL_COLUMNS_VERIFIED.terminated, 'doterm');
});

test('E7 an unknown LAD code falls back to the code itself, never to a blank name', () => {
  const csv = [HEADER, 'CF1 1AA,CF1  1AA,CF10 3NB,199801,,W06000099,W92000004'].join('\n');
  const { table } = ingestNspl(csv, {}, META);
  assert.equal(table.byPostcode['CF10 3NB'].lad_name, 'W06000099');
});

/* =============================================================================
   F. Staleness against the publisher's own cadence
   ============================================================================= */

test('F1 an un-ingested table is stale by definition', () => {
  assert.equal(tableIsStale(CB_ONS_POSTCODE_AUTHORITY, new Date('2026-09-08')), true);
});

test('F2 staleness tracks the quarterly release plus a month of grace', () => {
  assert.equal(ONS_TABLE_MAX_AGE_DAYS, 120);
  assert.equal(ONS_LICENCE.release_cadence_months, 3);
  assert.equal(tableIsStale(TABLE_FIXTURE, new Date('2026-10-01')), false);
  assert.equal(tableIsStale(TABLE_FIXTURE, new Date('2027-06-01')), true);
});

/* =============================================================================
   G. The licence record itself
   ============================================================================= */

test('G1 the licence record says, in data, that nothing has to be negotiated', () => {
  assert.equal(ONS_LICENCE.negotiation_required, false);
  assert.equal(ONS_LICENCE.fee, null);
  assert.equal(ONS_LICENCE.licence, 'Open Government Licence v3.0');
  assert.equal(ONS_LICENCE.verified_on, '2026-09-07');
});

test('G2 the generic OGL attribution line is NOT what this source uses', () => {
  /* Reusing "Contains public sector information licensed under the Open
     Government Licence v3.0" here would under-attribute and breach the
     licence: ONS requires the Ordnance Survey and Royal Mail lines too. */
  const joined = ONS_LICENCE.attribution_lines.join(' | ');
  assert.equal(ONS_LICENCE.attribution_lines.length, 3);
  assert.ok(!joined.includes('Contains public sector information'));
});

/* =============================================================================
   H. The size of the real file — a defect found only by running it
   ============================================================================= */

test('H1 the incremental ingester takes a header and rows separately', () => {
  /* WHY THIS EXISTS. This module first exposed only ingestNspl(csvText). That
     API cannot read the file it was written for: the real UK extract is 964 MB
     of CSV and Node's maximum string length is about 512 MB, so reading it as
     a string throws ERR_STRING_TOO_LONG before a single row is parsed. Every
     test above passed, because every fixture is three lines. Found 8 September
     2026 by running the ingest against the actual download. */
  const ing = createNsplIngest(NAMES, META);
  assert.equal(ing.header('pcds,doterm,lad26cd,ctry26cd'), 'lad26cd');
  assert.equal(ing.row('CF10 3NB,,W06000015,W92000004', 2), true);
  assert.equal(ing.row('NOT A POSTCODE,,W06000015,W92000004', 3), false);
  const { table, quarantined } = ing.finish();
  assert.equal(table.record_count, 1);
  assert.equal(quarantined.length, 1);
  assert.equal(table.byPostcode['CF10 3NB'].lad_name, 'Cardiff');
});

test('H2 a row before a header refuses rather than silently mis-indexing', () => {
  const ing = createNsplIngest(NAMES, META);
  assert.equal(codeOf(() => ing.row('CF10 3NB,,W06000015', 2)), 'E_MISSING_HEADER');
});

test('H3 the whole-file wrapper and the streaming core agree', () => {
  const header = 'pcds,doterm,lad26cd,ctry26cd';
  const rows = ['CF10 3NB,,W06000015,W92000004', 'M1 1AE,,E08000003,E92000001'];
  const whole = ingestNspl([header, ...rows].join('\n'), NAMES, META);

  const ing = createNsplIngest(NAMES, META);
  ing.header(header);
  rows.forEach((r, i) => ing.row(r, i + 2));
  const streamed = ing.finish();

  assert.deepEqual(streamed.table.byPostcode, whole.table.byPostcode);
  assert.equal(streamed.table.record_count, whole.table.record_count);
});

test('H4 three-letter outward codes are real postcodes, not malformed input', () => {
  /* FOUND BY RUNNING THE REAL FILE. Ingesting NSPL_AUG_2026 quarantined 2,418
     postcodes as malformed; 2,417 were NPT — historic Newport, superseded by
     NP but still carried by ONS. All terminated, so none would have resolved
     anyway. What would have been wrong is the REASON given to the client. */
  assert.equal(normalisePostcode('npt0ad'), 'NPT 0AD');
  assert.equal(normalisePostcode('NPT 0AD'), 'NPT 0AD');
  assert.equal(postcodeArea('NPT 0AD'), 'NPT');
  assert.equal(normalisePostcode('GIR 0AA'), 'GIR 0AA');
  assert.equal(postcodeArea('GIR 0AA'), 'GIR');

  /* and the allow-list stays an allow-list — three arbitrary letters are still
     malformed, because loosening the pattern would admit real garbage */
  assert.equal(codeOf(() => normalisePostcode('ZZZ 0AA')), 'E_POSTCODE_MALFORMED');
  assert.equal(codeOf(() => normalisePostcode('ABC 1DE')), 'E_POSTCODE_MALFORMED');
});

test('H5 an NPT postcode reports TERMINATED, not malformed — the reason is the point', () => {
  const npt: PostcodeAuthorityTable = {
    ...TABLE_FIXTURE,
    byPostcode: {
      'NPT 0AD': { lad_code: 'W06000022', lad_name: 'Newport', country_code: 'W', terminated_on: '200005' },
    },
  };
  assert.equal(codeOf(() => resolveBillingAuthority('NPT 0AD',
    { tables: { CB_ONS_POSTCODE_AUTHORITY: npt } })), 'E_POSTCODE_TERMINATED');
});
