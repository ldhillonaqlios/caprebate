/**
 * THE WELSH AND SCOTTISH CARE REGULATORS — A PROPERTY'S REGISTERED SERVICE, ITS PLACES AND ITS PROVIDER.
 * Phase 155 (lines 1 and 2), 4 October 2026. Switched off: REGISTER_SWITCHES.CIW and REGISTER_SWITCHES.CARE_INSPECTORATE.
 *
 * THE SAME SHAPE AS THE ENGLISH ONE (src/connectors/cqc.ts) — registration, places, provider — and the same match:
 * the services at the typed postcode, scored on their address lines against the typed address, and only one clear
 * ACCEPT taken (or a person's pick of a close one). BUT NOTHING IS SENT OUTSIDE. Neither regulator has an API; each
 * publishes a downloadable list, which a person imports into a table on this server (src/web/register-files.ts,
 * `node src/cli.ts import-register`). This reads that table, as the ONS postcode lookup reads its own. No list
 * imported, no lookup: it says so, and the fact stays asked (N4).
 *
 *   CIW                Wales only (CB_JURIS: regulator_social "CIW"). Places = "Maximum no. of places".
 *   CARE_INSPECTORATE  Scotland only (CB_JURIS: regulator_social "CARE_INSPECTORATE"). Places = "Registered_Places",
 *                      and beds where the datastore states them (TotalBeds).
 *
 * WHAT IS KEPT: the regulator's own references for the service and its provider, the kind of service, the places, the
 * registration date the file gives (the Scottish service's; the Welsh file has only the provider's), the council
 * area and the UPRN where stated — the fields the source register permits. NEVER a name: the import never read one.
 * A service the Scottish datastore lists as Inactive is kept with that status, so a person sees it is not active.
 */
import type { Db } from '../db.ts';
import { defineSteppedConnector, type LookupResult } from './registers.ts';
import { addressFromLines, matchAddress, applyPick, pickedNote, PICK_GONE_WHY, MATCH_THRESHOLDS, postcodeKey, type Candidate, type PickQuery } from './matching.ts';
import { jurisSource, type Nation, type TypedProperty } from './nations.ts';
import { rowsAtPostcode, type FileRow, type FileSourceId } from '../web/register-files.ts';

export type FileRegisterQuery = {
  readonly property: TypedProperty | null;
  readonly nation: Nation | null;
  readonly db: Db | null;
} & PickQuery;

/** More services than this at one postcode is a person's to sort out, as for the English regulator. */
export const FILE_REGISTER_MAX_CANDIDATES = 10;

const WHO: Readonly<Record<FileSourceId, { readonly name: string; readonly nation: Nation; readonly where: string }>> = Object.freeze({
  CIW: { name: 'Care Inspectorate Wales', nation: 'wales', where: 'Wales' },
  CARE_INSPECTORATE: { name: 'the Care Inspectorate', nation: 'scotland', where: 'Scotland' },
});

function fileRegister(source_id: FileSourceId) {
  const who = WHO[source_id];
  return defineSteppedConnector<FileRegisterQuery>({
    source_id, service_id: source_id, owner: null, needs: [],
    // Never used: this lookup makes no call. A call to this name is refused by src/connectors/http.ts, which lists no
    // such service.
    first: () => ({ endpoint: '/none' }),
    async lookup(_step, q): Promise<LookupResult> {
      if (q.nation === null) return { kind: 'NOT_COVERED', why: `we do not know which part of the UK the property is in, and ${who.name} covers ${who.where} only` };
      if (jurisSource(q.nation, 'regulator_social') !== source_id) return { kind: 'NOT_COVERED', why: `the property is not in ${who.where}, and ${who.name} covers ${who.where} only` };
      if (q.db === null) return { kind: 'NOT_COVERED', why: `${who.name}'s list is not set up here` };
      const pc = postcodeKey(q.property?.postcode);
      if (q.property === null || pc === '') return { kind: 'NOT_MATCHED', code: 'INSUFFICIENT_INPUT', why: 'there is no postcode we can read for the property', calls: [] };
      let found: { imported_at: string | null; rows: readonly FileRow[] };
      try { found = rowsAtPostcode(q.db, source_id, pc); } catch { return { kind: 'NOT_COVERED', why: `${who.name}'s list is not set up here` }; }
      if (found.imported_at === null) {
        return { kind: 'NOT_COVERED', why: `${who.name}'s list has not been imported here yet. A person downloads it and imports it (node src/cli.ts import-register ${source_id})` };
      }
      if (found.rows.length === 0) return { kind: 'NOT_MATCHED', code: 'NO_MATCH', why: `${who.name}'s list has no service at this postcode`, calls: [] };
      if (found.rows.length > FILE_REGISTER_MAX_CANDIDATES) {
        return { kind: 'NOT_MATCHED', code: 'MATCH_REVIEW', why: `${who.name}'s list has ${found.rows.length} services at this postcode. That is too many for us to pick one, so a person must choose`, calls: [] };
      }
      const candidates: Candidate<FileRow>[] = found.rows.map((r) => ({ address: addressFromLines([r.address], r.postcode_key), payload: r }));
      const typed = addressFromLines([q.property.address_line_1, q.property.address_line_2], q.property.postcode, q.property.town);
      const m = matchAddress(typed, candidates, MATCH_THRESHOLDS.CQC, who.name);
      const pick = applyPick(m, q, { profile: 'CQC', register: who.name, keyOf: (r) => r.ref });
      if (pick.kind === 'GONE') return { kind: 'NOT_MATCHED', code: 'MATCH_REVIEW', why: PICK_GONE_WHY, calls: [] };
      const took = pick.kind === 'CHOSEN' ? pick.best : m.best;
      const how = pick.kind === 'CHOSEN' ? pickedNote(pick.best.score, who.name) : m.why;
      if (took === null || (pick.kind !== 'CHOSEN' && m.status !== 'ACCEPT')) {
        return { kind: 'NOT_MATCHED', code: m.status === 'REVIEW' ? 'MATCH_REVIEW' : m.status === 'INSUFFICIENT_INPUT' ? 'INSUFFICIENT_INPUT' : 'NO_MATCH', why: m.why, calls: [] };
      }
      const fields = { ...took.candidate.payload.fields };
      return {
        kind: 'READ', calls: [],
        bundle: { records: [{ sourceId: source_id, entityId: took.candidate.payload.ref, fields }], facts: fields },
        note: `looked up in ${who.name}'s list on this server (imported ${found.imported_at.slice(0, 10)}) — ${how}, and we keep the registration and where it came from. Nothing was sent outside`,
      };
    },
  });
}

export const ciw = fileRegister('CIW');
export const careInspectorate = fileRegister('CARE_INSPECTORATE');
