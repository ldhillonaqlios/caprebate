#!/usr/bin/env node
/* =============================================================================
   CAP REBATE — THE BRAND CHECK FOR THE ESTATE OUTSIDE THE APP        Phase 133d
   17 September 2026

   WHAT IT CHECKS
     Phase 133c put the back office and the client portal into the brand, and
     test/phase133c.test.ts guards those. Nothing guarded the three public files
     outside the application. This does, reading each as a file:

       "Caprebate site.html"             (one level above the tree)
       03-app/caprebate-notices-page.html
       03-app/caprebate-complaint-form.html
       00-START-HERE/"Caprebate — Blockers & What Unblocks Them.html"
                                        (INTERNAL — FONT, COLOUR and MAIL only)

     FONT    no web font: no Google Fonts link, no @import, no Newsreader or
             Spline Sans; every font-family is the brand's heading or body stack
             (or inherit, or a monospace stack for code)
     COLOUR  every colour literal - in a stylesheet, a style="" attribute or a
             script string - is a brand token (read from the back end's
             src/web/assets.ts, not restated), one of two named tints, or black
             and white; every rgba() is ink, mint, mist, black or white
     MINT    no rule sets white text on Cap Mint (the back end's own
             whiteOnMintRules, run on every stylesheet and style attribute)
     NAME    the name a reader sees is "Cap Rebate": no "Caprebate" in visible
             text or a script string outside a comment; the domain, the file
             name and CB_ identifiers are not the name and are not counted.
             The company is named only as registered - CAP REBATE LTD,
             17307313 - and every public file names it (18 Sep 2026)
     VOICE   no exclamation mark in visible text; no avoid-list word (the back
             end's src/web/voice.ts)
     LOGO    (site) the header's first element is the supplied mono-ink logo,
             byte for byte, as a data: URI at 100 px or wider
     DATES   (site) the display-edge script turns an ISO day into a UK date and
             leaves an id, an invalid date and an input's value alone
     MAIL    (all four, Phase 151) no caprebate.com anywhere - the business is on
             caprebate.co.uk; every address on the domain is one of the three
             IONOS mailboxes (contact@, data.protection@, security@); the site
             shows contact@, the notices page and the complaint form show
             data.protection@. A .bak-phase151 copy of any of the four goes RED

   THE FOURTH FILE IS INTERNAL, AND ONLY THREE CHECKS APPLY TO IT (FONT, COLOUR, MAIL).
     The blockers page is written for Lakhbir and is read by nobody outside the
     business, so NAME DOES NOT APPLY - its title still says "Caprebate" and that
     is deliberate, not a miss. Nor do MINT, VOICE, LOGO or DATES: it carries no
     mint panel, no marketing voice, no logo and no dates to localise. FONT and
     COLOUR do apply, because a page that loads Google Fonts is the brand
     leaking, and that is what Phase 133e came here to fix.

   RUN
     node 03-app/caprebate-brand-check.cjs                 exit 1 on any failure
     node 03-app/caprebate-brand-check.cjs --self-test     planted faults; every one must fail
     node 03-app/caprebate-brand-check.cjs --site <file> --notices <file> --form <file>
                                           --blockers <file>
         point any of the four at another copy - a .bak-phase133d copy of the
         first three, or the .bak-phase133e copy of the blockers page, must go RED
   ============================================================================= */
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { pathToFileURL } = require("url");

const ROOT = path.join(__dirname, "..");
const BACKEND = path.join(ROOT, "09-app", "backend", "src", "web");
const LOGO_INK = path.join(ROOT, "04-phase-work", "phase133c", "brand-assets", "caprebate_logo_monoink_924.png");
const arg = (k) => { const i = process.argv.indexOf(k); return i >= 0 ? process.argv[i + 1] : null; };

/* Two tints the site's layout uses that the token list does not carry. Neither carries text. */
const TINTS = ["#e2ebe7", "#e6f0ec"];

function stripComments(html) {
  return html.replace(/<!--[\s\S]*?-->/g, "");
}

/* The stylesheets, the style attributes and the script bodies of a page. */
function parts(html) {
  const h = stripComments(html);
  const styles = [...h.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map((m) => m[1].replace(/\/\*[\s\S]*?\*\//g, ""));
  const attrs = [...h.matchAll(/\sstyle="([^"]*)"/g)].map((m) => m[1]);
  const scripts = [...h.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  return { h, styles, attrs, scripts };
}

/* String literals outside comments, line by line - the same reading the site harness uses for M1 and M2. */
function scriptStrings(js) {
  const STRLIT = /"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'/g;
  const out = [];
  let inBlock = false;
  for (const line of js.split("\n")) {
    const t = line.trim();
    if (!inBlock && t.startsWith("/*")) inBlock = true;
    if (inBlock) { if (t.includes("*/")) inBlock = false; continue; }
    if (t.startsWith("//") || t.startsWith("*")) continue;
    const code = line.replace(/\/\/.*$/, (c) => (/["']/.test(c) ? c : ""));
    for (const m of code.match(STRLIT) || []) out.push(m.slice(1, -1));
  }
  return out;
}

/* What a reader sees: markup text outside script, style and comments, plus script strings with their tags removed. */
function visibleText(html) {
  const { h, scripts } = parts(html);
  const markup = h.replace(/<script[\s\S]*?<\/script>/g, " ").replace(/<style[\s\S]*?<\/style>/g, " ")
    .replace(/<template[^>]*>/g, " ").replace(/<\/template>/g, " ");
  const text = (s) => s.replace(/<[^>]*>/g, " ").replace(/&amp;/g, "&").replace(/&nbsp;/g, " ").replace(/&[a-z]+;/g, " ");
  const strings = scripts.flatMap(scriptStrings).map((s) => text(s.replace(/\\u2019/g, "’").replace(/\\u2014/g, "—")));
  return { markup: text(markup), strings };
}

async function brand() {
  const assets = await import(pathToFileURL(path.join(BACKEND, "assets.ts")).href);
  const voice = await import(pathToFileURL(path.join(BACKEND, "voice.ts")).href);
  const src = fs.readFileSync(path.join(BACKEND, "assets.ts"), "utf8");
  return {
    tokens: assets.BRAND_TOKENS,
    whiteOnMintRules: assets.whiteOnMintRules,
    avoidHits: voice.avoidHits,
    heading: /const HEADING_STACK = '([^']+)'/.exec(src)[1],
    body: /const BODY_STACK = '([^']+)'/.exec(src)[1],
  };
}

function rgbOf(hex) {
  const n = hex.replace("#", "");
  const f = n.length === 3 ? n.split("").map((c) => c + c).join("") : n;
  return [0, 2, 4].map((i) => parseInt(f.slice(i, i + 2), 16)).join(",");
}

/* The three mailboxes that exist (IONOS, confirmed by Lakhbir 24 Sep 2026), and what each is for.
   contact@          general, the sending address, thank-you screens, complaints about the service
   data.protection@  the data protection officer, the privacy notice, the notices page
   security@         breach reports                                                            */
const MAILBOXES = ["contact@caprebate.co.uk", "data.protection@caprebate.co.uk", "security@caprebate.co.uk"];
/* The address each public file must show a reader. */
const MAIL_REQUIRED = { site: "contact@caprebate.co.uk", notices: "data.protection@caprebate.co.uk", form: "data.protection@caprebate.co.uk" };

/* MAIL1 the old domain anywhere in the file - text, a link, a canonical tag or a script;
   MAIL2 an address on our domain that is not one of the three mailboxes;
   MAIL3 a public file that does not show a reader the address it needs. Comments are not read. */
function mailFindings(kind, h) {
  const out = [];
  const old = /caprebate\.com(?![a-z0-9])/i.exec(h);
  if (old) out.push({ id: "MAIL1", msg: `the old domain caprebate.com: …${h.slice(Math.max(0, old.index - 50), old.index + 30).replace(/\s+/g, " ")}…` });
  for (const m of h.matchAll(/[A-Za-z0-9._%+-]+@caprebate\.co\.uk/gi)) {
    if (!MAILBOXES.includes(m[0].toLowerCase())) out.push({ id: "MAIL2", msg: `an address that is not one of our three mailboxes: ${m[0]}` });
  }
  const want = MAIL_REQUIRED[kind];
  if (want && !h.toLowerCase().includes(want)) out.push({ id: "MAIL3", msg: `the ${kind} file does not show ${want}` });
  return out;
}

/* ---------------------------------------------------------------- the checks, one list per file */
function checkFile(kind, html, B) {
  const fails = [];
  const fail = (id, msg) => fails.push(`${id}  ${msg}`);
  const { h, styles, attrs, scripts } = parts(html);
  const css = styles.join("\n");

  /* FONT */
  if (/fonts\.googleapis|fonts\.gstatic|@import|Newsreader|Spline Sans|Spline\+Sans/.test(h)) fail("FONT1", "a web font is still loaded or named");
  if (/<link[^>]*rel="(?:stylesheet|preload)"/i.test(h)) fail("FONT1", "an external stylesheet is linked");
  const fams = [...(css + ";" + attrs.join(";") + ";" + scripts.join("\n")).matchAll(/font-family:\s*([^;}\n]+)/g)].map((m) => m[1].trim().replace(/["'+\s]+$/, "").replace(/^(var\(--font-(?:head|body)\)).*$/, "$1"));
  const okFam = (f) => f === "inherit" || /^var\(--font-(head|body)\)$/.test(f) || f === B.heading || f === B.body || /monospace$/.test(f);
  for (const f of new Set(fams)) if (!okFam(f)) fail("FONT2", `a font-family off the brand stacks: ${f.slice(0, 80)}`);
  if (kind === "site") {
    if (!h.includes(`--font-head:${B.heading}`) || !h.includes(`--font-body:${B.body}`)) fail("FONT2", "the brand heading and body stacks are not declared");
  } else if (!h.includes(B.body) || !h.includes(B.heading)) fail("FONT2", "the brand heading and body stacks are not both used");

  /* COLOUR */
  const allowed = new Set([...Object.values(B.tokens), ...TINTS, "#fff", "#ffffff", "#000", "#000000"].map((c) => c.toLowerCase()));
  const allowedRgb = new Set([...Object.values(B.tokens), "#fff", "#000"].map(rgbOf));
  const colourText = [css, attrs.join(";"), scripts.flatMap(scriptStrings).join("\n")].join("\n");
  for (const m of colourText.matchAll(/#(?:[0-9a-fA-F]{6}|[0-9a-fA-F]{3})(?![0-9a-zA-Z_-])/g)) {
    if (!allowed.has(m[0].toLowerCase())) fail("COLOUR1", `a colour off the brand: ${m[0]}`);
  }
  for (const m of colourText.matchAll(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/g)) {
    if (!allowedRgb.has(`${m[1]},${m[2]},${m[3]}`)) fail("COLOUR2", `an rgba() off the brand: ${m[0]}`);
  }
  if (kind !== "form") {
    for (const k of ["ink", "mint", "mist"]) {
      if (!new RegExp(`--${k === "mist" ? "(?:mist|paper-2)" : k}:${B.tokens[k]}`, "i").test(css)) fail("COLOUR3", `--${k} is not the brand's ${B.tokens[k]}`);
    }
  }

  /* MAIL - Phase 151, 24 Sep 2026 (Word answers 3, 13, 24, 44, 186 and 211). The business is on
     caprebate.co.uk and its three mailboxes are on IONOS. It applies to all four files, the internal
     one included: an old address on the blockers page sends Lakhbir to a mailbox nobody reads. */
  for (const f of mailFindings(kind, h)) fail(f.id, f.msg);

  /* The blockers page is internal: FONT, COLOUR and MAIL are the whole of its contract.
     NAME in particular does NOT apply - its title still carries the old spelling on purpose. */
  if (kind === "blockers") return fails;

  /* MINT */
  const bad = [...B.whiteOnMintRules(css), ...attrs.flatMap((a) => B.whiteOnMintRules(`[style]{${a}}`))];
  if (bad.length > 0) fail("MINT1", `white text on Cap Mint: ${bad.join(" | ")}`);

  /* NAME */
  const { markup, strings } = visibleText(html);
  const reads = [markup, ...strings].join("\n");
  const title = /<title>([^<]*)<\/title>/.exec(h);
  const cr = /Caprebate(?![ -]?site\.html)/.exec(reads);
  if (cr) fail("NAME1", `"Caprebate" in what a reader sees: …${reads.slice(Math.max(0, cr.index - 60), cr.index + 30).replace(/\s+/g, " ")}…`);
  if (!/Cap Rebate/.test(reads) && !(title && /Cap Rebate/.test(title[1]))) fail("NAME2", '"Cap Rebate" is not in what a reader sees');
  /* 18 Sep 2026 (Phase 133g): CAP REBATE LTD, 17307313, is ours. The company is named only as registered. */
  if (/Cap Rebate (?:Ltd|Limited)|CAP REBATE LIMITED|company (?:number|no\.?)\s+(?!17307313)[0-9A-Z]{6,8}\b/.test(reads)) fail("NAME3", "the page names the company other than as registered: CAP REBATE LTD, company number 17307313");
  if (!/CAP REBATE LTD/.test(reads) || !/17307313/.test(reads)) fail("NAME4", "the page does not name the company as registered: CAP REBATE LTD, company number 17307313");

  /* VOICE */
  for (const t of [markup, ...strings]) {
    const flat = t.replace(/\s+/g, " ");
    const ex = /[A-Za-z0-9.)’”]!(?=[\s"'”<]|$)/.exec(flat);
    if (ex) fail("VOICE1", `an exclamation mark: …${flat.slice(Math.max(0, ex.index - 60), ex.index + 3)}`);
    for (const hit of B.avoidHits(flat)) fail("VOICE2", `avoid list "${hit.word}": …${hit.context.replace(/\s+/g, " ")}…`);
  }

  if (kind === "site") {
    /* LOGO */
    const nav = /<header id="hdr">\s*<div class="wrap nav">\s*<a href="#top" class="wordmark logo"><img id="cbLogo" src="data:image\/png;base64,([A-Za-z0-9+/=]+)" alt="Cap Rebate[^"]*" width="(\d+)"/.exec(h);
    if (!nav) fail("LOGO1", "the header does not open with the logo as a data: URI");
    else {
      if (Number(nav[2]) < 100) fail("LOGO2", `the logo is ${nav[2]} px wide; the brand minimum is 100`);
      if (!Buffer.from(nav[1], "base64").equals(fs.readFileSync(LOGO_INK))) fail("LOGO3", "the header logo is not the supplied mono-ink file, byte for byte");
    }
    /* DATES */
    const ukScript = scripts.find((s) => s.includes("CB_UKDATES"));
    if (!ukScript) fail("DATES1", "no display-edge UK date script");
    else {
      const sandbox = { window: {} };
      try { vm.runInNewContext(ukScript, sandbox, { timeout: 1000 }); } catch (e) { fail("DATES1", `the UK date script throws: ${e.message}`); }
      const uk = sandbox.window.CB_UKDATES && sandbox.window.CB_UKDATES.uk;
      const cases = [
        ["amended until 2027-01-31; after that", "amended until 31 Jan 2027; after that"],
        ["ending 2026-03-31 (from 2025-04-06)", "ending 31 Mar 2026 (from 6 Apr 2025)"],
        ["ref A-2026-01-01x stays", "ref A-2026-01-01x stays"],
        ["2026-13-01 is not a date", "2026-13-01 is not a date"],
      ];
      if (typeof uk !== "function") fail("DATES1", "CB_UKDATES.uk is not exposed");
      else for (const [i, o] of cases) if (uk(i) !== o) fail("DATES2", `uk(${JSON.stringify(i)}) gave ${JSON.stringify(uk(i))}`);
      if (!/INPUT\)\$\//.test(ukScript) && !/\|INPUT\)/.test(ukScript)) fail("DATES3", "the walker does not skip INPUT");
    }
  }
  return fails;
}

const FILES = () => ({
  site: arg("--site") || path.join(ROOT, "..", "Caprebate site.html"),
  notices: arg("--notices") || path.join(__dirname, "caprebate-notices-page.html"),
  form: arg("--form") || path.join(__dirname, "caprebate-complaint-form.html"),
  blockers: arg("--blockers") || path.join(ROOT, "00-START-HERE", "Caprebate \u2014 Blockers & What Unblocks Them.html"),
});

async function main() {
  const B = await brand();
  if (process.argv.includes("--self-test")) return selfTest(B);
  let total = 0;
  console.log("\nCap Rebate — the brand check for the site, the notices page, the complaint form and the internal blockers page\n");
  for (const [kind, file] of Object.entries(FILES())) {
    const fails = checkFile(kind, fs.readFileSync(file, "utf8"), B);
    const seen = [...new Set(fails)];
    console.log(`${seen.length === 0 ? "  ok  " : "  FAIL"}  ${kind.padEnd(8)} ${path.basename(file)}`);
    for (const f of seen.slice(0, 40)) console.log(`          ${f}`);
    if (seen.length > 40) console.log(`          … and ${seen.length - 40} more`);
    total += seen.length;
  }
  console.log(total === 0 ? "\nGREEN: all four files are in the brand.\n" : `\nRED: ${total} finding(s).\n`);
  process.exit(total === 0 ? 0 : 1);
}

/* Each planted fault is one small edit to a clean file, and must make exactly the named check fail. */
function selfTest(B) {
  const f = FILES();
  const site = fs.readFileSync(f.site, "utf8");
  const notices = fs.readFileSync(f.notices, "utf8");
  const blockers = fs.readFileSync(f.blockers, "utf8");
  const cases = [
    ["site", site, "clean site", null],
    ["notices", notices, "clean notices page", null],
    ["blockers", blockers, "clean blockers page (internal)", null],
    ["site", site.replace("</head>", '<link href="https://fonts.googleapis.com/css2?family=Newsreader" rel="stylesheet">\n</head>'), "a web font link", "FONT1"],
    ["site", site.replace(".wrap{", ".wrap{font-family:'Georgia';"), "a font off the stacks", "FONT2"],
    ["notices", notices.replace("  *{box-sizing:border-box}", "  *{box-sizing:border-box}\n  .x{color:#0f4d33}"), "an old green", "COLOUR1"],
    ["site", site.replace(".wrap{", ".wrap{box-shadow:0 0 1px rgba(15,77,51,.2);"), "an old rgba", "COLOUR2"],
    ["site", site.replace(".wrap{", ".chip2{background:var(--mint);color:#fff}.wrap{"), "white on mint", "MINT1"],
    ["notices", notices.replace("Cap Rebate, a trading name of", "Caprebate, a trading name of"), '"Caprebate" in the notices page', "NAME1"],
    ["site", site.replace("Keep me updated about Cap Rebate", "Keep me updated about Caprebate"), '"Caprebate" in a script string', "NAME1"],
    ["site", site.replace("Cap Rebate is a trading name of CAP REBATE LTD", "Cap Rebate is a trading name of Cap Rebate Ltd"), "the company named other than as registered", "NAME3"],
    ["notices", notices.replace(/17307313/g, "17307314"), "a company number that is not ours", "NAME3"],
    ["notices", notices.replace(/CAP REBATE LTD/g, "[NOT SET — registered company name]"), "a public file that does not name the company", "NAME4"],
    ["site", site.replace("<h4>Read this before you rely on the figure</h4>", "<h4>Read this before you rely on the figure!</h4>"), "an exclamation mark", "VOICE1"],
    ["notices", notices.replace("There are no current breach notices.", "There are no current breach notices. Risk-free."), "an avoid-list word", "VOICE2"],
    ["site", site.replace(/width="120" height="81"><\/a>/, 'width="80" height="54"></a>'), "a logo under 100 px", "LOGO2"],
    ["site", site.replace(/(<img id="cbLogo" src="data:image\/png;base64,)([A-Za-z0-9+/]{8})/, "$1AAAAAAAA"), "a logo that is not the supplied file", "LOGO3"],
    ["site", site.replace("return pre+di+\" \"+MON[mi]+\" \"+y;", "return pre+y+\"-\"+m+\"-\"+d;"), "a UK date script that does nothing", "DATES2"],
    /* Part C. The fault this phase came to fix, planted back on the page it was fixed on. */
    ["blockers", blockers.replace("<style>", '<link href="https://fonts.googleapis.com/css2?family=Newsreader&family=Spline+Sans" rel="stylesheet">\n<style>'),
      "the blockers page loading the old web fonts again", "FONT1"],
    ["blockers", blockers.replace("body{font-family:var(--font-body)", "body{font-family:'Spline Sans',sans-serif"),
      "the blockers page back on an off-brand face", "FONT2"],
    ["blockers", blockers.replace("header.top{background:var(--accent)", "header.top{background:#0a3a26"),
      "the blockers page back on the old green", "COLOUR1"],
    /* And the other half of its contract: NAME must NOT fire on it, because it is internal
       and its title still says "Caprebate". The same title on a public file is a NAME1. */
    ["blockers", blockers, "the blockers page keeping its old title without a NAME failure", null],
    ["notices", notices.replace("<title>", "<title>Caprebate "), "the same old spelling on a PUBLIC file", "NAME1"],
    /* Part D (Phase 151). The domain and the three mailboxes. */
    ["site", site.replace("</footer>", '<a href="https://caprebate.com/">caprebate.com</a></footer>'), "the old domain back on the site", "MAIL1"],
    ["notices", notices.replace('rel="canonical" href="https://caprebate.co.uk/', 'rel="canonical" href="https://caprebate.com/'), "the old domain in the canonical tag", "MAIL1"],
    ["blockers", blockers.replace("</body>", "<p>privacy@caprebate.com</p></body>"), "the old domain on the internal page", "MAIL1"],
    ["site", site.replace("</footer>", "<p>hello@caprebate.co.uk</p></footer>"), "an address that is not one of the three", "MAIL2"],
    ["site", site.split("contact@caprebate.co.uk").join("[an address]"), "the site without contact@", "MAIL3"],
    ["notices", notices.split("data.protection@caprebate.co.uk").join("[NOT SET — dedicated data protection address]"), "the notices page without data.protection@", "MAIL3"],
  ];
  let bad = 0;
  console.log("\nbrand check — self-test\n");
  for (const [kind, html, what, want] of cases) {
    const fails = checkFile(kind, html, B);
    const ok = want === null ? fails.length === 0 : fails.some((x) => x.startsWith(want));
    if (!ok) bad++;
    console.log(`  ${ok ? "ok  " : "FAIL"}  ${what.padEnd(40)} ${want === null ? `clean (${fails.length} findings)` : `must fail ${want}: ${fails.map((x) => x.split(" ")[0]).join(",") || "passed"}`}`);
    if (!ok && want === null) for (const x of fails.slice(0, 5)) console.log(`          ${x}`);
  }
  console.log(bad === 0 ? `\nGREEN: ${cases.length} cases, every planted fault caught.\n` : `\nRED: ${bad} case(s) wrong.\n`);
  process.exit(bad === 0 ? 0 : 1);
}

main().catch((e) => { console.error(`brand check could not run: ${e.stack || e.message}`); process.exit(2); });
