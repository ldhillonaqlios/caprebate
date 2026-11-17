/**
 * THE VIRUS SCANNER'S HOOK, SWITCHED OFF (Phase 161n1c, ITRoadway's second review, M-03).
 *
 * Uploaded files are checked by what they are (their first bytes), their size, a PDF's end marker, and since this phase
 * for macros and scripts (src/modules/claims/documents/upload-handler.ts, activeContent). None of that is a virus scan.
 * Which scanning service to use is THE DEVELOPER's choice, as they host the live website (Lakhbir's reply to ITRoadway,
 * 16 Nov 2026), and the data protection officer approves it before any file is sent to it. So this is the port and
 * nothing behind it:
 *
 *   UPLOAD_SCANNING.enabled false and service null, as shipped: no scanner, and an upload goes on exactly as before.
 *   A scanner given (an adapter the developer writes, which reaches its service through ./http.ts like every connector,
 *   or a test's fake on App.scanner): every upload is sent to it BEFORE it is stored. FOUND refuses the file; FAILED
 *   refuses it too (switched on, a scanner that cannot answer must not let a file through); CLEAN goes on.
 *   enabled true and no adapter given: every upload is refused as FAILED, so switching it on without wiring it is seen
 *   at once and never reads as "scanned".
 * The verdict is written to the audit log by kind only (src/modules/claims/uploads.ts, acceptClientBytes).
 */

/** What a scanner says about one file. */
export type ScanVerdict =
  | { readonly result: 'CLEAN' }
  | { readonly result: 'FOUND' }
  | { readonly result: 'FAILED' };

/** A scanning service, behind one call. */
export type UploadScanner = {
  /** The service's name, for the Connections page and the audit row. */
  readonly service: string;
  scan(bytes: Uint8Array): Promise<ScanVerdict>;
};

/** The switch. Off, with no service named, until the developer chooses one and the DPO approves it. */
export const UPLOAD_SCANNING = Object.freeze({
  enabled: false,
  service: null as string | null,
  waits_on: 'the developer choosing a scanning service for the live website, and the data protection officer approving it',
});

/** A scanner that refuses everything: what an upload meets if the switch is on and no adapter was given. */
const NOT_WIRED: UploadScanner = Object.freeze({
  service: 'not wired',
  scan: async (): Promise<ScanVerdict> => ({ result: 'FAILED' }),
});

/**
 * The scanner an upload is sent to, or null for none. `given` is the adapter on the App (App.scanner): absent, and the
 * switch off, there is none.
 */
export function uploadScannerFor(given: UploadScanner | undefined, switches: { readonly enabled: boolean } = UPLOAD_SCANNING): UploadScanner | null {
  if (given !== undefined) return given;
  return switches.enabled ? NOT_WIRED : null;
}

/** What a person reads when the scanner refuses a file. */
export const SCAN_REFUSED: Readonly<Record<'FOUND' | 'FAILED', string>> = Object.freeze({
  FOUND: 'Our virus check found a problem in that file, so we have not taken it. Check the file on your computer, then send a clean copy.',
  FAILED: 'We could not check that file for viruses just now, so we have not taken it. Please try again in a few minutes.',
});
