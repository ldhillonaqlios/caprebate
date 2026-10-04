/**
 * CHAPTER 15'S VAT HALF — PHASE 153e, 4 October 2026 (added to the phase by Phase 153a).
 *
 * Module 00 C23: "Irrecoverable VAT is included in qualifying expenditure. Healthcare is largely VAT-exempt, so this is
 * usually a meaningful uplift — but watch partial exemption (cosmetic / dispensing / NHS-contract mixes)." Built on
 * that, for the surveyor and the tax adviser to check: two pack inputs, each set by the surveyor with a reason (their
 * source), and the VAT that could not be reclaimed is added to the price before it is shared out.
 *
 *   EXEMPT          the client could reclaim none of it: the VAT amount is added to the price paid.
 *   RECLAIMS        the client reclaimed it all: nothing is added.
 *   PARTLY_EXEMPT   partial exemption is UNRESOLVED (Module 00): nothing is added, and the tax adviser is asked.
 *   NOT_KNOWN       nothing is added (N4: an unknown never adds to a claim).
 * No position recorded reads exactly as NOT_KNOWN, and an exempt position with no amount adds nothing.
 */
import type { Valued } from './pack-sums.ts';

export type VatPosition = 'RECLAIMS' | 'EXEMPT' | 'PARTLY_EXEMPT' | 'NOT_KNOWN';
/** The code kept in the pack's entries (migration 082). */
export const VAT_POSITION_CODES: readonly VatPosition[] = Object.freeze(['RECLAIMS', 'EXEMPT', 'PARTLY_EXEMPT', 'NOT_KNOWN']);
export const VAT_POSITION_WORDS: Readonly<Record<VatPosition, string>> = Object.freeze({
  RECLAIMS: 'The client reclaimed all the VAT',
  EXEMPT: 'The client could reclaim none of it (VAT-exempt)',
  PARTLY_EXEMPT: 'The client could reclaim part of it',
  NOT_KNOWN: 'Not known',
});

export type VatReading = {
  readonly position: VatPosition;
  readonly position_source: Valued['source'];
  readonly amount_pence: number | null;
  readonly amount_source: Valued['source'];
  /** What is added to the price paid before it is shared out. */
  readonly counted_pence: number;
  readonly words: string;
};

export function vatReading(position: Valued, amount: Valued): VatReading {
  const code = position.value;
  const pos: VatPosition = code !== null && Number.isInteger(code) && code >= 0 && code <= 3 ? VAT_POSITION_CODES[code] as VatPosition : 'NOT_KNOWN';
  const amt = amount.value !== null && Number.isSafeInteger(amount.value) && amount.value >= 0 ? amount.value : null;
  const counted = pos === 'EXEMPT' && amt !== null ? amt : 0;
  const words = pos === 'EXEMPT'
    ? (amt === null ? 'Exempt, but the VAT amount is not recorded, so nothing is added yet.' : 'The VAT the client could not reclaim is added to the price paid before it is shared out.')
    : pos === 'RECLAIMS' ? 'The client reclaimed the VAT, so none of it is part of the spend.'
    : pos === 'PARTLY_EXEMPT' ? 'Partly exempt: how much of the VAT counts is not settled. Nothing is added until the tax adviser says how to split it.'
    : 'Whether the client could reclaim the VAT is not known, so none of it is added.';
  return { position: pos, position_source: position.source, amount_pence: amt, amount_source: amount.source, counted_pence: counted, words };
}
