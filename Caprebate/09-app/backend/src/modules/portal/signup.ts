/**
 * A CLIENT'S OWN LOGIN, CHECKED BY EMAIL — 18 September 2026.
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
 * Email is the outbox stub (src/integrations/email/email.ts): the message is written, labelled not sent, and read from there.
 */

import { randomBytes } from 'node:crypto';
import type { App } from '../../core/app.ts';
import { rateLimit } from '../../core/index.ts';
import { canonicalEmail, createUser, hashToken } from '../../core/index.ts';
import { keepAgreement, type TermsVersions } from '../compliance/index.ts';
import { getClientSignupsIdBusinessIdByOfferHash, getClientSignupsIdBusinessIdByVerifyHash, getClientSignupsTermsAgreedAtTermsVersionsById, getClientSignupsVerifyExpiresAtVerifiedAtByVerifyHash, insertClientSignups, updateClientSignupsEmailCanonicalDisplayNameByIdVerifiedAt, updateClientSignupsVerifiedAtUserIdById } from './data.ts';
import { getUsersCountByEmailCanonical } from '../../core/index.ts';
import { brandedEmail, type EmailContent } from '../../integrations/index.ts';

export const OFFER_TTL_MS = 24 * 60 * 60 * 1000;
export const VERIFY_TTL_MS = 24 * 60 * 60 * 1000;
export const SIGNUP_LIMIT = 5;
export const MIN_PASSWORD = 12;

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

type Row = {
  id: string; business_id: string; offer_expires_at: string; email_canonical: string | null; display_name: string | null;
  password_hash: string | null; verify_expires_at: string | null; verified_at: string | null;
};

/* THE THREE EMAILS (emails.py, Phase 161m2): confirm-login, login-exists and welcome, in the branded layout. */

/** confirm-login: the single-use link that finishes a client's own sign-up. */
export function confirmLoginEmail(confirmLink: string): EmailContent {
  return {
    subject: 'Confirm your Cap Rebate login',
    preheader: 'One click to finish setting up your login. The link works for 24 hours.',
    heading: 'Confirm your login',
    blocks: [
      'Please confirm this is your email address to finish setting up your Cap Rebate login.',
      'The link works once, for 24 hours.',
      'If you did not ask for a login, you can ignore this email. Nothing will be set up.',
    ],
    button: { label: 'Confirm my login', href: confirmLink },
    sign: 'The Cap Rebate team',
    security: true,
  };
}

/** login-exists: somebody asked for a login for an address that has one. Nothing was created. */
export function loginExistsEmail(signinLink: string): EmailContent {
  return {
    subject: 'You already have a Cap Rebate login',
    preheader: 'Use the sign-in page, or reset your password.',
    heading: 'You already have a login',
    blocks: [
      'Someone, probably you, tried to set up a new Cap Rebate login with this email address. It already has one.',
      'You can sign in as normal. If you have forgotten your password, use "Forgotten your password?" on the sign-in page.',
      'If this was not you, you do not need to do anything. Your login has not changed.',
    ],
    button: { label: 'Sign in', href: signinLink },
    sign: 'The Cap Rebate team',
    security: true,
  };
}

/** welcome: once a client has confirmed their login, what the portal is for. */
export function welcomeEmail(portalLink: string): EmailContent {
  return {
    subject: 'Welcome to your Cap Rebate portal',
    preheader: 'Everything about your claim, in one place.',
    heading: 'Welcome to your portal',
    blocks: [
      'Your login is ready. Your portal is where you can:',
      { kind: 'bullets', items: [
        'see where your claim is, step by step;',
        'read and sign your engagement letter;',
        'upload the documents we ask for;',
        'send us a message and see our replies;',
        'read and accept your report.',
      ] },
      'We will email you when there is something for you to do. We never put your documents or messages in an email: you read them in the portal.',
    ],
    button: { label: 'Open your portal', href: portalLink },
    sign: 'The Cap Rebate team',
  };
}

function token(): string { return randomBytes(32).toString('hex'); }
function later(now: string, ms: number): string { return new Date(Date.parse(now) + ms).toISOString(); }
function live(at: string | null, now: string): boolean { return at !== null && Date.parse(at) > Date.parse(now); }

/** Step 1. The raw token goes into the thank-you page; only its hash is kept. */
export function offerSignup(app: App, newId: () => string, business_id: string, assessment_id: string | null): string {
  const raw = token();
  const at = app.now();
  insertClientSignups(app.db, [newId(), business_id, assessment_id, hashToken(raw), at, later(at, OFFER_TTL_MS)]);
  return raw;
}

export type Asked = { ok: true } | { ok: false; why: string };

/**
 * Step 2. `terms` is the version of each document the person must tick that they have read (the portal
 * terms, the website terms, the privacy policy), where the legal pages are served; null where they are not. The tick
 * is kept with the request, with its date, and copied to the login when it is made (step 3).
 */
export async function requestSignup(app: App, origin: string, f: URLSearchParams, terms: TermsVersions | null = null): Promise<Asked> {
  const offer = f.get('offer') ?? '';
  const email = (f.get('email') ?? '').trim();
  const name = (f.get('display_name') ?? '').trim();
  const password = f.get('password') ?? '';
  const now = app.now();
  if (!rateLimit(app.deps, 'signup:' + hashToken(offer), SIGNUP_LIMIT)) {
    app.audit.append({ at: now, kind: 'RATE_LIMITED', outcome: 'REFUSED', detail: { what: 'client_signup' } });
    return { ok: false, why: 'This offer has been tried too many times. Telephone us and we will set up your login.' };
  }
  const row = getClientSignupsIdBusinessIdByOfferHash<Row>(app.db, [hashToken(offer)]);
  if (row === undefined || row.verified_at !== null || !live(row.offer_expires_at, now)) {
    return { ok: false, why: 'This offer is no longer open. Your assessment is still with us; telephone us and we will set up your login.' };
  }
  if (!EMAIL.test(email) || email.length > 254) return { ok: false, why: 'Enter the email address you would like to sign in with.' };
  if (name.length === 0 || name.length > 200) return { ok: false, why: 'Enter your name, as you would like us to address you.' };
  if (password.length < MIN_PASSWORD || password.length > 1024) {
    return { ok: false, why: `Choose a password of at least ${MIN_PASSWORD} characters.` };
  }
  if (terms !== null && f.get('agree') !== 'yes') {
    return { ok: false, why: 'Tick the box to say you have read our client portal terms, our website terms and our privacy policy.' };
  }

  const canonical = canonicalEmail(email);
  const taken = getUsersCountByEmailCanonical<{ n: number }>(app.db, [canonical]);
  if ((taken?.n ?? 0) > 0) {
    // The screen says what it always says; the address is told, and nothing is created.
    const e = brandedEmail(loginExistsEmail(`${origin}/login`), { publicOrigin: origin });
    app.email.send({ to_email: email, kind: 'NOTIFICATION', business_id: row.business_id, subject: e.subject, body: e.text, html: e.html });
    app.audit.append({ at: now, kind: 'CLIENT_SIGNUP_REQUESTED', outcome: 'REFUSED', object_type: 'client_signup', object_id: row.id,
      detail: { reason: 'address_in_use' } });
    return { ok: true };
  }

  const hash = await app.hasher.hash(password);
  const raw = token();
  updateClientSignupsEmailCanonicalDisplayNameByIdVerifiedAt(app.db, [canonical, name, hash, hashToken(raw), later(now, VERIFY_TTL_MS), now, terms === null ? null : now, terms === null ? null : JSON.stringify(terms), row.id]);
  const e = brandedEmail(confirmLoginEmail(`${origin}/account/verify?token=${raw}`), { publicOrigin: origin });
  const sent = app.email.send({ to_email: email, kind: 'ACCOUNT_VERIFY', business_id: row.business_id, subject: e.subject, body: e.text, html: e.html });
  app.audit.append({ at: now, kind: 'CLIENT_SIGNUP_REQUESTED', outcome: sent.refused === null ? 'ALLOWED' : 'REFUSED',
    object_type: 'client_signup', object_id: row.id,
    detail: { business: row.business_id, ...(sent.refused === null ? {} : { reason: sent.refused }) } });
  return { ok: true };
}

/** Whether a link is still good, for drawing the confirmation page. Writes nothing. */
export function verifyOpen(app: App, raw: string): boolean {
  if (raw === '') return false;
  const row = getClientSignupsVerifyExpiresAtVerifiedAtByVerifyHash<Row>(app.db, [hashToken(raw)]);
  return row !== undefined && row.verified_at === null && live(row.verify_expires_at, app.now());
}

/**
 * Step 3. Creates the CLIENT login for the organisation the offer named, and keeps the tick, if one was given, for it.
 * THEN THE WELCOME EMAIL (Phase 161m2), once: a link works once, so a login is confirmed once. It goes to the login's
 * own address, through the outbox like every other (do not contact and the sending switch apply there); `origin` is the
 * site's address for its link, and absent it is CAPREBATE_PUBLIC_ORIGIN, then http://localhost:8103, as the routes do.
 */
export function confirmSignup(app: App, raw: string, newId?: () => string, origin?: string): { ok: true } | { ok: false; why: string } {
  const now = app.now();
  const row = raw === '' ? undefined : getClientSignupsIdBusinessIdByVerifyHash<Row>(app.db, [hashToken(raw)]);
  if (row === undefined || row.verified_at !== null || !live(row.verify_expires_at, now)
    || row.email_canonical === null || row.display_name === null || row.password_hash === null) {
    return { ok: false, why: 'This link is no longer valid. It works once, for 24 hours.' };
  }
  const { email_canonical: email, display_name, password_hash } = row;
  const made = app.db.tx(() => {
    const taken = getUsersCountByEmailCanonical<{ n: number }>(app.db, [email]);
    if ((taken?.n ?? 0) > 0) return undefined;
    const user = createUser(app.db, app.now, { email, display_name, role: 'CLIENT', password_hash, business_id: row.business_id });
    updateClientSignupsVerifiedAtUserIdById(app.db, [now, user.id, row.id]);
    return user;
  });
  if (made === undefined) return { ok: false, why: 'This address already has a login. Sign in with it instead.' };
  app.audit.append({ at: now, kind: 'USER_CREATED', outcome: 'ALLOWED', actor_id: made.id, actor_role: 'CLIENT',
    object_type: 'user', object_id: made.id, detail: { role: 'CLIENT', route: 'self_signup' } });
  app.audit.append({ at: now, kind: 'CLIENT_SIGNUP_VERIFIED', outcome: 'ALLOWED', actor_id: made.id, actor_role: 'CLIENT',
    object_type: 'client_signup', object_id: row.id, detail: { business: row.business_id, user: made.id } });
  const tick = getClientSignupsTermsAgreedAtTermsVersionsById<{ terms_agreed_at: string | null; terms_versions: string | null }>(app.db, [row.id]);
  if (tick?.terms_agreed_at != null && tick.terms_versions !== null) {
    keepAgreement(app, made.id, 'CLIENT', tick.terms_agreed_at, JSON.parse(tick.terms_versions) as TermsVersions, newId ?? (() => randomBytes(16).toString('hex')), 'signup');
  }
  const site = (origin ?? process.env['CAPREBATE_PUBLIC_ORIGIN'] ?? 'http://localhost:8103').trim().replace(/\/+$/, '');
  const e = brandedEmail(welcomeEmail(`${site}/portal`), { publicOrigin: site });
  app.email.send({ to_email: made.email, kind: 'NOTIFICATION', business_id: row.business_id, subject: e.subject, body: e.text, html: e.html });
  return { ok: true };
}
