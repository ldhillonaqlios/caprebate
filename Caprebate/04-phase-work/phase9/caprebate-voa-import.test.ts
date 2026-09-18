/**
 * Caprebate — VOA Bulk Data Import Connector tests. Board item 12830205481.
 * Every fixture below is hand-written inline — no file has ever been fetched
 * from the VOA, and this test file must never gain a network call.
 * Run:  node --test caprebate-voa-import.test.ts
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  VOA_LIST_YEARS,
  VOA_EPOCH_COLUMNS,
  VOA_CHANGE_COLUMNS,
  VoaImportError,
  VoaRegister,
  parseEpochFile,
  parseChangeFile,
  toSchemaCells,
  emptyReferenceTables,
  planNightlyFetch,
  voaFetchNotCleared,
  runNightlyWatch,
  type VoaFetchPlan,
  type VoaListStatus,
} from './caprebate-voa-import.ts';

const NOW = '2026-08-27T09:00:00Z';

/* --- fixtures: hand-written inline, never fetched ------------------ */

const EPOCH_HEADER = VOA_EPOCH_COLUMNS.join('|');
const CHANGE_HEADER = VOA_CHANGE_COLUMNS.join('|');

const EPOCH_2023_GOOD = [
  '#LIST_YEAR 2023',
  EPOCH_HEADER,
  '10012345|1234567000|OFFICES AND PREMISES|UNIT 4|CAPREBATE BUSINESS PARK|MAIN STREET||AB1 2CD|2023-04-01|18500|249|N|2023-03-15|420.5',
  '10012346|1234567001|RETAIL PREMISES|5 HIGH STREET||||AB1 2CE|2023-04-01|12000|203|N|2023-03-15|',
].join('\n');

const EPOCH_2023_WITH_BAD_ROWS = [
  '#LIST_YEAR 2023',
  EPOCH_HEADER,
  '10012345|1234567000|OFFICES AND PREMISES|UNIT 4|CAPREBATE BUSINESS PARK|MAIN STREET||AB1 2CD|2023-04-01|18500|249|N|2023-03-15|420.5',
  '|1234567002|MISSING BA REF|UNIT 5||||AB1 2CF|2023-04-01|9000|203|N|2023-03-15|',
  '10012347|1234567003|BAD RATEABLE VALUE|UNIT 6||||AB1 2CG|2023-04-01|NOT-A-NUMBER|203|N|2023-03-15|',
  '10012348|1234567004|TOO FEW COLUMNS|UNIT 7|AB1 2CH|2023-04-01|5000|203|N|2023-03-15',
  '10012345|1234567005|DUPLICATE BA REF|UNIT 8||||AB1 2CJ|2023-04-01|7000|203|N|2023-03-15|',
  '10012349|1234567006|BAD DATE|UNIT 9||||AB1 2CK|01-04-2023|6000|203|N|2023-03-15|',
  '10012350|1234567007|BAD COMPOSITE|UNIT 10||||AB1 2CL|2023-04-01|6500|203|MAYBE|2023-03-15|',
  '10012351|1234567008|BAD AREA|UNIT 11||||AB1 2CM|2023-04-01|7200|203|N|2023-03-15|abc',
].join('\n');

const EPOCH_2017_EMPTY = ['#LIST_YEAR 2017', EPOCH_HEADER].join('\n');

function changeFile(listYear: string, seq: number, rows: readonly string[]): string {
  return ['#LIST_YEAR ' + listYear, '#SEQ ' + String(seq), CHANGE_HEADER, ...rows].join('\n');
}

const CHANGE_2023_SEQ1 = changeFile('2023', 1, [
  'AMEND|10012345|1234567000|OFFICES AND PREMISES|UNIT 4|CAPREBATE BUSINESS PARK|MAIN STREET||AB1 2CD|2023-04-01|19000|249|N|2023-06-01|420.5',
  'ADD|10013000|1234568000|NEW UNIT|UNIT 20||||AB1 3CD|2023-05-01|8000|203|N|2023-05-15|',
]);

const CHANGE_2023_SEQ2 = changeFile('2023', 2, ['DELETE|10012346|||||||||||||']);

const CHANGE_2023_SEQ3_WITH_BAD_ROWS = changeFile('2023', 3, [
  // ADD of a BA reference that already exists -> quarantined, not thrown.
  'ADD|10013000|1234568000|NEW UNIT DUPLICATE|UNIT 20||||AB1 3CD|2023-05-01|8000|203|N|2023-05-15|',
  // AMEND of a BA reference that was never added -> quarantined.
  'AMEND|99999999|1234569000|GHOST RECORD|UNIT 99||||AB1 9ZZ|2023-05-01|1000|203|N|2023-05-15|',
  // DELETE of a BA reference already removed in seq 2 -> quarantined.
  'DELETE|10012346|||||||||||||',
  // A genuinely good row alongside the three bad ones, to prove the batch isn't poisoned.
  'ADD|10014000|1234570000|GOOD ROW|UNIT 21||||AB1 4CD|2023-06-01|9500|203|N|2023-06-01|',
]);

/* --- VoaListYear: four lists, never merged -------------------------- */

test('T1 exactly four tracked list years, all distinct', () => {
  assert.equal(VOA_LIST_YEARS.length, 4);
  assert.equal(new Set(VOA_LIST_YEARS).size, 4);
});

test('T2 loading an epoch under the wrong declared year is refused', () => {
  const reg = new VoaRegister({ clock: () => NOW });
  assert.throws(
    () => reg.loadEpoch('2017', EPOCH_2023_GOOD, NOW),
    (e: VoaImportError) => e.code === 'E_LIST_YEAR_MISMATCH',
  );
});

test('T3 applying a change file whose declared year does not match the target list is refused', () => {
  const reg = new VoaRegister({ clock: () => NOW });
  reg.loadEpoch('2023', EPOCH_2023_GOOD, NOW);
  const wrongYearChange = changeFile('2017', 1, ['DELETE|10012346|||||||||||||']);
  assert.throws(
    () => reg.applyChange('2023', wrongYearChange, NOW),
    (e: VoaImportError) => e.code === 'E_LIST_YEAR_MISMATCH',
  );
});

test('T4 a change file cannot be applied before an epoch exists for that list', () => {
  const reg = new VoaRegister({ clock: () => NOW });
  assert.throws(
    () => reg.applyChange('2023', CHANGE_2023_SEQ1, NOW),
    (e: VoaImportError) => e.code === 'E_EPOCH_NOT_LOADED',
  );
});

test('T5 an unknown list year is refused, not silently coerced', () => {
  const reg = new VoaRegister({ clock: () => NOW });
  assert.throws(
    // @ts-expect-error deliberately passing a year outside the tracked four
    () => reg.loadEpoch('1999', EPOCH_2023_GOOD, NOW),
    (e: VoaImportError) => e.code === 'E_UNKNOWN_LIST_YEAR',
  );
});

/* --- epoch loader ---------------------------------------------------- */

test('T6 a clean epoch file loads both records with no quarantine', () => {
  const { records, quarantined } = parseEpochFile('2023', EPOCH_2023_GOOD);
  assert.equal(records.length, 2);
  assert.equal(quarantined.length, 0);
  const a = records.find((r) => r.ba_reference === '10012345')!;
  assert.equal(a.rateable_value, 18500);
  assert.equal(a.total_area_m2, 420.5);
  const b = records.find((r) => r.ba_reference === '10012346')!;
  assert.equal(b.total_area_m2, null);
});

test('T7 loadEpoch sets epoch_loaded, resets last_applied_change_seq to 0', () => {
  const reg = new VoaRegister({ clock: () => NOW });
  const result = reg.loadEpoch('2023', EPOCH_2023_GOOD, NOW);
  assert.equal(result.record_count, 2);
  assert.equal(result.quarantined.length, 0);
  const status = reg.status('2023');
  assert.equal(status.epoch_loaded, true);
  assert.equal(status.last_applied_change_seq, 0);
  assert.equal(status.record_count, 2);
});

/* --- malformed rows: quarantined, never dropped, never poison the batch */

test('T8 malformed rows are quarantined with a reason and code; the good row still parses', () => {
  const { records, quarantined } = parseEpochFile('2023', EPOCH_2023_WITH_BAD_ROWS);
  assert.equal(records.length, 1);
  assert.equal(records[0].ba_reference, '10012345');
  assert.equal(quarantined.length, 7);
  const codes = quarantined.map((q) => q.code).sort();
  assert.deepEqual(codes, [
    'E_BAD_AREA',
    'E_BAD_COLUMN_COUNT',
    'E_BAD_COMPOSITE_INDICATOR',
    'E_BAD_DATE',
    'E_BAD_RATEABLE_VALUE',
    'E_DUPLICATE_BA_REFERENCE',
    'E_MISSING_BA_REFERENCE',
  ]);
  // every quarantine row carries a human-readable reason and its source line
  for (const q of quarantined) {
    assert.ok(q.reason.length > 0);
    assert.ok(q.line_number > 0);
    assert.ok(q.raw_line.length > 0);
  }
});

/* --- change-file ordering: sequence, gaps, idempotency -------------- */

test('T9 change files apply in sequence and mutate the snapshot correctly', () => {
  const reg = new VoaRegister({ clock: () => NOW });
  reg.loadEpoch('2023', EPOCH_2023_GOOD, NOW);
  const r1 = reg.applyChange('2023', CHANGE_2023_SEQ1, NOW);
  assert.equal(r1.applied, true);
  if (r1.applied) {
    assert.equal(r1.seq, 1);
    assert.equal(r1.quarantined.length, 0);
    assert.equal(r1.record_count, 3); // 2 original + 1 ADD
  }
  const amended = reg.lookup('2023', '10012345')!;
  assert.equal(amended.rateable_value, 19000);
  const added = reg.lookup('2023', '10013000')!;
  assert.equal(added.description, 'NEW UNIT');
  assert.equal(reg.status('2023').last_applied_change_seq, 1);
});

test('T10 a gap in the change sequence is refused, not silently skipped', () => {
  const reg = new VoaRegister({ clock: () => NOW });
  reg.loadEpoch('2023', EPOCH_2023_GOOD, NOW);
  reg.applyChange('2023', CHANGE_2023_SEQ1, NOW); // seq 1 applied
  const seq3 = changeFile('2023', 3, ['DELETE|10012346|||||||||||||']); // skips seq 2
  assert.throws(
    () => reg.applyChange('2023', seq3, NOW),
    (e: VoaImportError) => e.code === 'E_SEQUENCE_GAP',
  );
  // state must be unchanged after the refusal
  assert.equal(reg.status('2023').last_applied_change_seq, 1);
});

test('T11 re-applying the same change file is idempotent, not an error', () => {
  const reg = new VoaRegister({ clock: () => NOW });
  reg.loadEpoch('2023', EPOCH_2023_GOOD, NOW);
  reg.applyChange('2023', CHANGE_2023_SEQ1, NOW);
  const before = reg.status('2023');
  const replay = reg.applyChange('2023', CHANGE_2023_SEQ1, NOW);
  assert.equal(replay.applied, false);
  if (!replay.applied) {
    assert.equal(replay.reason, 'ALREADY_APPLIED');
    assert.equal(replay.seq, 1);
  }
  const after = reg.status('2023');
  assert.deepEqual(after, before);
});

test('T12 sequential change files chain correctly through seq 1 and seq 2', () => {
  const reg = new VoaRegister({ clock: () => NOW });
  reg.loadEpoch('2023', EPOCH_2023_GOOD, NOW);
  reg.applyChange('2023', CHANGE_2023_SEQ1, NOW);
  const r2 = reg.applyChange('2023', CHANGE_2023_SEQ2, NOW);
  assert.equal(r2.applied, true);
  if (r2.applied) assert.equal(r2.record_count, 2); // 3 - 1 deleted
  assert.equal(reg.lookup('2023', '10012346'), null);
  assert.equal(reg.status('2023').last_applied_change_seq, 2);
});

/* --- change-row application quarantine, per-row (not per-file) ------ */

test('T13 ADD-onto-existing, AMEND-of-missing and DELETE-of-missing are quarantined, not thrown', () => {
  const reg = new VoaRegister({ clock: () => NOW });
  reg.loadEpoch('2023', EPOCH_2023_GOOD, NOW);
  reg.applyChange('2023', CHANGE_2023_SEQ1, NOW);
  reg.applyChange('2023', CHANGE_2023_SEQ2, NOW);
  const r3 = reg.applyChange('2023', CHANGE_2023_SEQ3_WITH_BAD_ROWS, NOW);
  assert.equal(r3.applied, true);
  if (r3.applied) {
    const codes = r3.quarantined.map((q) => q.code).sort();
    assert.deepEqual(codes, ['E_ADD_ALREADY_EXISTS', 'E_AMEND_MISSING_RECORD', 'E_DELETE_MISSING_RECORD']);
    // the one genuinely good row in the same file must still have applied
    assert.equal(r3.record_count, 3); // 2 remaining + the good ADD (10014000)
  }
  assert.ok(reg.lookup('2023', '10014000'));
  assert.equal(reg.lookup('2023', '99999999'), null);
});

/* --- schema field mapping: provenance API, grade A ------------------- */

test('T14 toSchemaCells maps onto the phase-3 VOA field whitelist, provenance API grade A', () => {
  const { records } = parseEpochFile('2023', EPOCH_2023_GOOD);
  const withArea = records.find((r) => r.ba_reference === '10012345')!;
  const cells = toSchemaCells(withArea);
  const byId = new Map(cells.map((c) => [c.field_id, c]));
  assert.equal(byId.get('voa_ba_reference')!.value, '10012345');
  assert.equal(byId.get('voa_summary_valuation')!.value, 18500);
  assert.equal(byId.get('voa_scat_code')!.value, '249');
  assert.equal(byId.get('voa_effective_date')!.value, '2023-04-01');
  assert.equal(byId.get('voa_total_area_m2')!.present, true);
  for (const c of cells) {
    assert.equal(c.prov, 'API');
    assert.equal(c.grade, 'A');
    assert.equal(c.source_id, 'VOA');
  }
});

test('T15 toSchemaCells marks voa_total_area_m2 not-present when the bulk record lacks it, with a note', () => {
  const { records } = parseEpochFile('2023', EPOCH_2023_GOOD);
  const withoutArea = records.find((r) => r.ba_reference === '10012346')!;
  const cells = toSchemaCells(withoutArea);
  const area = cells.find((c) => c.field_id === 'voa_total_area_m2')!;
  assert.equal(area.present, false);
  assert.equal(area.value, null);
  assert.ok(area.note && area.note.includes('Assumption A-6'));
});

/* --- the empty, clearly-labelled reference-table stub ---------------- */

test('T16 every list year starts as an unloaded stub, loaded:false', () => {
  const stubs = emptyReferenceTables();
  assert.equal(stubs.size, 4);
  for (const y of VOA_LIST_YEARS) {
    const s = stubs.get(y)!;
    assert.equal(s.loaded, false);
    assert.ok(s.reason.toLowerCase().includes('licence'));
  }
});

test('T17 a register reports loaded:false until an epoch is actually loaded, then loaded:true', () => {
  const reg = new VoaRegister({ clock: () => NOW });
  const before = reg.referenceTable('2023');
  assert.equal(before.loaded, false);
  reg.loadEpoch('2023', EPOCH_2023_GOOD, NOW);
  const after = reg.referenceTable('2023');
  assert.equal(after.loaded, true);
  if (after.loaded) {
    assert.equal(after.records.length, 2);
    assert.equal(after.last_applied_change_seq, 0);
  }
});

/* --- cross-year isolation: never silently merged --------------------- */

test('T18 lookupAcrossYears keeps list years distinct, never merges them into one record', () => {
  const reg = new VoaRegister({ clock: () => NOW });
  reg.loadEpoch('2023', EPOCH_2023_GOOD, NOW);
  reg.loadEpoch('2017', EPOCH_2017_EMPTY, NOW);
  // Same BA reference re-used across two list years on revaluation is a real-world
  // occurrence; the register must report both, tagged by year, never one merged blob.
  const changeAddTo2017 = changeFile('2017', 1, [
    'ADD|10012345|9999999999|A DIFFERENT PROPERTY UNDER THE SAME BA REF|UNIT 1||||AB1 9ZZ|2017-04-01|5000|203|N|2017-04-01|',
  ]);
  reg.applyChange('2017', changeAddTo2017, NOW);
  const across = reg.lookupAcrossYears('10012345');
  assert.equal(across.size, 2);
  assert.equal(across.get('2023')!.rateable_value, 18500);
  assert.equal(across.get('2017')!.rateable_value, 5000);
  assert.notEqual(across.get('2023'), across.get('2017'));
});

/* --- the nightly watcher: pure planning, gated fetch ------------------ */

test('T19 planNightlyFetch proposes an EPOCH for every unloaded list', () => {
  const statuses: readonly VoaListStatus[] = VOA_LIST_YEARS.map((y) => ({
    list_year: y,
    epoch_loaded: false,
    last_applied_change_seq: 0,
    record_count: 0,
  }));
  const plans = planNightlyFetch(statuses);
  assert.equal(plans.length, 4);
  assert.ok(plans.every((p) => p.kind === 'EPOCH'));
});

test('T20 planNightlyFetch proposes the next CHANGE seq for a loaded list', () => {
  const statuses: readonly VoaListStatus[] = [
    { list_year: '2023', epoch_loaded: true, last_applied_change_seq: 3, record_count: 500 },
  ];
  const plans = planNightlyFetch(statuses);
  assert.equal(plans.length, 1);
  const plan = plans[0];
  assert.equal(plan.kind, 'CHANGE');
  if (plan.kind === 'CHANGE') assert.equal(plan.next_change_seq, 4);
});

test('T21 the default fetcher throws E_LICENCE_NOT_CLEARED and never resolves', async () => {
  const plan: VoaFetchPlan = { list_year: '2023', kind: 'EPOCH', reason: 'test' };
  await assert.rejects(() => voaFetchNotCleared(plan), (e: VoaImportError) => e.code === 'E_LICENCE_NOT_CLEARED');
});

test('T22 runNightlyWatch with the default fetcher touches nothing and reports every list blocked', async () => {
  const reg = new VoaRegister({ clock: () => NOW });
  const outcomes = await runNightlyWatch(reg);
  assert.equal(outcomes.length, 4);
  for (const o of outcomes) {
    assert.equal(o.outcome, 'FETCH_FAILED');
    if (o.outcome === 'FETCH_FAILED') assert.equal(o.error_code, 'E_LICENCE_NOT_CLEARED');
  }
  // the register must be completely untouched
  for (const s of reg.statuses()) assert.equal(s.epoch_loaded, false);
});

test('T23 runNightlyWatch with a hand-written mock fetcher loads epochs for all four lists', async () => {
  const reg = new VoaRegister({ clock: () => NOW });
  const mockFetcher = async (plan: VoaFetchPlan): Promise<string> => {
    assert.equal(plan.kind, 'EPOCH'); // fresh register, nothing loaded yet
    return plan.list_year === '2023' ? EPOCH_2023_GOOD : ['#LIST_YEAR ' + plan.list_year, EPOCH_HEADER].join('\n');
  };
  const outcomes = await runNightlyWatch(reg, mockFetcher);
  assert.equal(outcomes.length, 4);
  assert.ok(outcomes.every((o) => o.outcome === 'APPLIED'));
  const twentyTwentyThree = outcomes.find((o) => o.plan.list_year === '2023')!;
  if (twentyTwentyThree.outcome === 'APPLIED') assert.equal(twentyTwentyThree.record_count, 2);
  for (const y of VOA_LIST_YEARS) assert.equal(reg.status(y).epoch_loaded, true);
});

test('T24 a fetch failure on one list does not stop the others being attempted', async () => {
  const reg = new VoaRegister({ clock: () => NOW });
  const mockFetcher = async (plan: VoaFetchPlan): Promise<string> => {
    if (plan.list_year === '2017') throw new VoaImportError('E_LICENCE_NOT_CLEARED', 'simulated: 2017 still blocked');
    return ['#LIST_YEAR ' + plan.list_year, EPOCH_HEADER].join('\n');
  };
  const outcomes = await runNightlyWatch(reg, mockFetcher);
  const blocked = outcomes.find((o) => o.plan.list_year === '2017')!;
  assert.equal(blocked.outcome, 'FETCH_FAILED');
  const others = outcomes.filter((o) => o.plan.list_year !== '2017');
  assert.ok(others.every((o) => o.outcome === 'APPLIED'));
});

/* --- structural file problems: thrown, not quarantined --------------- */

test('T25 an epoch file with no #LIST_YEAR pragma is refused', () => {
  const noPragma = [EPOCH_HEADER, '10012345|1|D|A|||PC|2023-01-01|100|203|N|2023-01-01|'].join('\n');
  assert.throws(
    () => parseEpochFile('2023', noPragma),
    (e: VoaImportError) => e.code === 'E_MISSING_HEADER',
  );
});

test('T26 an epoch file whose header row does not match the documented layout is refused', () => {
  const badHeader = ['#LIST_YEAR 2023', 'WRONG|HEADER|ROW'].join('\n');
  assert.throws(
    () => parseEpochFile('2023', badHeader),
    (e: VoaImportError) => e.code === 'E_BAD_HEADER',
  );
});

test('T27 an empty epoch file is refused outright', () => {
  assert.throws(() => parseEpochFile('2023', ''), (e: VoaImportError) => e.code === 'E_EMPTY_FILE');
});

test('T28 a change file missing its #SEQ pragma is refused', () => {
  const noSeq = ['#LIST_YEAR 2023', CHANGE_HEADER, 'DELETE|10012346|||||||||||||'].join('\n');
  assert.throws(
    () => parseChangeFile('2023', noSeq),
    (e: VoaImportError) => e.code === 'E_MISSING_HEADER',
  );
});

test('T29 an unrecognised CHANGE_TYPE is quarantined, not thrown', () => {
  const badType = changeFile('2023', 1, ['REPLACE|10012345|||||||||||||']);
  const { rows, quarantined } = parseChangeFile('2023', badType);
  assert.equal(rows.length, 0);
  assert.equal(quarantined.length, 1);
  assert.equal(quarantined[0].code, 'E_UNKNOWN_CHANGE_TYPE');
});
