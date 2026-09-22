/**
 * A CLIENT'S OWN LOGIN, CHECKED BY EMAIL — PHASE 133j, 18 September 2026.
 *
 * Until now a client login existed only if somebody created it. A person who finishes the assessment is now offered
 * one on the thank-you page, for the organisation the assessment has just recorded.
 *
 * THREE STEPS, AND EACH IS A CONTROL
 *
 * 1. THE OFFER. `offerSignup` is called once, at the funnel close, and returns a random token that is put into the
 *    thank-you page and nowhere else. Only its hash is stored (migration 031). Whoever holds the page may ask for a
 *    login for THAT organisation and no other, for 24 hours. The organisation is never taken from the form.
 *
 * 2. THE REQUEST. `requestSignup` takes an email address, a name and a password, keeps the password only as its hash,
 *    and sends a single-use link to the address. THE SCREEN SAYS THE SAME THING WHETHER OR NOT THE ADDRESS IS ALREADY A
 *    LOGIN, so the form is not a way to find out who has an account; the address itself is told, by email.
 *
 * 3. THE CONFIRMATION. The link opens a page with a button, and only the button's POST creates the login. A mail
 *    scanner that follows every link in a message therefore cannot create an account on anybody's behalf.
 *
 * THE LINK'S ADDRESS IS CONFIGURED, NEVER TAKEN FROM THE REQUEST. A Host header is whatever the sender typed; a link
 * built from it could send a person's token to somebody else's site.
 *
 * Email is the outbox stub (src/stubs/email.ts): the message is written, labelled not sent, and read from there.
 */

import { randomBytes } from 'node:crypto';
import type { App } from '../app.ts';
import { rateLimit } from '../auth.ts';
import { canonicalEmail, createUser, hashToken } from '../users.ts';

export const OFFER_TTL_MS = 24 * 60 * 60 * 1000;
export const VERIFY_TTL_MS = 24 * 60 * 60 * 1000;
export const SIGNUP_LIMIT = 5;
export const MIN_PASSWORD = 12;

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

type Row = {
  id: string; business_id: string; offer_expires_at: string; email_canonical: string | null; display_name: string | null;
  password_hash: string | null; verify_expires_at: string | null; verified_at: string | null;
};

function token(): string { return randomBytes(32).toString('hex'); }
function later(now: string, ms: number): string { return new Date(Date.parse(now) + ms).toISOString(); }
function live(at: string | null, now: string): boolean { return at !== null && Date.parse(at) > Date.parse(now); }

/** Step 1. The raw token goes into the thank-you page; only its hash is kept. */
export function offerSignup(app: App, newId: () => string, business_id: string, assessment_id: string | null): string {
  const raw = token();
  const at = app.now();
  app.db.run(
    'INSERT INTO client_signups (id, business_id, assessment_id, offer_hash, created_at, offer_expires_at) VALUES (?, ?, ?, ?, ?, ?)',
    [newId(), business_id, assessment_id, hashToken(raw), at, later(at, OFFER_TTL_MS)],
  );
  return raw;
}

export type Asked = { ok: true } | { ok: false; why: string };

/** Step 2. */
export async function requestSignup(app: App, origin: string, f: URLSearchParams): Promise<Asked> {
  const offer = f.get('offer') ?? '';
  const email = (f.get('email') ?? '').trim();
  const name = (f.get('display_name') ?? '').trim();
  const password = f.get('password') ?? '';
  const now = app.now();
  if (!rateLimit(app.deps, 'signup:' + hashToken(offer), SIGNUP_LIMIT)) {
    app.audit.append({ at: now, kind: 'RATE_LIMITED', outcome: 'REFUSED', detail: { what: 'client_signup' } });
    return { ok: false, why: 'This offer has been tried too many times. Telephone us and we will set up your login.' };
  }
  const row = app.db.get<Row>(
    'SELECT id, business_id, offer_expires_at, email_canonical, display_name, password_hash, verify_expires_at, verified_at ' +
      'FROM client_signups WHERE offer_hash = ?', [hashToken(offer)]);
  if (row === undefined || row.verified_at !== null || !live(row.offer_expires_at, now)) {
    return { ok: false, why: 'This offer is no longer open. Your assessment is still with us; telephone us and we will set up your login.' };
  }
  if (!EMAIL.test(email) || email.length > 254) return { ok: false, why: 'Enter the email address you would like to sign in with.' };
  if (name.length === 0 || name.length > 200) return { ok: false, why: 'Enter your name, as you would like us to address you.' };
  if (password.length < MIN_PASSWORD || password.length > 1024) {
    return { ok: false, why: `Choose a password of at least ${MIN_PASSWORD} characters.` };
  }

  const canonical = canonicalEmail(email);
  const taken = app.db.get<{ n: number }>('SELECT COUNT(*) AS n FROM users WHERE email_canonical = ?', [canonical]);
  if ((taken?.n ?? 0) > 0) {
    // The screen says what it always says; the address is told, and nothing is created.
    app.email.send({
      to_email: email, kind: 'NOTIFICATION', business_id: row.business_id,
      subject: 'You already have a Cap Rebate login',
      body: `Somebody asked for a new Cap Rebate login for this address. You already have one, so nothing was created.\n\n` +
        `Sign in at ${origin}/login. If this was not you, you need do nothing.`,
    });
    app.audit.append({ at: now, kind: 'CLIENT_SIGNUP_REQUESTED', outcome: 'REFUSED', object_type: 'client_signup', object_id: row.id,
      detail: { reason: 'address_in_use' } });
    return { ok: true };
  }

  const hash = await app.hasher.hash(password);
  const raw = token();
  app.db.run(
    'UPDATE client_signups SET email_canonical = ?, display_name = ?, password_hash = ?, verify_hash = ?, verify_expires_at = ?, requested_at = ? ' +
      'WHERE id = ? AND verified_at IS NULL',
    [canonical, name, hash, hashToken(raw), later(now, VERIFY_TTL_MS), now, row.id],
  );
  const sent = app.email.send({
    to_email: email, kind: 'ACCOUNT_VERIFY', business_id: row.business_id,
    subject: 'Confirm your Cap Rebate login',
    body: `Open the link below to finish your login.\n\n${origin}/account/verify?token=${raw}\n\n` +
      'The link works once, for 24 hours. If you did not ask for a login, you need do nothing.',
  });
  app.audit.append({ at: now, kind: 'CLIENT_SIGNUP_REQUESTED', outcome: sent.refused === null ? 'ALLOWED' : 'REFUSED',
    object_type: 'client_signup', object_id: row.id,
    detail: { business: row.business_id, ...(sent.refused === null ? {} : { reason: sent.refused }) } });
  return { ok: true };
}

/** Whether a link is still good, for drawing the confirmation page. Writes nothing. */
export function verifyOpen(app: App, raw: string): boolean {
  if (raw === '') return false;
  const row = app.db.get<Row>('SELECT verify_expires_at, verified_at FROM client_signups WHERE verify_hash = ?', [hashToken(raw)]);
  return row !== undefined && row.verified_at === null && live(row.verify_expires_at, app.now());
}

/** Step 3. Creates the CLIENT login for the organisation the offer named. */
export function confirmSignup(app: App, raw: string): { ok: true } | { ok: false; why: string } {
  const now = app.now();
  const row = raw === '' ? undefined : app.db.get<Row>(
    'SELECT id, business_id, offer_expires_at, email_canonical, display_name, password_hash, verify_expires_at, verified_at ' +
      'FROM client_signups WHERE verify_hash = ?', [hashToken(raw)]);
  if (row === undefined || row.verified_at !== null || !live(row.verify_expires_at, now)
    || row.email_canonical === null || row.display_name === null || row.password_hash === null) {
    return { ok: false, why: 'This link is no longer valid. It works once, for 24 hours.' };
  }
  const { email_canonical: email, display_name, password_hash } = row;
  const made = app.db.tx(() => {
    const taken = app.db.get<{ n: number }>('SELECT COUNT(*) AS n FROM users WHERE email_canonical = ?', [email]);
    if ((taken?.n ?? 0) > 0) return undefined;
    const user = createUser(app.db, app.now, { email, display_name, role: 'CLIENT', password_hash, business_id: row.business_id });
    app.db.run('UPDATE client_signups SET verified_at = ?, user_id = ?, password_hash = NULL WHERE id = ?', [now, user.id, row.id]);
    return user;
  });
  if (made === undefined) return { ok: false, why: 'This address already has a login. Sign in with it instead.' };
  app.audit.append({ at: now, kind: 'USER_CREATED', outcome: 'ALLOWED', actor_id: made.id, actor_role: 'CLIENT',
    object_type: 'user', object_id: made.id, detail: { role: 'CLIENT', route: 'self_signup' } });
  app.audit.append({ at: now, kind: 'CLIENT_SIGNUP_VERIFIED', outcome: 'ALLOWED', actor_id: made.id, actor_role: 'CLIENT',
    object_type: 'client_signup', object_id: row.id, detail: { business: row.business_id, user: made.id } });
  return { ok: true };
}
