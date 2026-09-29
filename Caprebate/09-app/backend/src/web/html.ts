/**
 * HTML output. THE ONLY PLACE MARKUP IS BUILT.
 *
 * The security baseline says: escape on output, never build HTML by
 * concatenation, no innerHTML with anything a user supplied, and a
 * Content-Security-Policy with no unsafe-inline. Those are four statements of
 * the same rule, and this file is where it is kept.
 *
 * `h` IS A TAGGED TEMPLATE AND THAT IS THE WHOLE DESIGN. Every interpolated
 * value is escaped unless it is already a Safe value, and the only way to make
 * a Safe value is to build it with `h` or to pass literal markup through `raw`,
 * which is greppable. So "did somebody concatenate user input into markup" is a
 * question with a mechanical answer instead of a code review.
 *
 * NO INLINE SCRIPT OR STYLE ANYWHERE. The CSP forbids both, and the pages are
 * server-rendered and work with JavaScript disabled — which is also acceptance
 * test 7 of the public notices page, and the same discipline applies here.
 */

import { ukDatesInMarkup } from './localtime.ts';
import { requiredWordsInMarkup } from './required.ts';

const ESCAPES: Readonly<Record<string, string>> = Object.freeze({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
});

export function escapeHtml(value: unknown): string {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ESCAPES[c] ?? c);
}

/** Markup that is already safe. The type exists so `h` can tell the difference. */
export class Safe {
  readonly #html: string;
  constructor(html: string) { this.#html = html; }
  toString(): string { return this.#html; }
  get html(): string { return this.#html; }
}

/**
 * Literal markup, by hand. GREP FOR `raw(` TO REVIEW EVERY EXCEPTION.
 * It must never be called with anything that came from a request.
 */
export function raw(html: string): Safe { return new Safe(html); }

export function h(strings: TemplateStringsArray, ...values: unknown[]): Safe {
  let out = strings[0] ?? '';
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    out += renderValue(v);
    out += strings[i + 1] ?? '';
  }
  return new Safe(out);
}

function renderValue(v: unknown): string {
  if (v instanceof Safe) return v.html;
  if (Array.isArray(v)) return v.map(renderValue).join('');
  if (v === null || v === undefined || v === false) return '';
  return escapeHtml(v);
}

/**
 * The page shell.
 *
 * The stylesheet is served from /assets/site.css rather than inlined, because
 * the CSP has no `unsafe-inline` and a style attribute is the first thing that
 * quietly reintroduces it.
 *
 * `wide` WIDENS THE COLUMN, and it is a class rather than a style attribute for
 * that same reason. The public site reads best at 46rem — a measure a person
 * can follow down a page of prose. A back-office table of six columns does not:
 * at 46rem every business name wraps to four lines and the screen becomes
 * unreadable, which was visible the first time the assessments list was opened
 * in a browser rather than asserted about in a test.
 */
/** The home page's mark: a house whose body is a calculator (the supplied lockup's calculator, drawn as a building).
 *  Inline SVG, no style attribute: its animation and colours are in the stylesheet (body.public). */
export const PUBLIC_MARK =
  '<svg class="mark" viewBox="0 0 48 48" aria-hidden="true" focusable="false">' +
  '<path class="mk" pathLength="1" d="M14 43 H34 A4 4 0 0 0 38 39 V20.5 L24 8 L10 20.5 V39 A4 4 0 0 0 14 43 Z"/>' +
  '<rect class="mk-scr" x="16" y="20" width="16" height="5.5" rx="1.6"/>' +
  '<rect class="mk-key" x="16" y="29.5" width="4" height="4" rx="1"/><rect class="mk-key" x="22" y="29.5" width="4" height="4" rx="1"/>' +
  '<rect class="mk-key" x="28" y="29.5" width="4" height="4" rx="1"/><rect class="mk-key" x="16" y="35.5" width="4" height="4" rx="1"/>' +
  '<rect class="mk-key" x="22" y="35.5" width="4" height="4" rx="1"/><rect class="mk-key" x="28" y="35.5" width="4" height="4" rx="1"/></svg>';

export function page(opts: { title: string; body: Safe; nav?: Safe; wide?: boolean }): string {
  // PHASE 133a: a header that carries its own home (the back office's or the portal's) is drawn as the application
  // header — the name, the search, my open tasks, the user menu, then the tabs. Anything else is the public header.
  const shell = opts.nav !== undefined && 'home' in opts.nav && typeof (opts.nav as { home?: unknown }).home === 'string';
  const home = shell ? (opts.nav as unknown as { home: string }).home : '/';
  // PHASE 133c — THE CAP REBATE BRAND. The name a person reads is "Cap Rebate", two words (brand book slide 1). The
  // supplied mono-ink lockup is drawn at 120 px wide (the minimum is 100) on white, top-left, on every page that is not
  // the back office: the sign-in page, the public pages and the client portal. The back office shows the name in the
  // heading font, because the stacked lockup is illegible at the height of a working header and no horizontal lockup
  // or icon-only mark exists yet (slide 24). Phase 133a's invented "C" square is gone.
  // PHASE 133d (D1): every required field says "(required)" in words, put into its label here (src/web/required.ts).
  const staff = shell && home === '/staff';
  // 29 SEPTEMBER 2026: the public pages (the assessment, sign-in, the enquiry's thank-you) wear the new home page's
  // colours and its mark — the calculator drawn as a house, with the name beside it (Lakhbir: "when someone clicks am i
  // eligible it matches the colours of the new home page"). The client portal keeps the supplied lockup.
  const brand = !shell
    ? h`<a class="brandmark" href="/" aria-label="Cap Rebate, home">${raw(PUBLIC_MARK)}<span class="wm">Cap Rebate</span></a>`
    : staff
    ? h`<a class="brand" href="${home}">Cap Rebate</a>`
    : h`<a class="logo" href="${home}"><img src="/assets/cap-rebate-logo.png" alt="Cap Rebate — capital allowances simplified" width="120" height="81"></a>`;
  return (
    '<!doctype html>\n' +
    h`<html lang="en-GB"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${opts.title} · Cap Rebate</title>
<link rel="stylesheet" href="/assets/site.css">
</head><body class="${shell ? 'app' : 'public'}">
<a class="skip" href="#main">Skip to content</a>
<header class="top"><div class="topline">${brand}${opts.nav ?? raw('')}</div></header>
<main id="main" class="${opts.wide === true ? 'wide' : ''}">${raw(requiredWordsInMarkup(ukDatesInMarkup(opts.body.html)))}</main>
<footer class="foot">
  <p>Cap Rebate — capital allowances for healthcare property.</p>
  <p>Indicative technical reference, not tax advice. The defensible figure comes from a chartered surveyor’s survey and a
  CAA 2001 s.562 apportionment, with the filing position signed off by a tax adviser.</p>
  <p><a href="/notices/">Public notices</a> · <a href="/privacy/">Privacy</a></p>
  ${staff ? h`<p class="build">This is a test system. No payment is taken and no signature provider is connected.</p>` : raw('')}
</footer>
</body></html>`.html
  );
}

/** The security headers every HTML response carries. */
export const HTML_HEADERS: Readonly<Record<string, string>> = Object.freeze({
  'content-type': 'text/html; charset=utf-8',
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'no-referrer',
  'x-frame-options': 'DENY',
  // No unsafe-inline, no unsafe-eval, no remote origins. form-action self so a
  // stolen page cannot post the client's answers somewhere else.
  'content-security-policy':
    "default-src 'none'; style-src 'self'; img-src 'self' data:; " +
    "form-action 'self'; frame-ancestors 'none'; base-uri 'none'",
});
