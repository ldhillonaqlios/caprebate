/**
 * Caprebate — VOA Bulk Data Import Connector (prepared, NOT SHIPPED)
 * Board item 12830205481, "Pull in the government valuation database
 * (waiting on the licence)". Phase 9, item 1.
 *
 * ABSOLUTE RULE, enforced in code, not just in prose: this module never makes
 * a network call. `voaFetchNotCleared` — the default, always-on fetcher — is
 * the only thing `runNightlyWatch` calls to get file bytes, and it throws
 * `E_LICENCE_NOT_CLEARED` before doing anything else. Every other function
 * here is a pure parser or a pure scheduling decision over caller-supplied
 * text. See `caprebate-voa-import.md` for the full specification, the
 * documented file-format assumptions (flagged for verification once the
 * VOA bulk-data licence is cleared), and why nothing in this file has ever
 * touched a real VOA file.
 *
 * Schema authority: Build-Prep-Consolidated-Schema.md §0.4 (provenance code
 * `API`), §0.5 (confidence grade — a register lookup over a published
 * dataset is grade A, §0.5's own example). Field ids reuse the `voa_*`
 * whitelist phase 3 already registered for source_id 'VOA':
 * phase3/caprebate-source-register.ts SOURCES → 'VOA'.
 *
 * Runs on Node >= 22.6 with type stripping (`node --test file.ts`). No enums,
 * no namespaces, no parameter properties — those are not strippable.
 *
 * Run:  cd phase9 && node --test caprebate-voa-import.test.ts
 */

/* ------------------------------------------------------------------ *
 * 1. VoaListYear — four lists, never merged
 * ------------------------------------------------------------------ */

/**
 * The four rating/valuation list years this connector tracks. See the spec
 * (§1) for why these four and not the live current list alone: a capital
 * allowances claim reasons about the effective date of works against
 * whichever list was in force at that time, so historic lists stay live
 * long after they close to new proposals.
 */
export type VoaListYear = '2010' | '2017' | '2023' | '2026';

export const VOA_LIST_YEARS: readonly VoaListYear[] = ['2010', '2017', '2023', '2026'];

function isVoaListYear(x: string): x is VoaListYear {
  return (VOA_LIST_YEARS as readonly string[]).includes(x);
}

/* ------------------------------------------------------------------ *
 * 2. Errors and quarantine codes
 * ------------------------------------------------------------------ */

export type VoaImportErrorCode =
  | 'E_UNKNOWN_LIST_YEAR'
  | 'E_LIST_YEAR_MISMATCH'
  | 'E_SEQUENCE_GAP'
  | 'E_EPOCH_NOT_LOADED'
  | 'E_MISSING_HEADER'
  | 'E_BAD_HEADER'
  | 'E_BAD_RETRIEVED_AT'
  | 'E_EMPTY_FILE'
  | 'E_LICENCE_NOT_CLEARED';

/** Thrown for structural problems — a whole file or call is wrong, not one row. */
export class VoaImportError extends Error {
  code: VoaImportErrorCode;
  detail: Record<string, unknown>;
  constructor(code: VoaImportErrorCode, message: string, detail: Record<string, unknown> = {}) {
    super(`[${code}] ${message}`);
    this.name = 'VoaImportError';
    this.code = code;
    this.detail = detail;
  }
}

/**
 * Reasons a single ROW is quarantined rather than dropped. Quarantine is not
 * an error path — a bad row never throws and never stops its siblings from
 * parsing. It is recorded, with a reason, alongside the batch that succeeded.
 */
export type VoaQuarantineCode =
  | 'E_BAD_COLUMN_COUNT'
  | 'E_MISSING_BA_REFERENCE'
  | 'E_BAD_RATEABLE_VALUE'
  | 'E_BAD_DATE'
  | 'E_BAD_COMPOSITE_INDICATOR'
  | 'E_BAD_AREA'
  | 'E_UNKNOWN_CHANGE_TYPE'
  | 'E_DUPLICATE_BA_REFERENCE'
  | 'E_ADD_ALREADY_EXISTS'
  | 'E_AMEND_MISSING_RECORD'
  | 'E_DELETE_MISSING_RECORD';

export type VoaQuarantineRow = {
  readonly line_number: number;
  readonly raw_line: string;
  readonly code: VoaQuarantineCode;
  readonly reason: string;
};

/* ------------------------------------------------------------------ *
 * 3. The documented record layout (spec §2) — pipe-delimited, with a
 *    small pragma preamble. This is OUR assumption, not a copy of a real
 *    VOA file (none has been fetched). Flagged in the spec as Assumption
 *    A-1..A-6, to be verified once the licence lands.
 * ------------------------------------------------------------------ */

export const VOA_EPOCH_COLUMNS: readonly string[] = [
  'BA_REFERENCE',
  'UARN',
  'DESCRIPTION',
  'ADDRESS_LINE_1',
  'ADDRESS_LINE_2',
  'ADDRESS_LINE_3',
  'ADDRESS_LINE_4',
  'POSTCODE',
  'EFFECTIVE_DATE',
  'RATEABLE_VALUE',
  'SCAT_CODE',
  'COMPOSITE_INDICATOR',
  'LISTING_DATE',
  'TOTAL_AREA_M2',
];

export const VOA_CHANGE_COLUMNS: readonly string[] = ['CHANGE_TYPE', ...VOA_EPOCH_COLUMNS];

export type VoaBulkRecord = {
  readonly list_year: VoaListYear;
  readonly ba_reference: string;
  readonly uarn: string;
  readonly description: string;
  readonly address_lines: readonly [string, string, string, string];
  readonly postcode: string;
  readonly effective_date: string; // ISO-8601 date
  readonly rateable_value: number; // whole GBP
  readonly scat_code: string;
  readonly composite_indicator: boolean;
  readonly listing_date: string; // ISO-8601 date
  /** null = not present in this VOA bulk record. See spec Assumption A-6. */
  readonly total_area_m2: number | null;
};

export type VoaChangeType = 'ADD' | 'AMEND' | 'DELETE';

export type VoaChangeRow =
  | {
      readonly change_type: 'DELETE';
      readonly list_year: VoaListYear;
      readonly ba_reference: string;
      readonly line_number: number;
      readonly raw_line: string;
    }
  | {
      readonly change_type: 'ADD' | 'AMEND';
      readonly list_year: VoaListYear;
      readonly record: VoaBulkRecord;
      readonly line_number: number;
      readonly raw_line: string;
    };

/* ------------------------------------------------------------------ *
 * 4. Low-level parsing helpers
 * ------------------------------------------------------------------ */

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const ISO_TIMESTAMP_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/;
const INT_RE = /^\d+$/;
const DECIMAL_RE = /^\d+(\.\d+)?$/;

function assertRetrievedAt(s: string): void {
  if (typeof s !== 'string' || !ISO_TIMESTAMP_RE.test(s)) {
    throw new VoaImportError('E_BAD_RETRIEVED_AT', `retrieved_at '${s}' is not ISO-8601 UTC (YYYY-MM-DDTHH:MM:SSZ)`);
  }
}

function splitLines(text: string): string[] {
  return text.replace(/\r\n/g, '\n').split('\n');
}

function trimTrailingBlank(lines: readonly string[]): string[] {
  const out = [...lines];
  while (out.length > 0 && out[out.length - 1] === '') out.pop();
  return out;
}

type Preamble = { listYear: string | null; seq: number | null; headerLine: string | null; bodyStart: number };

/** Reads leading `#PRAGMA value` lines, stopping at the first line that isn't one. */
function parsePreamble(lines: readonly string[]): Preamble {
  let listYear: string | null = null;
  let seq: number | null = null;
  let i = 0;
  for (; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith('#LIST_YEAR')) {
      listYear = line.slice('#LIST_YEAR'.length).trim();
    } else if (line.startsWith('#SEQ')) {
      const v = line.slice('#SEQ'.length).trim();
      seq = INT_RE.test(v) ? Number(v) : NaN;
    } else if (line.startsWith('#')) {
      // unrecognised pragma — ignore, forward-compatible
    } else {
      break;
    }
  }
  return { listYear, seq, headerLine: i < lines.length ? lines[i] : null, bodyStart: i + 1 };
}

type FieldParseResult = { ok: true; record: VoaBulkRecord } | { ok: false; code: VoaQuarantineCode; reason: string };

/**
 * Parses the shared BA_REFERENCE..TOTAL_AREA_M2 field block, which sits at
 * `base` in an epoch row (base 0) or a change row (base 1, after CHANGE_TYPE).
 * `allowBlank` permits RATEABLE_VALUE / EFFECTIVE_DATE / COMPOSITE_INDICATOR /
 * LISTING_DATE to be empty — used only for DELETE rows, which carry no
 * business content beyond the key.
 */
function parseRecordFields(
  cols: readonly string[],
  base: number,
  expectedLen: number,
  list_year: VoaListYear,
  allowBlank: boolean,
): FieldParseResult {
  if (cols.length !== expectedLen) {
    return { ok: false, code: 'E_BAD_COLUMN_COUNT', reason: `expected ${expectedLen} columns, found ${cols.length}` };
  }

  const ba_reference = cols[base + 0].trim();
  const uarn = cols[base + 1].trim();
  const description = cols[base + 2].trim();
  const address_lines = [cols[base + 3], cols[base + 4], cols[base + 5], cols[base + 6]].map((s) => s.trim()) as [
    string,
    string,
    string,
    string,
  ];
  const postcode = cols[base + 7].trim();
  const effective_date = cols[base + 8].trim();
  const rateable_value_str = cols[base + 9].trim();
  const scat_code = cols[base + 10].trim();
  const composite_str = cols[base + 11].trim();
  const listing_date = cols[base + 12].trim();
  const area_str = cols[base + 13].trim();

  if (ba_reference === '') {
    return { ok: false, code: 'E_MISSING_BA_REFERENCE', reason: 'BA_REFERENCE is empty' };
  }

  const blankRun = rateable_value_str === '' && effective_date === '' && composite_str === '' && listing_date === '';

  let rateable_value = 0;
  let composite_indicator = false;
  if (!(allowBlank && blankRun)) {
    if (!INT_RE.test(rateable_value_str)) {
      return {
        ok: false,
        code: 'E_BAD_RATEABLE_VALUE',
        reason: `RATEABLE_VALUE '${rateable_value_str}' is not a non-negative whole-pound integer`,
      };
    }
    rateable_value = Number(rateable_value_str);
    if (!ISO_DATE_RE.test(effective_date)) {
      return { ok: false, code: 'E_BAD_DATE', reason: `EFFECTIVE_DATE '${effective_date}' is not ISO-8601 (YYYY-MM-DD)` };
    }
    if (!ISO_DATE_RE.test(listing_date)) {
      return { ok: false, code: 'E_BAD_DATE', reason: `LISTING_DATE '${listing_date}' is not ISO-8601 (YYYY-MM-DD)` };
    }
    if (composite_str !== 'Y' && composite_str !== 'N') {
      return {
        ok: false,
        code: 'E_BAD_COMPOSITE_INDICATOR',
        reason: `COMPOSITE_INDICATOR '${composite_str}' is not 'Y' or 'N'`,
      };
    }
    composite_indicator = composite_str === 'Y';
  }

  let total_area_m2: number | null = null;
  if (area_str !== '') {
    if (!DECIMAL_RE.test(area_str)) {
      return { ok: false, code: 'E_BAD_AREA', reason: `TOTAL_AREA_M2 '${area_str}' is not a non-negative decimal` };
    }
    total_area_m2 = Number(area_str);
  }

  return {
    ok: true,
    record: {
      list_year,
      ba_reference,
      uarn,
      description,
      address_lines,
      postcode,
      effective_date,
      rateable_value,
      scat_code,
      composite_indicator,
      listing_date,
      total_area_m2,
    },
  };
}

/* ------------------------------------------------------------------ *
 * 5. Epoch (full snapshot) parser
 * ------------------------------------------------------------------ */

export type VoaEpochParseResult = {
  readonly records: readonly VoaBulkRecord[];
  readonly quarantined: readonly VoaQuarantineRow[];
};

/**
 * Parses a full epoch file. Throws only for whole-file structural problems
 * (empty file, wrong/missing #LIST_YEAR pragma, header row that doesn't match
 * the documented layout). Everything row-shaped is quarantined, never thrown
 * — one bad row must never poison the rest of the batch.
 */
export function parseEpochFile(list_year: VoaListYear, text: string): VoaEpochParseResult {
  if (!isVoaListYear(list_year)) {
    throw new VoaImportError('E_UNKNOWN_LIST_YEAR', `'${list_year}' is not a tracked VOA list year`, { list_year });
  }
  const lines = trimTrailingBlank(splitLines(text));
  if (lines.length === 0) throw new VoaImportError('E_EMPTY_FILE', 'epoch file is empty');

  const pre = parsePreamble(lines);
  if (pre.listYear === null) throw new VoaImportError('E_MISSING_HEADER', 'epoch file has no #LIST_YEAR pragma');
  if (pre.listYear !== list_year) {
    throw new VoaImportError(
      'E_LIST_YEAR_MISMATCH',
      `epoch file declares list year '${pre.listYear}' but was loaded against '${list_year}' — refusing to merge lists`,
      { declared: pre.listYear, expected: list_year },
    );
  }
  if (pre.headerLine === null) throw new VoaImportError('E_MISSING_HEADER', 'epoch file has no column header row');
  if (pre.headerLine !== VOA_EPOCH_COLUMNS.join('|')) {
    throw new VoaImportError('E_BAD_HEADER', 'epoch file column header does not match the documented layout', {
      found: pre.headerLine,
      expected: VOA_EPOCH_COLUMNS.join('|'),
    });
  }

  const records: VoaBulkRecord[] = [];
  const quarantined: VoaQuarantineRow[] = [];
  const seen = new Set<string>();

  for (let idx = pre.bodyStart; idx < lines.length; idx++) {
    const raw = lines[idx];
    if (raw === '') continue;
    const lineNumber = idx + 1;
    const cols = raw.split('|');
    const result = parseRecordFields(cols, 0, VOA_EPOCH_COLUMNS.length, list_year, false);
    if (!result.ok) {
      quarantined.push({ line_number: lineNumber, raw_line: raw, code: result.code, reason: result.reason });
      continue;
    }
    if (seen.has(result.record.ba_reference)) {
      quarantined.push({
        line_number: lineNumber,
        raw_line: raw,
        code: 'E_DUPLICATE_BA_REFERENCE',
        reason: `ba_reference '${result.record.ba_reference}' already appeared earlier in this epoch file`,
      });
      continue;
    }
    seen.add(result.record.ba_reference);
    records.push(result.record);
  }

  return { records, quarantined };
}

/* ------------------------------------------------------------------ *
 * 6. Change (delta) file parser
 * ------------------------------------------------------------------ */

export type VoaChangeParseResult = {
  readonly seq: number;
  readonly rows: readonly VoaChangeRow[];
  readonly quarantined: readonly VoaQuarantineRow[];
};

export function parseChangeFile(list_year: VoaListYear, text: string): VoaChangeParseResult {
  if (!isVoaListYear(list_year)) {
    throw new VoaImportError('E_UNKNOWN_LIST_YEAR', `'${list_year}' is not a tracked VOA list year`, { list_year });
  }
  const lines = trimTrailingBlank(splitLines(text));
  if (lines.length === 0) throw new VoaImportError('E_EMPTY_FILE', 'change file is empty');

  const pre = parsePreamble(lines);
  if (pre.listYear === null) throw new VoaImportError('E_MISSING_HEADER', 'change file has no #LIST_YEAR pragma');
  if (pre.listYear !== list_year) {
    throw new VoaImportError(
      'E_LIST_YEAR_MISMATCH',
      `change file declares list year '${pre.listYear}' but was applied to '${list_year}' — refusing to merge lists`,
      { declared: pre.listYear, expected: list_year },
    );
  }
  if (pre.seq === null || Number.isNaN(pre.seq)) {
    throw new VoaImportError('E_MISSING_HEADER', 'change file has no valid #SEQ pragma');
  }
  if (pre.headerLine === null) throw new VoaImportError('E_MISSING_HEADER', 'change file has no column header row');
  if (pre.headerLine !== VOA_CHANGE_COLUMNS.join('|')) {
    throw new VoaImportError('E_BAD_HEADER', 'change file column header does not match the documented layout', {
      found: pre.headerLine,
      expected: VOA_CHANGE_COLUMNS.join('|'),
    });
  }

  const rows: VoaChangeRow[] = [];
  const quarantined: VoaQuarantineRow[] = [];

  for (let idx = pre.bodyStart; idx < lines.length; idx++) {
    const raw = lines[idx];
    if (raw === '') continue;
    const lineNumber = idx + 1;
    const cols = raw.split('|');
    if (cols.length !== VOA_CHANGE_COLUMNS.length) {
      quarantined.push({
        line_number: lineNumber,
        raw_line: raw,
        code: 'E_BAD_COLUMN_COUNT',
        reason: `expected ${VOA_CHANGE_COLUMNS.length} columns, found ${cols.length}`,
      });
      continue;
    }
    const changeType = cols[0].trim();
    if (changeType !== 'ADD' && changeType !== 'AMEND' && changeType !== 'DELETE') {
      quarantined.push({
        line_number: lineNumber,
        raw_line: raw,
        code: 'E_UNKNOWN_CHANGE_TYPE',
        reason: `CHANGE_TYPE '${changeType}' is not one of ADD, AMEND, DELETE`,
      });
      continue;
    }
    if (changeType === 'DELETE') {
      const result = parseRecordFields(cols, 1, VOA_CHANGE_COLUMNS.length, list_year, true);
      if (!result.ok) {
        quarantined.push({ line_number: lineNumber, raw_line: raw, code: result.code, reason: result.reason });
        continue;
      }
      rows.push({ change_type: 'DELETE', list_year, ba_reference: result.record.ba_reference, line_number: lineNumber, raw_line: raw });
    } else {
      const result = parseRecordFields(cols, 1, VOA_CHANGE_COLUMNS.length, list_year, false);
      if (!result.ok) {
        quarantined.push({ line_number: lineNumber, raw_line: raw, code: result.code, reason: result.reason });
        continue;
      }
      rows.push({ change_type: changeType, list_year, record: result.record, line_number: lineNumber, raw_line: raw });
    }
  }

  return { seq: pre.seq, rows, quarantined };
}

/* ------------------------------------------------------------------ *
 * 7. VoaListSnapshot / VoaListStatus / the empty reference-table stub
 * ------------------------------------------------------------------ */

export type VoaListSnapshot = {
  readonly list_year: VoaListYear;
  readonly epoch_loaded: boolean;
  readonly epoch_retrieved_at: string | null;
  readonly last_applied_change_seq: number;
  readonly records: ReadonlyMap<string, VoaBulkRecord>;
};

export type VoaListStatus = {
  readonly list_year: VoaListYear;
  readonly epoch_loaded: boolean;
  readonly last_applied_change_seq: number;
  readonly record_count: number;
};

/**
 * A caller-facing stub for a VOA-derived reference table. `loaded: false` is
 * the honest, structural answer to "do we have this list year's data" before
 * the licence clears and before any epoch has been fetched — never a null or
 * an empty array standing in ambiguously for "not licensed yet".
 */
export type VoaReferenceTableState =
  | { readonly loaded: false; readonly list_year: VoaListYear; readonly reason: string }
  | {
      readonly loaded: true;
      readonly list_year: VoaListYear;
      readonly epoch_retrieved_at: string;
      readonly last_applied_change_seq: number;
      readonly records: readonly VoaBulkRecord[];
    };

function emptySnapshot(list_year: VoaListYear): VoaListSnapshot {
  return { list_year, epoch_loaded: false, epoch_retrieved_at: null, last_applied_change_seq: 0, records: new Map() };
}

/** The four stubs this module ships with today — all `loaded: false`. */
export function emptyReferenceTables(): ReadonlyMap<VoaListYear, VoaReferenceTableState> {
  const out = new Map<VoaListYear, VoaReferenceTableState>();
  for (const y of VOA_LIST_YEARS) {
    out.set(y, {
      loaded: false,
      list_year: y,
      reason:
        'VOA bulk-data licence has not been cleared. This table is an empty stub prepared ahead of ' +
        'licence clearance (board item 12830205481) — no epoch has ever been fetched for this list year.',
    });
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * 8. VoaRegister — one snapshot per list year, never merged
 * ------------------------------------------------------------------ */

export type VoaLoadResult = { readonly quarantined: readonly VoaQuarantineRow[]; readonly record_count: number };

export type VoaApplyResult =
  | { readonly applied: true; readonly seq: number; readonly quarantined: readonly VoaQuarantineRow[]; readonly record_count: number }
  | { readonly applied: false; readonly reason: 'ALREADY_APPLIED'; readonly seq: number };

export type Clock = () => string;

/**
 * Holds one VoaListSnapshot per tracked list year. Every read/write method
 * takes an explicit `year` and only ever touches that year's snapshot — there
 * is no method that reads or writes "the" data without naming which list, so
 * crossing years by omission is not possible through this API.
 */
export class VoaRegister {
  #snapshots = new Map<VoaListYear, VoaListSnapshot>();
  clock: Clock;

  constructor(opts: { clock?: Clock } = {}) {
    for (const y of VOA_LIST_YEARS) this.#snapshots.set(y, emptySnapshot(y));
    this.clock = opts.clock ?? (() => new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'));
  }

  #assertYear(y: VoaListYear): void {
    if (!isVoaListYear(y)) {
      throw new VoaImportError(
        'E_UNKNOWN_LIST_YEAR',
        `'${y}' is not one of the four tracked VOA list years (${VOA_LIST_YEARS.join(', ')})`,
        { list_year: y },
      );
    }
  }

  snapshot(year: VoaListYear): VoaListSnapshot {
    this.#assertYear(year);
    return this.#snapshots.get(year)!;
  }

  status(year: VoaListYear): VoaListStatus {
    const s = this.snapshot(year);
    return {
      list_year: year,
      epoch_loaded: s.epoch_loaded,
      last_applied_change_seq: s.last_applied_change_seq,
      record_count: s.records.size,
    };
  }

  /** Always four entries, one per tracked list year, in VOA_LIST_YEARS order. */
  statuses(): readonly VoaListStatus[] {
    return VOA_LIST_YEARS.map((y) => this.status(y));
  }

  referenceTable(year: VoaListYear): VoaReferenceTableState {
    const s = this.snapshot(year);
    if (!s.epoch_loaded) {
      return {
        loaded: false,
        list_year: year,
        reason:
          'VOA bulk-data licence has not been cleared and/or no epoch has been loaded for this list year yet. ' +
          'This table is an empty stub, not a claim that the property has no rating record.',
      };
    }
    return {
      loaded: true,
      list_year: year,
      epoch_retrieved_at: s.epoch_retrieved_at as string,
      last_applied_change_seq: s.last_applied_change_seq,
      records: [...s.records.values()],
    };
  }

  /**
   * Loads a full epoch snapshot for one list year, replacing whatever was
   * there before and resetting last_applied_change_seq to 0. Throws on a
   * declared-list-year mismatch (E_LIST_YEAR_MISMATCH) — never silently
   * relabels or merges a file into the wrong year's snapshot.
   */
  loadEpoch(year: VoaListYear, text: string, retrievedAt: string): VoaLoadResult {
    this.#assertYear(year);
    assertRetrievedAt(retrievedAt);
    const { records, quarantined } = parseEpochFile(year, text);
    const map = new Map<string, VoaBulkRecord>();
    for (const r of records) map.set(r.ba_reference, r);
    this.#snapshots.set(year, {
      list_year: year,
      epoch_loaded: true,
      epoch_retrieved_at: retrievedAt,
      last_applied_change_seq: 0,
      records: map,
    });
    return { quarantined, record_count: map.size };
  }

  /**
   * Applies one change (delta) file to the named list year's current
   * snapshot. Ordering rules:
   *   - the epoch must already be loaded (E_EPOCH_NOT_LOADED otherwise);
   *   - a change file's own list year must match `year` (E_LIST_YEAR_MISMATCH);
   *   - seq === last_applied_change_seq + 1 is applied;
   *   - seq <= last_applied_change_seq is a no-op (ALREADY_APPLIED) — this is
   *     what makes re-applying the same change file idempotent;
   *   - seq > last_applied_change_seq + 1 is refused (E_SEQUENCE_GAP) rather
   *     than silently skipping the missing file(s) in between.
   * Per-row problems (ADD onto an existing key, AMEND/DELETE of a missing
   * key) are quarantined, not thrown — the rest of the file still applies.
   */
  applyChange(year: VoaListYear, text: string, retrievedAt: string): VoaApplyResult {
    this.#assertYear(year);
    assertRetrievedAt(retrievedAt);
    const current = this.snapshot(year);
    if (!current.epoch_loaded) {
      throw new VoaImportError(
        'E_EPOCH_NOT_LOADED',
        `no epoch is loaded for list year '${year}' — a change file cannot be applied before the epoch baseline exists`,
        { list_year: year },
      );
    }

    const { seq, rows, quarantined: parseQuarantine } = parseChangeFile(year, text);

    if (seq <= current.last_applied_change_seq) {
      return { applied: false, reason: 'ALREADY_APPLIED', seq };
    }
    if (seq > current.last_applied_change_seq + 1) {
      throw new VoaImportError(
        'E_SEQUENCE_GAP',
        `change file seq ${seq} cannot be applied to list '${year}' — last applied is ` +
          `${current.last_applied_change_seq}, expected seq ${current.last_applied_change_seq + 1} next. ` +
          'Refusing to skip ahead: fetch and apply the missing sequence number(s) first.',
        { list_year: year, expected: current.last_applied_change_seq + 1, found: seq },
      );
    }

    const map = new Map(current.records);
    const applyQuarantine: VoaQuarantineRow[] = [];
    for (const row of rows) {
      if (row.change_type === 'ADD') {
        if (map.has(row.record.ba_reference)) {
          applyQuarantine.push({
            line_number: row.line_number,
            raw_line: row.raw_line,
            code: 'E_ADD_ALREADY_EXISTS',
            reason: `ADD for '${row.record.ba_reference}' but a record with that BA reference already exists in list '${year}'`,
          });
          continue;
        }
        map.set(row.record.ba_reference, row.record);
      } else if (row.change_type === 'AMEND') {
        if (!map.has(row.record.ba_reference)) {
          applyQuarantine.push({
            line_number: row.line_number,
            raw_line: row.raw_line,
            code: 'E_AMEND_MISSING_RECORD',
            reason: `AMEND for '${row.record.ba_reference}' but no existing record was found in list '${year}'`,
          });
          continue;
        }
        map.set(row.record.ba_reference, row.record);
      } else {
        if (!map.has(row.ba_reference)) {
          applyQuarantine.push({
            line_number: row.line_number,
            raw_line: row.raw_line,
            code: 'E_DELETE_MISSING_RECORD',
            reason: `DELETE for '${row.ba_reference}' but no existing record was found in list '${year}'`,
          });
          continue;
        }
        map.delete(row.ba_reference);
      }
    }

    this.#snapshots.set(year, {
      list_year: year,
      epoch_loaded: true,
      epoch_retrieved_at: current.epoch_retrieved_at,
      last_applied_change_seq: seq,
      records: map,
    });
    return { applied: true, seq, quarantined: [...parseQuarantine, ...applyQuarantine], record_count: map.size };
  }

  lookup(year: VoaListYear, ba_reference: string): VoaBulkRecord | null {
    return this.snapshot(year).records.get(ba_reference) ?? null;
  }

  /**
   * Looks a BA reference up in every tracked list year and returns a map
   * keyed by year. Deliberately never collapses the results into one record:
   * a BA reference (or a coincidentally identical string) meaning different
   * things in two list years must never be silently merged.
   */
  lookupAcrossYears(ba_reference: string): ReadonlyMap<VoaListYear, VoaBulkRecord> {
    const out = new Map<VoaListYear, VoaBulkRecord>();
    for (const y of VOA_LIST_YEARS) {
      const rec = this.#snapshots.get(y)!.records.get(ba_reference);
      if (rec) out.set(y, rec);
    }
    return out;
  }
}

/* ------------------------------------------------------------------ *
 * 9. Schema field mapping — provenance API, grade A
 * ------------------------------------------------------------------ */

export type VoaSchemaFieldId =
  | 'voa_ba_reference'
  | 'voa_summary_valuation'
  | 'voa_scat_code'
  | 'voa_effective_date'
  | 'voa_total_area_m2';

export type VoaSchemaCell = {
  readonly field_id: VoaSchemaFieldId;
  /** false = the VOA bulk product does not carry a value for this field on this record. */
  readonly present: boolean;
  readonly value: string | number | boolean | null;
  readonly prov: 'API';
  readonly source_id: 'VOA';
  readonly grade: 'A';
  readonly note?: string;
};

/**
 * Maps a parsed VOA bulk record onto the field ids phase 3 already
 * whitelists for source_id 'VOA' (caprebate-source-register.ts SOURCES).
 * Confidence grade reasoning (Build-Prep-Consolidated-Schema.md §0.5): every
 * field here is a deterministic read of a published government register —
 * exactly grade A's own definition, "a register lookup ... fully automated" —
 * not a client assertion and not a judgement call, so there is no B/C/D/E
 * path for this connector's own output to take. The one field this connector
 * cannot promise is `voa_total_area_m2`; see Assumption A-6 in the spec.
 */
export function toSchemaCells(record: VoaBulkRecord): readonly VoaSchemaCell[] {
  return [
    { field_id: 'voa_ba_reference', present: true, value: record.ba_reference, prov: 'API', source_id: 'VOA', grade: 'A' },
    {
      field_id: 'voa_summary_valuation',
      present: true,
      value: record.rateable_value,
      prov: 'API',
      source_id: 'VOA',
      grade: 'A',
    },
    { field_id: 'voa_scat_code', present: true, value: record.scat_code, prov: 'API', source_id: 'VOA', grade: 'A' },
    {
      field_id: 'voa_effective_date',
      present: true,
      value: record.effective_date,
      prov: 'API',
      source_id: 'VOA',
      grade: 'A',
    },
    {
      field_id: 'voa_total_area_m2',
      present: record.total_area_m2 !== null,
      value: record.total_area_m2,
      prov: 'API',
      source_id: 'VOA',
      grade: 'A',
      note:
        record.total_area_m2 === null
          ? 'Not present on this record. Assumption A-6 (spec): the VOA bulk rating-list product may not ' +
            'publish floor area at all — verify once the licence lands before relying on this field.'
          : undefined,
    },
  ];
}

/* ------------------------------------------------------------------ *
 * 10. The nightly watcher — a pure decision, a gated fetch
 * ------------------------------------------------------------------ */

export type VoaFetchPlan =
  | { readonly list_year: VoaListYear; readonly kind: 'EPOCH'; readonly reason: string }
  | { readonly list_year: VoaListYear; readonly kind: 'CHANGE'; readonly next_change_seq: number; readonly reason: string };

/**
 * Pure. Given the current status of the four tracked lists, decides what
 * SHOULD be fetched tonight and returns that decision as plain data. Never
 * fetches anything, never awaits anything, has no side effects — it can be
 * unit tested with nothing but literal VoaListStatus objects.
 */
export function planNightlyFetch(statuses: readonly VoaListStatus[]): readonly VoaFetchPlan[] {
  return statuses.map((s): VoaFetchPlan =>
    s.epoch_loaded
      ? {
          list_year: s.list_year,
          kind: 'CHANGE',
          next_change_seq: s.last_applied_change_seq + 1,
          reason:
            `list ${s.list_year}: epoch already loaded (${s.record_count} records), ` +
            `last applied change seq ${s.last_applied_change_seq} — fetch seq ${s.last_applied_change_seq + 1} next`,
        }
      : {
          list_year: s.list_year,
          kind: 'EPOCH',
          reason: `list ${s.list_year}: no epoch loaded — a full snapshot must be fetched before any change file can be applied`,
        },
  );
}

/** Returns the raw bytes/text of the file a VoaFetchPlan names. The only I/O boundary in this module. */
export type VoaFetcher = (plan: VoaFetchPlan) => Promise<string>;

/**
 * The default fetcher, and the module's core safety property: it throws
 * E_LICENCE_NOT_CLEARED before doing anything else — no DNS lookup, no
 * socket, no fs read. Without an explicit hand-supplied replacement,
 * `runNightlyWatch` is structurally incapable of reaching the network.
 */
export const voaFetchNotCleared: VoaFetcher = async (plan: VoaFetchPlan): Promise<string> => {
  throw new VoaImportError(
    'E_LICENCE_NOT_CLEARED',
    `refused to fetch VOA bulk data for list ${plan.list_year} (${plan.kind}) — the VOA bulk-data licence has ` +
      'not been cleared. No network call has been attempted.',
    { plan },
  );
};

export type VoaWatchOutcome =
  | { readonly plan: VoaFetchPlan; readonly outcome: 'APPLIED'; readonly quarantined: readonly VoaQuarantineRow[]; readonly record_count: number }
  | { readonly plan: VoaFetchPlan; readonly outcome: 'NOOP_ALREADY_APPLIED' }
  | { readonly plan: VoaFetchPlan; readonly outcome: 'FETCH_FAILED'; readonly error_code: string; readonly error_message: string };

/**
 * The nightly orchestrator. Computes the plan (pure, see planNightlyFetch),
 * then for each planned fetch calls the injected `fetcher`. With the default
 * fetcher (`voaFetchNotCleared`) every plan comes back FETCH_FAILED /
 * E_LICENCE_NOT_CLEARED and the register is left completely untouched — that
 * is the intended, safe behaviour today. A fetch failure on one list year
 * does not stop the others from being attempted.
 */
export async function runNightlyWatch(
  register: VoaRegister,
  fetcher: VoaFetcher = voaFetchNotCleared,
): Promise<readonly VoaWatchOutcome[]> {
  const plans = planNightlyFetch(register.statuses());
  const outcomes: VoaWatchOutcome[] = [];
  for (const plan of plans) {
    let text: string;
    try {
      text = await fetcher(plan);
    } catch (err) {
      const code = err instanceof VoaImportError ? err.code : 'E_UNKNOWN';
      const message = err instanceof Error ? err.message : String(err);
      outcomes.push({ plan, outcome: 'FETCH_FAILED', error_code: code, error_message: message });
      continue;
    }
    const retrievedAt = register.clock();
    if (plan.kind === 'EPOCH') {
      const r = register.loadEpoch(plan.list_year, text, retrievedAt);
      outcomes.push({ plan, outcome: 'APPLIED', quarantined: r.quarantined, record_count: r.record_count });
    } else {
      const r = register.applyChange(plan.list_year, text, retrievedAt);
      outcomes.push(
        r.applied
          ? { plan, outcome: 'APPLIED', quarantined: r.quarantined, record_count: r.record_count }
          : { plan, outcome: 'NOOP_ALREADY_APPLIED' },
      );
    }
  }
  return outcomes;
}
