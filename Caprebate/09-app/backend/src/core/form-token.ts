/**
 * PHASE 161b, 4 November 2026 — A SECURITY TOKEN ON EVERY FORM THAT CHANGES SOMETHING, AS WELL AS THE BROWSER CHECK.
 *
 * The ITRoadway technical audit (2 Nov 2026), section 4, row 3 (Medium): "Forms are protected by browser settings only,
 * with no extra check on sensitive actions such as payments and admin changes. Add a one-time security token to those
 * forms." Until today a form sent from another website was stopped by two browser settings only: the session cookie's
 * SameSite, and the browser's Sec-Fetch-Site mark (Phase 160e, src/core/router.ts). A browser that sends neither got
 * through. Now every request that would change something for a signed-in person must also carry a token of ours.
 *
 * THE FORM TOKEN. One per session, worked out from the session cookie (HMAC-SHA256, keyed by the cookie), so:
 *   - another website cannot know it: the cookie is HttpOnly and never leaves the browser's own requests to us;
 *   - every copy of the website gets the same answer with nothing shared or stored (the server works it out again);
 *   - a new session is a new token, so it changes at sign-in and whenever the session rotates (a privilege change).
 * It goes in a hidden field, `cb_form`, that is added to every <form method="post"> of ours as the page leaves the
 * server (`withFormTokens`), so no page can forget it; the page's scripts send it in the `x-cb-form` header, read from
 * <meta name="cb-form"> in the page.
 *
 * THE SINGLE-USE TOKEN. For the actions in SENSITIVE (money, roles and staff logins, settings and switches, keys and
 * connections, holds and data rights), the form also gets `cb_once`: a random number, the time it was made, and an HMAC
 * of both keyed by the session. It is good once, within ONCE_MAX_AGE_MS: the server keeps every one it has accepted
 * (form_tokens_used, migration 120) and refuses one it has seen. So a sensitive form cannot be sent twice, even by
 * going back and pressing the button again: the page has to be opened afresh.
 *
 * WHERE IT IS CHECKED. In src/core/server.ts, at the top of the one handler every request goes through, BEFORE any route
 * runs: a request that is not GET or HEAD, from a signed-in person, on an address not in EXEMPT. A refusal changes
 * nothing, answers "This form has expired", and is written to the audit log (FORM_TOKEN_REFUSED).
 *
 * WHEN IT IS OFF. Only when createApp is told `formTokens: 'off'`, or, with no word either way, inside Node's own test
 * runner (`testRunner()`), as Django's test client does: the existing tests post forms without tokens, and the tests of
 * this file turn it on. Every real start says `formTokens: 'on'` in so many words (src/core/server.ts's own start and
 * api/index.mjs), so the default never decides a real website.
 */

import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

export const FORM_FIELD = 'cb_form';
export const ONCE_FIELD = 'cb_once';
export const FORM_HEADER = 'x-cb-form';
export const ONCE_HEADER = 'x-cb-once';
export const FORM_META = 'cb-form';
/** How long a single-use token may wait between the page and the click: two hours. */
export const ONCE_MAX_AGE_MS = 2 * 60 * 60 * 1000;

export type FormTokens = 'on' | 'off';

/** Whether this process is Node's test runner, or a test file it started. */
export function testRunner(env: NodeJS.ProcessEnv = process.env, execArgv: readonly string[] = process.execArgv): boolean {
  return (env.NODE_TEST_CONTEXT ?? '') !== '' || execArgv.includes('--test');
}

/** On unless told off, and off by default only inside the test runner. */
export function formTokensMode(given: FormTokens | undefined, env?: NodeJS.ProcessEnv, execArgv?: readonly string[]): FormTokens {
  if (given !== undefined) return given;
  return testRunner(env, execArgv) ? 'off' : 'on';
}

const mac = (key: string, text: string): string => createHmac('sha256', key).update(text).digest('base64url');

function same(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/** The session's form token, from its cookie value. */
export function formToken(sessionCookie: string): string {
  return mac(sessionCookie, 'cap-rebate form token (phase 161b)');
}

/** Whether `given` is this session's form token. */
export function formTokenOk(sessionCookie: string, given: string | null | undefined): boolean {
  return typeof given === 'string' && given !== '' && same(given, formToken(sessionCookie));
}

/** A new single-use token for this session, made now. */
export function onceToken(sessionCookie: string, nowMs: number, nonce: Buffer = randomBytes(16)): string {
  const n = nonce.toString('hex');
  const t = String(Math.floor(nowMs));
  return `${n}.${t}.${mac(sessionCookie, `once|${n}|${t}`)}`;
}

/** Whether a single-use token is this session's and still in time. Whether it was used before is the caller's to ask. */
export function onceTokenCheck(sessionCookie: string, given: string | null | undefined, nowMs: number):
  { readonly ok: true; readonly nonce: string } | { readonly ok: false; readonly why: string } {
  if (typeof given !== 'string' || given === '') return { ok: false, why: 'no single-use token' };
  const parts = given.split('.');
  if (parts.length !== 3) return { ok: false, why: 'a single-use token of the wrong shape' };
  const [n, t, sig] = parts as [string, string, string];
  if (!/^[0-9a-f]{32}$/.test(n) || !/^[0-9]{1,16}$/.test(t)) return { ok: false, why: 'a single-use token of the wrong shape' };
  if (!same(sig, mac(sessionCookie, `once|${n}|${t}`))) return { ok: false, why: 'a single-use token from another session' };
  const age = nowMs - Number(t);
  if (age < -60_000 || age > ONCE_MAX_AGE_MS) return { ok: false, why: 'a single-use token out of time' };
  return { ok: true, nonce: n };
}

/**
 * THE ADDRESSES THAT NEED NO FORM TOKEN, each with its reason. Anything not signed in needs none anyway (the check is
 * for a signed-in person's session); these are the ones that may arrive with our cookie but cannot carry our form.
 */
export const EXEMPT: readonly { readonly match: RegExp; readonly why: string }[] = Object.freeze([
  { match: /^\/hooks\//, why: 'a webhook: sent by the other service\'s server, never a browser, and signed by the sender (each route checks its signature)' },
  { match: /^\/upload\/put$/, why: 'the upload link carries its own token, scoped to one key and fifteen minutes (src/shared/objectstore.ts)' },
  { match: /^\/(api\/)?login$/, why: 'signing in, from the sign-in page; it starts a new session, so there is no session token to send yet' },
  { match: /^\/(api\/)?login\/step(\/[a-z-]+)?$/, why: 'the steps of signing in carry their own step token and make the session at the end' },
  { match: /^\/(enquiry|notices\/complaint|cookies\/choice)$/, why: 'a public form a visitor sends before any sign-in; it changes nothing for the session, and the enquiry has its own security check' },
  { match: /^\/assessment(\/|$)/, why: 'the free check on the website, filled in before anyone signs in; it changes nothing for a session' },
  { match: /^\/account\/(create|verify)$/, why: 'making a client account, before any sign-in' },
  { match: /^\/login\/(forgot|reset)$/, why: 'a forgotten password, sent from outside any session' },
]);

/** The reason an address needs no form token, or undefined when it needs one. */
export function exemptFor(path: string): string | undefined {
  return EXEMPT.find((e) => e.match.test(path))?.why;
}

/**
 * THE ACTIONS THAT ALSO NEED A SINGLE-USE TOKEN (the audit: "sensitive actions such as payments and admin changes").
 */
export const SENSITIVE: readonly { readonly match: RegExp; readonly why: string }[] = Object.freeze([
  { match: /^\/staff\/finance\/[^/]+\/(received|sent|cancel|credit-in-full|credit-clause-13|status)$/, why: 'money: a payment recorded, an invoice sent, cancelled or credited' },
  { match: /^\/staff\/finance\/received\/[^/]+\/void$/, why: 'money: a recorded payment undone' },
  { match: /^\/staff\/finance\/claims\/[^/]+\/raise$/, why: 'money: an invoice raised' },
  { match: /^\/staff\/finance\/settings$/, why: 'money: the finance settings' },
  { match: /^\/staff\/users\/(create|[^/]+\/(role|disable|temporary-password|reset-two-factor))$/, why: 'a staff login made, its role changed, switched off, or its password or second step reset' },
  { match: /^\/staff\/admin\/roles(\/[^/]+(\/retire)?)?$/, why: 'what a role may do' },
  { match: /^\/staff\/admin-settings\//, why: 'a setting or switch' },
  { match: /^\/staff\/compliance\/(settings|holds|rights)$/, why: 'a compliance setting, a hold on deletion, or a data rights request' },
  { match: /^\/staff\/keys\//, why: 'a supplier key saved or removed' },
  { match: /^\/staff\/connections\//, why: 'an outside connection changed' },
  { match: /^\/(staff|portal)\/two-factor(\/(change|off|recovery-codes))?$/, why: 'your own second sign-in step' },
  { match: /^\/(staff|portal)\/settings\/(password|username)$/, why: 'your own password or sign-in name' },
  { match: /^\/api\/account\/recovery-codes$/, why: 'your own recovery codes' },
  // PHASE 161g: an approval of a legal page is never changed or deleted once recorded, so it is sent once.
  { match: /^\/staff\/legal\/approve$/, why: 'a legal page\'s approval by our solicitor or our data protection officer' },
]);

export function isSensitive(path: string): boolean {
  return SENSITIVE.some((s) => s.match.test(path));
}

const FORM_OPEN = /<form\b([^>]*)>/gi;

/** The attribute's value in a tag's attribute text, or undefined. */
function attr(attrs: string, name: string): string | undefined {
  const m = new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s"'>]+))`, 'i').exec(attrs);
  return m === null ? undefined : (m[1] ?? m[2] ?? m[3] ?? '');
}

const unescape = (s: string): string => s.replace(/&amp;/g, '&').replace(/&#39;|&#x27;/g, "'").replace(/&quot;/g, '"');

/** The path a form sends to, read as the browser would from the page it is on. */
export function formTarget(attrs: string, pagePath: string): string {
  const action = attr(attrs, 'action');
  try {
    return new URL(action === undefined || action === '' ? pagePath : unescape(action), `http://localhost${pagePath}`).pathname;
  } catch {
    return pagePath;
  }
}

/**
 * The page with this session's tokens in it: a hidden `cb_form` as the first thing in every POST form of ours, a
 * `cb_once` too in a form that sends to a SENSITIVE address, and the form token in <meta name="cb-form"> for the
 * page's scripts. A form sending to another site is left alone, so our token never leaves us.
 */
export function withFormTokens(html: string, pagePath: string, token: string, once: () => string): string {
  let out = html.replace(FORM_OPEN, (whole, attrs: string) => {
    if ((attr(attrs, 'method') ?? 'get').toLowerCase() !== 'post') return whole;
    const action = attr(attrs, 'action');
    if (action !== undefined && /^[a-z][a-z0-9+.-]*:/i.test(action) && !action.startsWith('/')) return whole; // another site
    if (action !== undefined && action.startsWith('//')) return whole;
    const target = formTarget(attrs, pagePath);
    const fields = `<input type="hidden" name="${FORM_FIELD}" value="${token}">${isSensitive(target) ? `<input type="hidden" name="${ONCE_FIELD}" value="${once()}">` : ''}`;
    return `${whole}${fields}`;
  });
  if (/<head\b[^>]*>/i.test(out) && !out.includes(`name="${FORM_META}"`)) {
    out = out.replace(/<head\b[^>]*>/i, (h) => `${h}<meta name="${FORM_META}" content="${token}">`);
  }
  return out;
}

/** The page a refused form gets. Plain words; it names nothing about what was asked for. */
export const EXPIRED_TITLE = 'This form has expired';
export const EXPIRED_WORDS = 'This form has expired. Go back, reload the page and try again.';
