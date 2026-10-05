/**
 * AN ONLINE IDENTITY CHECK FOR THE MONEY-LAUNDERING RULES — DIDIT. Phase 151, 24 September 2026, built for Veriff;
 * Phase 151f, 25 September 2026, SWITCHED TO DIDIT on Lakhbir's instruction. BUILT FOR REAL AND SWITCHED OFF.
 *
 * WHY DIDIT (Lakhbir, 25 September 2026, in chat: "switch to Didit", after asking for a free alternative with an API).
 * Didit's own pages, read 25 September 2026: 500 full checks a month free, permanently, with no card (ID document,
 * passive liveness, face match and an IP check), then US$0.33 a check; one POST that returns a hosted link; a result
 * webhook SIGNED with HMAC-SHA256; data processed and stored in the EU (AWS) by default; retention set by us, from one
 * month to ten years. What its pages did NOT show: certification under the UK digital identity trust framework
 * (Veriff states it has one). The money-laundering rules do not require that certification as far as we know, and
 * whether we are supervised at all is Word question 10; the officer and the solicitor see this change in their register.
 * Veriff, Credas and APLYiD were compared on 24 September 2026 (04-phase-work/phase151/identity-check-providers.md);
 * Didit's page reads are in 04-phase-work/phase151f/didit.md.
 *
 * WHY IT IS OFF, AND WHAT TURNS IT ON. `IDENTITY_CHECK.enabled` ships false. `identityCheckMissing` lists what must be
 * true first, in plain words, and every one is a person's decision, not Claude's:
 *   1. the provider chosen — Didit, Lakhbir's choice of 25 September 2026;
 *   2. the provider named as a processor in the privacy notice AND in clause 7 of the engagement letter (the Phase 115
 *      rule: nothing carries client data through a processor the client was not told about);
 *   3. its key, its webhook secret and the id of the check we set up in its console (the "workflow") in the key file
 *      (DIDIT_API_KEY, DIDIT_WEBHOOK_SECRET, DIDIT_WORKFLOW_ID), never in code;
 *   4. then the switch.
 * Identity is checked whether or not money-laundering supervision applies (Word question 10, recorded 24 September
 * 2026), so nothing here reads AML_IN_SCOPE.
 * OFF, NOTHING LEAVES THIS SERVER: `startIdentityCheck` refuses before any call, any audit row of a call, anything.
 *
 * SWITCHED ON FOR TESTING — Phase 151h, 25 September 2026, Lakhbir in chat: "switch it on we are still in a testing
 * enviroment". The Didit account is live and its three entries are in the key file. The officer approved the Didit
 * entry of the privacy notice the same day (relayed by Lakhbir), BUT THE PAPERS ARE NOT DONE: the notice is still a
 * draft, not published, and clause 7 of the engagement letter names Didit only in a comment. So `enabled` is true, the
 * two `named_in_*` flags stay FALSE because they are false, and `papers_waived_for_testing` records the decision to
 * test before the papers are done, with who and when in `waiver_record`. While it is waived and the papers are not
 * done, every screen that can send a check says, in words, that it is for testing only and never for a client
 * (`identityTestingWarning`), and every check sent is audited as sent under the waiver.
 * BEFORE A REAL CLIENT IS CHECKED: publish the notice naming Didit, put Didit into clause 7, set both `named_in_*` to
 * true, and set `papers_waived_for_testing` to false. The waiver is never a substitute for the papers.
 *
 * WHAT IS SENT. The check we set up (its workflow id), an opaque reference to our check, and the first and last name
 * of the person, as the name Didit should expect to find on the document. Never an address, a company, a claim, a
 * figure, an email or a phone number. The client's documents and selfie go from their phone to Didit, never through us.
 *
 * WHAT COMES BACK, AND N4. Didit's result arrives by webhook, at the address set in its console. It is believed ONLY
 * when a signature holds - X-Signature-V2 (the HMAC of the sorted, compact JSON, Didit's recommended one) or
 * X-Signature (the HMAC of the exact bytes) - AND its X-Timestamp is within five minutes. Only these map to an answer:
 * Approved -> PASS; Declined -> FAIL; In Review, Resubmitted and Kyc Expired -> REFER; Expired and Abandoned ->
 * NOT_COMPLETED. Not Started, In Progress and Awaiting User are the check still under way: acknowledged, and NOT kept as
 * a result. ANY OTHER STATUS, A MISSING ONE, OR A BAD SIGNATURE IS NEVER A PASS: an unknown status is REFER, for a person
 * to look at, and an unsigned or stale body is refused outright. A webhook about anything but a session's status is
 * acknowledged and ignored.
 *
 * WHAT IT DOES NOT DO. It never finishes a check on its own. A PASS is recorded on the check as evidence of how
 * identity was verified; a person still completes the check (`completeCheck` in src/web/compliance-aml.ts), as today.
 * And we keep our own record of the decision, whatever retention is set in Didit's console: the money-laundering
 * rules ask us to keep our evidence for five years.
 */

import { createHmac, timingSafeEqual } from 'node:crypto';
import type { SecretStore } from '../secrets.ts';
import { callOutside, type CallDeps } from './http.ts';

export const IDENTITY_SERVICE_ID = 'DIDIT_IDV';
/** The endpoint as a template, which is what the audit row records. */
export const IDENTITY_SESSION_ENDPOINT = '/v3/session/';
/** How old a signed result may be, in seconds, before it is refused as a replay (Didit's own figure). */
export const IDENTITY_RESULT_MAX_AGE_S = 300;

export type IdentityProvider = 'DIDIT';

export type IdentityCheckConfig = {
  readonly enabled: boolean;
  readonly provider: IdentityProvider | null;
  /** The provider is named as a processor in the published privacy notice. */
  readonly named_in_privacy_notice: boolean;
  /** The provider is named as a processor in clause 7 of the engagement letter. */
  readonly named_in_engagement_letter: boolean;
  /**
   * TESTING ONLY. A person's decision to send checks before the two papers above name the provider. It never makes
   * either paper true: it only stops their absence refusing the call, and while it does, the screens say so.
   */
  readonly papers_waived_for_testing: boolean;
  /** Who waived the papers, when, and in what words. Null when nothing is waived. */
  readonly waiver_record: string | null;
  /** The Word question that chose the provider, quoted by its title. */
  readonly question: string;
};

/**
 * The question that chose a provider, closed 24 September 2026 (Veriff), and reopened by Lakhbir's switch to Didit on
 * 25 September 2026, recorded under it in the closed questions document. Quoted by its title, which did not change.
 */
export const IDENTITY_CHECK_QUESTION =
  'Which online identity check should clients use for the money-laundering rules: Veriff, Credas or APLYiD?';

/** The provider's name as a person reads it. */
export const IDENTITY_PROVIDER_NAME = 'Didit';

export const IDENTITY_CHECK: IdentityCheckConfig = Object.freeze({
  enabled: true,
  provider: 'DIDIT',
  named_in_privacy_notice: false,
  named_in_engagement_letter: false,
  papers_waived_for_testing: true,
  waiver_record: 'Lakhbir Dhillon said it on 25 September 2026, in the chat with Claude. He is Head of Business Development. ' +
    'He said: "switch it on we are still in a testing enviroment". The privacy notice is a draft. It is not published. Clause 7 names Didit only in a comment.',
  question: IDENTITY_CHECK_QUESTION,
});

/** The three entries the key file must carry. The workflow id is not a secret; the other two are. */
export const IDENTITY_KEYS = Object.freeze(['DIDIT_API_KEY', 'DIDIT_WEBHOOK_SECRET', 'DIDIT_WORKFLOW_ID'] as const);

/** What must be true before a check can be sent, each in plain words. Empty means it can be sent. */
export function identityCheckMissing(cfg: IdentityCheckConfig, secrets: SecretStore): string[] {
  const out: string[] = [];
  if (cfg.provider === null) out.push('Choose the identity check service.');
  if ((cfg.named_in_privacy_notice !== true || cfg.named_in_engagement_letter !== true) && cfg.papers_waived_for_testing !== true) {
    out.push('Name that service in the privacy notice and in the engagement letter.');
  }
  const mine = secrets.forOwner('DIDIT_IDV');
  if (!IDENTITY_KEYS.every((k) => mine.has(k))) out.push('Add the identity check service’s keys to the server.');
  if (cfg.enabled !== true) out.push('Then switch the identity check on.');
  return out;
}

/** True when checks may be sent only because the papers are waived for testing: the papers do not name the service. */
export function sentUnderTestingWaiver(cfg: IdentityCheckConfig): boolean {
  return cfg.papers_waived_for_testing === true && (cfg.named_in_privacy_notice !== true || cfg.named_in_engagement_letter !== true);
}

/** The words every screen that can send a check shows while it would be sent under the waiver. Null otherwise. */
export function identityTestingWarning(cfg: IdentityCheckConfig): string | null {
  return sentUnderTestingWaiver(cfg)
    ? `Testing only. Our privacy notice and our engagement letter do not name ${IDENTITY_PROVIDER_NAME} yet. Check yourself or a colleague who agrees. Never check a client.`
    : null;
}

export type IdentityStart =
  | { readonly state: 'SENT'; readonly session_id: string; readonly link: string }
  | { readonly state: 'NOT_SENT'; readonly why: string };

export type IdentityStartInput = {
  readonly first_name: string;
  readonly last_name: string;
  /** Our own check's id. Sent as Didit's vendor_data, so its result can be matched back. No meaning outside. */
  readonly check_ref: string;
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
 * The result comes back to the webhook address set in Didit's console (our /hooks/identity-check), not to an address
 * we send: Didit's `callback` field is only where the client's browser goes afterwards, and it is not sent, so the
 * client sees Didit's own finishing page.
 */
export async function startIdentityCheck(i: IdentityStartInput): Promise<IdentityStart> {
  const cfg = i.config ?? IDENTITY_CHECK;
  const missing = identityCheckMissing(cfg, i.secrets);
  if (missing.length > 0) return { state: 'NOT_SENT', why: missing.join(' ') };
  const first = i.first_name.trim();
  const last = i.last_name.trim();
  if (first === '' || last === '') return { state: 'NOT_SENT', why: 'Give the first and last name of the person to be checked.' };
  const mine = i.secrets.forOwner('DIDIT_IDV');
  const r = await callOutside(i.deps, {
    service_id: IDENTITY_SERVICE_ID, endpoint: IDENTITY_SESSION_ENDPOINT, method: 'POST',
    headers: { 'x-api-key': mine.get('DIDIT_API_KEY') ?? '', 'Content-Type': 'application/json' },
    body: JSON.stringify({
      workflow_id: mine.get('DIDIT_WORKFLOW_ID') ?? '',
      vendor_data: i.check_ref,
      language: 'en',
      expected_details: { first_name: first, last_name: last },
    }),
    actor_id: i.actor_id, actor_role: i.actor_role, claim_id: null,
    gate: { free_gate_open: false, engagement_signed: false, switched_on: cfg.enabled },
  });
  if (r.outcome !== 'OK' || r.body === null) return { state: 'NOT_SENT', why: `The identity check service did not answer: ${r.why}.` };
  let parsed: unknown;
  try { parsed = JSON.parse(r.body); } catch { return { state: 'NOT_SENT', why: 'The identity check service sent an answer we could not read.' }; }
  const v = parsed as { session_id?: unknown; url?: unknown };
  if (typeof v.session_id !== 'string' || v.session_id === '' || typeof v.url !== 'string' || !/^https:\/\//.test(v.url)) {
    return { state: 'NOT_SENT', why: 'The identity check service sent no link.' };
  }
  return { state: 'SENT', session_id: v.session_id, link: v.url };
}

export type IdentityOutcome = 'PASS' | 'FAIL' | 'REFER' | 'NOT_COMPLETED';

/** Didit's session statuses, exactly as its webhook documents them (case-sensitive, read 25 September 2026). */
export const DIDIT_STATUS_OUTCOME: Readonly<Record<string, IdentityOutcome>> = Object.freeze({
  'Approved': 'PASS',
  'Declined': 'FAIL',
  'In Review': 'REFER',
  'Resubmitted': 'REFER',
  'Kyc Expired': 'REFER',
  'Expired': 'NOT_COMPLETED',
  'Abandoned': 'NOT_COMPLETED',
});
/** The check still under way. Acknowledged and not kept: it is not a result. */
export const DIDIT_STATUS_UNDER_WAY: readonly string[] = Object.freeze(['Not Started', 'In Progress', 'Awaiting User']);

/** The three signature headers a result arrives with, as the route reads them. Any may be missing. */
export type IdentitySignature = {
  /** X-Signature-V2: HMAC-SHA256 (hex) of the sorted, compact JSON of the body. */
  readonly v2: string | null;
  /** X-Signature: HMAC-SHA256 (hex) of the exact bytes of the body. */
  readonly raw: string | null;
  /** X-Timestamp: Unix seconds. */
  readonly timestamp: string | null;
};

export type IdentityDecision =
  | { readonly state: 'READ'; readonly session_id: string; readonly check_ref: string | null; readonly outcome: IdentityOutcome; readonly status: string; readonly decided_at: string | null }
  | { readonly state: 'UNDER_WAY'; readonly session_id: string; readonly status: string }
  | { readonly state: 'IGNORED'; readonly why: string }
  | { readonly state: 'REFUSED'; readonly why: string };

const hexEqual = (hex: string | null, want: Buffer): boolean => {
  if (typeof hex !== 'string' || !/^[0-9a-f]{64}$/i.test(hex.trim())) return false;
  const got = Buffer.from(hex.trim().toLowerCase(), 'hex');
  return got.length === want.length && timingSafeEqual(got, want);
};

/** Didit's canonical form for X-Signature-V2: every object's keys sorted, compact, non-ASCII kept as it is. */
export function canonicalJson(value: unknown): string {
  const sort = (x: unknown): unknown => {
    if (Array.isArray(x)) return x.map(sort);
    if (x !== null && typeof x === 'object') {
      const o = x as Record<string, unknown>;
      return Object.fromEntries(Object.keys(o).sort().map((k) => [k, sort(o[k])]));
    }
    return x;
  };
  return JSON.stringify(sort(value));
}

/**
 * True only when one of the two signatures is the HMAC-SHA256 of the body with our webhook secret. Constant time.
 * No secret is never "anything goes".
 */
export function signatureHolds(rawBody: string, sig: IdentitySignature, secret: string): boolean {
  if (secret === '') return false;
  const mac = (s: string) => createHmac('sha256', secret).update(s, 'utf8').digest();
  if (hexEqual(sig.raw, mac(rawBody))) return true;
  let parsed: unknown;
  try { parsed = JSON.parse(rawBody); } catch { return false; }
  return hexEqual(sig.v2, mac(canonicalJson(parsed)));
}

/** True only when the timestamp is a whole number of seconds within five minutes of now, either side. */
export function timestampFresh(timestamp: string | null, nowMs: number): boolean {
  if (typeof timestamp !== 'string' || !/^\d{1,12}$/.test(timestamp.trim())) return false;
  return Math.abs(nowMs / 1000 - Number(timestamp.trim())) <= IDENTITY_RESULT_MAX_AGE_S;
}

const isoFromSeconds = (x: unknown): string | null =>
  (typeof x === 'number' && Number.isFinite(x) && x > 0 ? new Date(x * 1000).toISOString() : null);

/**
 * Read one result webhook. The body is believed only when a signature holds and it is fresh. An unknown or missing
 * status is REFER — a person looks at it — and is NEVER a pass (N4).
 */
export function readIdentityDecision(rawBody: string, sig: IdentitySignature, secrets: SecretStore, nowMs: number): IdentityDecision {
  const secret = secrets.forOwner('DIDIT_IDV').get('DIDIT_WEBHOOK_SECRET') ?? '';
  if (!signatureHolds(rawBody, sig, secret)) return { state: 'REFUSED', why: 'the signature on the result does not match, so it was not read' };
  if (!timestampFresh(sig.timestamp, nowMs)) return { state: 'REFUSED', why: 'the result is more than five minutes old or carries no time, so it was not read' };
  let body: unknown;
  try { body = JSON.parse(rawBody); } catch { return { state: 'REFUSED', why: 'the result could not be read' }; }
  const v = (body ?? {}) as { webhook_type?: unknown; session_id?: unknown; status?: unknown; vendor_data?: unknown; created_at?: unknown; timestamp?: unknown };
  if (v.webhook_type !== undefined && v.webhook_type !== 'status.updated') return { state: 'IGNORED', why: 'not a change of a check’s status' };
  if (typeof v.session_id !== 'string' || v.session_id === '') return { state: 'REFUSED', why: 'the result names no check' };
  const status = typeof v.status === 'string' ? v.status : '';
  if (DIDIT_STATUS_UNDER_WAY.includes(status)) return { state: 'UNDER_WAY', session_id: v.session_id, status };
  const outcome: IdentityOutcome = Object.prototype.hasOwnProperty.call(DIDIT_STATUS_OUTCOME, status) ? DIDIT_STATUS_OUTCOME[status]! : 'REFER';
  return {
    state: 'READ', session_id: v.session_id, status: status === '' ? '(none)' : status, outcome,
    check_ref: typeof v.vendor_data === 'string' && v.vendor_data !== '' ? v.vendor_data : null,
    decided_at: isoFromSeconds(v.created_at) ?? isoFromSeconds(v.timestamp),
  };
}

/**
 * OUR OWN COPY OF A RESULT — Phase 151b, 25 September 2026; Didit's shape since Phase 151f. The decision's own fields
 * and nothing about the person: the session's status, when it was decided, whether the document, the liveness and
 * the face match each passed, and the TYPE and issuing COUNTRY of the document checked. Never a name, a date of birth,
 * a document number, an address, an image or a media link. Read only from a body whose signature has already held
 * (`readIdentityDecision`); an unreadable body gives an empty copy. Migrations 047 and 053 refuse a copy that carries
 * a person, a name, a date of birth or a document number, so this reader cannot quietly widen.
 */
export function identityResultCopy(rawBody: string): Record<string, string | number | null> {
  let body: unknown;
  try { body = JSON.parse(rawBody); } catch { return {}; }
  const v = (body ?? {}) as Record<string, unknown>;
  const decision = (typeof v['decision'] === 'object' && v['decision'] !== null ? v['decision'] : {}) as Record<string, unknown>;
  const first = (k: string): Record<string, unknown> => {
    const a = decision[k];
    return (Array.isArray(a) && typeof a[0] === 'object' && a[0] !== null ? a[0] : {}) as Record<string, unknown>;
  };
  const s = (x: unknown): string | null => (typeof x === 'string' && x.length <= 200 ? x : null);
  const idv = first('id_verifications');
  return {
    status: s(v['status']),
    decision_time: isoFromSeconds(v['created_at']),
    id_verification_status: s(idv['status']),
    liveness_status: s(first('liveness_checks')['status']),
    face_match_status: s(first('face_matches')['status']),
    document_type: s(idv['document_type']),
    document_country: s(idv['issuing_state']),
  };
}
