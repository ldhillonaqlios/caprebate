/**
 * THE ONE DOOR REGISTER DATA ENTERS THE DATABASE BY — and, since Phase 146b (22 September 2026), only that.
 *
 * The connector shape, the per-source switches, `gateStatus` and `planResearch` moved to
 * src/connectors/registers.ts, and the one way to call outside is src/connectors/http.ts. They are re-exported
 * below, unchanged, so every caller and every existing test reads the same functions as before.
 *
 * `ingestRegisterRecord` STAYS HERE, and this file keeps its name, because test/seed.test.ts asserts that this is
 * the only file under src/ that writes register_records — one door, so the N2 check below guards every path in.
 *
 * NOTHING FIRES YET. Every connector switch is off (REGISTER_SWITCHES), so no register is contacted by any code
 * path; Phases 146c and 146d build the real connectors behind the shape, switched off.
 *
 * N2 — THE NAME EXCLUSION REGISTER — IS WIRED IN, NOT RESTATED.
 * caprebate-name-exclusion.ts is the rule. Every record passes through
 * `assertNoUnauthorisedName` at the INGESTION boundary, which is where that
 * module says the check belongs: a filter applied at report time would leave
 * the name sitting in storage in between.
 */

import type { Db } from '../db.ts';
import {
  assertNoUnauthorisedName,
  type IngestedRecord,
} from '../../../../04-phase-work/phase3/caprebate-name-exclusion.ts';

export {
  gateStatus, planResearch, STUB_NOTICE, REGISTER_SWITCHES, switchedOn,
  type Tier, type SourceState, type GateStatus,
} from '../connectors/registers.ts';

/**
 * Store one register record. THE ONLY WAY register data enters the database.
 *
 * Throws NameExclusionError if the record would write a personal name outside
 * the two documented exceptions, or carries a field on neither the keep list
 * nor the exclude list — an uncatalogued field is refused, never assumed safe.
 */
export function ingestRegisterRecord(
  db: Db,
  ids: () => string,
  now: () => string,
  business_id: string,
  rec: IngestedRecord,
  /** Phase 139: the company's property a property register's record is about, where the lookup was keyed on one. */
  opts: { readonly property_id?: string | null } = {},
): string {
  assertNoUnauthorisedName(rec); // N2. Fails closed on an unknown source.

  const id = ids();
  db.run(
    'INSERT INTO register_records (id, business_id, source_id, entity_id, fields_json, obtained_at, property_id) ' +
      'VALUES (?, ?, ?, ?, ?, ?, ?)',
    [id, business_id, rec.sourceId, rec.entityId, JSON.stringify(rec.fields), now(), opts.property_id ?? null],
  );
  return id;
}

/* ------------------------------------------------------------------ *
 * AND THE ONE DOOR OUT — Phase 146j, 25 September 2026.
 *
 * Two decisions a person makes put register data in: choosing one entry from a close-match list (Phase 146h) and
 * saying a name on a client document belongs to an organisation (Phase 146i). Both can now be taken back, and taking
 * one back takes out what it put in — so, like the way in, the way out is in this file and nowhere else, and
 * test/phase146j.test.ts asserts it. Neither function decides WHETHER something may be removed: that is the caller's,
 * who has already checked that nobody approved it and that this decision is what wrote it. These only do it, and
 * refuse to do more than they were asked.
 * ------------------------------------------------------------------ */

/**
 * Remove ONE register record, named by its own id and its client. Returns whether a row went. It never finds a row
 * by what it says — the caller names the row a decision recorded, never one it re-derived.
 */
export function removeRegisterRecord(db: Db, business_id: string, record_id: string): boolean {
  return db.run('DELETE FROM register_records WHERE id = ? AND business_id = ?', [record_id, business_id]).changes === 1;
}

/**
 * Remove ONE FIELD from one register record, and no other. The rest of the record is written back exactly as it
 * was. Returns false, and changes nothing, where the record is not this client's, cannot be read, or does not carry
 * the field. Taking a field out can add no name, so N2 has nothing to check on the way out.
 */
export function removeRegisterField(db: Db, business_id: string, record_id: string, field_id: string): boolean {
  const r = db.get<{ fields_json: string }>(
    'SELECT fields_json FROM register_records WHERE id = ? AND business_id = ?', [record_id, business_id]);
  if (r === undefined) return false;
  let fields: Record<string, unknown>;
  try {
    const v = JSON.parse(r.fields_json) as unknown;
    if (v === null || typeof v !== 'object' || Array.isArray(v)) return false;
    fields = v as Record<string, unknown>;
  } catch { return false; }
  if (!Object.prototype.hasOwnProperty.call(fields, field_id)) return false;
  const { [field_id]: _gone, ...rest } = fields;
  db.run('UPDATE register_records SET fields_json = ? WHERE id = ? AND business_id = ?',
    [JSON.stringify(rest), record_id, business_id]);
  return true;
}
