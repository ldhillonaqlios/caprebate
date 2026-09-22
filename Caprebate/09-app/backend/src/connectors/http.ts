/**
 * THE ONE WAY THIS BACK END CALLS OUTSIDE. Phase 146b, 22 September 2026.
 *
 * Every connector — the registers, the paid lookups, the document reader — makes its calls through `callOutside`,
 * and THIS IS THE ONLY FILE UNDER src/ THAT MAY CALL `fetch`. A test walks src/ and fails on any other. So the rules
 * below hold for every call, and a new connector cannot quietly skip one.
 *
 *   · THE ADDRESS COMES FROM src/connectors/sources.ts. A connector passes a path; the base is looked up. A service
 *     with no confirmed address, a base that is not https, or a region outside the UK and EU without an approved
 *     transfer is REFUSED before anything is sent.
 *   · A TIME LIMIT on every try, per service.
 *   · RETRIES ONLY ON 429 AND 5xx, a bounded number, waiting longer each time (and as long as the service's
 *     Retry-After asks, up to 30 seconds). A 4xx other than 429 is an answer, not a hiccup, and is not retried. A
 *     time-out or a broken connection is not retried either: it is reported, and the source can be tried again from
 *     the research panel, which is where a person decides.
 *   · OUR OWN RATE LIMIT per service, below the publisher's (Companies House: 600 in 5 minutes). Over it, the call
 *     is not made and says so.
 *   · A SIZE CAP on every answer. A larger one is dropped unread past the cap.
 *   · ONE AUDIT ROW PER CALL, whatever happened: the service, the endpoint AS A TEMPLATE ("/company/{number}", never
 *     the number or a name typed into a search), the names of the query parameters but NEVER THEIR VALUES, who
 *     clicked, the claim, the outcome, the time taken, the tries, and both gates and the switch as they stood.
 *   · NOTHING THROWS. Every way a call can go wrong is an outcome. The caller turns a failure into a source that
 *     FAILED, and its facts stay asked (N4) — never a 0, never a guess, never a screen error.
 *   · NO KEY IN ANY RECORD. Error text passes `redactSecrets` before it is kept, and the audit screen refuses a
 *     detail that carries a key.
 *
 * NO LIVE CALL FROM A TEST. Under `node --test` the live transport refuses unless CAPREBATE_LIVE_SMOKE=1, so a suite
 * run without the fixture transport cannot reach the internet by accident. Every test passes `fixtureTransport`.
 */

import type { AuditLog } from '../audit.ts';
import { redactSecrets } from '../secrets.ts';
import { CALL_POLICIES, type CallPolicy } from './sources.ts';

/** The shape of `fetch` this file needs. The live one is the platform's; a test's replays recorded answers. */
export type Transport = (url: string, init: {
  readonly method: string;
  readonly headers: Record<string, string>;
  readonly body?: string;
  readonly signal: AbortSignal;
}) => Promise<Response>;

const LIVE_MARK = Symbol('live transport');

/** THE ONLY `fetch` CALL IN src/. */
export const liveTransport: Transport = Object.assign(
  (url: string, init: Parameters<Transport>[1]) => fetch(url, { ...init, redirect: 'error' }),
  { [LIVE_MARK]: true },
);

/** A recorded answer, shaped from the supplier's published documentation. */
export type Fixture = {
  readonly status: number;
  readonly body: string;
  readonly headers?: Record<string, string>;
  /** Wait this long before answering; with a short time limit this is how a time-out is tested. */
  readonly delay_ms?: number;
  /** Fail as a broken connection would, instead of answering. */
  readonly network_error?: true;
};

/**
 * THE FIXTURE MODE. Answers are looked up by "METHOD path" (the path without its query), in order where a list is
 * given: a list of three answers the first three tries, then the last one again. An unrecorded path answers 404, so
 * a test that forgot a fixture sees a failure, not a pass. Every request is kept in `seen` for the test to read.
 */
export function fixtureTransport(fixtures: Record<string, Fixture | readonly Fixture[]>): Transport & { seen: { url: string; method: string; headers: Record<string, string> }[] } {
  const used = new Map<string, number>();
  const seen: { url: string; method: string; headers: Record<string, string> }[] = [];
  const t = async (url: string, init: Parameters<Transport>[1]): Promise<Response> => {
    seen.push({ url, method: init.method, headers: init.headers });
    const key = `${init.method} ${new URL(url).pathname}`;
    const entry = fixtures[key];
    const list: readonly Fixture[] = entry === undefined ? [{ status: 404, body: '{"errors":[{"error":"not recorded"}]}' }]
      : Array.isArray(entry) ? entry as readonly Fixture[] : [entry as Fixture];
    const n = used.get(key) ?? 0;
    used.set(key, n + 1);
    const f = list[Math.min(n, list.length - 1)] as Fixture;
    if (f.delay_ms !== undefined) {
      await new Promise<void>((res, rej) => {
        const timer = setTimeout(res, f.delay_ms);
        init.signal.addEventListener('abort', () => { clearTimeout(timer); rej(new DOMException('aborted', 'AbortError')); }, { once: true });
      });
    }
    if (f.network_error === true) throw new TypeError('fetch failed: connection reset');
    return new Response(f.body, { status: f.status, headers: f.headers ?? { 'content-type': 'application/json' } });
  };
  return Object.assign(t, { seen });
}

/* ------------------------------------------------------------------ the rate limit */

/** A sliding window per service. One per process by default, so every caller counts against the same limit. */
export class RateLimiter {
  readonly #calls = new Map<string, number[]>();
  readonly #clock: () => number;
  constructor(clock: () => number = Date.now) { this.#clock = clock; }
  /** Takes a slot if there is one. False means over the limit: do not call. */
  take(service_id: string, limit: number, window_ms: number): boolean {
    const now = this.#clock();
    const kept = (this.#calls.get(service_id) ?? []).filter((t) => now - t < window_ms);
    if (kept.length >= limit) { this.#calls.set(service_id, kept); return false; }
    kept.push(now);
    this.#calls.set(service_id, kept);
    return true;
  }
}

const PROCESS_LIMITER = new RateLimiter();

/* ------------------------------------------------------------------ the call */

/** The two gates and the source's own switch, as they stood when the call was made. Recorded on the audit row. */
export type GateSnapshot = {
  readonly free_gate_open: boolean;
  readonly engagement_signed: boolean;
  readonly switched_on: boolean;
};

export type CallRequest = {
  readonly service_id: string;
  /** A path TEMPLATE, "/company/{company_number}". What the audit row records. */
  readonly endpoint: string;
  /** Values for the template's {placeholders}. Encoded here; never recorded. */
  readonly params?: Record<string, string>;
  /** Query values. Their NAMES are recorded; their values never are. */
  readonly query?: Record<string, string>;
  readonly method?: 'GET' | 'POST';
  readonly headers?: Record<string, string>;
  readonly body?: string;
  /** Who clicked. Null for a job nobody clicked. */
  readonly actor_id: string | null;
  readonly actor_role?: string | null;
  readonly claim_id: string | null;
  readonly gate: GateSnapshot;
};

export type CallOutcome = 'OK' | 'HTTP_ERROR' | 'TIMEOUT' | 'NETWORK' | 'TOO_LARGE' | 'RATE_LIMITED' | 'REFUSED';

export type CallResult = {
  readonly outcome: CallOutcome;
  readonly status: number | null;
  readonly body: string | null;
  readonly headers: Record<string, string>;
  readonly latency_ms: number;
  readonly attempts: number;
  /** In plain words; no key, no value from the query. */
  readonly why: string;
};

export type CallDeps = {
  readonly audit: AuditLog;
  readonly now: () => string;
  readonly transport: Transport;
  readonly limiter?: RateLimiter;
  readonly sleep?: (ms: number) => Promise<void>;
  readonly clock?: () => number;
  /** Tests only: a service's policy with some values changed (a short time limit, a small cap). */
  readonly policy_override?: Partial<CallPolicy>;
  readonly env?: Record<string, string | undefined>;
};

const MAX_RETRY_AFTER_MS = 30_000;
const BACKOFF_BASE_MS = 500;

function fill(template: string, params: Record<string, string>): string | null {
  let missing = false;
  const out = template.replace(/\{([a-z_]+)\}/g, (_m, k: string) => {
    const v = params[k];
    if (v === undefined || v === '') { missing = true; return ''; }
    return encodeURIComponent(v);
  });
  return missing ? null : out;
}

/** Why a policy refuses a call, or null. Exported for the test that every row is callable or says why not. */
export function policyRefusal(p: CallPolicy | undefined): string | null {
  if (p === undefined) return 'this service is not in the list of services we may call';
  if (p.base_url === null) return 'the service’s address is not confirmed yet';
  let u: URL;
  try { u = new URL(p.base_url); } catch { return 'the service’s address is not a web address'; }
  if (u.protocol !== 'https:') return 'the service’s address is not a secure (https) one';
  if (p.region !== 'UK' && p.region !== 'EU' && !p.international_transfer_approved) {
    return 'the service keeps data outside the UK and EU, and sending it there is not approved yet';
  }
  return null;
}

async function readCapped(res: Response, max: number): Promise<{ text: string; over: boolean }> {
  const declared = Number(res.headers.get('content-length') ?? 'NaN');
  if (Number.isFinite(declared) && declared > max) { await res.body?.cancel(); return { text: '', over: true }; }
  if (res.body === null) return { text: '', over: false };
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let n = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    n += value.byteLength;
    if (n > max) { await reader.cancel(); return { text: '', over: true }; }
    chunks.push(value);
  }
  return { text: Buffer.concat(chunks).toString('utf8'), over: false };
}

function retryAfterMs(h: string | null): number | null {
  if (h === null) return null;
  const s = Number(h);
  if (Number.isFinite(s) && s >= 0) return Math.min(s * 1000, MAX_RETRY_AFTER_MS);
  const d = Date.parse(h);
  return Number.isFinite(d) ? Math.min(Math.max(0, d - Date.now()), MAX_RETRY_AFTER_MS) : null;
}

/**
 * MAKE ONE CALL. Never throws. Writes exactly one audit row.
 */
export async function callOutside(deps: CallDeps, req: CallRequest): Promise<CallResult> {
  const clock = deps.clock ?? Date.now;
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const started = clock();
  const base = CALL_POLICIES[req.service_id];
  const policy: CallPolicy | undefined = base === undefined ? undefined : { ...base, ...deps.policy_override };
  const method = req.method ?? 'GET';
  const queryKeys = Object.keys(req.query ?? {}).sort();

  const finish = (r: Omit<CallResult, 'latency_ms'>): CallResult => {
    const result = { ...r, why: redactSecrets(r.why), latency_ms: Math.max(0, clock() - started) };
    try {
      deps.audit.append({
        at: deps.now(), kind: 'CONNECTOR_CALLED',
        outcome: r.outcome === 'OK' ? 'ALLOWED' : r.outcome === 'REFUSED' || r.outcome === 'RATE_LIMITED' ? 'REFUSED' : 'ERROR',
        actor_id: req.actor_id, actor_role: req.actor_role ?? null,
        object_type: req.claim_id === null ? 'connector' : 'claim', object_id: req.claim_id ?? req.service_id,
        detail: {
          service: req.service_id, endpoint: req.endpoint, method, query_keys: queryKeys,
          result: r.outcome, status: r.status, latency_ms: result.latency_ms, attempts: r.attempts,
          region: policy?.region ?? null,
          free_gate_open: req.gate.free_gate_open, engagement_signed: req.gate.engagement_signed, switched_on: req.gate.switched_on,
        },
      });
    } catch {
      /* An audit row that cannot be written must not turn a call into a screen error. The call's own result still
         says what happened; the audit's refusal is the audit's to report. */
    }
    return result;
  };
  const refuse = (outcome: 'REFUSED' | 'RATE_LIMITED', why: string): CallResult =>
    finish({ outcome, status: null, body: null, headers: {}, attempts: 0, why });

  const why = policyRefusal(policy);
  if (why !== null || policy === undefined) return refuse('REFUSED', why ?? 'not in the list');
  const env = deps.env ?? process.env;
  if ((deps.transport as { [LIVE_MARK]?: boolean })[LIVE_MARK] === true && env.NODE_TEST_CONTEXT !== undefined && env.CAPREBATE_LIVE_SMOKE !== '1') {
    return refuse('REFUSED', 'a test tried to call a real service; tests use recorded answers');
  }
  const path = fill(req.endpoint, req.params ?? {});
  if (path === null || !path.startsWith('/')) return refuse('REFUSED', 'the lookup is missing something it needs, so it was not made');
  if (!(deps.limiter ?? PROCESS_LIMITER).take(policy.service_id, policy.rate.limit, policy.rate.window_ms)) {
    return refuse('RATE_LIMITED', 'we have made as many calls to this service as we allow ourselves for now; try again later');
  }

  const url = new URL(policy.base_url + path);
  for (const [k, v] of Object.entries(req.query ?? {})) url.searchParams.set(k, v);

  let attempts = 0;
  for (;;) {
    attempts++;
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), policy.timeout_ms);
    try {
      const res = await deps.transport(url.toString(), {
        method, headers: { accept: 'application/json', ...req.headers }, ...(req.body === undefined ? {} : { body: req.body }), signal: ac.signal,
      });
      const retryable = res.status === 429 || res.status >= 500;
      if (retryable && attempts < policy.max_attempts) {
        await res.body?.cancel();
        clearTimeout(timer);
        const wait = retryAfterMs(res.headers.get('retry-after')) ?? Math.min(BACKOFF_BASE_MS * 2 ** (attempts - 1), 8_000);
        await sleep(wait);
        continue;
      }
      const read = await readCapped(res, policy.max_bytes);
      clearTimeout(timer);
      const headers = Object.fromEntries(res.headers.entries());
      if (read.over) {
        return finish({ outcome: 'TOO_LARGE', status: res.status, body: null, headers, attempts, why: `the answer was larger than the ${policy.max_bytes} bytes we accept, so it was not kept` });
      }
      if (res.status >= 200 && res.status < 300) {
        return finish({ outcome: 'OK', status: res.status, body: read.text, headers, attempts, why: 'looked up' });
      }
      return finish({ outcome: 'HTTP_ERROR', status: res.status, body: read.text, headers, attempts, why: `the service answered ${res.status}` });
    } catch (e) {
      clearTimeout(timer);
      if (ac.signal.aborted) {
        return finish({ outcome: 'TIMEOUT', status: null, body: null, headers: {}, attempts, why: `the service did not answer within ${Math.round(policy.timeout_ms / 1000)} seconds` });
      }
      const msg = e instanceof Error ? e.message : String(e);
      return finish({ outcome: 'NETWORK', status: null, body: null, headers: {}, attempts, why: `the service could not be reached (${msg})` });
    }
  }
}
