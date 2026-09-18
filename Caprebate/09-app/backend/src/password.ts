/**
 * Password hashing. argon2id, through an interface.
 *
 * WHY THE INTERFACE. Not indecision — a KDF is the one thing in an application
 * that must be replaceable without touching a call site, because the parameters
 * are expected to change as hardware does, and because a project that pins
 * itself to one library's API cannot follow that advice.
 *
 * PARAMETERS: the OWASP argon2id baseline — m=19456 KiB, t=2, p=1. They are
 * named here rather than left to the library's defaults, so a version bump
 * cannot quietly weaken them and so the number in the PHC string can be checked
 * against the number in this file.
 *
 * A HASH IS NEVER LOGGED AND NEVER RETURNED. That is not this module's job to
 * enforce — it is enforced by the row types in users.ts, which have no such
 * field, and by the audit detail screen, which refuses the key. This module
 * only promises that what it produces is safe to store.
 */

import { timingSafeEqual } from 'node:crypto';

export type PasswordHasher = {
  readonly id: string;
  hash(plain: string): Promise<string>;
  verify(stored: string, plain: string): Promise<boolean>;
  /** True when `stored` was made with weaker parameters and should be re-hashed on next login. */
  needsRehash(stored: string): boolean;
};

export const ARGON2ID_PARAMS = Object.freeze({
  memoryCost: 19456, // KiB
  timeCost: 2,
  parallelism: 1,
});

type Argon2Module = {
  hash(plain: string, opts: Record<string, unknown>): Promise<string>;
  verify(stored: string, plain: string, opts?: Record<string, unknown>): Promise<boolean>;
  Algorithm: { Argon2id: number };
};

/**
 * The real one. `@node-rs/argon2` ships prebuilt binaries, so a clean checkout
 * needs `npm install` and no compiler.
 */
export function argon2idHasher(mod: Argon2Module): PasswordHasher {
  const opts = { ...ARGON2ID_PARAMS, algorithm: mod.Algorithm.Argon2id };
  return {
    id: 'argon2id',
    async hash(plain: string): Promise<string> {
      if (plain.length < 12) {
        throw new Error('password must be at least 12 characters');
      }
      return mod.hash(plain, opts);
    },
    async verify(stored: string, plain: string): Promise<boolean> {
      try {
        return await mod.verify(stored, plain);
      } catch {
        // A malformed stored hash is a verification failure, not a crash that
        // tells the caller something about the account.
        return false;
      }
    },
    needsRehash(stored: string): boolean {
      const m = /^\$argon2id\$v=19\$m=(\d+),t=(\d+),p=(\d+)\$/.exec(stored);
      if (m === null) return true; // not argon2id at all
      return (
        Number(m[1]) < ARGON2ID_PARAMS.memoryCost ||
        Number(m[2]) < ARGON2ID_PARAMS.timeCost ||
        Number(m[3]) < ARGON2ID_PARAMS.parallelism
      );
    },
  };
}

/** Loads the native module. Kept apart so a test can inject a fake and stay fast. */
export async function defaultHasher(): Promise<PasswordHasher> {
  const mod = (await import('@node-rs/argon2')) as unknown as Argon2Module;
  return argon2idHasher(mod);
}

/**
 * Constant-time compare for opaque tokens — session tokens, reset tokens.
 * NOT for passwords: those go through the KDF above.
 */
export function safeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a, 'utf8'), Buffer.from(b, 'utf8'));
}
