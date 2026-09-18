#!/usr/bin/env node
/* ---------------------------------------------------------------------------
   caprebate-figure-drift.cjs — built by the Phase 78 sweep, 4 September 2026 (the sweep ran as the section labelled Phase 76 and renumbered itself to 78 on completion, per its own convention).

   WHY THIS EXISTS.

   Three sweeps running have found the same defect: documents quoting a harness
   pass-count that was true when it was written and is not true now. Phase 76
   found FOUR documents quoting THREE different figures (437, 437, 376, 477)
   when the truth was 500. Phase 78 — the sweep that built this — found four more quoting 500,
   376, 376 and 376 when the truth was 503. Each sweep corrects them by hand and
   the next sweep finds a fresh crop, because a figure copied into prose has no
   link back to the thing it describes.

   This closes that loop. It RUNS the three suites, then greps the live corpus
   for pass-counts stated as current fact and reports any that disagree.

   WHAT IT DELIBERATELY DOES NOT DO. It does not edit anything. A stale figure
   is sometimes a correct historical record ("Phase 67 took the harness 392 →
   437"), and only a reader can tell the difference. So it prints the line and
   lets a person judge, and it tries hard not to waste that person's attention:
   lines that look like dated history are reported separately from lines that
   read as claims about the present.

   USAGE
     node 03-app/caprebate-figure-drift.cjs          (run the suites, compare)
     node 03-app/caprebate-figure-drift.cjs --fast   (skip the suites, use
                                                        --expect values instead)
     ... --expect 503,358,142,100          (site,phase3,phase9,backend)
     FOUR numbers, not three. A three-number invocation is REFUSED, by name,
     rather than derived - see the note on the fourth truth below.
     ... --twins-only                      (only run section 0, the stray-copy guard)
     ... --twin-root <dir>                 (run section 0 under a scratch copy of
                                            the tree; the negative control)

   EXIT CODE: 1 if any present-tense figure disagrees, or (since 17 Sep 2026)
   any of the seven retired module copies has reappeared in 03-app/, else 0. Suitable for a
   pre-flight check before anything external goes out.
   --------------------------------------------------------------------------- */

const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const APP_DIR = __dirname;
const ROOT = path.join(APP_DIR, "..");                 /* the working folder */
const DESKTOP = path.join(ROOT, "..");                  /* Desktop root      */

const argv = process.argv.slice(2);
const FAST = argv.includes("--fast");
const expectArg = (argv.find(a => a.startsWith("--expect=")) || "").split("=")[1]
  || (argv[argv.indexOf("--expect") + 1] || "");

/* --self-test — PHASE 113j. This file had no self-test of its own; its one
   negative control was "--fast --expect 999,998,997,996 must exit 1", which
   proves the check CAN fail and says nothing about what it cannot see. The
   blindness it was last found with - a marker on the line above its figure -
   lives in the classifier, so the cases live there too and this runs them. It
   derives no truth and walks no files: it takes a second, and it exits 1 if
   any case does not land where it must. */
/* --- 0. THE SEVEN TWIN FILES — PHASE 132f, 16 September 2026 --------------

   WHY THIS IS HERE. The file index said the six Module-*.md specifications
   and the fixture taxonomy CSV in 03-app/ were HARD LINKS into
   02-modules-and-build-prep/, one file under two names that could not
   diverge, and it retired every comparison of them on that ground. On the
   Mac copy of this tree on 16 September 2026 `stat` showed all seven pairs
   with DIFFERENT inodes and a link count of 1: fourteen separate files.
   OneDrive does not carry a hard link any more than it carries a junction,
   and Phase 129's edit to Module-00 had already broken that pair on the
   other machine. They were byte-identical that day, and nothing kept them so.

   WHICH COPY IS LIVE. 02-modules-and-build-prep/ is the copy that is edited
   and signed: the Developer Spec sends the tax adviser there, the
   remediation register and consolidated schema cite it, and the Phase 132
   change map lists 03-app/Module-00 as "(copy)". The 03-app copies are what
   caprebate-regression.cjs actually reads (suite B and the taxonomy). So a
   difference means the harness is testing text the adviser is not signing,
   or the reverse. This comparison CAN fail, and fails the whole run (exit 1).

   It runs in every mode, --fast included, before any suite, because it
   costs milliseconds. `--twins-only` runs it alone; `--twin-root <dir>`
   compares a scratch copy of the tree instead of this one (the negative
   control). --self-test proves it on throwaway files in the OS temp folder.

   CORRECTED, PHASE 132g, 16 September 2026. "The 03-app copies are what
   caprebate-regression.cjs actually reads" was true on 16 September and is
   no longer: the harness (suite B and the taxonomy) and the phase9 cost-model
   test now read 02-modules-and-build-prep/, and no script reads the 03-app/
   copies. A scratch copy of the tree with the seven 03-app/ files removed
   passed with the same counts. THIS COMPARISON CAN BE REMOVED once Lakhbir has
   deleted the seven 03-app/ copies - Claude does not permanently delete files,
   so it stays, and keeps working, until he has. After that deletion it would
   report all seven as MISSING from 03-app/, which is the signal to remove it. */
/* RETIRED 17 September 2026 (Phase 133 sweep). Lakhbir deleted the seven 03-app/
   copies that day, after they had been renamed DELETE-. The byte comparison had
   nothing left to compare, and reported all seven MISSING, which this comment
   said was the signal to remove it. It is replaced by a STRAY-COPY GUARD: the
   one thing that can still go wrong is a copy reappearing in 03-app/ (a sync
   from the Acer copy, which still holds them, or a restore from the bin) and
   drifting away from the live one unseen. So the run fails if any of the seven
   names, with or without the DELETE- prefix, exists in 03-app/. The live copies
   in 02-modules-and-build-prep/ are read by the harness and phase9 directly. */
const TWIN_FILES = [
  "Module-00-Master-Engine-Specification.md",
  "Module-01-Care-Homes-Specification.md",
  "Module-02-Dental-Specification.md",
  "Module-03-Supported-Living-Specification.md",
  "Module-04-GP-Primary-Care-Specification.md",
  "Module-05-Private-Hospitals-Clinics-Specification.md",
  "Caprebate-Fixture-Taxonomy-v1.csv"
];
function compareTwins(root, names) {
  const live = path.join(root, "02-modules-and-build-prep");
  const copy = path.join(root, "03-app");
  const problems = [];
  for (const f of names) {
    if (!fs.existsSync(path.join(live, f))) problems.push(f + ": MISSING from 02-modules-and-build-prep/ (the live copy)");
    for (const n of [f, "DELETE-" + f])
      if (fs.existsSync(path.join(copy, n))) problems.push(n + ": a STRAY COPY is back in 03-app/ - delete it; the live copy is in 02-modules-and-build-prep/");
  }
  return problems;
}
/* WHAT THE WALK NEVER READS. The three comments beside the corpus walk, further down this file, give the
   reason for each entry: a capture is not a claim. Declared here because the self-test below reads it. */
const SKIP_DIR = /[\\/](_archive|08-monday-doc-exports|signoff-snapshot|node_modules|\.git)[\\/]|[\\/]04-phase-work[\\/][^\\/]+[\\/]proofs[\\/]/;

function twinSelfTest() {
  const os = require("os");
  console.log("\nSTRAY-COPY GUARD SELF-TEST — a clean tree must pass, and a returned copy or a lost live copy must fail");
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "caprebate-stray-selftest-"));
  const mk = (d) => fs.mkdirSync(path.join(tmp, d), { recursive: true });
  mk("02-modules-and-build-prep"); mk("03-app");
  const names = ["a.md", "b.csv"];
  for (const n of names) fs.writeFileSync(path.join(tmp, "02-modules-and-build-prep", n), "live " + n + "\n");
  const cases = [];
  cases.push(["a clean tree is accepted", compareTwins(tmp, names).length === 0]);
  fs.writeFileSync(path.join(tmp, "03-app", "a.md"), "old\n");
  const back = compareTwins(tmp, names);
  cases.push(["a copy back in 03-app is caught and named", back.length === 1 && /a\.md: a STRAY COPY/.test(back[0])]);
  fs.renameSync(path.join(tmp, "03-app", "a.md"), path.join(tmp, "03-app", "DELETE-a.md"));
  const renamed = compareTwins(tmp, names);
  cases.push(["a DELETE- copy back in 03-app is caught too", renamed.length === 1 && /DELETE-a\.md: a STRAY COPY/.test(renamed[0])]);
  fs.unlinkSync(path.join(tmp, "03-app", "DELETE-a.md"));
  fs.unlinkSync(path.join(tmp, "02-modules-and-build-prep", "b.csv"));
  const lost = compareTwins(tmp, names);
  cases.push(["a lost live copy is caught, not skipped", lost.length === 1 && /b\.csv: MISSING from 02-modules/.test(lost[0])]);

  /* PHASE 133e — THE WALK SKIPS A PHASE'S proofs/ FOLDER, AND ONLY THAT FOLDER.
     A phase saves the output of the commands it ran; those files quote figures rather than assert
     them, and two of them are this checker's own output. The prose beside them is still read. */
  const sep = path.sep;
  const skipped = (p2) => SKIP_DIR.test(p2 + sep);
  cases.push(["a phase's proofs/ folder is skipped",
    skipped(`${sep}04-phase-work${sep}phase133d${sep}proofs${sep}close${sep}drift.txt`)]);
  cases.push(["the phase record beside it is NOT skipped",
    !skipped(`${sep}04-phase-work${sep}phase133d${sep}proof-record.md`)]);
  cases.push(["a proofs/ folder outside 04-phase-work is NOT skipped",
    !skipped(`${sep}09-app${sep}proofs${sep}something.md`)]);
  cases.push(["the module suites under 04-phase-work are NOT skipped",
    !skipped(`${sep}04-phase-work${sep}phase9${sep}caprebate-cost-model.md`)]);
  let ok = 0;
  for (const [name, good] of cases) { console.log((good ? "  ✔ " : "  ✘ ") + name); if (good) ok++; }
  console.log("\n" + ok + " of " + cases.length + " guard cases held" + (ok === cases.length ? "." : " - " + (cases.length - ok) + " FAILED."));
  return ok === cases.length;
}

if (argv.includes("--self-test")) {
  const { selfTest } = require(path.join(__dirname, "caprebate-figure-classify.cjs"));
  const classifierOk = selfTest();
  const twinsOk = twinSelfTest();
  process.exit(classifierOk && twinsOk ? 0 : 1);
}

const twinRootArg = argv.indexOf("--twin-root");
const TWIN_ROOT = twinRootArg >= 0 && argv[twinRootArg + 1] ? path.resolve(argv[twinRootArg + 1]) : ROOT;
const twinProblems = compareTwins(TWIN_ROOT, TWIN_FILES);
console.log("Module files (02-modules-and-build-prep/ is the only copy; the 03-app/ copies were deleted 17 Sep 2026 and must not return)" +
  (TWIN_ROOT !== ROOT ? " — compared under " + TWIN_ROOT : "") + ":");
if (twinProblems.length) {
  for (const p of twinProblems) console.log("  ✘ " + p);
  console.log("FAIL: " + twinProblems.length + " problem(s) with the module files - see above.\n");
} else {
  console.log("  all " + TWIN_FILES.length + " live in 02-modules-and-build-prep/, none back in 03-app/\n");
}
if (argv.includes("--twins-only")) process.exit(twinProblems.length ? 1 : 0);

/* --- 1. the truth ------------------------------------------------------- */

function runSite() {
  const out = execFileSync(process.execPath, [path.join(APP_DIR, "caprebate-regression.cjs")],
    { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  const m = out.match(/pass\s+(\d+)\s+fail\s+(\d+)\s+xfail\s+(\d+)/);
  if (!m) throw new Error("could not parse the site harness total");
  return { pass: +m[1], fail: +m[2], xfail: +m[3] };
}

/* node --test prints its totals behind a multi-byte information glyph, so an
   anchored "^. pass" matches nothing. Match unanchored. */
function runNodeTest(dir) {
  let out;
  try {
    out = execFileSync(process.execPath, ["--test", "--experimental-strip-types"],
      { cwd: dir, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  } catch (e) { out = (e.stdout || "") + (e.stderr || ""); }
  const pass = /pass (\d+)/.exec(out);
  const fail = /fail (\d+)/.exec(out);
  const files = fs.readdirSync(dir).filter(f => /\.test\.(ts|cjs|js|mjs)$/.test(f));
  return { pass: pass ? +pass[1] : null, fail: fail ? +fail[1] : null, files: files.length, failed: failingTestNames(out) };
}

/* THE NAME OF A RED TEST, KEPT RATHER THAN THROWN AWAY. Added by CRM 9 of 10,
   12 September 2026. Until then a test that failed inside this run left nothing
   behind but a pass-count one short: on 12 September CRM 8 of 10 saw the back end
   count 611 where 612 exist, and nobody could name the test, because the output
   that named it was parsed for two numbers and discarded. It was a raw-text
   search in test/crm.test.ts matching a seeded 0.3 inside a timestamp's
   milliseconds, about one run in eighty-five. `node --test` marks a failing test
   with a cross and its duration; every such line is kept, once. */
function failingTestNames(out) {
  const names = [];
  for (const line of String(out || "").split(/\r?\n/)) {
    const m = /^\s*✖ (.+?) \([\d.]+m?s\)\s*$/.exec(line);
    if (m && !names.includes(m[1])) names.push(m[1]);
  }
  return names;
}

/* THE FOURTH TRUTH — THE BACK END. Added by Phase 113e, 9 September 2026, and
   it is the third time this file has been found blind in the same way. Both
   accounts above describe a hole; this one describes a MISSING WALL. `truth`
   was built from three suites, so every figure in the tree that quotes the back
   end's pass-count was compared against nothing at all and could never fail. It
   is also the suite that MOVES: 100, 178, 293, 310, 342 in five consecutive
   phases, and 378 when this was written - which is to say the phase prompt that
   asked for this was itself already one figure out of date by the time it ran.

   WHETHER TO RUN THE WHOLE `npm run check` OR ONLY THE TESTS — DECIDED, AND THE
   REASON MATTERS MORE THAN THE ANSWER. We run THE WHOLE CHECK: lint:sql, then
   the typecheck, then the tests, in that order, failing on the first. Measured
   on the Mac, 9 September 2026: the tests alone take about five seconds and the
   whole check about seven, so the honest saving is under two seconds and it
   buys a real thing. `npm run check` is what a person runs and what the
   documents tell a developer to run, so it is the number they will see. And the
   ordering is the point: because npm chains with `&&`, a tree whose SQL lint or
   typecheck is red never reaches the test runner and prints no pass total at
   all. That is not a reason to skip them - it is the reason to keep them. A
   pass-count harvested from a package that does not type-check is exactly the
   kind of figure this file exists to distrust, so when a step fails we THROW,
   loudly, naming the step, rather than quietly reporting the tests' number.

   WE DO NOT SHELL OUT TO npm, AND THAT IS NOT A SHORTCUT. COORDINATES records
   that node is NOT on PATH on the Acer - it is a portable install - so npm is
   not reliably on PATH either, and `execFileSync("npm", ...)` additionally
   needs `npm.cmd` on Windows. So we run npm's three steps ourselves through
   process.execPath, which is guaranteed. The risk that creates is drift: if
   someone edits the `check` script, this function would silently keep running
   the old three steps and go on reporting a green number. So it READS
   package.json and refuses to run if `check` is no longer the three steps it
   expects. A check that quietly stops covering something is the failure this
   phase is about; it should not be reintroduced by the fix for it. */
function runBackendCheck(dir) {
  const pkg = JSON.parse(fs.readFileSync(path.join(dir, "package.json"), "utf8"));
  const norm = t => String(t || "").replace(/\s+/g, " ").trim();
  const EXPECTED_CHECK = "npm run lint:sql && npm run typecheck && npm run test";
  if (norm(pkg.scripts && pkg.scripts.check) !== EXPECTED_CHECK) {
    throw new Error(
      "09-app/backend package.json `check` is no longer the three steps this file runs.\n" +
      "  expected: " + EXPECTED_CHECK + "\n" +
      "  found:    " + norm(pkg.scripts && pkg.scripts.check) + "\n" +
      "  Update runBackendCheck() in 03-app/caprebate-figure-drift.cjs to match, or the\n" +
      "  back end's figure stops meaning what the documents say it means.");
  }
  const step = (label, args) => {
    try {
      return execFileSync(process.execPath, args,
        { cwd: dir, encoding: "utf8", maxBuffer: 64 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"] });
    } catch (e) {
      /* stdout and stderr arrive as two separate strings, so a plain tail of the
         two concatenated shows whichever was longer and not whichever mattered —
         which on the first run of this printed seven of the typecheck's
         documented flag artefacts and hid the one real error underneath them.
         So pull out the verdict lines instead, and drop the artefacts by their
         own path, exactly as tools/typecheck.cjs already labels them. */
      const all = String((e.stdout || "") + "\n" + (e.stderr || "")).split(/\r?\n/);
      const verdict = all.filter(l => /FAILED|error TS\d+|✗|refus/i.test(l)
                                      && !/04-phase-work/.test(l));
      throw new Error("the back end's `" + label + "` step failed, so there is no pass-count to\n" +
        "  compare the corpus against. Fix it, then re-run this. Run `npm run check` in\n" +
        "  09-app/backend to see it in full.\n" +
        (verdict.length ? verdict : all.filter(l => l.trim())).slice(-14).join("\n"));
    }
  };
  step("lint:sql", [path.join(dir, "tools", "lint-sql.cjs")]);
  step("typecheck", [path.join(dir, "tools", "typecheck.cjs")]);
  /* `npm test` is `node --test test/*.test.ts`, whose glob the SHELL expands.
     We enumerate the same files instead, which also keeps the .bak-phaseNN
     snapshots out - Phase 102 recorded a glob from the project root silently
     running thirteen of them. The totals still arrive behind the multi-byte
     glyph, so match unanchored exactly as runNodeTest does. */
  const testDir = path.join(dir, "test");
  const files = fs.readdirSync(testDir).filter(f => /\.test\.ts$/.test(f)).sort();
  if (!files.length) throw new Error("no *.test.ts files found in 09-app/backend/test");
  let out;
  try {
    out = execFileSync(process.execPath, ["--test", ...files.map(f => path.join("test", f))],
      { cwd: dir, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  } catch (e) { out = (e.stdout || "") + (e.stderr || ""); }
  const pass = /pass (\d+)/.exec(out);
  const fail = /fail (\d+)/.exec(out);
  if (!pass) throw new Error("could not parse the back end's pass total from `node --test`");
  return { pass: +pass[1], fail: fail ? +fail[1] : null, files: files.length, failed: failingTestNames(out) };
}

let truth;
if (FAST) {
  const given = (expectArg || "").split(",").map(n => parseInt(n, 10));
  /* THE NEGATIVE CONTROL MUST NOT SILENTLY NARROW. Three numbers used to be the
     whole world. Now they are three quarters of it, and deriving the fourth --
     or defaulting it -- would leave the back end uncovered while the run still
     exited 0. So a three-number invocation is REFUSED, and the message names
     what is missing rather than saying "wrong number of arguments". */
  if (given.length === 3 && given.every(Number.isFinite)) {
    console.error(
      "--expect now takes FOUR numbers, not three, and the missing one is THE BACK END\n" +
      "(09-app/backend, `npm run check`). Phase 113e added it as the fourth derived truth\n" +
      "on 9 September 2026 because it is the suite that moves most and nothing was\n" +
      "watching it. Deriving it for you would put the hole straight back, so this is\n" +
      "refused instead.\n" +
      "  --expect site,phase3,phase9,backend      e.g. --expect 503,358,142,100");
    process.exit(2);
  }
  if (given.length !== 4 || !given.every(Number.isFinite)) {
    console.error("--fast needs --expect site,phase3,phase9,backend  e.g. --expect 503,358,142,100");
    process.exit(2);
  }
  const [s, p3, p9, be] = given;
  truth = { site: { pass: s }, phase3: { pass: p3 }, phase9: { pass: p9 }, backend: { pass: be } };
} else {
  truth = {
    site: runSite(),
    phase3: runNodeTest(path.join(ROOT, "04-phase-work", "phase3")),
    phase9: runNodeTest(path.join(ROOT, "04-phase-work", "phase9")),
    backend: runBackendCheck(path.join(ROOT, "09-app", "backend"))
  };
}

/* THE PROJECT TOTAL IS ALSO A LIVE FIGURE, and it has to be in this set now that
   the matcher can see comma-grouped numbers. The corpus states it constantly -
   "1,806 passing assertions" - and it is the figure the Developer Spec hands to a
   developer. Without it here, every correct statement of the total would read as
   a disagreement. (Phase 113g, 9 September 2026.) */
const TOTAL = truth.site.pass + truth.phase3.pass + truth.phase9.pass + truth.backend.pass;
const LIVE = new Set([truth.site.pass, truth.phase3.pass, truth.phase9.pass, truth.backend.pass, TOTAL]);

console.log("Re-derived, not inherited:");
console.log("  site harness  " + truth.site.pass + " pass"
  + (truth.site.fail !== undefined ? " / " + truth.site.fail + " fail / " + truth.site.xfail + " xfail" : ""));
console.log("  phase3        " + truth.phase3.pass + " pass"
  + (truth.phase3.files ? " across " + truth.phase3.files + " files" : ""));
console.log("  phase9        " + truth.phase9.pass + " pass"
  + (truth.phase9.files ? " across " + truth.phase9.files + " files" : ""));
console.log("  PROJECT TOTAL " + TOTAL.toLocaleString("en-GB") + " passing assertions");
console.log("  back end      " + truth.backend.pass + " pass"
  + (truth.backend.files ? " across " + truth.backend.files + " files, whole `npm run check`" : ""));
console.log("");

/* A RED SUITE IS NOT A FIGURE. CRM 9 of 10, 12 September 2026. A suite that failed
   inside this run reports a pass-count that no document should hold, and comparing
   the corpus against it would send somebody to "correct" true figures into wrong
   ones. So the failing tests are NAMED and the run stops, exit 1, before the corpus
   is read. The --fast negative control runs no suite and is unaffected. */
const redSuites = [["site harness", truth.site], ["phase3", truth.phase3], ["phase9", truth.phase9], ["back end", truth.backend]]
  .filter(([, t]) => typeof t.fail === "number" && t.fail > 0);
if (redSuites.length) {
  console.log("FAIL: a suite is red inside this run, so its pass-count is not a figure to compare anything against.");
  for (const [label, t] of redSuites) {
    console.log("  " + label + ": " + t.fail + " failing" + (t.failed && t.failed.length ? " — " + t.failed.join(" | ") : " — see that suite's own output"));
  }
  process.exit(1);
}

/* --- 2. what the corpus says -------------------------------------------- */

/* 08-monday-doc-exports holds FROZEN exports of Monday documents (Phase 87,
   5 Sep 2026). They are dated historical records, not live claims, and at
   least one records, in the present tense, a moment when the harness was
   legitimately red. Editing an export to satisfy this checker would falsify
   it, so the folder is skipped exactly as _archive is.
   (Phase 90, 5 Sep 2026.) */
/* 03-app/signoff-snapshot HOLDS CAPTURED COPIES OF THE MONDAY DOCUMENTS, and it
   is skipped for exactly the reason 08-monday-doc-exports is: it is a capture,
   not a claim. Phase 113g put it there so a check that cannot call Monday can
   still read the three sign-off registers, and the moment it existed this
   walker went from green to 33 failures — every one of them a figure inside a
   phase record in PHASE HISTORY or a superseded note in the action plan.
   EDITING A CAPTURE TO SATISFY THIS CHECKER WOULD FALSIFY IT, which is the
   argument already made above for the exports folder. Those documents are read
   deliberately, under their own live-or-chronicle policy, by
   `caprebate-signoff-register-check.cjs`, which is where that judgement
   belongs. (Phase 113g, 9 September 2026.) */
/* 04-phase-work/<phase>/proofs/ HOLDS THE CAPTURED OUTPUT OF THE COMMANDS A PHASE
   RAN, and it is skipped for exactly the reason the two folders above are: it is
   a recording, not a claim. Phase 133d saved its close there, and among those
   files are this checker's OWN output and its negative control — so this walker
   was reading back every figure it had itself printed, and quoting a figure is
   not asserting one. That took it from green to 627 findings in two files, and
   it would do the same to every phase that ever saves its proof. EDITING A
   CAPTURE TO SATISFY THIS CHECKER WOULD FALSIFY IT, which is the argument
   already made twice above. A phase's PROSE still gets read: only `proofs/` is
   skipped, so `proof-record.md` beside it is checked exactly as before.
   (Phase 133e, 17 September 2026.) */
/* SKIP_DIR is declared near the top of this file, because the stray-copy self-test reads it and runs
   before this point. The reasoning for each folder it skips is the three comments directly above. */
const SKIP_FILE = /\.bak(-[\w.]+)?$|\.pre-[\w.]+\.bak$/;
const READ_EXT = /\.(md|html|txt|cjs|js|ts)$/;

function walk(dir, acc) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return acc; }
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (SKIP_DIR.test(p + path.sep)) continue;
    if (e.isDirectory()) walk(p, acc);
    else if (READ_EXT.test(e.name) && !SKIP_FILE.test(e.name)) acc.push(p);
  }
  return acc;
}

/* --file <path>, REPEATABLE — PHASE 113j, 10 September 2026. Read ONLY the named
   files, and read them even where the walk below would skip them: a .bak copy,
   an archived file. It exists to reproduce a finding against the exact text it
   was found in. The stale headline that sat green on 10 September 2026 lives
   on in README-file-index.md.bak-phase113i, which the walk skips by design, so
   without this the reproduction would have had to use a copy of the checker
   rather than the checker. Nothing else changes: the truth is still derived
   (or given by --fast --expect), and the same classifier reads the text. */
const ONLY = [];
for (let i = 0; i < argv.length; i++) if (argv[i] === "--file" && argv[i + 1]) ONLY.push(path.resolve(argv[i + 1]));

const files = ONLY.length ? ONLY.slice() : walk(ROOT, []);
/* Phase 90 (5 Sep 2026) moved the five live spec documents OFF the Desktop root
   into the numbered folders, where walk() above already finds them. Only
   `Caprebate site.html` is still loose at the root - the site harness reads it
   from there and moving it is a code change, not a filing one. This sweep is
   kept so anything left at, or later dropped onto, the root is still read. */
if (!ONLY.length) for (const f of fs.readdirSync(DESKTOP)) {
  if (/^Caprebate/.test(f) && READ_EXT.test(f) && !SKIP_FILE.test(f)) files.push(path.join(DESKTOP, f));
}

/* CLASSIFYING A FIGURE — THE RULES MOVED OUT OF THIS FILE ON 9 SEPTEMBER 2026.

   PASS_RE, PRESENT_MARKER, COMMAND_ON_LINE, the phase-close caption exemption,
   the retired-figure test and the line-by-line reading itself now live in
   `caprebate-figure-classify.cjs`, in the same folder, WITH ALL OF THEIR
   REASONING INTACT. Read that file before you change any of them: every
   paragraph in it records a way this check was found blind, on 6, 8 and
   9 September 2026.

   Nothing about the reading changed in the move. What moved and why is written
   at the top of that file: a second check — `caprebate-signoff-register-check.cjs`
   — reads the Monday documents this walker cannot reach, and two copies of a
   tense heuristic drift apart. There is now exactly one copy. */
const { classifyText } = require(path.join(__dirname, "caprebate-figure-classify.cjs"));

const failures = [];
const review = [];
let retired = 0;

for (const f of files) {
  let text;
  try { text = fs.readFileSync(f, "utf8"); } catch { continue; }
  const r = classifyText(text, LIVE);
  retired += r.retired;
  const rel = path.relative(DESKTOP, f);
  for (const x of r.failures) failures.push({ file: rel, ...x });
  for (const x of r.review) review.push({ file: rel, ...x });
}
/* --- 3. report ---------------------------------------------------------- */

function show(title, rows) {
  console.log(title + "  (" + rows.length + ")");
  if (!rows.length) { console.log("  none\n"); return; }
  for (const r of rows) {
    console.log("  " + r.file + ":" + r.line + "   figure(s): " + r.figures.join(", "));
    console.log("      " + r.text);
  }
  console.log("");
}

show("ASSERTED IN THE PRESENT TENSE AND WRONG — fix these", failures);
show("NO MARKER EITHER WAY — usually a phase's own record; read before changing", review);
console.log("Bound to an explicit old-value marker (was / →) and ignored: " + retired + "\n");

if (failures.length) {
  console.log("FAIL: " + failures.length + " line(s) assert a harness figure, in the present tense, that is not the current one.");
  process.exit(1);
}
/* Section 0, the stray-copy guard (the twin comparison until 17 Sep 2026), fails the run too. */
if (twinProblems.length) {
  console.log("FAIL: the figures are current, but section 0 found " + twinProblems.length + " module-file problem(s) - see the top of this output.");
  process.exit(1);
}
console.log("OK: nothing asserts a stale harness figure as current fact.");
