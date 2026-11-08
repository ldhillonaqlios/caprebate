/**
 * THE PUBLIC SITE'S FRONT DOOR: the home page, the sector pages, the legal pages and the enquiry form. Another area imports this module only from here (09-app/ARCHITECTURE.md rule 1).
 * Generated from the imports other areas made on the day the module moved, and kept by hand since: add a name here when
 * another area needs it, never a whole file.
 */
// Files that reach no other business module load first, so a loop back through a front door finds them ready.
export { insertEnquiryChecks, insertEnquiryChecks2 } from './data.ts';
export { fontFile, gsapScript, HOME_PAGE_HEADERS, homeEdition, isSectorSlug, sectorEdition } from './home-site.ts';
export { SITE_JS_HEADERS, SITE_PAGE_CSP, SITE_PAGE_HEADERS, siteEdition } from './public-site.ts';
export { agreementLinks, CONSENT_COOKIE, consentChoice, consentSetCookie, COOKIE_BANNER_CSS, cookieBanner, draftLine, inForce, LEGAL_PAGES, legalPageHtml, NOTICES_VERSION, optionalAllowed, safeBack, versionOf, wantsBanner } from './legal-pages.ts';
export * as enquiriesModule from './enquiries.ts';
export { PROPERTY_TYPES, receiveEnquiry } from './enquiries.ts';
export { ENQUIRY_RETENTION, sweepEnquiries } from './enquiry-retention.ts';
export { adminRow, homeRows, jobsRow, leadsRows, moneyRow, pipelineRow, todayItems, todayRow } from './home.ts';
export { logFormComplaint, noticesEdition, noticesForLiveSite, receiveComplaintForm, waitingForms } from './notices-site.ts';
export type { Approvals, LegalPageKey, PageApproval } from './legal-pages.ts';
export type { EnquiryRow } from './enquiries.ts';
export type { WaitingForm } from './notices-site.ts';
