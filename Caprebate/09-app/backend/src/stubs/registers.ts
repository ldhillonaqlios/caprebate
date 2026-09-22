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
