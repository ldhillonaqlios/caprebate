/**
 * STUB 2 of 3 — document signature. REPLACED FOR THE ENGAGEMENT LETTER BY PHASE 146f, 22 September 2026.
 *
 * The stub provider that lived here (`stubSignatureProvider`, which contacted nothing and executed nothing) is gone.
 * Lakhbir decided the engagement letter is signed inside the application, so the signature is built in:
 * src/web/signing.ts — the client types their full name and role, ticks that they may sign for the business, and
 * presses Sign; the record, its fingerprint in the audit chain and a signed PDF are kept. It is switched off
 * (ENGAGEMENT_SIGNING) until our solicitor confirms a typed name suits the letter and the letter's open terms are
 * settled.
 *
 * WHAT IS LEFT HERE is the interface, for any other document a signature provider might one day carry, and the
 * built-in provider's description of itself. The surveyor's "commit figures" is not a signature and never was.
 *
 * WHAT MUST NOT BE BUILT ON TOP OF THIS: a signed engagement is what gates the PAID register calls, and that
 * assertion is SERVER-SIDE. `assertSignedEngagement` (src/web/research.ts) reads the engagements table and the
 * signature record; it must never read a value returned to a browser.
 */

export type SignatureRequest = { document_id: string; business_id: string };
export type SignatureResult = { provider: string; reference: string; executed: boolean };

export type SignatureProvider = {
  readonly id: string;
  request(r: SignatureRequest): SignatureResult;
};

/**
 * THE BUILT-IN PROVIDER, AS AN APPLICATION PART. It sends nothing anywhere: a signature happens when the client signs
 * in the portal (signEngagement), never because the back office asked for one. So `request` records that the letter
 * is waiting for the client and says that nothing has been executed by the request itself.
 */
export function builtInSignatureProvider(ids: () => string): SignatureProvider {
  return {
    id: 'BUILT_IN',
    request(_r: SignatureRequest): SignatureResult {
      return { provider: 'BUILT_IN', reference: ids(), executed: false };
    },
  };
}

export const SIGNATURE_NOTICE =
  'The client signs in their portal. Signing is built in and not switched on yet.';
