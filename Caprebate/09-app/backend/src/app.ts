/**
 * The application: one process, both applications, no hidden state.
 *
 * Everything it needs is passed in — the database location, the clock, the
 * hasher, the transports. There is no module-level singleton and no ambient
 * configuration read from somewhere unnamed, so a test builds a whole
 * application in memory and the production start-up does the same thing with
 * different arguments.
 */

import { loadCustomRoles } from './custom-roles.ts';
import { join } from 'node:path';
import { Db, migrate, pendingMigrations } from './db.ts';
import { AuditLog } from './audit.ts';
import { defaultHasher, type PasswordHasher } from './password.ts';
import { outboxTransport, type EmailTransport } from './stubs/email.ts';
import { builtInSignatureProvider, type SignatureProvider } from './stubs/signature.ts';
import { newId } from './users.ts';
import { primeTimingDefence, type Deps } from './auth.ts';
import { processSecrets, type SecretStore } from './secrets.ts';
import type { CallPolicy } from './connectors/sources.ts';
import type { GateStatus } from './connectors/registers.ts';
import type { CompanySearchConfig } from './connectors/company-search.ts';
import type { PostcodeCheckConfig } from './connectors/postcode-check.ts';
import { liveTransport, type Transport } from './connectors/http.ts';

export const MIGRATIONS_DIR = join(import.meta.dirname, '..', 'migrations');

export type App = {
  db: Db;
  audit: AuditLog;
  hasher: PasswordHasher;
  email: EmailTransport;
  signature: SignatureProvider;
  /**
   * PHASE 146c: THE KEY FILE, READ ONCE, AT START-UP. `processSecrets()` — the file outside the repository, or the
   * empty store under the test runner — so every connector reads the same store for the life of the process and no
   * request reads the disk. A key changed in the file takes effect on the next start. Nothing prints it: the store
   * prints as names only (src/secrets.ts).
   */
  secrets: SecretStore;
  /**
   * PHASE 146c: HOW A CONNECTOR REACHES OUTSIDE — the platform's fetch, through src/connectors/http.ts, which refuses a
   * live call under the test runner. A test passes recorded answers (fixtureTransport) instead.
   */
  outside: Transport;
  now: () => string;
  deps: Deps;
  close(): void;
  /**
   * 29 SEPTEMBER 2026: why this server keeps its records where it does, when the caller knows - the test website sets
   * it from its database choice (api/index.mjs, openLasting's `why`). Never an address and never a token. Absent, the
   * pages say only that the records are in memory.
   */
  storageWhy?: string;
  /**
   * 29 SEPTEMBER 2026: TESTS ONLY - the contact form security check's call policy with some values changed (the
   * transfer to Cloudflare approved), so a test can reach the recorded answers. Never set by a running server.
   */
  turnstilePolicy?: Partial<CallPolicy>;
  /**
   * 30 SEPTEMBER 2026: TESTS ONLY - Zoom's two call policies with some values changed (the transfer approved), so a test
   * can reach the recorded answers (src/connectors/zoom.ts). Never set by a running server.
   */
  zoomPolicy?: Partial<CallPolicy>;
  /**
   * 29 SEPTEMBER 2026: TESTS ONLY - the assessment's first screen's two lookups (Companies House, Postcodes.io) with
   * their gate and switches set, so a test can reach the recorded answers. Never set by a running server.
   */
  startLookups?: { readonly gate: GateStatus; readonly company: CompanySearchConfig; readonly postcode: PostcodeCheckConfig };
};

export type BuildOptions = {
  location?: string;
  /** PHASE 151e (line 4): a remote database's token (src/db.ts). The caller reads it from settings; absent for memory and file. */
  dbAuthToken?: string;
  /** Tests only: open a memory or file database through libsql, to prove the application runs on it (src/db.ts). */
  dbEngine?: 'node:sqlite' | 'libsql';
  /** PHASE 151j: who must give a second factor. Absent is 'staff', the rule. 'off' is for the older tests only.
   *  'staff-except-invented' (29 Sep 2026) is for the test website only: see TwoFactorPolicy in src/auth.ts. */
  twoFactor?: 'staff' | 'off' | 'staff-except-invented';
  hasher?: PasswordHasher;
  now?: () => string;
  migrationsDir?: string;
  /**
   * PHASE 151i follow-up 5: 'apply' (absent) builds the tables, as always. 'require-built' builds nothing and refuses a
   * database with a migration left (code E_NOT_BUILT): how a copy of the test website opens its lasting database, which
   * only the deploy's build step builds (api/index.mjs, prepareLasting).
   */
  schema?: 'apply' | 'require-built';
  /** Tests only: keys given in memory (secretsFromValues). A running process reads the key file. */
  secrets?: SecretStore;
  /** Tests only: recorded answers in place of the live transport. */
  outside?: Transport;
};

export async function buildApp(opts: BuildOptions = {}): Promise<App> {
  const db = new Db(opts.location ?? ':memory:', {
    ...(opts.dbAuthToken === undefined ? {} : { authToken: opts.dbAuthToken }), ...(opts.dbEngine === undefined ? {} : { engine: opts.dbEngine }),
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
  loadCustomRoles(db); // Phase 151: the roles the super admin made, for can()

  const now = opts.now ?? ((): string => new Date().toISOString());
  const hasher = opts.hasher ?? (await defaultHasher());
  const audit = new AuditLog(db);
  const email = outboxTransport(db, newId, now);
  const signature = builtInSignatureProvider(newId);
  const secrets = opts.secrets ?? processSecrets();
  const outside = opts.outside ?? liveTransport;

  await primeTimingDefence(hasher);

  const deps: Deps = { db, audit, hasher, now, twoFactor: opts.twoFactor === 'off' ? 'OFF'
    : opts.twoFactor === 'staff-except-invented' ? 'STAFF_EXCEPT_INVENTED' : 'STAFF' };
  return { db, audit, hasher, email, signature, secrets, outside, now, deps, close: () => db.close() };
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
 * is: WOULD A DEVELOPER WHO RAN THIS BUILD BELIEVE THIS PART WORKS? FIVE things
 * fail that test today, and one of them is smaller than it was.
 *
 * AND THE FIFTH WAS ADDED BY PHASE 146g ON 23 SEPTEMBER 2026, for exactly the reason
 * this list exists. Phase 146e built the real reader for a client document and left it
 * with no caller in src/ at all: the upload flow ended at DISCHARGED and never ran steps
 * 8, 9 or 10 of the receipt contract. So a developer who ran this build and watched an
 * upload finish could reasonably have concluded that uploads were read. They were not,
 * they still are not, and now the list says so.
 */
export const STUBS = Object.freeze([
  { id: 'email', module: 'src/stubs/email.ts', what: 'outbound email and calendar invitations — messages are written to the outbox table and shown on screen, labelled as not sent. Phase 141 built the real sender behind it (src/stubs/email-provider.ts, SMTP over TLS) and Phase 146f pointed it at IONOS: the login comes from the key file (IONOS_SMTP_*, and IONOS_IMAP_* for the reply reader), each connection writes one audit row, bounces are recorded and a hard bounce stops further email to that address, and every booked, moved or cancelled call carries a standard .ics invitation (src/stubs/calendar.ts). It stays switched off (EMAIL_SENDING) until the contact@caprebate.co.uk mailbox has SPF, DKIM and DMARC and the privacy notice and clause 7 name IONOS' },
  { id: 'registers', module: 'src/connectors/registers.ts', what: 'the register connectors — nothing is called. Phase 146b built what every connector stands on and left each one switched off: the shape (configured, fetch, toBundle, lookup) and a switch per lookup, REGISTER_SWITCHES, every one off and shown on the research panel as "not switched on"; the one way to call outside, src/connectors/http.ts (time limits, retries on 429 and 5xx only, our own rate limit, a size cap, one audit row per call); and the key file, src/secrets.ts, read from outside the code folder, once, at start-up (App.secrets). Phase 146c built the free registers for real and left every one switched off: Companies House (companies-house.ts: search, profile, filing history, and people with significant control only after a signed engagement), the Care Quality Commission (cqc.ts: England only, searched by council area because its API has no postcode filter), energy certificates (epc.ts), HM Land Registry sale prices (price-paid.ts: supported living only, with its attribution word for word), planning (planning.ts: planning.data.gov.uk, then PlanIt), and the ONS postcode table (postcode.ts: on this server, no call), each matched to the typed address by src/connectors/matching.ts at thresholds not yet measured. "Run the research" runs them only when the free gate is open, which it is not. The Welsh and Scottish care regulators have no connector. Phase 146d built the PAID lookups for real and left both switched off: the address lookup (homedata.ts \u2014 a postcode search, then named slugs and never one of the supplier\u2019s bundles, giving a UPRN, an address, a postcode and the coordinates the spatial screen needs, plus a one-penny title pre-check) and HM Land Registry\u2019s title register (hmlr-title.ts \u2014 about \u00a37 a title, over the Business Gateway, which needs a client certificate that fetch cannot present, so http.ts carries one). They sit in PAID_CONNECTORS (paid-registers.ts) beside the free map, both gated on a signed engagement asserted server-side and one operator click, and the click shows what it will cost before and what it did cost after, from the suppliers\u2019 own responses. A paid planning route (homedata-planning.ts) is BUILT AND NOT CHOSEN: PlanIt stays the source of record, and whether planning moves to the paid tier \u2014 where it would stop firing before a signature \u2014 is Lakhbir\u2019s decision, not a build one. BCIS IS STILL NOT BUILT, AND HERE IS WHY, SO THAT NOBODY RE-CHECKS IT EVERY QUARTER: the surveyor decides whether elemental cost rates are needed at all, and the licence is a RICS subscription whose own terms say the rate table may not be reproduced \u2014 so it is a purchase and a licence question before it is a build. Checked against Homedata on 23 September 2026: NO EQUIVALENT EXISTS in its 40+ endpoints. AND A WARNING IN THE SAME PLACE, because the near-misses are worse than the gap: Homedata\u2019s valuation_estimate (10 tokens) and valuation_full (25) are RESIDENTIAL SALE-PRICE estimates. They are not build costs and they are not rating valuations, and they must never stand in for BCIS or for the Valuation Office. A modelled price standing where a fact belongs is an N4 breach, not a saving. Both gates are real and are reported honestly; register data still enters by one door, ingestRegisterRecord in src/stubs/registers.ts. PHASE 146h built the three follow-ons and left the new one switched off. A PERSON\u2019S PICK FOR A CLOSE MATCH (src/web/match-review.ts, PICK_SWITCHES.MATCH_REVIEW_PICK, false): a lookup whose best candidate scored in the REVIEW band \u2014 close to the typed address and not close enough for us to choose it \u2014 can hand its ranked list to the back office, AFTER A SIGNED ENGAGEMENT ONLY and whatever the source\u2019s tier, where a person chooses one entry or none. The list is fetched again for that request and never stored, logged or shown to a client (the S10 spec, A.8 point 8); the choice, who made it and the score go on the audit chain; only the chosen record is stored, through the one door, at grade B at most (A.6, worst of the source\u2019s own ceiling and the unmeasured-threshold cap). Choosing NONE is kept as an answer and keeps no fact. THE ENERGY CERTIFICATE\u2019S DOMESTIC CODES are now decoded: a domestic certificate gives the construction age band per building part and the tenure as codes, and they are read through the register\u2019s own /api/codes and /api/codes/info for that certificate\u2019s own schema version \u2014 kept only when decoded, never as a raw letter or number. And CB_REGISTRY.derive() now carries HM Land Registry\u2019s prescribed credit, 2021 included, beside its sentence about the price a client paid. PHASE 146k: THE TITLE REGISTER IS LOOKED UP BY HAND (Lakhbir, 25 September 2026). Its Business Gateway connector is retired to PAID_RETIRED, in no map a click reads, and its four keys are marked retired and left out of secrets.example.env; a person records what the official copy says on the property page (src/web/title-by-hand.ts, migration 055), through the one door, marked by hand, with no box for a person\u2019s name' },
  { id: 'signature', module: 'src/web/signing.ts', what: 'the engagement letter signature — BUILT IN by Phase 146f and switched off (ENGAGEMENT_SIGNING): the client types their full name and role, confirms they may sign for the business and presses Sign; the name, role, business, time, IP address, session and the SHA-256 of the exact letter shown are kept in engagement_signatures with a signed PDF, the record’s fingerprint goes into the audit chain, the client is emailed a copy, and assertSignedEngagement reads the record. Off until our solicitor confirms a typed name suits the letter and the letter’s open terms are settled' },
  { id: 'text-extraction', module: 'src/web/uploads.ts', what: 'text extraction from the documents this build still cannot read — a SCANNED PDF (page images, no text operators: OCR), an ENCRYPTED PDF, LZW/ASCII85/JBIG2/CCITT-filtered content, .doc, .xlsx and .pptx. Each returns ONE MARKER LINE, so on those the receipt strip runs over a marker rather than over the document. NARROWED 9 September 2026 (Phase 113c): .docx, and PDFs whose text is in uncompressed or FlateDecode streams, ARE now read and ARE stripped — src/web/extract-text.ts' },
  { id: 'document-reading', module: 'src/connectors/claude.ts', what: 'reading a client document \u2014 built by Phase 146e and given its caller by Phase 146g, and switched off (CLAUDE_SWITCHES.DOCUMENT_READING). PHASE 146g FOUND THAT THE UPLOAD FLOW NEVER RAN STEPS 8, 9 OR 10 of the receipt contract: processUpload ended at DISCHARGED, and openTransparency, runExtraction and writeClaims were exported by the port and called from nowhere in src/, so every finished upload stopped with the strip done and nothing read. It has a caller now (readAndClaim, src/web/uploads.ts). Switched on, a finished upload opens its transparency record, sends only the segments the strip retained to the Claude API, turns the answer into claims and writes them by the one door, ingestRegisterRecord, as a CLIENT_DOC record keyed on the document. SWITCHED OFF, AS SHIPPED, A FINISHED UPLOAD BEHAVES EXACTLY AS IT DID BEFORE: the same row, the same state, the same audit rows, and nothing sent. Every refusal is a state and every failure leaves the field asked (N4). CPSE_REPLIES and SALE_CONTRACT are never sent: a person reads them. SCANNED_PAGES is a second switch and a bigger decision, because a picture of a page is sent before anything has been stripped from it. Turning it on needs the data protection officer to approve the provider and its terms, a director to sign, international_transfer_approved on the CLAUDE_DOCUMENTS row of src/connectors/sources.ts, and ANTHROPIC_API_KEY in the key file. PHASE 146i built the two follow-ons Phase 146g left. THE TWO FIELDS NOBODY COULD VOUCH FOR: assertClaimsWritable keeps grant_funder_name and brc_issuing_body only on the footing that the value names an ORGANISATION, nothing supplied either, and the refusal is for the WHOLE set of claims — so a grant funding agreement and a building regulations completion certificate kept nothing at all. A person answers it now on the document’s own page (Admin or Sales, yes / no / not sure, src/web/document-reading.ts, migration 043), the answer is kept against the logical document and audited, and an unvouched field is taken OUT of the extraction before the claims are built so that the rest of the document survives. Only ‘yes’ keeps the field: no, not sure and never asked are one decision, and the left-out field stays asked of the client. The ingestion module’s refusal is untouched. AND WHEN A READING DOES NOT WORK, A SCREEN SAYS SO: one document_readings row per reading that actually started — never for one that was switched off or never wired in — drawn on the STAFF document page in words, with the reason, and never shown to the client and never a word of the document. PHASE 146j: A YES CAN BE TAKEN BACK — its own act, with a reason, which takes that one field out of every record it went into (removeRegisterField, the one door out) and keeps the answer marked withdrawn — and THE QUESTION IS ASKED BEFORE THE FIRST READING, on the staff upload forms and the document request; a request’s answer is the same row, adopted by the document that answers it' },
]);
