/**
 * THE LEGAL PAGES' REGISTER: each page's address, title, key and version, who must approve a version before it is in
 * force (the data protection officer alone, since Phase 161m1), the words that link the three documents a client
 * agrees to, and where to go back to after answering.
 *
 * Moved here from src/modules/public-site/legal-pages.ts (Phase 161l2). The approvals and the agreements
 * (src/modules/compliance/legal-approvals.ts) are counted against these versions, and compliance sits below the public
 * site and the portal, so the register is compliance's; the public site draws the pages from it and the portal links to
 * them, each through compliance's front door. It reads nothing but the shared parts, so it is ready before anything
 * that asks it. The values are unchanged.
 */
import { h, type Safe } from '../../shared/index.ts';

/** The legal pages: address, title, key (as legal_approvals names it) and version (the date it last changed). */
export const LEGAL_PAGES: readonly (readonly [path: string, title: string, key: LegalPageKey, version: string])[] = Object.freeze([
  ['/terms/', 'Website terms of use', 'terms', '2026-11-11'],
  ['/portal-terms/', 'Client portal terms', 'portal-terms', '2026-11-05'],
  ['/privacy-policy/', 'Privacy policy', 'privacy-policy', '2026-11-11'],
  ['/cookies/', 'Cookie policy', 'cookies', '2026-11-05'],
  ['/acceptable-use/', 'Acceptable use', 'acceptable-use', '2026-10-20'],
  ['/accessibility/', 'Accessibility statement', 'accessibility', '2026-11-11'],
  ['/disclaimer/', 'Disclaimer', 'disclaimer', '2026-10-20'],
]);
export type LegalPageKey = 'terms' | 'portal-terms' | 'privacy-policy' | 'cookies' | 'acceptable-use' | 'accessibility' | 'disclaimer' | 'notices';
/** The public notices page's version (src/modules/public-site/notices-site.ts serves it; 03-app/caprebate-notices-page.html is its text). */
export const NOTICES_VERSION = '2026-11-05';
export const versionOf = (key: LegalPageKey): string => key === 'notices' ? NOTICES_VERSION : LEGAL_PAGES.find((p) => p[2] === key)?.[3] ?? '';

/**
 * The data protection officer's approval of the current version of a page, if there is one.
 *
 * PHASE 161m1, Lakhbir, 11 Nov 2026: "no solicitor, its a DPO pack". The data protection officer ALONE approves the
 * legal pages: their approval of a page's current version puts it in force. Until then a page needed both a solicitor
 * and the DPO. The database is unchanged (legal_approvals, migration 121, still allows the role SOLICITOR, and nothing
 * already recorded is removed): a SOLICITOR approval recorded before this change is kept but no longer counts for
 * anything, and no new one can be recorded (src/modules/compliance/legal-approvals.ts).
 */
export type PageApproval = { readonly dpo: { by: string; on: string } | null };
export type Approvals = ReadonlyMap<LegalPageKey, PageApproval>;
export const NO_APPROVALS: Approvals = new Map();
export const inForce = (a: PageApproval | undefined): boolean => a !== undefined && a.dpo !== null;

/** Where to go back to after answering: one of our own pages, never another website. */
export function safeBack(back: string | null): string {
  if (back === null || !/^\/(?!\/)[^\s\\]*$/.test(back)) return '/';
  return back;
}

/** The words a link to the three documents a client agrees to: used by the agreement page and the letter page. */
export function agreementLinks(): Safe {
  return h`our <a href="/portal-terms/">client portal terms</a>, our <a href="/terms/">website terms of use</a> and our
    <a href="/privacy-policy/">privacy policy</a>`;
}
