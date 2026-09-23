#!/usr/bin/env node
/* =============================================================================
   CAP REBATE — THE PLAIN WORDS CHECK                                 Phase 144
   22 September 2026

   WHAT IT CHECKS
     Lakhbir, 18 September 2026: "It needs to be readable at a 12-year-old level
     and to the point." This reads every screen file of the back office and the
     client portal (09-app/backend/src/web/*.ts) and pulls out the words a person
     reads there (and the demo data in src/seed.ts, which the test site shows)
     - the text between HTML tags, the title / placeholder /
     aria-label / alt of an element, and any string that reads as a sentence or a
     label. Comments, SQL, CSS, ids, audit event names and developer errors are
     not read: nobody sees them on a screen.

     BANNED   a word on the plain-words list (voice.ts, PLAIN_SWAPS) - "fired",
              "tier", "provenance", "derived", "gate", "receipt strip", "hash",
              "chain", "N4", "payload", "stub", "outbox", "deletion clock" and the
              rest. The list carries the plain word to use instead.
     GRADE    a sentence of eight words or more whose Flesch-Kincaid grade is
              above 9. A shorter string is a label or a button, where the grade
              formula means nothing, and the banned list is what guards it.
              Words every reader of these screens must know - "capital
              allowances", "surveyor", the company's own name - are counted at
              no more than two syllables (FAMILIAR, below), so the grade measures
              how the sentence is written, not which business it is about.

   EXEMPT, BY NAME - wording that must stay exact, and is not rewritten here:
     EXEMPT_FILES  below: the engagement letter, the privacy notice's text, the
                   pre-diligence ceiling caveat, the business flow's step names
                   (stages.ts, behind NAME_SWITCHES.portalSteps). The Help pages and
                   the assessment were exempt until Phase 144a.
     EXEMPT_TEXT   below: single sentences a professional signed or must sign.

   RUN
     node 03-app/caprebate-plain-words-check.cjs                exit 1 on any failure
     node 03-app/caprebate-plain-words-check.cjs --list         every string it reads, for rewriting
     node 03-app/caprebate-plain-words-check.cjs --self-test    planted faults; every one must be caught
     node 03-app/caprebate-plain-words-check.cjs --suffix .bak-phase144
         read each screen file's .bak-phase144 copy where there is one - the
         pre-change words - which MUST go red
     node 03-app/caprebate-plain-words-check.cjs --file <path>  read one file only (a .md file is read as the guide)
     node 03-app/caprebate-plain-words-check.cjs --guide        read only the admin and user guide

   PHASE 144a, 22 September 2026: the check also reads THE ADMIN AND USER GUIDE
   (09-app/CAPREBATE-ADMIN-AND-USER-GUIDE.md) and the Help pages built from it
   (help-content.ts, no longer exempt), both at GRADE 7, and the public
   assessment (assessment.ts, no longer exempt) at grade 9 like every screen.
   `--suffix .bak-phase144a` reads the guide's and Help's pre-change copies and
   MUST exit 1.
   ============================================================================= */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const WEB = path.join(ROOT, '09-app', 'backend', 'src', 'web');
const ts = require(path.join(ROOT, '09-app', 'backend', 'node_modules', 'typescript'));

/* ---------------------------------------------------------------- exemptions */
const EXEMPT_FILES = new Map([
  ['letter.ts', 'the engagement letter - its wording is the solicitor\'s, and must stay exact'],
  ['stages.ts', 'the business flow\'s step names, verbatim; the plain names wait behind NAME_SWITCHES.portalSteps'],
  ['assets.ts', 'styles and brand tokens - no words'],
  ['brand-logo.ts', 'the logo - no words'],
  ['html.ts', 'the escaping helpers - no words'],
  ['voice.ts', 'the word lists themselves'],
  ['receipt-recommendations.ts', 'the data protection officer\'s receipt recommendations: identical to migration 021\'s rows (test/phase129), shown on no screen, and awaiting the officer\'s sign-off'],
]);
/* Sentences a professional has signed or must sign. Matched on their opening words. */
const EXEMPT_TEXT = [
  /* the pre-diligence ceiling caveat (engine wording, signed off with the engine) */
  /^This is an upper limit before our checks/i,
  /pre-diligence ceiling/i,
  /* the privacy notice's own words, where a screen quotes them */
  /^We use your information because we have a legitimate interest/i,
  /* the three ways to complain, sent in rights letters word for word from the public notices page (the data
     protection officer's wording, ONWARD_ROUTE_TEXT in src/web/compliance-rights.ts; a test keeps the two identical) */
  /^1\. Complain to us\. You have a right to complain to us about how we have handled your personal data/,
  /^2\. Complain to the data protection regulator\. You have a right to complain to the Information Commissioner/,
  /^3\. Go to court\. You can also take your own case to court/,
  /* versioned consent wording (SHARE-PROGRESS-1, src/web/introducers.ts): each recorded answer points at these exact
     words, so plainer words are a new version, approved by the data protection officer */
  /^May we tell \u2063? ?how your claim is progressing\?|^May we tell \{firm\} how your claim is progressing\?/,
  /* a question's title in CAPREBATE QUESTIONS, quoted exactly so the two stay one question (src/web/postcode.ts) */
  /^Does the permission gate apply to a council-area lookup with no personal data in it\?$/,
  /* the assessment's first question (src/web/assessment.ts SCREENS.Q1, and the site's screenQ1, word for word). Its
     wording could change what a client answers, so a plainer version waits in FOR THE ACCOUNTANT for the tax
     adviser (Phase 144a): "Have you already claimed capital allowances on this building's fixtures, such as its
     wiring or heating?" */
  /^Have you already made a capital allowances claim on the fixtures in this building — the plant, wiring, heating and similar\?$/,
  /* Phase 146b: planResearch's reasons and the register STUB_NOTICE (src/connectors/registers.ts), moved there word for
     word from src/stubs/registers.ts. No screen shows them — the research panel's words are stateUnderGates's, in
     src/web/research.ts — and test/seed.test.ts reads them exactly, and must pass unchanged. */
  /^already fired$/,
  /^free sources are gated on a published privacy notice:\s*$/,
  /^paid sources are gated on a signed engagement, asserted server-side$/,
  /^NOT CALLED — register connectors are stubbed in this build\./,
];

/* ------------------------------------------------------- the plain-words list */
function loadSwaps(voiceFile) {
  const src = fs.readFileSync(voiceFile, 'utf8');
  const m = /export const PLAIN_SWAPS[^=]*=\s*Object\.freeze\(\[([\s\S]*?)\]\s*(?:as const)?\);/.exec(src);
  if (!m) throw new Error(`no PLAIN_SWAPS in ${voiceFile}`);
  const out = [];
  for (const row of m[1].matchAll(/\[\s*\/((?:\\\/|[^/\n])+)\/([a-z]*)\s*,\s*'((?:\\'|[^'])*)'\s*,\s*'((?:\\'|[^'])*)'\s*\]/g)) {
    out.push({ re: new RegExp(row[1], row[2].includes('g') ? row[2] : row[2] + 'g'), word: row[3].replace(/\\'/g, "'"), swap: row[4].replace(/\\'/g, "'") });
  }
  if (out.length < 10) throw new Error(`PLAIN_SWAPS in ${voiceFile} read as only ${out.length} rows`);
  return out;
}

/* ------------------------------------------------------------ reading a file */
const HOLE = '⁣'; // where a ${...} was: read as one short word
const ATTR_TEXT = /\b(?:title|placeholder|aria-label|alt|data-confirm)="([^"]*)"/g;

function literalText(node) {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
  if (ts.isTemplateExpression(node)) {
    let s = node.head.text;
    for (const span of node.templateSpans) s += HOLE + span.literal.text;
    return s;
  }
  return null;
}

/** Is this literal in a place a person could never read it? */
function codeOnly(node) {
  const p = node.parent;
  if (!p) return false;
  if (ts.isImportDeclaration(p) || ts.isExportDeclaration(p) || ts.isExternalModuleReference(p)) return true;
  if (ts.isLiteralTypeNode(p)) return true;
  if ((ts.isPropertyAssignment(p) || ts.isPropertyDeclaration(p) || ts.isMethodDeclaration(p)) && p.name === node) return true;
  if (ts.isElementAccessExpression(p) && p.argumentExpression === node) return true;
  if (ts.isCaseClause(p)) return true;
  if (ts.isBinaryExpression(p) && /^(===|!==|==|!=|in|instanceof)$/.test(ts.tokenToString(p.operatorToken.kind) || '')) return true;
  if (ts.isNewExpression(p) && /Error$/.test(p.expression.getText())) return true;
  if (ts.isCallExpression(p)) {
    const callee = p.expression.getText();
    if (/(^|\.)(run|all|get|exec|prepare|query|includes|startsWith|endsWith|split|join|replace|replaceAll|match|test|indexOf|getItem|setHeader|header|has|delete|set|addEventListener|querySelector|querySelectorAll|getElementById|require|resolve|join|audit|appendAudit|writeAudit|record|log|warn|error|assert|fail|ok|equal|match)$/.test(callee)) return true;
  }
  return false;
}

function looksLikeCode(s) {
  const t = s.trim();
  if (t === '') return true;
  if (/^(SELECT|INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|WITH|PRAGMA|BEGIN|COMMIT)\b/i.test(t) && /\b(FROM|INTO|SET|TABLE|WHERE|VALUES)\b/i.test(t)) return true;
  if (/[{};]/.test(t) && /:\s*[^ ]/.test(t) && /;/.test(t)) return true;     // CSS
  if (/^[\w$.\-/:#?=&%⁣]+$/.test(t)) return true;                          // one token: id, path, url, key
  if (/^[A-Z0-9_⁣ ,|-]+$/.test(t) && /_/.test(t)) return true;            // ENUM_NAMES
  if (/\b[a-z]+_[a-z_]+\b/.test(t) && /\b(WHERE|AND|OR|FROM|SELECT|JOIN|ORDER BY|GROUP BY|IS NULL|IS NOT NULL|LIMIT|VALUES|SET|AS|ON|IN)\b/.test(t)) return true; // SQL fragment
  if ((t.match(/\b[a-z]+_[a-z_]+\b/g) || []).length >= 2 && !/[.?!]$/.test(t)) return true;             // column lists
  if (/^(WHERE|AND|OR|FROM|ORDER BY|GROUP BY|LEFT JOIN|JOIN|\(SELECT|SELECT|LIMIT|ON CONFLICT|RETURNING)\b/.test(t)) return true;
  if (/=>|\bfunction\b|\bconst\b|\breturn\b|document\.|window\./.test(t)) return true;
  if (/^[\s⁣]*$/.test(t.replace(/[^\w⁣\s]/g, ''))) return true;
  return false;
}

function decode(s) {
  return s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&rsquo;|&lsquo;/g, "'")
    .replace(/&nbsp;|&#160;/g, ' ').replace(/&middot;/g, '·').replace(/&mdash;/g, '—').replace(/&ndash;/g, '–').replace(/&hellip;/g, '…')
    .replace(/&pound;/g, '£').replace(/&rarr;/g, '→').replace(/&[a-z]+;|&#\d+;/g, ' ');
}

/** The pieces of one literal a person reads. */
function readable(raw) {
  const out = [];
  if (/<\/?[a-z][\w-]*[\s>/]|^[^<]*>|<[^>]*$/i.test(raw)) {
    for (const m of raw.matchAll(ATTR_TEXT)) out.push(decode(m[1]));
    // text between tags; a fragment that starts inside a tag or ends inside one keeps only its text part
    const noScript = raw.replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, ' ');
    const stripped = noScript.replace(/^[^<>]*>/, (m) => (/[="]/.test(m) ? '' : m.slice(0, -1))).replace(/<[^>]*$/, '');
    for (const part of stripped.split(/<[^>]*>/)) out.push(decode(part));
  } else {
    out.push(decode(raw));
  }
  return out.map((s) => s.replace(/\s+/g, ' ').trim()).filter((s) => /[A-Za-z]{2,}/.test(s) && !looksLikeCode(s));
}

/** A string that is prose, not a key: two or more words with a lowercase word among them, or a capitalised label. */
function isProse(s) {
  const words = s.replace(new RegExp(HOLE, 'g'), ' X ').split(/\s+/).filter((w) => /[A-Za-z]/.test(w));
  if (words.length === 0) return false;
  if (words.length === 1) return /^[A-Z][a-z]{2,}[.?!:]?$/.test(words[0]) && !/[A-Z].*[A-Z]/.test(words[0].slice(1));
  return words.some((w) => /^[a-z]/.test(w)) || /^[A-Z][a-z]/.test(words[0]);
}

function readFile(file, label) {
  const src = fs.readFileSync(file, 'utf8');
  const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const out = [];
  /* 'one sentence ' + 'split over lines' is read as the one string it is */
  const joined = (node) => {
    if (ts.isParenthesizedExpression(node)) return joined(node.expression);
    if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken) {
      const l = joined(node.left); const r = joined(node.right);
      return l === null || r === null ? null : l + r;
    }
    return literalText(node);
  };
  const visit = (node) => {
    let text = literalText(node);
    if (text === null && ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken
      && !(ts.isBinaryExpression(node.parent) && node.parent.operatorToken.kind === ts.SyntaxKind.PlusToken)) {
      const j = joined(node);
      if (j !== null) {
        if (!codeOnly(node)) {
          const line = sf.getLineAndCharacterOfPosition(node.getStart()).line + 1;
          for (const piece of readable(j)) if (isProse(piece)) out.push({ file: label, line, text: piece });
        }
        return;
      }
    }
    if (text !== null) {
      if (!codeOnly(node)) {
        const line = sf.getLineAndCharacterOfPosition(node.getStart()).line + 1;
        for (const piece of readable(text)) if (isProse(piece)) out.push({ file: label, line, text: piece });
      }
      if (ts.isTemplateExpression(node)) node.templateSpans.forEach((sp) => visit(sp.expression));
      return;
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return out;
}

/* --------------------------------------------------------------- the grade */
/* Words the reader of these screens must know. Counted at no more than two syllables. */
const FAMILIAR = new Set(`capital allowance allowances surveyor surveyors accountant accountants accounting
  property properties company companies business businesses engagement estimate estimates evidence
  document documents portal information category categories invoice invoices valuation client clients
  referral referrals introducer introducers equipment electrical heating furniture building buildings
  practice medical dental veterinary pharmacy supported living dashboard password address telephone
  already anybody everybody everything anything another available calendar reference register
  director directors company's client's surveyor's accountant's liability limited contribution contributions
  identity activity certificate registered deductions approval approved expenditure previous
  organisation organisations information commissioner protection officer assessment assessments healthcare
  signature signatures electronic
  february january december november october september august`.split(/\s+/).filter(Boolean));

function syllables(word) {
  let w = word.toLowerCase().replace(/[^a-z]/g, '');
  if (w === '') return 0;
  if (w.length <= 3) return 1;
  w = w.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '').replace(/^y/, '');
  const m = w.match(/[aeiouy]{1,2}/g);
  return Math.max(1, m ? m.length : 1);
}

function sentences(text) {
  return text.replace(new RegExp(HOLE, 'g'), ' X ').replace(/\s+/g, ' ')
    .split(/(?<=[.?!])\s+(?=[A-Z0-9"'“‘(])|\s+[—–]\s+(?=[A-Z])|;\s+/).map((s) => s.trim()).filter(Boolean);
}

function grade(sentence) {
  const words = sentence.split(/\s+/).map((w) => w.replace(/^[^A-Za-z0-9£]+|[^A-Za-z0-9%]+$/g, '')).filter((w) => /[A-Za-z0-9]/.test(w));
  if (words.length === 0) return { words: 0, grade: 0 };
  let syl = 0;
  for (const w of words) {
    const lw = w.toLowerCase().replace(/’/g, "'");
    let n = /^[£\d]/.test(w) || w === 'X' || /[@/]|\.\w/.test(w) ? 1 : syllables(w); // a number, an email address or a web address reads as one word
    if (FAMILIAR.has(lw) || /^[A-Z][a-z]+$/.test(w) && words.indexOf(w) > 0 && n > 2 && !/^[A-Z][a-z]+(ing|tion|ment|ity|ance|ence)$/.test(w)) n = Math.min(n, 2);
    syl += n;
  }
  const g = 0.39 * words.length + 11.8 * (syl / words.length) - 15.59;
  return { words: words.length, grade: Math.round(g * 10) / 10 };
}

/* --------------------------------------------------------------- the check */
const MIN_WORDS = 8;
const MAX_GRADE = 9;

/* Values code compares or stores, which no screen shows. Exact strings only. */
const CODE_VALUES = new Set([
  'cash gate', // engaged.ts: the `origin` of a missing fact, a type-literal value compared in test/engaged.test.ts
]);

function exemptText(t) { return CODE_VALUES.has(t) || EXEMPT_TEXT.some((re) => re.test(t)); }

function checkStrings(strings, swaps) {
  const fails = [];
  for (const s of strings) {
    if (exemptText(s.text)) continue;
    for (const sw of s.quotesOldWords ? [] : swaps) {
      sw.re.lastIndex = 0;
      if (sw.re.test(s.text)) fails.push({ ...s, why: `banned word "${sw.word}" - say "${sw.swap}"` });
    }
    for (const sen of sentences(s.text)) {
      if (exemptText(sen)) continue;
      const g = grade(sen);
      const max = s.maxGrade ?? MAX_GRADE;
      if (g.words >= MIN_WORDS && g.grade > max) fails.push({ ...s, why: `grade ${g.grade} (${g.words} words, above ${max}): "${sen}"` });
    }
  }
  return fails;
}

/* ------------------------------------------------------- the guide (Phase 144a) */
/* The admin and user guide, and the Help pages built from its Part 3 (help-content.ts, generated by
   09-app/backend/tools/build-help.cjs), are read as markdown at grade 7 - two grades below the screens, because the
   guide is read by someone learning the job, not someone doing it. A code span (`B17`, a file name, a command) is a name
   typed exactly and reads as one short word. A fenced block is a command and is not read.
   Text between <!-- plain-words: quotes-old-words --> and <!-- /plain-words --> quotes the banned words ON PURPOSE (the
   table of old words and their swaps): the grade is still checked there; the banned list is not. */
const GUIDE = path.join(ROOT, '09-app', 'CAPREBATE-ADMIN-AND-USER-GUIDE.md');
const GUIDE_GRADE = 7;

function markdownPieces(md) {
  const out = [];
  const lines = md.replace(/\r\n/g, '\n').split('\n');
  let fence = false; let quoting = false; let para = null;
  const flush = () => { if (para && /[A-Za-z]{2,}/.test(para.text)) out.push(para); para = null; };
  const clean = (t) => decode(t)
    .replace(/`[^`]*`/g, HOLE)
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\*\*|__|(?<![\w*])\*(?!\s)|(?<!\s)\*(?![\w*])/g, '')
    .replace(/\s+/g, ' ').trim();
  lines.forEach((raw, i) => {
    const line = raw.trimEnd();
    if (/^\s*<!--\s*plain-words:\s*quotes-old-words\s*-->/.test(line)) { flush(); quoting = true; return; }
    if (/^\s*<!--\s*\/plain-words\s*-->/.test(line)) { flush(); quoting = false; return; }
    if (/^\s*(```|~~~)/.test(line)) { flush(); fence = !fence; return; }
    if (fence) return;
    if (/^\s*$/.test(line) || /^\s*(---+|\*\*\*+)\s*$/.test(line)) { flush(); return; }
    if (/^\s*\|/.test(line)) {
      flush();
      if (/^\s*\|[\s:|-]+\|\s*$/.test(line)) return;
      for (const cell of line.replace(/^\s*\||\|\s*$/g, '').split(/(?<!\\)\|/)) {
        const t = clean(cell);
        if (/[A-Za-z]{2,}/.test(t)) out.push({ line: i + 1, text: t, quotesOldWords: quoting });
      }
      return;
    }
    /* a line that is only a bold label ("**Who can open it**") is drawn on its own line: read it alone */
    if (/^\s*\*\*[^*]+\*\*[.:]?\s*$/.test(line)) { flush(); out.push({ line: i + 1, text: clean(line), quotesOldWords: quoting }); return; }
    const head = /^\s*(#{1,6}\s+|[-*+]\s+|\d+[.)]\s+|>\s*)/.exec(line);
    if (head) { flush(); para = { line: i + 1, text: clean(line.slice(head[0].length)), quotesOldWords: quoting }; return; }
    if (para) para.text = `${para.text} ${clean(line)}`.trim();
    else para = { line: i + 1, text: clean(line), quotesOldWords: quoting };
  });
  flush();
  return out;
}

function readGuide(file, label) {
  return markdownPieces(fs.readFileSync(file, 'utf8')).map((p) => ({ file: label, line: p.line, text: p.text, maxGrade: GUIDE_GRADE, quotesOldWords: p.quotesOldWords }));
}

/* help-content.ts: the guide's Part 3 as string constants. Each constant is read as the markdown it holds. */
function readHelpContent(file, label) {
  const src = fs.readFileSync(file, 'utf8');
  const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const out = [];
  const visit = (node) => {
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      if (!codeOnly(node) && /\s/.test(node.text)) {
        const line = sf.getLineAndCharacterOfPosition(node.getStart()).line + 1;
        for (const p of markdownPieces(node.text)) out.push({ file: label, line, text: p.text, maxGrade: GUIDE_GRADE, quotesOldWords: p.quotesOldWords });
      }
      return;
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return out;
}

/* The seed is demo data, but it is what a person reads on the test site, so it is read too. */
const EXTRA = [path.join(WEB, '..', 'seed.ts'),
  /* the email service's words, which the Settings and Email pages show; the other stubs' words reach no screen */
  path.join(WEB, '..', 'stubs', 'email.ts'), path.join(WEB, '..', 'stubs', 'email-provider.ts'), path.join(WEB, '..', 'stubs', 'email-inbound.ts'),
  /* Phase 146b: the connectors' words — why a lookup did not run or did not work — reach the research panel */
  path.join(WEB, '..', 'connectors', 'registers.ts'), path.join(WEB, '..', 'connectors', 'http.ts'), path.join(WEB, '..', 'secrets.ts'),
  /* Phase 146c: the free registers' connectors and the matcher — each lookup's result, in words, is what the research
     panel shows beside it */
  ...['free-registers.ts', 'matching.ts', 'companies-house.ts', 'cqc.ts', 'epc.ts', 'price-paid.ts', 'planning.ts', 'postcode.ts', 'nations.ts']
    .map((f) => path.join(WEB, '..', 'connectors', f))];

function screenFiles(suffix) {
  const all = fs.readdirSync(WEB).filter((f) => /\.ts$/.test(f) && !EXEMPT_FILES.has(f)).sort().map((f) => path.join(WEB, f)).concat(EXTRA);
  return all.map((f) => {
    const alt = suffix ? f + suffix : null;
    return { label: path.relative(path.join(WEB, '..', '..'), f), file: alt && fs.existsSync(alt) ? alt : f };
  }).concat(guideFiles(suffix));
}

function guideFiles(suffix) {
  const alt = suffix ? GUIDE + suffix : null;
  return [{ label: '09-app/CAPREBATE-ADMIN-AND-USER-GUIDE.md', file: alt && fs.existsSync(alt) ? alt : GUIDE }];
}

function readAny(f) {
  if (/\.md(\.bak-[\w-]+)?$/.test(f.file)) return readGuide(f.file, f.label);
  if (/help-content\.ts(\.bak-[\w-]+)?$/.test(f.file)) return readHelpContent(f.file, f.label);
  return readFile(f.file, f.label);
}

function run(files, voiceFile) {
  const swaps = loadSwaps(voiceFile);
  const strings = files.flatMap(readAny);
  return { strings, fails: checkStrings(strings, swaps) };
}

/* ----------------------------------------------------------- the self-test */
function selfTest() {
  const os = require('os');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cb-plain-'));
  const voice = path.join(WEB, 'voice.ts');
  const planted = [
    ['banned-fired', "export const a = `<p>Sources - what has fired and what has not.</p>`;"],
    ['banned-provenance', "export const b = '<td title=\"The provenance of this fact\">x</td>';"],
    ['banned-receipt-strip', "export const c = ['Received', 'A version has passed the receipt strip'];"],
    ['banned-N4', "export const d = `<p class=\"muted\">That is non-negotiable N4.</p>`;"],
    ['banned-stub', "export const e = { label: 'NOT SENT - outbound email is stubbed in this build' };"],
    ['banned-hash', "export const f = (n: number) => `<span>Chain intact - ${n} rows hashed</span>`;"],
    ['banned-deletion-clock', "export const g = '<h3>This version\\'s deletion clock</h3>';"],
    ['banned-derived', "export const h = `<p>This list is derived, not maintained.</p>`;"],
    ['banned-gate', "export const i = '<p>Two gates, and both are shut.</p>';"],
    ['banned-tier', "export const j = `<p>tier not settled - treated as paid</p>`;"],
    ['grade', "export const k = `<p>Notwithstanding the aforementioned considerations, the organisation's administrative infrastructure necessitates comprehensive documentation.</p>`;"],
    ['grade-in-label-array', "export const l = ['Status', 'Consequential reconciliation of contemporaneous documentation necessitates immediate prioritisation by administrators'];"],
  ];
  const clean = [
    ['comment', "// the provenance of a fired gate, derived from its hash chain\nexport const m = 1;"],
    ['sql', "export const n = 'SELECT hash, prev_hash FROM audit_log WHERE tier = ?';"],
    ['enum', "export const o = 'NOT_COVERED';"],
    ['plain', "export const p = `<p>We read 3 pages, then deleted the file.</p>`;"],
    ['compare', "export const q = (x: string) => x === 'provenance gate';"],
    ['error', "export const r = () => { throw new Error('payload hash chain broken at tier N4'); };"],
  ];
  let bad = 0;
  for (const [name, code] of planted) {
    const f = path.join(dir, `${name}.ts`); fs.writeFileSync(f, code);
    const { fails } = run([{ file: f, label: name }], voice);
    const ok = fails.length > 0;
    if (!ok) bad++;
    console.log(`${ok ? 'CAUGHT ' : 'MISSED '} planted ${name}${ok ? ` - ${fails[0].why}` : ''}`);
  }
  for (const [name, code] of clean) {
    const f = path.join(dir, `${name}.ts`); fs.writeFileSync(f, code);
    const { fails } = run([{ file: f, label: name }], voice);
    const ok = fails.length === 0;
    if (!ok) bad++;
    console.log(`${ok ? 'CLEAN  ' : 'FALSE  '} control ${name}${ok ? '' : ` - ${fails[0].why}`}`);
  }
  /* Phase 144a: the guide, read as markdown at grade 7, and the Help pages read the same way */
  const guidePlanted = [
    ['guide-banned', '# A\n\nThe outbox holds every email.\n'],
    ['guide-grade-8', '# A\n\nThe administrator subsequently reconfigures the organisation\'s notification preferences carefully.\n'],
    ['guide-grade-in-table', '| A | B |\n|---|---|\n| x | Consequential reconciliation of contemporaneous documentation necessitates immediate prioritisation |\n'],
    ['guide-grade-inside-old-words', '<!-- plain-words: quotes-old-words -->\n| Old | New |\n|---|---|\n| gate | Consequential reconciliation of contemporaneous documentation necessitates immediate prioritisation |\n<!-- /plain-words -->\n'],
    ['guide-banned-after-old-words', '<!-- plain-words: quotes-old-words -->\n| gate | check |\n<!-- /plain-words -->\n\nThe gate is shut.\n'],
  ];
  const guideClean = [
    ['guide-code-span', '# A\n\nRun `node tools/build-help.cjs --check` to see it.\n'],
    ['guide-fence', '# A\n\n```bash\nnode provenance-gate-hash-chain.cjs --derived\n```\n'],
    ['guide-old-words-table', '<!-- plain-words: quotes-old-words -->\n| The old word | Now |\n|---|---|\n| outbox | emails waiting to send |\n<!-- /plain-words -->\n'],
    ['guide-plain', '### Training — `B17` claims\n\n**What it is for**\nA claim is one piece of work. You open it from the company page.\n'],
    ['guide-bold-label-line', '**Who can open it**\nAdmin and Sales can open it, and nobody else can.\n'],
  ];
  for (const [name, md] of guidePlanted) {
    const f = path.join(dir, `${name}.md`); fs.writeFileSync(f, md);
    const { fails } = run([{ file: f, label: name }], voice);
    const ok = fails.length > 0; if (!ok) bad++;
    console.log(`${ok ? 'CAUGHT ' : 'MISSED '} planted ${name}${ok ? ` - ${fails[0].why}` : ''}`);
  }
  for (const [name, md] of guideClean) {
    const f = path.join(dir, `${name}.md`); fs.writeFileSync(f, md);
    const { fails } = run([{ file: f, label: name }], voice);
    const ok = fails.length === 0; if (!ok) bad++;
    console.log(`${ok ? 'CLEAN  ' : 'FALSE  '} control ${name}${ok ? '' : ` - ${fails[0].why}`}`);
  }
  {
    const f = path.join(dir, 'help-content.ts');
    fs.writeFileSync(f, `export const HELP_INTRO: string = ${JSON.stringify('The outbox holds every email.')};\n`);
    const { fails } = run([{ file: f, label: 'help-content.ts' }], voice);
    const ok = fails.length > 0; if (!ok) bad++;
    console.log(`${ok ? 'CAUGHT ' : 'MISSED '} planted help-content-banned${ok ? ` - ${fails[0].why}` : ''}`);
  }
  // the list itself must carry the words the brief names
  const words = loadSwaps(voice).map((s) => s.word);
  for (const w of ['fired', 'tier', 'provenance', 'derived', 'gate', 'receipt strip', 'hash', 'chain', 'N4', 'payload', 'stub', 'outbox', 'deletion clock']) {
    const ok = words.includes(w); if (!ok) bad++;
    console.log(`${ok ? 'LISTED ' : 'NOT ON '} ${w}`);
  }
  fs.rmSync(dir, { recursive: true, force: true });
  console.log(bad === 0 ? `\nself-test: every planted fault caught, every control clean` : `\nself-test: ${bad} case(s) wrong`);
  return bad === 0 ? 0 : 1;
}

/* -------------------------------------------------------------------- main */
function main(argv) {
  if (argv.includes('--self-test')) return selfTest();
  const at = (k) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : null; };
  const suffix = at('--suffix');
  const one = at('--file');
  const voice = path.join(WEB, 'voice.ts');
  const files = one ? [{ file: path.resolve(one), label: path.basename(one) }]
    : argv.includes('--guide') ? guideFiles(suffix) : screenFiles(suffix);
  const { strings, fails } = run(files, voice);
  if (argv.includes('--list')) {
    for (const s of strings) console.log(`${s.file}:${s.line}\t${s.text.replace(new RegExp(HOLE, 'g'), '{…}')}`);
    return 0;
  }
  const readFrom = suffix ? files.filter((f) => f.file.endsWith(suffix)).length : 0;
  console.log(`plain words check - ${files.length} ${argv.includes('--guide') ? 'guide' : 'screen and guide'} files${suffix ? ` (${readFrom} read from their ${suffix} copy)` : ''}, ${strings.length} strings a person reads`);
  console.log(`exempt by name: ${[...EXEMPT_FILES.keys()].join(', ')}; ${EXEMPT_TEXT.length} signed sentences`);
  for (const f of fails) console.log(`FAIL ${f.file}:${f.line}  ${f.why}\n       ${f.text.replace(new RegExp(HOLE, 'g'), '{…}').slice(0, 220)}`);
  console.log(fails.length === 0 ? `GREEN - no banned word, no sentence above grade ${MAX_GRADE} on a screen or above grade ${GUIDE_GRADE} in the guide` : `RED - ${fails.length} failure(s)`);
  return fails.length === 0 ? 0 : 1;
}

/* exitCode, not exit(): exit() can cut off a long report still being written to a pipe (Phase 144a) */
if (require.main === module) process.exitCode = main(process.argv.slice(2));
module.exports = { readable, isProse, grade, sentences, syllables, loadSwaps, readFile, checkStrings };
