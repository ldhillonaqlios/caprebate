/**
 * RECOVERY CODES: TEN ONE-USE CODES, SO A PERSON WHO LOSES THEIR PHONE CAN STILL SIGN IN. Phase 151m, 28 September 2026.
 *
 * Lakhbir, 28 September 2026 (Word question 232, closed): yes. Until now a person who lost their phone had to ask the
 * super user to reset their second step.
 *
 * WHAT A CODE IS. Ten characters from a set of 32 with no look-alikes (no 0/O, no 1/I/L, one case only, so it can be
 * read out and typed either way), in two groups of five: 50 bits each. Ten are made at a time.
 *
 * HOW IT IS KEPT. Only as a hash, in `recovery_codes` (migration 059): scrypt of the code, salted with the person's own
 * id, so a code's hash means nothing on another login and a copy of the database is no quicker to try than the
 * sign-in page. A code is never kept as text, never written to a log line or an audit row, and never emailed: it is
 * shown once, on the page (or in the API's answer) that made it.
 *
 * WHO CALLS THIS. Only src/web/sign-in.ts, whose functions the website (src/web/router.ts) and the JSON API
 * (src/server.ts) both call. There is no second implementation.
 */
import { randomInt, scryptSync, timingSafeEqual } from 'node:crypto';
import type { App } from '../app.ts';
import { newId } from '../users.ts';

export const RECOVERY_CODE_COUNT = 10;
/** With this many or fewer left, the page after sign-in says so and offers new ones. */
export const RECOVERY_CODES_LOW = 2;

/** 32 characters: A to Z without I and O, and 2 to 9. Five bits each. */
const SET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const LENGTH = 10;

/** One code: ten characters, 50 bits, as two groups of five a person can read out ("ABCDE-FGH23"). */
export function recoveryCode(): string {
  let s = '';
  for (let i = 0; i < LENGTH; i++) s += SET[randomInt(0, SET.length)];
  return `${s.slice(0, 5)}-${s.slice(5)}`;
}

/** What a person typed, as the code it stands for: spaces and dashes dropped, one case. Null if it cannot be one. */
export function normaliseRecoveryCode(given: string): string | null {
  const s = given.replace(/[\s-]/g, '').toUpperCase();
  if (s.length !== LENGTH) return null;
  for (const c of s) if (!SET.includes(c)) return null;
  return s;
}

/** scrypt, salted with the person's id: about 30 ms a try, so a copy of the table is no shortcut. */
function hashFor(user_id: string, normalised: string): string {
  return scryptSync(normalised, `caprebate-recovery-code:${user_id}`, 32, { N: 16384, r: 8, p: 1 }).toString('hex');
}

/** How many unused codes a person has. */
export function recoveryCodesLeft(app: App, user_id: string): number {
  return app.db.get<{ n: number }>('SELECT COUNT(*) AS n FROM recovery_codes WHERE user_id = ? AND used_at IS NULL', [user_id])?.n ?? 0;
}

/** Delete every code a person has, used or not. Returns how many unused ones went. */
export function clearRecoveryCodes(app: App, user_id: string): number {
  const left = recoveryCodesLeft(app, user_id);
  app.db.run('DELETE FROM recovery_codes WHERE user_id = ?', [user_id]);
  return left;
}

/**
 * TEN NEW CODES, AND EVERY OLD ONE GONE. Returned once, to be shown once. The caller audits it (it knows why); only the
 * count is ever recorded.
 */
export function replaceRecoveryCodes(app: App, user_id: string): { codes: string[]; voided: number } {
  const codes: string[] = [];
  const at = app.now();
  const voided = clearRecoveryCodes(app, user_id);
  for (let i = 0; i < RECOVERY_CODE_COUNT; i++) {
    const code = recoveryCode();
    codes.push(code);
    app.db.run('INSERT INTO recovery_codes (id, user_id, code_hash, made_at) VALUES (?, ?, ?, ?)',
      [newId(), user_id, hashFor(user_id, normaliseRecoveryCode(code)!), at]);
  }
  return { codes, voided };
}

/**
 * USE ONE. True, with how many are left, if `given` is one of this person's unused codes - and it is then used, so it
 * never works again. False for anything else. One hash a try, compared with each unused code in constant time.
 */
export function useRecoveryCode(app: App, user_id: string, given: string): { ok: true; left: number } | { ok: false } {
  const n = normaliseRecoveryCode(given);
  if (n === null) return { ok: false };
  const want = Buffer.from(hashFor(user_id, n), 'hex');
  const rows = app.db.all<{ id: string; code_hash: string }>(
    'SELECT id, code_hash FROM recovery_codes WHERE user_id = ? AND used_at IS NULL', [user_id]);
  let hit: string | null = null;
  for (const r of rows) {
    const have = Buffer.from(r.code_hash, 'hex');
    if (have.length === want.length && timingSafeEqual(have, want)) hit = r.id;
  }
  if (hit === null) return { ok: false };
  // Used once: the row is taken only while it is still unused, so two sign-ins racing on one code cannot both win.
  if (app.db.run('UPDATE recovery_codes SET used_at = ? WHERE id = ? AND used_at IS NULL', [app.now(), hit]).changes !== 1) return { ok: false };
  return { ok: true, left: recoveryCodesLeft(app, user_id) };
}
