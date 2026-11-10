/**
 * WHAT THE ASSESSMENT ASKS THE PORTAL AND COMPLIANCE FOR ITS SIGN-UP, HANDED IN TO PORTS THE ASSESSMENT OWNS
 * (Phase 161l2; 09-app/docs/ARCHITECTURE.md rule 2).
 *
 * The thank-you page at the end of the assessment offers a client their own login, and the assessment's addresses
 * create it (/account/create, /account/verify). The login is the portal's (src/modules/portal/signup.ts) and the tick
 * that the person has read our terms is compliance's (src/modules/compliance/legal-approvals.ts); both sit above the
 * assessment, so it cannot import them. Each hands its part in as its front door loads (src/modules/portal/ports.ts,
 * src/modules/compliance/ports.ts), and the assessment asks here. Until Phase 161l2 the router shell lent them in one
 * bag (lendShellParts in src/core/http.ts), which named no owner.
 *
 * Asked before a part is handed in, it refuses with what is missing rather than offer a login that cannot be made.
 * Asked only while a request runs, never while files load. Declared with `var`, so a hand-in that comes while this
 * file is still loading is kept.
 */
import type { App } from '../../core/app.ts';
import type { Safe } from '../../shared/index.ts';

/** The versions of the three documents a client agrees to (compliance's TermsVersions). */
export type SignupTerms = { readonly portal_terms: string; readonly website_terms: string; readonly privacy: string };

/** The portal's sign-up: the offer on the thank-you page, the request, and the emailed link that confirms it. */
export type SignupParts = {
  readonly offerSignup: (app: App, newId: () => string, business_id: string, assessment_id: string | null) => string;
  readonly requestSignup: (app: App, origin: string, f: URLSearchParams, terms?: SignupTerms | null) => Promise<{ ok: true } | { ok: false; why: string }>;
  readonly verifyOpen: (app: App, raw: string) => boolean;
  readonly confirmSignup: (app: App, raw: string, newId?: () => string) => { ok: true } | { ok: false; why: string };
  readonly MIN_PASSWORD: number;
};

/** Compliance's part: the current versions of the terms, and the tick that says they were read. */
export type TermsParts = {
  readonly currentTermsVersions: () => SignupTerms;
  readonly agreementTick: () => Safe;
};

var signup: SignupParts | undefined;
var terms: TermsParts | undefined;

/** The portal hands in its sign-up (src/modules/portal/ports.ts). */
export function setSignupParts(parts: SignupParts): void { signup = parts; }
/** Compliance hands in the terms' versions and the tick (src/modules/compliance/ports.ts). */
export function setTermsParts(parts: TermsParts): void { terms = parts; }

/** The portal's sign-up, as the assessment's addresses and thank-you page use it. */
export function signupParts(): SignupParts {
  if (signup === undefined) throw new Error('The client sign-up is not set up. The portal sets it up when it loads, so no login can be offered or made.');
  return signup;
}

/** The terms' versions and the tick, as the sign-up asks them. */
export function termsParts(): TermsParts {
  if (terms === undefined) throw new Error('The terms a client agrees to are not set up. Compliance sets them up when it loads, so the sign-up cannot ask for the tick.');
  return terms;
}
