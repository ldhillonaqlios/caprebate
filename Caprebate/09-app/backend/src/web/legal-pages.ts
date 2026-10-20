/**
 * THE WEBSITE'S OTHER LEGAL PAGES, AND THE COOKIE BANNER — PHASE 160h, 20 October 2026.
 *
 * Lakhbir: "draft up some T&C, Policy docs, Cookies (add a cookie consent banner), Privacy policy, all the usual things
 * you see on the website". The privacy notice and the public notices are Phases 160f and 160g (src/web/notices-site.ts).
 * This file holds everything else: the website terms of use, the cookie policy, acceptable use, the accessibility
 * statement and the disclaimer, each a DRAFT for our solicitor and our data protection officer (FOR THE SOLICITOR, DPO
 * AND DEVELOPER), and the banner that asks about cookies.
 *
 * SERVED ON THE TEST WEBSITE ONLY, with the notices (the same `notices` switch, which api/index.mjs alone passes).
 *
 * A FACT WE DO NOT HAVE IS NEVER MADE UP. It is written as "to be added" and listed in LEGAL_GAPS, so a test can show
 * every gap and Lakhbir has the list.
 *
 * THE BANNER NEEDS NO SCRIPT. It is a form with two buttons of the same size and style, "Accept all" and "Reject
 * non-essential". The answer is kept in one cookie (`cb_cookies`, which is itself strictly necessary: it only remembers
 * the answer) for twelve months. Today the website sets no optional cookie at all, so either answer changes nothing it
 * does; anything optional added later (Google Analytics, if it is ever switched on) must ask `optionalAllowed` first.
 */
import type { IncomingMessage } from 'node:http';
import { h, raw, page, type Safe } from './html.ts';

/** The cookie that keeps the visitor's answer, and how long it is kept. */
export const CONSENT_COOKIE = 'cb_cookies';
export const CONSENT_MAX_AGE = 365 * 24 * 60 * 60;
export type ConsentChoice = 'all' | 'essential';

/** Facts these pages need that nobody has given us yet. Each is shown on the page as "to be added". */
export const LEGAL_GAPS: readonly (readonly [fact: string, where: string])[] = Object.freeze([
  ['Our registration number with the Information Commissioner (we have not registered yet)', 'Website terms of use'],
  ['A telephone number (we answer by email only for now)', 'Website terms of use, Accessibility statement'],
]);

const COMPANY = 'CAP REBATE LTD';
const COMPANY_NUMBER = '17307313';
const OFFICE = '1st Floor, 1-9 Castle Street, Hinckley, LE10 1DA';
const CONTACT = 'contact@caprebate.co.uk';
const DP_MAIL = 'data.protection@caprebate.co.uk';
const SECURITY = 'security@caprebate.co.uk';
const DRAFTED = '20 October 2026';

/** The legal pages, by address. */
export const LEGAL_PAGES: readonly (readonly [path: string, title: string])[] = Object.freeze([
  ['/terms/', 'Website terms of use'],
  ['/cookies/', 'Cookie policy'],
  ['/acceptable-use/', 'Acceptable use'],
  ['/accessibility/', 'Accessibility statement'],
  ['/disclaimer/', 'Disclaimer'],
]);

const mail = (a: string): Safe => h`<a href="mailto:${a}">${a}</a>`;
const DRAFT_LINE = h`<p class="draft-note" role="note"><strong>Draft.</strong> Our solicitor and our data protection officer
  have not yet checked this page, so it is not yet in force. Drafted ${DRAFTED}.</p>`;
const LATER = h`<span class="gap">to be added</span>`;

function legalPage(title: string, body: Safe): string {
  return page({ title, body: h`<article class="legal"><h1>${title}</h1>${DRAFT_LINE}${body}
    <p class="legal-more">Our other pages: ${raw(LEGAL_PAGES.filter(([, t]) => t !== title)
      .map(([p, t]) => h`<a href="${p}">${t}</a>`.html).join(' · '))} · <a href="/notices/">Privacy and public notices</a></p></article>` });
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
  two ever say different things, the engagement letter wins.</p>

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
  <p>How we use your details is set out in our <a href="/notices/#privacy">privacy notice</a>. How we use cookies is set
  out in our <a href="/cookies/">cookie policy</a>.</p>

  <h2>Changes to these terms</h2>
  <p>We may change these terms. The version on this page is the one that applies when you use the website.</p>

  <h2>The law that applies</h2>
  <p>These terms are governed by the law of England and Wales. Any dispute about them will be dealt with by the courts
  of England and Wales.</p>`;
}

/* ------------------------------------------------------------------ *
 * COOKIE POLICY, WITH THE PLACE TO CHANGE THE ANSWER
 * ------------------------------------------------------------------ */
const COOKIES: readonly (readonly [name: string, why: string, howLong: string])[] = Object.freeze([
  ['cb_session', 'Keeps you signed in after you log in.', 'Up to 8 hours, or until you sign out'],
  ['cb_step', 'Remembers that you entered your password, while you finish your second sign-in step.', '15 minutes'],
  ['cb_draft', 'Keeps your answers while you fill in our free assessment, so you do not lose them.', '6 hours'],
  [CONSENT_COOKIE, 'Remembers your answer to our cookie question, so we do not ask on every page.', '12 months'],
]);

function cookiesBody(choice: ConsentChoice | null, saved: boolean): Safe {
  return h`
  <h2>What cookies are</h2>
  <p>A cookie is a small file a website keeps in your browser. Some are needed for the website to work. Others are
  optional, and we may only use those if you say yes.</p>

  <h2>The cookies we use</h2>
  <p>Every cookie we set today is one the website needs to work. We use them only on this website, and none of them
  tracks you on other websites.</p>
  <div class="tablewrap"><table>
    <thead><tr><th>Name</th><th>What it does</th><th>How long it lasts</th></tr></thead>
    <tbody>${COOKIES.map(([n, w, l]) => h`<tr><td><code>${n}</code></td><td>${w}</td><td>${l}</td></tr>`)}</tbody>
  </table></div>

  <h2>Optional cookies</h2>
  <p>We use none today. We may one day add Google Analytics, to count how people use our free assessment. It would
  only load after you press "Accept all". Our <a href="/notices/#cookies">public notices</a> say what we would use
  it for.</p>

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
    ? 'You have rejected non-essential cookies.' : 'You have not answered yet.'}
  You can change your answer here at any time.</p>
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

/** The two buttons, the same size and style, and where to come back to. */
function choiceForm(back: string): Safe {
  return h`<form class="cookie-choice" method="post" action="/cookies/choice">
    <input type="hidden" name="back" value="${back}">
    <button type="submit" name="choice" value="all" class="cookie-btn">Accept all</button>
    <button type="submit" name="choice" value="essential" class="cookie-btn">Reject non-essential</button>
  </form>`;
}

/** The banner, put at the foot of a public page for a visitor who has not answered. No script. */
export function cookieBanner(back: string): string {
  return h`<link rel="stylesheet" href="/assets/cookie-banner.css"><section class="cookie-banner" aria-label="Cookies">
    <p><strong>Cookies.</strong> We use only the cookies our website needs to work. We would only add optional
    cookies if you say yes. <a href="/cookies/">Read our cookie policy</a>.</p>
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

/** Whether an optional cookie or tag may load. Only after "Accept all". */
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

/** A legal page by its address, or undefined. `choice` and `saved` only matter to the cookie policy. */
export function legalPageHtml(path: string, choice: ConsentChoice | null, saved = false): string | undefined {
  const p = path.endsWith('/') ? path : `${path}/`;
  switch (p) {
    case '/terms/': return legalPage('Website terms of use', termsBody());
    case '/cookies/': return legalPage('Cookie policy', cookiesBody(choice, saved));
    case '/acceptable-use/': return legalPage('Acceptable use', acceptableUseBody());
    case '/accessibility/': return legalPage('Accessibility statement', accessibilityBody());
    case '/disclaimer/': return legalPage('Disclaimer', disclaimerBody());
    default: return undefined;
  }
}
