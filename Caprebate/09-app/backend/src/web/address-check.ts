/**
 * THE POSTCODE CHECK AT THE ADDRESS QUESTION, AND "ANSWER IT MYSELF". Phase 151b, 25 September 2026.
 *
 * 1 · THE POSTCODE CHECK, WIRED INTO THE BACK END'S OWN ASSESSMENT AS A SERVER-SIDE STEP. Phase 151 built the check
 *     (src/connectors/postcode-check.ts: Postcodes.io, the postcode only, switched off behind the free-tier gate and
 *     until the privacy notice names the service). This runs it when a client saves the property screen (Q2), on this
 *     server, never in the page: THE SITE FILE STILL MAKES NO NETWORK CALL, and neither does the form the back end
 *     draws. The postcode is found in the address the client typed; nothing else is sent.
 *     OFF, AND ON ANY FAILURE, THE QUESTION IS EXACTLY TODAY'S TYPED ADDRESS: nothing is added to the property, nothing
 *     is shown, nothing stops the client. Only a CHECKED postcode adds anything — one line under the address saying
 *     where the postcode is — and the client's typed address is never changed by it.
 *
 * 2 · "ANSWER IT MYSELF" — Word answer 180, "Should people be able to skip the automatic lookups and answer the
 *     questions themselves?", closed 24 September 2026 by Lakhbir ("I think a manual option is best to have as dont
 *     want customers to get put off by not able to look up there property"). A choice at the address question: answer
 *     the property questions yourself instead of the lookups. SWITCHED OFF WITH THE LOOKUPS: it is offered only when
 *     the free lookups could run at all (the free-tier gate, CB_REGISTRY.precondition, read through registryGate — no
 *     second gate). Chosen, the postcode check is not run for that client, the choice goes with the claim when the
 *     assessment is sent (migration 051, lookups_declined, and LOOKUPS_DECLINED in the audit log), and the research run
 *     leaves the free lookups for that client unrun, with a plain line saying the client chose to answer themselves.
 *     Not chosen, or never offered, changes nothing (N4: an absent choice is not a refusal).
 */

import type { Db } from '../db.ts';
import type { App } from '../app.ts';
import { checkPostcode, normalisePostcode, POSTCODE_CHECK, type PostcodeCheck, type PostcodeCheckConfig } from '../connectors/postcode-check.ts';
import { gateStatus, type GateStatus } from '../connectors/registers.ts';
import { registryGate } from './engine.ts';

/** The free-tier gate, as the research panel reads it. */
export function freeGate(): GateStatus {
  return gateStatus({ precondition: registryGate() });
}

/** Whether "answer it myself" is offered: only where the lookups could run at all. */
export function lookupsOffered(gate: GateStatus = freeGate()): boolean {
  return gate.free_enabled;
}

/** The words of the choice, as the client reads them. */
export const ANSWER_MYSELF_LABEL = 'I’ll answer the questions about the property myself. Please don’t look it up in public records.';

/** A UK postcode anywhere in what the client typed — the last one, as an address ends with it. Null when there is none. */
export function postcodeIn(address: string | null | undefined): string | null {
  if (typeof address !== 'string') return null;
  const found = [...address.toUpperCase().matchAll(/\b([A-Z]{1,2}[0-9][A-Z0-9]?)\s*([0-9][A-Z]{2})\b/g)];
  const last = found.at(-1);
  return last === undefined ? null : normalisePostcode(`${last[1]} ${last[2]}`);
}

/** What the property keeps from a check: only a CHECKED postcode's place. Anything else keeps nothing. */
export type KeptCheck = { readonly postcode: string; readonly council_area: string | null; readonly region: string | null; readonly country: string | null };

/**
 * Run the check for each property with a postcode in its typed address, on this server. Returns what to keep on each
 * property, by index — null where nothing is kept (off, failed, not found, no postcode, or the client chose to answer
 * themselves). The typed address is never touched.
 */
export async function checkPropertyPostcodes(
  app: App, properties: readonly Record<string, unknown>[], declined: boolean,
  opts: { readonly gate?: GateStatus; readonly config?: PostcodeCheckConfig } = {},
): Promise<(KeptCheck | null)[]> {
  const gate = opts.gate ?? freeGate();
  const config = opts.config ?? POSTCODE_CHECK;
  const out: (KeptCheck | null)[] = [];
  for (const p of properties) {
    const pc = declined ? null : postcodeIn(p['address'] as string | null | undefined);
    if (pc === null) { out.push(null); continue; }
    const r: PostcodeCheck = await checkPostcode({ postcode: pc, gate, config, deps: { audit: app.audit, now: app.now, transport: app.outside } });
    out.push(r.state === 'CHECKED' ? { postcode: r.postcode, council_area: r.council_area, region: r.region, country: r.country } : null);
  }
  return out;
}

/** The one line shown under a checked address. Nothing is shown for anything else. */
export function checkedLine(k: KeptCheck): string {
  const where = [k.council_area, k.region, k.country].filter((x): x is string => x !== null).join(', ');
  return where === '' ? `We found the postcode ${k.postcode}.` : `We found the postcode ${k.postcode}: ${where}.`;
}

/** Keep the client's choice with their organisation when the assessment is sent. Once; a later one changes nothing. */
export function recordLookupsDeclined(d: { db: Db; audit: App['audit']; now: () => string }, business_id: string): void {
  if (d.db.get('SELECT business_id FROM lookups_declined WHERE business_id = ?', [business_id]) !== undefined) return;
  d.db.run("INSERT INTO lookups_declined (business_id, declined_at, how) VALUES (?, ?, 'ASSESSMENT')", [business_id, d.now()]);
  d.audit.append({ at: d.now(), kind: 'LOOKUPS_DECLINED', outcome: 'ALLOWED', actor_id: null, actor_role: null, object_type: 'business', object_id: business_id, detail: { how: 'ASSESSMENT' } });
}

/** Whether a client chose to answer the property questions themselves. */
export function lookupsDeclined(db: Db, business_id: string): boolean {
  return db.get('SELECT business_id FROM lookups_declined WHERE business_id = ?', [business_id]) !== undefined;
}

/** The research panel's line for a free lookup the client asked us not to run. */
export const DECLINED_LINE = 'Not looked up: the client chose to answer the questions about the property themselves.';
