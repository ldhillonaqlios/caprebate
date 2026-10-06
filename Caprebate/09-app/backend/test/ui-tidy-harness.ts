/**
 * UI TIDY — one place to start the application on the seed and sign each login in, for the test/ui-tidy-*.test.ts files
 * from phase 3 on. Not a test itself (it does not end .test.ts). Password sign-in with twoFactor 'off', as
 * test/phase135.test.ts does; the second step is proved in test/phase151j.test.ts.
 */
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../src/server.ts';
import { seed } from '../src/seed.ts';
import type { Actor } from '../src/authz.ts';

export const LOGINS = ['admin', 'sales', 'accounting', 'surveying', 'readonly', 'client'] as const;
export type Login = (typeof LOGINS)[number];
export type Res = { status: number; location: string | null; body: string };
export type Made = Awaited<ReturnType<typeof createApp>>;

export type Harness = {
  readonly made: Made;
  get(who: Login, path: string): Promise<Res>;
  post(who: Login, path: string, fields: Record<string, string>): Promise<Res>;
  /** PHASE 156e: any request as that login (a multipart upload, a script's FormData). */
  send(who: Login, path: string, init: RequestInit): Promise<Res>;
  actor(who: Login): Actor;
  close(): void;
};

export async function startHarness(name: string): Promise<Harness> {
  const made = await createApp(':memory:', { twoFactor: 'off', documentRoot: mkdtempSync(join(tmpdir(), `cb-${name}-`)) });
  await new Promise<void>((r) => made.server.listen(0, '127.0.0.1', () => r()));
  const addr = made.server.address();
  const base = `http://127.0.0.1:${typeof addr === 'object' && addr !== null ? addr.port : 0}`;
  const s = await seed(made.app.db, made.app.hasher, made.app.now);
  const t = made.app.now();
  made.app.db.run(
    'INSERT INTO users (id,email,email_canonical,display_name,role,password_hash,created_at,updated_at,business_id) VALUES (?,?,?,?,?,?,?,?,NULL)',
    [`u-readonly-${name}`, 'readonly@example.invalid', 'readonly@example.invalid', 'Read-only Person', 'READ_ONLY', await made.app.hasher.hash(s.password), t, t],
  );
  const cookies = new Map<Login, string>();
  for (const who of LOGINS) {
    const r = await fetch(`${base}/login`, {
      method: 'POST', redirect: 'manual', headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ email: `${who}@example.invalid`, password: s.password }).toString(),
    });
    assert.equal(r.status, 303, `${who} could not sign in`);
    cookies.set(who, r.headers.getSetCookie().map((c) => c.split(';')[0]).join('; '));
  }
  const send = async (who: Login, path: string, init: RequestInit = {}): Promise<Res> => {
    const x = await fetch(base + path, { redirect: 'manual', ...init, headers: { ...(init.headers as Record<string, string> | undefined ?? {}), cookie: cookies.get(who) ?? '' } });
    return { status: x.status, location: x.headers.get('location'), body: await x.text() };
  };
  return {
    made,
    get: (who, path) => send(who, path),
    send,
    post: (who, path, fields) => send(who, path, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(fields).toString() }),
    actor: (who) => {
      const u = made.app.db.get<{ id: string; role: Actor['role']; business_id: string | null }>(
        'SELECT id, role, business_id FROM users WHERE email = ?', [`${who}@example.invalid`]);
      assert.ok(u !== undefined, who);
      return { id: u.id, role: u.role, business_id: u.business_id, disabled: false };
    },
    close: () => made.close(),
  };
}
