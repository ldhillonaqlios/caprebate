/**
 * REGISTERS PUBLISHED AS A FILE, NOT AN API — IMPORTED INTO A TABLE ON THIS SERVER, AND LOOKED UP THERE.
 * Phase 155 (lines 1–2), 4 October 2026.
 *
 * The two care regulators outside England publish a downloadable list instead of an API:
 *   CIW                Care Inspectorate Wales's list of registered care services (Wales)
 *   CARE_INSPECTORATE  the Care Inspectorate's datastore of registered care services (Scotland)
 * NOT THE VALUATION OFFICE (line 3). Its rating list is a file too, but its licence restricts it to "Non Domestic Rating
 * (NDR) purposes only" and says "An open government licence does not apply" (read 4 October 2026; the source register's
 * VOA_RATING_LIST licence). A capital allowances claim is not a rating purpose, so it is recorded and not imported.
 *
 * Each is IMPORTED ON A COMMAND (`node src/cli.ts import-register <source> <file> --by <admin>`), never fetched per
 * client: a person downloads the file from the publisher and the import replaces that source's rows whole, in one
 * transaction. A lookup then reads this table — NOTHING IS SENT OUTSIDE, as for the ONS postcode table.
 *
 * WHAT IS KEPT. For each row: the register's own reference, the postcode (blocking key), the address lines (for the
 * match), and ONLY the fields the source register permits for that source (04-phase-work/phase3/
 * caprebate-source-register.ts, `permitted_fields`). Every other column — a manager's or responsible individual's
 * name, a provider's name (which may be a person's), a telephone number or an email — is never read: only named
 * columns are.
 *
 * A FILE WHOSE COLUMNS DO NOT MATCH IS REFUSED WHOLE (N4): the columns below are as each publisher writes its file
 * (the source register's SUPPLIER_DOCS, read 4 October 2026). A row we cannot read (no reference, no postcode we can
 * read) is skipped and counted, never guessed.
 *
 * THE SWITCHES ARE NOT HERE. Importing a file switches nothing on: each lookup (src/connectors/register-files.ts) is
 * behind its own REGISTER_SWITCHES entry, OFF, and the research panel's free gate, shut.
 */
import type { Db } from '../db.ts';
import type { AuditLog } from '../audit.ts';
import { postcodeKey } from '../connectors/matching.ts';

export type FileSourceId = 'CIW' | 'CARE_INSPECTORATE';

/** A column, by its header name (a file with a header row) or by its position from 0 (a file without one). */
type Col = string | number;

export type FileSource = {
  readonly source_id: FileSourceId;
  readonly publisher: string;
  /** Where the file is downloaded from, in plain words, for the command's usage line. */
  readonly download: string;
  readonly delimiter: string;
  readonly header: boolean;
  readonly ref: Col;
  readonly postcode: Col;
  readonly address: readonly Col[];
  /** The kept field (a source register `permitted_fields` name) and the column it is read from. Only these are read. */
  readonly fields: Readonly<Record<string, Col>>;
  /** A whole-number field: kept only where the file states a whole number of nil or more. Absent stays absent (N4). */
  readonly whole_numbers: readonly string[];
  /** A date written dd/mm/yyyy: kept as yyyy-mm-dd, or not at all where it is not a real date. */
  readonly dates: readonly string[];
  /** How the file's bytes are written. The Scottish datastore is Windows-1252, not UTF-8. */
  readonly encoding: 'utf-8' | 'windows-1252';
};

/**
 * THE COLUMNS, EXACTLY AS EACH FILE NAMES THEM — read from each publisher's own file on 4 October 2026 (the source
 * register's SUPPLIER_DOCS). Only these are read. CIW's file also carries the Responsible Individuals, the Registered
 * Persons, telephone, email, website and the provider's name and address; the Care Inspectorate's a manager's name,
 * telephone and email, and the provider's name. None of them is ever read. The Care Inspectorate's year-suffixed
 * columns (complaints, enforcements, inspections) are renamed as the years roll on, so none of them is read either.
 */
export const FILE_SOURCES: Readonly<Record<FileSourceId, FileSource>> = Object.freeze({
  CIW: Object.freeze({
    source_id: 'CIW', publisher: 'Care Inspectorate Wales',
    download: 'CIW\'s data extract: digital.careinspectorate.wales/data-extract',
    delimiter: ',', header: true, encoding: 'utf-8',
    ref: 'Service URN', postcode: 'Service postcode',
    address: ['Service address line 1', 'Service address line 2', 'Service address line 3', 'Service town/city'],
    fields: Object.freeze({
      ciw_service_id: 'Service URN', service_categories: 'Service type', service_subtype: 'Service sub-type',
      capacity: 'Maximum no. of places', ciw_uprn: 'Service address UPRN', local_authority: 'Local authority',
      ciw_provider_id: 'Provider URN', provider_type: 'Provider type', provider_registration_date: 'Provider registration date',
    }),
    whole_numbers: Object.freeze(['capacity']), dates: Object.freeze(['provider_registration_date']),
  }),
  CARE_INSPECTORATE: Object.freeze({
    source_id: 'CARE_INSPECTORATE', publisher: 'the Care Inspectorate',
    download: 'the Care Inspectorate\'s datastore: careinspectorate.scot, Datastore',
    delimiter: ',', header: true, encoding: 'windows-1252',
    ref: 'CSNumber', postcode: 'Service_Postcode',
    address: ['Address_line_1', 'Address_line_2', 'Address_line_3', 'Address_line_4', 'Service_town'],
    fields: Object.freeze({
      ci_cs_number: 'CSNumber', care_service: 'CareService', care_subtype: 'Subtype', registered_places: 'Registered_Places',
      total_beds: 'TotalBeds', registration_date: 'DateReg', service_status: 'ServiceStatus', ci_uprn: 'ChopUPRN',
      local_authority: 'Council_Area_Name', ci_provider_number: 'SP_number',
    }),
    whole_numbers: Object.freeze(['registered_places', 'total_beds']), dates: Object.freeze(['registration_date']),
  }),
});

/** A file's bytes as text, in the encoding its publisher writes it in. */
export function decodeRegisterFile(bytes: Uint8Array, source_id: FileSourceId): string {
  return new TextDecoder(FILE_SOURCES[source_id].encoding).decode(bytes);
}

/** dd/mm/yyyy to yyyy-mm-dd, or null where it is not a real date. */
function isoFromDayMonthYear(v: string): string | null {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(v);
  if (m === null) return null;
  const iso = `${m[3]}-${(m[2] ?? '').padStart(2, '0')}-${(m[1] ?? '').padStart(2, '0')}`;
  const d = new Date(`${iso}T00:00:00Z`);
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== iso ? null : iso;
}

/* ================================================================== *
 * READING A FILE
 * ================================================================== */

/** A delimited file into rows of cells: quotes honoured, CRLF or LF, a byte-order mark dropped, empty rows skipped. */
export function readDelimited(text: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let field = '';
  let row: string[] = [];
  let quoted = false;
  const t = text.replace(/^﻿/, '');
  for (let i = 0; i < t.length; i++) {
    const c = t[i] as string;
    if (quoted) {
      if (c === '"' && t[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"' && field === '') quoted = true;
    else if (c === delimiter) { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && t[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.some((x) => x.trim() !== '')) rows.push(row);
      row = [];
    } else field += c;
  }
  if (quoted) throw new RegisterFileError('the file has a quote that is never closed, so it cannot be read');
  row.push(field);
  if (row.some((x) => x.trim() !== '')) rows.push(row);
  return rows;
}

export class RegisterFileError extends Error {
  constructor(message: string) { super(message); this.name = 'RegisterFileError'; }
}

export type ImportResult = { readonly kept: number; readonly skipped_unreadable: number; readonly replaced: number };

/**
 * IMPORT ONE FILE: the source's rows replaced whole, in one transaction, and the import recorded and audited. Only an
 * active Admin may (the command checks; this checks the role it is given too).
 */
export function importRegisterFile(
  d: { readonly db: Db; readonly audit: AuditLog; readonly now: () => string },
  source_id: FileSourceId, text: string, file_name: string, actor: { readonly id: string; readonly role: string },
  sources: Readonly<Record<FileSourceId, FileSource>> = FILE_SOURCES,
): ImportResult {
  if (actor.role !== 'ADMIN') throw new RegisterFileError('only Admin may import a register file');
  const src = sources[source_id];
  if (src === undefined) throw new RegisterFileError(`there is no register file source called ${source_id}`);
  const rows = readDelimited(text, src.delimiter);
  const head = src.header ? rows.shift() : undefined;
  const names = head?.map((h) => h.trim()) ?? [];
  const at = (c: Col): number => (typeof c === 'number' ? c : names.indexOf(c));
  const wanted: Col[] = [src.ref, src.postcode, ...src.address, ...Object.values(src.fields)];
  const missing = wanted.filter((c) => (typeof c === 'number' ? false : at(c) < 0));
  if (src.header && missing.length > 0) {
    throw new RegisterFileError(`the file's columns are not the ones ${src.publisher} describes, so nothing was imported. Missing: ${missing.join(', ')}`);
  }
  const width = Math.max(...wanted.map((c) => at(c)));
  const now = d.now();
  let kept = 0;
  let skipped = 0;
  const good: { ref: string; pc: string; address: string; fields: Record<string, string | number> }[] = [];
  const seen = new Set<string>();
  for (const r of rows) {
    if (!src.header && r.length <= width) {
      throw new RegisterFileError(`a row has ${r.length} columns where ${src.publisher}'s file has at least ${width + 1}, so nothing was imported`);
    }
    const cell = (c: Col): string => (r[at(c)] ?? '').trim();
    const ref = cell(src.ref);
    const pc = postcodeKey(cell(src.postcode));
    if (ref === '' || pc === '' || seen.has(ref)) { skipped++; continue; }
    seen.add(ref);
    const fields: Record<string, string | number> = {};
    for (const [name, c] of Object.entries(src.fields)) {
      const v = cell(c);
      if (v === '') continue;
      if (src.whole_numbers.includes(name)) {
        if (/^\d+$/.test(v)) fields[name] = Number(v);
        continue;
      }
      if (src.dates.includes(name)) {
        const iso = isoFromDayMonthYear(v);
        if (iso !== null) fields[name] = iso;
        continue;
      }
      fields[name] = v;
    }
    fields['location_postcode'] = pc;
    good.push({ ref, pc, address: src.address.map(cell).filter((x) => x !== '').join(', '), fields });
  }
  const replaced = d.db.tx(() => {
    const before = d.db.get<{ n: number }>('SELECT COUNT(*) AS n FROM register_file_rows WHERE source_id = ?', [source_id])?.n ?? 0;
    d.db.run('DELETE FROM register_file_rows WHERE source_id = ?', [source_id]);
    for (const g of good) {
      d.db.run('INSERT INTO register_file_rows (source_id, ref, postcode_key, address, fields, imported_at) VALUES (?, ?, ?, ?, ?, ?)',
        [source_id, g.ref, g.pc, g.address, JSON.stringify(g.fields), now]);
      kept++;
    }
    d.db.run('INSERT INTO register_file_imports (source_id, file_name, imported_at, rows_kept, rows_skipped, by_user) VALUES (?, ?, ?, ?, ?, ?)',
      [source_id, file_name, now, kept, skipped, actor.id]);
    return before;
  });
  d.audit.append({
    at: now, kind: 'REGISTER_FILE_IMPORTED', outcome: 'ALLOWED', actor_id: actor.id, actor_role: actor.role,
    object_type: 'register_file', object_id: source_id, detail: { source: source_id, kept, skipped, replaced },
  });
  return { kept, skipped_unreadable: skipped, replaced };
}

/* ================================================================== *
 * READING THE TABLE
 * ================================================================== */

export type FileRow = { readonly ref: string; readonly address: string; readonly postcode_key: string; readonly fields: Readonly<Record<string, string | number>> };

/** The rows at one postcode, and when the source was last imported (null: never). */
export function rowsAtPostcode(db: Db, source_id: FileSourceId, postcode: string | null | undefined): { readonly imported_at: string | null; readonly rows: readonly FileRow[] } {
  const last = db.get<{ at: string | null }>('SELECT MAX(imported_at) AS at FROM register_file_imports WHERE source_id = ?', [source_id])?.at ?? null;
  const pc = postcodeKey(postcode);
  if (last === null || pc === '') return { imported_at: last, rows: [] };
  const rows = db.all<{ ref: string; address: string; postcode_key: string; fields: string }>(
    'SELECT ref, address, postcode_key, fields FROM register_file_rows WHERE source_id = ? AND postcode_key = ? ORDER BY ref', [source_id, pc]);
  return {
    imported_at: last,
    rows: rows.map((r) => ({ ref: r.ref, address: r.address, postcode_key: r.postcode_key, fields: JSON.parse(r.fields) as Record<string, string | number> })),
  };
}
