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
 *     is not made and says so. Phase 146c: two rows can share one window (`rate_bucket` — Companies House's two APIs
 *     share the key's limit), and a row can carry a daily cap as well (`daily_limit` — PlanIt asks for about 300 a day).
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

import { request as httpsRequest, Agent as HttpsAgent } from 'node:https';
import { readFileSync } from 'node:fs';
import type { AuditLog } from '../audit.ts';
import { redactSecrets, type OwnerSecrets } from '../secrets.ts';
import { CALL_POLICIES, type CallPolicy } from './sources.ts';

/** The shape of `fetch` this file needs. The live one is the platform's; a test's replays recorded answers. */
export type Transport = (url: string, init: {
  readonly method: string;
  readonly headers: Record<string, string>;
  readonly body?: string;
  readonly signal: AbortSignal;
  /** PHASE 159a: 'manual' hands a redirect back unfollowed, for callOutside to judge; absent, every redirect is refused. */
  readonly redirect?: 'manual';
}) => Promise<Response>;

const LIVE_MARK = Symbol('live transport');

/** THE ONLY `fetch` CALL IN src/. */
export const liveTransport: Transport = Object.assign(
  (url: string, init: Parameters<Transport>[1]) => fetch(url, { ...init, redirect: init.redirect === 'manual' ? 'manual' : 'error' }),
  { [LIVE_MARK]: true },
);

/**
 * 1 OCT 2026: WHETHER A TRANSPORT REALLY REACHES OUTSIDE — the platform's fetch, or the certificate one. A test's
 * recorded answers (fixtureTransport) reach nobody, so a guard that keeps a local copy from calling a real service
 * (Zoom: src/connectors/zoom.ts, zoomPlaceRefusal) leaves them alone.
 */
export function isLiveTransport(t: Transport): boolean {
  return (t as { [LIVE_MARK]?: boolean })[LIVE_MARK] === true;
}

/* ------------------------------------------------------------------ the certificate-carrying transport */

/**
 * A TRANSPORT THAT PRESENTS A CLIENT CERTIFICATE. Phase 146d, 23 September 2026.
 *
 * WHY IT HAS TO EXIST. HM Land Registry's Business Gateway will not talk to us over an ordinary connection: it needs
 * the client certificate HM Land Registry issues under the network access agreement, presented when the connection is
 * made, as well as a user name and password on every request (its developer pack, read 23 September 2026). `fetch`
 * has no way to present one — there is no option for it in the standard — so a call made with `fetch` cannot reach
 * the Gateway at all, whatever else is right.
 *
 * WHY IT IS IN THIS FILE. Phase 146b's rule is that this is the only file under src/ that may call outside, and a
 * test walks src/ and fails on any other. That rule is worth more than the tidiness of a separate file, so the one
 * place that needs `node:https` is here, beside `fetch`, under the same time limits, the same rate limit, the same
 * size cap and the same audit row. `callOutside` does not know which transport it was handed.
 *
 * THE CERTIFICATE FILE IS NEVER READ INTO THE REPOSITORY AND NEVER PRINTED. The key file holds its PATH and its
 * passphrase (src/secrets.ts); the file itself stays where the developer installed it. A missing or unreadable
 * certificate is a STATE, reported in plain words as a refused call — never a throw and never a screen error — and
 * the words name the key by NAME, never a value.
 *
 * IT IS MARKED LIVE, like `liveTransport`, so a suite that reached for it by accident is refused under `node --test`.
 */
export type CertificateTransportState =
  | { readonly ok: true; readonly transport: Transport }
  | { readonly ok: false; readonly why: string };

/** The bits of the certificate this transport needs, by NAME. Read from the key file; neither value is ever printed. */
export function certificatePaths(secrets: OwnerSecrets | null): { path: string | null; passphrase: string | null } {
  return {
    path: secrets?.get('HMLR_BG_CERT_PATH') ?? null,
    passphrase: secrets?.get('HMLR_BG_CERT_PASSPHRASE') ?? null,
  };
}

/**
 * Build one. `readFile` is injectable so a test can prove the refusals and the wiring without a real certificate;
 * nothing else passes it.
 */
export function certificateTransport(
  secrets: OwnerSecrets | null,
  readFile: (p: string) => Buffer = (p) => readFileSync(p),
): CertificateTransportState {
  const { path, passphrase } = certificatePaths(secrets);
  if (path === null) {
    return { ok: false, why: 'the key file has no HMLR_BG_CERT_PATH, so the Land Registry certificate cannot be presented' };
  }
  if (passphrase === null) {
    return { ok: false, why: 'the key file has no HMLR_BG_CERT_PASSPHRASE, so the Land Registry certificate cannot be opened' };
  }
  let pfx: Buffer;
  try { pfx = readFile(path); } catch {
    // The PATH is not printed: it is a value from the key file like any other.
    return { ok: false, why: 'the Land Registry certificate file named by HMLR_BG_CERT_PATH could not be read' };
  }
  const agent = new HttpsAgent({ pfx, passphrase, keepAlive: false });
  const t: Transport = (url, init) => new Promise<Response>((resolve, reject) => {
    const req = httpsRequest(url, { method: init.method, headers: init.headers, agent }, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (c: Buffer) => chunks.push(c));
      res.on('end', () => {
        const headers = new Headers();
        for (const [k, v] of Object.entries(res.headers)) {
          if (typeof v === 'string') headers.set(k, v);
          else if (Array.isArray(v)) headers.set(k, v.join(', '));
        }
        resolve(new Response(Buffer.concat(chunks), { status: res.statusCode ?? 0, headers }));
      });
      res.on('error', reject);
    });
    req.on('error', reject);
    // callOutside's own time limit aborts us, exactly as it aborts `fetch`.
    init.signal.addEventListener('abort', () => { req.destroy(new DOMException('aborted', 'AbortError')); }, { once: true });
    if (init.body !== undefined) req.write(init.body);
    req.end();
  });
  return { ok: true, transport: Object.assign(t, { [LIVE_MARK]: true }) };
}

/** A recorded answer, shaped from the supplier's published documentation. */
export type Fixture = {
  readonly status: number;
  readonly body: string;
  /** PHASE 150: answer these bytes instead of `body` — a recorded file, which is not text. */
  readonly bytes?: Uint8Array;
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
export function fixtureTransport(fixtures: Record<string, Fixture | readonly Fixture[]>): Transport & { seen: { url: string; method: string; headers: Record<string, string>; body?: string }[] } {
  const used = new Map<string, number>();
  const seen: { url: string; method: string; headers: Record<string, string>; body?: string }[] = [];
  const t = async (url: string, init: Parameters<Transport>[1]): Promise<Response> => {
    /* Phase 146e: the body too, so a test can prove what a model was sent — and what it was not. */
    seen.push({ url, method: init.method, headers: init.headers, ...(init.body === undefined ? {} : { body: init.body }) });
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
    // 30 Sep 2026: a 204 (Zoom's answer to a move or a cancel) carries no body at all; a Response refuses one.
    const bodiless = f.status === 204 || f.status === 205 || f.status === 304;
    return new Response(bodiless ? null : f.bytes !== undefined ? new Uint8Array(f.bytes) : f.body, { status: f.status, headers: f.headers ?? { 'content-type': 'application/json' } });
  };
  return Object.assign(t, { seen });
}

/* ------------------------------------------------------------------ the rate limit */

/** A sliding window per service. One per process by default, so every caller counts against the same limit. */
export class RateLimiter {
  readonly #calls = new Map<string, number[]>();
  readonly #clock: () => number;
  constructor(clock: () => number = Date.now) { this.#clock = clock; }
  /** Phase 146c: whether a slot is free, without taking it. */
  peek(key: string, limit: number, window_ms: number): boolean {
    const now = this.#clock();
    return (this.#calls.get(key) ?? []).filter((t) => now - t < window_ms).length < limit;
  }
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
const DAY_MS = 24 * 60 * 60 * 1000;

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
  /** 30 Sep 2026: PATCH and DELETE for Zoom, to move and cancel a video call's meeting (src/connectors/zoom.ts). */
  readonly method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  readonly headers?: Record<string, string>;
  readonly body?: string;
  /**
   * PHASE 150: KEEP THE ANSWER AS BYTES. A file (HM Land Registry's INSPIRE .zip) is not text, and turning it into a
   * string would corrupt it. With this set, a successful answer comes back in `bytes` and `body` is '' — never null,
   * because null is how every caller recognises a call that got no answer. Every other rule is unchanged.
   */
  readonly as_bytes?: true;
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
  /** PHASE 150: the answer's bytes, only when the request asked `as_bytes` and the answer was read. */
  readonly bytes?: Buffer;
  readonly latency_ms: number;
  readonly attempts: number;
  /** In plain words; no key, no value from the query. */
  readonly why: string;
  /**
   * PHASE 146d: WHAT THIS ONE CALL COST, AND WHETHER ANYBODY CHARGED US FOR IT.
   *
   * `charged` is the boolean item 11 of this phase asks for, and it is there because without it a cost report counts
   * failures and overstates what we spent. A call that was refused before it left, was over our own limit, timed out,
   * or came back 404 or 500 has charged === false, and a report adds nothing for it.
   *
   * `cost_pence` is null ONLY when we genuinely do not know, which is N4 applied to money: a cost nobody reported is
   * not a cost of zero. `cost_basis` says where the figure came from, so the two can never be confused:
   *
   *   'supplier'     the service told us, on this response. Homedata sends X-Tokens-Charged on a wallet key
   *                  (100 tokens = £1, so one token is one penny). This is the only basis that is evidence.
   *   'price_list'   the service served a response and publishes a fixed price for it, which src/connectors/
   *                  sources.ts carries (HM Land Registry: £7 an official copy). Our reading of its price list.
   *   'not_billed'   nothing was served, and the service says it does not bill for that. Homedata: "any 4xx other
   *                  than a 402 and any 5xx is never billed", and a debit taken before a failure is refunded.
   *   'free'         the service does not charge at all (every free register).
   *   'unknown'      a paid service answered and neither told us nor publishes a price. cost_pence is null.
   */
  readonly charged: boolean;
  readonly cost_pence: number | null;
  readonly cost_basis: 'supplier' | 'price_list' | 'not_billed' | 'free' | 'unknown';
  /** What the supplier says is left on our balance, where it says. Homedata's X-Tokens-Balance, in tokens (= pence). */
  readonly balance_pence: number | null;
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

async function readCapped(res: Response, max: number, asBytes = false): Promise<{ text: string; bytes: Buffer; over: boolean }> {
  const declared = Number(res.headers.get('content-length') ?? 'NaN');
  if (Number.isFinite(declared) && declared > max) { await res.body?.cancel(); return { text: '', bytes: Buffer.alloc(0), over: true }; }
  if (res.body === null) return { text: '', bytes: Buffer.alloc(0), over: false };
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let n = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    n += value.byteLength;
    if (n > max) { await reader.cancel(); return { text: '', bytes: Buffer.alloc(0), over: true }; }
    chunks.push(value);
  }
  const bytes = Buffer.concat(chunks);
  // A file kept as bytes is never also decoded: a large one would be held twice, once as nonsense text.
  return { text: asBytes ? '' : bytes.toString('utf8'), bytes, over: false };
}

function retryAfterMs(h: string | null): number | null {
  if (h === null) return null;
  const s = Number(h);
  if (Number.isFinite(s) && s >= 0) return Math.min(s * 1000, MAX_RETRY_AFTER_MS);
  const d = Date.parse(h);
  return Number.isFinite(d) ? Math.min(Math.max(0, d - Date.now()), MAX_RETRY_AFTER_MS) : null;
}

/**
 * WHAT A RESPONSE SAYS IT COST. Phase 146d.
 *
 * Homedata's authentication page, read 23 September 2026: "Wallet keys receive the X-Tokens-* pair and no rate-limit
 * headers at all; quota keys receive the X-RateLimit-* family instead. You will not see both." SO THE CHARGE HEADER
 * MAY SIMPLY NOT BE THERE, and when it is not, this returns null rather than 0 — a quota key's calls are paid for in
 * a different currency, not for nothing. `x-call-weight` is read as well because that is the header the live service
 * actually sends today on an unauthenticated call; both are the same number of tokens, and one penny each.
 */
export function chargeFromHeaders(h: Headers | Record<string, string>): { charged_pence: number | null; balance_pence: number | null } {
  const get = (k: string): string | null => (h instanceof Headers ? h.get(k) : (h[k] ?? h[k.toLowerCase()] ?? null));
  const num = (v: string | null): number | null => {
    if (v === null) return null;
    const n = Number(v.trim());
    return Number.isFinite(n) && n >= 0 ? n : null;
  };
  return {
    charged_pence: num(get('x-tokens-charged')) ?? num(get('x-call-weight')),
    balance_pence: num(get('x-tokens-balance')),
  };
}

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

/** The name=value part of each Set-Cookie header, never its attributes. */
function cookiesFrom(h: Headers): string[] {
  const all = typeof (h as { getSetCookie?: () => string[] }).getSetCookie === 'function'
    ? (h as { getSetCookie: () => string[] }).getSetCookie()
    : (h.get('set-cookie') === null ? [] : [h.get('set-cookie') as string]);
  return all.map((c) => c.split(';')[0]?.trim() ?? '').filter((c) => /^[^=\s]+=/.test(c));
}

/**
 * PHASE 159a (the Lockwood run, L1): ONE REQUEST, FOLLOWING AT MOST `max` REDIRECTS — to the same host, carrying back
 * the cookies it set, or to a host the service's row names (`redirect_hosts`), carrying none. With `max` 0 the
 * transport refuses every redirect itself, exactly as before this phase. A redirect anywhere else, to http, or past
 * the limit is refused in words and nothing more is sent. The headers the caller set (a key, say) go to the same host
 * only. It is all one call: the caller writes one audit row for it, whatever happened in between.
 */
async function sendFollowing(
  transport: Transport, first: URL, init: Parameters<Transport>[1], max: number, otherHosts: readonly string[],
): Promise<{ ok: true; res: Response } | { ok: false; status: number; why: string }> {
  if (max <= 0) return { ok: true, res: await transport(first.toString(), init) };
  const jar = new Map<string, string>();
  let url = first;
  for (let hop = 0; ; hop++) {
    const same = url.host === first.host;
    const cookie = [...jar].map(([k, v]) => `${k}=${v}`).join('; ');
    const headers = !same ? { accept: init.headers['accept'] ?? '*/*' } : cookie === '' ? init.headers : { ...init.headers, cookie };
    const res = await transport(url.toString(), { ...init, headers, redirect: 'manual' });
    if (!REDIRECT_STATUSES.has(res.status)) return { ok: true, res };
    await res.body?.cancel();
    const loc = res.headers.get('location');
    let next: URL | null = null;
    try { next = loc === null ? null : new URL(loc, url); } catch { next = null; }
    if (next === null || next.protocol !== 'https:' || (next.host !== first.host && !otherHosts.includes(next.host))) {
      return { ok: false, status: res.status, why: 'the service sent us to another address, which we do not follow' };
    }
    if (hop >= max) return { ok: false, status: res.status, why: `the service redirected more than ${String(max)} times, so we stopped` };
    if (same) {
      for (const c of cookiesFrom(res.headers)) {
        const i = c.indexOf('=');
        jar.set(c.slice(0, i), c.slice(i + 1));
      }
    }
    url = next;
  }
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

  const finish = (raw: Omit<CallResult, 'latency_ms' | 'charged' | 'cost_pence' | 'cost_basis' | 'balance_pence'>): CallResult => {
    /* PHASE 146d: WHAT IT COST, WORKED OUT ONCE, HERE, FOR EVERY CALL — so no connector can forget to record it and
       no two connectors can disagree about how. The supplier's own figure wins wherever it sends one. */
    const said = chargeFromHeaders(raw.headers);
    const listed = policy?.cost_pence;
    const served = raw.outcome === 'OK';
    const cost: Pick<CallResult, 'charged' | 'cost_pence' | 'cost_basis' | 'balance_pence'> =
      said.charged_pence !== null
        ? { charged: said.charged_pence > 0, cost_pence: said.charged_pence, cost_basis: 'supplier', balance_pence: said.balance_pence }
      : listed === undefined || listed === 0
        ? { charged: false, cost_pence: 0, cost_basis: 'free', balance_pence: said.balance_pence }
      : served
        ? { charged: true, cost_pence: listed, cost_basis: 'price_list', balance_pence: said.balance_pence }
      : raw.status === 402
        ? { charged: false, cost_pence: null, cost_basis: 'unknown', balance_pence: said.balance_pence }
        : { charged: false, cost_pence: 0, cost_basis: 'not_billed', balance_pence: said.balance_pence };
    const r = { ...raw, ...cost };
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
          /* Phase 146d, item 11: the charge and the boolean beside it. A cost report reads `charged` first and adds
             `cost_pence` only where it is true, so a run of failures reports nothing spent, which is the truth. */
          charged: r.charged, cost_pence: r.cost_pence, cost_basis: r.cost_basis,
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
  if (isLiveTransport(deps.transport) && env.NODE_TEST_CONTEXT !== undefined && env.CAPREBATE_LIVE_SMOKE !== '1') {
    return refuse('REFUSED', 'a test tried to call a real service; tests use recorded answers');
  }
  const path = fill(req.endpoint, req.params ?? {});
  if (path === null || !path.startsWith('/')) return refuse('REFUSED', 'the lookup is missing something it needs, so it was not made');
  const limiter = deps.limiter ?? PROCESS_LIMITER;
  const bucket = policy.rate_bucket ?? policy.service_id;
  // Phase 146c: the daily cap first, so a call refused by the short window does not use a day's slot.
  if (policy.daily_limit !== undefined && !limiter.peek(`${bucket}:day`, policy.daily_limit, DAY_MS)) {
    return refuse('RATE_LIMITED', 'we have made as many calls to this service today as its publisher asks; try again tomorrow');
  }
  if (!limiter.take(bucket, policy.rate.limit, policy.rate.window_ms)) {
    return refuse('RATE_LIMITED', 'we have made as many calls to this service as we allow ourselves for now; try again later');
  }
  if (policy.daily_limit !== undefined) limiter.take(`${bucket}:day`, policy.daily_limit, DAY_MS);

  const url = new URL(policy.base_url + path);
  for (const [k, v] of Object.entries(req.query ?? {})) url.searchParams.set(k, v);

  let attempts = 0;
  for (;;) {
    attempts++;
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), policy.timeout_ms);
    try {
      const followed = await sendFollowing(deps.transport, url, {
        method, headers: { accept: 'application/json', ...req.headers }, ...(req.body === undefined ? {} : { body: req.body }), signal: ac.signal,
      }, policy.same_host_redirects ?? 0, policy.redirect_hosts ?? []);
      if (!followed.ok) {
        clearTimeout(timer);
        return finish({ outcome: 'NETWORK', status: followed.status, body: null, headers: {}, attempts, why: followed.why });
      }
      const res = followed.res;
      const retryable = res.status === 429 || res.status >= 500;
      if (retryable && attempts < policy.max_attempts) {
        await res.body?.cancel();
        clearTimeout(timer);
        const wait = retryAfterMs(res.headers.get('retry-after')) ?? Math.min(BACKOFF_BASE_MS * 2 ** (attempts - 1), 8_000);
        await sleep(wait);
        continue;
      }
      const read = await readCapped(res, policy.max_bytes, req.as_bytes === true);
      clearTimeout(timer);
      const headers = Object.fromEntries(res.headers.entries());
      if (read.over) {
        return finish({ outcome: 'TOO_LARGE', status: res.status, body: null, headers, attempts, why: `the answer was larger than the ${policy.max_bytes} bytes we accept, so it was not kept` });
      }
      if (res.status >= 200 && res.status < 300) {
        if (req.as_bytes === true) {
          return finish({ outcome: 'OK', status: res.status, body: '', bytes: read.bytes, headers, attempts, why: 'looked up' });
        }
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

/* ------------------------------------------------------------------ the adapter a supplier's own library calls */

/** The shape of `fetch` a supplier's library (the Anthropic SDK) is handed in place of the platform's. */
export type LibraryFetch = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

/** Why a library's call did not come back as an answer. Thrown into the library, which reports it as a failed call. */
export class OutsideCallFailed extends Error {
  readonly result: CallResult;
  constructor(result: CallResult) {
    super(result.why);
    this.name = 'OutsideCallFailed';
    this.result = result;
  }
}

/** Headers of any shape a library hands `fetch`, as a plain record. */
function headerRecord(h: RequestInit['headers'] | undefined): Record<string, string> {
  if (h === undefined || h === null) return {};
  if (h instanceof Headers) return Object.fromEntries(h.entries());
  if (Array.isArray(h)) return Object.fromEntries(h.map(([k, v]) => [String(k).toLowerCase(), String(v)]));
  return Object.fromEntries(Object.entries(h as Record<string, string>).map(([k, v]) => [k.toLowerCase(), String(v)]));
}

/**
 * A `fetch` FOR A SUPPLIER'S LIBRARY THAT GOES THROUGH `callOutside`. Phase 146e, 22 September 2026.
 *
 * The Anthropic SDK makes its own HTTP calls. Handed this in place of the platform's `fetch`, every one of them
 * becomes an ordinary `callOutside` call: the address from src/connectors/sources.ts (the host the library asked for is
 * thrown away and only the path is kept), refused unless the path is one of `endpoints`, rate-limited, time-limited,
 * capped, retried on 429 and 5xx only, and written to the audit chain like every other call. So the library is given
 * no way out that this file does not control. Give the library NO RETRIES of its own: they would be retries of
 * retries, and each one a second audit row for one decision.
 *
 * An answer, any status, goes back to the library as a Response, and the library reads it as it would. A call that
 * never got an answer (refused, over our limit, timed out, cut off, too large) is thrown as OutsideCallFailed, which
 * the library reports as a connection failure. `onResult` sees every CallResult either way.
 */
export function fetchThroughCallOutside(
  deps: CallDeps,
  fixed: Omit<CallRequest, 'endpoint' | 'params' | 'query' | 'method' | 'headers' | 'body'> & { readonly endpoints: readonly string[] },
  onResult?: (r: CallResult) => void,
): LibraryFetch {
  return async (input, init) => {
    const href = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    let path = '';
    const query: Record<string, string> = {};
    try {
      const u = new URL(href);
      path = u.pathname;
      for (const [k, v] of u.searchParams) query[k] = v;
    } catch { /* not a web address: refused below, as a path we do not allow */ }
    const method = (init?.method ?? 'GET').toUpperCase();
    const allowed = fixed.endpoints.includes(path) && (method === 'GET' || method === 'POST');
    const body = typeof init?.body === 'string' ? init.body : undefined;
    const result = allowed && (init?.body === undefined || init.body === null || body !== undefined)
      ? await callOutside(deps, {
          service_id: fixed.service_id, actor_id: fixed.actor_id, actor_role: fixed.actor_role ?? null,
          claim_id: fixed.claim_id, gate: fixed.gate,
          endpoint: path, query, method: method as 'GET' | 'POST', headers: headerRecord(init?.headers),
          ...(body === undefined ? {} : { body }),
        })
      : await callOutside(deps, {
          // Not a path we let this library use: refused here, and written down like any other refusal.
          service_id: 'NOT_A_PERMITTED_PATH', endpoint: '/refused', actor_id: fixed.actor_id,
          actor_role: fixed.actor_role ?? null, claim_id: fixed.claim_id, gate: fixed.gate,
        });
    onResult?.(result);
    if (result.status === null || result.body === null) throw new OutsideCallFailed(result);
    // The body is already decoded and complete, so a length or an encoding the service sent no longer describes it.
    const headers = Object.fromEntries(Object.entries(result.headers).filter(([k]) => k !== 'content-encoding' && k !== 'content-length'));
    return new Response(result.body, { status: result.status, headers });
  };
}
