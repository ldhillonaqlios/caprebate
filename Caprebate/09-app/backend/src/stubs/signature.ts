/**
 * STUB 2 of 3 — document signature.
 *
 * Records that a signature was requested and lets a test mark it signed. It
 * does NOT talk to a signature provider and does not pretend the result is
 * legally executed.
 *
 * WHAT MUST NOT BE BUILT ON TOP OF THIS: a signed engagement is what gates the
 * PAID register calls, and that assertion is SERVER-SIDE. `assertSignedEngagement`
 * belongs to Phase 106 and reads the engagements table; it must never read a
 * value this stub returned to a browser.
 */

export type SignatureRequest = { document_id: string; business_id: string };
export type SignatureResult = { provider: string; reference: string; executed: boolean };

export type SignatureProvider = {
  readonly id: string;
  request(r: SignatureRequest): SignatureResult;
};

export function stubSignatureProvider(ids: () => string): SignatureProvider {
  return {
    id: 'STUB',
    request(r: SignatureRequest): SignatureResult {
      return { provider: 'STUB', reference: ids(), executed: false };
    },
  };
}

export const STUB_NOTICE =
  'NOT EXECUTED — document signature is stubbed in this build. No provider was contacted.';
