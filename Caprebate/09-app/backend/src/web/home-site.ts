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
 *
 * PHASE 160k, 21 OCTOBER 2026: THE NEW PUBLIC WEBSITE. Lakhbir: "push it live". The home page is now the
 * "Kurbelwerk" design, and five sector landing pages join it at /capital-allowances/<sector>/ (site/capital-allowances/
 * <sector>.html). Both come from their design files through tools/site-from-design.mjs, which turns every style
 * attribute into a class and self-hosts the fonts. Every page is built the same way here (buildEdition): its <style>
 * block becomes /assets/<name>.css; the scripts in its <head> become /assets/<name>-head.js, kept in the head; the
 * scripts in its body become /assets/<name>.js, placed where the LAST of them stood, so they run after the page is
 * read. The page policy gains font-src 'self' for the fonts (/assets/fonts/, site/fonts/), and nothing else.
 */

import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

export const HOME_PATH = join(import.meta.dirname, '..', '..', '..', 'site', 'home.html');
export const SITE_DIR = join(import.meta.dirname, '..', '..', '..', 'site');

/** The sector landing pages (Phase 160k): their addresses, in the order the site lists them. */
export const SECTOR_SLUGS = ['care-homes', 'dental-practices', 'gp-surgeries', 'supported-living', 'private-hospitals-and-clinics'] as const;
export type SectorSlug = (typeof SECTOR_SLUGS)[number];
export function isSectorSlug(x: string): x is SectorSlug { return (SECTOR_SLUGS as readonly string[]).includes(x); }
export const sectorPath = (slug: SectorSlug): string => join(SITE_DIR, 'capital-allowances', `${slug}.html`);

/** The self-hosted fonts (IBM Plex, SIL Open Font License): the only names /assets/fonts/ will serve. */
export const FONT_FILES = [
  'ibm-plex-sans-latin-400-normal.woff2', 'ibm-plex-sans-latin-500-normal.woff2', 'ibm-plex-sans-latin-600-normal.woff2',
  'ibm-plex-sans-condensed-latin-500-normal.woff2', 'ibm-plex-sans-condensed-latin-600-normal.woff2', 'ibm-plex-sans-condensed-latin-700-normal.woff2',
  'ibm-plex-mono-latin-400-normal.woff2', 'ibm-plex-mono-latin-500-normal.woff2', 'ibm-plex-mono-latin-600-normal.woff2',
] as const;
export const GSAP_PATH = join(import.meta.dirname, '..', '..', '..', '..', '..', 'node_modules', 'gsap', 'dist', 'gsap.min.js');

/** Where the page's script tag for GSAP points in the source file, and where it points when served. */
const GSAP_CDN = /<script src="https:\/\/cdnjs\.cloudflare\.com\/ajax\/libs\/gsap\/[0-9.]+\/gsap\.min\.js" defer><\/script>/;
const GSAP_LOCAL = '<script src="/assets/gsap.min.js" defer></script>';

export const TURNSTILE_ORIGIN = 'https://challenges.cloudflare.com';

/** The home page's policy: the site's own, plus Cloudflare's security check. Nothing else. */
export const HOME_PAGE_CSP =
  "default-src 'none'; style-src 'self'; img-src 'self' data:; font-src 'self'; " +
  `script-src 'self' ${TURNSTILE_ORIGIN}; frame-src ${TURNSTILE_ORIGIN}; ` +
  "form-action 'self'; frame-ancestors 'none'; base-uri 'none'";

export const HOME_PAGE_HEADERS: Readonly<Record<string, string>> = Object.freeze({
  'content-type': 'text/html; charset=utf-8',
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'no-referrer',
  'x-frame-options': 'DENY',
  'content-security-policy': HOME_PAGE_CSP,
});

export type HomeEdition = { readonly html: string; readonly css: string; readonly js: string; readonly headJs: string };

const INLINE: readonly [RegExp, string][] = [
  [/<style\b/i, 'an inline <style> block'],
  [/<script\b(?![^>]*\ssrc=)(?![^>]*type="application\/ld\+json")/i, 'an inline <script>'],
  [/\sstyle\s*=/i, 'a style attribute'],
  [/\son[a-z]+\s*=/i, 'an inline event handler'],
  [/href\s*=\s*["']?\s*javascript:/i, 'a javascript: link'],
];

/** Build a page's served edition from its text (Phase 160k: any page, by name). Pure, so a test can hand it a string.
 *  The <style> block becomes /assets/<name>.css. Scripts in the <head> become /assets/<name>-head.js where the first
 *  of them stood; scripts in the body become /assets/<name>.js where the LAST of them stood, so they run once the
 *  page is read. The structured data (ld+json) stays as it is; anything else inline is refused. */
export function buildEdition(source: string, name: string): HomeEdition {
  let rest = source.replace(/^\uFEFF/, '');
  const a = rest.indexOf('<style>');
  const b = a < 0 ? -1 : rest.indexOf('</style>', a);
  if (a < 0 || b < 0) throw new Error(`the ${name} page has no <style> block`);
  const css = rest.slice(a + '<style>'.length, b);
  rest = `${rest.slice(0, a)}<link rel="stylesheet" href="/assets/${name}.css">${rest.slice(b + '</style>'.length)}`;
  const headEnd = rest.indexOf('</head>');
  const head: string[] = [];
  const body: string[] = [];
  rest = rest.replace(/<script>([\s\S]*?)<\/script>\n?/g, (_m, text: string, at: number) => {
    if (headEnd >= 0 && at < headEnd) { head.push(text); return head.length === 1 ? '\u0000HEADJS\u0000' : ''; }
    body.push(text);
    return '\u0000BODYJS\u0000';
  });
  if (body.length === 0) throw new Error(`the ${name} page has no <script> block`);
  // only the last body marker becomes the script tag; the others are dropped
  let seen = 0;
  rest = rest.replace(/\u0000BODYJS\u0000/g, () => (++seen === body.length ? `<script src="/assets/${name}.js"></script>\n` : ''));
  rest = rest.replace('\u0000HEADJS\u0000', `<script src="/assets/${name}-head.js"></script>\n`);
  rest = rest.replace(GSAP_CDN, GSAP_LOCAL);
  for (const [re, what] of INLINE) {
    if (re.test(rest)) throw new Error(`the served ${name} page would carry ${what}`);
  }
  return { html: rest, css, js: body.join('\n;\n'), headJs: head.join('\n;\n') };
}

/** The home page's edition (its assets are /assets/home.css, /assets/home-head.js and /assets/home.js). */
export function buildHomeEdition(source: string): HomeEdition { return buildEdition(source, 'home'); }

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

const sectorCache = new Map<SectorSlug, { mtimeMs: number; edition: HomeEdition }>();

/** A sector landing page's edition (assets /assets/ca-<slug>.css, -head.js and .js), rebuilt when its file changes;
 *  `undefined` when the file is not beside the build. */
export function sectorEdition(slug: SectorSlug): HomeEdition | undefined {
  const path = sectorPath(slug);
  let mtimeMs: number;
  try { mtimeMs = statSync(path).mtimeMs; } catch { return undefined; }
  const hit = sectorCache.get(slug);
  if (hit?.mtimeMs === mtimeMs) return hit.edition;
  const edition = buildEdition(readFileSync(path, 'utf8'), `ca-${slug}`);
  sectorCache.set(slug, { mtimeMs, edition });
  return edition;
}

const fontCache = new Map<string, Buffer | null>();
// fixed at start-up from the list, so a request name only ever picks one of these paths (DB-W1)
const FONT_PATHS = new Map<string, string>(FONT_FILES.map((f) => [f, join(SITE_DIR, 'fonts', f)]));

/** A self-hosted font by its file name, or null for a name not on the list or a file not beside the build. */
export function fontFile(name: string): Buffer | null {
  const path = FONT_PATHS.get(name);
  if (path === undefined) return null;
  if (fontCache.has(name)) return fontCache.get(name) ?? null;
  let buf: Buffer | null = null;
  try { buf = readFileSync(path); } catch { buf = null; }
  fontCache.set(name, buf);
  return buf;
}
