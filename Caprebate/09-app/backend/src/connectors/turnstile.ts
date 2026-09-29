/**
 * THE CONTACT FORM'S SECURITY CHECK, ON THE SERVER — Cloudflare Turnstile. 29 September 2026.
 *
 * The home page (Caprebate/09-app/site/home.html) runs Cloudflare's check in the visitor's browser and posts its answer
 * with the enquiry as `cf-turnstile-response`. A check that runs only in the browser stops nothing: a script posts to
 * /enquiry without ever loading the page. So before an enquiry is kept, this asks Cloudflare whether that answer is
 * real (its "siteverify" call), through src/connectors/http.ts like every other outside call.
 *
 * THREE STATES, EACH SAID IN WORDS:
 *   · NO SECRET KEY in the key file (TURNSTILE_SECRET_KEY): nothing is checked and the enquiry is kept as before. The
 *     start-up log says so, and the enquiry's audit line records "not_checked".
 *   · A KEY, BUT THE TRANSFER IS NOT APPROVED. Cloudflare is a US company, and src/connectors/sources.ts refuses a call
 *     outside the UK and EU until the data protection officer approves it (`international_transfer_approved`). Until
 *     then nothing is sent, nothing is checked, the enquiry is kept, and the log and the audit line say why. Approving
 *     it is one word in sources.ts, and it is Sadique's decision, not a build one.
 *   · A KEY AND APPROVAL: the answer is checked. No answer, an answer Cloudflare rejects, or no reply from Cloudflare
 *     each REFUSES the enquiry: nothing is kept, the audit says which, and the person is told in plain words.
 *
 * THE SITE KEY (TURNSTILE_SITE_KEY) is public by design — it is printed in the page — and is put into the home page's
 * script when it is served (src/web/home-site.ts). Without one, the page keeps Cloudflare's published TEST key.
 * No key is ever printed: the secret goes only into the call's body, which no record keeps.
 */

import type { AuditLog } from '../audit.ts';
import type { SecretStore } from '../secrets.ts';
import { callOutside, policyRefusal, type Transport } from './http.ts';
import { CALL_POLICIES, type CallPolicy } from './sources.ts';

export const TURNSTILE_SERVICE = 'CLOUDFLARE_TURNSTILE';
export const TURNSTILE_ENDPOINT = '/turnstile/v0/siteverify';
/** Cloudflare's published test site key (always passes). What the page carries until a real one is configured. */
export const TURNSTILE_TEST_SITE_KEY = '1x00000000000000000000AA';
/** The form field the widget fills. */
export const TURNSTILE_FIELD = 'cf-turnstile-response';
/** Cloudflare's documented maximum length of an answer. Anything longer is refused without a call. */
const MAX_TOKEN = 2048;
/** Site and secret keys: Cloudflare's own keys start with a digit and an "x" (0x… live, 1x… to 3x… test). */
const KEY_SHAPE = /^[0-9]x[0-9A-Za-z_-]{16,80}$/;

export type SecurityCheck =
  | { readonly state: 'PASSED' }
  | { readonly state: 'NOT_CHECKED'; readonly reason: 'no_secret' | 'transfer_not_approved' }
  | { readonly state: 'FAILED'; readonly reason: 'no_answer' | 'rejected' | 'no_reply'; readonly codes: readonly string[] };

/** The site key from the key file, or null. Public by design. */
export function turnstileSiteKey(store: SecretStore): string | null {
  const v = (store.forOwner('CLOUDFLARE_TURNSTILE').get('TURNSTILE_SITE_KEY') ?? '').trim();
  return KEY_SHAPE.test(v) ? v : null;
}

function secretKey(store: SecretStore): string | null {
  const v = (store.forOwner('CLOUDFLARE_TURNSTILE').get('TURNSTILE_SECRET_KEY') ?? '').trim();
  return KEY_SHAPE.test(v) ? v : null;
}

/** Whether a check will be made, and if not why — in words for the start-up log. Names only, never a value. */
export function turnstileWhy(store: SecretStore, policyOverride?: Partial<CallPolicy>): string {
  const secret = secretKey(store) !== null;
  const site = turnstileSiteKey(store) !== null;
  if (!secret) {
    return 'the contact form’s security check is not checked on the server: no TURNSTILE_SECRET_KEY in the key file, so enquiries are kept as before';
  }
  if (transferRefused(policyOverride) !== null) {
    return 'the contact form’s security check is not checked on the server: Cloudflare is outside the UK and EU and sending to it is not approved yet (sources.ts, the data protection officer’s decision), so enquiries are kept as before';
  }
  return site
    ? 'the contact form’s security check is checked on the server with Cloudflare'
    : 'the contact form’s security check is checked on the server, but no TURNSTILE_SITE_KEY is set, so the page carries Cloudflare’s test key and every enquiry will fail the check';
}

function transferRefused(policyOverride?: Partial<CallPolicy>): string | null {
  const base = CALL_POLICIES[TURNSTILE_SERVICE];
  return policyRefusal(base === undefined ? undefined : { ...base, ...policyOverride });
}

export type TurnstileDeps = {
  readonly audit: AuditLog;
  readonly now: () => string;
  readonly transport: Transport;
  readonly secrets: SecretStore;
  /** Tests only: the service's policy with some values changed (the transfer approved, a short time limit). */
  readonly policy_override?: Partial<CallPolicy>;
};

/** Ask Cloudflare whether the widget's answer is real. Never throws; makes at most one call. */
export async function checkTurnstile(d: TurnstileDeps, answer: string | null, visitorIp: string | null): Promise<SecurityCheck> {
  const secret = secretKey(d.secrets);
  if (secret === null) return { state: 'NOT_CHECKED', reason: 'no_secret' };
  if (transferRefused(d.policy_override) !== null) return { state: 'NOT_CHECKED', reason: 'transfer_not_approved' };
  const token = (answer ?? '').trim();
  if (token === '' || token.length > MAX_TOKEN) return { state: 'FAILED', reason: 'no_answer', codes: [] };
  const body = new URLSearchParams({ secret, response: token });
  if (visitorIp !== null && visitorIp !== '' && visitorIp !== 'unknown') body.set('remoteip', visitorIp);
  const r = await callOutside(
    { audit: d.audit, now: d.now, transport: d.transport, ...(d.policy_override === undefined ? {} : { policy_override: d.policy_override }) },
    {
      service_id: TURNSTILE_SERVICE, endpoint: TURNSTILE_ENDPOINT, method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: body.toString(),
      actor_id: null, actor_role: null, claim_id: null,
      gate: { free_gate_open: false, engagement_signed: false, switched_on: true },
    },
  );
  if (r.outcome !== 'OK' || r.body === null) return { state: 'FAILED', reason: 'no_reply', codes: [] };
  let said: { success?: unknown; 'error-codes'?: unknown };
  try { said = JSON.parse(r.body) as typeof said; } catch { return { state: 'FAILED', reason: 'no_reply', codes: [] }; }
  if (said.success === true) return { state: 'PASSED' };
  // Cloudflare's error codes are short fixed words ("invalid-input-response"); only those are kept, nothing else.
  const codes = Array.isArray(said['error-codes'])
    ? said['error-codes'].filter((c): c is string => typeof c === 'string' && /^[a-z-]{3,40}$/.test(c)).slice(0, 5) : [];
  return { state: 'FAILED', reason: 'rejected', codes };
}

/** What the person is told when their enquiry is refused. Plain words; no code, no key. */
export function refusalWords(check: SecurityCheck): string {
  if (check.state !== 'FAILED') return '';
  if (check.reason === 'no_answer') {
    return 'The security check did not finish, so your enquiry was not sent. Wait for the tick beside "Security check", then send it again.';
  }
  if (check.reason === 'rejected') {
    return 'The security check did not pass, so your enquiry was not sent. Please try again, or email contact@caprebate.co.uk.';
  }
  return 'We could not finish the security check just now, so your enquiry was not sent. Please try again in a minute, or email contact@caprebate.co.uk.';
}

/** The home page's script with the configured site key in place of the test key. Unchanged without one. */
export function withSiteKey(js: string, siteKey: string | null): string {
  if (siteKey === null) return js;
  return js.replace(`var SITEKEY='${TURNSTILE_TEST_SITE_KEY}';`, `var SITEKEY='${siteKey}';`);
}
