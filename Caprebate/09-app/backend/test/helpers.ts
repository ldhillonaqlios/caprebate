/** Shared fixtures. A fake hasher keeps the suite fast; the real one is exercised in auth.test.ts. */
import { buildApp, type App } from '../src/app.ts';
import type { PasswordHasher } from '../src/password.ts';
import type { Actor } from '../src/authz.ts';
import type { AppRole } from '../src/roles.ts';
import { randomUUID } from 'node:crypto';
import type { Db } from '../src/db.ts';
import { AuditLog } from '../src/audit.ts';
import { seedSignatureRecord } from '../src/web/signing.ts';

/**
 * PHASE 146f: A LETTER A FIXTURE MARKS SIGNED ALSO NEEDS ITS SIGNATURE RECORD, because assertSignedEngagement now
 * reads the record (src/web/signing.ts). Writes one marked SEED if the engagement has none. Idempotent.
 */
export function signatureRecordFor(db: Db, business_id: string, at: string): void {
  const has = db.get<{ n: number }>(
    'SELECT COUNT(*) AS n FROM engagement_signatures s JOIN engagements e ON e.id = s.engagement_id WHERE e.business_id = ?', [business_id])?.n ?? 0;
  if (has === 0) seedSignatureRecord({ db, audit: new AuditLog(db), now: () => at, newId: randomUUID }, business_id, at);
}

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
