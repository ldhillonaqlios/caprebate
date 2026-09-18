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
.taskcount{display:inline-flex;align-items:center;gap:.35rem;text-decoration:none;color:var(--ink);font-size:16px;padding:.3rem .6rem;border:1px solid var(--line);border-radius:999px;background:var(--white);white-space:nowrap}
.taskcount .n{display:inline-grid;place-items:center;min-width:1.6rem;height:1.6rem;padding:0 .35rem;border-radius:999px;background:var(--accent);color:var(--on-accent);font-weight:700;font-size:14px}
.taskcount .overdue-n{color:var(--stop);font-weight:600}
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
  dl{grid-template-columns:minmax(0,1fr)}
  dt{margin-top:.4rem}
  .stagebar ol{flex-direction:column;gap:.25rem;overflow:visible}
  .stagebar li,.stagebar li:first-child,.stagebar li:last-child{clip-path:none;border-radius:.35rem;text-align:left;min-width:0}
  .board{flex-direction:column;overflow:visible}
  .board>li,.board>li.empty-col{flex-basis:auto;width:100%}
  .cards{grid-template-columns:minmax(0,1fr)}
  .typefacts{grid-template-columns:minmax(0,1fr)}
  .form-row{display:block}
  form label>input:not([type="checkbox"]):not([type="radio"]):not([type="file"]),form label>select,form label>textarea{max-width:none}
}
@media (prefers-reduced-motion:reduce){*{scroll-behavior:auto!important}}
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
