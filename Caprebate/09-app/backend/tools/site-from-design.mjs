#!/usr/bin/env node
/**
 * THE PUBLIC WEBSITE FROM ITS DESIGN FILES — Phase 160k, 21 October 2026.
 *
 * Lakhbir: "push it live" (the Caprebate test site). The website was designed as six files outside this repository,
 * in Website Content/landing-page/template-options/ (that folder is ignored by git): the animated home page
 * 06-kurbelwerk-animated.html and five sector landing pages, capital-allowances/<sector>/index.html. They were made
 * to be opened from a folder, so they break three of this site's rules. This tool writes the site's copies:
 *
 *   site/home.html                          from 06-kurbelwerk-animated.html
 *   site/capital-allowances/<sector>.html   from capital-allowances/<sector>/index.html
 *
 * WHAT IT CHANGES, AND NOTHING ELSE:
 *  1. NOTHING INLINE. Every style attribute becomes a generated class whose rule is added to the page's one <style>
 *     block, with !important on each declaration so it still beats the page's own rules, as the attribute did. The
 *     server then serves that block and the scripts as /assets files (src/web/home-site.ts) and refuses a page with
 *     anything inline left.
 *  2. THE FONTS ARE OURS. Google Fonts is replaced by @font-face rules for IBM Plex (SIL Open Font License), served
 *     from /assets/fonts/ (site/fonts/), so the page policy needs only font-src 'self'.
 *  3. SITE ADDRESSES. Links between the design files become /, /#section and /capital-allowances/<sector>/; every
 *     "Am I eligible" goes to /assessment; the menu gains Log in; the footer's legal links go to the real pages.
 *  4. THE REAL ENQUIRY FORM on the home page: the live field names (name, firm, email, phone, ptype, message), the
 *     honeypot, Cloudflare Turnstile with the line the server swaps the key into (var SITEKEY='...'), posting to
 *     /enquiry. The design's "this form is not connected yet" handler is retired with it.
 *  5. The review label ("Animated mock-up") comes off.
 *
 * PHASE 160n, 28 OCTOBER 2026: THE X-RAY HOME PAGE. Lakhbir: "i want you claude to make the website front end as the new
 * design". The home page now comes from redesign-options/02-x-ray.html (the X-ray, chosen 26 Oct 2026), beside
 * template-options/ in the same folder; the sector pages still come from template-options. `convertXray` makes the same
 * five changes as `convert` for that file's own markup: nothing inline; its fonts (Inter Tight, JetBrains Mono) ours;
 * the review label off; the live enquiry form in the design's frame (XRAY_FORM, the same fields, ids and script as
 * FORM); the legal footer. The design file itself carries the site's search head, menu, "Am I eligible?" buttons, sector
 * links and questions, so the mock-up and the page are the same design.
 *
 *   node tools/site-from-design.mjs [<template-options folder>]   writes the six site files and says what it did
 *   node tools/site-from-design.mjs --check [<folder>]            exit 1 if the site files differ from a fresh run
 */
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';

const HERE = import.meta.dirname;
const SITE = join(HERE, '..', '..', 'site');
const DEFAULT_SRC = join(HERE, '..', '..', '..', '..', 'Website Content', 'landing-page', 'template-options');
/** The X-ray design file (Phase 160n), beside the template-options folder. */
const xrayFile = (src) => join(src, '..', 'redesign-options', '02-x-ray.html');

export const SECTORS = ['care-homes', 'dental-practices', 'gp-surgeries', 'supported-living', 'private-hospitals-and-clinics'];

const FONTS = `
/* IBM Plex, self-hosted (SIL Open Font License, site/fonts/OFL-LICENSE.txt); latin, the weights the pages use */
@font-face{font-family:"IBM Plex Sans";font-style:normal;font-weight:400;font-display:swap;src:url(/assets/fonts/ibm-plex-sans-latin-400-normal.woff2) format("woff2")}
@font-face{font-family:"IBM Plex Sans";font-style:normal;font-weight:500;font-display:swap;src:url(/assets/fonts/ibm-plex-sans-latin-500-normal.woff2) format("woff2")}
@font-face{font-family:"IBM Plex Sans";font-style:normal;font-weight:600;font-display:swap;src:url(/assets/fonts/ibm-plex-sans-latin-600-normal.woff2) format("woff2")}
@font-face{font-family:"IBM Plex Sans Condensed";font-style:normal;font-weight:500;font-display:swap;src:url(/assets/fonts/ibm-plex-sans-condensed-latin-500-normal.woff2) format("woff2")}
@font-face{font-family:"IBM Plex Sans Condensed";font-style:normal;font-weight:600;font-display:swap;src:url(/assets/fonts/ibm-plex-sans-condensed-latin-600-normal.woff2) format("woff2")}
@font-face{font-family:"IBM Plex Sans Condensed";font-style:normal;font-weight:700;font-display:swap;src:url(/assets/fonts/ibm-plex-sans-condensed-latin-700-normal.woff2) format("woff2")}
@font-face{font-family:"IBM Plex Mono";font-style:normal;font-weight:400;font-display:swap;src:url(/assets/fonts/ibm-plex-mono-latin-400-normal.woff2) format("woff2")}
@font-face{font-family:"IBM Plex Mono";font-style:normal;font-weight:500;font-display:swap;src:url(/assets/fonts/ibm-plex-mono-latin-500-normal.woff2) format("woff2")}
@font-face{font-family:"IBM Plex Mono";font-style:normal;font-weight:600;font-display:swap;src:url(/assets/fonts/ibm-plex-mono-latin-600-normal.woff2) format("woff2")}
`;

const LEGAL_NAV = '<nav aria-label="Legal"><h2>Legal</h2><ul>' +
  '<li><a href="/notices/">Public notices</a></li><li><a href="/notices/#privacy">Privacy</a></li>' +
  '<li><a href="/notices/#complaints">Complaints</a></li><li><a href="/terms/">Terms of use</a></li>' +
  '<li><a href="/cookies/">Cookie policy</a></li><li><a href="/cookies/#choice">Cookie settings</a></li>' +
  '<li><a href="/accessibility/">Accessibility</a></li><li><a href="/disclaimer/">Disclaimer</a></li></ul></nav>';

/** The live enquiry form, in the design's frame (Phase 160k). Field names are /enquiry's (src/web/enquiries.ts). */
const FORM = `<form class="form" id="contactform" action="/enquiry" method="post" novalidate aria-labelledby="f-hd-t">
    <div class="f-hd"><span id="f-hd-t">Enquiry</span><span>Free assessment</span></div>
    <div class="fld"><label for="c-name">Your name (required)</label><input id="c-name" name="name" type="text" autocomplete="name" maxlength="200" required><span class="c-msg" id="c-name-msg"></span></div>
    <div class="fld"><label for="c-firm">Practice / company</label><input id="c-firm" name="firm" type="text" autocomplete="organization" maxlength="300"></div>
    <div class="fld"><label for="c-email">Email (required)</label><input id="c-email" name="email" type="email" autocomplete="email" maxlength="254" required><span class="c-msg" id="c-email-msg"></span></div>
    <div class="fld"><label for="c-phone">Phone</label><input id="c-phone" name="phone" type="tel" autocomplete="tel" maxlength="40"></div>
    <div class="fld w"><label for="c-ptype">Property type (required)</label>
     <select id="c-ptype" name="ptype" required>
      <option value="">Select</option>
      <option>Care home</option><option>Dental practice</option><option>GP / primary care</option><option>Private hospital / clinic</option><option>Supported living</option><option>Other healthcare property</option>
     </select><span class="c-msg" id="c-ptype-msg"></span>
    </div>
    <div class="fld w"><label for="c-message">Anything you would like to add</label><textarea id="c-message" name="message" maxlength="2000" rows="4"></textarea></div>
    <div class="fld w c-check" id="c-check">
     <p class="c-check-row"><strong>Security check</strong> <span id="c-check-text" aria-live="polite">This runs when you start filling in the form.</span></p>
     <div id="c-turnstile" class="c-turnstile"></div>
     <span class="c-msg" id="c-check-msg"></span>
    </div>
    <div class="c-hp" aria-hidden="true"><label for="c-website">Leave this empty</label><input id="c-website" type="text" tabindex="-1" autocomplete="off"></div>
    <div class="f-ft">
     <p class="f-note">Sending this form asks us to reply to you. We use these details only to answer your enquiry and never share them. <a href="/privacy/">How we use your details</a>.</p>
     <button type="submit" class="btn pri">Send my enquiry <span class="ar" aria-hidden="true">↗</span></button>
    </div>
   </form>`;

const FORM_CSS = `
/* Phase 160k: the live enquiry form in the design's frame */
.c-msg{display:block;min-height:0;font:500 12px/1.3 var(--sans);color:#b23a2b}
.c-msg:empty{display:none}
.fld [aria-invalid="true"]{border-bottom-color:#b23a2b}
.c-check-row{font-size:14px;line-height:1.45;color:var(--ink-2)}
.c-check-row strong{color:var(--ink);font-weight:600}
.c-check.is-ok .c-check-row strong{color:var(--green)}
.c-check.is-error .c-check-row span{color:#b23a2b}
.c-turnstile:empty{display:none}
.c-turnstile{margin-top:10px}
.c-hp{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap}
.f-note a{border-bottom:1px solid var(--ink)}
@media (min-width:1000px){#contact .ct-f .form{grid-template-rows:auto auto auto auto minmax(0,1fr) auto auto}}
/* Phase 160k: Log in, in the menu */
.nav .nav-login a{color:var(--ink-2)}
`;

/** The live form's script (as on the old home page, 29 Sep 2026), pointed at this form's ids. */
const FORM_JS = `
/* The contact form: checks the three required answers, and a security check (Cloudflare Turnstile) before anything
   is sent. The check runs out of sight and shows a box only if Cloudflare needs the visitor to click. The script
   loads only once the form is on screen or in use. The server puts the configured site key into the next line. */
(function(){
var f=document.getElementById('contactform');if(!f)return;
var SITEKEY='1x00000000000000000000AA';
var box=document.getElementById('c-check'),text=document.getElementById('c-check-text'),token=null,wid=null,loaded=false;
var WORDS={checking:'Checking you are a person. This takes a moment.',ok:'Done. You can send the form.',interact:'Please tick the box below to finish the check.',expired:'The check timed out, so it is running again.',error:'The security check could not load. Please email contact@caprebate.co.uk instead.'};
function state(k){box.classList.toggle('is-checking',k==='checking');box.classList.toggle('is-ok',k==='ok');box.classList.toggle('is-error',k==='error');text.textContent=WORDS[k];if(k==='ok')msg('c-check','');}
function load(){
 if(loaded)return;loaded=true;state('checking');
 window.cbTurnstileReady=function(){
  wid=window.turnstile.render('#c-turnstile',{sitekey:SITEKEY,theme:'light',appearance:'interaction-only',
   callback:function(t){token=t;state('ok');},
   'before-interactive-callback':function(){state('interact');},
   'expired-callback':function(){token=null;state('expired');window.turnstile.reset(wid);state('checking');},
   'error-callback':function(){token=null;state('error');}});
 };
 var sc=document.createElement('script');
 sc.src='https://challenges.cloudflare.com/turnstile/v0/api.js?onload=cbTurnstileReady&render=explicit';
 sc.async=true;sc.onerror=function(){state('error');};document.head.appendChild(sc);
}
f.addEventListener('focusin',load);
if('IntersectionObserver' in window){var fio=new IntersectionObserver(function(es){if(es[0].isIntersecting){fio.disconnect();load();}},{rootMargin:'200px 0px'});fio.observe(f);}
function msg(id,words){var el=document.getElementById(id+'-msg'),input=document.getElementById(id);if(el)el.textContent=words||'';if(input&&input.tagName!=='DIV'){if(words){input.setAttribute('aria-invalid','true');input.setAttribute('aria-describedby',id+'-msg');}else input.removeAttribute('aria-invalid');}}
f.addEventListener('submit',function(e){
 var bad=null,name=f.elements.name.value.trim(),email=f.elements.email.value.trim(),ptype=f.elements.ptype.value;
 msg('c-name',name?'':'Please tell us your name.');if(!name)bad=bad||'c-name';
 var ok=/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(email);msg('c-email',ok?'':'Please give an email address we can reply to.');if(!ok)bad=bad||'c-email';
 msg('c-ptype',ptype?'':'Please choose the kind of property.');if(!ptype)bad=bad||'c-ptype';
 if(document.getElementById('c-website').value){e.preventDefault();return;}
 if(!token){msg('c-check',box.classList.contains('is-error')?'':'Please wait for the security check to finish.');load();if(!bad){e.preventDefault();box.scrollIntoView({block:'center'});return;}}
 if(bad){e.preventDefault();document.getElementById(bad).focus();}
});
})();
`;

/** The X-ray's fonts (Phase 160n), self-hosted (SIL Open Font License, site/fonts/OFL-INTER-TIGHT.txt and
 *  OFL-JETBRAINS-MONO.txt); latin. Inter Tight is one variable file for the weights 400 to 700. */
const XRAY_FONTS = `
/* Inter Tight and JetBrains Mono, self-hosted (SIL Open Font License); latin */
@font-face{font-family:"Inter Tight";font-style:normal;font-weight:400 700;font-display:swap;src:url(/assets/fonts/inter-tight-latin-wght-normal.woff2) format("woff2")}
@font-face{font-family:"JetBrains Mono";font-style:normal;font-weight:500;font-display:swap;src:url(/assets/fonts/jetbrains-mono-latin-500-normal.woff2) format("woff2")}
`;

/** The live enquiry form in the X-ray's frame (Phase 160n): FORM's fields, ids, check and honeypot, the design's classes. */
const XRAY_FORM = `<form class="form" id="contactform" action="/enquiry" method="post" novalidate aria-label="Enquiry">
   <div class="f"><label for="c-name">Name <span>(required)</span></label><input id="c-name" name="name" type="text" autocomplete="name" maxlength="200" required><span class="c-msg" id="c-name-msg"></span></div>
   <div class="f"><label for="c-firm">Practice or company</label><input id="c-firm" name="firm" type="text" autocomplete="organization" maxlength="300"></div>
   <div class="f"><label for="c-email">Email <span>(required)</span></label><input id="c-email" name="email" type="email" autocomplete="email" maxlength="254" required><span class="c-msg" id="c-email-msg"></span></div>
   <div class="f"><label for="c-phone">Phone</label><input id="c-phone" name="phone" type="tel" autocomplete="tel" maxlength="40"></div>
   <div class="f full"><label for="c-ptype">Property type <span>(required)</span></label>
    <select id="c-ptype" name="ptype" required>
     <option value="">Choose one</option>
     <option>Care home</option><option>Dental practice</option><option>GP / primary care</option><option>Private hospital / clinic</option><option>Supported living</option><option>Other healthcare property</option>
    </select><span class="c-msg" id="c-ptype-msg"></span></div>
   <div class="f full"><label for="c-message">Message</label><textarea id="c-message" name="message" maxlength="2000" rows="3"></textarea></div>
   <div class="f full c-check" id="c-check">
    <p class="c-check-row"><strong>Security check</strong> <span id="c-check-text" aria-live="polite">This runs when you start filling in the form.</span></p>
    <div id="c-turnstile" class="c-turnstile"></div>
    <span class="c-msg" id="c-check-msg"></span>
   </div>
   <div class="c-hp" aria-hidden="true"><label for="c-website">Leave this empty</label><input id="c-website" type="text" tabindex="-1" autocomplete="off"></div>
   <div class="f-end"><button class="btn btn-p" type="submit">Send my enquiry <span class="arr" aria-hidden="true">→</span></button><small>Sending this form asks us to reply to you. We use these details only to answer your enquiry and never share them. <a href="/privacy/">How we use your details</a>.</small></div>
  </form>`;

const XRAY_FORM_CSS = `
/* Phase 160n: the live enquiry form in the X-ray's frame */
.c-msg{display:block;font:500 13px/1.3 var(--sans);color:#b23a2b}
.c-msg:empty{display:none}
.f [aria-invalid="true"]{border-color:#b23a2b}
.c-check-row{font-size:14px;line-height:1.45;color:var(--ink-2)}
.c-check-row strong{color:var(--ink);font-weight:600}
.c-check.is-ok .c-check-row strong{color:var(--green)}
.c-check.is-error .c-check-row span{color:#b23a2b}
.c-turnstile:empty{display:none}
.c-turnstile{margin-top:10px}
.c-hp{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap}
.f-end small a{color:var(--green)}
`;

/** The X-ray design file to the site's home page (Phase 160n). */
export function convertXray(source) {
  let s = source.replace(/^\uFEFF/, '');
  s = s.replace(/<!--[\s\S]*?-->\n?/g, '');
  s = s.replace('<!doctype html>', '<!doctype html>\n<!-- Cap Rebate home page. Written by tools/site-from-design.mjs from its design file, redesign-options/02-x-ray.html (Phase 160n); edit the design file and run the tool again. -->');
  s = must(s.replace(/<meta name="viewport" content="width=device-width, ?initial-scale=1">/, (m) => `${m}\n<link rel="icon" href="/favicon.svg" type="image/svg+xml">`), 1, 'the viewport line');
  // the review label, and the fonts from Google
  s = must(s.replace(/\n?<div class="mock">[\s\S]*?<\/div>/, ''), 1, 'the review label');
  s = s.replace(/<link rel="preconnect" href="https:\/\/fonts\.googleapis\.com">\n?/, '').replace(/<link rel="preconnect" href="https:\/\/fonts\.gstatic\.com" crossorigin>\n?/, '');
  s = must(s.replace(/<link href="https:\/\/fonts\.googleapis\.com\/css2[^"]*" rel="stylesheet">\n?/, ''), 1, 'the Google Fonts link');
  // the footer's legal links
  if (!/<nav aria-label="Legal">[\s\S]*?<\/nav>/.test(s)) throw new Error('site-from-design: the X-ray footer links not found');
  s = s.replace(/<nav aria-label="Legal">[\s\S]*?<\/nav>/, LEGAL_NAV);
  // the live enquiry form, and its script last
  const a = s.indexOf('<form class="form" id="cform"'); const b = s.indexOf('</form>', a);
  if (a < 0 || b < 0) throw new Error('site-from-design: the X-ray form not found');
  s = `${s.slice(0, a)}${XRAY_FORM}${s.slice(b + '</form>'.length)}`;
  s = s.replace(/<\/body>(?![\s\S]*<\/body>)/, `<script>${FORM_JS}</script>\n</body>`);
  const lifted = lift(s);
  s = lifted.html;
  const at = s.indexOf('</style>');
  if (at < 0) throw new Error('site-from-design: no <style> block');
  s = `${s.slice(0, at)}${XRAY_FONTS}${XRAY_FORM_CSS}${lifted.css}${s.slice(at)}`;
  const markup = s.replace(/<style>[\s\S]*?<\/style>/, '').replace(/<script>[\s\S]*?<\/script>/g, '');
  if (/\sstyle\s*=/.test(markup)) throw new Error('site-from-design: a style attribute survived on the X-ray home page');
  if (/fonts\.g(oogleapis|static)\.com/.test(s)) throw new Error('site-from-design: Google Fonts survived on the X-ray home page');
  if (/redesign-options|template-options|index\.html|Mock-up only|mock-up/i.test(markup.replace(/<!--[\s\S]*?-->/g, ''))) throw new Error('site-from-design: a mock-up word or link survived on the X-ray home page');
  if (/<form class="form" id="cform"/.test(s)) throw new Error('site-from-design: the mock-up form survived');
  return s;
}

function must(s, count, what) { if (count < 1) throw new Error(`site-from-design: ${what} not found`); return s; }

/** Every style="..." becomes a class; returns the page and the rules to add to its <style>. */
function lift(html) {
  const rules = new Map();
  const out = html.replace(/<([a-zA-Z][\w:-]*)(\s[^<>]*?)\sstyle="([^"]*)"([^<>]*?)(\/?)>/g, (_m, tag, before, style, after, slash) => {
    const decls = style.split(';').map((d) => d.trim()).filter(Boolean).map((d) => `${d}!important`).join(';');
    const name = `z${createHash('sha1').update(style).digest('hex').slice(0, 7)}`;
    rules.set(name, decls);
    let attrs = `${before}${after}`;
    if (/\sclass="/.test(attrs)) attrs = attrs.replace(/\sclass="([^"]*)"/, (_c, cls) => ` class="${cls} ${name}"`);
    else attrs = `${attrs} class="${name}"`;
    return `<${tag}${attrs}${slash}>`;
  });
  // a tag whose only attribute is the style (no leading attribute before it)
  const out2 = out.replace(/<([a-zA-Z][\w:-]*)\sstyle="([^"]*)"([^<>]*?)(\/?)>/g, (_m, tag, style, after, slash) => {
    const decls = style.split(';').map((d) => d.trim()).filter(Boolean).map((d) => `${d}!important`).join(';');
    const name = `z${createHash('sha1').update(style).digest('hex').slice(0, 7)}`;
    rules.set(name, decls);
    const attrs = /\sclass="/.test(after) ? after.replace(/\sclass="([^"]*)"/, (_c, cls) => ` class="${cls} ${name}"`) : `${after} class="${name}"`;
    return `<${tag}${attrs}${slash}>`;
  });
  const css = [...rules].map(([n, d]) => `.${n}{${d}}`).join('\n');
  return { html: out2, css: `\n/* Phase 160k: the design's style attributes, as classes (tools/site-from-design.mjs) */\n${css}\n` };
}

/** One design file to its site copy. `page` is 'home' or a sector slug. */
export function convert(source, page) {
  let s = source.replace(/^﻿/, '');
  // the design's notes to itself (HTML comments) stay out of what a visitor is sent; a note says where the file came from
  s = s.replace(/<!--[\s\S]*?-->\n?/g, '');
  s = s.replace('<!doctype html>', `<!doctype html>\n<!-- Cap Rebate ${page === 'home' ? 'home page' : `sector page: ${page}`}. Written by tools/site-from-design.mjs from its design file (Phase 160k); edit the design file and run the tool again. -->`);
  // the browser tab's icon, as every page of this site names it; the logo goes home
  s = must(s.replace('<meta name="viewport" content="width=device-width,initial-scale=1">', '<meta name="viewport" content="width=device-width,initial-scale=1">\n<link rel="icon" href="/favicon.svg" type="image/svg+xml">'), 1, 'the viewport line');
  s = s.replace('<a class="brand" href="#main"', '<a class="brand" href="/"');
  // the review label and the fonts from Google
  s = s.replace(/\n?<p class="otag">[^<]*<\/p>/, '');
  s = s.replace(/<link rel="preconnect" href="https:\/\/fonts\.googleapis\.com">\n?/, '').replace(/<link rel="preconnect" href="https:\/\/fonts\.gstatic\.com" crossorigin>\n?/, '');
  s = must(s.replace(/<link href="https:\/\/fonts\.googleapis\.com\/css2[^"]*" rel="stylesheet">\n?/, ''), 1, 'the Google Fonts link');
  // addresses between the pages
  s = s.replace(/href="(?:\.\.\/\.\.\/)?06-kurbelwerk-animated\.html#([^"]*)"/g, 'href="/#$1"').replace(/href="(?:\.\.\/\.\.\/)?06-kurbelwerk-animated\.html"/g, 'href="/"');
  for (const slug of SECTORS) {
    const re = new RegExp(`href="(?:capital-allowances/|\\.\\./)${slug}/index\\.html(#[^"]*)?"`, 'g');
    s = s.replace(re, (_m, hash) => `href="/capital-allowances/${slug}/${hash ?? ''}"`);
  }
  // links written as the final domain stay on this site (the canonical and social tags keep the domain)
  s = s.replace(/(<a\b[^>]*\shref=")https:\/\/caprebate\.co\.uk(\/[^"]*)"/g, '$1$2"');
  // every "Am I eligible" is the assessment
  s = s.replace(/<a\b([^>]*?)\shref="[^"]*"([^>]*)>((?:(?!<\/a>)[\s\S])*?Am I eligible(?:(?!<\/a>)[\s\S])*?)<\/a>/g, '<a$1 href="/assessment"$2>$3</a>');
  // Log in, last in the menu
  s = must(s.replace(/(<nav class="nav" id="nav"[^>]*>\s*<ul>[\s\S]*?)(\n\s*<\/ul>\s*\n\s*<\/nav>)/, '$1\n   <li class="nav-login"><a href="/login">Log in</a></li>$2'), 1, 'the menu');
  // the footer's legal links
  s = s.replace(/<nav aria-labelledby="ft-leg">[\s\S]*?<\/nav>/, LEGAL_NAV);
  let extraCss = FONTS;
  if (page === 'home') {
    const a = s.indexOf('<form class="form" id="enquiry"'); const b = s.indexOf('</form>', a);
    if (a < 0 || b < 0) throw new Error('site-from-design: the home page form not found');
    s = `${s.slice(0, a)}${FORM}${s.slice(b + '</form>'.length)}`;
    extraCss += FORM_CSS;
    s = s.replace(/<\/body>(?![\s\S]*<\/body>)/, `<script>${FORM_JS}</script>\n</body>`);
  } else {
    extraCss += '\n/* Phase 160k: Log in, in the menu */\n.nav .nav-login a{color:var(--ink-2)}\n';
  }
  // a page's other <style> blocks (a sector page's own rules) join the first, in their order, so the page has one
  const blocks = [...s.matchAll(/<style>([\s\S]*?)<\/style>\n?/g)];
  if (blocks.length > 1) {
    const later = blocks.slice(1).map((m) => m[1]).join('\n');
    let n = 0;
    s = s.replace(/<style>([\s\S]*?)<\/style>\n?/g, (m) => (++n === 1 ? m : ''));
    s = s.replace('</style>', `\n/* the page's own rules */\n${later}</style>`);
  }
  // style attributes to classes, then every added rule into the one <style> block
  const lifted = lift(s);
  s = lifted.html;
  const at = s.indexOf('</style>');
  if (at < 0) throw new Error('site-from-design: no <style> block');
  s = `${s.slice(0, at)}${extraCss}${lifted.css}${s.slice(at)}`;
  const markup = s.replace(/<style>[\s\S]*?<\/style>/, '').replace(/<script>[\s\S]*?<\/script>/g, '');
  if (/\sstyle\s*=/.test(markup)) throw new Error(`site-from-design: a style attribute survived on ${page}`);
  if (/fonts\.g(oogleapis|static)\.com/.test(s)) throw new Error(`site-from-design: Google Fonts survived on ${page}`);
  if (/template-options|kurbelwerk-animated\.html|index\.html/.test(s.replace(/<!--[\s\S]*?-->/g, ''))) throw new Error(`site-from-design: a design-folder link survived on ${page}`);
  return s;
}

function run() {
  const args = process.argv.slice(2);
  const check = args.includes('--check');
  const src = args.find((a) => !a.startsWith('--')) ?? DEFAULT_SRC;
  const jobs = [['home', xrayFile(src), join(SITE, 'home.html')],
    ...SECTORS.map((slug) => [slug, join(src, 'capital-allowances', slug, 'index.html'), join(SITE, 'capital-allowances', `${slug}.html`)])];
  let stale = 0;
  for (const [page, from, to] of jobs) {
    const out = page === 'home' ? convertXray(readFileSync(from, 'utf8')) : convert(readFileSync(from, 'utf8'), page);
    if (check) {
      let now = ''; try { now = readFileSync(to, 'utf8'); } catch { /* missing counts as stale */ }
      if (now !== out) { stale += 1; console.log(`STALE  ${to}`); }
    } else {
      mkdirSync(dirname(to), { recursive: true });
      writeFileSync(to, out);
      console.log(`wrote  ${to}  (${Math.round(out.length / 1024)} KB)`);
    }
  }
  if (check) { console.log(stale === 0 ? 'the site files match their design files' : `${stale} site file(s) differ`); process.exit(stale === 0 ? 0 : 1); }
}

if (process.argv[1] && import.meta.filename === process.argv[1]) run();
