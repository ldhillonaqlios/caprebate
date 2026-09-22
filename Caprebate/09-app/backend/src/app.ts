/**
 * The application: one process, both applications, no hidden state.
 *
 * Everything it needs is passed in — the database location, the clock, the
 * hasher, the transports. There is no module-level singleton and no ambient
 * configuration read from somewhere unnamed, so a test builds a whole
 * application in memory and the production start-up does the same thing with
 * different arguments.
 */

import { join } from 'node:path';
import { Db, migrate } from './db.ts';
import { AuditLog } from './audit.ts';
import { defaultHasher, type PasswordHasher } from './password.ts';
import { outboxTransport, type EmailTransport } from './stubs/email.ts';
import { stubSignatureProvider, type SignatureProvider } from './stubs/signature.ts';
import { newId } from './users.ts';
import { primeTimingDefence, type Deps } from './auth.ts';

export const MIGRATIONS_DIR = join(import.meta.dirname, '..', 'migrations');

export type App = {
  db: Db;
  audit: AuditLog;
  hasher: PasswordHasher;
  email: EmailTransport;
  signature: SignatureProvider;
  now: () => string;
  deps: Deps;
  close(): void;
};

export type BuildOptions = {
  location?: string;
  hasher?: PasswordHasher;
  now?: () => string;
  migrationsDir?: string;
};

export async function buildApp(opts: BuildOptions = {}): Promise<App> {
  const db = new Db(opts.location ?? ':memory:');
  migrate(db, opts.migrationsDir ?? MIGRATIONS_DIR);

  const now = opts.now ?? ((): string => new Date().toISOString());
  const hasher = opts.hasher ?? (await defaultHasher());
  const audit = new AuditLog(db);
  const email = outboxTransport(db, newId, now);
  const signature = stubSignatureProvider(newId);

  await primeTimingDefence(hasher);

  const deps: Deps = { db, audit, hasher, now };
  return { db, audit, hasher, email, signature, now, deps, close: () => db.close() };
}

/**
 * THE STUBS, in one list, so "what is not real here" is a question with an
 * answer rather than a search. Everything else is real.
 *
 * IT WAS THREE UNTIL 9 SEPTEMBER 2026 AND IT WAS WRONG, and the way it was
 * wrong is the reason this list exists. The text extractor in
 * src/web/uploads.ts opened with the words "and it is a STUB, declared as one"
 * — it was declared in its own file, in `src/stubs/` in spirit, and named
 * nowhere a reader would look. A stub that declares itself only where it lives
 * is a stub nobody counts. Phase 108 found it while writing the developer
 * spec's stub table and added it here rather than describing the discrepancy.
 *
 * AND ENTRY FOUR GOT SMALLER LATER THE SAME DAY WITHOUT DISAPPEARING, which is
 * the harder discipline. Phase 113c built a real .docx and PDF reader behind
 * that port. OCR and scanned PDFs are still not read, so the entry stays and
 * says exactly what is left — deleting a row to make a list shorter is the
 * failure this list exists to prevent, and a four-line list that has quietly
 * become a three-line one is how a developer comes to believe something works.
 *
 * THE TEST OF WHETHER SOMETHING BELONGS HERE is not "is it in src/stubs/". It
 * is: WOULD A DEVELOPER WHO RAN THIS BUILD BELIEVE THIS PART WORKS? Four
 * things fail that test today, and one of them is smaller than it was.
 */
export const STUBS = Object.freeze([
  { id: 'email', module: 'src/stubs/email.ts', what: 'outbound email — messages are written to the outbox table and shown on screen, labelled as not sent. Phase 141 built the real sender behind it (src/stubs/email-provider.ts, SMTP over TLS) and left it switched off (EMAIL_SENDING) until a provider is chosen, named in the privacy notice and clause 7, and the contactus@caprebate.com mailbox has SPF, DKIM and DMARC' },
  { id: 'registers', module: 'src/connectors/registers.ts', what: 'the register connectors — nothing is called. Phase 146b built what every connector stands on and left each one switched off: the shape (configured, fetch, toBundle) and a switch per lookup, REGISTER_SWITCHES, every one off and shown on the research panel as "not switched on"; the one way to call outside, src/connectors/http.ts (time limits, retries on 429 and 5xx only, our own rate limit, a size cap, one audit row per call); and the key file, src/secrets.ts, read from outside the code folder. No real connector is built yet — Phases 146c and 146d build them. Both gates are real and are reported honestly; register data still enters by one door, ingestRegisterRecord in src/stubs/registers.ts' },
  { id: 'signature', module: 'src/stubs/signature.ts', what: 'document signature — no provider is contacted and nothing is executed' },
  { id: 'text-extraction', module: 'src/web/uploads.ts', what: 'text extraction from the documents this build still cannot read — a SCANNED PDF (page images, no text operators: OCR), an ENCRYPTED PDF, LZW/ASCII85/JBIG2/CCITT-filtered content, .doc, .xlsx and .pptx. Each returns ONE MARKER LINE, so on those the receipt strip runs over a marker rather than over the document. NARROWED 9 September 2026 (Phase 113c): .docx, and PDFs whose text is in uncompressed or FlateDecode streams, ARE now read and ARE stripped — src/web/extract-text.ts' },
]);
