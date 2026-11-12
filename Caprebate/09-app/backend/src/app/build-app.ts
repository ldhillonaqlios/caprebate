/**
 * BUILDING THE APPLICATION (the start-up wiring; it was the second half of src/core/app.ts). One process, both
 * applications, no hidden state: everything it needs is passed in (the database location, the clock, the hasher, the
 * transports), so a test builds a whole application in memory and the production start-up does the same thing with
 * different arguments. The shapes it returns (App, BuildOptions) stay in the core (src/core/app.ts), where every area
 * reads them.
 */

import { AuditLog, Db, MIGRATIONS_DIR, defaultHasher, loadCustomRoles, migrate, newId, pendingMigrations, primeTimingDefence, processSecrets, setEmailLayout } from '../core/index.ts';
import type { App, BuildOptions, Deps } from '../core/index.ts';
import { EMAIL_SENDING, brandedEmail, builtInSignatureProvider, liveTransport, mailWhere, outboxTransport, sendingOn, smtpLoginFromKeyFile } from '../integrations/index.ts';
/* EVERY AREA'S FRONT DOOR, wherever an application is built (the server, the command line, the tests): each door
   registers its area's permissions and fills the ports the areas below it own (src/modules/claims/above-ports.ts, the
   outside services' test lookups, the survey's jobs). Phase 161l2: until then the outside services' Claude client
   happened to load the claims, and they the rest; now nothing below loads an area above, so the start-up loads them. */
import '../modules/clients/index.ts';
import '../modules/assessment/index.ts';
import '../modules/claims/index.ts';
import '../modules/survey/index.ts';
import '../modules/finance/index.ts';
import '../modules/compliance/index.ts';
import '../modules/admin/index.ts';
import '../modules/crm/index.ts';
import '../modules/portal/index.ts';
import '../modules/public-site/index.ts';

/* The core's one port onto the outside services (Phase 161m2): the branded email layout, for the sign-in code and the
   recovery-code email (src/core/sign-in.ts). The core sits below the outside services, so it is handed in here. */
setEmailLayout(brandedEmail);

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
