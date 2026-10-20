#!/usr/bin/env node
/* ---------------------------------------------------------------------------
   caprebate-notices-acceptance.cjs — built by Phase 99, 8 September 2026.
   Board item 12946752268.  Block G of the Developer Build Order.

   WHY THIS EXISTS.

   The channel specification carries TWELVE acceptance tests (§9).  Seven of them
   are facts about a running host — a status code, a redirect, a robots.txt, a
   WordPress setting, a sitemap entry, a footer on pages that do not exist yet,
   a search result.  Nothing on this machine can check any of those and pretending
   otherwise would be the worst thing this file could do.

   Five of them are facts about the SOURCE, and those are checkable here and now,
   automatically, every time.  They are also the five that get silently broken
   later: a theme that lazy-loads content, a consent plugin that wraps the body, a
   redesign that folds the objection block into an accordion, a "tidy-up" that
   moves the complaint form behind a script.  Each of those leaves a page that
   looks perfect and no longer complies.

   So this script does three things and labels them apart:
     STRUCTURAL   — checked here.  A failure exits 1.
     HOST         — named, never asserted.  It prints them so that "we did not
                    check that" can never be mistaken for "that passed".
     NOT SET      — the facts nobody has supplied yet.  Reported, and they gate
                    --live rather than the default run, because the page is built
                    today and cannot be published today.

   USAGE
     node 03-app/caprebate-notices-acceptance.cjs
     node 03-app/caprebate-notices-acceptance.cjs --live   (also fail on NOT SET)

   EXIT CODE: 1 if any structural check fails, or if --live is given and any
   placeholder is still unset.  Otherwise 0.
   --------------------------------------------------------------------------- */

const fs = require("fs");
const path = require("path");

const APP_DIR = __dirname;
const ROOT = path.join(APP_DIR, "..");

/* --page, --form and --privacy point the check at another copy (Phase 151): a
   .bak-phase151 copy of any of the three must go RED on S17. */
const argOf = k => { const i = process.argv.indexOf(k); return i >= 0 ? process.argv[i + 1] : null; };
const PAGE_FILE = argOf("--page") || path.join(APP_DIR, "caprebate-notices-page.html");
const FORM_FILE = argOf("--form") || path.join(APP_DIR, "caprebate-complaint-form.html");
const PRIVACY_NOTICE = argOf("--privacy") || path.join(
  ROOT, "08-monday-doc-exports",
  "12818279787__Section-1-Who-we-are-and-how-to-contact-us.md"
);

const LIVE = process.argv.includes("--live");
/* caprebate.co.uk since Phase 151 (Word answers 3, 13, 186 and 211): the business
   is on caprebate.co.uk, and caprebate.com is to redirect to it (HOST §9.1). */
const CANON = "https://caprebate.co.uk/notices/";
const DP_MAIL = "data.protection@caprebate.co.uk";

const page = fs.readFileSync(PAGE_FILE, "utf8");
const form = fs.readFileSync(FORM_FILE, "utf8");

/* Comments are not content.  Every structural check that asks "is this text in
   the page" must ask it of the text a browser renders, or a check passes on a
   note that says the opposite of what the page does. */
const stripComments = s => s.replace(/<!--[\s\S]*?-->/g, "");
const pageBody = stripComments(page);
const formBody = stripComments(form);

/* HTML collapses runs of whitespace, so a check on the words a reader sees has
   to collapse them too.  Without this, every required passage that happens to
   straddle a line break in the source reads as missing — which is a defect in
   the check, not in the page, and it is the shape that would make somebody
   reflow good prose to satisfy a bad grep. */
const flat = s => s.replace(/\s+/g, " ");
const pageFlat = flat(pageBody);
const formFlat = flat(formBody);

const results = [];
function check(id, spec, ok, detail) {
  results.push({ id, spec, ok: !!ok, detail: detail || "" });
}

/* === STRUCTURAL CHECKS =================================================== */

/* --- §9 test 2 · the text is in the source, not injected ----------------- */

check("S1", "§9.2 / §5.2.4",
  !/<script[\s>]/i.test(pageBody) && !/<script[\s>]/i.test(formBody),
  "no <script> element anywhere in either file");

/* A page can be script-free and still be assembled at runtime, so check that
   the words a reader came for are literally present. */
const MUST_BE_IN_SOURCE = [
  ["the current-notices line",      "There are no current breach notices."],
  ["the Article 14(7) opening",     "documents that name people who are not our client"],
  ["the objection right",           "right to object to this processing at any time"],
  ["the s.164A right",              "section 164A of the Data Protection Act 2018"],
  ["the s.165 route",               "section 165 of the Data Protection Act 2018"],
  ["the s.166 Tribunal route",      "section 166"],
  ["the s.167 court route",         "section 167 of the Data Protection Act 2018"],
  ["the s.168 distress limb",       "compensation for distress"],
  ["the independence sentence",     "You do not have to complain to us first"],
  ["the form-is-not-a-gate line",   "You do not have to use the form."],
  ["the names rule",                "There are two exceptions, and only two"],
  ["the planning-records promise",  "never taken from planning records"],
  ["the archive",                   "When a notice on this page is withdrawn it moves here"],
];
/* The Article 14(7) opening is drafted as "Those documents often name people who
   are not our client" with markup between the words, so match on a shorter and
   markup-free fragment. */
MUST_BE_IN_SOURCE[1][1] = "name people who are not our client";

const missingText = MUST_BE_IN_SOURCE.filter(([, s]) => !pageFlat.includes(s));
check("S2", "§9.2",
  missingText.length === 0,
  missingText.length
    ? "MISSING from the rendered source: " + missingText.map(m => m[0]).join("; ")
    : MUST_BE_IN_SOURCE.length + " required passages all present verbatim");

/* --- §9 test 4 · no page-level noindex ----------------------------------- */

check("S3", "§9.4 / §5.2.2",
  !/noindex/i.test(pageBody) && !/noindex/i.test(formBody),
  "no robots meta and no noindex directive in either file");

/* --- the Article 21(4) layout rule --------------------------------------- */

/* This is the check the specification cares about most, because 21(4) constrains
   the LAYOUT and a layout rule is the one thing that survives a document and not
   a web template.  Three things have to hold: the block exists, it is its own
   sectioning element, and the stylesheet actually separates it visually. */
const objSection = pageBody.match(
  /<section[^>]*class="objection"[^>]*id="object"[^>]*>([\s\S]*?)<\/section>/i
);
check("S4a", "§3.1 block D · Art 21(4)",
  !!objSection,
  objSection ? "the objection right is its own <section>" : "no separate objection <section> found");

check("S4b", "§3.1 block D · Art 21(4)",
  objSection && /right to object/i.test(objSection[1]) &&
  /Article 21\(1\)/.test(objSection[1]) &&
  /To object, write to us/i.test(objSection[1]),
  "the block states the right, cites Article 21(1), and gives a route to exercise it");

const objRule = page.match(/\.objection\s*\{([^}]*)\}/);
check("S4c", "§3.1 block D · Art 21(4)",
  objRule && /border\s*:/.test(objRule[1]) && /margin\s*:/.test(objRule[1]),
  objRule ? "the stylesheet gives it its own border and margin — visually separate"
          : "no .objection style rule: the block is not visually distinguished");

/* The right to object must not be reduced to a bullet somewhere else and left at
   that; §3.1 block D and the s.164A pack §4.2 block 4 both say it stays separate. */
const outsideObjection = pageBody.replace(
  /<section[^>]*class="objection"[\s\S]*?<\/section>/i, ""
);
check("S4d", "§3.1 block D",
  !/You have the right to object to this processing/i.test(outsideObjection),
  "the operative objection wording appears once, and only inside its own block");

/* --- §9 tests 6 and 7 · cookies declined, JavaScript disabled ------------ */

/* The strongest available proxy for "readable with all non-essential cookies
   declined" is that the page needs nothing from anywhere else: no third-party
   script to gate it, no external stylesheet or font to fail closed, no tracked
   asset for a consent manager to block. */
/* A <link rel="canonical"> is a statement about identity, not a fetch — it loads
   nothing and a consent manager cannot withhold it.  Only the rel values that
   actually pull a resource count. */
const externalRefs = [
  ...pageBody.matchAll(/<link[^>]*rel="(?:stylesheet|preload|prefetch|icon|shortcut icon|apple-touch-icon|manifest)"[^>]*>/gi),
  ...pageBody.matchAll(/<(?:img|iframe|script|source|video|audio|embed|object)[^>]+(?:src|data)="[^"]+"/gi),
  ...pageBody.matchAll(/url\(\s*['"]?(?:https?:)?\/\//gi),
  ...pageBody.matchAll(/@import\b/gi),
];
check("S5", "§9.6 / §5.2.8",
  externalRefs.length === 0,
  externalRefs.length === 0
    ? "no external stylesheet, font, image, iframe or script — nothing a consent gate can withhold"
    : externalRefs.length + " external reference(s) the page depends on");

check("S6", "§9.7",
  !/<noscript[\s>]/i.test(pageBody) && !/<script[\s>]/i.test(pageBody),
  "no script and no <noscript> fallback needed — the page is the same with JavaScript off");

/* --- §3.3 · what must never be on this page ------------------------------ */

/* This has to test for MECHANISMS, not for words.  A first draft of this check
   tested for the string "sign up" and failed the page on the sentence "there is
   nothing to sign up to on it" — which is the page saying the very thing §3.3
   asks it to say.  A check that punishes a page for describing its own
   compliance would, run often enough, get the sentence deleted. */

/* Every form on the page, and every link and button, with its target. */
const forms = [...pageBody.matchAll(/<form[^>]*action="([^"]*)"[^>]*>/gi)].map(m => m[1]);
const hrefs = [...pageBody.matchAll(/href="([^"]*)"/gi)].map(m => m[1]);
const inputTypes = [...pageBody.matchAll(/<input[^>]*type="([^"]*)"/gi)].map(m => m[1].toLowerCase());
const interactiveText = [...pageBody.matchAll(/<(?:a|button)\b[^>]*>([\s\S]*?)<\/(?:a|button)>/gi)]
  .map(m => flat(m[1].replace(/<[^>]+>/g, " "))).join(" | ");

const FORBIDDEN = [
  ["a form that is not the complaint form",
    () => forms.filter(a => a !== "/notices/complaint").length > 0],
  ["a password field — this page must need no login",
    () => inputTypes.includes("password")],
  ["a link into the funnel, an account or a login",
    () => hrefs.some(h => /\/(assessment|start|calculator|quote|enquiry|login|sign-?in|register|account|portal)\b/i.test(h))],
  ["a marketing call to action on a link or button",
    () => /(get|claim) (a|your) (free|instant|no.obligation)|book a (call|demo)|start (your|the) (claim|assessment|check)|how much (could|can) you claim|subscribe|join our|sign up/i.test(interactiveText)],
  ["a newsletter or mailing-list offer",
    () => /subscribe to our|join our (mailing list|newsletter)|sign up (for|to) (our|the) (newsletter|updates)/i.test(pageFlat)],
  ["a cookie wall or consent gate over the content",
    () => /accept (all )?cookies|cookie (wall|banner|consent)|manage (your )?preferences/i.test(pageFlat)],
];
const found = FORBIDDEN.filter(([, fn]) => fn());
check("S7", "§3.3",
  found.length === 0,
  found.length ? "PRESENT and must not be: " + found.map(f => f[0]).join("; ")
               : "one form and it is the complaint form; no funnel or account link, "
                 + "no marketing call to action, no newsletter offer, no login, no cookie wall");

/* §3.3 also forbids naming an affected individual.  Nothing can prove a name is
   absent, but the one shape this page could acquire one in is a published breach
   notice, so check that the current-notices region is the empty-state it claims
   to be and carries no personal detail alongside it. */
const currentRegion = pageBody.match(/<section class="current"[\s\S]*?<\/section>/i);
check("S8", "§3.1 block I / §3.3",
  currentRegion &&
  /There are no current breach notices\./.test(currentRegion[0]) &&
  /Last confirmed/.test(currentRegion[0]),
  "the current-notices region states the empty state and carries a confirmation date");

/* --- §3.2 · the archive ------------------------------------------------- */

check("S9", "§3.2 withdrawal and archive",
  /<section[^>]*id="archive"/i.test(pageBody) &&
  /We do not delete them\./.test(pageBody),
  "a dated archive section exists and says withdrawn notices are kept, not deleted");

/* --- §9 test 10 · it has to work on paper -------------------------------- */

const printBlock = page.match(/@media print\s*\{([\s\S]*?)\n  \}/);
check("S10a", "§9.10",
  !!printBlock,
  printBlock ? "the page carries a print stylesheet" : "no @media print rules");

check("S10b", "§9.10",
  printBlock && /a\[href\^="http"\]::after/.test(printBlock[1]) &&
  /attr\(href\)/.test(printBlock[1]),
  "printed links expand to their full URL, so the addresses survive onto paper");

/* A print stylesheet that hides the contact routes is worse than none. */
check("S10c", "§9.10",
  printBlock &&
  !/#complain[^{]*\{[^}]*display\s*:\s*none/.test(printBlock[1]) &&
  !/#not-satisfied[^{]*\{[^}]*display\s*:\s*none/.test(printBlock[1]) &&
  !/#who-we-are[^{]*\{[^}]*display\s*:\s*none/.test(printBlock[1]),
  "nothing carrying a contact route, a complaint route or an address is hidden in print");

/* --- s.164A(2) · "and by other means" ------------------------------------ */

check("S11a", "§3.1 block E · s.164A(2)",
  fs.existsSync(FORM_FILE) && /class="sheet"/.test(formBody),
  "a printable, standalone copy of the complaint form exists as its own document");

check("S11b", "§3.1 block E · s.164A(2)",
  !/<input|<textarea|<select/i.test(formBody),
  "the printable copy is ruled lines, not form controls — it works on paper");

check("S11c", "§3.1 block E · s.164A(2)",
  /By post:/.test(formBody) && /By email:/.test(formBody) &&
  /You do not have to use this form at all\./.test(formBody),
  "the printable copy carries a postal route, an email route, and says the form is not required");

check("S11d", "§3.1 block E · s.164A pack §4.1",
  /Three ways to complain, and they are equal/.test(pageBody) &&
  /complaint-form\//.test(pageBody),
  "the page offers the three routes as equals and links the printable copy");

/* The s.164A pack §4.3 numbers eight fields and §4.4 calls field 7 the most
   important one on the form.  A later tidy-up that drops it would not look like
   a defect, so name them.  Date is not named: the web form records it rather
   than asking it.
   The on-behalf question was added 14 September 2026 (Phase 132) from the pack's
   §1.10 (line 254 of the export, ICO guidance read 13 September 2026).  It is
   question 3 on both copies; §4.3 has not yet been brought into line with it. */
const FORM_FIELDS = [
  "Your name",
  "How we should reply",
  "Are you complaining about your own personal data, or on behalf of someone else?",
  "Anything that helps us find you",
  "What is your complaint about?",
  "What happened, in your own words",
  "What would you like us to do?",
  "Are you also asking us to do something with your data now?",
];
const missingOnPage = FORM_FIELDS.filter(f => !pageBody.includes(f));
const missingOnSheet = FORM_FIELDS.filter(f => !formBody.includes(f));
check("S12", "§3.1 block E · s.164A pack §4.3",
  missingOnPage.length === 0 && missingOnSheet.length === 0,
  (missingOnPage.length || missingOnSheet.length)
    ? "missing fields — page: [" + missingOnPage.join(", ") + "] sheet: [" + missingOnSheet.join(", ") + "]"
    : "all " + FORM_FIELDS.length + " named questions present on both the web form and the printable sheet");

/* --- §2 · the URL, and the rules that keep it stable --------------------- */

check("S13", "§2 rule 1 / §9.1",
  pageBody.includes(CANON) && /rel="canonical"[^>]*href="https:\/\/caprebate\.co\.uk\/notices\/"/.test(page),
  "the canonical URL is declared and appears in body text a reader could copy off a printout");

/* --- §9 test 11 · the privacy notice carries the full URL as text -------- */

/* Read once here: S16 below reads the same document. */
const pn = fs.existsSync(PRIVACY_NOTICE) ? fs.readFileSync(PRIVACY_NOTICE, "utf8") : null;

if (pn !== null) {
  check("S14", "§9.11 / §5.3",
    pn.includes(CANON),
    pn.includes(CANON)
      ? "the privacy notice carries the full URL as text"
      : "THE PRIVACY NOTICE DOES NOT CARRY THE URL — §5.3 requires it, in its own named block, "
        + "written as a URL a reader could copy off a printout. Source document: "
        + path.basename(PRIVACY_NOTICE));
} else {
  check("S14", "§9.11", false, "privacy notice source not found at " + PRIVACY_NOTICE);
}

/* --- s.164A pack §1.10 · a complaint made for someone else --------------- */

/* Added 14 September 2026 (Phase 132).  The ICO's complaints guidance, read
   13 September 2026 and recorded at the s.164A pack §1.10 (line 254 of the
   export): check that the person is authorised to act, and do not investigate
   until the authority arrives.  So both copies of the form ask, both say what
   happens next, and the web form does not make the answer compulsory — a
   required field here would turn a question into the gate §4.1 forbids. */
const ON_BEHALF_Q = "Are you complaining about your own personal data, or on behalf of someone else?";
const ON_BEHALF_PROMISE = "authorised to act for them before we look into it";
const onBehalfMissing = [];
if (!pageFlat.includes(ON_BEHALF_Q)) onBehalfMissing.push("page: the question");
if (!pageFlat.includes(ON_BEHALF_PROMISE)) onBehalfMissing.push("page: the authority sentence");
if (!formFlat.includes(ON_BEHALF_Q)) onBehalfMissing.push("sheet: the question");
if (!formFlat.includes(ON_BEHALF_PROMISE)) onBehalfMissing.push("sheet: the authority sentence");
const onBehalfGated = [...pageBody.matchAll(/<input[^>]*name="(?:on_behalf|authority_detail)"[^>]*>/gi)]
  .some(m => /\brequired\b/i.test(m[0]));
check("S15", "s.164A pack §1.10",
  onBehalfMissing.length === 0 && !onBehalfGated,
  onBehalfMissing.length
    ? "MISSING — " + onBehalfMissing.join("; ")
      + (onBehalfGated ? "; and the on-behalf controls are marked required" : "")
    : onBehalfGated
      ? "the on-behalf question is marked required — it must not be a gate"
      : "both copies ask whether the complaint is made for someone else and say authority is "
        + "checked before we look into it; the answer is not required");

/* --- Block B · the recipients list, against the privacy notice ----------- */

/* Added 14 September 2026 (Phase 132).  Block B's "Who else sees it" printed the
   recipients list as NOT SET after the privacy notice had published it (v1.4,
   Section 6).  The notice governs, so the processors are read off the notice
   itself, not typed here: a processor added to the notice and not to the page
   turns this red.  Only processors the notice NAMES are required — a bullet
   describing a provider not yet chosen ("A storage provider ...", "The host of
   our website") names nobody.  The names are looked for inside the "Who else
   sees it" block, because Homedata and HMRC also appear elsewhere on the page
   and a whole-page search would pass on those. */
function namedProcessors(notice) {
  const sec = notice.match(/^# Section 6\b[\s\S]*?(?=^# Section |(?![\s\S]))/m);
  if (!sec) return [];
  const proc = sec[0].match(/^## Processors\b[\s\S]*?(?=^## |(?![\s\S]))/m);
  if (!proc) return [];
  return proc[0].split("\n")
    .filter(l => /^\s*-\s/.test(l))
    .map(l => (l.match(/\*\*(.+?)\*\*/) || [])[1])
    .filter(n => n && !/^(A|An|The)\s/.test(n));
}
const processors = pn !== null ? namedProcessors(pn) : [];
const recipBlock = pageBody.match(/<h3>Who else sees it<\/h3>([\s\S]*?)(?=<h3>|<\/section>)/);
const recipFlat = recipBlock ? flat(recipBlock[1]) : "";
const recipProblems = [];
if (!processors.length) recipProblems.push("no named processors could be read from Section 6 of the privacy notice");
if (/\[NOT SET — the recipients list/.test(pageFlat)) recipProblems.push("the page still prints the recipients list as NOT SET");
if (!recipBlock) recipProblems.push("no \"Who else sees it\" block found");
const recipMissing = processors.concat(["HM Revenue and Customs"]).filter(n => !recipFlat.includes(n));
if (recipBlock && recipMissing.length) recipProblems.push("missing from \"Who else sees it\": " + recipMissing.join(", "));
check("S16", "Privacy Notice v1.4 §6",
  recipProblems.length === 0,
  recipProblems.length
    ? recipProblems.join("; ")
    : "no recipients-list placeholder; \"Who else sees it\" names HM Revenue and Customs and all "
      + processors.length + " processors the notice names (" + processors.join(", ") + ")");

/* --- Phase 151 · the domain and the data protection address ------------- */

/* Added 24 September 2026 (Phase 151).  The business is on caprebate.co.uk and
   the data protection officer's mailbox, data.protection@caprebate.co.uk, exists
   on IONOS (Word answers 3, 13, 44, 186 and 211).  The page and the printable
   form must give a reader that address, as a link they can use, and neither they
   nor the privacy notice may carry the old domain anywhere a reader or a search
   engine could pick it up. */
const mailProblems = [];
for (const [name, body] of [["page", pageBody], ["form", formBody], ["privacy notice", pn || ""]]) {
  if (/caprebate\.com(?![a-z0-9])/i.test(body)) mailProblems.push("the " + name + " still carries caprebate.com");
}
for (const [name, body] of [["page", pageBody], ["form", formBody]]) {
  if (!body.includes('href="mailto:' + DP_MAIL + '"')) mailProblems.push("the " + name + " gives no mailto link to " + DP_MAIL);
  if (/\[NOT SET — dedicated data protection address\]/.test(body)) mailProblems.push("the " + name + " still prints the data protection address as NOT SET");
}
if (pn !== null && !pn.includes(DP_MAIL)) mailProblems.push("the privacy notice does not give " + DP_MAIL);
check("S17", "Phase 151 · Word answers 3, 13, 44, 186, 211",
  mailProblems.length === 0,
  mailProblems.length ? mailProblems.join("; ")
    : "no caprebate.com in the page, the form or the privacy notice; both give " + DP_MAIL + " as a mailto link, and the notice names it");

/* === THE FACTS NOBODY HAS SUPPLIED YET =================================== */

/* Harvest from the RENDERED source only.  The file header explains the
   placeholder convention using a literal "[NOT SET — ...]", and counting that
   would inflate the tally by one and print a blank line. */
const shorten = s => {
  const one = flat(s).trim();
  const stop = one.search(/\.\s/);
  const cut = stop > 20 ? one.slice(0, stop) : one;
  return cut.length > 96 ? cut.slice(0, 93) + "..." : cut;
};
const placeholders = [...pageBody.matchAll(/\[NOT SET — ([^\]]+)\]/g)].map(m => m[1])
  .concat([...formBody.matchAll(/\[NOT SET — ([^\]]+)\]/g)].map(m => m[1]))
  .map(shorten)
  .filter(s => s && s !== "...");
const unique = [...new Set(placeholders)];
/* PHASE 160f, 20 October 2026: A FACT WE HAVE PROPOSED is filled with our recommendation and marked
   <span class="proposed">Proposed, awaiting our data protection officer:</span>. It is not a confirmed fact: it is
   listed here, and --live still refuses the page until the data protection officer has confirmed each one and the
   mark is taken off. Each is named by the words that follow the mark. */
const proposed = [...pageBody.matchAll(/<span class="proposed">[^<]*<\/span>\s*([\s\S]{0,1500}?)(?:<\/p>|<\/li>|$)/g)]
  .map(m => shorten(m[1].replace(/<[^>]+>/g, "")));

/* === HOST-SIDE, NAMED AND NEVER ASSERTED ================================= */

const HOST_ONLY = [
  ["§9.1",  "caprebate.co.uk/notices/ returns 200, and caprebate.com/notices/ 301s to it"],
  ["§9.3",  "robots.txt does not disallow the path — check the DEPLOYED file, not the intended one"],
  ["§9.4",  "Settings → Reading → 'Discourage search engines from indexing this site' is UNTICKED"],
  ["§9.4",  "the page is excluded by name from any SEO or privacy plugin's legal-page noindex rule"],
  ["§9.5",  "the URL appears in sitemap.xml"],
  ["§9.6",  "with all non-essential cookies declined, the page reads and the form opens on the real host"],
  ["§9.8",  "the footer link 'Public notices' reaches this page in one click from five pages, including one mid-funnel screen and one inside the client portal"],
  ["§9.9",  "the page is findable by searching the registered company name, logged out, within 14 days of submission"],
  ["§9.12", "when a notice is live: the breach register's communicated_at holds the URL and the timestamp, and the archive entry appears when it comes down"],
];

/* === REPORT ============================================================== */

const pad = s => (s + "        ").slice(0, 8);
console.log("\nCaprebate — public notices page, acceptance checks");
console.log("Page: " + path.relative(ROOT, PAGE_FILE));
console.log("Form: " + path.relative(ROOT, FORM_FILE));
console.log("Specification: board item 12946752268 §9\n");

console.log("STRUCTURAL — checked here, against the source  (" + results.length + ")");
for (const r of results) {
  console.log("  " + (r.ok ? "PASS" : "FAIL") + "  " + pad(r.id) + pad(r.spec) + "  " + r.detail);
}
console.log("");

console.log("NEEDS THE HOST — named, not checked, and not passed  (" + HOST_ONLY.length + ")");
for (const [spec, what] of HOST_ONLY) console.log("  HOST  " + pad(spec) + "  " + what);
console.log("");

console.log("NOT SET — facts that must be filled before this page is published  (" + unique.length + ")");
if (!unique.length) console.log("  none");
for (const u of unique) console.log("  ....  " + u);
console.log("");

console.log("PROPOSED — filled with our recommendation, awaiting the data protection officer  (" + proposed.length + ")");
if (!proposed.length) console.log("  none");
for (const u of proposed) console.log("  ....  " + u);
console.log("");

const failed = results.filter(r => !r.ok);
if (failed.length) {
  console.log("FAIL: " + failed.length + " structural check(s) failed.");
  process.exit(1);
}
if (LIVE && unique.length) {
  console.log("FAIL (--live): " + unique.length + " fact(s) still unset. The page must not be published.");
  process.exit(1);
}
if (LIVE && proposed.length) {
  console.log("FAIL (--live): " + proposed.length + " fact(s) proposed and not yet confirmed by the data protection officer. The page must not be published as final.");
  process.exit(1);
}
console.log("OK: " + results.length + " structural checks pass. "
  + HOST_ONLY.length + " tests need the host and have NOT been checked. "
  + unique.length + " facts are unset. " + proposed.length + " are proposed, awaiting the data protection officer.");
