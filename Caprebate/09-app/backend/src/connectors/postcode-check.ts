/**
 * THE FREE POSTCODE CHECK AT THE ADDRESS QUESTION — POSTCODES.IO. Phase 151, 24 September 2026.
 * BUILT FOR REAL AND SWITCHED OFF, BEHIND THE FREE-TIER GATE.
 *
 * WHAT LAKHBIR ASKED (Word answers 16, 17, 35 and 36). Homedata, the paid address lookup, runs after signing, when staff
 * start the research — built (src/connectors/homedata.ts). At the address question, add a FREE address lookup if one
 * exists. PHASE 151 FOUND NONE THAT A PAID SERVICE MAY USE: getAddress.io stopped trading in February 2026, and every
 * other postcode-to-address list is paid or a trial (the source register, POSTCODES_IO_OPEN; the research is
 * 04-phase-work/phase151/free-address-lookup.md). So this is the best free thing there is: a POSTCODE CHECK. The client
 * types their postcode; this confirms it exists and fills in the council area, the region and the country; the client
 * types the building and the street. No address list, no UPRN.
 *
 * TWO THINGS KEEP IT OFF, AND NEITHER IS A SECOND GATE.
 *   1. THE FREE-TIER GATE — CB_REGISTRY.precondition, "a published privacy notice reachable from the address question".
 *      It is read here through `gateStatus`, exactly as the research panel reads it. Not restated; not duplicated.
 *   2. THIS SWITCH — POSTCODE_CHECK.enabled, false — and `named_in_privacy_notice`, false: the notice must name
 *      Postcodes.io before it is switched on (Lakhbir's instruction for this phase).
 * OFF, NOTHING IS SENT, and the address question works exactly as it does today: the client types the address.
 *
 * WHAT IS SENT: THE POSTCODE, AND NOTHING ELSE. Not a name, not a company, not the rest of the address.
 *
 * N4, AND WHY NOTHING HERE CAN STOP A CLIENT. A postcode this cannot check — the service down, the postcode not found, a
 * Northern Ireland postcode it may not be used for — is NOT_CHECKED, and the client goes on typing their address. A
 * check that did not run is never read as a postcode that does not exist, and never as one that does.
 *
 * NORTHERN IRELAND IS REFUSED BEFORE ANY CALL. Postcodes.io's own licence page: commercial use of BT postcodes needs a
 * licence from Land and Property Services, which we do not hold.
 */

import { callOutside, type CallDeps } from './http.ts';
import type { GateStatus } from './registers.ts';

export const POSTCODE_CHECK_SERVICE_ID = 'POSTCODES_IO';
export const POSTCODE_CHECK_ENDPOINT = '/postcodes/{postcode}';

export type PostcodeCheckConfig = {
  readonly enabled: boolean;
  /** Postcodes.io is named in the published privacy notice. */
  readonly named_in_privacy_notice: boolean;
  /**
   * TESTING ONLY, as the identity check's (src/connectors/identity-check.ts, Phase 151h): a person's decision to send
   * before the notice is published and names the service. It never makes `named_in_privacy_notice` true. Absent is false.
   */
  readonly papers_waived_for_testing?: boolean;
  /** Who waived it, when, and in what words. */
  readonly waiver_record?: string | null;
};

/*
 * SWITCHED ON FOR TESTING, 30 September 2026 (Lakhbir: "switch on companies house and postcodes.io"). The build-then-check
 * rule: built and on in the test website, then Sadique (DPO) is asked whether it is viable. `named_in_privacy_notice`
 * stays FALSE because it is false. Before real visitors: publish the notice naming Postcodes.io, set that true, and
 * set `papers_waived_for_testing` to false.
 */
export const POSTCODE_CHECK: PostcodeCheckConfig = Object.freeze({
  enabled: true, named_in_privacy_notice: false,
  papers_waived_for_testing: true,
  waiver_record: 'Lakhbir Dhillon, 30 September 2026, in the chat with Claude: "switch on companies house and postcodes.io". The privacy notice is a draft and is not published; it does not yet name Postcodes.io. Test website, invented data only.',
});

/** What must be true before a postcode is sent, each in plain words. Empty means it can be sent. */
export function postcodeCheckMissing(cfg: PostcodeCheckConfig, gate: GateStatus): string[] {
  const out: string[] = [];
  const waived = cfg.papers_waived_for_testing === true;
  if (!gate.free_enabled && !waived) out.push('Publish the privacy notice and link it from the address question.');
  if (cfg.named_in_privacy_notice !== true && !waived) out.push('Name Postcodes.io in the privacy notice.');
  if (cfg.enabled !== true) out.push('Then switch the postcode check on.');
  return out;
}

export type PostcodeCheck =
  | { readonly state: 'CHECKED'; readonly postcode: string; readonly council_area: string | null; readonly region: string | null; readonly country: string | null }
  | { readonly state: 'NOT_FOUND'; readonly postcode: string; readonly why: string }
  | { readonly state: 'NOT_CHECKED'; readonly why: string };

/** The UK postcode shape, spaces and case forgiven. The service decides whether it exists. */
const POSTCODE_SHAPE = /^([A-Z]{1,2}[0-9][A-Z0-9]?) ?([0-9][A-Z]{2})$/;

export function normalisePostcode(raw: string): string | null {
  const m = POSTCODE_SHAPE.exec(raw.trim().toUpperCase().replace(/\s+/g, ' '));
  return m === null ? null : `${m[1]} ${m[2]}`;
}

export async function checkPostcode(i: {
  readonly postcode: string;
  readonly gate: GateStatus;
  readonly deps: CallDeps;
  /** TESTS ONLY. Absent, POSTCODE_CHECK governs, and it is off. */
  readonly config?: PostcodeCheckConfig;
}): Promise<PostcodeCheck> {
  const cfg = i.config ?? POSTCODE_CHECK;
  const missing = postcodeCheckMissing(cfg, i.gate);
  if (missing.length > 0) return { state: 'NOT_CHECKED', why: missing.join(' ') };
  const pc = normalisePostcode(i.postcode);
  if (pc === null) return { state: 'NOT_CHECKED', why: 'That does not look like a UK postcode. Check it, or type your address in full.' };
  if (pc.startsWith('BT')) return { state: 'NOT_CHECKED', why: 'We cannot check Northern Ireland postcodes. Please type your address in full.' };
  const r = await callOutside(i.deps, {
    service_id: POSTCODE_CHECK_SERVICE_ID, endpoint: POSTCODE_CHECK_ENDPOINT, params: { postcode: pc.replace(' ', '') },
    actor_id: null, actor_role: null, claim_id: null,
    gate: { free_gate_open: i.gate.free_enabled, engagement_signed: false, switched_on: cfg.enabled },
  });
  if (r.status === 404) return { state: 'NOT_FOUND', postcode: pc, why: 'We could not find that postcode. Check it, or type your address in full.' };
  if (r.outcome !== 'OK' || r.body === null) return { state: 'NOT_CHECKED', why: 'We could not check the postcode just now. Please type your address in full.' };
  let body: unknown;
  try { body = JSON.parse(r.body); } catch { return { state: 'NOT_CHECKED', why: 'We could not check the postcode just now. Please type your address in full.' }; }
  const res = (body as { result?: { postcode?: unknown; admin_district?: unknown; region?: unknown; country?: unknown } }).result;
  if (typeof res?.postcode !== 'string') return { state: 'NOT_CHECKED', why: 'We could not check the postcode just now. Please type your address in full.' };
  const text = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v : null);
  return { state: 'CHECKED', postcode: res.postcode, council_area: text(res.admin_district), region: text(res.region), country: text(res.country) };
}
