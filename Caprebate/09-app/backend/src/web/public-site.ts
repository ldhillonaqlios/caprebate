/**
 * THE PUBLIC WEBSITE, SERVED BY THE BACK END — PHASE 133j, 18 September 2026.
 *
 * `Caprebate site.html` is the website. It is not re-typed here: this module reads that one file and serves an
 * edition of it at `/`, so the front end and the back end are one site on one address.
 *
 * WHAT THE SERVED EDITION LEAVES OUT, AND WHY
 *
 * 1. THE IN-PAGE ASSESSMENT. The file carries a complete copy of the assessment inside `<template id="assessTpl">`
 *    (about a megabyte), which the file preview opens in an overlay. Served, that copy is dropped with its overlay, and
 *    every "Start your assessment" link is an ordinary link to `/assessment` — the back end's own assessment, whose
 *    answers are recorded. There is one assessment that writes, not two that disagree.
 *
 * 2. NOTHING INLINE. Every back-end page is served under a Content-Security-Policy with no `unsafe-inline`. The
 *    site's one `<style>` block is served as `/assets/site-page.css` and its one `<script>` as
 *    `/assets/site-page.js`, and the page is refused — `buildSiteEdition` throws — if any inline style, style
 *    attribute, event handler or `javascript:` link is left. The site file itself carries none since Phase 133j.
 *
 * THE PATH IS A CONSTANT, like the engagement letter's (letter.ts). No request path is ever mapped onto the disk:
 * the three routes that use this module each serve one fixed string.
 */

import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

export const SITE_PATH = join(import.meta.dirname, '..', '..', '..', '..', '..', 'Caprebate site.html');

/** The page's policy: the back end's, plus its own script from its own origin. Nothing else is loosened. */
export const SITE_PAGE_CSP =
  "default-src 'none'; style-src 'self'; img-src 'self' data:; script-src 'self'; " +
  "form-action 'self'; frame-ancestors 'none'; base-uri 'none'";

export const SITE_PAGE_HEADERS: Readonly<Record<string, string>> = Object.freeze({
  'content-type': 'text/html; charset=utf-8',
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'no-referrer',
  'x-frame-options': 'DENY',
  'content-security-policy': SITE_PAGE_CSP,
});

export const SITE_JS_HEADERS: Readonly<Record<string, string>> = Object.freeze({
  'content-type': 'text/javascript; charset=utf-8',
  'x-content-type-options': 'nosniff',
  'cache-control': 'no-store',
});

export type SiteEdition = { readonly html: string; readonly css: string; readonly js: string };

/** What must not survive into the served page. The same patterns the Phase 133a test holds every page to. */
const INLINE: readonly [RegExp, string][] = [
  [/<style\b/i, 'an inline <style> block'],
  [/<script\b(?![^>]*\ssrc=)/i, 'an inline <script>'],
  [/\sstyle\s*=/i, 'a style attribute'],
  [/\son[a-z]+\s*=/i, 'an inline event handler'],
  [/href\s*=\s*["']?\s*javascript:/i, 'a javascript: link'],
];

function cut(src: string, open: string, close: string): { before: string; inner: string; after: string } {
  const a = src.indexOf(open);
  const b = a < 0 ? -1 : src.indexOf(close, a + open.length);
  if (a < 0 || b < 0) throw new Error(`the site file has no ${open}…${close}`);
  return { before: src.slice(0, a), inner: src.slice(a + open.length, b), after: src.slice(b + close.length) };
}

/** Build the served edition from the file's text. Pure, so a test can hand it a string. */
export function buildSiteEdition(source: string): SiteEdition {
  const text = source.replace(/^﻿/, '');
  const style = cut(text, '<style>', '</style>');
  let rest = `${style.before}<link rel="stylesheet" href="/assets/site-page.css">${style.after}`;
  const script = cut(rest, '<script>', '</script>');
  rest = `${script.before}<script src="/assets/site-page.js"></script>${script.after}`;
  // The in-page assessment and its overlay: from the overlay's comment (or the overlay itself) to the template's end.
  const t = rest.indexOf('<template id="assessTpl"');
  if (t >= 0) {
    const endTag = rest.indexOf('</template>', t);
    if (endTag < 0) throw new Error('the site file has an unclosed assessment template');
    const marker = rest.lastIndexOf('<!-- ===== INTEGRATED ASSESSMENT', t);
    const overlay = rest.lastIndexOf('<div id="assessOverlay"', t);
    const from = marker >= 0 ? marker : overlay >= 0 ? overlay : t;
    rest = rest.slice(0, from) + rest.slice(endTag + '</template>'.length);
  }
  for (const [re, what] of INLINE) {
    if (re.test(rest)) throw new Error(`the served site would carry ${what}`);
  }
  return { html: rest, css: style.inner, js: script.inner };
}

let cached: { mtimeMs: number; edition: SiteEdition } | undefined;

/**
 * The edition of the file on disk, rebuilt when the file changes. `undefined` when there is no site file next to the
 * build — a copy of the back end on its own still starts, and `/` then shows the back end's own home page.
 */
export function siteEdition(): SiteEdition | undefined {
  let mtimeMs: number;
  try { mtimeMs = statSync(SITE_PATH).mtimeMs; } catch { return undefined; }
  if (cached?.mtimeMs === mtimeMs) return cached.edition;
  cached = { mtimeMs, edition: buildSiteEdition(readFileSync(SITE_PATH, 'utf8')) };
  return cached.edition;
}
