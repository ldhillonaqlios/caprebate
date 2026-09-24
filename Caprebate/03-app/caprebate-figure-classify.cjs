#!/usr/bin/env node
/* ---------------------------------------------------------------------------
   caprebate-figure-classify.cjs — extracted by Phase 113g, 9 September 2026.

   WHY THIS FILE EXISTS, AND IT IS A MOVE RATHER THAN A NEW IDEA.

   Everything below was written inside `caprebate-figure-drift.cjs` and is
   MOVED here unchanged, comments and all, because a second check now needs the
   same judgement. `caprebate-signoff-register-check.cjs` reads the Monday
   documents — the action plan, the questions document, the phase history and
   the three sign-off registers — which the drift checker cannot reach at all,
   because it walks the disk and those documents are on neither disk.
   Phase 113e recorded that hole and could not close it from inside a disk
   walker.

   THE RULE THAT MADE THIS AN EXTRACTION AND NOT A COPY. The instruction that
   asked for the second check said the classification must be "imported rather
   than reimplemented", and it is right: two copies of a tense heuristic drift
   apart, and the one that stops matching is the one nobody notices. So there
   is exactly one definition of PASS_RE, PRESENT_MARKER, COMMAND_ON_LINE, the
   phase-close caption exemption and the retired-figure test, and both checks
   require it from here.

   WHAT DID *NOT* MOVE. Running the suites, walking the corpus, choosing which
   directories to skip, and deciding what exits 1 all stay with the caller.
   Those are policy; this file is only the reading of a line.

   The drift checker's own account of WHY each rule is shaped the way it is —
   including the three defects that widened it, on 6 September, 8 September and
   9 September 2026 — is preserved verbatim below. Do not summarise it away:
   every paragraph of it records a way this check was found blind.
   --------------------------------------------------------------------------- */

/* CLASSIFYING A FIGURE. The first version of this file classified per LINE and
   was worthless: a negative control that pretended the true figure was 999 still
   reported zero problems. The reason is worth recording, because it is the
   variant-(vi) trap in miniature. Correcting a stale line means annotating it
   ("...503 pass (re-derived 4 Sep; it was 500)"), and that annotation made the
   line look historical — so every line anyone had ever corrected became
   permanently invisible to the check. The lines most likely to drift were
   exactly the ones it stopped watching.

   So markers now bind to a FIGURE, not to a line, and there are three buckets:

     FAIL      a figure carrying a present-tense marker ("expect", "reports",
               "is green at") that disagrees with the live total. Exits 1.
     REVIEW    a disagreeing figure with no marker either way. Printed for a
               human; does not fail, because it is usually a phase's own record.
     HISTORY   a figure explicitly bound to an old-value marker — "was 500",
               "392 → 437", "Baseline 377 →". Counted and not printed.

   A figure only counts if it is not glued to a longer number: "...item
   12946752268 pass..." is a board id followed by a word, not a pass count. */
/* THREE SHAPES, NOT ONE. The first version matched only "N pass" and
   "N / 0 fail", and the Phase 95 sweep found BOTH developer-facing baselines
   sitting outside it: the Build Order asserted "500 / 0 / 4" as Block A's
   acceptance criterion (the truth was 563, and the same file said 563 at its
   own line 339), and the Developer Brief totalled "862 passing assertions" in
   the line it calls "the totals a quote should carry" (the truth was 1,063).
   Neither string contains the bare word "pass" or "/ 0 fail", so this checker
   read both files and reported nothing. A control with a blind spot the exact
   size of the two most-quoted numbers in the project is worse than no control,
   because it is trusted. Added: the participle forms, and the bare harness
   triple "N / 0 / N". (6 September 2026, Phase 95.) */
/* A FOURTH SHAPE, AND THE THIRD TIME THIS MATCHER HAS BEEN FOUND BLIND IN THE
   SAME WAY. (Phase 113g, 9 September 2026.) The three shapes above cannot see a
   figure written with a thousands separator, because the lookbehind rejects a
   digit preceded by a comma - and the project total is ALWAYS written that way:
   "1,806 passing assertions". So the single most-quoted number in the corpus,
   the one a developer is handed, was outside this check entirely while it
   reported green. It was found in `09-app/CAPREBATE-DEVELOPER-SPEC.md`, asserting
   1,763 with the site at 676, twelve lines under a fenced block that had 719
   correct - the same file the COMMAND_ON_LINE rule was added to protect. Added:
   an optional comma-grouped form, with the commas stripped before the compare. */
/* A FIFTH SHAPE, AND THE FIFTH TIME THIS FILE HAS BEEN FOUND BLIND. (Phase 114
   sweep, 10 September 2026.) Every shape above puts the pass word, or the
   "/ 0" triple, straight after the number. The action plan's own evidence table
   - section 2, "What is actually done - with the evidence, not the claim" -
   does not. It says "N assertions pass, 0 fail, 4 deliberate expected
   failures" with the command beside it, and "N tests, 0 failures across ten
   suites", and the stack paragraph says "all N assertions already are
   TypeScript". A noun sits between the figure and the verb, or there is no
   verb at all. So the register check read that document on 10 September and
   reported "live claims wrong: 0" while its evidence table carried the site,
   phase3 and phase9 figures of 6 September - three days and fourteen phases
   stale - in the one section whose title promises evidence.
   Added: "N assertions|tests pass/passing/passed", "N assertions|tests, 0
   fail/failures", and the bare "N assertions". MEASURED BEFORE IT WENT IN, over
   the whole disk tree: it adds no failure anywhere outside the archive and
   eight REVIEW lines, every one of them a phase's own dated record. Bare
   "N tests" was deliberately NOT added - "the 12 tests" and "385 tests across
   ten files" are everywhere and mostly per-file counts, and the noise would
   bury the REVIEW list a human is asked to read. That is the remaining blind
   spot, and it is written down here rather than discovered later. */
/* A SIXTH SHAPE, AND THE SIXTH TIME THIS FILE HAS BEEN FOUND BLIND - the near
   neighbour of the fifth. (Phase 148, 24 September 2026, found by PROBING the
   matcher rather than by reading this comment.) The fifth shape let
   "assertions|tests" sit between the figure and "pass", and nothing let a word
   sit before THEM. So "N assertions pass" was seen and "N engine assertions
   pass", "N site-harness assertions pass", "N back end tests pass" and "N phase9
   assertions pass" were INVISIBLE - not reviewed, invisible - and the last is
   the natural way this corpus writes a suite's figure. Nothing was escaping
   through it on 24 Sep 2026: a grep of the live documents for that shape found
   only Phase 148's own prompt quoting it. It was a hole in the guard, not a
   stale figure loose in the corpus.
   Added: ONE TO THREE words between the figure and "assertions|tests" when a
   pass verb (or ", 0 fail") follows - a word is letters, digits, "-" or "_",
   so "phase9" and "site-harness" count, and "of N" counts as a word, so "N of M
   assertions pass" reads both figures. It is a LOOKAHEAD, so it consumes
   nothing after the figure and a second figure inside the gap ("N of M") is
   still matched on its own. The prompt said "N of N assertions pass" was
   invisible too; it was not - the SECOND figure was already seen, so the case
   only hid a first figure that differed from the second. Both are now seen.
   Bare "N engine assertions" with no verb is NOT added - see the list below. */
const PASS_RE = /(?<![\d.,])(\d{1,3}(?:,\d{3})+|\d{2,5})\s*(?:pass(?:ing|es|ed)?\b|\/\s*0\s*fail\b|\/\s*0\s*\/\s*\d+\b|(?:assertions?|tests?)\s+pass(?:ing|es|ed)?\b|(?:assertions?|tests?)\s*,\s*0\s+fail(?:s|ures?)?\b|assertions\b|(?=(?:(?:of\s+\d[\d,]*|[A-Za-z][\w-]*)\s+){1,3}(?:assertions?|tests?)(?:\s+pass(?:ing|es|ed)?\b|\s*,\s*0\s+fail(?:s|ures?)?\b)))/g;

/* THE BLIND SPOTS THIS MATCHER STILL HAS, written down so the next sweep reads
   them here instead of finding them. (Listed by Phase 148, 24 September 2026.
   The sweep is told to read this comment; keep it true.)
     1. A bare "N tests" with no verb - "385 tests across ten files". Left out on
        purpose by the fifth shape: mostly per-file counts, and the noise would
        bury the REVIEW list.
     2. A bare "N <word> assertions" with no verb - "all 1,132 engine assertions
        already are TypeScript". The fifth shape sees bare "N assertions"; the
        sixth needs a verb, so a word before a verbless noun is still unseen.
     3. More than three words between the figure and its noun - "N of the site
        harness's assertions pass".
     4. The figure AFTER its noun or verb - "assertions passing: N", "passes: N",
        "the site harness: N". Every shape reads left to right from the figure.
     5. A figure written in words - "twelve hundred assertions pass".
     6. A present-tense marker hard-wrapped away from its figure INSIDE a fence
        (see the unit rules below): fenced lines are read one at a time.
     7. Anything under minFigure (50 by default) - per-file counts by design.
     8. A figure in a table cell whose noun is only in the column header
        ("| Site harness | 1252 |").
   AND THE BETTER FIX IS NOT HERE: a table of evidence should carry the COMMAND,
   not the number, so there is no figure to go stale (COORDINATES says so). */

/* AND A SUM ON THE LINE IS A PRESENT-TENSE MARKER, for the same reason a runnable
   command is. A line saying "it was 1,806 passing assertions - 719 + 385 + 324 +
   378" makes no claim in words and is nevertheless asserting the composition of
   the total: it says ADD THESE UP AND YOU GET THIS. (The "it was" there is not
   decoration - strip it and this comment would fail the very check it describes,
   exactly as the COMMAND_ON_LINE comment above says of its own example. Phase
   113h had to add it when the site harness went to 726 and the illustration
   became a wrong claim about today.) The stale line that prompted this rule
   carried no marker word and no command, so it fell into REVIEW, which never
   fails. */
const SUM_ON_LINE = /\d{2,4}\s*\+\s*\d{2,4}\s*\+\s*\d{2,4}/;

/* Present tense: the figure is being asserted as what you will see if you run it. */
const PRESENT_MARKER = /\b(expect(?:ed)?|reports?|is green at|currently|now at|baseline is)\b/i;

/* A RUNNABLE COMMAND ON THE LINE IS ITSELF A PRESENT-TENSE MARKER, AND IT IS A
   STRONGER ONE THAN ANY OF THE SIX WORDS ABOVE. (Phase 113e, 9 September 2026 —
   the third instance of the defect the two accounts above describe.) The six
   words are a guess at how somebody phrases a claim. A line like

       cd 04-phase-work/phase9 && node --test    was 245 pass / 0 fail

   — where the word "was" is not decoration: strip it and this comment would
   fail the very check it is describing, which is the annotation convention
   below working exactly as designed. Such a line
   makes no claim in words at all and is nevertheless the strongest claim in the
   document: it says RUN THIS AND YOU WILL SEE THIS. It carried none of the six
   markers, so it fell into REVIEW, which never fails, and sat wrong in
   CAPREBATE-DEVELOPER-SPEC.md — the first document a developer reads — until a
   person re-ran it by hand. The same block had the back end 17 out of date.

   DECIDED: THE LINE DOES NOT HAVE TO BE INSIDE A FENCED BLOCK, and the cost of
   that is real and is worth stating. Requiring a fence means tracking ``` state
   while scanning, which is meaningless in the .html, .cjs and .ts files this
   walker also reads, and unreliable in the .md ones — nested fences, indented
   fences, HTML <pre>. Worse, it would put a hole back exactly where this one
   was: the corpus states "run this, see this" in markdown TABLES and in bare
   indented lines at least as often as in fences. So any line carrying a command
   qualifies, fence or not.

   WHAT THAT COSTS: a sentence of genuine narrative that happens to name a
   command and an old figure — "in July we ran node --test and got 245" — now
   fails where before it was merely reviewed. That is the intended trade, and
   the remedy is the annotation convention this file already documents: bind the
   figure to an old-value marker ("was 245", "245 →") and it drops to HISTORY.
   Which is also why the retired-figure test BELOW RUNS FIRST and must keep
   running first. That ordering is the whole of the variant-(vi) defence: a
   command line someone has corrected and annotated "(was 245)" stays out of the
   failures, so correcting a line never makes this check stop watching it.

   The command may sit either side of the figure — "it was 245 pass, from node
   --test" asserts precisely what the fenced form asserts — so the whole line is
   tested, unlike PRESENT_MARKER which only looks to the left. (And again the
   "was" is load-bearing, for the same reason as above.) */
const COMMAND_ON_LINE = new RegExp([
  "\\bnode\\s+--test\\b",                              /* node --test ...        */
  "\\bnode\\s+[\"']?[-\\w@.]*[/\\\\][-\\w@./\\\\]*",    /* node <path/to/thing>, quoted or not */
  "\\bnode\\s+[\"']?[-\\w@.]+\\.(?:c?js|mjs|ts)\\b",     /* node thing.cjs         */
  "\\bnpm\\s+run\\s+[\\w:.-]+",                         /* npm run check          */
  "\\bcd\\s+\\S+.*&&"                                   /* cd somewhere && ...    */
].join("|"), "i");

/* Old value: the marker sits immediately against the figure it retires. */
function isRetiredFigure(line, idx, len) {
  const left = line.slice(Math.max(0, idx - 16), idx);
  const right = line.slice(idx + len, idx + len + 10);
  if (/\b(was|before|from|said|were)\s*$/i.test(left)) return true;   /* "was 500"   */
  if (/(→|->)\s*$/.test(left)) return false;      /* right of an arrow = the NEW one */
  if (/^\s*(→|->)/.test(right)) return true;      /* left of an arrow  = the OLD one */
  return false;
}

/* THE COUNTER-RULE, AND IT IS WHAT KEPT THE COMMAND RULE HONEST. Widening the
   matcher above immediately failed twenty-five lines in README-file-index.md,
   and every one of them was RIGHT to be there when it was written. That file is
   an append-only chronicle: each phase adds a fenced block captioned "Suites,
   all re-run 8 September 2026 at the close of Phase 104, every figure derived by
   running it". Correcting those figures would falsify the record, which is the
   same argument this file already makes for skipping 08-monday-doc-exports. So
   the matcher was too wide for that class and the fix belongs here, not in the
   documents.

   WHAT DOES *NOT* WORK AS THE DISCRIMINATOR, AND IT IS WORTH RECORDING BECAUSE
   IT WAS THE FIRST ANSWER: a date in the caption. This project date-stamps
   everything. The live baseline in 09-app/CAPREBATE-DEVELOPER-SPEC.md — the one
   document this whole job exists to protect — is captioned "the figures, every
   one re-derived on 9 September 2026 by running it". A date rule would have
   exempted precisely the block it was built to watch.

   WHAT DOES WORK IS THE BINDING TO A PHASE'S CLOSE. A chronicle entry says
   which phase's run it records: "at the close of Phase 104", "at the close",
   "Phase 113c". A live baseline says what is true, and names no phase. So a
   fenced block whose CAPTION — the nearest non-empty line above its opening
   fence — binds it to a phase close is a dated record, and a command on a line
   inside it is no longer evidence of a present-tense claim.

   THE SCOPE IS DELIBERATELY NARROW IN THREE WAYS.
     - It exempts only the COMMAND inference. An explicit PRESENT_MARKER word
       still fails inside such a block: a word is the author's own claim, the
       command is our inference, and a caption is fair counter-evidence to an
       inference but not to a statement.
     - It downgrades to REVIEW, not to HISTORY. Those lines stay printed, under
       the heading that already reads "usually a phase's own record".
     - It needs a real fence. Outside one, a command line is on its own.

   WHAT IT COSTS: anyone can neutralise a live baseline by captioning it "at the
   close of Phase N". That is a false sentence in a document rather than an
   accident of phrasing, which is the trade this file keeps making — and four
   captions in README-file-index.md had to be corrected to say which phase they
   record before this ran green, which is the same convention working. */
const PHASE_CLOSE_CAPTION = /\bat the close\b|\bPhase\s+\d{1,3}[a-z]?\b/i;

function datedRecordLines(lines) {
  const flag = new Array(lines.length).fill(false);
  let openAt = -1;
  for (let i = 0; i < lines.length; i++) {
    if (!/^\s*```/.test(lines[i])) continue;
    if (openAt < 0) { openAt = i; continue; }
    let caption = "";
    for (let k = openAt - 1; k >= 0 && k >= openAt - 4; k--) {
      if (lines[k].trim()) { caption = lines[k]; break; }
    }
    if (PHASE_CLOSE_CAPTION.test(caption)) {
      for (let k = openAt + 1; k < i; k++) flag[k] = true;
      /* AND THE CAPTION'S SCOPE REACHES THE PARAGRAPH THAT SUMS THE BLOCK UP.
         (Phase 113g, 9 September 2026, when the comma-grouped shape was added
         above.) Every chronicle entry in README-file-index.md has the same
         structure: a caption binding it to a phase's close, a fenced block of
         per-suite figures, then one paragraph reading "Total 1,436 passing
         assertions (634 + 379 + 245 + 178)". The fence is exempt and the
         sentence that adds it up sat one line outside the exemption, so four
         correct historical records turned red the moment the matcher could see
         a comma. The sentence belongs to the block; so does the caption.
         WHAT IT COSTS: a live baseline written in the paragraph immediately
         under a phase-close-captioned block is no longer watched. That is the
         same trade this file makes with the caption rule itself, and the remedy
         is the same - do not caption a live baseline with a phase's close. */
      let k = i + 1;
      while (k < lines.length && !lines[k].trim()) k++;          /* skip blanks  */
      while (k < lines.length && lines[k].trim()) { flag[k] = true; k++; }
    }
    openAt = -1;
  }
  return flag;
}


/* A HARD-WRAPPED PARAGRAPH IS READ AS ONE UNIT. (Phase 113j, 10 September 2026,
   board item 13014647418.) THE FOURTH TIME THIS FILE HAS BEEN FOUND BLIND, AND
   THE FIRST TIME THE BLINDNESS WAS A LINE BREAK RATHER THAN A SHAPE.

   README-file-index.md is hard-wrapped. Its headline ended one line with the
   marker "is green at" and began the next with the site harness figure. The
   reading below used to take one line at a time, so it saw that figure with no
   marker to its left, filed it under REVIEW - which never fails - and printed
   OK while the headline was a phase out of date. Nothing caught it until Phase
   113i grepped for the old number by hand. The stale text is preserved as
   README-file-index.md.bak-phase113i, and its shape is the first case in
   --self-test below.

   WHAT A UNIT IS. Consecutive non-blank lines. A blank line, or a bare ">" in a
   blockquote, ends one. A heading, a table row, the first line of a list item
   and a fence line each start a new one, and EVERY LINE INSIDE A FENCE IS A UNIT
   OF ITS OWN. Continuation lines lose their blockquote marks and comment gutter
   before they are joined, so the join reads as the sentence the author wrote.

   WHAT READS ACROSS THE BREAK, AND WHAT DOES NOT.
     - The figure itself: the pass-count shape is matched on the joined text, so
       a figure wrapped away from its own "pass" is seen too.
     - The retired-figure test, so an old-value marker that ends one line binds
       the figure that starts the next, exactly as it would on one line.
     - The present-tense MARKER - but only within the figure's own SENTENCE,
       cut at a full stop, question mark or exclamation mark followed by a
       space. Without that scope one "reports" at the top of a long paragraph
       would make every figure beneath it a live claim, and that is precisely
       how history would turn into failures.
     - NOT the runnable-command, sum-on-the-line or "Expected"-table tests. A
       command on the line above is a different claim, not the same one wrapped,
       so those stay bound to the figure's own line.
   The line's own reading is kept alongside: anything present tense on its own
   line is still present tense. So this adds failures and never hides one, with
   the single exception of a figure an old-value marker binds across the break -
   which is the annotation convention working, not a hole.

   WHY FENCES ARE NOT JOINED, AND WHAT THAT COSTS. The corpus uses fences mostly
   for the "command, then figure" tables every phase record carries, where each
   line is its own claim and a marker on one ("--expect ...") must not bleed into
   the next. The cost is named rather than hidden: a marker hard-wrapped away from
   its figure INSIDE a fence is still read one line at a time. The fenced,
   hard-wrapped phase prompts in the action plan, which quote old figures on
   purpose, are exactly the text that choice keeps from turning into noise. */
const FENCE_LINE = /^\s*```/;
const UNIT_BREAK = /^\s*(?:>\s*)*$/;
const TABLE_ROW = /^\s*(?:>\s*)*\|/;
const UNIT_START = /^\s*(?:>\s*)*(?:#{1,6}\s|[-*+]\s|\d{1,3}[.)]\s)/;
const GUTTER = /^\s*(?:>\s*)*(?:\/\/+\s?|\*(?!\*)\s?)?\s*/;

function paragraphUnits(lines) {
  const units = [];
  let cur = null, inFence = false;
  const close = () => { if (cur) units.push(cur); cur = null; };
  const alone = i => { close(); units.push({ idx: [i] }); };
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (FENCE_LINE.test(l)) { inFence = !inFence; alone(i); continue; }
    if (inFence) { alone(i); continue; }
    if (UNIT_BREAK.test(l)) { close(); continue; }
    if (TABLE_ROW.test(l)) { alone(i); continue; }
    if (!cur || UNIT_START.test(l)) { close(); cur = { idx: [i] }; continue; }
    cur.idx.push(i);
  }
  close();
  for (const u of units) {
    u.starts = []; u.text = "";
    u.idx.forEach((i, k) => {
      if (k > 0) u.text += " ";
      u.starts.push(u.text.length);
      u.text += k === 0 ? lines[i] : lines[i].replace(GUTTER, "");
    });
  }
  return units;
}

/* the part of the figure's own sentence that sits before it. A sentence may end
   INSIDE emphasis, a quote or a bracket - "...gains a test.** It was" - so the
   terminator is allowed to be followed by closing marks before the space. The
   first draft of this rule did not allow it, and on its first run over the live
   tree it turned a correct record in 09-app/engine/EXTRACTION.md into a failure:
   the sentence ran back past "a test.**" to a "report" two sentences earlier.
   That case is in --self-test below. */
function sentenceBefore(text, idx) {
  const before = text.slice(0, idx);
  const re = /[.!?]["'”’)\]*_`]*(?=\s)/g;
  let cut = 0, m;
  while ((m = re.exec(before))) cut = m.index + 1;
  return before.slice(cut);
}

/* THE READING ITSELF, lifted out of the drift checker's own scanning loop so
   that both callers make the same decision about the same text. The caller
   supplies the live figures and gets back three buckets; what it does with
   them is its own business. Records are still reported against the line the
   figure sits on, so nothing downstream had to change.

   `live` is a Set of numbers that are currently true. `minFigure` exists
   because the drift checker ignores anything under 50 as a per-file count
   rather than a suite total, and a caller checking something else may want a
   different floor. */
function classifyText(text, live, opts) {
  const o = opts || {};
  const minFigure = o.minFigure === undefined ? 50 : o.minFigure;
  const out = { failures: [], review: [], retired: 0 };
  /* the early exit must admit every shape PASS_RE can match, or a document whose
     only stale figure is written "N assertions" is skipped before it is read.
     (Phase 114 sweep: widening PASS_RE alone left this line blind.) */
  if (!/pass\b|assertions\b|tests?\s*,\s*0\s+fail/.test(text)) return out;
  const lines = text.split(/\r?\n/);
  const inDatedRecord = datedRecordLines(lines);
  const perLine = new Map();
  const re = new RegExp(PASS_RE.source, "g");
  for (const u of paragraphUnits(lines)) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(u.text))) {
      const n = parseInt(String(m[1]).replace(/,/g, ""), 10);
      if (n < minFigure) continue;       /* per-file counts, not suite totals */
      if (live.has(n)) continue;
      if (isRetiredFigure(u.text, m.index, m[1].length)) { out.retired++; continue; }
      let k = 0;
      while (k + 1 < u.starts.length && u.starts[k + 1] <= m.index) k++;
      const i = u.idx[k], line = lines[i];
      /* Is this figure being asserted in the present tense? A marker word
         appears before it on its own line, OR earlier in its own sentence (see
         the unit rules above); OR its line carries a runnable command anywhere
         on it (see COMMAND_ON_LINE above); OR a table header within six lines
         above says "Expected". Note the ORDER: the retired-figure test ran
         first, so an annotated old value is already gone. */
      const beforeOnLine = u.text.slice(u.starts[k], m.index);
      let presentTense = PRESENT_MARKER.test(beforeOnLine)
        || PRESENT_MARKER.test(sentenceBefore(u.text, m.index))
        || ((COMMAND_ON_LINE.test(line) || SUM_ON_LINE.test(line)) && !inDatedRecord[i]);
      if (!presentTense) {
        for (let j = Math.max(0, i - 6); j < i; j++) {
          if (/^\s*\|/.test(lines[j]) && /\bExpected\b/.test(lines[j])) { presentTense = true; break; }
        }
      }
      if (!perLine.has(i)) perLine.set(i, { fail: [], review: [] });
      (presentTense ? perLine.get(i).fail : perLine.get(i).review).push(n);
    }
  }
  [...perLine.keys()].sort((a, b) => a - b).forEach(i => {
    const bad = perLine.get(i);
    const rec = t => ({ line: i + 1, figures: [...new Set(t)], text: lines[i].trim().slice(0, 190) });
    if (bad.fail.length) out.failures.push(rec(bad.fail));
    if (bad.review.length) out.review.push(rec(bad.review));
  });
  return out;
}

/* --self-test — PHASE 113j. Each case is a piece of text and the bucket its
   figure must land in (nine at Phase 113j; count them, do not read a number here). THE FIGURES ARE BUILT AT RUN TIME, NEVER WRITTEN AS
   LITERALS: the drift checker walks this very file, and a stale figure typed
   beside a marker here would fail the check this test exists to protect.

   IT HAS BEEN SEEN TO FAIL, and it can be made to again: `--against <file>`
   runs the same cases against another copy of the classifier. Run against the
   line-at-a-time copy kept as caprebate-figure-classify.cjs.bak-phase113j, the
   headline case and the other cross-break cases fail and it exits 1. */
function selfTest(C) {
  const mod = C || module.exports;
  const TRUE_SITE = 700 + 37, STALE = 700 + 26, OLDER = 700 + 19, OLDEST = 600 + 76;
  const LIVE = new Set([TRUE_SITE, 385, 324, 378, 1824]);
  const P = n => n + " pass / 0 fail / 4 xfail";
  const HEADLINE = (n, tail) => [
    "> `caprebate-regression.cjs` resolves the app at `../../Caprebate site.html` and is green at",
    "> **" + P(n) + "** (re-derived 9 Sep 2026 by Phase 113h, which added suite V" + (tail || "") + ")."
  ].join("\n");
  const where = (r, n) => r.failures.some(x => x.figures.includes(n)) ? "fail"
    : r.review.some(x => x.figures.includes(n)) ? "review" : "neither";
  const cases = [
    ["the Phase 113i headline: the marker ends one line, the stale figure starts the next - it must FAIL",
      HEADLINE(STALE), r => where(r, STALE) === "fail"],
    ["the same headline carrying its own history - the stale figure fails, the two old values stay history",
      HEADLINE(STALE, "; it was " + P(OLDER) + " after Phase 113f added suite U, and was " + P(OLDEST) + " after Phase 113d"),
      r => where(r, STALE) === "fail" && where(r, OLDER) === "neither" && where(r, OLDEST) === "neither" && r.retired >= 2],
    ["the headline at the true figure reports nothing at all",
      HEADLINE(TRUE_SITE), r => r.failures.length === 0 && r.review.length === 0],
    ["an old-value marker ending one line binds the figure starting the next",
      ["The site harness is green at " + P(TRUE_SITE) + " today, and it was", P(OLDER) + " before suite U landed."].join("\n"),
      r => where(r, OLDER) === "neither" && r.retired >= 1 && r.failures.length === 0],
    ["a marker in the PREVIOUS SENTENCE does not reach across a full stop - review, not fail",
      ["The site harness is green at " + P(TRUE_SITE) + ". Phase 113h", "took it to " + P(STALE) + " on 9 September."].join("\n"),
      r => where(r, STALE) === "review"],
    ["lines inside a fence are not joined - review, not fail",
      ["```text", "the check is green at", P(STALE), "```"].join("\n"), r => where(r, STALE) === "review"],
    ["a new list item starts a new unit - review, not fail",
      ["- the check is green at", "- " + P(STALE)].join("\n"), r => where(r, STALE) === "review"],
    ["a single-line present-tense claim still fails, exactly as before",
      "The harness is green at " + P(STALE) + ".", r => where(r, STALE) === "fail"],
    ["a figure wrapped away from its own word is still seen, and still fails",
      ["and the harness is green at " + STALE, "pass / 0 fail today."].join("\n"), r => where(r, STALE) === "fail"],
    ["a sentence that ends inside bold still ends - a marker two sentences back does not reach (09-app/engine/EXTRACTION.md)",
      ["Both modes report the same total, and **that matching is the assertion.** It was",
       "**" + OLDEST + " / 0 / 4** at the close of Phase 102."].join("\n"),
      r => where(r, OLDEST) !== "fail"],
    /* PHASE 114 SWEEP, 10 September 2026 - the fifth shape. The first three are
       the action plan's own section 2 and stack paragraph, as they stood that
       morning; the fourth pins the blind spot that was deliberately left. */
    ["the action plan's evidence table: a noun between the figure and 'pass', with the command beside it - it must FAIL",
      "|  **The estimate engine, all five sectors** |  **" + (500 + 63) + " assertions pass, 0 fail, 4 deliberate expected failures** — run `node 03-app/caprebate-regression.cjs` |",
      r => where(r, 500 + 63) === "fail"],
    ["'N tests, 0 failures' with no marker is SEEN - review, not invisible",
      "|  **The data layer — 11 modules** |  `04-phase-work/phase3/*.ts`. **" + (300 + 58) + " tests, 0 failures across ten suites** |",
      r => where(r, 300 + 58) === "review"],
    ["a bare comma-grouped 'N assertions' in narrative is SEEN - review, not invisible",
      "because the engine and all " + (1000 + 132).toLocaleString("en-GB") + " assertions already are TypeScript.",
      r => where(r, 1000 + 132) === "review"],
    ["bare 'N tests' is deliberately NOT a shape - the written-down blind spot stays exactly as wide as the comment says",
      "the suite holds " + (300 + 47) + " tests across ten files.",
      r => where(r, 300 + 47) === "neither"],
    /* PHASE 148, 24 September 2026 - the sixth shape. Each of the first seven is
       a line the Phase 148 prompt listed, with its figure built at run time; each
       MUST be SEEN (review - none carries a marker), and against .bak-phase148 the
       five with a word before the noun land "neither" and fail. The two before
       them were already seen and are kept as the fifth shape's regression. */
    ...[["", " assertions pass."], ["", " tests pass."], ["", " engine assertions pass."],
        ["", " site-harness assertions pass."], ["", " back end tests pass."],
        ["All ", " site-harness assertions pass."], ["", " phase9 assertions pass"]]
      .map(([pre, post]) => ["sixth shape: '" + pre + "N" + post + "' is SEEN - review, not invisible",
        pre + (1000 + 246) + post, r => where(r, 1000 + 246) === "review"]),
    ["sixth shape: 'N of M assertions pass' sees BOTH figures - the first one used to be invisible",
      (1000 + 246) + " of " + (1000 + 250) + " assertions pass.",
      r => where(r, 1000 + 246) === "review" && where(r, 1000 + 250) === "review"],
    ["sixth shape: a word before 'tests, 0 failures' is seen too",
      (1000 + 246) + " engine tests, 0 failures.", r => where(r, 1000 + 246) === "review"],
    ["sixth shape: a marker still makes it a live claim - 'reports N site-harness assertions passing' FAILS",
      "The run reports " + (1000 + 246) + " site-harness assertions passing.", r => where(r, 1000 + 246) === "fail"],
    ["sixth shape, clean control: the TRUE figure written the same way reports nothing at all",
      "All " + TRUE_SITE + " site-harness assertions pass, and the run reports " + TRUE_SITE + " engine assertions passing.",
      r => r.failures.length === 0 && r.review.length === 0],
    ["sixth shape, the old-value marker still binds: 'was N engine assertions pass' is history",
      "it was " + (1000 + 246) + " engine assertions pass before suite W.", r => where(r, 1000 + 246) === "neither" && r.retired >= 1],
    ["blind spot 2 stays exactly as wide as the comment says: a verbless 'N engine assertions' is NOT seen",
      "all " + (1000 + 132).toLocaleString("en-GB") + " engine assertions already are TypeScript.",
      r => where(r, 1000 + 132) === "neither"]
  ];
  console.log("CLASSIFIER SELF-TEST — each case is text and the bucket its figure must land in");
  let ok = 0;
  for (const [name, text, pass] of cases) {
    let good = false, err = null;
    try { good = !!pass(mod.classifyText(text, LIVE)); } catch (e) { err = e; }
    console.log((good ? "  ✔ " : "  ✘ ") + name + (err ? "\n        threw: " + err.message : ""));
    if (good) ok++;
  }
  console.log("\n" + ok + " of " + cases.length + " cases held" +
    (ok === cases.length ? "." : " - " + (cases.length - ok) + " FAILED."));
  return ok === cases.length;
}

module.exports = {
  PASS_RE, PRESENT_MARKER, COMMAND_ON_LINE, SUM_ON_LINE, PHASE_CLOSE_CAPTION,
  isRetiredFigure, datedRecordLines, paragraphUnits, sentenceBefore, classifyText, selfTest
};

if (require.main === module) {
  const argv = process.argv.slice(2);
  if (argv.includes("--self-test")) {
    const at = argv.indexOf("--against");
    const target = at >= 0 && argv[at + 1] ? require(require("path").resolve(argv[at + 1])) : module.exports;
    if (at >= 0) console.log("running the cases against " + argv[at + 1] + "\n");
    process.exit(selfTest(target) ? 0 : 1);
  }
  console.log("usage: node 03-app/caprebate-figure-classify.cjs --self-test [--against <another copy of this file>]");
  process.exit(2);
}
