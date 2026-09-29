/**
 * THE NEW HOME PAGE, SERVED BY THE BACK END — 29 September 2026.
 *
 * Lakhbir: "this look good, push it to vercel". The page designed in Website Content/landing-page is copied, as one
 * file, to Caprebate/09-app/site/home.html, and this module serves an edition of it at `/`. When that file is not
 * beside the build, `/` falls back to `Caprebate site.html` (src/web/public-site.ts), and then to the back end's own
 * home page, as before.
 *
 * THE SAME RULE AS EVERY OTHER PAGE: NOTHING INLINE. The file's one `<style>` block is served as /assets/home.css and
 * its `<script>` blocks, in order, as /assets/home.js. The file carries no style attribute and no event handler (its
 * page variables are data-vars, set by its script), and the edition is refused if one appears. The one inline
 * `<script>` kept is the search engines' structured data (`type="application/ld+json"`), which a browser never runs.
 *
 * TWO THINGS FROM OUTSIDE, BOTH NAMED:
 *  - GSAP, the animation library, is served from this site at /assets/gsap.min.js, from the `gsap` package the root
 *    package.json installs. Missing, the page shows its finished drawings without animation.
 *  - Cloudflare Turnstile, the contact form's security check, loads from challenges.cloudflare.com. The home page's
 *    policy allows that one origin for scripts and frames, and nothing else is loosened. Its key is Cloudflare's
 *    public TEST key, which always passes; /enquiry does not yet check the token (a named job before launch).
 *
 * THE PATHS ARE CONSTANTS. No request path is ever mapped onto the disk.
 */

import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

export const HOME_PATH = join(import.meta.dirname, '..', '..', '..', 'site', 'home.html');
export const GSAP_PATH = join(import.meta.dirname, '..', '..', '..', '..', '..', 'node_modules', 'gsap', 'dist', 'gsap.min.js');

/** Where the page's script tag for GSAP points in the source file, and where it points when served. */
const GSAP_CDN = /<script src="https:\/\/cdnjs\.cloudflare\.com\/ajax\/libs\/gsap\/[0-9.]+\/gsap\.min\.js" defer><\/script>/;
const GSAP_LOCAL = '<script src="/assets/gsap.min.js" defer></script>';

export const TURNSTILE_ORIGIN = 'https://challenges.cloudflare.com';

/** The home page's policy: the site's own, plus Cloudflare's security check. Nothing else. */
export const HOME_PAGE_CSP =
  "default-src 'none'; style-src 'self'; img-src 'self' data:; " +
  `script-src 'self' ${TURNSTILE_ORIGIN}; frame-src ${TURNSTILE_ORIGIN}; ` +
  "form-action 'self'; frame-ancestors 'none'; base-uri 'none'";

export const HOME_PAGE_HEADERS: Readonly<Record<string, string>> = Object.freeze({
  'content-type': 'text/html; charset=utf-8',
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'no-referrer',
  'x-frame-options': 'DENY',
  'content-security-policy': HOME_PAGE_CSP,
});

export type HomeEdition = { readonly html: string; readonly css: string; readonly js: string };

const INLINE: readonly [RegExp, string][] = [
  [/<style\b/i, 'an inline <style> block'],
  [/<script\b(?![^>]*\ssrc=)(?![^>]*type="application\/ld\+json")/i, 'an inline <script>'],
  [/\sstyle\s*=/i, 'a style attribute'],
  [/\son[a-z]+\s*=/i, 'an inline event handler'],
  [/href\s*=\s*["']?\s*javascript:/i, 'a javascript: link'],
];

/** Build the served edition from the file's text. Pure, so a test can hand it a string. */
export function buildHomeEdition(source: string): HomeEdition {
  let rest = source.replace(/^﻿/, '');
  const a = rest.indexOf('<style>');
  const b = a < 0 ? -1 : rest.indexOf('</style>', a);
  if (a < 0 || b < 0) throw new Error('the home page has no <style> block');
  const css = rest.slice(a + '<style>'.length, b);
  rest = `${rest.slice(0, a)}<link rel="stylesheet" href="/assets/home.css">${rest.slice(b + '</style>'.length)}`;
  // Every script block the browser would run, in order, into one file placed where the first one stood.
  const scripts: string[] = [];
  let first = -1;
  rest = rest.replace(/<script>([\s\S]*?)<\/script>\n?/g, (_m, body: string, at: number) => {
    if (first < 0) first = at;
    scripts.push(body);
    return scripts.length === 1 ? '\u0000HOMEJS\u0000' : '';
  });
  if (scripts.length === 0) throw new Error('the home page has no <script> block');
  rest = rest.replace('\u0000HOMEJS\u0000', '<script src="/assets/home.js"></script>\n');
  rest = rest.replace(GSAP_CDN, GSAP_LOCAL);
  for (const [re, what] of INLINE) {
    if (re.test(rest)) throw new Error(`the served home page would carry ${what}`);
  }
  return { html: rest, css, js: scripts.join('\n;\n') };
}

let cached: { mtimeMs: number; edition: HomeEdition } | undefined;

/** The edition of the file on disk, rebuilt when the file changes; `undefined` when there is no file. */
export function homeEdition(): HomeEdition | undefined {
  let mtimeMs: number;
  try { mtimeMs = statSync(HOME_PATH).mtimeMs; } catch { return undefined; }
  if (cached?.mtimeMs === mtimeMs) return cached.edition;
  cached = { mtimeMs, edition: buildHomeEdition(readFileSync(HOME_PATH, 'utf8')) };
  return cached.edition;
}

let gsapCache: Buffer | null | undefined;

/** GSAP from the installed package, or null when it is not installed (the page then shows its drawings still). */
export function gsapScript(): Buffer | null {
  if (gsapCache !== undefined) return gsapCache;
  try { gsapCache = readFileSync(GSAP_PATH); } catch { gsapCache = null; }
  return gsapCache;
}
