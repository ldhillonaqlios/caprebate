/**
 * GOOGLE ANALYTICS ON THE PUBLIC WEBSITE — THE CONFIGURATION SIDE. Phase 146f, 22 September 2026.
 *
 * The wrapper, the ten call sites and the cookie choice are in `Caprebate site.html` (CB_TRACK and SITE_CONSENT).
 * This file is the back end's half: it reads the measurement id from the key file (GA4_MEASUREMENT_ID, owner
 * GOOGLE_ANALYTICS — public by design, it is printed in the page) and says which Google addresses the served page's
 * content policy must allow once an id is set. With no id, nothing changes: the page carries an empty id, shows no
 * cookie choice and loads nothing, and its policy allows only its own address.
 *
 * WHY THIS FILE IS NOT IN src/web/. The analytics allow-list check (03-app/caprebate-analytics-allowlist-check.cjs)
 * scans every src/web/*.ts view and fails on any mention of Google's tag, because no view may load one. A content
 * policy line naming Google's addresses loads nothing — it only permits what SITE_CONSENT loads after the visitor
 * says yes, and only on the public home page. It lives here so that check keeps meaning exactly what it says.
 */

import { processSecrets, type SecretStore } from './secrets.ts';

/** The measurement id from the key file, or null. Only G- followed by capitals and digits is accepted. */
export function ga4MeasurementId(store: SecretStore = processSecrets()): string | null {
  const v = (store.forOwner('GOOGLE_ANALYTICS').get('GA4_MEASUREMENT_ID') ?? '').trim();
  return /^G-[A-Z0-9]{4,20}$/.test(v) ? v : null;
}

/** What Google's own guidance lists for GA4 under a content security policy (checked 22 September 2026). */
export const ANALYTICS_CSP = Object.freeze({
  script: 'https://www.googletagmanager.com',
  connect: 'https://*.google-analytics.com https://*.analytics.google.com https://www.googletagmanager.com',
  img: 'https://*.google-analytics.com https://www.googletagmanager.com',
});

/** The public page's policy, widened for analytics only when an id is configured. */
export function sitePolicy(base: string, id: string | null): string {
  if (id === null) return base;
  return base
    .replace("script-src 'self'", `script-src 'self' ${ANALYTICS_CSP.script}`)
    .replace("img-src 'self' data:", `img-src 'self' data: ${ANALYTICS_CSP.img}`)
    .replace("default-src 'none';", `default-src 'none'; connect-src 'self' ${ANALYTICS_CSP.connect};`);
}

/** The page with its measurement id filled in. The file itself always carries an empty one. */
export function withMeasurementId(html: string, id: string | null): string {
  if (id === null) return html;
  return html.replace('<meta name="cb-ga4-measurement-id" content="">', `<meta name="cb-ga4-measurement-id" content="${id}">`);
}
