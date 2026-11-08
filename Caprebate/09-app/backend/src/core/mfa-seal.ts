/**
 * THE AUTHENTICATOR APP'S SECRET, SEALED AT REST. Phase 151k, 28 September 2026.
 *
 * Phase 151j kept the shared secret of a person's authenticator app as text: `users.mfa_secret`, and while they set it
 * up `sign_in_steps.pending_secret`. Anybody who could read the database could then make that person's codes. So the
 * secret is now SEALED with AES-256-GCM under a key read the way every other key is read (src/core/secrets.ts): the name
 * CAPREBATE_MFA_KEY in the key file outside the repository (never a key file inside it), or on the test website its
 * own settings (api/index.mjs, TEST_DEPLOY_KEYS). The key is 32 bytes, written as base64:
 *     node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"
 *
 * THREE STATES, AND NOTHING SET UP TODAY STOPS WORKING:
 *   NONE   no key set. A new secret is kept as text, exactly as before this phase, and a text one is read.
 *   KEY    a good key. A new secret is sealed. A text one is still read - and sealed the next time it is used to sign
 *          in (src/core/sign-in.ts), or all at once by `node src/core/cli.ts seal-app-secrets`.
 *   BAD    a key is set but is not 32 bytes of base64. Nothing new is written with it, and it opens nothing: it refuses
 *          in words, because keeping a secret as text while somebody believes it is sealed is worse than saying so.
 * A SEALED SECRET WITHOUT ITS KEY IS REFUSED IN WORDS (the key removed, or changed): never read as text, never a crash.
 *
 * WHAT IT LOOKS LIKE: `cbmfa1:` then base64 of a 12-byte nonce, the 16-byte tag and the sealed bytes. The person's id
 * is bound in as additional data, so a sealed secret copied onto another person's row does not open. A text secret is
 * base32 and can never start with `cbmfa1:`, so the two forms are told apart without a column saying which.
 */
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import type { SecretStore } from './secrets.ts';
import type { Db } from './db.ts';
import { listUsersIdMfaSecretByMfaSecret, updateUsersMfaSecretByIdMfaSecret } from './data.ts';

export const MFA_KEY_NAME = 'CAPREBATE_MFA_KEY';
export const SEALED_PREFIX = 'cbmfa1:';

export type MfaKey = { readonly state: 'NONE' } | { readonly state: 'BAD' } | { readonly state: 'KEY'; readonly key: Buffer };

/** What a person reads when their app's secret is sealed and this server has no key, or the wrong one, to open it. */
export const MFA_KEY_MISSING = 'We cannot check app codes on this server just now. Ask your administrator to reset your second step, or try again later.';
/** What a person reads when the key is set but is not a good key. */
export const MFA_KEY_BAD = 'We cannot set up an authenticator app on this server just now. Choose an email code instead, or ask your administrator.';

/** The key from the store: the SIGN_IN owner's CAPREBATE_MFA_KEY. */
export function mfaKeyFrom(store: SecretStore): MfaKey {
  const v = store.forOwner('SIGN_IN').get(MFA_KEY_NAME);
  if (v === null || v.trim() === '') return { state: 'NONE' };
  const t = v.trim();
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(t)) return { state: 'BAD' };
  const key = Buffer.from(t, 'base64');
  return key.length === 32 ? { state: 'KEY', key } : { state: 'BAD' };
}

export function isSealed(stored: string): boolean {
  return stored.startsWith(SEALED_PREFIX);
}

/** Seal a new secret for this person, or keep it as text where no key is set. */
export function sealSecret(k: MfaKey, user_id: string, secret: string): { ok: true; stored: string } | { ok: false; why: string } {
  if (k.state === 'NONE') return { ok: true, stored: secret };
  if (k.state === 'BAD') return { ok: false, why: MFA_KEY_BAD };
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', k.key, iv);
  c.setAAD(Buffer.from(`user:${user_id}`, 'utf8'));
  const body = Buffer.concat([c.update(secret, 'utf8'), c.final()]);
  return { ok: true, stored: SEALED_PREFIX + Buffer.concat([iv, c.getAuthTag(), body]).toString('base64') };
}

/** Read a stored secret, in either form. A sealed one needs this server's key; a text one is read as it is. */
export function openSecret(k: MfaKey, user_id: string, stored: string): { ok: true; secret: string } | { ok: false; why: string } {
  if (!isSealed(stored)) return { ok: true, secret: stored };
  if (k.state !== 'KEY') return { ok: false, why: MFA_KEY_MISSING };
  try {
    const b = Buffer.from(stored.slice(SEALED_PREFIX.length), 'base64');
    if (b.length < 29) return { ok: false, why: MFA_KEY_MISSING };
    const d = createDecipheriv('aes-256-gcm', k.key, b.subarray(0, 12));
    d.setAAD(Buffer.from(`user:${user_id}`, 'utf8'));
    d.setAuthTag(b.subarray(12, 28));
    return { ok: true, secret: Buffer.concat([d.update(b.subarray(28)), d.final()]).toString('utf8') };
  } catch {
    // The wrong key, another person's row, or a changed value: all one answer, and never the secret's text.
    return { ok: false, why: MFA_KEY_MISSING };
  }
}

/**
 * EVERY SECRET STILL KEPT AS TEXT, SEALED AT ONCE: `node src/core/cli.ts seal-app-secrets`, run once after the key is set.
 * Without a good key it seals nothing and says why. A sealed one is left as it is. Returns how many it sealed.
 */
export function sealTextSecrets(db: Db, k: MfaKey): { state: MfaKey['state']; sealed: number } {
  if (k.state !== 'KEY') return { state: k.state, sealed: 0 };
  let sealed = 0;
  for (const r of listUsersIdMfaSecretByMfaSecret<{ id: string; mfa_secret: string }>(db)) {
    if (isSealed(r.mfa_secret)) continue;
    const s = sealSecret(k, r.id, r.mfa_secret);
    if (!s.ok) continue;
    updateUsersMfaSecretByIdMfaSecret(db, [s.stored, r.id, r.mfa_secret]);
    sealed++;
  }
  return { state: 'KEY', sealed };
}

/**
 * PHASE 161h, 7 November 2026: CHANGING THE KEY (LIVE-RUNBOOK.md, "Rotate a key"). Every sealed secret is opened with the
 * old key and sealed again with the new one, ALL OR NOTHING: if any one will not open with the old key, nothing changes
 * and it says how many would not, so nobody is locked out of their app by a half-done change. Text secrets are sealed
 * with the new key on the way. Never prints a secret or a key.
 */
export function resealSecrets(db: Db, oldK: MfaKey, newK: MfaKey): { ok: boolean; resealed: number; would_not_open: number } {
  if (oldK.state !== 'KEY' || newK.state !== 'KEY') return { ok: false, resealed: 0, would_not_open: 0 };
  const rows = listUsersIdMfaSecretByMfaSecret<{ id: string; mfa_secret: string }>(db);
  const next: { id: string; from: string; to: string }[] = [];
  let bad = 0;
  for (const r of rows) {
    const opened = openSecret(oldK, r.id, r.mfa_secret);
    if (!opened.ok) { bad++; continue; }
    const sealed = sealSecret(newK, r.id, opened.secret);
    if (!sealed.ok) { bad++; continue; }
    next.push({ id: r.id, from: r.mfa_secret, to: sealed.stored });
  }
  if (bad > 0) return { ok: false, resealed: 0, would_not_open: bad };
  db.tx(() => { for (const n of next) updateUsersMfaSecretByIdMfaSecret(db, [n.to, n.id, n.from]); });
  return { ok: true, resealed: next.length, would_not_open: 0 };
}
