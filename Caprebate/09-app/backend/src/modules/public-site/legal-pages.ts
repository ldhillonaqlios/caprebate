/**
 * THE WEBSITE'S LEGAL PAGES, AND THE COOKIE BANNER; PHASE 161g.
 *
 * The owner: "draft up some T&C, Policy docs, Cookies (add a cookie consent banner), Privacy policy, all the
 * usual things you see on the website". The public notices are Phases 160f and 160g (src/modules/public-site/notices-site.ts). This
 * file holds everything else: the website terms of use, the client's portal terms and the privacy policy (Phase 161g,
 * src/modules/public-site/privacy-policy.ts), the cookie policy, acceptable use, the accessibility statement and the disclaimer, each a
 * DRAFT for our solicitor and our data protection officer (FOR THE SOLICITOR, DPO AND DEVELOPER), and the banner.
 *
 * WHERE THEY ARE SERVED. On the test website (the `notices` switch, which api/index.mjs alone passes), and
 * wherever the new `legal` setting is on (CAPREBATE_LEGAL_PAGES=on, for the live website once its checklist is done).
 * Anywhere else their addresses say they are being prepared, as before.
 *
 * DRAFT UNTIL APPROVED. Each page has a VERSION (its date). It carries the Draft line until BOTH our
 * solicitor and our data protection officer have an approval of that version recorded (legal_approvals, migration 121;
 * src/modules/compliance/legal-approvals.ts). A new version is a draft again.
 *
 * A FACT WE DO NOT HAVE IS NEVER MADE UP. It is written as "to be added" and listed in LEGAL_GAPS.
 *
 * ONE COOKIE CHOICE: THIS BANNER. It needs no script: a form with two buttons of the same size and style,
 * in the same place, "Accept all" and "Reject non-essential". The answer is kept in one cookie (`cb_cookies`, strictly
 * necessary: it only remembers the answer) for twelve months. No answer is "no". Google Analytics, the only optional
 * thing the website could load, loads only after a CLICK on "Accept all" (here or on the cookie policy page):
 * `optionalAllowed` is the only gate, and the site page is given its measurement id only when it says yes
 * (src/core/router.ts, the home route). The site page's own question (SITE_CONSENT) no longer asks: it reads the answer.
 *
 * THE COOKIE LIST IS TESTED, NOT TYPED: test/public-site/cookie-and-privacy-pages.test.ts collects every cookie name the app can set and every
 * browser storage key a page it serves writes, and fails unless COOKIE_LIST has each, and on a line for one that is gone.
 */
import type { IncomingMessage } from 'node:http';
import { h, raw, page, type Safe } from '../../shared/index.ts';
import { COMPANY, COMPANY_NUMBER, OFFICE, CONTACT, DP_MAIL, SECURITY, mail, LATER, privacyPolicyBody, portalTermsBody } from './privacy-policy.ts';

/** The cookie that keeps the visitor's answer, and how long it is kept. */
export const CONSENT_COOKIE = 'cb_cookies';
export const CONSENT_MAX_AGE = 365 * 24 * 60 * 60;
export type ConsentChoice = 'all' | 'essential';

/** Facts these pages need that nobody has given us yet. Each is shown on the page as "to be added". */
export const LEGAL_GAPS: readonly (readonly [fact: string, where: string])[] = Object.freeze([
  ['Our registration number with the Information Commissioner (we have not registered yet)', 'Website terms of use, Privacy policy'],
  ['A telephone number (we answer by email only for now), or a decision not to have one', 'Three pages: the terms, accessibility, privacy'],
  ['Our data protection officer’s name and how to reach them', 'Privacy policy'],
  ['Whether the law makes us check who our clients are', 'Privacy policy'],
  ['Where the live website’s hosting company, database and document store keep data', 'Privacy policy'],
  ['The safeguard for each outside service that may hold data outside the UK', 'Privacy policy'],
]);

/** The legal pages: address, title, key (as legal_approvals names it) and version (the date it last changed). */
export const LEGAL_PAGES: readonly (readonly [path: string, title: string, key: LegalPageKey, version: string])[] = Object.freeze([
  ['/terms/', 'Website terms of use', 'terms', '2026-11-05'],
  ['/portal-terms/', 'Client portal terms', 'portal-terms', '2026-11-05'],
  ['/privacy-policy/', 'Privacy policy', 'privacy-policy', '2026-11-05'],
  ['/cookies/', 'Cookie policy', 'cookies', '2026-11-05'],
  ['/acceptable-use/', 'Acceptable use', 'acceptable-use', '2026-10-20'],
  ['/accessibility/', 'Accessibility statement', 'accessibility', '2026-10-20'],
  ['/disclaimer/', 'Disclaimer', 'disclaimer', '2026-10-20'],
]);
export type LegalPageKey = 'terms' | 'portal-terms' | 'privacy-policy' | 'cookies' | 'acceptable-use' | 'accessibility' | 'disclaimer' | 'notices';
/** The public notices page's version (src/modules/public-site/notices-site.ts serves it; 03-app/caprebate-notices-page.html is its text). */
export const NOTICES_VERSION = '2026-11-05';
export const versionOf = (key: LegalPageKey): string => key === 'notices' ? NOTICES_VERSION : LEGAL_PAGES.find((p) => p[2] === key)?.[3] ?? '';

/** Who has approved the current version of a page: the solicitor, the data protection officer, or both. */
export type PageApproval = { readonly solicitor: { by: string; on: string } | null; readonly dpo: { by: string; on: string } | null };
export type Approvals = ReadonlyMap<LegalPageKey, PageApproval>;
export const NO_APPROVALS: Approvals = new Map();
export const inForce = (a: PageApproval | undefined): boolean => a !== undefined && a.solicitor !== null && a.dpo !== null;

const DRAFTED = '20 October 2026';
const ukDay = (iso: string): string => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y ?? 0, (m ?? 1) - 1, d ?? 1)).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
};

/** The line at the top of a page: Draft until both approvals of this version are recorded; then when it took effect. */
export function draftLine(key: LegalPageKey, a: PageApproval | undefined): Safe {
  const version = ukDay(versionOf(key));
  if (inForce(a)) {
    return h`<p class="in-force-note" role="note">In force. This version, of ${version}, was approved by our solicitor on
      ${ukDay(a!.solicitor!.on)} and our data protection officer on ${ukDay(a!.dpo!.on)}.</p>`;
  }
  const one = a?.solicitor ? `Our solicitor approved it on ${ukDay(a.solicitor.on)}. ` : a?.dpo ? `Our data protection officer approved it on ${ukDay(a.dpo.on)}. ` : '';
  return h`<p class="draft-note" role="note"><strong>Draft.</strong> Our solicitor and our data protection officer
  have not yet both checked this page, so it is not yet in force. ${one}This version is of ${version}.</p>`;
}

function legalPage(key: LegalPageKey, title: string, body: Safe, approvals: Approvals): string {
  return page({ title, body: h`<article class="legal"><h1>${title}</h1>${draftLine(key, approvals.get(key))}${body}
    <p class="legal-more">Our other pages: ${raw(LEGAL_PAGES.filter(([, t]) => t !== title)
      .map(([p, t]) => h`<a href="${p}">${t}</a>`.html).join(' · '))} · <a href="/notices/">Public notices</a></p></article>` });
}

/* ------------------------------------------------------------------ *
 * WEBSITE TERMS OF USE
 * ------------------------------------------------------------------ */
function termsBody(): Safe {
  return h`
  <h2>Who we are</h2>
  <p>This website is run by ${COMPANY}, trading as Cap Rebate. We are a company registered in England and Wales,
  number ${COMPANY_NUMBER}. Our registered office is ${OFFICE}.</p>
  <p>You can reach us by email at ${mail(CONTACT)}. Our telephone number: ${LATER}.
  Our registration number with the Information Commissioner: ${LATER}.</p>

  <h2>What these terms cover</h2>
  <p>These terms are about using this website. By using it, you agree to them. If you do not agree, please do not use
  the website.</p>
  <p>If we do work for you, that work is covered by the engagement letter you sign with us, not by these terms. If the
  two ever say different things, the engagement letter wins. Our <a href="/portal-terms/">client portal terms</a>
  also apply when you use our client portal.</p>

  <h2>Our free estimate</h2>
  <p>The figure our free assessment shows is an estimate. It is worked out from your answers and from public records.
  It is not tax advice, and it is not a promise of any amount. The figure for a real claim comes from a chartered
  surveyor's survey, and a tax adviser checks how it is filed. Please read our <a href="/disclaimer/">disclaimer</a>.</p>

  <h2>Your account</h2>
  <p>If we give you a login, keep your password and your second sign-in step to yourself. Tell us at once at
  ${mail(SECURITY)} if you think someone else has used your account. You are responsible for what is done
  through your login until you tell us.</p>

  <h2>Using the website properly</h2>
  <p>You must use the website lawfully and as our <a href="/acceptable-use/">acceptable use policy</a> says.</p>

  <h2>Our content</h2>
  <p>We own the words, design and software of this website, or we have the right to use them. You may read and print
  pages for your own business. You may not copy, sell or reuse our content in any other way without our written
  agreement.</p>

  <h2>Links to other websites</h2>
  <p>We link to some public registers and other websites. We do not control them and we are not responsible for what
  they say or do.</p>

  <h2>If the website is not available</h2>
  <p>We work to keep the website running, but we cannot promise it will always be available or free of faults. We may
  change it, pause it or close parts of it.</p>

  <h2>Our responsibility to you</h2>
  <p>You should not rely on the website's general information or its estimate alone. We are not responsible for loss
  that comes from doing so. We are not responsible for lost profit or business, or for indirect loss.</p>
  <p>Some things the law does not let us limit. These include death or injury caused by our negligence, and fraud.
  Nothing in these terms limits them.</p>

  <h2>Your information</h2>
  <p>How we use your details is set out in our <a href="/privacy-policy/">privacy policy</a>. How we use cookies is set
  out in our <a href="/cookies/">cookie policy</a>.</p>

  <h2>Changes to these terms</h2>
  <p>We may change these terms. The version on this page is the one that applies when you use the website. The date
  at the top says when it last changed.</p>

  <h2>The law that applies</h2>
  <p>These terms are governed by the law of England and Wales. Any dispute about them will be dealt with by the courts
  of England and Wales.</p>`;
}

/* ------------------------------------------------------------------ *
 * COOKIE POLICY, WITH THE PLACE TO CHANGE THE ANSWER
 * ------------------------------------------------------------------ */

/** Every cookie, and every note in the browser's own storage, that the app or a page it serves can set. */
export type CookieLine = {
  readonly name: string;
  readonly kind: 'cookie' | 'browser storage';
  readonly optional: boolean;
  readonly why: string;
  readonly howLong: string;
  readonly where: string;
};
export const COOKIE_LIST: readonly CookieLine[] = Object.freeze([
  { name: 'cb_session', kind: 'cookie', optional: false, why: 'Keeps you signed in after you log in.', howLong: 'Up to 8 hours, or until you sign out', where: 'The client portal and the back office' },
  { name: 'cb_step', kind: 'cookie', optional: false, why: 'Remembers that you entered your password, while you finish your second sign-in step.', howLong: '15 minutes', where: 'Signing in' },
  { name: 'cb_draft', kind: 'cookie', optional: false, why: 'Keeps your answers while you fill in our free assessment, so you do not lose them.', howLong: '6 hours', where: 'The free assessment' },
  { name: CONSENT_COOKIE, kind: 'cookie', optional: false, why: 'Remembers your answer to our cookie question, so we do not ask on every page.', howLong: '12 months', where: 'Every page' },
  { name: '_ga', kind: 'cookie', optional: true, why: 'Set by Google Analytics, only after you press “Accept all”, to tell one visit from the next.', howLong: '2 years', where: 'Our older home page only, and only while Google Analytics is switched on (it is off today)' },
  { name: '_ga_<id>', kind: 'cookie', optional: true, why: 'Set by Google Analytics with the one above, to keep the count for our website.', howLong: '2 years', where: 'As above' },
  { name: 'caprebate-whatsapp', kind: 'browser storage', optional: false, why: 'Holds a WhatsApp chat a member of our team has chosen to add to a client’s record, between two steps of adding it.', howLong: 'Until it is added, then deleted', where: 'Our back office only, on our team’s computers' },
]);

function cookiesBody(choice: ConsentChoice | null, saved: boolean, analytics: boolean): Safe {
  const row = (c: CookieLine): Safe => h`<tr><td><code>${c.name}</code></td><td>${c.why}</td><td>${c.howLong}</td><td>${c.where}</td></tr>`;
  return h`
  <h2>What cookies are</h2>
  <p>A cookie is a small file a website keeps in your browser. Some are needed for the website to work. Others are
  optional, and we may only use those if you say yes.</p>

  <h2>The cookies we need</h2>
  <p>These are needed for the website to work, so we do not ask before using them. We use them only on this website,
  and none of them tracks you on other websites.</p>
  <div class="tablewrap"><table>
    <thead><tr><th>Name</th><th>What it does</th><th>How long it lasts</th><th>Where</th></tr></thead>
    <tbody>${COOKIE_LIST.filter((c) => !c.optional).map(row)}</tbody>
  </table></div>

  <h2>Optional cookies, only after you say yes</h2>
  <p>${analytics ? 'We use Google Analytics to count how people use our free assessment.'
    : 'We could use Google Analytics to count how people use our free assessment. It is switched off today.'}
  Nothing of Google's loads, and nothing is sent to Google, until you press "Accept all". A page view, scrolling or an
  earlier visit is never a yes. If you do not answer, the answer is no.</p>
  <div class="tablewrap"><table>
    <thead><tr><th>Name</th><th>What it does</th><th>How long it lasts</th><th>Where</th></tr></thead>
    <tbody>${COOKIE_LIST.filter((c) => c.optional).map(row)}</tbody>
  </table></div>
  <p>We never use Google Analytics in our client portal. Our <a href="/privacy-policy/">privacy policy</a> says what
  is sent to Google and where it is held.</p>

  <h2>Other companies on some pages</h2>
  <ul>
    <li><strong>Cloudflare</strong> checks that a person, not a robot, is sending our contact form. It runs only on the
    page with the form. Cloudflare's own privacy policy says what it collects.</li>
    <li><strong>Zoom</strong> runs a video call in your browser if you join one with us. Zoom may store its own
    information in your browser for the call. You can join in the Zoom app instead.</li>
  </ul>

  <h2 id="choice">Your answer</h2>
  ${saved ? h`<p class="saved" role="status">Thank you. Your answer is saved.</p>` : raw('')}
  <p>${choice === 'all' ? 'You have accepted all cookies.' : choice === 'essential'
    ? 'You have rejected non-essential cookies.' : 'You have not answered yet, so the answer is no.'}
  You can change your answer here at any time. "Accept all" turns Google Analytics on for you, if we use it. "Reject
  non-essential" turns it off and stops it at once.</p>
  ${choiceForm('/cookies/#choice')}

  <h2>Removing cookies yourself</h2>
  <p>Your browser's settings let you see and delete cookies. If you delete ours, you will be signed out and asked about
  cookies again.</p>

  <h2>Questions</h2>
  <p>Email us at ${mail(DP_MAIL)}.</p>`;
}

/* ------------------------------------------------------------------ *
 * ACCEPTABLE USE
 * ------------------------------------------------------------------ */
function acceptableUseBody(): Safe {
  return h`
  <p>This policy sets out what you may not do on our website. It is part of our <a href="/terms/">website terms of
  use</a>.</p>
  <h2>You must not</h2>
  <ul>
    <li>use the website for anything unlawful or fraudulent;</li>
    <li>give false details, or pretend to be someone else or another business;</li>
    <li>upload information about other people unless you have the right to share it with us;</li>
    <li>upload anything that contains a virus or other harmful code;</li>
    <li>try to get into parts of the website, accounts or systems you are not allowed into;</li>
    <li>copy or collect the website's content in bulk, by a program or otherwise;</li>
    <li>put the website under heavy load, or try to stop it working for others;</li>
    <li>send us abusive, threatening or offensive messages.</li>
  </ul>
  <h2>If you find a security problem</h2>
  <p>Please tell us at ${mail(SECURITY)} and do not test it further. Keep it private while we fix it. We will not take
  action against anyone who reports a problem honestly.</p>
  <h2>If this policy is broken</h2>
  <p>We may stop your access to the website and remove what you uploaded. We may also tell the police or another
  authority, where the law lets us or says we must.</p>`;
}

/* ------------------------------------------------------------------ *
 * ACCESSIBILITY STATEMENT
 * ------------------------------------------------------------------ */
function accessibilityBody(): Safe {
  return h`
  <p>We want everyone to be able to use our website. That includes people who use a screen reader, a keyboard only,
  or larger text.</p>
  <h2>What we aim for</h2>
  <p>We aim to meet the Web Content Accessibility Guidelines (WCAG) 2.2 at level AA.</p>
  <h2>What we already do</h2>
  <ul>
    <li>Words and their backgrounds have strong contrast, checked by our tests on every change.</li>
    <li>Every page has a link to skip straight to its content, and works with a keyboard.</li>
    <li>Our forms work without scripts, and each field says when it must be filled in.</li>
    <li>Text is never smaller than 12 points, and we write in plain English.</li>
    <li>Moving pictures on our home page stop if your device asks for less motion.</li>
  </ul>
  <h2>What we know is not yet right</h2>
  <ul>
    <li>An independent expert has not yet tested the website.</li>
    <li>The PDF copies of our survey report and engagement letter may not read well with a screen reader. Ask us and we
    will send the same information in another form.</li>
    <li>Video calls use Zoom, which has its own accessibility features and limits.</li>
  </ul>
  <h2>Ask us for help</h2>
  <p>If something does not work for you, email ${mail(CONTACT)}. Tell us the page and what went wrong. Telephone:
  ${LATER}. We will reply within five working days.</p>
  <h2>If you are not happy with our answer</h2>
  <p>You can contact the Equality Advisory and Support Service (EASS) for advice.</p>
  <p>This statement was prepared on ${DRAFTED}.</p>`;
}

/* ------------------------------------------------------------------ *
 * DISCLAIMER
 * ------------------------------------------------------------------ */
function disclaimerBody(): Safe {
  return h`
  <h2>Our estimate is not tax advice</h2>
  <p>The figure our free assessment shows is an estimate. We work it out from your answers and from public records. It
  can be wrong, and it is not tax, legal or financial advice. Please do not make a decision on it alone.</p>
  <h2>Where a real figure comes from</h2>
  <p>A claim's figure comes from a chartered surveyor's survey of the building. A tax adviser, yours or ours, checks how
  it goes into a tax return. HMRC decides whether a claim is accepted, and we cannot promise any result.</p>
  <h2>Information from public registers</h2>
  <p>Some information on our website comes from public registers, such as Companies House and HM Land Registry. We do
  not control those registers, and they can be out of date.</p>
  <h2>General information</h2>
  <p>The guides on our website explain capital allowances in general. Tax rules change, and every building and business
  is different. Please ask us or your own adviser about your case.</p>`;
}

/* ------------------------------------------------------------------ *
 * THE BANNER AND THE ANSWER
 * ------------------------------------------------------------------ */

/** The two buttons, the same size and style, side by side in the same place, and where to come back to. */
function choiceForm(back: string): Safe {
  return h`<form class="cookie-choice" method="post" action="/cookies/choice">
    <input type="hidden" name="back" value="${back}">
    <button type="submit" name="choice" value="all" class="cookie-btn">Accept all</button>
    <button type="submit" name="choice" value="essential" class="cookie-btn">Reject non-essential</button>
  </form>`;
}

/**
 * The banner, put at the foot of a public page for a visitor who has not answered. No script. `analytics` says
 * whether Google Analytics is switched on (a measurement id is set), so the banner says what "Accept all" would do.
 */
export function cookieBanner(back: string, analytics = false): string {
  return h`<link rel="stylesheet" href="/assets/cookie-banner.css"><section class="cookie-banner" aria-label="Cookies">
    <p><strong>Cookies.</strong> ${analytics
      ? 'We use the cookies our website needs to work. With your yes, we also use Google Analytics to count visits. Nothing of Google’s loads unless you press “Accept all”.'
      : 'We use only the cookies our website needs to work. We would only add optional cookies if you say yes.'}
    <a href="/cookies/">Read our cookie policy</a>.</p>
    ${choiceForm(back)}
  </section>`.html;
}

/** The banner's own styles, a file of its own so it looks the same on every page it is put on. */
export const COOKIE_BANNER_CSS = `
.cookie-banner{position:fixed;left:16px;right:16px;bottom:16px;z-index:1000;max-width:56rem;margin:0 auto;background:#121614;color:#EDEAE2;border:1px solid #2d3532;border-radius:16px;padding:16px 20px;box-shadow:0 8px 32px rgba(0,0,0,.35);font:16px/1.5 Calibri,"Segoe UI",Helvetica,Arial,sans-serif;display:flex;flex-wrap:wrap;align-items:center;gap:12px 20px}
.cookie-banner p{margin:0;flex:1 1 22rem;color:#EDEAE2}
.cookie-banner a{color:#ABEDD8}
.cookie-choice{display:flex;flex-wrap:wrap;gap:10px;margin:0}
.cookie-btn{min-height:44px;padding:0 20px;border-radius:999px;border:1px solid #ABEDD8;background:#ABEDD8;color:#111111;font:inherit;font-weight:700;cursor:pointer}
.cookie-btn:hover{background:#c4f3e3;border-color:#c4f3e3}
.cookie-btn:focus-visible{outline:3px solid #EDEAE2;outline-offset:2px}
.legal .cookie-choice{margin:.5rem 0 1rem}
`;

/** The visitor's recorded answer, if any. */
export function consentChoice(cookieValue: string | undefined): ConsentChoice | null {
  return cookieValue === 'all' || cookieValue === 'essential' ? cookieValue : null;
}

/** Whether an optional cookie or tag may load. Only after "Accept all": no answer, and any other answer, is no. */
export function optionalAllowed(req: IncomingMessage, read: (req: IncomingMessage, name: string) => string | undefined): boolean {
  return consentChoice(read(req, CONSENT_COOKIE)) === 'all';
}

/** The answer's cookie: strictly necessary (it only remembers the answer), first-party, twelve months. */
export function consentSetCookie(choice: ConsentChoice): string {
  return `${CONSENT_COOKIE}=${choice}; Max-Age=${String(CONSENT_MAX_AGE)}; Path=/; HttpOnly; Secure; SameSite=Lax`;
}

/** Where to go back to after answering: one of our own pages, never another website. */
export function safeBack(back: string | null): string {
  if (back === null || !/^\/(?!\/)[^\s\\]*$/.test(back)) return '/';
  return back;
}

/** Whether a public page should carry the banner: a visitor (not signed in) who has not answered, on a page of ours. */
export function wantsBanner(path: string, signedIn: boolean, choice: ConsentChoice | null): boolean {
  if (signedIn || choice !== null) return false;
  return !/^\/(staff|portal|assets|signoff|accountant|cookies\/choice)(\/|$)/.test(path);
}

export type LegalRender = { readonly approvals?: Approvals; readonly analytics?: boolean };

/** A legal page by its address, or undefined. `choice` and `saved` only matter to the cookie policy. */
export function legalPageHtml(path: string, choice: ConsentChoice | null, saved = false, r: LegalRender = {}): string | undefined {
  const p = path.endsWith('/') ? path : `${path}/`;
  const approvals = r.approvals ?? NO_APPROVALS;
  const entry = LEGAL_PAGES.find(([at]) => at === p);
  if (entry === undefined) return undefined;
  const [, title, key, version] = entry;
  const body = ((): Safe => {
    switch (key) {
      case 'terms': return termsBody();
      case 'portal-terms': return portalTermsBody(ukDay(version));
      case 'privacy-policy': return privacyPolicyBody(ukDay(version));
      case 'cookies': return cookiesBody(choice, saved, r.analytics === true);
      case 'acceptable-use': return acceptableUseBody();
      case 'accessibility': return accessibilityBody();
      case 'disclaimer': return disclaimerBody();
      default: return h``;
    }
  })();
  return legalPage(key, title, body, approvals);
}

/** The words a link to the three documents a client agrees to: used by the agreement page and the letter page. */
export function agreementLinks(): Safe {
  return h`our <a href="/portal-terms/">client portal terms</a>, our <a href="/terms/">website terms of use</a> and our
    <a href="/privacy-policy/">privacy policy</a>`;
}
