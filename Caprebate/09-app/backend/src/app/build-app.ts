/**
 * BUILDING THE APPLICATION (start-up wiring, Phase 161l; it was the second half of src/core/app.ts). One process, both
 * applications, no hidden state: everything it needs is passed in (the database location, the clock, the hasher, the
 * transports), so a test builds a whole application in memory and the production start-up does the same thing with
 * different arguments. The shapes it returns (App, BuildOptions) stay in the core (src/core/app.ts), where every area
 * reads them.
 */

import { AuditLog, Db, MIGRATIONS_DIR, defaultHasher, loadCustomRoles, migrate, newId, pendingMigrations, primeTimingDefence, processSecrets } from '../core/index.ts';
import type { App, BuildOptions, Deps } from '../core/index.ts';
import { EMAIL_SENDING, builtInSignatureProvider, liveTransport, mailWhere, outboxTransport, sendingOn, smtpLoginFromKeyFile } from '../integrations/index.ts';

export async function buildApp(opts: BuildOptions = {}): Promise<App> {
  const db = new Db(opts.location ?? ':memory:', {
    ...(opts.dbAuthToken === undefined ? {} : { authToken: opts.dbAuthToken }), ...(opts.dbEngine === undefined ? {} : { engine: opts.dbEngine }),
    ...(opts.dbLocalCopy === undefined ? {} : { localCopy: opts.dbLocalCopy }),
  });
  if (opts.schema === 'require-built') {
    const left = pendingMigrations(db, opts.migrationsDir ?? MIGRATIONS_DIR);
    if (left.length > 0) {
      db.close();
      throw Object.assign(new Error(`the database is not built: ${left.length} of its table steps are missing`), { code: 'E_NOT_BUILT' });
    }
  } else {
    migrate(db, opts.migrationsDir ?? MIGRATIONS_DIR);
  }
  loadCustomRoles(db); // The roles the super admin made, for can

  const now = opts.now ?? ((): string => new Date().toISOString());
  const hasher = opts.hasher ?? (await defaultHasher());
  const audit = new AuditLog(db);
  // 30 Sep 2026: sending is asked at the moment each email is saved, of the switch and of THIS app's key store (read
  // through `made`, because the test website replaces its store after start-up).
  let made: App | undefined;
  const email = outboxTransport(db, newId, now,
    () => made !== undefined && sendingOn(EMAIL_SENDING, smtpLoginFromKeyFile(made.secrets), mailWhere(made)));
  const signature = builtInSignatureProvider(newId);
  const secrets = opts.secrets ?? processSecrets();
  const outside = opts.outside ?? liveTransport;

  await primeTimingDefence(hasher);

  const deps: Deps = { db, audit, hasher, now, twoFactor: opts.twoFactor === 'off' ? 'OFF'
    : opts.twoFactor === 'staff-except-invented' ? 'STAFF_EXCEPT_INVENTED' : 'STAFF' };
  made = { db, audit, hasher, email, signature, secrets, outside, now, deps, close: () => db.close() };
  return made;
}
