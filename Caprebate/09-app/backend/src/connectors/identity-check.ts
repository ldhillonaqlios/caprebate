/**
 * AN ONLINE IDENTITY CHECK FOR THE MONEY-LAUNDERING RULES — VERIFF. Phase 151, 24 September 2026.
 * BUILT FOR REAL AND SWITCHED OFF, INSIDE THE ANTI-MONEY-LAUNDERING CHECK.
 *
 * WHAT LAKHBIR ASKED FOR (Word question 10, still open on supervision). An outside identity check the client completes
 * online: we send a link, the client photographs their ID and takes a selfie, and we get the result. His previous firm
 * used APLYiD ("Apyid"). Phase 151 read three providers' own pages and developer documents on 24 September 2026:
 *
 *   VERIFF   self-serve, published prices (US$0.80 a check on its Essential plan, US$49 a month minimum), a sandbox on
 *            every plan, one POST that returns a hosted link, and a decision webhook SIGNED with HMAC-SHA256 in
 *            X-HMAC-SIGNATURE. Certified under the UK digital identity trust framework on its own statement. An
 *            Estonian company, so the data is held in the EU. BUILT HERE FIRST.
 *   CREDAS   UK data only, certified on its own statement, £0.80 to £1.69 a check, accountant-focused, PEP and
 *            sanctions bundled — but API access only on its Pro/Enterprise tier, set up by a consultant, and its
 *            webhook is NOT signed. The strongest second choice.
 *   APLYiD   continuity with Lakhbir's old firm and the simplest API — but no certification found, no published price,
 *            API access through an account manager, an unsigned webhook, and data in Dublin with engineers in New
 *            Zealand able to reach it.
 * The research is 04-phase-work/phase151/identity-check-providers.md.
 *
 * WHY IT IS OFF, AND WHAT TURNS IT ON. `IDENTITY_CHECK.enabled` ships false. `identityCheckMissing` lists what must be
 * true first, in plain words, and every one is a person's decision, not Claude's.
 *   CHANGED 24 September 2026, Lakhbir in chat: we do not need to be supervised for anti-money-laundering, "however we
 *   still check for identity" (Word question 10, recorded; the accountant confirms the supervision point). So the
 *   identity check NO LONGER WAITS ON the customer-due-diligence setting AML_IN_SCOPE: every client's identity is
 *   checked either way. And Lakhbir chose Veriff (Word question 225, closed).
 *   1. (removed: customer due diligence in force)
 *   2. the provider chosen — Veriff, Lakhbir's choice;
 *   3. the provider named as a processor in the privacy notice AND in clause 7 of the engagement letter (the Phase 115
 *      rule: nothing carries client data through a processor the client was not told about);
 *   4. its two keys in the key file (VERIFF_API_KEY, VERIFF_SHARED_SECRET), never in code;
 *   5. then the switch.
 * OFF, NOTHING LEAVES THIS SERVER: `startIdentityCheck` refuses before any call, any audit row of a call, anything.
 *
 * WHAT IS SENT. The first and last name of the person being checked, and an opaque reference to our check. Never an
 * address, a company, a claim, a figure or an email. The client's documents and selfie go from their phone to Veriff,
 * never through us.
 *
 * WHAT COMES BACK, AND N4. Veriff's decision arrives by webhook. It is believed ONLY when its signature is right, and
 * only these map to an answer: approved -> PASS; declined -> FAIL; resubmission_requested and review -> REFER;
 * expired and abandoned -> NOT_COMPLETED. ANY OTHER STATUS, A MISSING ONE, OR A BAD SIGNATURE IS NEVER A PASS: a
 * status we do not know is REFER, for a person to look at, and an unsigned body is refused outright.
 *
 * WHAT IT DOES NOT DO. It never finishes a check on its own. A PASS is recorded on the check as evidence of how
 * identity was verified; a person still completes the check (`completeCheck` in src/web/compliance-aml.ts), as today.
 * And it keeps its own record of the decision: Veriff keeps its copy for a short time only, far less than the five
 * years the money-laundering rules ask us to keep ours.
 */

import { createHmac, timingSafeEqual } from 'node:crypto';
import type { SecretStore } from '../secrets.ts';
import { callOutside, type CallDeps } from './http.ts';

export const IDENTITY_SERVICE_ID = 'VERIFF_IDV';
/** The endpoint as a template, which is what the audit row records. */
export const IDENTITY_SESSION_ENDPOINT = '/v1/sessions';

export type IdentityCheckConfig = {
  readonly enabled: boolean;
  readonly provider: 'VERIFF' | null;
  /** The provider is named as a processor in the published privacy notice. */
  readonly named_in_privacy_notice: boolean;
  /** The provider is named as a processor in clause 7 of the engagement letter. */
  readonly named_in_engagement_letter: boolean;
  /** The Word question that decides whether this is needed at all, quoted by its title. */
  readonly question: string;
};

/** The question that chose the provider, closed 24 September 2026: Veriff. Quoted by its title. */
export const IDENTITY_CHECK_QUESTION =
  'Which online identity check should clients use for the money-laundering rules: Veriff, Credas or APLYiD?';

export const IDENTITY_CHECK: IdentityCheckConfig = Object.freeze({
  enabled: false,
  provider: 'VERIFF',
  named_in_privacy_notice: false,
  named_in_engagement_letter: false,
  question: IDENTITY_CHECK_QUESTION,
});

/** What must be true before a check can be sent, each in plain words. Empty means it can be sent. */
export function identityCheckMissing(cfg: IdentityCheckConfig, secrets: SecretStore): string[] {
  const out: string[] = [];
  if (cfg.provider === null) out.push('Choose the identity check service.');
  if (cfg.named_in_privacy_notice !== true || cfg.named_in_engagement_letter !== true) {
    out.push('Name that service in the privacy notice and in the engagement letter.');
  }
  const mine = secrets.forOwner('VERIFF_IDV');
  if (!mine.has('VERIFF_API_KEY') || !mine.has('VERIFF_SHARED_SECRET')) out.push('Add the identity check service’s keys to the server.');
  if (cfg.enabled !== true) out.push('Then switch the identity check on.');
  return out;
}

export type IdentityStart =
  | { readonly state: 'SENT'; readonly session_id: string; readonly link: string }
  | { readonly state: 'NOT_SENT'; readonly why: string };

export type IdentityStartInput = {
  readonly first_name: string;
  readonly last_name: string;
  /** Our own check's id. Sent as Veriff's vendorData, so its decision can be matched back. No meaning outside. */
  readonly check_ref: string;
  /** Where Veriff sends its decision. */
  readonly callback_url: string;
  readonly actor_id: string;
  readonly actor_role: string;
  readonly deps: CallDeps;
  readonly secrets: SecretStore;
  /** TESTS ONLY. Absent, the configuration above governs, and it is off. */
  readonly config?: IdentityCheckConfig;
};

/**
 * Ask the provider for a verification link for one person. REFUSES BEFORE ANY CALL while anything in
 * `identityCheckMissing` is outstanding, and says what, in words.
 */
export async function startIdentityCheck(i: IdentityStartInput): Promise<IdentityStart> {
  const cfg = i.config ?? IDENTITY_CHECK;
  const missing = identityCheckMissing(cfg, i.secrets);
  if (missing.length > 0) return { state: 'NOT_SENT', why: missing.join(' ') };
  const first = i.first_name.trim();
  const last = i.last_name.trim();
  if (first === '' || last === '') return { state: 'NOT_SENT', why: 'Give the first and last name of the person to be checked.' };
  if (!/^https:\/\//.test(i.callback_url)) return { state: 'NOT_SENT', why: 'The address for the result must be a secure (https) one.' };
  const key = i.secrets.forOwner('VERIFF_IDV').get('VERIFF_API_KEY') ?? '';
  const r = await callOutside(i.deps, {
    service_id: IDENTITY_SERVICE_ID, endpoint: IDENTITY_SESSION_ENDPOINT, method: 'POST',
    headers: { 'X-AUTH-CLIENT': key, 'Content-Type': 'application/json' },
    body: JSON.stringify({ verification: { callback: i.callback_url, person: { firstName: first, lastName: last }, vendorData: i.check_ref } }),
    actor_id: i.actor_id, actor_role: i.actor_role, claim_id: null,
    gate: { free_gate_open: false, engagement_signed: false, switched_on: cfg.enabled },
  });
  if (r.outcome !== 'OK' || r.body === null) return { state: 'NOT_SENT', why: `The identity check service did not answer: ${r.why}.` };
  let parsed: unknown;
  try { parsed = JSON.parse(r.body); } catch { return { state: 'NOT_SENT', why: 'The identity check service sent an answer we could not read.' }; }
  const v = (parsed as { verification?: { id?: unknown; url?: unknown } }).verification;
  if (typeof v?.id !== 'string' || typeof v.url !== 'string' || !/^https:\/\//.test(v.url)) {
    return { state: 'NOT_SENT', why: 'The identity check service sent no link.' };
  }
  return { state: 'SENT', session_id: v.id, link: v.url };
}

export type IdentityOutcome = 'PASS' | 'FAIL' | 'REFER' | 'NOT_COMPLETED';

/** Veriff's statuses, as its decision webhook documents them (read 24 September 2026). Anything else is REFER. */
export const VERIFF_STATUS_OUTCOME: Readonly<Record<string, IdentityOutcome>> = Object.freeze({
  approved: 'PASS',
  declined: 'FAIL',
  resubmission_requested: 'REFER',
  review: 'REFER',
  expired: 'NOT_COMPLETED',
  abandoned: 'NOT_COMPLETED',
});

export type IdentityDecision =
  | { readonly state: 'READ'; readonly session_id: string; readonly check_ref: string | null; readonly outcome: IdentityOutcome; readonly status: string; readonly decided_at: string | null }
  | { readonly state: 'REFUSED'; readonly why: string };

/** True only when the signature is the HMAC-SHA256 of the exact body with our shared secret. Constant time. */
export function signatureHolds(rawBody: string, signature: string | null | undefined, sharedSecret: string): boolean {
  if (typeof signature !== 'string' || !/^[0-9a-f]{64}$/i.test(signature.trim()) || sharedSecret === '') return false;
  const want = createHmac('sha256', sharedSecret).update(rawBody, 'utf8').digest();
  const got = Buffer.from(signature.trim().toLowerCase(), 'hex');
  return got.length === want.length && timingSafeEqual(got, want);
}

/**
 * Read one decision webhook. The body is believed only when the signature holds. An unknown or missing status is
 * REFER — a person looks at it — and is NEVER a pass (N4).
 */
export function readIdentityDecision(rawBody: string, signature: string | null | undefined, secrets: SecretStore): IdentityDecision {
  const secret = secrets.forOwner('VERIFF_IDV').get('VERIFF_SHARED_SECRET') ?? '';
  if (!signatureHolds(rawBody, signature, secret)) return { state: 'REFUSED', why: 'the signature on the result does not match, so it was not read' };
  let body: unknown;
  try { body = JSON.parse(rawBody); } catch { return { state: 'REFUSED', why: 'the result could not be read' }; }
  const v = (body as { verification?: { id?: unknown; status?: unknown; vendorData?: unknown; decisionTime?: unknown } }).verification;
  if (typeof v?.id !== 'string' || v.id === '') return { state: 'REFUSED', why: 'the result names no check' };
  const status = typeof v.status === 'string' ? v.status : '';
  const outcome: IdentityOutcome = Object.prototype.hasOwnProperty.call(VERIFF_STATUS_OUTCOME, status) ? VERIFF_STATUS_OUTCOME[status]! : 'REFER';
  return {
    state: 'READ', session_id: v.id, status: status === '' ? '(none)' : status, outcome,
    check_ref: typeof v.vendorData === 'string' && v.vendorData !== '' ? v.vendorData : null,
    decided_at: typeof v.decisionTime === 'string' ? v.decisionTime : null,
  };
}

/**
 * OUR OWN COPY OF A RESULT — Phase 151b, 25 September 2026. The decision's own fields and nothing about the person:
 * its status, code, reason and reason code, its decision and acceptance times, and the TYPE and COUNTRY of the document
 * checked. Never a name, a date of birth, a document number, an address, an image or a media link. Read only from a
 * body whose signature has already held (`readIdentityDecision`); an unreadable body gives an empty copy.
 * Migration 047 refuses a copy that carries a person or a document number, so this reader cannot quietly widen.
 */
export function identityResultCopy(rawBody: string): Record<string, string | number | null> {
  let body: unknown;
  try { body = JSON.parse(rawBody); } catch { return {}; }
  const v = (body as { verification?: Record<string, unknown> }).verification ?? {};
  const doc = (typeof v['document'] === 'object' && v['document'] !== null ? v['document'] : {}) as Record<string, unknown>;
  const s = (x: unknown): string | null => (typeof x === 'string' && x.length <= 200 ? x : null);
  const n = (x: unknown): number | null => (typeof x === 'number' && Number.isFinite(x) ? x : null);
  return {
    status: s(v['status']), code: n(v['code']), reason: s(v['reason']), reason_code: n(v['reasonCode']),
    decision_time: s(v['decisionTime']), acceptance_time: s(v['acceptanceTime']),
    document_type: s(doc['type']), document_country: s(doc['country']),
  };
}
