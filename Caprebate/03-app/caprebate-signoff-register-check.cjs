#!/usr/bin/env node
/* ---------------------------------------------------------------------------
   caprebate-signoff-register-check.cjs — built by Phase 113g, 9 September 2026.

   WHY THIS EXISTS.

   FOR THE ACCOUNTANT, FOR THE SURVEYOR and FOR THE SOLICITOR, THE DPO AND THE
   DEVELOPER are the only place a named professional learns what waits on their
   signature. Their own rule, stated in all three, is that every board item at
   "Built - awaiting sign-off" appears in EXACTLY ONE of them.

   That rule broke twice in five days and nothing detected it either time. The
   registers cannot check themselves, the board reports nothing, and a sweep
   only finds it if a sweep happens to look. On 6 September the registers
   covered fifty items and the board carried fifty. On 9 September the board
   carried fifty-nine, then sixty-one before the day was out, and Phase 113c
   reconciled EIGHT finished pieces of work that appeared in no register at all
   - invisible to the people who have to approve them. It closed that day's gap
   by hand. This closes it for every day after.

   WHAT IT DOES, IN ORDER. Four checks, each named, each able to fail:
     CHECK 1  tally every item's status IN CODE and assert the tally sums to
              items_count. If it does not, one of the two is wrong and saying
              which is part of the job.
     CHECK 2  reconcile the set at "Built - awaiting sign-off" against the three
              registers: an awaiting item in NO register, in MORE THAN ONE, or a
              register naming an item that is no longer at that status.
     CHECK 3  compare each register's own STATED count and split, in its own
              prose, against the derived one. All three were wrong on
              9 September.
     CHECK 4  a separate, cheaper check: an item at "Built - awaiting sign-off"
              carrying no update, no attached file and no document. The board
              says finished and shows nothing. Phase 113c found one. CHECK 2
              would never catch it, because such an item is on a
              register-eligible status and simply has no evidence.
     SECTION 5 is not a check of the registers at all. It reports what the six
              Monday documents assert about the harness pass-counts, using the
              disk drift checker's own classification, because that checker
              walks the disk and these documents are on neither disk. See the
              long note under (f) below.

   COUNT IN CODE, NEVER BY EYE. Every number this file prints is derived by
   tallying an array, never by reading one. COORDINATES says so, and counting a
   sixty-id array by eye produced a phantom discrepancy once, costing twenty
   minutes chasing an item that was never missing.

   AN ID MENTIONED IN PASSING PROSE IS NOT A REGISTER ENTRY, AND THIS IS THE
   ONE THING MOST LIKELY TO BE GOT WRONG. A loose scan for board ids in a
   register's text would give a home to an item merely name-dropped in a note -
   hiding exactly the failure this check exists to find. So the entry/mention
   judgement is NOT inferred here. It is recorded, once, in
   `caprebate-signoff-registers.json` beside this file, with a reason against
   every mention. The check then FAILS on any id in a register that the manifest
   does not classify, and on any manifest id the register no longer names, so
   the manifest cannot go quietly stale in either direction.

   HOW IT GETS ITS DATA, AND WHY THERE IS NO LIVE MODE.

   The board and the three registers are on monday.com. There is no monday.com
   API token on either machine - Phase 87 had to make two MCP calls per document
   for want of one - so a `fetch` straight to the API would be dead code that
   has never run, in a check whose whole point is that it can fail. Instead this
   reads a SNAPSHOT that a phase captures through the Monday connector it
   already has, in `03-app/signoff-snapshot/`, and it REFUSES TO RUN (exit 2) on
   a snapshot older than a day. A stale snapshot passing quietly would be worse
   than no check at all. `--refresh-plan` prints the exact calls to take a new
   one.

   EXIT CODES
     0  every check passed. If SECTION 5 was not run (--no-figures, or the four
        totals could not be derived) the OK line says so rather than claiming it.
     1  a check failed - the registers and the board disagree - OR a suite is red
        inside the drift checker's own run: SECTION 5 is then NOT RUN, the red
        suite is named, and the run fails rather than check anything against a
        red run's pass-counts (Phase 132, 14 September 2026).
     2  the check could not run: no snapshot, a stale snapshot, or a snapshot it
        cannot parse. NOT the same as green, and not the same as a failure.

   USAGE
     node 03-app/caprebate-signoff-register-check.cjs
     node 03-app/caprebate-signoff-register-check.cjs --no-figures
     node 03-app/caprebate-signoff-register-check.cjs --drift-checker <file>
     node 03-app/caprebate-signoff-register-check.cjs --refresh-plan
     node 03-app/caprebate-signoff-register-check.cjs --max-age-hours 72
     node 03-app/caprebate-signoff-register-check.cjs --snapshot <dir>
     node 03-app/caprebate-signoff-register-check.cjs --self-test
   --------------------------------------------------------------------------- */

const fs = require("fs");
const path = require("path");

const APP_DIR = __dirname;
const ROOT = path.join(APP_DIR, "..");
const argv = process.argv.slice(2);
const flag = n => argv.includes(n);
const value = (n, d) => {
  const i = argv.indexOf(n);
  if (i >= 0 && argv[i + 1]) return argv[i + 1];
  const eq = argv.find(a => a.startsWith(n + "="));
  return eq ? eq.split("=").slice(1).join("=") : d;
};

const SNAP_DIR = path.resolve(value("--snapshot", path.join(APP_DIR, "signoff-snapshot")));
const MANIFEST = path.resolve(value("--manifest", path.join(APP_DIR, "caprebate-signoff-registers.json")));
const MAX_AGE_HOURS = parseFloat(value("--max-age-hours", "24"));
/* The drift checker section 5 takes its suite totals from. Only ever changed by
   --self-test's control 7, which feeds a stand-in that prints a red run. */
const DRIFT_CHECKER = path.resolve(value("--drift-checker", path.join(APP_DIR, "caprebate-figure-drift.cjs")));

/* --- the refresh plan --------------------------------------------------- */

const REFRESH_PLAN = `
HOW TO REFRESH THE SNAPSHOT — five calls through the Monday connector, then
five files. Every one of them is a read; nothing here writes to the board.

1. THE BOARD, in ONE call, tallied in code afterwards. This is the call
   COORDINATES prescribes, plus the four evidence columns CHECK 4 needs:

   all_monday_api query:
     query { boards(ids:[18422317809]) { items_count
       items_page(limit:500) { cursor items { id name group { title }
         updates(limit:1) { id }
         column_values(ids:["status","file_mm4ws3m7","doc_mm6b6y15",
                            "doc_mm6nrqrn","doc_mm6p2bcx"]) { id text } } } } }

   Save the whole result, unedited, as   signoff-snapshot/board.json
   If cursor comes back non-null the board has outgrown one page: page it and
   concatenate, or this check will silently be reading part of the board.

2. THE THREE REGISTERS and the three other hub documents, one call each -
   a multi-id array returns NOTHING:

     read_docs  type: object_ids  ids: ["18429783853"]   FOR THE ACCOUNTANT
     read_docs  type: object_ids  ids: ["18429784582"]   FOR THE SURVEYOR
     read_docs  type: object_ids  ids: ["18429855060"]   FOR THE SOLICITOR/DPO/DEV
     read_docs  type: object_ids  ids: ["18429698457"]   CAPREBATE ACTION PLAN
     read_docs  type: object_ids  ids: ["18429697811"]   CAPREBATE QUESTIONS
     read_docs  type: object_ids  ids: ["18427857409"]   PHASE HISTORY

   Take .data[0].blocks_as_markdown from each - it is the WHOLE document on
   every page, unlike \`blocks\`, which paginates - and save them as
     register-accountant.md  register-surveyor.md
     register-solicitor-dpo-developer.md
     hub-action-plan.md  hub-questions.md  hub-phase-history.md

2A. THE WORD QUESTIONS DOCUMENT (Phase 146a, 22 Sep 2026). Since 22 Sep 2026
   Caprebate_Questions.docx is the source of truth for questions and answers;
   the monday.com CAPREBATE QUESTIONS document is background only. It is not on
   Monday, so it is read from disk, not through the connector:
     Mac   /Users/lakhbir/Library/CloudStorage/OneDrive-AqliosLTD/
           Caprebate_Questions.docx
   Save its Heading 2 texts, one per line and exactly as written ("N) <title>"),
   as   signoff-snapshot/hub-questions-word.txt   - with python-docx:
     python3 -c "import docx,sys; d=docx.Document(sys.argv[1]); print('\\n'.join(
       p.text.strip() for p in d.paragraphs if p.style.name=='Heading 2'))" \\
       "<the path above>" > 03-app/signoff-snapshot/hub-questions-word.txt
   The CRM fold check's A2 reads it, and refuses to run (exit 2) without it.
   Count the lines against the Heading 2 count you expect.

3. WRITE signoff-snapshot/snapshot.json:
     { "capturedAt": "<ISO 8601, UTC>", "capturedBy": "Phase NNN",
       "machine": "<this machine>", "how": "monday MCP" }
   capturedAt is what the age check reads. A snapshot with no snapshot.json,
   or an unparseable date in it, is refused rather than trusted.
`;

if (flag("--refresh-plan")) { console.log(REFRESH_PLAN.trim()); process.exit(0); }

/* --- THE NEGATIVE CONTROLS ----------------------------------------------

   A CHECK THAT HAS NEVER BEEN SEEN TO FAIL IS A CHECK NOBODY HAS TESTED, and
   this project has been bitten by exactly that: the figure-drift checker was
   green for a day while blind to the two most-quoted numbers in the corpus, and
   green again while blind to a third shape. So the seven ways this file is
   supposed to fail are not a story told once in a phase record - they are run.

   `--self-test` copies the snapshot AND the manifest into a temporary folder,
   breaks one thing in each copy, runs THIS FILE against the broken copy as a
   child process, and asserts the output names the thing that was broken. It
   also asserts the UNBROKEN copy does not name it, because a scenario that
   passes against a baseline that already fails proves nothing.

   The fixtures are read out of the snapshot at run time - the first Done item,
   the first awaiting item, the first entry of the first register - so this does
   not rot as the board changes. */
if (flag("--self-test")) {
  const os = require("os");
  const { execFileSync } = require("child_process");
  const src = SNAP_DIR;
  const manifestSrc = MANIFEST;
  const board0 = JSON.parse(fs.readFileSync(path.join(src, "board.json"), "utf8"));
  const items0 = ((board0.boards || board0.data.boards)[0]).items_page.items;
  const textOf = (it, id) => { const c = (it.column_values || []).find(c => c.id === id); return (c && c.text) || ""; };
  const man0 = JSON.parse(fs.readFileSync(manifestSrc, "utf8"));
  const AW = man0.awaitingLabel;
  const doneItem = items0.find(i => textOf(i, "status") === "Done");
  const awItem = items0.find(i => textOf(i, "status") === AW);
  const reg0 = man0.registers.find(r => r.key === "surveyor");
  const victim = reg0.entries[reg0.entries.length - 1];        /* the last surveyor entry */
  const inManifest = new Set(man0.registers.flatMap(r =>
    r.entries.map(e => e.id).concat(r.mentions.map(m => m.id))));
  const unclassifiedId = String((items0.find(i => !inManifest.has(String(i.id))) || items0[0]).id);

  function scenario(name, mutate, expects) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "caprebate-selftest-"));
    for (const f of fs.readdirSync(src)) fs.copyFileSync(path.join(src, f), path.join(dir, f));
    const manPath = path.join(dir, "manifest.json");
    fs.copyFileSync(manifestSrc, manPath);
    mutate(dir, manPath);
    let out;
    try {
      out = execFileSync(process.execPath, [__filename, "--snapshot", dir, "--manifest", manPath, "--no-figures"],
        { encoding: "utf8", maxBuffer: 32 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"] });
    } catch (e) { out = String((e.stdout || "") + (e.stderr || "")); }
    const missing = expects.filter(x => !out.includes(x));
    console.log((missing.length ? "  ✘ " : "  ✔ ") + name);
    if (missing.length) {
      for (const m of missing) console.log("        expected the output to contain: " + JSON.stringify(m));
      console.log("        ---- what it actually printed ----");
      console.log(out.split(/\n/).map(l => "        " + l).join("\n"));
    }
    fs.rmSync(dir, { recursive: true, force: true });
    return missing.length === 0;
  }

  console.log("NEGATIVE CONTROLS — each one breaks something and asserts this file says so");
  const results = [];

  /* 0. the baseline. Whatever the live data does today, it must NOT name the
        things the scenarios below break. */
  let baseline;
  try {
    baseline = execFileSync(process.execPath, [__filename, "--snapshot", src, "--manifest", manifestSrc, "--no-figures"],
      { encoding: "utf8", maxBuffer: 32 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"] });
  } catch (e) { baseline = String((e.stdout || "") + (e.stderr || "")); }
  const baseClean = ["no longer contains", "moved off the status it expects", "does not classify",
                     "with no update, no file and no document", "does not sum to items_count",
                     "a suite is red inside the drift checker's run"]
                     .filter(x => baseline.includes(x));
  console.log((baseClean.length ? "  ✘ " : "  ✔ ")
    + "baseline: the unbroken snapshot does not already report the seven failures below");
  for (const x of baseClean) console.log("        baseline already says: " + JSON.stringify(x));
  results.push(baseClean.length === 0);

  /* 1. AN ENTRY REMOVED FROM A REGISTER — the failure Phase 113c found by hand. */
  results.push(scenario(
    "an entry removed from a register: its board item is named as housed nowhere",
    (dir) => {
      const f = path.join(dir, reg0.snapshotFile);
      fs.writeFileSync(f, fs.readFileSync(f, "utf8").split(victim.id).join("REMOVED-BY-SELF-TEST"));
    },
    ["no longer contains", victim.id, "appear in NO register"]));

  /* 2. A STALE ENTRY — a register still naming work that has been signed off. */
  results.push(scenario(
    "a stale entry: a register names an item that is no longer awaiting sign-off",
    (dir, manPath) => {
      const m = JSON.parse(fs.readFileSync(manPath, "utf8"));
      m.registers.find(r => r.key === "surveyor").entries.push(
        { ref: "SELF-TEST stale entry", id: String(doneItem.id), how: "prose" });
      fs.writeFileSync(manPath, JSON.stringify(m, null, 2));
      const f = path.join(dir, reg0.snapshotFile);
      fs.appendFileSync(f, "\n\nSELF-TEST: board item " + doneItem.id + ".\n");
    },
    ["moved off the status it expects", String(doneItem.id)]));

  /* 3. AN ID NOBODY HAS CLASSIFIED — the entry-versus-mention trap. A loose scan
        would have given this item a home; this must refuse to guess. */
  results.push(scenario(
    "an unclassified id: a register names an item the manifest does not adjudicate",
    (dir) => {
      const f = path.join(dir, reg0.snapshotFile);
      fs.appendFileSync(f, "\n\nSELF-TEST mention of board item " + unclassifiedId + " in passing prose.\n");
    },
    ["does not classify", unclassifiedId]));

  /* 4. A WRONG STATED COUNT. */
  results.push(scenario(
    "a wrong stated count: a register's own size sentence disagrees with the board",
    (dir) => {
      const f = path.join(dir, reg0.snapshotFile);
      fs.appendFileSync(f, "\n\nRegister size, re-derived by the self-test: 999 entries.\n");
    },
    ["stated count or split is wrong", "999"]));

  /* 5. AN AWAITING ITEM WITH NO EVIDENCE AT ALL — the one CHECK 2 cannot see. */
  results.push(scenario(
    "no evidence: an awaiting item with no update, no file and no document",
    (dir) => {
      const p2 = path.join(dir, "board.json");
      const j = JSON.parse(fs.readFileSync(p2, "utf8"));
      const items = ((j.boards || j.data.boards)[0]).items_page.items;
      const t = items.find(i => String(i.id) === String(awItem.id));
      t.updates = [];
      for (const c of t.column_values) if (c.id !== "status") c.text = "";
      fs.writeFileSync(p2, JSON.stringify(j));
    },
    ["with no update, no file and no document", String(awItem.id)]));

  /* 6. THE TALLY NOT SUMMING — CHECK 1's whole point. */
  results.push(scenario(
    "the tally does not sum: items_count and the statuses disagree",
    (dir) => {
      const p2 = path.join(dir, "board.json");
      const j = JSON.parse(fs.readFileSync(p2, "utf8"));
      const b = (j.boards || j.data.boards)[0];
      b.items_count = b.items_count + 3;
      fs.writeFileSync(p2, JSON.stringify(j));
    },
    ["does not sum to items_count", "THEY DISAGREE"]));

  /* 7. A RED SUITE INSIDE THE DRIFT CHECKER'S RUN — Phase 132, line 16,
        14 September 2026. The drift checker exits 1 for a stale figure AND for a
        red suite, and on 13 September 2026 section 5 took the back end's 693 from
        a red run and printed OK. So a stand-in drift checker prints the red-run
        shape the real one prints - its FAIL sentence READ OUT OF THE REAL FILE, so
        the two cannot drift apart unseen - and section 5 must refuse, naming the
        suite. NOT run through scenario(), which passes --no-figures and so never
        reaches section 5. A GREEN TWIN prints the same totals without the FAIL
        lines, exit 0, and must NOT refuse: a refusal the stand-in would trigger
        anyway proves nothing. */
  results.push((() => {
    const name = "a red drift run: a suite is red inside the drift checker's run, and section 5 refuses its pass-counts";
    const realDrift = path.join(APP_DIR, "caprebate-figure-drift.cjs");
    const sentence = fs.existsSync(realDrift)
      && fs.readFileSync(realDrift, "utf8").match(/FAIL: a suite is red inside this run[^"\n]*/);
    if (!sentence) {
      console.log("  ✘ " + name);
      console.log("        the drift checker (" + realDrift + ") no longer contains \"FAIL: a suite is red inside this run\",");
      console.log("        so the stand-in cannot print what it prints. Re-read it, and fix section 5's RED_RUN with it.");
      return false;
    }
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "caprebate-selftest-red-"));
    const snap = path.join(tmp, "snapshot");
    fs.mkdirSync(snap);
    for (const f of fs.readdirSync(src)) if (!/\.bak/.test(f)) fs.copyFileSync(path.join(src, f), path.join(snap, f));
    const manPath = path.join(tmp, "manifest.json");
    fs.copyFileSync(manifestSrc, manPath);
    const derivedLines = ["Re-derived, not inherited:",
      "  site harness  719 pass / 0 fail / 0 xfail",
      "  phase3        385 pass across 12 files",
      "  phase9        324 pass across 9 files",
      "  PROJECT TOTAL 2,121 passing assertions",
      "  back end      693 pass across 41 files",
      ""];
    const writeFake = (file, lines, code) => fs.writeFileSync(file,
      "process.stdout.write(" + JSON.stringify(lines.join("\n") + "\n") + ");\nprocess.exitCode = " + code + ";\n");
    const red = path.join(tmp, "drift-red.cjs");
    const green = path.join(tmp, "drift-green.cjs");
    writeFake(red, derivedLines.concat([sentence[0], "  back end: 1 failing — SELF-TEST a red back-end test"]), 1);
    writeFake(green, derivedLines, 0);
    const run = fake => {
      try {
        return { code: 0, out: execFileSync(process.execPath,
          [__filename, "--snapshot", snap, "--manifest", manPath, "--drift-checker", fake],
          { encoding: "utf8", maxBuffer: 32 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"] }) };
      } catch (e) {
        return { code: typeof e.status === "number" ? e.status : -1, out: String((e.stdout || "") + (e.stderr || "")) };
      }
    };
    const r = run(red), g = run(green);
    const problems = [];
    for (const x of ["NOT RUN: a suite is red inside the drift checker's run", "back end: 1 failing"]) {
      if (!r.out.includes(x)) problems.push("expected the RED run's output to contain: " + JSON.stringify(x));
    }
    if (r.out.includes("live suite totals:")) problems.push("the RED run printed \"live suite totals:\" - it took its pass-counts from a red run");
    if (r.code === 0) problems.push("the RED run exited 0");
    if (g.out.includes("a suite is red inside the drift checker's run")) problems.push("the GREEN twin refused too - the refusal is not caused by the red sentence");
    if (!g.out.includes("live suite totals:")) problems.push("the GREEN twin did not print \"live suite totals:\" - the stand-in is not being read");
    console.log((problems.length ? "  ✘ " : "  ✔ ") + name);
    if (problems.length) {
      for (const p of problems) console.log("        " + p);
      console.log("        ---- what the RED run printed from SECTION 5 on (exit " + r.code + ") ----");
      console.log(r.out.slice(Math.max(0, r.out.indexOf("SECTION 5"))).split(/\n/).map(l => "        " + l).join("\n"));
    }
    fs.rmSync(tmp, { recursive: true, force: true });
    return problems.length === 0;
  })());

  const passed = results.filter(Boolean).length;
  console.log("");
  console.log(passed + " of " + results.length + " negative controls behaved as required.");
  process.exit(passed === results.length ? 0 : 1);
}

/* --- loading ------------------------------------------------------------ */

function refuse(why) {
  console.error("CANNOT CHECK — " + why);
  console.error(REFRESH_PLAN.trim());
  process.exit(2);
}

function loadJSON(p, label) {
  if (!fs.existsSync(p)) refuse("no " + label + " at " + p);
  try { return JSON.parse(fs.readFileSync(p, "utf8")); }
  catch (e) { refuse(label + " at " + p + " is not parseable JSON: " + e.message); }
}

const manifest = loadJSON(MANIFEST, "manifest");

/* The board file is whatever the connector returned, saved unedited, so accept
   the two shapes it comes back in - bare {boards:[...]} and a GraphQL
   {data:{boards:[...]}} envelope - and refuse anything else BY NAME rather than
   crashing on undefined. */
function readBoard(raw) {
  const boards = (raw && raw.boards) || (raw && raw.data && raw.data.boards);
  if (!Array.isArray(boards) || !boards.length) {
    refuse("board.json has no boards array. Expected the result of the call in the refresh plan, saved unedited.");
  }
  const b = boards[0];
  const page = b.items_page || {};
  if (!Array.isArray(page.items)) refuse("board.json has no items_page.items array.");
  if (page.cursor) {
    refuse("board.json carries a non-null items_page cursor, so it is only PART of the board.\n"
      + "  Page it and concatenate before checking anything - a partial board makes every\n"
      + "  count below wrong in the same direction.");
  }
  if (typeof b.items_count !== "number") refuse("board.json has no items_count, so CHECK 1 cannot run.");
  return { itemsCount: b.items_count, items: page.items };
}

const boardRaw = loadJSON(path.join(SNAP_DIR, "board.json"), "board.json");
const board = readBoard(boardRaw);

const meta = loadJSON(path.join(SNAP_DIR, "snapshot.json"), "snapshot.json");
const capturedAt = new Date(meta.capturedAt || "");
if (isNaN(capturedAt.getTime())) refuse("snapshot.json has no usable capturedAt date.");
const ageHours = (Date.now() - capturedAt.getTime()) / 36e5;
if (ageHours > MAX_AGE_HOURS) {
  refuse("the snapshot is " + ageHours.toFixed(1) + " hours old and the limit is "
    + MAX_AGE_HOURS + ".\n  A stale snapshot passing quietly is worse than no check, so this is refused\n"
    + "  rather than reported. Re-capture it, or pass --max-age-hours if you truly mean\n"
    + "  to check an old capture and will say so in whatever you write.");
}
if (ageHours < -1) refuse("snapshot.json's capturedAt is in the future by "
  + (-ageHours).toFixed(1) + " hours. Fix the clock or the file.");

const docText = {};
for (const r of manifest.registers) {
  const p = path.join(SNAP_DIR, r.snapshotFile);
  if (!fs.existsSync(p)) refuse("no snapshot of " + r.name + " at " + p);
  docText[r.key] = fs.readFileSync(p, "utf8");
}

/* --- the board, tallied in code ---------------------------------------- */

const col = (item, id) => {
  const c = (item.column_values || []).find(c => c.id === id);
  return (c && c.text) || "";
};
const AWAITING = manifest.awaitingLabel;

const statusOf = new Map();
const nameOf = new Map();
const tally = new Map();
for (const it of board.items) {
  const s = col(it, "status") || "(blank)";
  statusOf.set(String(it.id), s);
  nameOf.set(String(it.id), it.name);
  tally.set(s, (tally.get(s) || 0) + 1);
}
const tallySum = [...tally.values()].reduce((a, b) => a + b, 0);
const awaitingIds = board.items.filter(i => col(i, "status") === AWAITING).map(i => String(i.id));

/* --- the registers, adjudicated ---------------------------------------- */

const classify = require(path.join(APP_DIR, "caprebate-figure-classify.cjs"));

const ID_RE = /\b1[0-9]{10}\b/g;                 /* item ids and board ids share this shape */

/* THE REGISTERS NAME BOARDS AS WELL AS ITEMS, and a board id looks exactly like
   an item id. Appendix 3 of every register opens "Board 18422317809", and the
   third register names the two restricted boards the breach register lives on.
   Those are not items and must not be adjudicated as entries or mentions, so
   they are listed in the manifest and skipped here - named, not silently
   dropped, because an id nobody has accounted for is the thing this check is
   strict about. */
const BOARD_IDS = new Set((manifest.boardIds || []).map(b => String(b.id || b)));

/* MONDAY'S OWN MARKDOWN EXPORT BREAKS WORDS APART, and it breaks precisely the
   sentences CHECK 3 has to read. Bold written through the API comes back as
   "T****h****e re****g****ister i****s ****therefore eight entrie****s****", and
   "awaiting" arrives as "await__in__g". A regex over the raw line matches
   nothing and looks exactly like a claim the document does not make - which
   would turn a wrong count into a silent pass. So claims are matched against a
   line with the emphasis markers stripped and the whitespace collapsed, while
   the ORIGINAL line is what gets printed, because that is what a person will
   search for in the document. */
const normalise = s => s.replace(/[*_]/g, "").replace(/[ \t]+/g, " ").trim();

const failures = [];   /* each: {check, lines:[...]} */
const notes = [];

function fail(check, lines) { failures.push({ check, lines: [].concat(lines) }); }

/* CHECK 1 */
const check1 = [];
if (tallySum !== board.itemsCount) {
  fail("CHECK 1 — the status tally does not sum to items_count", [
    "items_count says " + board.itemsCount + "; the statuses tally to " + tallySum + ".",
    "WHICH IS WRONG: items_count is the board's own count of live items, and the tally",
    "counts what one items_page call returned. A shortfall in the tally almost always",
    "means the page did not return everything - check items_page.cursor first. A",
    "shortfall in items_count means the snapshot was taken mid-write."
  ]);
}

/* CHECK 2 */
const housedBy = new Map();      /* board id -> [register keys] */
const derived = {};
for (const r of manifest.registers) {
  const text = docText[r.key];
  const classified = new Map();
  for (const e of r.entries) classified.set(e.id, e);
  for (const m of r.mentions) classified.set(m.id, m);

  const found = [...new Set(text.match(ID_RE) || [])].filter(id => !BOARD_IDS.has(id));
  const unclassified = found.filter(id => !classified.has(id));
  if (unclassified.length) {
    fail("CHECK 2 — " + r.name + " names board ids the manifest does not classify",
      [
        "Decide, once, whether each of these is an ENTRY (this register tells somebody it",
        "waits on them) or a MENTION (it appears in passing and gives the item no home),",
        "and record it in 03-app/caprebate-signoff-registers.json with a reason.",
        "Guessing here is what would hide a missing entry."
      ].concat(unclassified.map(id =>
        "    " + id + "  " + (nameOf.get(id) || "(not an item on this board)")
        + "   [" + (statusOf.get(id) || "no status") + "]")));
  }
  const absent = [...classified.keys()].filter(id => !found.includes(id));
  if (absent.length) {
    fail("CHECK 2 — the manifest names ids " + r.name + " no longer contains",
      ["Either the register lost an entry it should still carry, or the manifest is stale.",
       "Both are real; look at the register before editing the manifest."]
        .concat(absent.map(id => "    " + id + "  " + (nameOf.get(id) || "(not on this board)"))));
  }

  /* AN ENTRY ONLY HOUSES AN ITEM IF THE REGISTER ACTUALLY NAMES IT. The manifest
     adjudicates ids; it does not substitute for them. If a register loses an
     entry, the manifest still lists it, and counting the manifest would report
     the item as housed while the professional's own page no longer mentions it -
     which is precisely the failure this check exists to catch, moved one level
     down. So coverage is derived from what the DOCUMENT contains, and the
     manifest only says what each id means. (Found by this file's own negative
     control, which removed an entry from a copy of a register and got one
     failure where it should have had two.) */
  const presentEntries = r.entries.filter(e => found.includes(e.id));
  const entryIds = [...new Set(presentEntries.map(e => e.id))];
  const offBoard = entryIds.filter(id => !statusOf.has(id));
  if (offBoard.length) {
    fail("CHECK 2 — " + r.name + " has entries for items that are not on the board",
      offBoard.map(id => "    " + id + "  deleted, moved, or never existed"));
  }
  const stale = [];
  for (const e of presentEntries) {
    if (!statusOf.has(e.id)) continue;
    const want = e.expect || AWAITING;
    const got = statusOf.get(e.id);
    if (got !== want) stale.push("    " + e.id + "  " + e.ref + "\n        register expects \""
      + want + "\"; the board says \"" + got + "\"");
  }
  if (stale.length) {
    fail("CHECK 2 — " + r.name + " names items that have moved off the status it expects",
      ["A register entry whose item is no longer awaiting sign-off is asking a professional",
       "to approve something that has been signed, withdrawn, or re-opened."].concat(stale));
  }

  const awaitingEntries = presentEntries.filter(e => statusOf.get(e.id) === AWAITING);
  const awaitingUnique = [...new Set(awaitingEntries.map(e => e.id))];
  for (const id of awaitingUnique) {
    if (!housedBy.has(id)) housedBy.set(id, []);
    housedBy.get(id).push(r.key);
  }
  derived[r.key] = {
    name: r.name,
    entriesTotal: presentEntries.length,
    boardItemsCovered: entryIds.length,
    awaiting: awaitingUnique.length,
    awaitingIds: awaitingUnique
  };
}

const unhoused = awaitingIds.filter(id => !housedBy.has(id));
if (unhoused.length) {
  fail("CHECK 2 — items at \"" + AWAITING + "\" that appear in NO register",
    ["Finished work waiting on a signature that the person who must sign it cannot see."]
      .concat(unhoused.map(id => "    " + id + "  " + nameOf.get(id))));
}
const doubleHoused = [...housedBy.entries()].filter(([, ks]) => ks.length > 1);
if (doubleHoused.length) {
  fail("CHECK 2 — items that appear in MORE THAN ONE register",
    ["Every register states the rule that an item appears in exactly one of them."]
      .concat(doubleHoused.map(([id, ks]) => "    " + id + "  " + nameOf.get(id) + "   in: " + ks.join(", "))));
}

/* CHECK 3 — what each register SAYS about its own size.

   Counts in these documents are written in words as often as in digits
   ("thirty-six here, seven with the surveyor"), so both are parsed. Claims are
   read in DOCUMENT ORDER and the LAST claim of a kind is the live one; earlier
   ones are reported as superseded rather than failed. That is not a
   convenience: this corpus corrects a document by appending a dated note, on
   purpose, because update_block replaces a whole block and retyping a large one
   by hand is the riskier operation. The same convention runs through the action
   plan's own COORDINATES block. So an earlier, lower count under an older date
   is a record, and only the last one is a claim.

   A COUNT-SHAPED SENTENCE THIS DOES NOT RECOGNISE IS PRINTED, NOT IGNORED,
   under "not adjudicated" - so nobody reads a green CHECK 3 as "every number in
   these documents is right". */
const WORDS = {
  zero:0,one:1,two:2,three:3,four:4,five:5,six:6,seven:7,eight:8,nine:9,ten:10,
  eleven:11,twelve:12,thirteen:13,fourteen:14,fifteen:15,sixteen:16,seventeen:17,
  eighteen:18,nineteen:19,twenty:20,thirty:30,forty:40,fifty:50,sixty:60,
  seventy:70,eighty:80,ninety:90
};
const NUM = "(\\d{1,4}|[A-Za-z]+(?:-[A-Za-z]+)?)";
function toNum(s) {
  if (/^\d+$/.test(s)) return parseInt(s, 10);
  const t = String(s).toLowerCase().split("-");
  let n = 0;
  for (const w of t) { if (!(w in WORDS)) return null; n += WORDS[w]; }
  return n;
}
/* Every pattern is GLOBAL and every match on a line is read, because these
   lines are long and carry more than one claim: the surveyor's size note states
   an entry total, an item total AND an awaiting count in one sentence. The first
   version of this took only the first match per pattern, and a phrase earlier in
   the same line whose captured word was not a number ("SV-S8 is at Built —
   awaiting sign-off") made it skip the real claim further along. That is the
   defect this whole file exists to prevent, reproduced inside it.

   A COMPOUND CLAIM SUPERSEDES ITS PARTS. "eight entries covering eight items —
   six at Built — awaiting sign-off" restates the entry total, the item total and
   the awaiting count, so it must retire an earlier standalone claim about any of
   the three. That is why a pattern yields a LIST of per-kind assertions rather
   than one keyed on its own wording. */
const CLAIM_PATTERNS = [
  { re: new RegExp("Board items covered:?\\s*" + NUM, "gi"),
    parse: n => [{ kind: "boardItemsCovered", nums: [n[0]] }] },
  { re: new RegExp(NUM + "\\s*board items,\\s*unchanged", "gi"),
    parse: n => [{ kind: "boardItemsCovered", nums: [n[0]] }] },
  { re: new RegExp("Register size[^\\n]{0,90}?:\\s*" + NUM + "\\s*entries", "gi"),
    parse: n => [{ kind: "entriesTotal", nums: [n[0]] }] },
  { re: new RegExp(NUM + "\\s*entries\\s+covering\\s+" + NUM + "\\s*(?:board\\s*)?items", "gi"),
    parse: n => [{ kind: "entriesTotal", nums: [n[0]] }, { kind: "boardItemsCovered", nums: [n[1]] }] },
  { re: new RegExp(NUM + "\\s*(?:items?\\s*)?at\\s*[\"\u201c]{0,2}Built\\s*[\u2014\u2013-]{1,2}\\s*awaiting sign-?off", "gi"),
    parse: n => [{ kind: "awaiting", nums: [n[0]] }] },
  { re: new RegExp(NUM + "\\s*items?\\s*(?:now\\s*)?(?:carry|carrying)\\s*that status", "gi"),
    parse: n => [{ kind: "globalAwaiting", nums: [n[0]] }] },
  { re: new RegExp(NUM + "\\s*(?:in FOR THE ACCOUNTANT|here),\\s*" + NUM
        + "\\s*(?:with|in)\\s*(?:the\\s*)?(?:surveyor|FOR THE SURVEYOR),?\\s*(?:and\\s*)?" + NUM
        + "\\s*(?:with|here)", "gi"),
    parse: n => [{ kind: "split", nums: [n[0], n[1], n[2]] }] }
];
const COUNT_SHAPED = /\b(?:entries|items|board items)\b/i;
let retiredClaims = 0;
const check3Claims = [];
const notAdjudicated = [];
for (const r of manifest.registers) {
  const lines = docText[r.key].split(/\r?\n/);
  lines.forEach((rawLine, i) => {
    const line = normalise(rawLine);
    let matchedHere = false;
    for (const p of CLAIM_PATTERNS) {
      p.re.lastIndex = 0;
      for (const m of line.matchAll(p.re)) {
        const nums = m.slice(1).map(toNum);
        if (nums.some(n => n === null)) continue;       /* a word we do not know */
        /* A COUNT A SENTENCE IS EXPLICITLY RETIRING IS NOT A CLAIM, and the
           drift checker's own test for that is imported rather than rewritten:
           "the last size this register stated WAS thirteen entries" retires the
           thirteen. Without this, a note that correctly quotes the number it is
           superseding, before giving the new one, depends on which of the two
           happens to appear later in the file - and this project's notes quote
           the old number first as a matter of style. */
        const numIdx = m.index + m[0].indexOf(String(m[1]));
        if (classify.isRetiredFigure(line, numIdx, String(m[1]).length)) { retiredClaims++; continue; }
        for (const part of p.parse(nums)) {
          matchedHere = true;
          check3Claims.push({ register: r.key, kind: part.kind, nums: part.nums,
                              line: i + 1, text: rawLine.trim().slice(0, 200) });
        }
      }
    }
    if (!matchedHere && COUNT_SHAPED.test(line)
        && /(?:\bsixty|\bfifty|\bforty|\bthirty|\btwenty|\d{2})\b/i.test(line)
        && /\b(?:total|count|split|register size|covering|carry that status)\b/i.test(line)) {
      notAdjudicated.push({ register: r.key, line: i + 1, text: line.slice(0, 200) });
    }
  });
}
const liveClaims = [];
const superseded = [];
{
  const lastOf = new Map();
  for (const c of check3Claims) lastOf.set(c.register + "|" + c.kind, c);
  for (const c of check3Claims) (lastOf.get(c.register + "|" + c.kind) === c ? liveClaims : superseded).push(c);
}
const wrongClaims = [];
for (const c of liveClaims) {
  const d = derived[c.register];
  const want = kind => {
    if (kind === "boardItemsCovered") return [d.boardItemsCovered];
    if (kind === "entriesTotal") return [d.entriesTotal];
    if (kind === "awaiting") return [d.awaiting];
    if (kind === "entriesTotal+boardItemsCovered") return [d.entriesTotal, d.boardItemsCovered];
    if (kind === "globalAwaiting") return [awaitingIds.length];
    if (kind === "split") return manifest.registers.map(r => derived[r.key].awaiting);
    return null;
  };
  const expect = want(c.kind);
  if (!expect) continue;
  if (expect.length !== c.nums.length || expect.some((v, k) => v !== c.nums[k])) {
    wrongClaims.push({ ...c, expect });
  }
}
if (wrongClaims.length) {
  fail("CHECK 3 — a register's own stated count or split is wrong",
    wrongClaims.map(c => "    " + derived[c.register].name + ", line " + c.line
      + "\n        it says " + c.nums.join(" / ") + "; derived from the board: " + c.expect.join(" / ")
      + " (" + c.kind + ")\n        \"" + c.text + "\""));
}

/* CHECK 4 — the board says finished and shows nothing. */
const EVIDENCE_COLS = ["file_mm4ws3m7", "doc_mm6b6y15", "doc_mm6nrqrn", "doc_mm6p2bcx"];
const byId = new Map(board.items.map(i => [String(i.id), i]));
const noEvidence = [];
for (const id of awaitingIds) {
  const it = byId.get(id);
  const hasUpdate = Array.isArray(it.updates) && it.updates.length > 0;
  const hasAsset = EVIDENCE_COLS.some(c => col(it, c).trim() !== "");
  if (!hasUpdate && !hasAsset) noEvidence.push(id);
}
if (noEvidence.length) {
  fail("CHECK 4 — items at \"" + AWAITING + "\" with no update, no file and no document",
    ["The board says the work is finished and points at nothing. Phase 113c found one of",
     "these on 9 September 2026; it had in fact been finished the day before, which is why",
     "this is a cheap assertion rather than an investigation."]
      .concat(noEvidence.map(id => "    " + id + "  " + nameOf.get(id))));
}

/* --- SECTION 5 — what the Monday documents assert about the pass-counts ---

   REQUIREMENT (f), added to this phase by Phase 113e. THE DISK DRIFT CHECKER
   CANNOT SEE ANY OF THESE DOCUMENTS. It walks the disk; the action plan, the
   questions document, the phase history and the three registers are on Monday
   and on neither disk. So a pass-count asserted in the present tense in any of
   them is invisible to the one control built to catch exactly that.

   THE CLASSIFICATION IS IMPORTED, NOT REIMPLEMENTED. PASS_RE, PRESENT_MARKER,
   COMMAND_ON_LINE, the retired-figure test and the phase-close caption
   exemption come from `caprebate-figure-classify.cjs`, which Phase 113g
   extracted out of the drift checker for this purpose. Two copies of a tense
   heuristic drift apart and the one that stops matching is the one nobody
   notices.

   WHAT EXITS 1 HERE, AND WHY IT IS NOT SIMPLY "ANY DISAGREEMENT". Several of
   these blocks say in their own text "do not quote these, re-derive them", and
   a dated note recording what a phase saw is a chronicle entry exactly as
   README-file-index.md is. So:

     PHASE HISTORY is chronicle in its entirety. Its own title says "THIS IS AN
       ARCHIVE, NOT A RUNBOOK". Every figure in it is a record of what a phase
       measured on a date. Reported, never failed.
     A BLOCK OR PARAGRAPH THAT DISCLAIMS QUOTATION - "re-derive", "never quote",
       "do not quote", "last-known figures" - is chronicle by declaration.
       Reported, never failed. The cost of that rule is real and worth stating:
       anyone can neutralise a live figure by writing "re-derive this" beside
       it. That is a false sentence in a document rather than an accident of
       phrasing, which is the same trade the drift checker already makes with
       its phase-close captions.
     EVERYTHING ELSE in the action plan, the questions document and the three
       registers is a live claim and fails.

   THE FIGURES CANNOT BE DERIVED FROM A SNAPSHOT, so this section runs the four
   suites - unless --fast --expect is given, exactly as the drift checker takes
   them. With neither, section 5 is skipped and says so, rather than passing.

   AND ONE BLIND SPOT, NAMED RATHER THAN FIXED HERE: PASS_RE cannot see a total
   written with a thousands separator ("1,763 passing assertions"), because its
   lookbehind rejects a digit preceded by a comma, nor a bare sum of components
   ("676 + 385 + 324 + 378"). Phase 113g found the developer specification
   asserting a stale total in exactly that shape while the drift checker was
   green. That is a defect in the shared classifier, on disk as much as here,
   and it is recorded as its own job rather than patched in one caller. */

const HUB_DOCS = [
  { file: "hub-action-plan.md", name: "CAPREBATE ACTION PLAN", policy: "live" },
  { file: "hub-questions.md", name: "CAPREBATE QUESTIONS", policy: "live" },
  /* Phase 146a, 22 Sep 2026: the Word questions document's Heading 2 texts. This check never read
     question TITLES - the CRM fold check's A2 does - so this only brings the live questions
     document into the figure scan beside the monday.com one it replaced as the source of truth. */
  { file: "hub-questions-word.txt", name: "THE WORD QUESTIONS DOCUMENT (its headings)", policy: "live" },
  { file: "hub-phase-history.md", name: "PHASE HISTORY", policy: "chronicle",
    why: "its own title says THIS IS AN ARCHIVE, NOT A RUNBOOK" },
  { file: "register-accountant.md", name: "FOR THE ACCOUNTANT", policy: "live" },
  { file: "register-surveyor.md", name: "FOR THE SURVEYOR", policy: "live" },
  { file: "register-solicitor-dpo-developer.md", name: "FOR THE SOLICITOR, THE DPO AND THE DEVELOPER", policy: "live" }
];
const DISCLAIMS = /re-?deriv|never quote|do not quote|don't quote|last-known figures|not facts/i;

function paragraphDisclaims(lines, i) {
  /* A disclaimer binds to the block or paragraph the figure sits in, so look
     out from the line until a blank line or a fence in each direction. */
  const stop = k => k < 0 || k >= lines.length || /^\s*$/.test(lines[k]);
  let a = i, b = i;
  while (!stop(a - 1)) a--;
  while (!stop(b + 1)) b++;
  if (DISCLAIMS.test(lines.slice(a, b + 1).join("\n"))) return true;
  /* Fenced blocks in these documents are long and the disclaimer may be many
     lines away inside the same fence, so test the whole enclosing fence too. */
  let openAt = -1, closeAt = -1, open = false;
  for (let k = 0; k < lines.length; k++) {
    if (!/^\s*```/.test(lines[k])) continue;
    if (!open) { open = true; openAt = k; }
    else { open = false; if (i > openAt && i < k) { closeAt = k; break; } }
  }
  if (closeAt > 0) return DISCLAIMS.test(lines.slice(openAt, closeAt + 1).join("\n"));
  return false;
}

let section5 = null;
{
  const FAST = flag("--fast");
  const expectArg = value("--expect", "");
  let live = null;
  if (FAST) {
    const given = expectArg.split(",").map(n => parseInt(n, 10));
    if (given.length !== 4 || !given.every(Number.isFinite)) {
      console.error("--fast needs --expect site,phase3,phase9,backend  e.g. --expect 719,385,324,378");
      process.exit(2);
    }
    live = new Set(given);
  } else if (!flag("--no-figures")) {
    /* Derive them the only honest way: run the drift checker, which runs the
       four suites and prints them. We parse its own first four lines rather
       than re-implementing four runners.

       A RED RUN IS REFUSED FIRST, EXACTLY AS THE DRIFT CHECKER REFUSES IT.
       DECISION, 14 SEPTEMBER 2026 (PHASE 132, LINE 16). The drift checker exits 1
       for two different reasons: a stale figure somewhere on disk, when the four
       totals it printed are TRUE - which is why a non-zero exit is still read -
       and a suite that went red inside its own run, when they are NOT figures
       at all. This file used to read both the same way, and on 13 SEPTEMBER 2026
       it took the back end's 693 from a red run, checked the Monday documents
       against it and printed OK. So the drift checker's red-run sentence is
       looked for BEFORE any total is parsed; when it is there, section 5 is NOT
       RUN, the red suites are named, and the run fails - skipped and named,
       never green. --self-test's control 7 feeds it a red run and requires this. */
    const { execFileSync } = require("child_process");
    let out, exitCode = 0;
    try {
      out = execFileSync(process.execPath, [DRIFT_CHECKER],
        { cwd: ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"] });
    } catch (e) {
      out = String((e.stdout || "") + (e.stderr || ""));
      exitCode = typeof e.status === "number" ? e.status : 1;
    }
    const RED_RUN = /^FAIL: a suite is red inside this run\b/m;
    const RED_SUITE = /^  (site harness|phase3|phase9|back end): (\d+) failing(?: — (.*))?$/gm;
    if (RED_RUN.test(out)) {
      const named = [...out.matchAll(RED_SUITE)].map(m => m[1] + ": " + m[2] + " failing" + (m[3] ? " — " + m[3] : ""));
      section5 = { skipped: "a suite is red inside the drift checker's run, so its pass-counts are not figures to check anything against ("
        + (named.length ? named.join("; ") : "no suite named") + ")" };
      fail("SECTION 5 — NOT RUN: a suite is red inside the drift checker's run",
        ["Its pass-counts are not figures to check a Monday document against, so nothing in",
         "section 5 was checked. Make the suite green, then run this again."]
          .concat(named.length ? named.map(n => "    " + n)
            : ["    the drift checker said a suite is red and named none - run it on its own"]));
    } else {
      /* ONLY THE "Re-derived, not inherited:" BLOCK IS READ, so a figure quoted
         further down the drift checker's output cannot pass for a total, and
         the lines are COUNTED rather than de-duplicated, so two suites that
         happen to share a total are not skipped. A run that printed no such
         block - a site harness, lint or typecheck that crashed the drift
         checker before it got there - is skipped, and says so. */
      const at = out.indexOf("Re-derived, not inherited:");
      const block = at < 0 ? "" : out.slice(at).split(/\n\s*\n/)[0];
      const totals = [...block.matchAll(/^\s{2}\S[^\n]*?\s(\d{2,5}) pass/gm)].map(m => +m[1]);
      if (totals.length === 4) live = new Set(totals);
      else section5 = { skipped: "the four suite totals could not be derived - run the drift checker on its own and read its first four lines"
        + (at < 0 ? " (it exited " + exitCode + " and printed no \"Re-derived, not inherited:\" block)"
                  : " (its \"Re-derived, not inherited:\" block carried " + totals.length + " pass lines, not four)") };
    }
  } else {
    section5 = { skipped: "--no-figures was passed" };
  }
  if (!section5) {
    section5 = { live: [...live].sort((a, b) => a - b), docs: [] };
    for (const d of HUB_DOCS) {
      const p = path.join(SNAP_DIR, d.file);
      if (!fs.existsSync(p)) { section5.docs.push({ ...d, missing: true }); continue; }
      const text = fs.readFileSync(p, "utf8");
      const lines = text.split(/\r?\n/);
      const r = classify.classifyText(text, live);
      const claims = [], chronicle = [];
      for (const row of r.failures) {
        (d.policy === "chronicle" || paragraphDisclaims(lines, row.line - 1) ? chronicle : claims).push(row);
      }
      section5.docs.push({ ...d, claims, chronicle, review: r.review.length, retired: r.retired });
    }
    const liveWrong = section5.docs.filter(d => d.claims && d.claims.length);
    if (liveWrong.length) {
      fail("SECTION 5 — a Monday document asserts a stale harness figure as current fact",
        liveWrong.flatMap(d => ["    " + d.name].concat(d.claims.map(c =>
          "        line " + c.line + "   figure(s) " + c.figures.join(", ") + "\n            " + c.text))));
    }
  }
}

/* --- the report --------------------------------------------------------- */

console.log("CAPREBATE SIGN-OFF REGISTER CHECK");
console.log("Snapshot   " + SNAP_DIR);
console.log("           captured " + capturedAt.toISOString() + " by " + (meta.capturedBy || "(unrecorded)")
  + " on " + (meta.machine || "(unrecorded machine)") + " — " + ageHours.toFixed(1) + "h old");
console.log("Manifest   " + path.relative(ROOT, MANIFEST) + " v" + manifest.version
  + ", written " + manifest.written + " by " + manifest.writtenBy);
console.log("");
console.log("WHAT THIS CHECK CANNOT SEE — say this alongside any green run:");
console.log("  · Whether a register ENTRY is well written, complete, or answerable. It");
console.log("    checks that the item is named, not that the page is any good.");
console.log("  · Anything about SUBITEMS. They are not returned by an item-level fetch and");
console.log("    the board's own standing blind spot is unchanged by this file.");
console.log("  · Whether an item at \"" + AWAITING + "\" is genuinely finished. CHECK 4");
console.log("    asks only whether the board shows ANY evidence - one update is enough to");
console.log("    pass it, and an update saying nothing useful passes it too.");
console.log("  · Whether the entry/mention judgement in the manifest is right. It is a");
console.log("    recorded human decision, re-checked only in the sense that an id nobody");
console.log("    has classified fails the run.");
console.log("");

console.log("CHECK 1 — the board, tallied in code");
console.log("  items_count " + board.itemsCount + "; statuses tally to " + tallySum
  + (tallySum === board.itemsCount ? "  ✔ they agree" : "  ✘ THEY DISAGREE"));
for (const [s, n] of [...tally.entries()].sort((a, b) => b[1] - a[1])) {
  console.log("    " + String(n).padStart(4) + "  " + s);
}
console.log("");

console.log("CHECK 2 — the " + awaitingIds.length + " items at \"" + AWAITING + "\", against the three registers");
for (const r of manifest.registers) {
  const d = derived[r.key];
  console.log("    " + d.name);
  console.log("      " + d.entriesTotal + " entries covering " + d.boardItemsCovered
    + " board items; " + d.awaiting + " of them at \"" + AWAITING + "\"");
  const others = r.entries.filter(e => e.expect).map(e => e.ref + " (" + e.expect + ")");
  if (others.length) console.log("      declared NOT awaiting, on purpose: " + others.join("; "));
}
const housedTotal = [...housedBy.keys()].length;
console.log("    housed in exactly one register: " + housedTotal + " of " + awaitingIds.length);
console.log("");

console.log("CHECK 3 — what the registers say about their own size");
for (const c of liveClaims) {
  const d = derived[c.register];
  const bad = wrongClaims.find(w => w === c || (w.register === c.register && w.line === c.line && w.kind === c.kind));
  console.log("    " + (bad ? "✘" : "✔") + " " + d.name + " line " + c.line + "  [" + c.kind + "] says "
    + c.nums.join(" / ") + (bad ? "  — derived " + bad.expect.join(" / ") : ""));
}
if (superseded.length) {
  console.log("    superseded by a later claim of the same kind, and NOT failed (" + superseded.length + "):");
  for (const c of superseded) console.log("        " + derived[c.register].name + " line " + c.line
    + "  [" + c.kind + "] " + c.nums.join(" / "));
}
console.log("    explicitly retired by the sentence they sit in (\"...stated was thirteen\") and ignored: " + retiredClaims);
console.log("    count-shaped sentences this check does NOT adjudicate (" + notAdjudicated.length + "):");
for (const c of notAdjudicated) console.log("        " + derived[c.register].name + " line " + c.line + "  " + c.text);
console.log("");

console.log("CHECK 4 — evidence on the awaiting items");
console.log("  " + awaitingIds.length + " checked for an update, a file or a document; "
  + noEvidence.length + " have none of the three");
console.log("");

console.log("SECTION 5 — what the Monday documents assert about the harness figures");
if (section5.skipped) {
  console.log("  NOT RUN: " + section5.skipped);
  console.log("  Not the same as passing. Nothing below was checked.");
} else {
  console.log("  live suite totals: " + section5.live.join(", "));
  for (const d of section5.docs) {
    if (d.missing) { console.log("    ? " + d.name + " — not in the snapshot, so NOT checked"); continue; }
    console.log("    " + (d.claims.length ? "✘" : "✔") + " " + d.name
      + "  [" + d.policy + (d.why ? ": " + d.why : "") + "]"
      + "  live claims wrong: " + d.claims.length
      + " · chronicle figures: " + d.chronicle.length
      + " · no marker either way: " + d.review);
  }
  console.log("  A figure in PHASE HISTORY, or inside a block that disclaims quotation, is a");
  console.log("  record and is never failed. Everything else in these documents is a claim.");
}
console.log("");

if (!failures.length) {
  console.log("OK — every item at \"" + AWAITING + "\" appears in exactly one register, every");
  console.log("register's stated count matches the board, every awaiting item shows some");
  if (section5.skipped) {
    /* NOT "no Monday document asserts a stale figure" when nothing looked. */
    console.log("evidence. SECTION 5 WAS NOT RUN, so whether a Monday document asserts a stale");
    console.log("harness figure as fact was NOT checked: " + section5.skipped + ".");
  } else {
    console.log("evidence, and no Monday document asserts a stale harness figure as fact.");
  }
  process.exit(0);
}
console.log("FAILURES (" + failures.length + ")");
console.log("");
for (const f of failures) {
  console.log("  " + f.check);
  for (const l of f.lines) console.log("  " + l);
  console.log("");
}
console.log("FAIL: " + failures.length + " check" + (failures.length === 1 ? "" : "s") + " failed.");
process.exit(1);
