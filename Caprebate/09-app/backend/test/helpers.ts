/** Shared fixtures. A fake hasher keeps the suite fast; the real one is exercised in auth.test.ts. */
import { buildApp, type App } from '../src/app.ts';
import type { PasswordHasher } from '../src/password.ts';
import type { Actor } from '../src/authz.ts';
import type { AppRole } from '../src/roles.ts';

/**
 * NOT A PASSWORD HASHER. It is a marker so a test can prove that what a
 * response leaks would have been recognisable if it leaked. Never exported
 * from src/, and never used by anything that runs outside a test.
 */
export function fakeHasher(): PasswordHasher {
  return {
    id: 'fake',
    async hash(p: string): Promise<string> { return `fake$${p}`; },
    async verify(stored: string, p: string): Promise<boolean> { return stored === `fake$${p}`; },
    needsRehash(): boolean { return false; },
  };
}

let tick = 0;
export function fixedClock(): () => string {
  return () => new Date(Date.UTC(2026, 8, 8, 12, 0, 0) + tick++ * 1000).toISOString();
}

export async function testApp(hasher?: PasswordHasher): Promise<App> {
  return buildApp({ hasher: hasher ?? fakeHasher(), now: fixedClock() });
}

export function actor(role: AppRole, id = `u-${role}`, business_id: string | null = null): Actor {
  return { id, role, business_id: role === 'CLIENT' ? business_id : null, disabled: false };
}

/** Walks any value and yields every string and number in it, at any depth. */
export function* scalars(v: unknown): Generator<string | number> {
  if (typeof v === 'string' || typeof v === 'number') { yield v; return; }
  if (Array.isArray(v)) { for (const x of v) yield* scalars(x); return; }
  if (v !== null && typeof v === 'object') {
    for (const x of Object.values(v as Record<string, unknown>)) yield* scalars(x);
  }
}

/** Every key name in a value, at any depth. */
export function* keys(v: unknown): Generator<string> {
  if (Array.isArray(v)) { for (const x of v) yield* keys(x); return; }
  if (v !== null && typeof v === 'object') {
    for (const [k, x] of Object.entries(v as Record<string, unknown>)) { yield k; yield* keys(x); }
  }
}
