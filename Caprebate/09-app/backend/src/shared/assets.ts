/**
 * The assets this application serves, AS CONSTANTS.
 *
 * 7 November 2026: the stylesheet is the one exception, and only in where its text is kept. It is read once,
 * when this module loads, from a fixed file the code names (src/styles/site.css), never from anything a request says;
 * so there is still no route that maps a request onto the filesystem. Everything else below is as it was.
 *
 * They are not read from disk, and that is deliberate rather than lazy: requirement
 * DB-W1 says client documents must live where no web-server route can reach them
 * by path, and the cleanest way to guarantee that is for the application to
 * have NO route that maps a request onto the filesystem at all.
 * `assertNoStaticFileRoute()` in objectstore.ts checks exactly that, and it can
 * only stay true if assets work this way. The supplied logo was added the
 * same way — a base64 constant in src/shared/brand-logo.ts, served under img-src 'self'.
 *
 * There is also no inline style anywhere, because the CSP has no
 * `unsafe-inline` and a single style attribute is what quietly brings it back.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * WHICH TAB OR SECTION IS CURRENT, BY POSITION. The current record tab was first marked by its id (details,
 * related, activity). The five long screens name their own tabs, and admin settings names its sections from its lists, so
 * the current one is marked by POSITION instead: the n-th panel targeted marks the n-th link. One rule per position, up to
 * MAX_TABS in src/shared/components.ts, which refuses to draw more.
 */
const CURRENT_BY_POSITION = Array.from({ length: 24 }, (_, i) => i + 1)
  .map((n) => `  .tabset:has(.tabpanel:nth-of-type(${n}):target,.tabpanel:nth-of-type(${n}) :target) .rtabs li:nth-child(${n}) a`)
  .join(',\n');

/**
 * THE CAP REBATE COLOUR TOKENS — from the brand book v1.0, slides 31 to 33 and 60.
 *
 * Proportions 60 / 30 / 10: surfaces are white and Mist, type and structure are Cap Ink and Body Grey, and Cap Mint is
 * for emphasis only — the current tab, the current stage, one highlight per layout. Muted grey is for captions and the
 * footer, and only on white (it is exactly 4.50:1 on Mist, which is too close to the line to rely on).
 *
 * THE ACCENT IS NOT CHOSEN YET (slide 31 asks the design team for "one HEX that passes 4.5:1 on white — for links, CTAs
 * and in-app states"). It is ONE token, --accent, set to Cap Ink until then, with --on-accent the text drawn on it.
 * When the accent arrives, it is a one-line change here and test/phase133c.test.ts checks it against white and Mist.
 */
export const BRAND_TOKENS: Readonly<Record<string, string>> = Object.freeze({
  mint: '#ABEDD8',
  ink: '#111111',
  white: '#ffffff',
  mist: '#F2F8F6',
  body: '#333333',
  mut: '#6B7280',
  accent: '#111111',
  'on-accent': '#ffffff',
  line: '#cfdcd7',
  ok: '#1d6b35', okbg: '#e6f4ea',
  warn: '#8a5300', warnbg: '#fff5e0',
  stop: '#a01e1e', stopbg: '#fcefef',
  // One colour for each group of claim stages (src/core/look.ts), from the mock-ups
  // the owner chose. Each group has a solid colour (white text on it), a light tint, and the darker text drawn on the tint.
  'g-win': '#1e4fa3', 'g-win-bg': '#dfe9f9', 'g-win-ink': '#1a438c',
  'g-gather': '#6b3fa0', 'g-gather-bg': '#ece3f7', 'g-gather-ink': '#55308a',
  'g-survey': '#0f6b5c', 'g-survey-bg': '#d4efe8', 'g-survey-ink': '#0b5548',
  'g-sign': '#8a5300', 'g-sign-bg': '#fbecd0', 'g-sign-ink': '#6e4300',
  'g-paid': '#1d6b35', 'g-paid-bg': '#dcf0e1', 'g-paid-ink': '#185c2d',
  nodate: '#e3e8e6', zebra: '#f6f9f8',
  // The back office in the layout the owner chose (the Cap Rebate Simple CRM design): a light
  // page (page), fine rules (rule) and grey column headings (thead). Its navy went for the home page's ink.
  page: '#f3f6f4', rule: '#dde6e2', thead: '#4f5b56',
  // The home page's own colours replace 160a's navy (the owner: "ensure our branding from the
  // home page matches the back end"). The menu down the left is the home page's ink ground (side) with its ivory words,
  // a lighter ink for hover (side-2) and its quiet words (side-mute); the page a pale mint-grey (page) with green-grey
  // rules and headings (rule, thead), so the working pages stay light and tables read easily.
  side: '#121614', 'side-2': '#232b28', 'side-mute': '#b4beb9', ivory: '#EDEAE2',
});

/**
 * EVERY TEXT-ON-GROUND PAIRING THE STYLESHEET USES, by token. test/phase133c.test.ts requires each at 4.5:1 or better,
 * and `assertNoWhiteOnMint` below refuses the one pairing the brand book forbids outright (slide 33: 1.3:1).
 */
export const TEXT_PAIRINGS: readonly (readonly [text: string, ground: string])[] = Object.freeze([
  ['ink', 'white'], ['ink', 'mist'], ['ink', 'mint'], ['body', 'white'], ['body', 'mist'], ['body', 'mint'],
  ['mut', 'white'], ['accent', 'white'], ['accent', 'mist'], ['on-accent', 'accent'],
  ['ok', 'white'], ['ok', 'mist'], ['ok', 'okbg'], ['warn', 'white'], ['warn', 'mist'], ['warn', 'warnbg'],
  ['stop', 'white'], ['stop', 'mist'], ['stop', 'stopbg'],
  // The Tasks tab's count when a task is overdue.
  ['white', 'stop'],
  // The stage groups (a label on its tint, white on its solid band), the solid number boxes, the black
  // table heading, the "no date" label and the striped rows.
  ['g-win-ink', 'g-win-bg'], ['white', 'g-win'], ['g-gather-ink', 'g-gather-bg'], ['white', 'g-gather'],
  ['g-survey-ink', 'g-survey-bg'], ['white', 'g-survey'], ['g-sign-ink', 'g-sign-bg'], ['white', 'g-sign'],
  ['g-paid-ink', 'g-paid-bg'], ['white', 'g-paid'], ['white', 'warn'], ['white', 'ok'], ['white', 'ink'], ['mint', 'ink'],
  ['ink', 'nodate'], ['ink', 'zebra'], ['body', 'zebra'],
  // The grey page, the column headings and the blue label (its navy pairings went with the navy in 160c).
  ['body', 'page'], ['thead', 'white'], ['thead', 'page'], ['thead', 'zebra'], ['g-win-ink', 'white'],
  // The home page's ink menu, its ivory and mint words on it, and ink words on the mint buttons.
  ['ivory', 'side'], ['ivory', 'side-2'], ['side-mute', 'side'], ['side-mute', 'side-2'], ['mint', 'side'], ['mint', 'side-2'],
  ['ink', 'page'], ['ink', 'mint'],
]);

const tokenCss = Object.entries(BRAND_TOKENS).map(([k, v]) => `--${k}:${v}`).join(';');

const HEADING_STACK = '"Bookman Old Style","Roboto Slab",Georgia,"Times New Roman",serif';
const BODY_STACK = 'Calibri,"Segoe UI",Inter,Arial,Helvetica,sans-serif';

/**
 * THE MENU'S ICONS, one per section, by the address its link opens: a plain character drawn before the words
 * (the design's own icons are characters too). Nothing is fetched (the stylesheet holds no url, test/phase133a), the
 * menu's markup is unchanged, and the icon is never read out ("/ ''" is its empty spoken text; the words name the section).
 */
const MENU_ICONS: readonly (readonly [href: string, codepoint: string])[] = Object.freeze([
  ['/staff', '25A6'],
  ['/staff/leads', '25C9'],
  ['/staff/clients', '2302'],
  ['/staff/pipeline', '2630'],
  ['/staff/claims', '25A4'],
  ['/staff/tasks', '2713'],
  ['/staff/finance', '00A3'],
  ['/staff/survey', '2637'],
  ['/staff/introducers', '263A'],
  ['/staff/introducer-rewards', '0025'],
  ['/staff/calendar', '25A5'],
  ['/staff/admin', '2699'],
  // The client portal's two screens.
  ['/portal', '25A4'], ['/portal/messages', '2709'],
]);
const MENU_ICON_CSS = MENU_ICONS.map(([href, c]) =>
  `body.crm .tabs-main>li>a[href="${href}"]::before{content:"\\${c}";content:"\\${c}" / ""}`).join('\n');

/**
 * THE STYLESHEET IS A REAL FILE: src/styles/site.css. It was
 * held here as text until then; the file is that text, byte for byte, as it was served (test/core/front-doors.test.ts holds its
 * SHA-256). Edit the CSS there. The parts made from code above (the brand tokens, the two font stacks, the menu's icons
 * and the current-tab selectors) must still be in it exactly as the code makes them: assertCssCarriesParts checks that when
 * this module loads, so a colour changed in one place and not the other stops the application from starting.
 */
export const SITE_CSS: string = readFileSync(join(import.meta.dirname, '..', 'styles', 'site.css'), 'utf8');

/** The parts of the stylesheet made from code, each of which must be in the file as the code makes it. */
export function cssPartsMissing(css: string): string[] {
  const parts: [string, string][] = [
    ['the brand tokens', `:root{${tokenCss};`], ['the heading font stack', HEADING_STACK], ['the body font stack', BODY_STACK],
    ['the menu icons', MENU_ICON_CSS], ['the current-tab selectors', CURRENT_BY_POSITION],
  ];
  return parts.filter(([, text]) => !css.includes(text)).map(([name]) => name);
}

export function assertCssCarriesParts(css: string): void {
  const missing = cssPartsMissing(css);
  if (missing.length > 0) throw new Error(`src/styles/site.css no longer carries ${missing.join(', ')} as the code makes them (src/shared/assets.ts)`);
}

assertCssCarriesParts(SITE_CSS);

/**
 * WHITE TEXT ON MINT IS FORBIDDEN (brand book slides 31, 33 and 60: 1.3:1). ENFORCED WHERE THE STYLES ARE MADE.
 *
 * Reads every rule of a stylesheet and refuses one that sets a mint background and a white (or --on-accent, while that
 * is white) text colour in the same rule. It runs on this stylesheet when the module loads, so a rule that pairs them
 * stops the application from starting; test/phase133c.test.ts runs it on the stylesheet and on a planted rule.
 */
export function whiteOnMintRules(css: string): string[] {
  const mint = new RegExp(`(var\\(--mint\\)|${BRAND_TOKENS['mint']})`, 'i');
  const white = /(^|[;{\s])color:\s*(#fff\b|#ffffff\b|white\b|var\(--white\)|var\(--on-accent\))/i;
  const out: string[] = [];
  for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const decl = m[2] ?? '';
    const bg = /background(-color)?:\s*([^;]+)/i.exec(decl);
    if (bg !== null && mint.test(bg[2] ?? '') && white.test(decl)) out.push((m[1] ?? '').trim());
  }
  return out;
}

export function assertNoWhiteOnMint(css: string): void {
  const bad = whiteOnMintRules(css);
  if (bad.length > 0) throw new Error(`white text on Cap Mint is forbidden by the brand book: ${bad.join(' | ')}`);
}

assertNoWhiteOnMint(SITE_CSS);

export const CSS_HEADERS: Readonly<Record<string, string>> = Object.freeze({
  'content-type': 'text/css; charset=utf-8',
  'x-content-type-options': 'nosniff',
  'cache-control': 'no-store',
});

export const PNG_HEADERS: Readonly<Record<string, string>> = Object.freeze({
  'content-type': 'image/png',
  'x-content-type-options': 'nosniff',
  'cache-control': 'no-store',
});
