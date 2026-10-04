/**
 * HEALTHCARE PREMISES FROM OPEN-LICENCE REGISTERS — AN IMPORT, AND NOTHING THAT CONTACTS ANYONE. Phase 153c, 4 October 2026.
 *
 * Word question 183, Sadique's: "Where will the healthcare property list come from, and can we use it for marketing?"
 * Built on our recommendation, for him to check: a list of healthcare premises built from registers published under
 * the Open Government Licence, keeping FOUR THINGS ONLY — the business's name, the address, the sector and the source
 * (with the register's own reference, so a row can be traced back). Lakhbir wants a list to load into the system; the
 * officer has not yet said how anyone on it may be contacted, so NOTHING HERE CONTACTS ANYONE: the table holds no
 * person's name, no email and no telephone number, and no route, job or message reads it to send anything.
 *
 * WHAT IS NEVER READ. Each source names the columns we read; every other column in the file — a registered manager,
 * a nominated individual, a telephone number, a website — is never read at all, as the connectors read only named keys.
 * A ROW WHOSE BUSINESS NAME MAY BE A PERSON'S is held back and counted, never kept: a practice named after its owner
 * ("Dr A Patel", "Mrs J Smith Dental Care") names a real person, which is exactly what the officer's question is about.
 * N4: a row we cannot read (no name, no address, no sector we serve) is skipped and counted, never guessed.
 *
 * THE COLUMN NAMES are as each register describes its download (read 4 October 2026, not yet against a real file).
 * The first real file is checked against them before anything is kept; a file whose columns do not match is refused
 * whole. In the test system it runs on invented rows only.
 */
import type { Db } from '../db.ts';
import type { AuditLog } from '../audit.ts';
import { parseCsv } from './pack-lines.ts';
import { normalisePostcode } from '../connectors/postcode-check.ts';

export type PremisesSector = 'care_homes' | 'dental' | 'supported_living' | 'gp' | 'private_hospital';

export type PremisesSource = {
  readonly source_id: 'CQC_CARE_DIRECTORY' | 'NHS_ODS_DENTAL' | 'NHS_ODS_GP';
  readonly publisher: string;
  readonly licence: string;
  /** The columns read, by name (CQC) or by position (NHS ODS publishes its files without a header row). */
  readonly columns: { readonly ref: string | number; readonly name: string | number; readonly address: readonly (string | number)[]; readonly postcode: string | number; readonly sector?: string };
  /** A fixed sector for the whole file, or null where each row says (CQC's service types). */
  readonly sector: PremisesSector | null;
  readonly header: boolean;
};

export const PREMISES_SOURCES: Readonly<Record<PremisesSource['source_id'], PremisesSource>> = Object.freeze({
  CQC_CARE_DIRECTORY: {
    source_id: 'CQC_CARE_DIRECTORY', publisher: 'Care Quality Commission', licence: 'Open Government Licence v3.0', header: true, sector: null,
    columns: { ref: 'CQC Location ID', name: 'Name', address: ['Address'], postcode: 'Postcode', sector: 'Service types' },
  },
  NHS_ODS_DENTAL: {
    source_id: 'NHS_ODS_DENTAL', publisher: 'NHS England, Organisation Data Service (egdpprac)', licence: 'Open Government Licence v3.0', header: false, sector: 'dental',
    columns: { ref: 0, name: 1, address: [4, 5, 6, 7, 8], postcode: 9 },
  },
  NHS_ODS_GP: {
    source_id: 'NHS_ODS_GP', publisher: 'NHS England, Organisation Data Service (epraccur)', licence: 'Open Government Licence v3.0', header: false, sector: 'gp',
    columns: { ref: 0, name: 1, address: [4, 5, 6, 7, 8], postcode: 9 },
  },
});

/** CQC's "Service types" to the sectors we serve. Anything else is not ours, and is skipped. */
export function sectorFromServiceTypes(s: string): PremisesSector | null {
  if (/nursing home|residential home|care home/i.test(s)) return 'care_homes';
  if (/supported living/i.test(s)) return 'supported_living';
  if (/dentist|dental/i.test(s)) return 'dental';
  if (/doctors|\bgps?\b/i.test(s)) return 'gp';
  if (/hospital/i.test(s)) return 'private_hospital';
  return null;
}

/** A business name that may be a person's: a title, or initials then a surname. Held back, never kept. */
const PERSONAL_NAME = /(^|\s)(dr|mr|mrs|ms|miss|mx|prof|professor|sir|dame)\.?\s+[a-z]/i;
const INITIALS_SURNAME = /^([A-Z]\.?\s+){1,3}[A-Z][a-z]+(\s|$)/;
export function mayNameAPerson(name: string): boolean {
  return PERSONAL_NAME.test(name) || INITIALS_SURNAME.test(name.trim());
}

export type PremisesImport = {
  readonly kept: number;
  readonly already_held: number;
  readonly held_back_may_name_a_person: number;
  readonly skipped_unreadable: number;
  readonly skipped_not_our_sector: number;
};

function rowsOf(text: string, src: PremisesSource): readonly Readonly<Record<string | number, string>>[] {
  if (src.header) {
    const rows = parseCsv(text);
    const want = [src.columns.ref, src.columns.name, ...src.columns.address, src.columns.postcode, ...(src.columns.sector === undefined ? [] : [src.columns.sector])];
    const first = rows[0];
    if (first !== undefined) {
      const missing = want.filter((c) => !(String(c) in first));
      if (missing.length > 0) throw new Error(`The file does not have the columns we read (${missing.join(', ')}). Nothing was kept.`);
    }
    return rows;
  }
  // No header row: give each field its position, and read the file as one with a header made of the positions.
  const width = (text.split(/\r?\n/).find((l) => l.trim() !== '') ?? '').split(',').length;
  return parseCsv(`${Array.from({ length: width }, (_, i) => String(i)).join(',')}\n${text}`);
}

/** Import one register file. Keeps the four things only; holds back a name that may be a person's; contacts nobody. */
export function importPremises(
  d: { db: Db; audit: AuditLog; now: () => string; newId: () => string },
  source_id: PremisesSource['source_id'], text: string, actor: { id: string; role: string },
): PremisesImport {
  const src = PREMISES_SOURCES[source_id];
  if (src === undefined) throw new Error('That is not a register we import from.');
  const at = d.now();
  let kept = 0, already = 0, personal = 0, unreadable = 0, notOurs = 0;
  const cell = (r: Readonly<Record<string | number, string>>, c: string | number) => (r[String(c)] ?? '').trim();
  d.db.tx(() => {
    for (const r of rowsOf(text, src)) {
      const name = cell(r, src.columns.name);
      const address = src.columns.address.map((c) => cell(r, c)).filter((x) => x !== '').join(', ');
      const postcode = normalisePostcode(cell(r, src.columns.postcode));
      const ref = cell(r, src.columns.ref);
      const sector = src.sector ?? (src.columns.sector === undefined ? null : sectorFromServiceTypes(cell(r, src.columns.sector)));
      if (name.length < 2 || address.length < 2 || postcode === null || ref === '') { unreadable++; continue; }
      if (sector === null) { notOurs++; continue; }
      if (mayNameAPerson(name)) { personal++; continue; }
      if (d.db.get('SELECT 1 AS x FROM healthcare_premises WHERE source_id = ? AND source_ref = ?', [src.source_id, ref]) !== undefined) { already++; continue; }
      d.db.run('INSERT INTO healthcare_premises (id, business_name, address, postcode, sector, source_id, source_ref, licence, imported_by, imported_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [d.newId(), name.slice(0, 200), address.slice(0, 300), postcode, sector, src.source_id, ref.slice(0, 40), src.licence, actor.id, at]);
      kept++;
    }
  });
  const out = { kept, already_held: already, held_back_may_name_a_person: personal, skipped_unreadable: unreadable, skipped_not_our_sector: notOurs };
  d.audit.append({ at, kind: 'PREMISES_IMPORTED', outcome: 'ALLOWED', actor_id: actor.id, actor_role: actor.role, object_type: 'healthcare_premises', object_id: src.source_id,
    detail: { kept, already_held: already, held_back: personal, skipped: unreadable + notOurs } });
  return out;
}
