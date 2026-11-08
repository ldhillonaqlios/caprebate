/**
 * THE FORM-TOKEN CHECK, RUN BEFORE ANY ROUTE (src/core/server.ts), AND THE PAGE STEP THAT
 * PUTS THE TOKENS IN. What the tokens are, and why, is in src/core/form-token.ts.
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Db } from './db.ts';
import type { AuditLog } from './audit.ts';
import { boundaryOf, parseMultipart } from './multipart.ts';
import { keepBody, readBody } from './router.ts';
import { h, page } from '../shared/index.ts';
import {
  EXPIRED_TITLE, EXPIRED_WORDS, FORM_FIELD, FORM_HEADER, ONCE_FIELD, ONCE_HEADER, ONCE_MAX_AGE_MS,
  exemptFor, formToken, formTokenOk, isSensitive, onceToken, onceTokenCheck, withFormTokens,
} from './form-token.ts';
import { deleteFormTokensUsedByUsedAt, insertFormTokensUsed } from './data.ts';

/** The largest body any route accepts (a big file in one request, src/core/router.ts), so the check never refuses first. */
const MOST = 64 * 1024 * 1024 + 64 * 1024;

const SAFE = new Set(['GET', 'HEAD', 'OPTIONS']);

export type TokenDeps = { readonly db: Db; readonly audit: AuditLog; readonly now: () => string };
export type Signed = { readonly cookie: string; readonly user_id: string; readonly role: string };

const header = (req: IncomingMessage, name: string): string | undefined => {
  const v = req.headers[name];
  return Array.isArray(v) ? v[0] : v;
};

/** The two tokens the request carries: from the headers, else from the form itself. */
async function carried(req: IncomingMessage): Promise<{ form?: string; once?: string }> {
  const got: { form?: string; once?: string } = {};
  const f = header(req, FORM_HEADER);
  const o = header(req, ONCE_HEADER);
  if (f !== undefined) got.form = f;
  if (o !== undefined) got.once = o;
  const type = (header(req, 'content-type') ?? '').toLowerCase();
  if (type.startsWith('application/x-www-form-urlencoded')) {
    const body = await readBody(req, MOST);
    const params = new URLSearchParams(body.toString('utf8'));
    const pf = params.get(FORM_FIELD);
    const po = params.get(ONCE_FIELD);
    if (got.form === undefined && pf !== null) got.form = pf;
    if (got.once === undefined && po !== null) got.once = po;
    if (params.has(FORM_FIELD) || params.has(ONCE_FIELD)) {
      // The route reads the form without our two fields, so nothing that walks every field ever meets them.
      params.delete(FORM_FIELD);
      params.delete(ONCE_FIELD);
      keepBody(req, Buffer.from(params.toString(), 'utf8'));
    }
  } else if (type.startsWith('multipart/form-data') && (got.form === undefined || got.once === undefined)) {
    const boundary = boundaryOf(header(req, 'content-type'));
    const body = await readBody(req, MOST);
    if (boundary !== null) {
      try {
        for (const p of parseMultipart(body, boundary)) {
          if (p.filename !== undefined) continue;
          if (p.name === FORM_FIELD) got.form ??= Buffer.from(p.bytes).toString('utf8');
          if (p.name === ONCE_FIELD) got.once ??= Buffer.from(p.bytes).toString('utf8');
        }
      } catch { /* a body the route cannot read either: no token found, so it is refused below */ }
    }
  }
  return got;
}

/**
 * Why this request must be refused, or null to let it through. Only a request that would change something
 * (not GET, HEAD or OPTIONS), from a signed-in person, on an address not in EXEMPT, is checked at all.
 */
export async function formTokenRefusal(d: TokenDeps, req: IncomingMessage, path: string, who: Signed): Promise<string | null> {
  if (SAFE.has(req.method ?? 'GET') || exemptFor(path) !== undefined) return null;
  const got = await carried(req);
  if (got.form === undefined || got.form === '') return 'no form token';
  if (!formTokenOk(who.cookie, got.form)) return 'a form token from another session';
  if (!isSensitive(path)) return null;
  const at = d.now();
  const once = onceTokenCheck(who.cookie, got.once, Date.parse(at));
  if (!once.ok) return once.why;
  deleteFormTokensUsedByUsedAt(d.db, [new Date(Date.parse(at) - ONCE_MAX_AGE_MS - 60_000).toISOString()]);
  const kept = insertFormTokensUsed(d.db, [once.nonce, who.user_id, at]);
  return kept.changes === 1 ? null : 'a single-use token used before';
}

/** The refusal: nothing changed, the audit log told, and plain words back. */
export function refuseForm(d: TokenDeps, res: ServerResponse, path: string, who: Signed, why: string): void {
  d.audit.append({
    at: d.now(), kind: 'FORM_TOKEN_REFUSED', outcome: 'REFUSED', actor_id: who.user_id, actor_role: who.role,
    detail: { path, why },
  });
  if (path.startsWith('/api/')) {
    res.writeHead(403, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' });
    res.end(JSON.stringify({ error: EXPIRED_WORDS }));
    return;
  }
  res.writeHead(403, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' });
  res.end(page({ title: EXPIRED_TITLE, body: h`<div class="refusal card" role="alert"><h1>${EXPIRED_TITLE}</h1>
    <p>${EXPIRED_WORDS}</p><p>Nothing was changed.</p></div>` }));
}

/** The value of a cookie set by one of these Set-Cookie lines: a string, null when it is being cleared, else undefined. */
function settingSession(lines: readonly string[], name: string): string | undefined | null {
  for (const c of lines) {
    const m = new RegExp(`^${name}=([^;]*)`).exec(c);
    if (m) return m[1] === '' ? null : m[1];
  }
  return undefined;
}

const asLines = (v: unknown): string[] => (Array.isArray(v) ? v.map(String) : v === undefined || v === null ? [] : [String(v)]);

/** A header's value from writeHead's headers, given as an object or as a flat [name, value, ...] list. */
function fromWriteHead(headers: unknown, name: string): unknown {
  if (Array.isArray(headers)) {
    const out: string[] = [];
    for (let i = 0; i + 1 < headers.length; i += 2) if (String(headers[i]).toLowerCase() === name) out.push(String(headers[i + 1]));
    return out.length === 0 ? undefined : out;
  }
  if (headers !== null && typeof headers === 'object') {
    for (const [k, v] of Object.entries(headers as Record<string, unknown>)) if (k.toLowerCase() === name) return v;
  }
  return undefined;
}

/**
 * The page step: every HTML page this request answers with carries the session's tokens in its POST forms. If the
 * answer itself sets a new session cookie, the tokens are that session's; if it ends the session, none are added.
 * Headers are read both from setHeader and from writeHead (most pages give theirs in one writeHead call, which Node
 * does not hand back to getHeader).
 */
export function addTokensToPages(res: ServerResponse, path: string, cookieName: string, cookie: string | undefined, nowMs: () => number): void {
  let type: string | undefined;
  let cookies: string[] = [];
  const writeHead = res.writeHead.bind(res) as (...a: unknown[]) => ServerResponse;
  (res as unknown as { writeHead: (...a: unknown[]) => ServerResponse }).writeHead = (...args: unknown[]): ServerResponse => {
    const headers = args.find((a, i) => i > 0 && typeof a === 'object' && a !== null);
    const t = fromWriteHead(headers, 'content-type');
    if (t !== undefined) type = String(t);
    cookies = cookies.concat(asLines(fromWriteHead(headers, 'set-cookie')));
    return writeHead(...args);
  };
  const end = res.end.bind(res) as (...a: unknown[]) => ServerResponse;
  (res as unknown as { end: (...a: unknown[]) => ServerResponse }).end = (...args: unknown[]): ServerResponse => {
    const kind = type ?? String(res.getHeader('content-type') ?? '');
    const setting = settingSession([...cookies, ...asLines(res.getHeader('set-cookie'))], cookieName);
    const session = setting === undefined ? cookie : setting ?? undefined;
    const body = args[0];
    if (session !== undefined && /text\/html/i.test(kind) && (typeof body === 'string' || Buffer.isBuffer(body))) {
      const text = typeof body === 'string' ? body : body.toString('utf8');
      if (/<form\b/i.test(text) || /<head\b/i.test(text)) {
        args[0] = withFormTokens(text, path, formToken(session), () => onceToken(session, nowMs()));
      }
    }
    return end(...args);
  };
}
