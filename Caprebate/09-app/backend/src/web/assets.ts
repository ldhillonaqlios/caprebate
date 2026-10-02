/**
 * The assets this application serves, AS CONSTANTS.
 *
 * They are not read from disk, and that is deliberate rather than lazy: requirement
 * DB-W1 says client documents must live where no web-server route can reach them
 * by path, and the cleanest way to guarantee that is for the application to
 * have NO route that maps a request onto the filesystem at all.
 * `assertNoStaticFileRoute()` in objectstore.ts checks exactly that, and it can
 * only stay true if assets work this way. PHASE 133c added the supplied logo the
 * same way — a base64 constant in src/web/brand-logo.ts, served under img-src 'self'.
 *
 * There is also no inline style anywhere, because the CSP has no
 * `unsafe-inline` and a single style attribute is what quietly brings it back.
 */

/**
 * WHICH TAB OR SECTION IS CURRENT, BY POSITION — PHASE 133b. Phase 133a marked the current record tab by its id (details,
 * related, activity). The five long screens name their own tabs, and admin settings names its sections from its lists, so
 * the current one is marked by POSITION instead: the n-th panel targeted marks the n-th link. One rule per position, up to
 * MAX_TABS in src/web/components.ts, which refuses to draw more.
 */
const CURRENT_BY_POSITION = Array.from({ length: 24 }, (_, i) => i + 1)
  .map((n) => `  .tabset:has(.tabpanel:nth-of-type(${n}):target,.tabpanel:nth-of-type(${n}) :target) .rtabs li:nth-child(${n}) a`)
  .join(',\n');

/**
 * THE CAP REBATE COLOUR TOKENS — PHASE 133c, from the brand book v1.0, slides 31 to 33 and 60.
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
  // UI TIDY PHASE 1, 2 October 2026: one colour for each group of claim stages (src/web/look.ts), from the mock-ups
  // Lakhbir chose. Each group has a solid colour (white text on it), a light tint, and the darker text drawn on the tint.
  'g-win': '#1e4fa3', 'g-win-bg': '#dfe9f9', 'g-win-ink': '#1a438c',
  'g-gather': '#6b3fa0', 'g-gather-bg': '#ece3f7', 'g-gather-ink': '#55308a',
  'g-survey': '#0f6b5c', 'g-survey-bg': '#d4efe8', 'g-survey-ink': '#0b5548',
  'g-sign': '#8a5300', 'g-sign-bg': '#fbecd0', 'g-sign-ink': '#6e4300',
  'g-paid': '#1d6b35', 'g-paid-bg': '#dcf0e1', 'g-paid-ink': '#185c2d',
  nodate: '#e3e8e6', zebra: '#f6f9f8',
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
  // PHASE 135: the Tasks tab's count when a task is overdue.
  ['white', 'stop'],
  // UI TIDY PHASE 1: the stage groups (a label on its tint, white on its solid band), the solid number boxes, the black
  // table heading, the "no date" label and the striped rows.
  ['g-win-ink', 'g-win-bg'], ['white', 'g-win'], ['g-gather-ink', 'g-gather-bg'], ['white', 'g-gather'],
  ['g-survey-ink', 'g-survey-bg'], ['white', 'g-survey'], ['g-sign-ink', 'g-sign-bg'], ['white', 'g-sign'],
  ['g-paid-ink', 'g-paid-bg'], ['white', 'g-paid'], ['white', 'warn'], ['white', 'ok'], ['white', 'ink'], ['mint', 'ink'],
  ['ink', 'nodate'], ['ink', 'zebra'], ['body', 'zebra'],
]);

const tokenCss = Object.entries(BRAND_TOKENS).map(([k, v]) => `--${k}:${v}`).join(';');

const HEADING_STACK = '"Bookman Old Style","Roboto Slab",Georgia,"Times New Roman",serif';
const BODY_STACK = 'Calibri,"Segoe UI",Inter,Arial,Helvetica,sans-serif';

export const SITE_CSS = `
/* ================================================================== *
 * CAP REBATE — PHASE 133c, 17 September 2026. The layout is Phase 133a's;
 * the colours, type and logo are the brand book's (v1.0, slides 30-38).
 * System fonts only: no web font file and nothing fetched from
 * anywhere, so the Content-Security-Policy is unchanged.
 * Every class a screen used before this phase is still defined below.
 * ================================================================== */
:root{${tokenCss};--radius:.5rem;--shadow:0 1px 2px rgba(17,17,17,.06);--focus:var(--accent)}
*{box-sizing:border-box}
html{-webkit-text-size-adjust:100%}
body{margin:0;font:16px/1.6 ${BODY_STACK};color:var(--body);background:var(--white);font-variant-numeric:tabular-nums}
body.app{background:var(--mist)}
a{color:var(--accent);text-decoration:underline;text-underline-offset:.15em}
a:hover{text-decoration-thickness:2px}
:focus-visible{outline:3px solid var(--focus);outline-offset:2px;border-radius:2px}
.skip{position:absolute;left:-9999px;top:.5rem;z-index:50}.skip:focus{left:1rem;background:var(--white);color:var(--ink);padding:.6rem .9rem;border:2px solid var(--focus);border-radius:var(--radius)}
.vh{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;border:0}
h1,h2,h3,h4,h5,h6,.brand,.stat,.figbig{font-family:${HEADING_STACK};font-style:normal;color:var(--ink)}

/* ---------------- THE TYPE SCALE (slide 36) ---------------- */
h1{font-size:44px;font-weight:700;line-height:1.1;margin:.2rem 0 1rem}
h2{font-size:32px;font-weight:700;line-height:1.2;margin:.2rem 0 .7rem}
h3{font-size:24px;font-weight:600;line-height:1.3;margin:1.4rem 0 .4rem}
h4{font-size:20px;font-weight:600;line-height:1.4}
h5{font-size:18px;font-weight:600;line-height:1.4}
h6{font-size:16px;font-weight:600;line-height:1.4}
.caption{font-size:12px;line-height:1.5;color:var(--mut)}

/* ---------------- THE HEADER ---------------- */
.top{background:var(--white);border-bottom:1px solid var(--line)}
.topline{display:flex;flex-wrap:wrap;align-items:center;gap:.5rem 1.25rem;padding:.55rem 1.25rem 0;max-width:96rem;margin:0 auto}
body.public .topline{padding:.9rem 1.5rem;max-width:74rem}
.brand{display:inline-flex;align-items:center;gap:.5rem;font-weight:700;font-size:20px;text-decoration:none;color:var(--ink);min-height:2.5rem}
.brand:hover{text-decoration:underline}
/* THE LOGO: the supplied mono-ink lockup, at 120 px wide (the minimum is 100), on white, top-left, with clear space as
   padding on its container rather than baked into the file (slide 27). */
.logo{display:inline-block;padding:14px;background:var(--white);line-height:0;text-decoration:none}
.logo img{display:block;width:120px;height:auto}
.top nav:not(.appnav) a{margin-right:1rem;color:var(--ink);font-size:16px}
.util{display:flex;align-items:center;gap:.75rem;margin-left:auto;flex-wrap:wrap}
.gsearch{display:flex;align-items:center;gap:0}
.gsearch input{width:22rem;max-width:40vw;min-height:2.5rem;border:1px solid var(--line);border-right:0;border-radius:var(--radius) 0 0 var(--radius);padding:.35rem .7rem;font:inherit;background:var(--white)}
.gsearch button{border-radius:0 var(--radius) var(--radius) 0;min-height:2.5rem}
/* PHASE 135: the open-task count sits on the Tasks tab; red when any is overdue. */
.tabcount{display:inline-grid;place-items:center;min-width:1.5rem;height:1.5rem;margin-left:.3rem;padding:0 .35rem;border-radius:999px;background:var(--accent);color:var(--on-accent);font-weight:700;font-size:14px;line-height:1}
.tabcount.late{background:var(--stop);color:var(--white)}
.helplink{color:var(--ink);font-weight:600;font-size:16px}
.usermenu{position:relative}
.usermenu summary{color:var(--ink);font-weight:600;display:flex;align-items:center;gap:.45rem;cursor:pointer;list-style:none;padding:.25rem .4rem;border-radius:var(--radius);min-height:2.5rem}
.usermenu summary::-webkit-details-marker{display:none}
.usermenu summary::after{content:"\\25BE";color:var(--ink);font-size:14px}
.avatar{display:inline-grid;place-items:center;width:2rem;height:2rem;border-radius:50%;background:var(--mint);color:var(--ink);font-weight:700}
.uname{font-size:16px}
.menu-pop{position:absolute;right:0;top:calc(100% + .3rem);min-width:13rem;background:var(--white);border:1px solid var(--line);border-radius:var(--radius);box-shadow:0 8px 24px rgba(17,17,17,.12);padding:.4rem;z-index:20}
.menu-pop a,.menu-pop .linkish{display:block;width:100%;text-align:left;padding:.5rem .6rem;border-radius:.35rem;color:var(--ink);text-decoration:none;font-size:16px}
.menu-pop a:hover,.menu-pop .linkish:hover{background:var(--mist)}
.menu-pop .who{margin:.2rem .6rem .5rem;font-weight:600;font-size:16px;color:var(--ink)}
.appnav{flex-basis:100%}
.tabs-main{display:flex;flex-wrap:wrap;list-style:none;margin:0;padding:0;gap:0 .15rem}
.tabs-main>li>a,.tabs-main summary{display:block;padding:.6rem .8rem .55rem;color:var(--ink);text-decoration:none;font-size:16px;border-bottom:3px solid transparent;cursor:pointer;white-space:nowrap}
.tabs-main>li>a:hover,.tabs-main summary:hover{background:var(--mist)}
/* THE CURRENT TAB — mint for emphasis, with an ink rule and bold type so the state never rests on the mint alone. */
.tabs-main a[aria-current="page"]{border-bottom-color:var(--ink);background:var(--mint);font-weight:700;color:var(--ink)}
.tabs-main .more{position:relative}
.tabs-main summary{list-style:none}
.tabs-main summary::-webkit-details-marker{display:none}
.tabs-main summary::after{content:" \\25BE";color:var(--ink)}
.tabs-main .has-current>summary{border-bottom-color:var(--ink);font-weight:700}
.tabs-main .more ul{list-style:none;margin:0;padding:.4rem;position:absolute;left:0;top:100%;min-width:14rem;background:var(--white);border:1px solid var(--line);border-radius:var(--radius);box-shadow:0 8px 24px rgba(17,17,17,.12);z-index:20}
.tabs-main .more ul a{display:block;padding:.5rem .6rem;border-radius:.35rem;color:var(--ink);text-decoration:none}
.tabs-main .more ul a:hover{background:var(--mist)}
.tabs-main .more ul a[aria-current="page"]{background:var(--mint);font-weight:700;border-bottom-color:transparent}

/* ---------------- PAGE ---------------- */
main{max-width:46rem;margin:0 auto;padding:2rem 1.5rem 4rem}
main.wide{max-width:74rem}
body.app main{max-width:60rem;padding:1.25rem 1.25rem 3rem}
body.app main.wide{max-width:96rem}
main.wide td,main.wide th{vertical-align:top}
main.wide .when{white-space:nowrap}
p{margin:.6rem 0}
code{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:.9em;background:var(--mist);padding:.05rem .3rem;border-radius:.25rem;color:var(--ink)}
hr{border:0;border-top:1px solid var(--line);margin:1.5rem 0}
.group,.eyebrow{font-size:14px;letter-spacing:.04em;color:var(--body);margin:0 0 .35rem;font-weight:600}
.help{color:var(--body);font-size:16px}
.vc-panel{margin:1rem 0}
.cprogress{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:6px;list-style:none;padding:0;margin:.9rem 0 .7rem}
.cprogress li{display:flex;flex-direction:column;gap:4px;font-size:13px;color:var(--mut);min-width:0}
.cprogress .bar{display:block;height:6px;border-radius:3px;background:var(--line)}
.cprogress .done .bar{background:var(--ok)}
.cprogress .now .bar{background:var(--ink)}
.cprogress .now .name{color:var(--ink);font-weight:700}
.cactions{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-top:.3rem}
.cactions .btn{display:inline-flex;align-items:center;gap:6px;padding:.45rem .9rem;border:1px solid var(--line);border-radius:var(--radius);text-decoration:none;color:var(--ink);font-weight:600;background:var(--white)}
.cmore{position:relative}
.cmore summary{cursor:pointer;padding:.45rem .9rem;border:1px solid var(--line);border-radius:var(--radius);font-weight:600;list-style:none;background:var(--white)}
.cmore ul{position:absolute;z-index:5;background:var(--white);border:1px solid var(--line);border-radius:var(--radius);padding:.4rem;margin:.3rem 0 0;list-style:none;min-width:15rem}
.cmore li a{display:block;padding:.4rem .5rem;text-decoration:none;color:var(--ink)}
.cmore li a:hover{background:var(--mist)}
.ctop{display:grid;grid-template-columns:minmax(0,1.4fr) minmax(0,1fr);gap:16px;margin:1rem 0;align-items:start}
.cactions .filesbtn-row{margin:0}
.lk-summary{display:flex;flex-wrap:wrap;gap:6px;margin:.4rem 0}
.lk-summary .lk{padding:.1rem .6rem;border-radius:999px;border:1px solid var(--line);background:var(--mist)}
.lk-g-done{color:var(--ok)}
.lk-g-failed{color:var(--stop)}
.lk-list summary{cursor:pointer;font-weight:600}
.cnext,.clookups{background:var(--white);border:1px solid var(--line);border-radius:12px;padding:1rem 1.2rem}
.cnext{border:2px solid var(--mint)}
.cnext-title{font-weight:700;font-size:18px;color:var(--ink);margin:.2rem 0 .5rem}
.cfacts{list-style:none;padding:0;margin:0 0 .8rem}
.cfacts li{padding:.2rem 0;color:var(--body)}
.cfacts .ok>span:first-child{color:var(--ok);font-weight:700}
.cblocks{margin-top:.8rem;padding:.6rem .8rem;border-radius:var(--radius);background:var(--warnbg);color:var(--warn)}
.cblocks p{margin:.2rem 0}
.clookups ul{list-style:none;padding:0;margin:.3rem 0 .6rem}
.clookups li{display:flex;justify-content:space-between;gap:8px;padding:.25rem 0;border-bottom:1px solid var(--mist)}
.lk{font-size:14px;white-space:nowrap}
.lk-fired{color:var(--ok)}
.lk-failed{color:var(--stop)}
.lk-not-run,.lk-not-permitted-yet,.lk-off{color:var(--mut)}
.ctabs{display:flex;flex-wrap:wrap;gap:4px;border-bottom:1px solid var(--line);margin:1.2rem 0 .8rem}
.ctab-link{padding:.55rem .9rem;border:1px solid transparent;border-bottom:0;border-radius:8px 8px 0 0;text-decoration:none;color:var(--body);font-weight:600;margin-bottom:-1px}
.ctab-link:hover{background:var(--mist)}
.ctab{display:none}
.ctab:target,.ctab:has(:target){display:block}
.ctab-panels:not(:has(:target)) .ctab.is-default{display:block}
.ctabwrap:not(:has(.ctab-panels :target)) .ctab-link.is-default,.ctabwrap:has(.ct-chat:target,.ct-chat :target) .ctl-chat,.ctabwrap:has(.ct-claims:target,.ct-claims :target) .ctl-claims,.ctabwrap:has(.ct-properties:target,.ct-properties :target) .ctl-properties,.ctabwrap:has(.ct-questions:target,.ct-questions :target) .ctl-questions,.ctabwrap:has(.ct-people:target,.ct-people :target) .ctl-people,.ctabwrap:has(.ct-checks:target,.ct-checks :target) .ctl-checks,.ctabwrap:has(.ct-files:target,.ct-files :target) .ctl-files,.ctabwrap:has(.ct-activity:target,.ct-activity :target) .ctl-activity{background:var(--white);border-color:var(--line);color:var(--ink)}
@media (max-width:760px){.ctop{grid-template-columns:minmax(0,1fr)}.cprogress{grid-template-columns:repeat(3,minmax(0,1fr))}}
.via{display:inline-block;font-size:12px;font-weight:700;letter-spacing:.02em;border:1px solid var(--line);border-radius:999px;padding:0 .5rem;margin-right:.25rem}
.msgsubj{font-weight:700;margin:.2rem 0}
.newdot{display:inline-flex;align-items:center;justify-content:center;min-width:1.35em;height:1.35em;padding:0 .35em;margin-left:.35rem;border-radius:999px;background:var(--stop);color:var(--white);font-size:12px;font-weight:700;line-height:1;vertical-align:middle;text-decoration:none}
.convo{display:grid;grid-template-columns:minmax(0,5fr) minmax(0,6fr);gap:1.2rem;align-items:start;margin-top:1rem}
.convo-write,.convo-chain{border:1px solid var(--line);border-radius:var(--radius);background:var(--white);padding:1rem 1.1rem;min-width:0}
.convo-chain .chat{max-height:none}
.echain{border:1px solid var(--line);border-radius:var(--radius);padding:.4rem .8rem;margin:0 0 .7rem}
.echain>summary{text-decoration:none;color:var(--ink)}
.echain-subj{font-weight:700}
.echeck{margin:0 0 .8rem}
.echeck-bad{color:var(--stop);font-weight:600}
.echain-meta{display:block;font-weight:400}
.echain.is-reply{border:2px solid var(--mint)}
.msg.is-new{border-left:3px solid var(--stop)}
@media (max-width:760px){.convo{grid-template-columns:minmax(0,1fr)}}
/* 1 Oct 2026 — Home as a dashboard (src/web/staff-dashboard.ts) */
.dash-tabs{display:flex;flex-wrap:wrap;gap:4px;border-bottom:1px solid var(--line);margin:0 0 1rem}
.dash-tab{padding:.55rem 1rem;border:1px solid transparent;border-bottom:0;border-radius:8px 8px 0 0;text-decoration:none;color:var(--body);font-weight:600;margin-bottom:-1px}
.dash-tab[aria-current="page"]{background:var(--white);border-color:var(--line);color:var(--ink);border-bottom:2px solid var(--mint)}
.topline .dash-tabs{border-bottom:0;margin:0 0 0 1rem;gap:4px;align-items:center}
.topline .dash-tab{padding:.4rem .9rem;border:1px solid var(--line);border-radius:999px;margin:0;font-size:15px}
.topline .dash-tab:hover{background:var(--mist)}
.topline .dash-tab[aria-current="page"]{background:var(--mint);border-color:var(--mint);color:var(--ink)}
.dash-strip{list-style:none;margin:0 0 1.2rem;padding:0;display:grid;grid-template-columns:repeat(auto-fit,minmax(11rem,1fr));gap:12px}
.dash-stat a{display:flex;flex-direction:column;gap:2px;padding:.9rem 1rem;border:1px solid var(--line);border-radius:var(--radius);background:var(--white);text-decoration:none;color:var(--ink);height:100%;box-sizing:border-box}
.dash-stat a:hover{border-color:var(--mint)}
.dash-num{font-size:34px;font-weight:700;line-height:1.1}
.dash-label{font-weight:600}
.dash-sub{font-size:14px;color:var(--mut)}
.dash-stat.late a{border-left:4px solid var(--stop)}
.dash-stat.late .dash-sub{color:var(--stop)}
.dash-stat.ok a{border-left:4px solid var(--ok)}
.dash-grid{display:grid;grid-template-columns:minmax(0,3fr) minmax(0,2fr);gap:16px;align-items:start}
.dash-card{border:1px solid var(--line);border-radius:var(--radius);background:var(--white);padding:1rem 1.1rem;margin:0 0 1.4rem;min-width:0}
.dash-card-h{display:flex;flex-wrap:wrap;justify-content:space-between;align-items:baseline;gap:.5rem;margin:0 0 .6rem}
.dash-card-h h2{font-size:24px;margin:0}
.dash-list{list-style:none;margin:0;padding:0}
.dash-list li{display:flex;flex-wrap:wrap;align-items:center;gap:.5rem;padding:.55rem 0;border-top:1px solid var(--line)}
.dash-list li:first-child{border-top:0}
.dash-list .act-cta{margin-left:auto}
.acts{list-style:none;margin:0 0 .6rem;padding:0}
.act{display:grid;grid-template-columns:4.2rem minmax(0,1fr) auto;gap:.75rem;align-items:center;padding:.65rem 0;border-top:1px solid var(--line)}
.act:first-child{border-top:0}
.act-when{font-weight:700;color:var(--ink)}
.act.past .act-when{color:var(--mut)}
.act.late .act-when{color:var(--stop)}
.act-phone{font-weight:700;white-space:nowrap}
.act-cta{white-space:nowrap}
.btn.act-cta{display:inline-flex;align-items:center;padding:.45rem .9rem;border:1px solid var(--line);border-radius:var(--radius);text-decoration:none;color:var(--ink);font-weight:600;background:var(--white)}
.wk{list-style:none;margin:0 0 .8rem;padding:0;display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:6px}
.wk-day{border:1px solid var(--line);border-radius:8px;padding:.45rem .5rem;min-height:6.5rem;background:var(--white);min-width:0}
.wk-day.today{border:2px solid var(--mint)}
.wk-day.past{background:var(--mist)}
.wk-h{margin:0 0 .3rem;font-weight:700;color:var(--ink)}
.wk-h span{font-weight:400;color:var(--mut)}
.wk-free{margin:0;color:var(--mut);font-size:14px}
.wk-items{list-style:none;margin:0;padding:0;font-size:14px}
.wk-items li{margin:0 0 .3rem;overflow-wrap:anywhere}
.wk-call a{text-decoration:none;color:var(--ink)}
.wk-block{background:var(--warnbg);border-radius:6px;padding:.15rem .3rem}
.wk-nav{font-size:15px}
.wk-form{display:grid;grid-template-columns:repeat(auto-fit,minmax(10rem,1fr));gap:.4rem .8rem;align-items:end;max-width:56rem}
.wk-form .fl{margin:0}
.wk-form .cta,.wk-form .help{grid-column:1/-1;justify-self:start}
.chip-ok{background:var(--okbg);color:var(--ok);border-color:#b7d9c2}
/* 1 Oct 2026 — Communication (src/web/communication.ts): one form, the whole conversation */
.comms{display:grid;grid-template-columns:minmax(0,5fr) minmax(0,8fr);gap:18px;align-items:start}
.pane{border:1px solid var(--line);border-radius:var(--radius);background:var(--white);padding:1rem 1.1rem;min-width:0}
.pane h2{font-size:22px;margin:0 0 .7rem}
.composer .f{margin:0 0 .75rem}.composer .f label{display:block;font-weight:700;color:var(--ink);margin:0 0 .25rem;font-size:15px}
.composer .fi{width:100%;box-sizing:border-box}
.composer .hint{font-size:14px;color:var(--mut);margin:.25rem 0 0}
.composer .only,.composer .only-btn{display:none}
.composer:has(#via option[value=email]:checked) .for-email,.composer:has(#via option[value=whatsapp]:checked) .for-whatsapp,
.composer:has(#via option[value=portal]:checked) .for-portal,.composer:has(#via option[value=team]:checked) .for-team,
.composer:has(#via option[value=zoom]:checked) .for-zoom,.composer:has(#via option[value=call]:checked) .for-call{display:block}
.composer:has(#via option[value=email]:checked) .only-btn.for-email,.composer:has(#via option[value=whatsapp]:checked) .only-btn.for-whatsapp,
.composer:has(#via option[value=portal]:checked) .only-btn.for-portal,.composer:has(#via option[value=team]:checked) .only-btn.for-team{display:inline-flex}
.composer:has(#via option[value=email]:checked) .for-msg,.composer:has(#via option[value=whatsapp]:checked) .for-msg,
.composer:has(#via option[value=portal]:checked) .for-msg,.composer:has(#via option[value=team]:checked) .for-msg{display:block}
.team-note{background:var(--warnbg);border:1px solid var(--warn);color:var(--ink);border-radius:8px;padding:.45rem .6rem;font-size:14px;margin:0 0 .75rem}
.sendrow{display:flex;gap:.6rem;align-items:center;flex-wrap:wrap;margin:0 0 .4rem}
.replying{display:flex;justify-content:space-between;gap:.5rem;align-items:center;background:var(--mist);border:1px solid var(--line);border-radius:8px;padding:.45rem .6rem;margin:0 0 .8rem;font-size:14px}
.or{display:flex;align-items:center;gap:.6rem;color:var(--mut);font-size:13px;margin:.8rem 0}.or:before,.or:after{content:"";flex:1;border-top:1px solid var(--line)}
.searchrow{display:flex;gap:.5rem;margin:0 0 .6rem}.searchrow .fi{flex:1;min-width:0}
.found{font-size:14px;color:var(--mut);margin:0 0 .6rem}
.filters{display:flex;flex-wrap:wrap;gap:6px;margin:0 0 .8rem}
.filters a{border:1px solid var(--line);border-radius:999px;padding:.25rem .7rem;text-decoration:none;color:var(--ink);font-size:14px;font-weight:600;background:var(--white)}
.filters a[aria-current]{background:var(--ink);color:var(--white);border-color:var(--ink)}
.flow{list-style:none;margin:0;padding:0 .2rem 0 0;display:flex;flex-direction:column-reverse;gap:.55rem;max-height:46rem;overflow:auto}
.flow .day{align-self:center;font-size:13px;color:var(--mut);font-weight:700;margin:.4rem 0 .1rem}
.flow .newline{align-self:stretch;border-top:2px solid var(--stop);text-align:center;font-size:12px;font-weight:700;color:var(--stop);margin:.6rem 0 .3rem}
.flow .newline span{background:var(--white);padding:0 .5rem;position:relative;top:-.75em}
.flow .cm-li{display:flex;flex-direction:column}
.flow a.it{display:block;max-width:82%;border:1px solid var(--line);border-radius:10px;padding:.5rem .75rem;background:var(--white);align-self:flex-start;text-decoration:none;color:var(--body)}
.flow a.it.ours{align-self:flex-end;background:var(--mist)}
.flow a.it.it-team,.flow a.it.it-call,.flow a.it.it-zoom{align-self:stretch;max-width:none}
.flow a.it.it-team{background:var(--warnbg);border-left:4px solid var(--warn)}
.flow a.it.it-call{background:var(--mist);border-style:dashed}
.flow a.it.it-zoom{background:#f3f5ff;border-left:4px solid #5568d9}
.flow a.it:hover{border-color:var(--ink);box-shadow:0 1px 4px rgba(0,0,0,.08)}
.flow a.it:focus-visible{outline:3px solid var(--focus);outline-offset:2px}
.flow .meta{font-size:13px;color:var(--mut);margin:0 0 .2rem;display:flex;gap:.35rem;align-items:center;flex-wrap:wrap}
.flow .who{font-weight:700;color:var(--ink)}
.flow .subj{font-weight:700;margin:.1rem 0 .2rem;color:var(--ink)}
.flow .body{margin:0;white-space:pre-wrap;overflow-wrap:anywhere}
.flow .reply-hint{display:none;font-size:12px;font-weight:700;color:var(--ink);margin-left:auto}
.flow a.it:hover .reply-hint,.flow a.it:focus .reply-hint{display:inline}
.ch{display:inline-block;border-radius:999px;padding:0 .5rem;font-size:12px;font-weight:700;border:1px solid}
.ch-email{background:#e8f0fb;color:#1f4f8f;border-color:#b9cdea}
.ch-whatsapp{background:#e6f6ea;color:#17663a;border-color:#b5e0c2}
.ch-portal{background:#e6f7f1;color:#1e5c48;border-color:var(--mint)}
.ch-team{background:#fff3d6;color:#7a5200;border-color:#e7c98a}
.ch-call{background:#eceeed;color:#3b403e;border-color:#cfd4d2}
.ch-zoom{background:#e9ecfd;color:#2d3fa8;border-color:#bfc7f5}
.new-pill{background:var(--stop);color:var(--white);border-radius:999px;font-size:12px;font-weight:700;padding:0 .45rem}
mark{background:#ffe58a;color:inherit;padding:0 .1em;border-radius:3px}
@media (max-width:900px){.comms{grid-template-columns:minmax(0,1fr)}.flow a.it{max-width:100%}}
/* 1 Oct 2026 — the survey pack (src/web/survey-pack-pages.ts): chapters, the book, the totals */
.pack{display:grid;grid-template-columns:minmax(0,13rem) minmax(0,1fr) minmax(0,15rem);gap:18px;align-items:start;margin:.6rem 0 1rem}
.pack-ch{border:1px solid var(--line);border-radius:var(--radius);background:var(--white);padding:.7rem 0;position:sticky;top:.6rem}
.pack-ch-h{font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:var(--mut);margin:0 .9rem .4rem}
.pack-ch ol{list-style:none;margin:0;padding:0}
.pack-ch a{display:block;padding:.28rem .9rem;color:var(--ink);text-decoration:none;font-size:15px}
.pack-ch a[aria-current]{background:var(--mist);border-left:4px solid var(--ink);padding-left:calc(.9rem - 4px);font-weight:700}
.pack-ch a.pk-later{color:var(--mut)}
.pk-key{margin:.7rem .9rem 0;display:flex;flex-wrap:wrap;gap:4px}
.pack-book{border:1px solid var(--line);border-radius:var(--radius);background:var(--white);padding:1.1rem 1.2rem;min-width:0}
.pack-book h1{margin:0 0 .4rem}
.pack-side{display:flex;flex-direction:column;gap:12px;position:sticky;top:.6rem}
.pk-card{border:1px solid var(--line);border-radius:var(--radius);background:var(--white);padding:.9rem 1rem}
.pk-card h2{font-size:19px;margin:0 0 .5rem}
dl.pk-dl{display:block;margin:0}.pk-dl div{display:flex;justify-content:space-between;gap:.5rem;border-bottom:1px solid var(--line);padding:.3rem 0}
.pk-dl dt{color:var(--body)}.pk-dl dd{margin:0;font-weight:700;font-variant-numeric:tabular-nums}
.pk-log{margin:0;padding-left:1.1rem;font-size:14px}.pk-log li{margin:.3rem 0}
.pk-src{display:inline-block;border-radius:999px;padding:0 .45rem;font-size:12px;font-weight:700;border:1px solid;white-space:nowrap}
.pk-ev{background:#e6f6ea;color:#17663a;border-color:#b5e0c2}
.pk-dr{background:#fff3d6;color:#7a5200;border-color:#e7c98a}
.pk-sv{background:#e9ecfd;color:#2d3fa8;border-color:#bfc7f5}
.pk-need{background:var(--white);color:var(--stop);border-color:var(--stop)}
.pk-gap{color:var(--mut)}
.pk-scroll{overflow-x:auto}
.pk-table{width:100%;border-collapse:collapse;font-size:15px}
.pk-lines td:first-child{min-width:13rem}.pk-lines td.n{white-space:nowrap}
.pk-table th,.pk-table td{border-bottom:1px solid var(--line);padding:.4rem .4rem;vertical-align:top;text-align:left}
.pk-table .n{text-align:right;font-variant-numeric:tabular-nums}
.pk-table .pk-grp th{background:var(--mist);font-weight:700}
.pk-table .pk-tot th,.pk-table .pk-tot td{border-top:2px solid var(--ink);font-weight:700}
.pk-table tr.pk-mine td{background:#f3f5ff}
.pk-table tr.pk-edit td{background:var(--warnbg);border-top:2px solid var(--warn);border-bottom:2px solid var(--warn)}
.pk-fields{display:grid;grid-template-columns:repeat(auto-fit,minmax(10rem,1fr));gap:.6rem;margin:.3rem 0 .5rem}
.pk-fields label,.pk-why-l{display:block;font-weight:700;font-size:14px}
.pk-why{width:100%}.pk-why-s{min-width:16rem}
.pk-side-forms{display:flex;flex-wrap:wrap;gap:.6rem 1.2rem;margin-top:.7rem;padding-top:.6rem;border-top:1px dashed var(--warn)}
.pk-side-forms form,.pk-out form{display:inline-flex;flex-wrap:wrap;gap:.4rem;align-items:center}
.pk-danger{color:var(--stop);border:1px solid var(--stop)}
.pool{display:inline-block;border-radius:999px;padding:0 .45rem;font-size:12px;font-weight:700}.pool-mp{background:#e6f7f1;color:#1e5c48}.pool-sr{background:#e9ecfd;color:#2d3fa8}
.pathway{display:flex;margin:.8rem 0 .6rem;border:1px solid var(--line);border-radius:var(--radius);overflow:hidden}
.pathway div{flex:1;padding:.6rem .7rem;font-size:14px;border-left:1px solid var(--line)}.pathway div:first-child{border-left:0}
.pathway b{display:block;font-size:18px;margin:.15rem 0;font-variant-numeric:tabular-nums}.pathway span{font-size:12px;color:var(--mut)}
.pathway .pathway-end{background:var(--ink);color:var(--white)}.pathway .pathway-end span{color:var(--white)}
.pk-bar{display:flex;height:14px;border-radius:4px;overflow:hidden;margin:.3rem 0 1rem;background:#4b63d1}
.pk-bar-mp{display:block;background:#2f9c7e}.pk-bar-sr{display:block;flex:1}
.pk-w0{width:0%}.pk-w5{width:5%}.pk-w10{width:10%}.pk-w15{width:15%}.pk-w20{width:20%}.pk-w25{width:25%}.pk-w30{width:30%}.pk-w35{width:35%}.pk-w40{width:40%}.pk-w45{width:45%}.pk-w50{width:50%}.pk-w55{width:55%}.pk-w60{width:60%}.pk-w65{width:65%}.pk-w70{width:70%}.pk-w75{width:75%}.pk-w80{width:80%}.pk-w85{width:85%}.pk-w90{width:90%}.pk-w95{width:95%}.pk-w100{width:100%}
.pk-needed{columns:2;font-size:14px}.pk-needed li{margin:.15rem 0}
.pk-problem{border-color:var(--stop)}
.pk-out{font-size:14px}.pk-out li{margin:.4rem 0}
.pk-lv{display:inline-block;border-radius:999px;padding:.05rem .6rem;font-weight:700;font-size:14px;border:1px solid}
.pk-lv-green{background:var(--okbg);color:var(--ink);border-color:var(--ok)}
.pk-lv-urgent{background:#e9ecfd;color:#2d3fa8;border-color:#bfc7f5}
.pk-lv-amber{background:var(--warnbg);color:var(--ink);border-color:var(--warn)}
.pk-lv-red{background:var(--stopbg);color:var(--ink);border-color:var(--stop)}
.pk-verdict{border:2px solid;border-radius:var(--radius);padding:.8rem 1rem;margin:.8rem 0 1.2rem}
.pk-verdict-h{font-size:17px;margin:0 0 .4rem}
.pk-verdict ul{margin:.2rem 0 .6rem;font-size:14px}
.pk-qs{padding-left:1.2rem}.pk-q{margin:0 0 1rem;padding:.6rem .7rem;border:1px solid var(--line);border-radius:var(--radius)}
.pk-q-open{border-color:var(--warn);background:var(--warnbg)}
.pk-q-ask{margin:0 0 .3rem}.pk-q-ans{margin:.3rem 0}
.pk-multi{display:flex;flex-direction:column;gap:.2rem;font-weight:400}
.pk-q-form{margin-top:.5rem}
.pk-add{border:1px solid var(--line);border-radius:var(--radius);padding:.8rem 1rem;margin:1rem 0}
.pk-choose{display:flex;flex-wrap:wrap;gap:.6rem;align-items:center}
/* 2 Oct 2026 — the pack's signing chapter and its approved versions (src/web/pack-approve.ts) */
.pk-checks{list-style:none;padding:0;margin:.6rem 0 1rem}.pk-checks li{padding:.45rem .6rem;border:1px solid var(--line);border-left:4px solid var(--stop);border-radius:var(--radius);margin:.35rem 0;font-size:15px}
.pk-checks li.pk-ok{border-left-color:var(--ok)}
.pk-tick{color:var(--ok);font-weight:700}
/* 2 Oct 2026 — "Show us your building" and the surveyor's chapter 2 (src/web/evidence-pages.ts) */
.ev-two{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin:1rem 0 1.4rem}
.ev-opt{border:2px solid var(--ink);border-radius:10px;padding:1rem 1.1rem;background:var(--white)}
.ev-alt{border-color:var(--line)}
.ev-opt h2{font-size:20px;margin:0 0 .4rem}
.ev-bar{height:10px;background:#e6ece9;border-radius:5px;overflow:hidden;margin:.6rem 0 .3rem}.ev-bar i{display:block;height:10px;background:var(--ok)}
.ev-group{border:1px solid var(--line);border-radius:10px;margin:.8rem 0;overflow:hidden;background:var(--white)}
.ev-group h2{background:var(--mist);margin:0;padding:.5rem .9rem;font-size:17px;display:flex;justify-content:space-between;gap:.5rem}
.ev-group h2 span{font-size:13px;color:var(--mut)}
.ev-item{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:10px;padding:.6rem .9rem;border-top:1px solid var(--line);align-items:center}
.ev-right{display:flex;flex-wrap:wrap;gap:6px;align-items:center;justify-content:flex-end}
.ev-right form.inline{display:inline}
.ev-st{display:inline-block;border-radius:999px;padding:0 .5rem;font-size:12px;font-weight:700;border:1px solid}
.ev-ok{background:var(--okbg);color:var(--ok);border-color:var(--ok)}.ev-skip{background:#eceeed;color:#3b403e;border-color:#cfd4d2}.ev-todo{background:var(--white);color:var(--stop);border-color:var(--stop)}
.ev-thumb{width:72px;height:54px;object-fit:cover;border-radius:5px;border:1px solid var(--line);vertical-align:middle}
.ev-phone{max-width:30rem;margin:0 auto}
.ev-phone h1{font-size:28px}
.ev-rules{font-size:15px}
.ev-have{display:flex;flex-wrap:wrap;gap:10px;margin:.6rem 0}.ev-have figure{margin:0;text-align:center}
.ev-take{border:1px solid var(--line);border-radius:10px;padding:.8rem 1rem;margin:.8rem 0;background:var(--white)}
.ev-take .ck{display:block;margin:.6rem 0;font-weight:700}
.ev-file,.ev-note{display:block;font-weight:700;margin:.4rem 0}
.ev-file input{display:block;margin-top:.4rem;font-size:16px}
.ev-note .fi{width:100%}
.ev-nav{margin-top:1rem}
.ev-guide{max-width:46rem}
.ev-card{border:2px solid var(--ink)}
.ev-many{border:1px solid var(--line);border-radius:10px;padding:1rem 1.1rem;margin:0 0 1.2rem;background:var(--white)}
.ev-many .ev-take{border:2px dashed var(--ink)}
.ev-wait{background:#fff5e0;color:#8a5300;border:1px solid #e7c98a;border-radius:8px;padding:.5rem .8rem;font-weight:700;margin:.6rem 0}
.ev-sort{display:grid;grid-template-columns:repeat(auto-fill,minmax(16rem,1fr));gap:14px;margin:.8rem 0}
.ev-card-photo{margin:0;border:1px solid var(--line);border-radius:10px;padding:.6rem;background:var(--white)}
.ev-card-photo label{display:block;font-weight:700;margin-top:.4rem}
.ev-card-photo select{width:100%}
.ev-lock{display:inline-block;background:var(--okbg,#e6f4ea);color:var(--ok,#1d6b35);border:1px solid var(--ok,#1d6b35);border-radius:999px;padding:0 .5rem;font-size:12px;font-weight:700}
.ev-progress{border:1px solid var(--line);border-radius:10px;padding:.8rem 1rem;margin:.8rem 0;background:var(--white)}
.ev-sendlist{list-style:none;margin:.6rem 0;padding:0;border:1px solid var(--line);border-radius:8px}
.ev-sendlist li{display:flex;justify-content:space-between;gap:10px;padding:.35rem .7rem;border-top:1px solid var(--line);font-size:14px}
.ev-sendlist li:first-child{border-top:0}
.ev-wt{color:var(--muted,#6b7280)}.ev-ok2{color:#1d6b35;font-weight:700}.ev-bad{color:#a01e1e;font-weight:700}
.ev-done{background:#e6f4ea;color:#1d6b35;border:1px solid #1d6b35;border-radius:8px;padding:.5rem .8rem;font-weight:700}
.ev-fail{background:#fdecec;color:#a01e1e;border:1px solid #a01e1e;border-radius:8px;padding:.5rem .8rem;font-weight:700}
/* 2 Oct 2026: "Show us your building" redesigned - three choices, each on its own page (src/web/evidence-pages.ts). */
.ev-rule{background:var(--white);border:1px solid var(--line);border-left:5px solid var(--ink);border-radius:8px;padding:.6rem .9rem;margin:.8rem 0 1.2rem;font-weight:700;color:var(--ink)}
.ev-three{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px;margin:0 0 1rem}
.ev-choice{background:var(--white);border:1px solid var(--line);border-radius:12px;padding:1rem 1rem 1.1rem;display:flex;flex-direction:column;gap:.35rem}
.ev-choice h2{margin:.2rem 0 0;font-size:1.2rem}.ev-choice p{margin:0}
.ev-choice .cta{margin-top:auto;text-align:center}
.ev-ico{width:44px;height:44px;padding:9px;border-radius:10px;background:#ABEDD8;fill:none;stroke:#111111;stroke-width:1.8;stroke-linejoin:round;stroke-linecap:round}
.ev-state{font-size:13px;font-weight:700;color:#1d6b35;margin:.2rem 0 .6rem}
.ev-crumb{font-size:13px;color:var(--muted,#6b7280);margin:0 0 .3rem}
.ev-box{background:var(--white);border:1px solid var(--line);border-radius:12px;padding:1rem 1.1rem;margin:0 0 1.1rem}
.ev-box h2{margin-top:0}
.ev-box .ev-group h3{background:var(--mist,#f2f8f6);margin:0;padding:.5rem .9rem;font-size:1rem;display:flex;justify-content:space-between}
.ev-box .ev-group h3 span{font-size:12px;color:var(--muted,#6b7280);font-weight:700}
.ev-vrow{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px 12px;align-items:center;padding:.6rem 0;border-top:1px solid var(--line)}
.ev-vrow .help{display:block}
.ev-video{grid-column:1/-1;width:100%;max-height:240px;background:#111111;border-radius:8px}
.ev-vstaff{padding:.8rem}
.ev-video-big{width:100%;max-height:480px;background:#111111;border-radius:8px}
@media (max-width:760px){.ev-three{grid-template-columns:minmax(0,1fr)}}
.ev-chip{display:inline-block;border-radius:999px;padding:0 .5rem;font-size:12px;font-weight:700;border:1px solid #e7c98a;background:#fff3d6;color:#7a5200;text-decoration:none;margin-top:2px}
.ev-gallery{display:grid;grid-template-columns:repeat(auto-fill,minmax(14rem,1fr));gap:12px;padding:.8rem}
.ev-gallery figure{margin:0}.ev-gallery figcaption{font-size:13px;color:var(--mut)}
.ev-big{width:100%;height:11rem;object-fit:cover;border-radius:8px;border:1px solid var(--line)}
@media (max-width:760px){.ev-two{grid-template-columns:minmax(0,1fr)}.ev-item{grid-template-columns:minmax(0,1fr)}.ev-right{justify-content:flex-start}}
/* 2 Oct 2026 — sending the report (src/web/report-pages.ts, sendPanel) */
.pk-sendp{margin-top:1.6rem;border-top:2px solid var(--ink);padding-top:.8rem}
.pk-step{display:flex;gap:12px;border:1px solid var(--line);border-radius:var(--radius);padding:.7rem .9rem;margin:.6rem 0}
.pk-step-n{flex:none;width:30px;height:30px;border-radius:50%;background:var(--mint);color:var(--ink);font-weight:700;display:flex;align-items:center;justify-content:center}
.pk-step-done .pk-step-n{background:var(--ok);color:var(--white)}
.pk-step-wait{background:var(--mist)}
.pk-reqs{list-style:none;padding:0;margin:.6rem 0 0;font-size:15px}.pk-reqs li{border-top:1px solid var(--line);padding:.45rem 0}
.pk-reqs form.inline{display:inline}
/* 2 Oct 2026 — the client's survey report (src/web/survey-report.ts): the approved mock-up, as A4-like sheets */
.rp,.rp-portal{--rp-mp:#2f9c7e;--rp-sr:#4b63d1}
/* The report looks the same on every page it is shown on — the back office, the portal, and the accountant's link, which
   wears the public site's dark theme: its colours are fixed here, not borrowed. */
.rp{--ink:#111111;--white:#ffffff;--mist:#F2F8F6;--body:#333333;--mut:#6B7280;--line:#cfdcd7;--mint:#ABEDD8;--ok:#1d6b35;--okbg:#e6f4ea;--warn:#8a5300;--warnbg:#fff5e0;max-width:820px;margin:0 auto;color:var(--body)}
.rp.rp h1,.rp.rp h2,.rp.rp h3,.rp.rp b,.rp.rp dd{color:var(--ink)}
.rp.rp a{color:var(--ink)}
.rp .rp-band.rp-band h1{color:var(--white)}
.rp.rp p,.rp.rp li,.rp.rp td,.rp.rp th{color:var(--body)}
.rp.rp .rp-note,.rp.rp .rp-lbl,.rp.rp thead th,.rp.rp dt,.rp.rp small,.rp.rp .rp-who span{color:var(--mut)}
.rp.rp .rp-grp th,.rp.rp .rp-tot th,.rp.rp .rp-tot td{color:var(--ink)}
.rp.rp .rp-band p{color:#e9ece9}.rp.rp .rp-band .rp-wm{color:var(--mint)}
.rp.rp .rp-end,.rp.rp .rp-end b,.rp.rp .rp-end small{color:var(--white)}
.rp-portal .rp-legend{max-width:32rem}
.rp-sheet{background:var(--white);border:1px solid var(--line);border-radius:var(--radius);padding:2rem 2.2rem;margin:0 0 1.2rem;color:var(--body)}
.rp-cover{padding:0;overflow:hidden}
.rp-band{background:var(--ink);color:var(--white);padding:2.2rem 2.2rem 1.8rem}
.rp .rp-band h1{color:var(--white);font-size:36px;line-height:1.15;margin:.8rem 0 .4rem}
.rp-band p{margin:0;color:#e9ece9}
.rp-wm{font-family:${HEADING_STACK};font-weight:800;letter-spacing:.2em;font-size:13px;color:var(--mint)}
.rp-band .rp-wm{color:var(--mint)}
.rp-body{padding:1.6rem 2.2rem}
.rp-who{display:grid;grid-template-columns:1fr 1fr;gap:18px;margin-bottom:1.4rem}
.rp-who div{border-left:4px solid var(--mint);padding:2px 0 2px 12px}
.rp-who span{display:block;font-size:13px;color:var(--mut);text-transform:uppercase;letter-spacing:.06em}
.rp-who b{display:block;color:var(--ink);font-size:16px}
.rp-hero{display:grid;grid-template-columns:1.25fr 1fr;gap:18px}
.rp-big{background:var(--mist);border:1px solid var(--line);border-radius:10px;padding:1.2rem}
.rp-lbl{font-size:13px;text-transform:uppercase;letter-spacing:.07em;color:var(--mut);margin:0}
.rp-fig{font-family:${HEADING_STACK};font-size:42px;color:var(--ink);font-weight:700;line-height:1.1;margin:.3rem 0}
.rp-split{display:flex;height:14px;border-radius:5px;overflow:hidden;margin:1rem 0 .5rem;background:var(--rp-sr)}
.rp-mp{display:block;background:var(--rp-mp)}.rp-sr{display:block;flex:1}
.rp-legend{display:flex;justify-content:space-between;flex-wrap:wrap;gap:.5rem;font-size:14px;margin:0}
.rp-dot{display:inline-block;width:10px;height:10px;border-radius:2px;margin-right:5px}.rp-dot-mp{background:var(--rp-mp)}.rp-dot-sr{background:var(--rp-sr)}
.rp-facts{border:1px solid var(--line);border-radius:10px;padding:1rem 1.1rem}
.rp-facts h2{font-size:18px;margin:0 0 .5rem}
.rp-facts dl{margin:0;display:block}.rp-facts div{display:flex;justify-content:space-between;gap:.5rem;border-bottom:1px solid var(--line);padding:.4rem 0}
.rp-facts div:last-child{border-bottom:0}.rp-facts dt{color:var(--mut)}.rp-facts dd{margin:0;font-weight:700;color:var(--ink)}
.rp-sign{display:flex;gap:14px;align-items:center;border:1px solid var(--line);border-radius:10px;padding:.9rem 1.1rem;margin-top:1.4rem}
.rp-sign p{margin:0}
.rp-seal{flex:none;width:50px;height:50px;border-radius:50%;background:var(--mint);display:flex;align-items:center;justify-content:center;font-weight:700;font-size:22px;color:var(--ink)}
.rp-note{font-size:13px;color:var(--mut)}
.rp-h{display:flex;align-items:baseline;gap:12px;border-bottom:2px solid var(--ink);padding-bottom:.4rem;margin:0 0 1rem;font-size:26px}
.rp-h span{font-family:${HEADING_STACK};font-weight:800;color:var(--rp-mp);font-size:15px;letter-spacing:.1em}
.rp-sheet .rp-h:not(:first-child){margin-top:2rem}
.rp-lede{font-size:17px;color:var(--ink)}
.rp-flow{list-style:none;padding:0;margin:1rem 0;display:grid;grid-template-columns:repeat(5,minmax(0,1fr))}
.rp-flow li{background:var(--mist);border:1px solid var(--line);padding:.7rem .5rem;text-align:center;font-size:14px}
.rp-flow li+li{border-left:0}
.rp-flow b{display:block;font-family:${HEADING_STACK};font-size:18px;color:var(--ink);margin:.2rem 0}
.rp-flow small{display:block;color:var(--mut);font-size:12px}
.rp-flow .rp-end{background:var(--ink);color:var(--white)}.rp-flow .rp-end b,.rp-flow .rp-end small{color:var(--white)}
.rp-calc{border:1px dashed var(--line);border-radius:8px;padding:.6rem 1rem;margin:1rem 0}
.rp-cards{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin:1rem 0 1.4rem}
.rp-cards div{border:1px solid var(--line);border-radius:10px;padding:.8rem 1rem}
.rp-cards h3{font-size:17px;margin:0 0 .3rem}.rp-cards p{margin:0}
.rp-table{width:100%;border-collapse:collapse;font-size:14px;margin:.4rem 0}
.rp-table th,.rp-table td{padding:.45rem .4rem;border-bottom:1px solid var(--line);vertical-align:top;text-align:left}
.rp-table thead th{font-size:12px;text-transform:uppercase;letter-spacing:.05em;color:var(--mut)}
.rp-table .n{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
.rp-table .rp-grp th{background:var(--mist);color:var(--ink)}
.rp-table .rp-tot th,.rp-table .rp-tot td{border-top:2px solid var(--ink);font-weight:700;color:var(--ink)}
.rp-chip{display:inline-block;border-radius:999px;padding:0 6px;font-size:12px;font-weight:700;border:1px solid;margin-top:2px;white-space:nowrap}
.rp-ev{background:#e6f6ea;color:#17663a;border-color:#b5e0c2}.rp-dr{background:#fff3d6;color:#7a5200;border-color:#e7c98a}.rp-sv{background:#e9ecfd;color:#2d3fa8;border-color:#bfc7f5}
.rp-bar{display:block;height:6px;background:#e6ece9;border-radius:3px;margin-top:5px;max-width:14rem}
.rp-bar i{display:block;height:6px;border-radius:3px}.rp-bar-mp{background:var(--rp-mp)}.rp-bar-sr{background:var(--rp-sr)}
.rp-level{display:inline-block;border:1px solid;border-radius:999px;font-weight:700;padding:0 10px;font-size:14px}
.rp-level-green{background:var(--okbg);color:var(--ok);border-color:var(--ok)}.rp-level-urgent{background:#e9ecfd;color:#2d3fa8;border-color:#bfc7f5}
.rp-level-amber,.rp-level-red{background:var(--warnbg);color:var(--warn);border-color:var(--warn)}
.rp-steps{counter-reset:rps;list-style:none;padding:0}
.rp-steps li{counter-increment:rps;position:relative;padding:0 0 .8rem 2.6rem}
.rp-steps li::before{content:counter(rps);position:absolute;left:0;top:0;width:28px;height:28px;border-radius:50%;background:var(--mint);color:var(--ink);font-weight:700;display:flex;align-items:center;justify-content:center}
.rp-steps b{color:var(--ink)}
.rp-decl{border:2px solid var(--ink);border-radius:10px;padding:1rem 1.3rem}
.rp-decl ol{margin:0;padding-left:1.2rem}
.rp-sigrow{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;margin-top:1rem;font-size:14px}
.rp-sigrow div{border-top:1px solid var(--ink);padding-top:.4rem}.rp-sigrow b{display:block;color:var(--ink)}
.rp-ai{background:var(--mist);border-radius:10px;padding:.9rem 1.1rem;margin-top:1.4rem}
.rp-ai h3{font-size:16px;margin:0 0 .2rem}.rp-ai p{margin:0}
.rp-signoff{max-width:820px;margin:0 auto 2rem}
.rp-forms{display:grid;grid-template-columns:1fr 1fr;gap:14px}
.rp-forms .ck{display:flex;gap:8px;align-items:flex-start;margin:.6rem 0;font-weight:700}
.rp-portal{border:2px solid var(--ink)}
.rp-portal .rp-split{max-width:32rem}
@media (max-width:760px){.rp-who,.rp-hero,.rp-cards,.rp-forms,.rp-sigrow{grid-template-columns:minmax(0,1fr)}.rp-flow{grid-template-columns:minmax(0,1fr)}.rp-flow li+li{border-left:1px solid var(--line);border-top:0}.rp-sheet{padding:1.2rem}.rp-band,.rp-body{padding:1.2rem}}
.pk-decl{border:2px solid var(--ink);border-radius:var(--radius);padding:.8rem 1rem;margin:1rem 0}
.pk-decl ol{margin:.3rem 0 0;padding-left:1.2rem}.pk-decl li{margin:.2rem 0}
.pk-approve{margin:1rem 0 1.4rem}
.pack-book .pk-approve button.cta[type="submit"][disabled],.pack-book .pk-approve button.cta[type="submit"][disabled]:hover{background:var(--mist);border-color:var(--line);color:var(--mut);cursor:not-allowed}
.pk-approved{background:var(--okbg);border:2px solid var(--ok);border-radius:var(--radius);padding:.8rem 1rem;margin:.8rem 0}
.pk-fp{font-family:ui-monospace,Menlo,Consolas,monospace;font-size:13px;overflow-wrap:anywhere}
.pk-fp-bad{background:var(--stopbg);border:2px solid var(--stop);border-radius:var(--radius);padding:.8rem 1rem}
@media (max-width:1100px){.pack{grid-template-columns:minmax(0,1fr)}.pack-ch,.pack-side{position:static}.pathway{flex-direction:column}.pathway div{border-left:0;border-top:1px solid var(--line)}.pk-needed{columns:1}}
/* 1 Oct 2026 — the client's portal home as a dashboard (src/web/portal-dashboard.ts) */
.pdash{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px;margin:0 0 1.4rem}
.pdash-card{border:1px solid var(--line);border-radius:var(--radius);background:var(--white);padding:1rem 1.1rem;min-width:0}
.pdash-card h2{font-size:22px;margin:0 0 .6rem}
#where-you-are{grid-column:1/-1}
.pdash-big{font-size:20px;font-weight:700;color:var(--ink);margin:.4rem 0}
.pdash-list li{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:.5rem;padding:.5rem 0;border-top:1px solid var(--line)}
.pdash-list li:first-child{border-top:0}
.pdash-list li.late .help{color:var(--stop)}
.pdash-new strong{color:var(--ink)}
@media (max-width:760px){.pdash{grid-template-columns:minmax(0,1fr)}}
.keylist details>summary{text-decoration:none;color:var(--ink);font-weight:400}
.keylist code{font-weight:700}
.chip.key-on{background:var(--okbg);color:var(--ok);border-color:var(--ok)}
.chip.key-idle{background:var(--warnbg);color:var(--warn);border-color:var(--warn)}
.chip.key-off{background:var(--stopbg);color:var(--stop);border-color:var(--stop)}
.key-why{color:var(--warn)}
.keyform{display:flex;flex-wrap:wrap;gap:.4rem .8rem;align-items:flex-end;margin:.4rem 0 .6rem}
.keyform>div{flex:1 1 14rem;min-width:0}
.keyform .fl{margin:0 0 .2rem}
@media (max-width:900px){.dash-grid{grid-template-columns:minmax(0,1fr)}.wk{grid-template-columns:minmax(0,1fr)}.wk-day{min-height:0}}
@media (max-width:600px){.act{grid-template-columns:minmax(0,1fr)}.act-cta{justify-self:start}}
.vc-root{width:100%;max-width:1000px;min-height:0}
.say{color:var(--body);font-size:16px}
pre{white-space:pre-wrap;font-family:inherit}
dl{display:grid;grid-template-columns:minmax(9rem,max-content) 1fr;gap:.35rem 1.25rem;margin:.5rem 0}
dt{color:var(--ink);font-size:16px;font-weight:600;padding-top:.05rem}
dd{margin:0}
details>summary{cursor:pointer;color:var(--accent);font-weight:600;padding:.35rem 0;text-decoration:underline;text-underline-offset:.15em}
details[open]>summary{margin-bottom:.4rem}
fieldset{border:1px solid var(--line);border-radius:var(--radius);padding:.75rem 1rem;margin:1rem 0}
legend{font-family:${HEADING_STACK};font-size:18px;font-weight:600;color:var(--ink);padding:0 .3rem}

/* ---------------- "WHY?" — the explanation behind a small toggle (PHASE 133c) ---------------- */
details.why{display:inline;margin-left:.4rem}
details.why>summary{display:inline;font-size:14px;font-weight:600;padding:0}
details.why[open]{display:block;margin:.3rem 0 .5rem}
details.why[open]>summary{margin-bottom:.2rem}
details.why .whytext{display:block;color:var(--body);font-size:16px;border-left:3px solid var(--mint);padding:.2rem 0 .2rem .6rem}

/* ---------------- CARDS ---------------- */
.card,.pblock,.assumebox{background:var(--white);border:1px solid var(--line);border-radius:var(--radius);padding:1rem 1.15rem;margin:0 0 1rem;box-shadow:var(--shadow)}
/* A card's title is H3 on the brand scale (24 px, "card titles"). */
.pnum,.card-h{display:flex;justify-content:space-between;align-items:baseline;gap:.5rem;font-family:${HEADING_STACK};font-size:24px;line-height:1.3;color:var(--ink);font-weight:600;margin:0 0 .7rem;padding-bottom:.5rem;border-bottom:1px solid var(--line)}
.card-h h2{font-size:inherit;margin:0;line-height:inherit;font-weight:600}
.card-h a{color:var(--ink);text-decoration:none}.card-h a:hover{text-decoration:underline}
.card-h .count{font-family:${BODY_STACK};font-size:16px;font-weight:600;color:var(--ink)}
.cards{align-items:start;display:grid;grid-template-columns:repeat(auto-fill,minmax(19rem,1fr));gap:1rem;margin:0 0 1rem}
.cards>.card{margin:0}
/* PHASE 135: a card's table wraps its long words (LOGIN_SUCCEEDED) rather than pushing the page sideways. */
.cards>.card{min-width:0}
.card table.compact td{overflow-wrap:anywhere;word-break:break-word}
.card>h3:first-child{margin-top:0}
.card .figbig{font-size:32px}
.stat{font-size:32px;font-weight:700;line-height:1.1;margin:.2rem 0}
.stat-row{display:flex;flex-wrap:wrap;gap:1.5rem;margin:.3rem 0 .6rem}
.stat-row div{min-width:6rem}
.stat-row .lab{display:block;font-size:14px;color:var(--body)}
.plain{list-style:none;padding:0;margin:0}
.plain li{padding:.5rem 0;border-bottom:1px solid var(--line)}
.plain li:last-child{border-bottom:0}
.empty{color:var(--body);background:var(--mist);border:1px dashed var(--line);border-radius:var(--radius);padding:.9rem 1rem;margin:.5rem 0;font-size:16px}
.pagehead{display:flex;flex-wrap:wrap;align-items:flex-end;justify-content:space-between;gap:.5rem 1rem;margin:0 0 1rem}
.pagehead h1{margin:0}

/* ---------------- MESSAGES AT THE TOP OF A PAGE (PHASE 133c) ---------------- */
.saved{background:var(--okbg);color:var(--ok);border:1px solid #b7d9c2;border-radius:var(--radius);padding:.7rem 1rem;margin:0 0 1rem;font-weight:600}
.formerr{background:var(--stopbg);color:var(--stop);border:1px solid #ebc0c0;border-radius:var(--radius);padding:.7rem 1rem;margin:.5rem 0 .8rem}
.formerr strong{color:var(--stop)}
/* PHASE 133d (D4): a refusal beside the field it is about. */
.fielderr{background:var(--stopbg);color:var(--stop);border-left:4px solid var(--stop);border-radius:0 var(--radius) var(--radius) 0;padding:.45rem .8rem;margin:.3rem 0 .7rem;font-size:16px}
.fielderr strong{color:var(--stop)}
[aria-invalid="true"]{border-color:var(--stop)!important;outline:2px solid var(--stop);outline-offset:1px}
.req{font-weight:400;font-size:14px;color:var(--body)}

/* ---------------- THE WELCOME CARD (PHASE 133c) ---------------- */
.welcome{border-top:4px solid var(--mint)}
.welcome .jobs{display:flex;flex-wrap:wrap;gap:.5rem;margin:.6rem 0}

/* ---------------- THE NEXT STEP (PHASE 133c) ---------------- */
.nextstep .btn,.nextstep button{width:100%}
.nextstep .needed{margin:.4rem 0 .6rem}

/* ---------------- BADGES ---------------- */
.badge{display:inline-block;padding:.08rem .55rem;border-radius:999px;font-size:14px;font-weight:600;line-height:1.5;background:var(--mist);color:var(--ink);border:1px solid var(--line);white-space:nowrap;vertical-align:baseline}
.badge.b-ok{background:var(--okbg);color:var(--ok);border-color:#b7d9c2}
.badge.b-warn{background:var(--warnbg);color:var(--warn);border-color:#ecd29a}
.badge.b-stop{background:var(--stopbg);color:var(--stop);border-color:#ebc0c0}
.badge.b-info{background:var(--white);color:var(--ink);border-color:var(--ink)}

/* ---------------- BUTTONS AND FORMS ---------------- */
button,.btn,.cta{display:inline-flex;align-items:center;justify-content:center;gap:.4rem;min-height:2.5rem;padding:.45rem 1rem;border:1px solid var(--ink);border-radius:var(--radius);background:var(--white);color:var(--ink);font:inherit;font-size:16px;font-weight:600;cursor:pointer;text-decoration:none;line-height:1.2}
button:hover,.btn:hover{background:var(--mist)}
.cta,.btn-primary,button[type="submit"]:not(.linkish):not(.opt):not(.btn-quiet){background:var(--accent);border-color:var(--accent);color:var(--on-accent)}
.cta:hover,.btn-primary:hover,button[type="submit"]:not(.linkish):not(.opt):not(.btn-quiet):hover{background:var(--body);border-color:var(--body);color:var(--on-accent)}
.cta{margin-top:1rem;padding:.6rem 1.2rem}
.btn-quiet{background:var(--white);color:var(--ink);border-color:var(--ink)}
.inline{display:inline}
.linkish{background:none;border:0;padding:0;min-height:0;font:inherit;font-weight:400;color:var(--accent);cursor:pointer;text-decoration:underline}
.linkish:hover{background:none}
.top .linkish{text-decoration:none;color:var(--ink)}
/* A form label is H5 on the brand scale (18 px, 600, "form labels"). */
label{font-size:18px;font-weight:600;color:var(--ink)}
form label{display:block;margin:.55rem 0;color:var(--ink)}
form .inline label,form label.ck{display:inline}
input,select,textarea{font:inherit;font-size:16px;font-weight:400;color:var(--ink);background:var(--white);border:1px solid #6f7a76;border-radius:.4rem;padding:.4rem .55rem;min-height:2.5rem;max-width:100%}
input[type="checkbox"],input[type="radio"]{min-height:0;width:1.1rem;height:1.1rem;vertical-align:middle;accent-color:var(--ink)}
input[type="file"]{border:0;padding:.3rem 0}
textarea{min-height:5rem;width:100%}
form label>input:not([type="checkbox"]):not([type="radio"]):not([type="file"]),form label>select,form label>textarea{display:block;width:100%;max-width:34rem;margin-top:.25rem}
input:focus-visible,select:focus-visible,textarea:focus-visible{outline:3px solid var(--focus);outline-offset:1px}
form>button,form>p>button{margin-top:.4rem}
details.more-options{margin:.3rem 0 .6rem}
.fl{display:block;margin:1rem 0 .3rem;font-size:18px;font-weight:600;color:var(--ink)}
.fi{width:100%;padding:.6rem .7rem;border:1px solid #6f7a76;border-radius:.4rem;font:inherit;background:var(--white)}
.ck{display:block;margin:.4rem 0;font-size:16px;font-weight:400;color:var(--body)}
.err{color:var(--stop);font-size:16px}
.opts{display:flex;flex-direction:column;gap:.5rem;margin:1rem 0}
button.opt,.opt{display:block;width:100%;text-align:left;padding:.85rem 1rem;border:1px solid var(--line);border-radius:var(--radius);background:var(--white);font:inherit;font-weight:400;color:inherit;cursor:pointer;min-height:0}
button.opt:hover{border-color:var(--ink);background:var(--white)}
.opt.sel{border-color:var(--ink);box-shadow:inset 0 0 0 1px var(--ink)}

/* ---------------- MESSAGES ---------------- */
.flag{border:1px solid #ecd29a;background:var(--warnbg);color:#5c3800;border-radius:var(--radius);padding:.8rem 1rem;margin:1rem 0}
.flag strong{color:#5c3800}
.stop{border:1px solid #ebc0c0;background:var(--stopbg);color:var(--stop);border-radius:var(--radius);padding:.8rem 1rem;margin:1rem 0}
.gate{border:1px dashed var(--line);background:var(--white);border-radius:var(--radius);padding:.8rem 1rem;margin:1rem 0;color:var(--body);font-size:16px}
.ok{color:var(--ok)}
/* Phase 151j: the QR code an authenticator app scans at sign-in, drawn as SVG by the server */
.qr{max-width:220px;margin:12px 0}
.qr svg{width:100%;height:auto;display:block}
.refusal{max-width:40rem;margin:2rem auto;border-left:4px solid var(--ink)}
.overdue{color:var(--stop)}
tr.overdue td:first-child{border-left:3px solid var(--stop)}
tr.dont_know td{background:var(--warnbg)}
tr.skipped td{color:var(--body)}

/* ---------------- TABLES ---------------- */
table{border-collapse:collapse;width:100%;margin:.75rem 0;font-size:16px;background:var(--white)}
th,td{text-align:left;padding:.55rem .65rem;border-bottom:1px solid var(--line);vertical-align:top}
/* A table heading is H6 on the brand scale (16 px, 600, "small labels"): H4's 20 px crowds an eight-column list. */
th{font-size:16px;color:var(--ink);font-weight:600;background:var(--white);border-bottom:2px solid var(--ink)}
tbody tr:hover td{background:var(--mist)}
th a{color:inherit}
th a[aria-sort],th .sorted{color:var(--ink)}
.tablewrap{overflow-x:auto;border:1px solid var(--line);border-radius:var(--radius);background:var(--white);margin:.75rem 0}
.tablewrap table{margin:0}
table.compact{margin:0}table.compact td{padding:.3rem .35rem}
.num{text-align:right}
.trace{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:14px}
.trace td{padding:.35rem .6rem}

/* ---------------- THE PUBLIC FUNNEL (unchanged in purpose) ---------------- */
.pnumber{font-size:14px}
.figbig{font-size:44px;font-weight:700;margin:.4rem 0}
.rung{font-size:14px;color:var(--body)}
.assumebox ul{margin:.5rem 0 0;padding-left:1.1rem}.assumebox li{margin:.3rem 0;font-size:16px;color:var(--body)}
.clause{margin:1.3rem 0 .4rem;font-weight:600}
.letter p{font-size:16px}
.steps{list-style:none;padding:0;margin:1rem 0}
.steps li{padding:.65rem 0 .65rem 1.7rem;border-bottom:1px solid var(--line);position:relative}
.steps li::before{position:absolute;left:0;top:.65rem;font-size:16px}
.steps li.done::before{content:"\\2713";color:var(--ink);font-weight:700}
.steps li.current::before{content:"\\25B6";color:var(--ink)}
.steps li.current .lab{color:var(--ink);background:var(--mint);padding:0 .25rem}
.steps li.todo::before{content:"\\25CB";color:var(--body)}
.steps .lab{font-weight:600;color:var(--ink)}
.steps .say{color:var(--body);font-size:16px}
.foot{background:var(--white);max-width:none;margin:0;padding:1.5rem;border-top:1px solid var(--line);color:var(--mut);font-size:12px;line-height:1.5}
.foot>*{max-width:74rem;margin-left:auto;margin-right:auto}
.foot a{color:var(--ink)}
.foot .build{font-size:12px}

/* ---------------- RECORD PAGES ---------------- */
.highlights{background:var(--white);border:1px solid var(--line);border-radius:var(--radius);box-shadow:var(--shadow);padding:1rem 1.15rem;margin:0 0 1rem;border-top:4px solid var(--mint)}
.highlights .eyebrow{margin-bottom:.15rem}
.highlights h1{margin:0 0 .75rem}
.highlights .hl{display:grid;grid-template-columns:repeat(auto-fit,minmax(10rem,1fr));gap:.6rem 1.5rem;margin:0}
.highlights .hl div{min-width:0}
.highlights .hl dt{font-size:14px;color:var(--body);font-weight:600;padding:0}
.highlights .hl dd{margin:.1rem 0 0;font-weight:600;color:var(--ink);overflow-wrap:anywhere}
/* PHASE 134: THE COMPANY IS THE FRAME. The claim reference is a small grey label; a claim is a tile; the breadcrumb
   names the company first. */
.highlights .subhead{margin:-.5rem 0 .75rem;color:var(--body);font-size:16px}
.claimref{display:inline-block;color:var(--body);font-size:14px;font-weight:400;white-space:nowrap}
.crumbs ol{display:flex;flex-wrap:wrap;list-style:none;margin:0 0 .6rem;padding:0;gap:.2rem;font-size:16px}
.crumbs li+li::before{content:"\\203A";margin:0 .4rem 0 .2rem;color:var(--body)}
.crumbs [aria-current="page"]{font-weight:600;color:var(--ink)}
.tiles{display:grid;grid-template-columns:repeat(auto-fill,minmax(15rem,1fr));gap:.75rem;list-style:none;margin:0 0 1rem;padding:0}
.tile{background:var(--white);border:1px solid var(--line);border-radius:var(--radius);box-shadow:var(--shadow);padding:.8rem .9rem;border-top:4px solid var(--mint);min-width:0;overflow-wrap:anywhere}
.tile p{margin:.25rem 0}
.tile .tilename{font-weight:700;font-size:18px}
.tile .badge,.highlights .badge{white-space:normal;overflow-wrap:anywhere;max-width:100%}
.stagebar{background:var(--white);border:1px solid var(--line);border-radius:var(--radius);padding:.75rem;margin:0 0 1rem;box-shadow:var(--shadow)}
.stagebar ol{display:flex;list-style:none;margin:0;padding:0;gap:.2rem;overflow-x:auto}
/* PHASE 133d (D2): a step is never narrower than its longest word, so a label WRAPS onto a second line instead of being
   cut by the arrow ("Assessmen" at 1280 px); the bar scrolls sideways only if ten longest words cannot fit at all. */
.stagebar li{flex:1 1 0;min-width:max(5.2rem,min-content);position:relative;text-align:center;font-size:14px;line-height:1.3;padding:.55rem .75rem .55rem 1rem;overflow-wrap:normal;hyphens:manual;background:#e7ecea;color:var(--ink);clip-path:polygon(0 0,calc(100% - .6rem) 0,100% 50%,calc(100% - .6rem) 100%,0 100%,.6rem 50%)}
.stagebar li:first-child{clip-path:polygon(0 0,calc(100% - .6rem) 0,100% 50%,calc(100% - .6rem) 100%,0 100%);border-radius:.4rem 0 0 .4rem}
.stagebar li:last-child{clip-path:polygon(0 0,100% 0,100% 100%,0 100%,.6rem 50%);border-radius:0 .4rem .4rem 0}
.stagebar li.done{background:var(--mist);color:var(--ink)}
.stagebar li.done::before{content:"\\2713 "}
/* THE CURRENT STAGE — mint, with ink type (14.2:1). Never white on mint. */
.stagebar li[aria-current="step"]{background:var(--mint);color:var(--ink);font-weight:700}
.stagebar .gateline{display:flex;flex-wrap:wrap;gap:.3rem .75rem;align-items:baseline;margin:.65rem .2rem 0;font-size:16px}
.record{display:grid;grid-template-columns:minmax(0,1fr) 20rem;gap:1rem;align-items:start}
.record>.side{position:sticky;top:.75rem}
.side .card{margin-bottom:1rem}
.quick{list-style:none;margin:0;padding:0;display:grid;gap:.4rem}
.quick a{display:block;padding:.5rem .7rem;border:1px solid var(--line);border-radius:var(--radius);text-decoration:none;color:var(--ink);font-weight:600;font-size:16px;background:var(--white)}
.quick a:hover{background:var(--mist)}
.rtabs{display:flex;gap:.2rem;list-style:none;margin:0 0 1rem;padding:0;border-bottom:1px solid var(--line);overflow-x:auto}
.rtabs a{display:block;padding:.6rem 1rem;text-decoration:none;color:var(--ink);font-weight:600;font-size:16px;border-bottom:3px solid transparent;white-space:nowrap}
.rtabs a:hover{background:var(--white)}
.rtabs .count{display:inline-block;margin-left:.3rem;padding:0 .45rem;border-radius:999px;background:var(--white);border:1px solid var(--line);font-size:14px}
.tabpanel{scroll-margin-top:1rem}
.tabpanel>.panelhead{font-size:14px;color:var(--body);font-weight:600;margin:.2rem 0 .75rem}
@supports selector(:has(a)){
  .tabset .tabpanel{display:none}
  .tabset .tabpanel:target,.tabset .tabpanel:has(:target){display:block}
  .tabset:not(:has(.tabpanel:target)):not(:has(.tabpanel :target)) .tabpanel:first-of-type{display:block}
  .tabset .tabpanel>.panelhead{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)}
  .tabset:not(:has(.tabpanel:target)):not(:has(.tabpanel :target)) .rtabs li:first-child a,
  .tabset:has(#details:target,#details :target) .rtabs a[href="#details"],
  .tabset:has(#related:target,#related :target) .rtabs a[href="#related"],
  .tabset:has(#activity:target,#activity :target) .rtabs a[href="#activity"]{border-bottom-color:var(--ink);background:var(--mint);color:var(--ink)}
  ${CURRENT_BY_POSITION}{border-bottom-color:var(--ink);background:var(--mint);color:var(--ink)}
  .seclayout:not(:has(.tabpanel:target)):not(:has(.tabpanel :target)) .vtabs li:first-child a,
  ${CURRENT_BY_POSITION.split(',\n').map((s) => s.replace('.tabset:has', '.seclayout:has').replace('.rtabs', '.vtabs')).join(',\n')}{border-left-color:var(--ink);background:var(--mint);color:var(--ink)}
  /* PHASE 133c: A REFUSED FORM IS SHOWN WHERE IT WAS TYPED. The page redrawn after a refusal marks the tab that holds
     the form, and that tab shows whichever tab the address names. */
  .tabset:has(.tabpanel.has-refusal) .tabpanel:not(.has-refusal){display:none!important}
  .tabset .tabpanel.has-refusal{display:block!important}
}

/* ---------------- A SETTINGS SCREEN'S SECTION LIST (PHASE 133b) ---------------- */
.seclayout{display:grid;grid-template-columns:16rem minmax(0,1fr);gap:1rem;align-items:start}
.seclist{position:sticky;top:.75rem;background:var(--white);border:1px solid var(--line);border-radius:var(--radius);box-shadow:var(--shadow);padding:.4rem;max-height:calc(100vh - 1.5rem);overflow-y:auto}
.vtabs{flex-direction:column;border-bottom:0;margin:0;gap:.1rem;overflow-x:visible}
.vtabs a{white-space:normal;border-bottom:0;border-left:3px solid transparent;border-radius:.3rem;padding:.45rem .7rem;font-size:16px}
.secpanels>.tabpanel{margin:0 0 1rem}
.sechead{margin-top:0;font-size:24px}
.typelist{list-style:none;margin:.5rem 0 0;padding:0;border-top:1px solid var(--line)}
.typelist>li{border-bottom:1px solid var(--line)}
.typelist summary{cursor:pointer;padding:.6rem .2rem;display:flex;flex-wrap:wrap;align-items:center;gap:.3rem .5rem;min-height:2.5rem}
.typelist summary strong{margin-right:.15rem}
.typelist details[open]>summary{border-bottom:1px dashed var(--line)}
.typefacts{display:grid;grid-template-columns:10rem minmax(0,1fr);gap:.3rem 1rem;margin:.6rem .2rem}
.typefacts dt{font-size:16px}
.typefacts dd{margin:0;overflow-wrap:anywhere}
.typelist form{margin:.4rem .2rem 1rem}
.form-row{display:flex;flex-wrap:wrap;gap:.5rem 1rem;align-items:flex-end}
.form-row>label{margin:0}

/* ---------------- THE PIPELINE BOARD ---------------- */
.board{display:flex;gap:.75rem;list-style:none;margin:0 0 1.25rem;padding:0 0 .5rem;overflow-x:auto;align-items:flex-start}
.board>li{flex:0 0 15.5rem;background:#e7ecea;border-radius:var(--radius);padding:.6rem}
.board>li.empty-col{flex-basis:10rem}
.board .colhead{display:flex;justify-content:space-between;align-items:baseline;gap:.5rem;font-weight:700;font-size:16px;color:var(--ink);margin:0 .1rem .5rem}
.board .colhead .badge{background:var(--white)}
.board details{font-size:14px;margin:0 .1rem .5rem}
.board details>summary{font-weight:600;font-size:14px;padding:0}
.board .cardlist{list-style:none;margin:0;padding:0;display:grid;gap:.5rem}
.cardlet{background:var(--white);border:1px solid var(--line);border-radius:.45rem;padding:.6rem .7rem;box-shadow:var(--shadow);font-size:16px}
.cardlet .ref{font-weight:700;color:var(--ink)}
.cardlet .help{font-size:14px}
.cardlet p{margin:.25rem 0}
.cardlet form{margin-top:.4rem}
.cardlet button{font-size:14px;min-height:2.25rem;padding:.25rem .6rem;width:100%}
.board .none{color:var(--body);font-size:14px;margin:.2rem .1rem}

/* ---------------- LIST PAGES ---------------- */
.listlayout{display:grid;grid-template-columns:17rem minmax(0,1fr);gap:1rem;align-items:start}
.listlayout>.filters{background:var(--white);border:1px solid var(--line);border-radius:var(--radius);padding:.9rem 1rem;box-shadow:var(--shadow)}
.listlayout>.filters label>select,.listlayout>.filters label>input{max-width:100%}

/* ---------------- THE HELP PAGE (PHASE 133c) ---------------- */
.guide h2{font-size:32px}.guide h3{font-size:24px}.guide h4{font-size:20px}
.guide table{font-size:16px}

/* PHASE 135: one tab, two views — a row of filters at the top of a list. */
.viewbar{display:flex;flex-wrap:wrap;gap:.4rem;margin:.25rem 0 1rem}
.viewbar a{display:inline-block;padding:.35rem .8rem;border:1px solid var(--line);border-radius:999px;background:var(--white);color:var(--ink);text-decoration:none;font-size:16px}
.viewbar a:hover{background:var(--mist)}
.viewbar a[aria-current="page"]{background:var(--mint);border-color:var(--ink);font-weight:700}
/* PHASE 135: Admin's Settings — one tile per setup screen, the whole tile a link. */
.settings-tiles .tile{padding:0}
.settings-tiles .tilelink{display:block;padding:.9rem 1rem;color:var(--ink);text-decoration:none;height:100%}
.settings-tiles .tilelink:hover{background:var(--mist)}
.settings-tiles .tiledoes{display:block;margin-top:.3rem;color:var(--body);font-size:16px}
.clientlist .rowname{font-weight:700}
/* PHASE 136: Home as rows of tiles. The whole tile is a link; a late one is red at the top and on its last line. */
.homerow{margin:0 0 1.4rem}
.homerow>h2{font-size:24px;margin:0 0 .6rem}
.hometiles{grid-template-columns:repeat(auto-fill,minmax(13rem,1fr))}
.hometile{padding:0}
.hometile .tilelink{display:block;padding:.8rem .9rem;color:var(--ink);text-decoration:none;height:100%}
.hometile .tilelink:hover{background:var(--mist)}
.hometile .tilename{display:block;font-weight:700;font-size:18px}
.hometile .tileline{display:block;margin-top:.2rem;color:var(--body);font-size:16px}
.hometile .tilecount{display:block;font-family:${HEADING_STACK};font-size:32px;font-weight:700;line-height:1.1}
.hometile.late{border-top-color:var(--stop)}
.hometile.late .tileline.when{color:var(--stop);font-weight:700}
.hometile .tileline,main .hometile .tileline.when{white-space:normal;overflow-wrap:break-word}

/* PHASE 137: the leads as cards in four sections. A card is a <details>: its summary is the card, and it opens in place. */
.leadtools{display:flex;flex-wrap:wrap;align-items:flex-start;gap:.5rem 1rem;margin:0 0 .75rem}
.leadtools .viewbar{margin:0}
.filterbox{flex:1 1 100%}
.filterbox>summary,.lc-act>summary{display:inline-block;cursor:pointer;list-style:none;padding:.4rem .9rem;border:1px solid var(--ink);border-radius:var(--radius);background:var(--white);color:var(--ink);font-weight:700}
.filterbox>summary::-webkit-details-marker,.lc-act>summary::-webkit-details-marker,.leadcard>details>summary::-webkit-details-marker,.lc-fold>summary::-webkit-details-marker{display:none}
.filterbox[open]>summary,.lc-act[open]>summary{background:var(--mint)}
.filterbox>.filters{margin-top:.6rem;max-width:40rem}
.leadsec{margin:0 0 1.5rem}
.leadsec h2{font-size:24px;margin:0 0 .6rem;display:flex;flex-wrap:wrap;align-items:center;gap:.4rem .6rem}
.lc-count{display:inline-block;min-width:2.2rem;padding:0 .5rem;border-radius:999px;background:var(--mint);color:var(--ink);font-size:18px;text-align:center}
.lc-latecount{font-size:16px;color:var(--stop);font-weight:700}
.lc-fold>summary{cursor:pointer;list-style:none;color:var(--ink);padding:0}
.lc-fold>summary h2::after{content:"Show";font-size:16px;font-weight:400;color:var(--ink);text-decoration:underline}
.lc-fold[open]>summary h2::after{content:"Hide"}
.leadcards{list-style:none;margin:0;padding:0;display:grid;gap:.6rem}
.leadcard{background:var(--white);border:1px solid var(--line);border-left:6px solid var(--mint);border-radius:var(--radius);box-shadow:var(--shadow);min-width:0;overflow-wrap:anywhere}
.leadcard.late{border-left-color:var(--stop)}
.leadcard>details>summary{display:flex;flex-wrap:wrap;align-items:baseline;gap:.15rem 1.1rem;padding:.8rem 1rem;cursor:pointer;list-style:none;border-radius:var(--radius);color:var(--ink);font-weight:400;text-decoration:none}
.leadcard>details[open]>summary{margin-bottom:0}
.lc-fold>summary,.filterbox>summary,.lc-act>summary{text-decoration:none}
.leadcard>details>summary:hover{background:var(--mist)}
.lc-name{flex:1 1 100%;font-size:20px;font-weight:700;color:var(--ink)}
.lc-line{font-size:16px;color:var(--body)}
.lc-line.when{color:var(--stop);font-weight:700}
/* 29 Sep 2026: a lead card's next-action line carries its late date, and main.wide .when kept it on one line, so it ran
   past the card and the Leads page scrolled sideways. It wraps, like a Home tile's. */
main .leadcard .lc-line.when{white-space:normal;overflow-wrap:break-word}
.lc-line.nobody{font-weight:700;color:var(--ink)}
.lc-open{margin-left:auto;font-size:16px;color:var(--ink);text-decoration:underline}
.lc-hide{display:none}
.leadcard>details[open]>summary .lc-show{display:none}
.leadcard>details[open]>summary .lc-hide{display:inline}
.lc-body{padding:0 1rem 1rem;border-top:1px solid var(--line)}
.lc-parts{display:grid;grid-template-columns:repeat(auto-fit,minmax(15rem,1fr));gap:1rem;margin-top:.8rem}
.lc-part h3{font-size:18px;margin:0 0 .4rem}
.lc-part p{margin:.25rem 0}
dl.lc-facts{display:block;margin:0}
.lc-facts dt{font-weight:600;margin-top:.35rem}
.lc-facts dd{margin:0}
.lc-checks{list-style:none;padding:0;margin:0}
.lc-checks li{margin:.25rem 0}
.lc-mark{display:inline-block;min-width:5.5rem;padding:0 .4rem;border-radius:.3rem;font-weight:700;font-size:14px;text-align:center}
.lc-checks .yes .lc-mark{background:var(--okbg);color:var(--ok)}
.lc-checks .no .lc-mark{background:var(--warnbg);color:var(--warn)}
.lc-actions{margin-top:1rem;display:flex;flex-wrap:wrap;gap:.5rem;align-items:flex-start}
.lc-actions h3{flex:1 1 100%;margin:0}
.lc-act[open]{flex:1 1 100%}
.lc-act form{margin-top:.5rem;max-width:32rem}
.lc-act fieldset{border:1px solid var(--line);border-radius:var(--radius);padding:.4rem .8rem;margin:0 0 .5rem}
.lc-off{display:inline-flex;align-items:center;gap:.4rem;flex-wrap:wrap}
.lc-take{padding:0 1rem 1rem}
.lc-full{margin:.9rem 0 0}

/* ---------------- PHASE 138 — COLOURED SECTIONS THAT OPEN AND CLOSE ---------------- */
/* One colour per kind of section, from the brand tokens alone; each kind also carries an icon and a word, so colour is
   never the only signal. The band is a strip down the left edge; Messages' is striped, so it differs in shape as well. */
.sec{--band:var(--ink);position:relative;background:var(--white);border:1px solid var(--line);border-radius:var(--radius);margin:0 0 1rem;box-shadow:var(--shadow)}
.sec::before{content:"";position:absolute;left:0;top:0;bottom:0;width:6px;background:var(--band);border-radius:var(--radius) 0 0 var(--radius)}
.sec-company{--band:var(--ink)}
.sec-property{--band:var(--mint)}
.sec-facts{--band:var(--ok)}
.sec-documents{--band:var(--mut)}
.sec-money{--band:var(--warn)}
.sec-messages{--band:repeating-linear-gradient(180deg,var(--mint) 0 10px,var(--ink) 10px 20px)}
.sec>summary{display:flex;flex-wrap:wrap;align-items:center;gap:.4rem .7rem;padding:.8rem 1rem .8rem 1.4rem;list-style:none;cursor:pointer;color:var(--ink);text-decoration:none;font-weight:400}
.sec>summary::-webkit-details-marker{display:none}
.sec>summary::after{content:"\\25B8";margin-left:auto;color:var(--ink);font-size:18px}
.sec[open]>summary::after{content:"\\25BE"}
.sec>summary:hover{background:var(--mist)}
.secicon{display:inline-grid;place-items:center;width:2rem;height:2rem;border-radius:50%;background:var(--white);color:var(--ink);border:2px solid var(--line)}
.sec-property .secicon{border-color:var(--ink)}
.seckind{font-size:14px;font-weight:600;color:var(--body);min-width:6.5rem}
.sec>summary h2{font-size:20px;margin:0;flex:1 1 10rem;line-height:1.3}
.sec>summary h2 .count{font-family:${BODY_STACK};font-size:16px;font-weight:600;color:var(--body)}
.secbody{padding:0 1rem 1rem 1.4rem}
dl.three{display:grid;grid-template-columns:8rem minmax(0,1fr);gap:.3rem .8rem;margin:0 0 1rem;padding:.7rem .9rem;background:var(--mist);border-radius:var(--radius)}
dl.three dt{font-size:14px;letter-spacing:.04em;text-transform:uppercase;color:var(--ink)}
dl.three dd{margin:0}
.needs{margin:0;padding-left:1.1rem}
.needs li{margin:.15rem 0}
.needs form{display:inline}
.sec .pblock{border:0;box-shadow:none;padding:0;margin:0 0 1rem;background:none}
.sec .pnum{font-size:18px;border-bottom:0;padding-bottom:0;margin:1rem 0 .4rem}
.secmem{margin:1rem 0 0;padding-top:.6rem;border-top:1px solid var(--line);font-size:14px;color:var(--body)}
.secmem .linkish{font-size:14px}
details.more>summary{font-weight:600;font-size:16px}
details.more .moretext{padding:.3rem 0 0}
.contactcards{list-style:none;margin:0;padding:0;display:grid;grid-template-columns:repeat(auto-fill,minmax(15rem,1fr));gap:.75rem}
.contactcard{border:1px solid var(--line);border-radius:var(--radius);padding:.7rem .85rem;background:var(--white);overflow-wrap:anywhere}
.contactcard .cname{font-weight:700;color:var(--ink);margin:0}
.contactcard p{margin:.15rem 0}
.sources-now{margin:0 0 .8rem;padding-left:1.1rem}
/* PHASE 139: checked and approved, and telling the client. Brand tokens only; a tick is a word as well as a mark. */
.checkset .step{border:1px solid var(--line);border-radius:var(--radius);background:var(--white);padding:.75rem .9rem;margin:0 0 .8rem}
.checkset .step-ready-to-tell{border-color:var(--ink)}
.checkset .step-told{border-left:6px solid var(--ok)}
.checkset .step-rechecking{border-left:6px solid var(--warn)}
.stephead{display:flex;flex-wrap:wrap;align-items:center;gap:.4rem .6rem}
.stephead h3{margin:0;font-size:18px}
.checkclaim{margin:1.2rem 0 0}
.checkclaim .claimhead{font-size:18px;margin:0 0 .5rem}
details.facts{margin-top:.5rem}
details.facts>summary{font-weight:600;font-size:16px;color:var(--ink)}
.checks{list-style:none;margin:.6rem 0 0;padding:0}
.check{border-top:1px solid var(--line);padding:.55rem 0;overflow-wrap:anywhere}
.check p{margin:.1rem 0}
.check.ok .checkval{color:var(--body)}
.chip{display:inline-block;padding:.02rem .5rem;border-radius:999px;font-size:14px;font-weight:600;background:var(--mist);color:var(--ink);border:1px solid var(--line);white-space:nowrap}
.checkdo{margin-top:.3rem}
.tickform{display:flex;flex-wrap:wrap;align-items:center;gap:.4rem .6rem}
.tickbox{display:inline-flex;align-items:center;gap:.45rem}
.box{display:inline-block;width:1.1rem;height:1.1rem;border:2px solid var(--ink);border-radius:.2rem;background:var(--white);flex:none}
.box.on{background:var(--ok);border-color:var(--ok);box-shadow:inset 0 0 0 2px var(--white)}
.ticked{display:inline-flex;flex-wrap:wrap;align-items:center;gap:.45rem;font-weight:600;color:var(--ok)}
.ticked .help{font-weight:400}
details.undo{margin-top:.3rem}
details.undo>summary{font-size:14px}
.asfact{font-size:14px;font-weight:600}
.donelist{list-style:none;margin:.2rem 0 .6rem;padding:0}
.donelist li{padding:.3rem 0;border-top:1px solid var(--line)}
.donelist li.rechecking{color:var(--warn)}
.doneclaim{font-size:18px;margin:.8rem 0 .2rem}
/* PHASE 140: the company's files. A folder button in the header with a count; folders as tiles; a file as a card; the drop
   area IS the browser's own file picker, drawn large — no script, and a dropped file lands in it. Brand tokens only. */
.filesbtn-row{margin:.6rem 0 0}
.filesbtn{display:inline-flex;align-items:center;gap:.45rem;padding:.45rem .8rem;border:1px solid var(--ink);border-radius:var(--radius);background:var(--white);color:var(--ink);font-weight:700;text-decoration:none}
.filesbtn:hover{background:var(--mist)}
.filesbtn-row{display:flex;flex-wrap:wrap;gap:.5rem}
.emailform{max-width:44rem}
.emailform textarea.fi{min-height:12rem;resize:vertical}
.emailfrom{margin:0 0 .4rem;word-break:break-word}
.emailfiles{border:0;margin:0;padding:0;min-width:0}
.emailfiles .tickbox{word-break:break-word}
.emaillist{list-style:none;margin:0;padding:0;display:grid;gap:.6rem;max-width:44rem}
.emaillist .tilename{word-break:break-word}
.lc-email{margin:.4rem 0}
.filecount{display:inline-block;min-width:1.6rem;padding:0 .4rem;border-radius:999px;background:var(--ink);color:var(--white);text-align:center;font-size:14px;line-height:1.6}
.fold-svg{flex:none}
.foldertile{padding:0;border-top-color:var(--mut);display:flex;flex-direction:column}
.foldertile.current{border-color:var(--ink);border-top-color:var(--ink)}
.foldertile .tilelink{display:flex;flex-wrap:wrap;align-items:center;gap:.2rem .5rem;padding:.75rem .9rem;color:var(--ink);text-decoration:none;flex:1 1 auto}
.foldertile .tilelink:hover{background:var(--mist)}
.foldertile .tilename{font-weight:700;font-size:18px;min-width:0;overflow-wrap:anywhere}
.foldertile .tileline{flex:1 1 100%;color:var(--body);font-size:16px}
.foldertile .tileref{margin:0;padding:0 .9rem .6rem}
.filecard{border-top-color:var(--mut)}
.filecard.refused,.filecard.late{border-top-color:var(--stop)}
.filefrom{color:var(--body);font-size:16px}
.fileread{margin:.3rem 0;padding-left:1.1rem}
.uploadbox{margin:0 0 1rem}
.uploadbox h2{margin-top:0}
.dropzone{display:block;border:2px dashed var(--mut);border-radius:var(--radius);background:var(--mist);padding:1rem;margin:.4rem 0 .8rem;text-align:center;cursor:pointer}
.dropzone:hover,.dropzone:focus-within{border-color:var(--ink)}
.dropwords{display:block;font-weight:700;color:var(--ink);margin-bottom:.5rem}
.dropzone input[type="file"]{display:block;width:100%;max-width:100%;min-height:3.5rem;box-sizing:border-box;padding:.6rem;background:var(--white);border:1px solid var(--line);border-radius:var(--radius)}
.uploadbox .tickbox{display:flex;margin:.6rem 0 .8rem}
a.small{font-size:16px;font-weight:400;margin-left:.5rem}
/* PHASE 142: chat on every client. Two tabs ("Team only", "With the client") that are plain links — no script; a message is
   a bubble, ours or theirs on the right, the other side's on the left; the box to write in sits under the thread. The
   "Team only" tab is drawn in a warning colour so nobody mistakes it for the thread the client reads. Brand tokens only. */
.chattabs{display:flex;flex-wrap:wrap;gap:.4rem;margin:0 0 .8rem;padding:0;list-style:none}
.chattabs a{display:inline-flex;align-items:center;gap:.4rem;padding:.45rem .8rem;border:1px solid var(--line);border-radius:var(--radius);background:var(--white);color:var(--ink);font-weight:700;text-decoration:none}
.chattabs a[aria-current="page"]{border-color:var(--ink);background:var(--mist)}
.chattabs .unread{display:inline-block;min-width:1.5rem;padding:0 .4rem;border-radius:999px;background:var(--ink);color:var(--white);text-align:center;font-size:14px;line-height:1.6}
.teamnote{border-left:4px solid var(--warn);background:var(--warnbg);color:var(--warn);padding:.4rem .7rem;margin:0 0 .8rem;font-weight:600}
.chat{list-style:none;margin:0 0 1rem;padding:0;display:flex;flex-direction:column;gap:.6rem;max-width:44rem}
.msg{align-self:flex-start;max-width:min(36rem,92%);padding:.55rem .8rem;border:1px solid var(--line);border-radius:var(--radius);background:var(--white);overflow-wrap:anywhere}
.msg.mine{align-self:flex-end;background:var(--mist)}
.msg.team{border-left:4px solid var(--warn)}
.msgmeta{margin:0 0 .25rem;font-size:14px;color:var(--body)}
.msgmeta strong{color:var(--ink)}
.msgbody{margin:0;white-space:pre-wrap}
.msgfiles{margin:.35rem 0 0;padding-left:1.1rem}
.msgabout{margin:.25rem 0 0;font-size:14px;color:var(--body)}
.chatform{max-width:44rem}
.chatform textarea.fi{min-height:6rem;resize:vertical}
.chatfile{border:0;margin:.4rem 0;padding:0;min-width:0}
/* PHASE 143: grants and contributions. One question with three answers; three totals; a card per grant with who paid in
   large type and a chip in words (never colour alone); a pop-up that asks why before a grant is removed (the popover
   attribute, so no script); and the step-by-step form, one question per page. Brand tokens only. */
.gask{background:var(--mist);border:1px solid var(--line);border-radius:var(--radius);padding:.8rem 1rem;margin:0 0 1rem}
.gask h3{margin:0 0 .4rem;font-size:22px}
.gask p{margin:.3rem 0}
.gyesno label{display:block;margin:.4rem 0}
.gbtns{display:flex;flex-wrap:wrap;align-items:center;gap:.5rem;margin:.6rem 0}
.gbtns button{min-width:6rem}
.gtotals .stat{font-size:28px}
.gcards{grid-template-columns:repeat(auto-fill,minmax(17rem,1fr))}
.gcard{border-top-color:var(--warn)}
.gcard.matched{border-top-color:var(--ok)}
.gcard .gwho{font-family:${HEADING_STACK};font-size:22px;font-weight:700;color:var(--ink);margin:0}
.gcard .gamt{font-size:20px;font-weight:700;margin:.1rem 0 .3rem}
.gcard .gline{font-size:16px}
.gchips .badge{white-space:normal;overflow-wrap:anywhere;max-width:100%}
.gactions{margin:.5rem 0 0}
.gpop{border:1px solid var(--ink);border-radius:var(--radius);background:var(--white);color:var(--ink);padding:1rem;max-width:min(28rem,calc(100vw - 2rem));box-shadow:var(--shadow)}
.gpop::backdrop{background:rgba(17,17,17,.35)}
.gpop h3{margin-top:0}
.gpop textarea{width:100%;min-height:5rem;box-sizing:border-box}
.gadd{margin:.4rem 0 .8rem}
.gremoved{padding-left:1.1rem}
.gwizard{max-width:44rem}
.gwizard fieldset{border:0;margin:0 0 .8rem;padding:0;min-width:0}
.gwizard legend h2,.gwizard>form>h2{margin:.2rem 0 .6rem}
.gwizard .opts{display:grid;gap:.4rem;margin:.3rem 0 .6rem}
.gwizard textarea{width:100%;min-height:6rem;box-sizing:border-box}
.gsteps{display:flex;flex-wrap:wrap;gap:.3rem;list-style:none;margin:0 0 .3rem;padding:0}
.gsteps li{flex:1 1 7rem;padding:.3rem .5rem;border-top:4px solid var(--line);font-size:14px;color:var(--body)}
.gsteps li.done{border-top-color:var(--ok)}
.gsteps li.now{border-top-color:var(--ink);color:var(--ink);font-weight:700}
.geffect{font-size:18px;margin:.8rem 0}
.gchange{margin:.4rem 0 0}
.lede{font-size:20px;margin:-.4rem 0 1rem;color:var(--body)}

/* ---------------- SMALLER SCREENS ---------------- */
@media (max-width:960px){
  .record{grid-template-columns:minmax(0,1fr)}
  .record>.side{position:static;order:-1}
  .listlayout{grid-template-columns:minmax(0,1fr)}
  .seclayout{grid-template-columns:minmax(0,1fr)}
  .seclist{position:static;max-height:none}
  .gsearch input{width:14rem}
}
@media (max-width:720px){
  h1{font-size:32px}
  .topline{padding:.5rem .75rem 0;gap:.4rem .6rem}
  .util{margin-left:0;flex-basis:100%;order:2}
  .gsearch{flex:1 1 100%}
  .gsearch input{width:100%;max-width:none;flex:1}
  .uname{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
  .appnav{order:3}
  .tabs-main>li>a,.tabs-main summary{padding:.5rem .55rem}
  .tabs-main .more ul{position:static;box-shadow:none;margin:.2rem 0 .5rem}
  .menu-pop{right:auto;left:0}
  main,body.app main{padding:1rem .75rem 2.5rem}
  main table{display:block;overflow-x:auto;white-space:normal}
  /* PHASE 135: a stacked list reads as one card per row on a phone, each cell labelled — no sideways scroll. */
  main table.stack{display:table;overflow:visible;border:0;background:transparent}
  table.stack thead{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)}
  table.stack,table.stack tbody,table.stack tr,table.stack td{display:block;width:100%}
  table.stack tr{background:var(--white);border:1px solid var(--line);border-radius:var(--radius);margin:0 0 .75rem;padding:.5rem .75rem}
  table.stack td{border:0;padding:.3rem 0;overflow-wrap:anywhere}
  table.stack td[data-label]::before{content:attr(data-label);display:block;font-size:14px;font-weight:600;color:var(--body)}
  table.stack td:first-child::before{display:none}
  dl{grid-template-columns:minmax(0,1fr)}
  dt{margin-top:.4rem}
  .stagebar ol{flex-direction:column;gap:.25rem;overflow:visible}
  .stagebar li,.stagebar li:first-child,.stagebar li:last-child{clip-path:none;border-radius:.35rem;text-align:left;min-width:0}
  .board{flex-direction:column;overflow:visible}
  .board>li,.board>li.empty-col{flex-basis:auto;width:100%}
  .cards{grid-template-columns:minmax(0,1fr)}
  .hometiles{grid-template-columns:minmax(0,1fr)}
  /* PHASE 137: Home's Pipeline by stage row — two stage tiles to a row on a phone; every other row stays one. */
  .hometiles.pairtiles{grid-template-columns:repeat(2,minmax(0,1fr));gap:.5rem}
  .pairtiles .hometile .tilelink{padding:.6rem .65rem}
  .pairtiles .hometile .tilename{font-size:16px}
  .lc-open{flex:1 1 100%;margin-left:0}
  .lc-take{padding:0 .75rem .75rem}
  .leadcard>details>summary{padding:.7rem .75rem}
  .lc-body{padding:0 .75rem .9rem}
  .typefacts{grid-template-columns:minmax(0,1fr)}
  .form-row{display:block}
  /* PHASE 138: the sections' three lines stack, and the summary wraps, at phone width. */
  dl.three{grid-template-columns:minmax(0,1fr)}
  .sec>summary{padding:.7rem .75rem .7rem 1.1rem}
  .secbody{padding:0 .75rem .9rem 1.1rem}
  .seckind{min-width:0}
  form label>input:not([type="checkbox"]):not([type="radio"]):not([type="file"]),form label>select,form label>textarea{max-width:none}
  /* PHASE 139: a long unbroken value in a list — a sign-off record's 64-character code — wraps instead of widening the page. */
  dd{overflow-wrap:anywhere;min-width:0}
  /* PHASE 139: a fact's tick and its box stack at phone width. */
  .checkset .step{padding:.6rem .65rem}
  .tickform{display:block}
  .tickform>*{margin:.25rem 0}
  .tickform input,.tickform select{width:100%;max-width:none}
  /* PHASE 140: folders two to a row on a phone; the drop area full width. */
  .foldertiles{grid-template-columns:repeat(2,minmax(0,1fr));gap:.5rem}
  .foldertile .tilelink{padding:.6rem .65rem}
  .foldertile .tilename{font-size:16px}
  .uploadbox select{width:100%;max-width:none}
  /* PHASE 143: the grant cards one to a row, the totals stacked, the steps two to a row on a phone. */
  .gcards{grid-template-columns:minmax(0,1fr)}
  .gtotals{gap:.6rem 1.2rem}
  .gsteps li{flex:1 1 40%}
  .gbtns button{flex:1 1 auto}
}
@media (prefers-reduced-motion:reduce){*{scroll-behavior:auto!important}}

/* ================================================================== *
 * UI TIDY PHASE 1 — THE SHARED LOOK, 2 October 2026 (src/web/look.ts).
 * Lakhbir chose "design 2" and asked for colours and darker boxes, so a
 * busy person reads a page at a glance. The back office and the portal
 * only: every rule starts body.app or names a class only look.ts draws.
 * ================================================================== */
body.app thead th{background:var(--ink);color:var(--white);border-bottom:0;font-size:15px;font-weight:700}
body.app thead th:first-child{border-top-left-radius:.4rem}body.app thead th:last-child{border-top-right-radius:.4rem}
body.app thead th a{color:var(--white)}
body.app tbody tr:nth-child(even):not([class]) td{background:var(--zebra)}
body.app tbody tr:not([class]):hover td{background:var(--mist)}
.badge.g-win{background:var(--g-win-bg);color:var(--g-win-ink);border-color:var(--g-win)}
.badge.g-gather{background:var(--g-gather-bg);color:var(--g-gather-ink);border-color:var(--g-gather)}
.badge.g-survey{background:var(--g-survey-bg);color:var(--g-survey-ink);border-color:var(--g-survey)}
.badge.g-sign{background:var(--g-sign-bg);color:var(--g-sign-ink);border-color:var(--g-sign)}
.badge.g-paid{background:var(--g-paid-bg);color:var(--g-paid-ink);border-color:var(--g-paid)}
.badge.b-late{background:var(--stop);color:var(--white);border-color:var(--stop);font-weight:700}
.badge.b-nodate{background:var(--nodate);color:var(--ink);border-color:var(--nodate)}
.badge.b-nobody{background:var(--warnbg);color:var(--warn);border-color:#ecd29a}
.band{color:var(--white);font-weight:700;font-size:14px;letter-spacing:.04em;padding:.5rem .9rem;margin:0}
.band.g-win{background:var(--g-win)}.band.g-gather{background:var(--g-gather)}.band.g-survey{background:var(--g-survey)}
.band.g-sign{background:var(--g-sign)}.band.g-paid{background:var(--g-paid)}.band.g-none{background:var(--ink)}
.kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(11rem,1fr));gap:.9rem;margin:0 0 1.25rem;padding:0;list-style:none}
.kpi{display:block;border-radius:.75rem;padding:.9rem 1.1rem;color:var(--white);text-decoration:none;min-width:0}
.kpi .kpi-label{display:block;font-size:15px;font-weight:600;color:inherit}
.kpi .kpi-value{display:block;font-family:${HEADING_STACK};font-size:32px;font-weight:700;line-height:1.2;color:inherit;overflow-wrap:anywhere}
a.kpi:hover{text-decoration:none;filter:brightness(1.15)}a.kpi:hover .kpi-label{text-decoration:underline}
.kpi.k-total{background:var(--ink)}.kpi.k-total .kpi-value{color:var(--mint)}
.kpi.k-late{background:var(--stop)}.kpi.k-warn{background:var(--warn)}.kpi.k-money{background:var(--ok)}
.kpi.k-win{background:var(--g-win)}.kpi.k-gather{background:var(--g-gather)}.kpi.k-survey{background:var(--g-survey)}
.kpi.k-sign{background:var(--g-sign)}.kpi.k-paid{background:var(--g-paid)}
.kpi.k-plain{background:var(--white);color:var(--ink);border:1px solid var(--line)}
.groupbar{display:flex;height:2.1rem;border-radius:.5rem;overflow:hidden;margin:.4rem 0}
.groupbar span{display:flex;align-items:center;padding:0 .6rem;color:var(--white);font-size:14px;font-weight:700;white-space:nowrap;overflow:hidden;min-width:0}
.groupbar .g-win{background:var(--g-win)}.groupbar .g-gather{background:var(--g-gather)}.groupbar .g-survey{background:var(--g-survey)}
.groupbar .g-sign{background:var(--g-sign)}.groupbar .g-paid{background:var(--g-paid)}
.groupbar .gw-1{flex-grow:1}.groupbar .gw-2{flex-grow:2}.groupbar .gw-3{flex-grow:3}.groupbar .gw-4{flex-grow:4}.groupbar .gw-5{flex-grow:5}
.groupbar .gw-6{flex-grow:6}.groupbar .gw-7{flex-grow:7}.groupbar .gw-8{flex-grow:8}.groupbar .gw-9{flex-grow:9}.groupbar .gw-10{flex-grow:10}
@media (max-width:600px){.kpis{grid-template-columns:repeat(2,minmax(0,1fr));gap:.6rem}.kpi{padding:.7rem .8rem}.kpi .kpi-value{font-size:26px}}

/* ================================================================== *
 * THE PUBLIC PAGES IN THE HOME PAGE'S COLOURS — 29 September 2026.
 * Lakhbir: "when someone clicks am i eligible it matches the colours of
 * the new home page". The assessment, sign-in and the enquiry's
 * thank-you (body.public) take the home page's ink ground, ivory type,
 * Cap Mint actions and its mark. The back office and the portal are
 * untouched: every rule below starts body.public.
 * ================================================================== */
body.public{--white:#121614;--mist:#1b201e;--ink:#EDEAE2;--body:#c9ccc8;--mut:#a4aca8;--accent:#ABEDD8;--on-accent:#111111;--line:#2d3532;--focus:#ABEDD8;--ok:#9fe3bd;--okbg:#15291f;--warn:#f2c46b;--warnbg:#2a2210;--stop:#f0a08f;--stopbg:#2c1714;background:#121614;color:#c9ccc8}
body.public a{color:#ABEDD8}
body.public .top{background:#121614;border-bottom:1px solid #2d3532}
body.public .topline{padding:.9rem 1.5rem;max-width:74rem;min-height:76px}
body.public .brandmark{display:inline-flex;align-items:center;gap:12px;text-decoration:none;color:#EDEAE2}
body.public .brandmark .wm{font-family:"Roboto Slab","Rockwell","Bookman Old Style",Georgia,serif;font-weight:800;font-size:13px;letter-spacing:.18em;text-transform:uppercase}
body.public .mark{width:52px;height:52px;overflow:visible}
body.public .mk{fill:none;stroke:#EDEAE2;stroke-width:3.2;stroke-linecap:round;stroke-linejoin:round;stroke-dasharray:1 1;stroke-dashoffset:0;animation:pubmkloop 3.8s cubic-bezier(.65,0,.35,1) infinite}
body.public .mk-scr{fill:none;stroke:#ABEDD8;stroke-width:2.6;transform-box:fill-box;transform-origin:50% 50%;animation:pubmkin 3.8s ease infinite both}
body.public .mk-key{fill:#EDEAE2;transform-box:fill-box;transform-origin:50% 50%;animation:pubmkin 3.8s ease infinite both}
body.public .mk-key:nth-of-type(2){animation-delay:.12s}body.public .mk-key:nth-of-type(3){animation-delay:.18s}body.public .mk-key:nth-of-type(4){animation-delay:.24s}
body.public .mk-key:nth-of-type(5){animation-delay:.30s}body.public .mk-key:nth-of-type(6){animation-delay:.36s}body.public .mk-key:nth-of-type(7){animation-delay:.42s}
@keyframes pubmkloop{0%{stroke-dashoffset:1}32%{stroke-dashoffset:0}72%{stroke-dashoffset:0}100%{stroke-dashoffset:-1}}
@keyframes pubmkin{0%,28%{opacity:0;transform:scale(.3)}38%,70%{opacity:1;transform:scale(1)}80%,100%{opacity:0;transform:scale(.3)}}
@media (prefers-reduced-motion:reduce){body.public .mk,body.public .mk-scr,body.public .mk-key{animation:none}}
body.public .top nav:not(.appnav){margin-left:auto;display:flex;align-items:center;gap:1.4rem}
body.public .top nav:not(.appnav) a{margin-right:0;color:#c9ccc8;text-decoration:none;font-size:16px}
body.public .top nav:not(.appnav) a:hover{color:#EDEAE2}
body.public .top nav:not(.appnav) a.navcta{display:inline-flex;align-items:center;min-height:44px;padding:0 20px;border-radius:999px;background:#ABEDD8;color:#111111;font-weight:700;font-size:15px}
body.public .top nav:not(.appnav) a.navcta:hover{background:#c4f3e3;color:#111111}
body.public main{max-width:48rem;padding:3rem 1.5rem 5rem}
body.public h1,body.public h2,body.public h3,body.public h4{color:#EDEAE2}
body.public h1{font-size:clamp(32px,4.4vw,48px);letter-spacing:-.01em}
body.public h2{font-size:clamp(26px,3.2vw,38px);line-height:1.18;letter-spacing:-.01em}
body.public .rung{display:inline-block;font-size:13px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:#ABEDD8;margin:0 0 .4rem}
body.public .group,body.public .eyebrow{font-size:14px;letter-spacing:.04em;color:#a4aca8}
body.public .help,body.public p{color:#c9ccc8}
body.public label,body.public .fl,body.public legend{color:#EDEAE2}
body.public .opts{gap:.75rem;margin:1.5rem 0}
body.public .opt{background:#1b201e;border:1px solid #3e4945;border-radius:14px;padding:1rem 1.15rem;color:#EDEAE2;font-size:17px;font-weight:600;cursor:pointer;transition:border-color .25s ease,box-shadow .3s ease,background .25s ease}
body.public .opt:hover,body.public .opt:focus-within{border-color:#ABEDD8;box-shadow:0 0 0 1px #ABEDD8,0 0 26px 2px rgba(171,237,216,.3)}
body.public .opt:has(input:checked),body.public .opt.sel{border-color:#ABEDD8;background:rgba(171,237,216,.1);box-shadow:inset 0 0 0 1px #ABEDD8}
body.public input[type="checkbox"],body.public input[type="radio"]{accent-color:#ABEDD8}
body.public input,body.public select,body.public textarea,body.public .fi{background:#1b201e;color:#EDEAE2;border:1px solid #3e4945;border-radius:12px;min-height:3rem;padding:.65rem .85rem;color-scheme:dark}
body.public input[type="checkbox"],body.public input[type="radio"]{min-height:0;padding:0}
body.public input:focus-visible,body.public select:focus-visible,body.public textarea:focus-visible,body.public .fi:focus-visible{outline:none;border-color:#ABEDD8;box-shadow:0 0 0 1px #ABEDD8,0 0 22px rgba(171,237,216,.28)}
body.public .cta,body.public .btn-primary,body.public button[type="submit"]:not(.linkish):not(.opt):not(.btn-quiet){background:#ABEDD8;border-color:#ABEDD8;color:#111111;border-radius:999px;font-weight:700;min-height:3rem;padding:.7rem 1.5rem}
body.public .cta:hover,body.public .btn-primary:hover,body.public button[type="submit"]:not(.linkish):not(.opt):not(.btn-quiet):hover{background:#c4f3e3;border-color:#c4f3e3;color:#111111}
body.public .btn-quiet{background:transparent;color:#EDEAE2;border-color:#3e4945;border-radius:999px}
body.public .card,body.public .pblock,body.public .assumebox,body.public .gate{background:#1b201e;border-color:#2d3532;color:#c9ccc8;border-radius:16px}
body.public .figbig{color:#ABEDD8;font-size:clamp(40px,6vw,64px)}
body.public table{color:#c9ccc8}
body.public th,body.public td{border-color:#2d3532}
body.public .err{color:#f0a08f}
body.public .ok{color:#9fe3bd}
body.public .foot{background:#0e1210;border-top:1px solid #2d3532;color:#a4aca8}
body.public .foot p{color:#a4aca8}
body.public .foot a{color:#EDEAE2}
body.public .skip:focus{background:#121614;color:#EDEAE2}
body.public fieldset{border:1px solid #2d3532;border-radius:16px;padding:1.1rem 1.4rem 1.4rem;margin:1.6rem 0;background:#161b19}
body.public legend{font-family:"Bookman Old Style","Roboto Slab",Georgia,"Times New Roman",serif;font-size:21px;font-weight:700;padding:0 .5rem;color:#EDEAE2}
body.public fieldset .fl:first-of-type{margin-top:.4rem}
body.public .err ul{margin:.3rem 0 0;padding-left:1.2rem}

body.public .f4-stages{list-style:none;display:flex;gap:6px;margin:0 0 1.6rem;padding:0;counter-reset:f4}
body.public .f4-stages li{flex:1;counter-increment:f4;font-size:13px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#a4aca8;border-top:4px solid #2d3532;padding-top:.5rem}
body.public .f4-stages li.done{color:#ABEDD8;border-top-color:#ABEDD8}
body.public .f4-stages li.cur{color:#EDEAE2;border-top-color:#ABEDD8}
body.public .f4-h{font-size:clamp(28px,4vw,42px);margin:.2rem 0 .6rem}
body.public .f4-cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr))}
body.public .f4-add{border-style:dashed;width:100%;min-height:3.2rem;font-weight:700;color:#ABEDD8;border-color:#3e4945}
body.public .f4-same{display:block;margin:.2rem 0 1rem;color:#ABEDD8;font-weight:700}
body.public .f4-nav{display:flex;justify-content:space-between;align-items:center;gap:1rem;margin-top:1.6rem}
body.public .f4-back{color:#c9ccc8}
body.public .f4-teaser,body.public .f4-ready{border:1px solid #ABEDD8;border-radius:16px;padding:1.2rem 1.4rem;margin:0 0 1.6rem;background:rgba(171,237,216,.06)}
body.public .f4-teaser ul{margin:.4rem 0;padding-left:1.2rem}
body.public .f4-kicker{margin:0 0 .4rem;font-size:13px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:#ABEDD8}
body.public .f4-hidden{font-family:"Bookman Old Style","Roboto Slab",Georgia,serif;font-size:clamp(40px,7vw,64px);font-weight:700;margin:.2rem 0 .6rem;color:#ABEDD8;user-select:none}
body.public .f4-hidden span{filter:blur(14px);opacity:.8}
body.public .f4-reveal{text-align:center;border-radius:20px;padding:2rem 1rem 1.4rem;margin:0 0 1.4rem;background:radial-gradient(circle at 50% 0%,rgba(171,237,216,.16),rgba(171,237,216,0) 70%)}
body.public .f4-lead{font-size:18px;color:#c9ccc8;margin:0}
body.public .f4-amount{margin:.4rem 0 .4rem;font-family:"Bookman Old Style","Roboto Slab",Georgia,serif;font-weight:700;font-size:clamp(52px,11vw,104px);line-height:1.1;color:#ABEDD8}
body.public .f4-reels{display:inline-flex;align-items:flex-start}
body.public .f4-reel{display:inline-block;height:1.1em;overflow:hidden;vertical-align:top}
body.public .f4-reel>span{display:flex;flex-direction:column;animation:f4climb 2.4s cubic-bezier(.16,.84,.24,1) both}
body.public .f4-reel i{font-style:normal;display:block;height:1.1em;line-height:1.1em}
body.public .f4-sep{display:inline-block;height:1.1em;line-height:1.1em}
body.public .f4-r0>span{transform:translateY(-11.00em)}body.public .f4-r1>span{transform:translateY(-12.10em)}body.public .f4-r2>span{transform:translateY(-13.20em)}body.public .f4-r3>span{transform:translateY(-14.30em)}body.public .f4-r4>span{transform:translateY(-15.40em)}body.public .f4-r5>span{transform:translateY(-16.50em)}body.public .f4-r6>span{transform:translateY(-17.60em)}body.public .f4-r7>span{transform:translateY(-18.70em)}body.public .f4-r8>span{transform:translateY(-19.80em)}body.public .f4-r9>span{transform:translateY(-20.90em)}
body.public .f4-p0>span{animation-delay:0.0s}body.public .f4-p1>span{animation-delay:0.1s}body.public .f4-p2>span{animation-delay:0.2s}body.public .f4-p3>span{animation-delay:0.3s}body.public .f4-p4>span{animation-delay:0.4s}body.public .f4-p5>span{animation-delay:0.5s}body.public .f4-p6>span{animation-delay:0.6s}body.public .f4-p7>span{animation-delay:0.7s}body.public .f4-p8>span{animation-delay:0.8s}body.public .f4-p9>span{animation-delay:0.9s}
@keyframes f4climb{from{transform:translateY(0)}}
@media (prefers-reduced-motion:reduce){body.public .f4-reel>span{animation:none}}
body.public .f4-parts{display:grid;gap:10px;margin:0 0 1rem}
body.public .f4-consent{margin:1rem 0}
body.public .f4-consent label.ck{display:block}
body.public .f4-part{border:1px solid #2d3532;border-radius:14px;padding:.8rem 1rem;background:#161b19}
body.public .f4-part-name{margin:0;font-weight:700;color:#EDEAE2}
body.public .f4-part-figure{margin:.2rem 0 0;color:#ABEDD8;font-weight:700}
body.public .f4-assume{margin:0 0 2rem}
body.public .f4-assume summary{cursor:pointer;color:#ABEDD8;font-weight:700}
body.public .f4-names{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:0 16px}
body.public .f4-channel-cards{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin:.4rem 0 1rem}
body.public .f4-channel{display:flex;align-items:center;justify-content:center;gap:8px;min-height:3.4rem;border:1px solid #3e4945;border-radius:14px;font-weight:700;color:#EDEAE2;cursor:pointer;background:#1b201e;transition:border-color .25s ease,box-shadow .3s ease}
body.public .f4-channel:hover{border-color:#ABEDD8;box-shadow:0 0 0 1px #ABEDD8,0 0 24px rgba(171,237,216,.3)}
body.public .f4-channel:has(input:checked){border-color:#ABEDD8;background:rgba(171,237,216,.12);box-shadow:inset 0 0 0 1px #ABEDD8}
body.public .f4-picker fieldset{border:0;padding:0;margin:.6rem 0;min-width:0}
body.public .f4-addresses{border:0;padding:0;margin:.6rem 0;min-width:0}
body.public .f4-addresses legend{padding:0}
body.public .f4-address-list{display:grid;gap:6px;max-height:20rem;overflow-y:auto;padding:2px}
body.public .f4-address-list .opt{margin:0;padding:.55rem .8rem;font-weight:400}
body.public .f4-channels,body.public .f4-picker{min-width:0;max-width:100%}
body.public .f4-date-row{display:flex;gap:10px;overflow-x:auto;padding:4px 2px 10px;scroll-snap-type:x proximity}
body.public .f4-date{position:relative;flex:0 0 auto;display:flex;flex-direction:column;align-items:center;gap:2px;min-width:84px;padding:10px 12px;border:1px solid #3e4945;border-radius:14px;background:#1b201e;color:#EDEAE2;cursor:pointer;scroll-snap-align:start;transition:border-color .25s ease,box-shadow .3s ease}
body.public .f4-date input,body.public .f4-time input{position:absolute;opacity:0;width:1px;height:1px}
body.public .f4-date:hover,body.public .f4-time:hover{border-color:#ABEDD8}
body.public .f4-date:has(input:checked),body.public .f4-time:has(input:checked){border-color:#ABEDD8;background:rgba(171,237,216,.12);box-shadow:inset 0 0 0 1px #ABEDD8}
body.public .f4-date:has(input:focus-visible),body.public .f4-time:has(input:focus-visible){outline:2px solid #ABEDD8;outline-offset:2px}
body.public .f4-wd{font-size:13px;text-transform:uppercase;letter-spacing:.08em;color:#b9c2be}
body.public .f4-dm{font-size:18px;font-weight:700}
body.public .f4-n{font-size:12px;color:#b9c2be}
body.public .f4-times-h{font-weight:700;margin:.4rem 0}
body.public .f4-time-row{display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:10px}
body.public .f4-time{position:relative;display:flex;align-items:center;justify-content:center;min-height:3rem;border:1px solid #3e4945;border-radius:12px;background:#1b201e;color:#EDEAE2;font-weight:700;cursor:pointer}
body.public .f4-none{margin-top:.8rem}
@supports selector(:has(*)){
 body.public .f4-follow,body.public .f4-if-cosmetic,body.public .f4-for-slot,body.public .f4-for-phone,body.public .f4-for-email,body.public .f4-for-video-note{display:none}
 body.public .f4-own:has(.f4-tax input[value="yes"]:checked) .f4-if-tax-yes{display:block}
 body.public .f4-own:has(.f4-works input[value="yes"]:checked) .f4-if-works-yes{display:block}
 body.public .f4-follow:has(.f4-kind input[value="cosmetic"]:checked) .f4-if-cosmetic{display:block}
 body.public .f4-b:has(.f4-same input:checked) .f4-own{display:none}
 body.public .f4-channels:has(input[value="phone"]:checked) .f4-for-slot,body.public .f4-channels:has(input[value="video"]:checked) .f4-for-slot{display:block}
 body.public .f4-channels:has(input[value="phone"]:checked) .f4-for-phone{display:block}
 body.public .f4-channels:has(input[value="video"]:checked) .f4-for-email,body.public .f4-channels:has(input[value="email"]:checked) .f4-for-email{display:block}
 body.public .f4-channels:has(input[value="video"]:checked) .f4-for-video-note{display:block}
 body.public .f4-times{display:none}
 body.public .f4-picker:has(.f4-d0 input:checked) .f4-t0{display:block}
 body.public .f4-picker:has(.f4-d1 input:checked) .f4-t1{display:block}
 body.public .f4-picker:has(.f4-d2 input:checked) .f4-t2{display:block}
 body.public .f4-picker:has(.f4-d3 input:checked) .f4-t3{display:block}
 body.public .f4-picker:has(.f4-d4 input:checked) .f4-t4{display:block}
 body.public .f4-picker:has(.f4-d5 input:checked) .f4-t5{display:block}
 body.public .f4-picker:has(.f4-d6 input:checked) .f4-t6{display:block}
 body.public .f4-picker:has(.f4-d7 input:checked) .f4-t7{display:block}
 body.public .f4-picker:has(.f4-d8 input:checked) .f4-t8{display:block}
 body.public .f4-picker:has(.f4-d9 input:checked) .f4-t9{display:block}
 body.public .f4-picker:has(.f4-d10 input:checked) .f4-t10{display:block}
 body.public .f4-picker:has(.f4-d11 input:checked) .f4-t11{display:block}
 body.public .f4-picker:has(.f4-d12 input:checked) .f4-t12{display:block}
 body.public .f4-picker:has(.f4-d13 input:checked) .f4-t13{display:block}
 body.public .f4-picker:has(.f4-d14 input:checked) .f4-t14{display:block}
 body.public .f4-picker:has(.f4-d15 input:checked) .f4-t15{display:block}
 body.public .f4-times-h{display:none}
}
@media (max-width:620px){body.public .f4-names,body.public .f4-channel-cards{grid-template-columns:minmax(0,1fr)}body.public .f4-stages li{font-size:12px}}
@media (max-width:620px){body.public .brandmark .wm{font-size:12px;letter-spacing:.14em}body.public .mark{width:44px;height:44px}body.public .top nav:not(.appnav){gap:.9rem}}
`;

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
