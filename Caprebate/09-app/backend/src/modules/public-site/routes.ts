/**
 * THE PUBLIC SITE'S ADDRESSES: the legal pages and the notices, the home page, the sector pages and their files, and
 * the enquiry form. The router shell (src/app/router.ts) asks each function at the point where its addresses have
 * always been matched, so the order in which every address is tried is unchanged.
 */
import { clientIp, cookie, form, html, nav, redirect, type Actor, type WebRequest, type WebResult } from '../../core/index.ts';
import { CSS_HEADERS, HTML_HEADERS, h, localDate, page, registryGate, ukDate, why } from '../../shared/index.ts';
import { TURNSTILE_FIELD, checkTurnstile, ga4MeasurementId, refusalWords, sitePageFor, turnstileSiteKey, withSiteKey } from '../../integrations/index.ts';
import { receiveEnquiry } from './enquiries.ts';
import { HOME_PAGE_HEADERS, fontFile, gsapScript, homeEdition, isSectorSlug, sectorEdition } from './home-site.ts';
import { CONSENT_COOKIE, COOKIE_BANNER_CSS, consentChoice, consentSetCookie, draftLine, legalPageHtml, optionalAllowed } from './legal-pages.ts';
import { currentApprovals, safeBack } from '../compliance/index.ts';
import { noticesEdition, noticesForLiveSite, receiveComplaintForm } from './notices-site.ts';
import { SITE_JS_HEADERS, SITE_PAGE_CSP, SITE_PAGE_HEADERS, siteEdition } from './public-site.ts';

/** The legal pages, the notices, the home page, the sector pages and their files. */
export async function publicSiteRoutes(w: WebRequest): Promise<WebResult | undefined> {
  const { d, req, res, url, path, method, actor, newId, legalServed } = w;
  /* STRESS TEST: THE PRIVACY NOTICE AND THE PUBLIC NOTICES ARE NOT PUBLISHED YET (03-app's notices page is a
     draft with facts not set, and the privacy notice waits on the data protection officer), but every page links to them
     and the links answered 401. Until they are published, a page that says so and how to reach us - nothing more. */
  /* ON THE TEST WEBSITE, THE NOTICES PAGE ITSELF (src/modules/public-site/notices-site.ts) - a draft,
     its proposed facts marked - with its style as a file and its complaint form working. Anywhere else, as before. */
  if (legalServed) {
    /* The website's other legal pages, the banner's styles, and the answer (src/modules/public-site/legal-pages.ts).
       Also wherever the `legal` setting is on; each page says Draft until both approvals are recorded. */
    if (path === '/assets/cookie-banner.css' && method === 'GET') { res.writeHead(200, CSS_HEADERS); res.end(COOKIE_BANNER_CSS); return 'handled'; }
    if (path === '/cookies/choice' && method === 'POST') {
      const f = await form(req);
      const choice = f.get('choice');
      const back = safeBack(f.get('back'));
      if (choice !== 'all' && choice !== 'essential') { redirect(res, back); return 'handled'; }
      res.writeHead(303, { location: back.startsWith('/cookies/') ? '/cookies/?saved=1#choice' : back, 'set-cookie': consentSetCookie(choice), 'content-type': 'text/plain; charset=utf-8' });
      res.end('');
      return 'handled';
    }
    if (method === 'GET') {
      const legal = legalPageHtml(path, consentChoice(cookie(req, CONSENT_COOKIE)), url.searchParams.get('saved') === '1',
        { approvals: currentApprovals(d.app.db), analytics: ga4MeasurementId(d.app.secrets) !== null });
      if (legal !== undefined) {
        if (!path.endsWith('/')) { redirect(res, `${path}/`); return 'handled'; }
        html(res, 200, legal); return 'handled';
      }
    }
    if (path === '/assets/notices.css' && method === 'GET') {
      const ed = noticesEdition();
      if (ed !== undefined) { res.writeHead(200, CSS_HEADERS); res.end(ed.css); return 'handled'; }
    }
    // The privacy policy is its own page now; the notices page is for people who are not our clients.
    if ((path === '/privacy' || path === '/privacy/') && method === 'GET') { redirect(res, '/privacy-policy/'); return 'handled'; }
    if ((path === '/notices' || path === '/notices/') && method === 'GET') {
      const ed = noticesEdition();
      // On the live website (the `legal` setting without the test website's `notices`), its Draft line in place of the test banner.
      if (ed !== undefined) { res.writeHead(200, HTML_HEADERS); res.end(d.notices === true ? ed.html : noticesForLiveSite(ed.html, draftLine('notices', currentApprovals(d.app.db).get('notices')).html)); return 'handled'; }
    }
    if (path === '/notices/complaint' && method === 'POST') {
      const r = receiveComplaintForm(d.app, await form(req), clientIp(req), newId);
      if (!r.ok) { html(res, 400, page({ title: 'Complaint not sent', nav: nav(actor), body: h`<h1>Your complaint was not sent</h1><p role="alert">${r.why}</p><p><a href="/notices/#complaints">Back to the form</a></p>` })); return 'handled'; }
      html(res, 200, page({ title: 'Complaint received', nav: nav(actor), body: h`<h1>Thank you. We have your complaint.</h1>
        <p>It reached us on ${ukDate(localDate(r.received_at))}. Your reference is <strong>${r.ref}</strong>.</p>
        <p>Our data protection officer has been told. We will reply to you at the address you gave, acknowledge your complaint and tell you what happens next.</p>
        <p><a href="/notices/">Back to the public notices</a></p>` }));
      return 'handled';
    }
  }
  if ((path === '/privacy/' || path === '/privacy' || path === '/notices/' || path === '/notices') && method === 'GET') {
    html(res, 200, page({ title: 'Privacy and public notices', nav: nav(actor), body: h`<h1>Privacy and public notices</h1>
      <p>Our privacy notice and our public notices are being prepared. They will be published on this page before the website opens to clients.</p>
      <p>Until then, if you have a question about how we use your details, or you want to make a complaint, email
      <a href="mailto:contact@caprebate.co.uk">contact@caprebate.co.uk</a>. A person will read it and reply.</p>
      <p><a href="/">Back to the home page</a></p>` }));
    return 'handled';
  }
  /* Away from the test website the legal pages are not served yet; their addresses say so, as the notices'
     do, rather than answer "unknown page" to a footer link. */
  if (method === 'GET' && /^\/(terms|portal-terms|privacy-policy|cookies|acceptable-use|accessibility|disclaimer)\/?$/.test(path)) {
    html(res, 200, page({ title: 'Being prepared', nav: nav(actor), body: h`<h1>This page is being prepared</h1>
      <p>It will be published before the website opens to clients. Until then, email
      <a href="mailto:contact@caprebate.co.uk">contact@caprebate.co.uk</a> with any question.</p>
      <p><a href="/">Back to the home page</a></p>` }));
    return 'handled';
  }
  // STRESS TEST: the enquiry's thank-you page, reloaded or bookmarked, is a GET; it goes back to the form.
  if (path === '/enquiry' && method === 'GET') { redirect(res, '/#contact'); return 'handled'; }

  /* ------------------------------------------------------ public site */
  /* THE WEBSITE IS `Caprebate site.html`, served from the one file (src/modules/public-site/public-site.ts) with its style
     and script as two fixed assets. Its "Start your assessment" links come here, to /assessment, and its enquiry form
     to /enquiry. With no site file beside the build, `/` is the back end's own home page, as before. */
  if (path === '/assets/site-page.css' && method === 'GET') {
    const site = siteEdition();
    if (site !== undefined) { res.writeHead(200, CSS_HEADERS); res.end(site.css); return 'handled'; }
  }
  if (path === '/assets/site-page.js' && method === 'GET') {
    const site = siteEdition();
    if (site !== undefined) { res.writeHead(200, SITE_JS_HEADERS); res.end(site.js); return 'handled'; }
  }
  /* THE NEW HOME PAGE (src/modules/public-site/home-site.ts), its style, its script and GSAP, when the file is beside
     the build. Without it, `/` is `Caprebate site.html` as below. */
  if (path === '/assets/home.css' && method === 'GET') {
    const edition = homeEdition();
    if (edition !== undefined) { res.writeHead(200, { ...CSS_HEADERS, 'cache-control': 'public, max-age=300' }); res.end(edition.css); return 'handled'; }
  }
  if (path === '/assets/home.js' && method === 'GET') {
    const edition = homeEdition();
    // The configured Turnstile site key goes in here; without one the page keeps Cloudflare's test key.
    if (edition !== undefined) { res.writeHead(200, { ...SITE_JS_HEADERS, 'cache-control': 'public, max-age=300' }); res.end(withSiteKey(edition.js, turnstileSiteKey(d.app.secrets))); return 'handled'; }
  }
  /* THE NEW PUBLIC WEBSITE. The home page's head script, the five sector landing pages
     and their assets, and the self-hosted fonts. Every name is checked against a fixed list; no path reaches the disk. */
  if (path === '/assets/home-head.js' && method === 'GET') {
    const edition = homeEdition();
    if (edition !== undefined && edition.headJs !== '') { res.writeHead(200, { ...SITE_JS_HEADERS, 'cache-control': 'public, max-age=300' }); res.end(edition.headJs); return 'handled'; }
  }
  const caAsset = method === 'GET' ? /^\/assets\/ca-([a-z-]+?)(-head\.js|\.js|\.css)$/.exec(path) : null;
  if (caAsset !== null && isSectorSlug(caAsset[1] ?? '')) {
    const edition = sectorEdition(caAsset[1] as Parameters<typeof sectorEdition>[0]);
    if (edition !== undefined) {
      const kind = caAsset[2];
      if (kind === '.css') { res.writeHead(200, { ...CSS_HEADERS, 'cache-control': 'public, max-age=300' }); res.end(edition.css); return 'handled'; }
      const body = kind === '-head.js' ? edition.headJs : withSiteKey(edition.js, turnstileSiteKey(d.app.secrets));
      if (body !== '') { res.writeHead(200, { ...SITE_JS_HEADERS, 'cache-control': 'public, max-age=300' }); res.end(body); return 'handled'; }
    }
  }
  if (path.startsWith('/assets/fonts/') && method === 'GET') {
    const font = fontFile(path.slice('/assets/fonts/'.length));
    if (font !== null) {
      res.writeHead(200, { 'content-type': 'font/woff2', 'x-content-type-options': 'nosniff', 'cache-control': 'public, max-age=86400' });
      res.end(font); return 'handled';
    }
  }
  if (path === '/capital-allowances' || path === '/capital-allowances/') {
    res.writeHead(303, { location: '/#sectors' }); res.end(); return 'handled';
  }
  const caPage = /^\/capital-allowances\/([a-z-]+)(\/?)$/.exec(path);
  if (caPage !== null && method === 'GET' && isSectorSlug(caPage[1] ?? '')) {
    if (caPage[2] !== '/') { res.writeHead(303, { location: `/capital-allowances/${caPage[1]}/${url.search}` }); res.end(); return 'handled'; }
    const edition = sectorEdition(caPage[1] as Parameters<typeof sectorEdition>[0]);
    if (edition !== undefined) { res.writeHead(200, HOME_PAGE_HEADERS); res.end(edition.html); return 'handled'; }
  }
  if (path === '/assets/gsap.min.js' && method === 'GET') {
    const gsap = gsapScript();
    if (gsap !== null) { res.writeHead(200, { ...SITE_JS_HEADERS, 'cache-control': 'public, max-age=86400' }); res.end(gsap); return 'handled'; }
  }
  if (path === '/' && method === 'GET') {
    const edition = homeEdition();
    if (edition !== undefined) { res.writeHead(200, HOME_PAGE_HEADERS); res.end(edition.html); return 'handled'; }
    const site = siteEdition();
    if (site !== undefined) {
      // The analytics measurement id comes from the key file, not the file (src/integrations/analytics.ts). None, no change.
      // AND ONLY AFTER A CLICK ON "Accept all". The page is given the id, and its policy names Google, only
      // when the visitor's answer (cb_cookies, set by that click) is "all". No answer is no: the page then carries no id,
      // its policy allows only our own address, and nothing of Google's can load (sitePageFor, src/integrations/analytics.ts).
      const ga = ga4MeasurementId(d.app.secrets);
      const out = sitePageFor(site.html, SITE_PAGE_CSP, ga, optionalAllowed(req, cookie));
      res.writeHead(200, out.csp === null ? SITE_PAGE_HEADERS : { ...SITE_PAGE_HEADERS, 'content-security-policy': out.csp });
      res.end(out.html);
      return 'handled';
    }
    html(res, 200, home(actor)); return 'handled';
  }
  return undefined;
}

/** The website's enquiry form. */
export async function publicSiteEnquiry(w: WebRequest): Promise<WebResult | undefined> {
  const { d, req, res, method, path, actor, newId } = w;
  if (path === '/enquiry' && method === 'POST') {
    const posted = await form(req);
    /* THE SECURITY CHECK, ON THE SERVER (src/integrations/connectors/turnstile.ts). Without a secret key, or before
       the transfer to Cloudflare is approved, nothing is checked and the enquiry is kept as before. With both, an answer
       that is missing, rejected or unanswered refuses the enquiry: nothing is kept, and the audit says which. */
    const check = await checkTurnstile({ audit: d.app.audit, now: d.app.now, transport: d.app.outside, secrets: d.app.secrets,
      ...(d.app.turnstilePolicy === undefined ? {} : { policy_override: d.app.turnstilePolicy }) }, posted.get(TURNSTILE_FIELD), clientIp(req));
    if (check.state === 'FAILED') {
      d.app.audit.append({ at: d.app.now(), kind: 'WEBSITE_ENQUIRY_REFUSED', outcome: 'REFUSED', actor_id: null, actor_role: null,
        detail: { why: 'security_check', reason: check.reason, codes: [...check.codes] } });
      html(res, 400, page({ title: 'Your enquiry was not sent', nav: nav(actor),
        body: h`<h1>Your enquiry was not sent</h1><p class="err">${refusalWords(check)}</p><p><a href="/#contact">Go back to the form</a></p>` }));
      return 'handled';
    }
    const r = receiveEnquiry(d.app.deps, newId, posted, check.state === 'PASSED' ? 'passed' : `not_checked:${check.reason}`);
    if (!r.ok) {
      html(res, 400, page({ title: 'Your enquiry was not sent', nav: nav(actor),
        body: h`<h1>Your enquiry was not sent</h1><p class="err">${r.why}</p><p><a href="/#contact">Go back to the form</a></p>` }));
      return 'handled';
    }
    html(res, 200, page({ title: 'Thank you', nav: nav(actor),
      body: h`<h1>Thank you — that is with us.</h1><p>One of our team will reply within one working day, to the address you gave.</p>
        <p>If you would like a figure now, <a href="/assessment">start the free assessment</a>. It takes a few minutes.</p>
        <p><a href="/">Back to the website</a></p>` }));
    return 'handled';
  }
  return undefined;
}

function home(actor: Actor | undefined): string {
  const gate = registryGate();
  return page({
    title: 'Capital allowances for healthcare property',
    nav: nav(actor),
    body: h`
      <h1>There is tax relief built into your building.</h1>
      <p>Cap Rebate finds out, on evidence, what capital allowances you can claim when you buy, build
      or fit out healthcare premises. We tell you plainly, whether the answer is large, small or nothing.</p>
      <p>A chartered surveyor signs every split of costs. A chartered tax adviser checks every claim
      before it is filed. We work alongside your accountant, who still files your return and looks after you.
      If there is no claim, we tell you early, in writing, and explain why.</p>
      <p><a class="cta" href="/assessment">Start the free assessment</a></p>
      <div class="gate">We do not look anything up about you from this page.${why(h`We do not look anything up about anyone yet.
      Free checks of public records are ${gate.enabled ? 'switched on' : 'switched off'}, and they wait on this: ${gate.requires}.
      Paid checks wait until you have signed our engagement letter and one of our team starts the research.`)}</div>`,
  });
}
