# Caprebate — the action plan

 **THIS IS THE DOCUMENT TO WORK FROM. **The phase prompts sit at the top, ready to copy and paste. **Since 4 October 2026 Lakhbir pastes them from the monday.com RUN SHEET** (the document on the CAPREBATE ACTION PLAN item), which holds the same phases at its very top and a short log of what each finished phase did at its end; this file is the full copy in OneDrive and is kept the same (rule 6 under "How the phases at the top of this document work"). Everything below them is the plan itself: what the business is, what is genuinely finished, what is stuck and on whom, the order to work in, and an honest list of what we do not know.

 **Where everything lives, since 25 September 2026: in files, and monday.com is gone.** On 25 September 2026 Lakhbir became a guest on the monday.com account that held this project, and every monday.com call began to fail ("the account admin must enable 'Public Hosted MCP'"). He decided to drop monday.com that day. **Phase 151d exported everything it held, checked it complete, and made it files in `00-START-HERE/hub/`**, committed to the repository: this plan (`ACTION-PLAN.md`); `PHASE-HISTORY.md`, which records what every completed phase actually did and is an archive, not a runbook; the three live registers of everything waiting on a named person's signature (`FOR-THE-ACCOUNTANT.md`, `FOR-THE-SURVEYOR.md`, `FOR-THE-SOLICITOR-DPO-DEVELOPER.md`); the board, as `TRACKER.csv` (read `TRACKER.md`, and change it only with `node 03-app/caprebate-tracker.cjs`); the comments the board carried, as `COMMENTS-ARCHIVE.md`; the old monday.com questions document, as `QUESTIONS-BACKGROUND.md` (background only); and the lock, `CLAIM.md`. The exports themselves are kept unedited in `_archive/`. **Every open question and every answer is in the Word document Caprebate_Questions.docx**, in Lakhbir's OneDrive (Health Capital Allowances folder): the source of truth for questions and answers (Lakhbir, 22 September 2026), read and written as AMENDMENT 2 says. Where this plan says "the question that unblocks it", the question is in the Word document. **Where older text below says "the board", read the tracker; where it says a board item, read its row, found by the same id.**


---

# ▶ RUN THE NEXT PHASE — copy from here

 **How this works ****— you p****a****ste**** ****ONE**** block****. **Each phase below is **ex****a****ctly**** ****o****n****e** fenced block. Copy the whole of it into Claude and nothing else is needed: every phase prompt opens by telling Claude to come here and read THE STANDING INSTRUCTION before it does anything, and carries the four irreducible rules inline in case it cannot reach this document. **NEVER SPLIT A PHASE ACROSS TWO BLOCKS** — the preamble and the phase's own instructions go in the same fence, so one copy takes the whole thing. (Phase 109 was split in two until 8 September 2026; it is now 103a and merged.)


 **THE NEXT PHASE TO RUN IS ALWAYS THE FIRST ONE BELOW COORDINATES.** Run them straight down the page. **The number follows the position, not the other way round** — so a phase that has to run between two numbers that are already used takes a letter: the phase that must run after 103 and before 104 is **103a**, not 109. Renumber it when you place it; do not leave a high number sitting above a low one and expect the next reader to work out that it was deliberate.

 **A number is never re-used for a different phase**, and **a gap is normal** — finished phases delete themselves, so 102 and 103 are gone from this list and are recorded in PHASE HISTORY instead. **The sweep is always last**, and it renumbers itself forward each time it runs. The numbers are labels and an order, never a count.

---

## ★ THE STANDING INSTRUCTION — every phase does all of this, without being told. THREE BLOCKS: the thirteen points, then AMENDMENT 1 (steps 4A and 4B), then AMENDMENT 2 (the questions and answers live in the Word document). All three are the instruction.


 **This list is the same every time.** A phase that skips it is not finished, however well it did the thing it was named after. Most of the mess this board has accumulated came from phases that did their job and left the paperwork.

 **Rewritten for files on 25 September 2026 by Phase 151d, the day monday.com was dropped.** Only where things live changed: the claim is `hub/CLAIM.md`, retagging and new items are the tracker, a note on a tracker row is what "post an update on the item" meant, PHASE HISTORY and the registers are the hub files, and a file on disk is never re-attached anywhere. Every rule is word for word as it was. The monday.com wording is in the export in `_archive/`.

```text
BEFORE YOU START
1. CLAIM IT. git pull, then write this phase's name, this machine and the
   time in 00-START-HERE/hub/CLAIM.md, commit and PUSH before you start. A
   claim already there STOPS WORK: another phase is running, or one died
   without clearing it - ask Lakhbir. Set your own phase's tracker row to
   "Working on it", with this machine in its claimed_by. A stale claim blocks
   every other machine indefinitely - git has no file locking, that file is
   the lock.
2. RE-READ the top of this document AND the top of CAPREBATE QUESTIONS. Correct
   anything already wrong in them BEFORE you start, not as a closing step. Six
   sweeps running have found a document's own header contradicting its own body,
   twice from the previous phase's work one day old.
   THE COORDINATES BLOCK SITS DIRECTLY BELOW THIS ONE. Read it before your first
   write - it carries every id and path a phase needs, where everything lives,
   the checks, and the traps that have already cost work.

BEFORE YOU CLOSE - work every line of this

3. RETAG EVERY ITEM YOU TOUCHED, in the tracker:
     node 03-app/caprebate-tracker.cjs set <id> status "<label>"
   The status must say what is actually in the way NOW. Nine working labels, each naming its own unblocker, plus the claim state:
     Ready - Claude can build      something to build, nothing stopping it
     Ready - Lakhbir action        a person must appoint, buy, send, sign
     Built - awaiting sign-off     Claude is finished; a named person confirms
     Blocked - question            Claude cannot build until X is answered
     Blocked - licence or purchase needs money or a licence first
     Blocked - incorporation       needs the company to exist
     Blocked - needs live jobs     needs real clients; no work produces it
     Parked - deliberate           deferred on purpose, revisit on a trigger
     Done                          finished and IN FORCE, with evidence
     Working on it                 claimed, in progress - set by step 1 above

   THE RULE BEHIND THOSE LABELS, AND IT IS THE MOST IMPORTANT LINE HERE:
   IF A THING CAN BE BUILT BEFORE THE PERSON IT WAITS ON HAS ANSWERED, BUILD IT
   AND SWITCH IT OFF. Eleven engine readings sit coded, tested and inert for
   exactly this reason - the adviser gets a one-line change instead of a
   proposal. Only ever mark something Blocked when building is genuinely
   IMPOSSIBLE, not merely unconfirmed. "Waiting for sign-off" is NOT blocked.
   (Ten until 7 September 2026, when Phase 96 built the eleventh - the stamp
   duty reading, which had been written up and left unbuilt for exactly the
   reason this rule says not to.)

4. THE CARRY-FORWARD RULE. Anything you could not finish gets a home before you
   close. Prose is not a task, and a recommendation is also prose - if you
   recommend a change, make it. Every loose end goes to one of three places:
     - an existing later phase - add it to that prompt in terms, and say so;
     - a NEW numbered phase, written at the top of this document in the same
       copy-paste format, inserted BEFORE the sweep;
     - a question in CAPREBATE QUESTIONS, under the person who must answer it.
   A PHASE MAY NOT BE MARKED DONE WHILE ANYTHING IT DID NOT DO IS STILL ONLY A
   SENTENCE.

5. UPDATE THE TWO SIGN-OFF DOCUMENTS if you touched anything either professional
   has to approve: FOR THE ACCOUNTANT and FOR THE SURVEYOR, both in
   00-START-HERE/hub/. Add the entry, remove it, or re-word it. They are LIVE
   registers of what is waiting on a signature, and they go stale silently -
   nothing else in the tracker will tell you they are wrong. BOTH NOW EXIST -
   Phase 85 built them on 4 Sep 2026 and their files are in COORDINATES below.
   This step is no longer ahead of the facts; do it.

6. UPDATE CAPREBATE QUESTIONS if you opened or closed a question. Every question
   carries: a plain-English TITLE, what we think, a worked example, our
   recommendation, what it unblocks, and AN ANSWER BLOCK for the person to write
   in. If you answered one, write the answer into its block and date it.

7. CREATE A TRACKER ROW for any real gap that has none - right group, owner
   type set, status set, name under 255 characters:
     node 03-app/caprebate-tracker.cjs add --name ... --group ... --status ... --owner ...
   The tool refuses a label that does not exist and a name over 255
   characters. Read the row back all the same.

8. RE-DERIVE ANY FIGURE YOU QUOTE by running the thing that produces it. Never
   inherit a count from a phase record. Three sweeps found documents quoting
   stale pass-counts; one restructure published 46/36 when the truth was 48/34.
   AND RE-DERIVE THE PREMISE OF YOUR OWN PHASE PROMPT, NOT ONLY ITS FIGURES.
   Phase 96's prompt said a grep for the £1m cap returned ZERO assertions and
   that there was no cap test in the harness at all. The grep was right and the
   conclusion was not: one cap assertion already existed, reached through a
   symbol instead of the number. What was genuinely missing was narrower and
   more useful to name precisely. A prompt is a claim, not a fact.

9. WRITE THE COMPLETION RECORD into PHASE HISTORY (00-START-HERE/hub/
   PHASE-HISTORY.md, at the end), not into this document.

10. DELETE YOUR OWN PHASE SECTION from this document - the heading, the two
    paragraphs and the code block. The sweep is the only exception; it renumbers
    itself forward and stays last.

═══ THE CLOSING CHECK - THIS IS THE GATE, AND IT IS NOT OPTIONAL ═══

Steps 4, 9 and 10 are ONE SEQUENCE and they run in that order. Nothing deletes
itself automatically; a phase section survives until a Claude removes it, and it
may only be removed once the two steps before it are done. So before you delete
anything, PRINT THIS, in the chat and in the PHASE HISTORY record:

  DONE          - what this phase actually completed, with the evidence.
  NOT DONE      - EVERY item this phase did not finish, one line each, each one
                  naming WHERE IT NOW LIVES: "added to Phase N", "new Phase N,
                  written and inserted before the sweep", or "question added to
                  CAPREBATE QUESTIONS under <person>". A line with no destination
                  is a failed close. Go and give it one.
  NOTHING LEFT  - if the list is genuinely empty, say those words. An absent
                  section reads as forgotten; an explicit "nothing left" reads as
                  checked. They are not the same and only one of them is useful
                  to the next phase.

IF YOU RUN OUT OF ROOM, OR THE PHASE FAILS PART WAY: DO NOT DELETE THE SECTION.
Write the record, say plainly how far you got, and leave the prompt in place so
it can be re-run. A half-finished phase that deleted itself is unrecoverable; a
half-finished phase that did not is just a phase you run again.
═══════════════════════════════════════════════════════════════

THE STANDING BUSINESS RULES - these outlive the tasks that implement them
13. WHEN A CALL MAY FIRE. Lakhbir, 4 September 2026, across four messages. Read
    all of it - the middle version was superseded and the shape changed twice.

    (a) "COMMERCIAL ONLY" MEANS THE CLIENT, NOT THE BUILDING. CONFIRMED. Our
        clients are trading businesses - not buy-to-let landlords, not
        homeowners. It says NOTHING about the property, so SUPPORTED LIVING IS
        UNAFFECTED. The engine classifies it residential on purpose, because
        those buildings often are, and that is what earns it the one free
        purchase-price route the other four sectors cannot use. NOBODY DROPS
        THAT SECTOR ON THIS RULE.

    (b) FREE CALLS FIRE ONCE THE CLIENT HAS GIVEN US PERMISSION TO USE THEIR
        DATA. Lakhbir: "all free API fire once a user gives us permission to use
        their data."
        THIS IS ALREADY BUILT AND ALREADY SWITCHED OFF, AND THE SWITCH SAYS
        ALMOST EXACTLY THIS. CB_REGISTRY.precondition is:
            enabled: false
            requires: "a published privacy notice reachable from the address
                       question, because the legitimate-interests basis for
                       these lookups depends on it"
        So DO NOT BUILD A SECOND GATE. Publish the notice, link it at the
        address question, flip one boolean. Turning it on is one line and it is
        not ours to turn.
        THE ONE THING TO GET RIGHT, AND IT IS A LEGAL POINT NOT A WORDING ONE:
        "permission" here means INFORMED, NOT CONSENTED. The lawful basis is
        LEGITIMATE INTERESTS and the assessment is already written. A consent
        tick at the address question would MISDESCRIBE the basis and is the
        WEAKER position - consent is withdrawable, an assessment is not, and
        anyone who declines could not be given a figure at all. If Lakhbir ever
        means an actual tick box, that is a different instruction, it rewrites
        the legitimate-interests assessment, and it must be said explicitly.

    (c) A PAID CALL FIRES ONLY AFTER THE ENGAGEMENT LETTER IS SIGNED, AND ONLY
        WHEN AN OPERATOR CLICKS. Lakhbir: "paid APIs should only fire when an
        engagement letter has been signed - this is something more for the back
        end which a user clicks and any paid APIs auto run."
        Two preconditions then full automation: a signed engagement asserted
        SERVER-SIDE, never in the UI; a person in the back office clicks Run the
        research; and on that click EVERY paid call runs automatically. The
        operator picks the moment, not the calls - DO NOT BUILD A PER-CALL
        CONFIRMATION. It belongs in the operations dashboard (Block F) driving
        the post-gate research (Block D). Both specified; neither built.
        NOTHING REFUSES AND NOTHING THROWS. Pre-signature a paid source is
        simply not consulted and its facts stay asked - which N4 already
        requires of every unknown. If a build of this makes an estimate fail, a
        screen error, or a source read as unavailable, IT IS BUILT WRONG.

    SO THE MODEL IS TWO-TIER: free at the address question on permission, paid
    after signature on a click. That is coherent and it is the design.

    NOTHING IS FIRING TODAY. The engine makes ZERO network calls - grep for
    "fetch(" on the site returns 0. derive() consumes a `bundle` of what
    connectors already returned and THE CONNECTORS DO NOT EXIST;
    assertSignedEngagement is named in four documents and implemented nowhere.
    This is a SPECIFICATION FOR THE DEVELOPER, not a fix to running code, and it
    lands in the Developer Brief, the Build Order and the Provenance Map - whose
    instruction to fire the title register "without thinking about it" is now
    wrong and must be corrected.

    THE ONE OPEN QUESTION, AND IT IS NARROWER THAN IT FIRST LOOKED. The address
    lookup is PAID and its UPRN is what the free registers are keyed on, so tier
    (b) appears to depend on tier (c). It does not, quite: EPC, the care
    regulator, Companies House and Price Paid can all be searched on a typed
    postcode or name. THE PAID UPRN BUYS MATCH CERTAINTY, NOT ACCESS. So the
    two tiers do work - free calls run early on a fuzzy match with a confidence
    threshold, and the paid lookup after signature upgrades it.
    WHAT DECIDES IT IS A MEASUREMENT NOBODY HAS TAKEN: the matching spec already
    says to measure the real failure rate on 200 properties and nobody has. Do
    not assert the fuzzy match is good enough, and do not assert it is not.

    Check all of this whenever you touch the registry layer, and check it in
    every sweep even after the tracker item is closed.

N4 - UNKNOWN IS NOT A BRANCH, AND IT IS THE ONE THING A REFACTOR BREAKS
    SILENTLY. Deliberately UNNUMBERED: there are thirteen numbered points and
    fifteen places in this document say so, so a fourteenth would be wrong in
    all of them. It is a standing rule all the same.
    Every gate that would RELIEVE the client - open a window, grant an
    acceleration, let a cash figure stand - fires only on a fact that is
    actually KNOWN. "Not sure" and ABSENT must behave identically, and neither
    may become 0, or a limit, or a pass. WHERE YOU ASSERT THIS, ASSERT BOTH:
    a suite that tests only the "unsure" string leaves the undefined case - the
    state of every client who was never asked - completely uncovered, and
    everything else goes on passing. (Phase 96 found exactly that on the
    allowance gate, and proved the new tests could fail by breaking it on
    purpose first.)

HOW TO WRITE, THROUGHOUT
11. PLAIN ENGLISH. NAMES, NOT NUMBERS - IN OUTPUT. Refer to a task by its NAME
    and a question by its TITLE in anything a person reads: never a board id,
    never a Q-number, never "item 12976111942". "Can you value a building you
    have not stood in?" tells a surveyor what you are asking; "Question 1" tells
    them nothing.
    THIS IS A RULE ABOUT PROSE, NOT ABOUT YOUR WORKING. Ids are how you address
    the tracker and they belong in phase prompts, in COORDINATES and in your own
    commands. Working from names alone is how the wrong item gets edited.
12. WHEN YOU ARE ASKING A HUMAN FOR SOMETHING, GIVE THEM ENOUGH TO ANSWER COLD.
    What we think, a worked example with real numbers, our recommendation, and
    what their answer unblocks. Assume they have read nothing else.


```

```
═══ STANDING INSTRUCTION, AMENDMENT 1 — 8 SEPTEMBER 2026 ═══
THIS IS PART OF THE STANDING INSTRUCTION ABOVE, NOT A NOTE ABOUT IT. It is in
its own block only because the block above is 13KB and cannot be safely retyped
to insert three paragraphs. Read it as steps 4A and 4B of that list.

WHY IT EXISTS. Three times in three days the controller had to ask: "is there
anything Claude could have built and did not, and if so is it on another
phase?" THAT QUESTION IS NOT HIS TO ASK. Rule 4 above already says every loose
end gets a home, and twelve of the thirteen live phase prompts carry it - but
none of them says HOW TO DECIDE WHICH HOME, and ONLY THE SWEEP ever looks at
the board for work belonging to no phase. Between sweeps nothing catches it.
Checked on 8 Sep 2026: three items sat at "Ready - Claude can build", covered
by no phase, with no file and no document - two engagement-letter defects found
on 6 Sep and one allowance question found on 7 Sep. ALL THREE WERE CREATED BY
SWEEPS AFTER THE PHASE LIST WAS WRITTEN. That is the mechanism, and it will
repeat every time a phase or a sweep creates an item.

4A. CLASSIFY EVERY LOOSE END BEFORE YOU ROUTE IT. Two buckets, and the test is
    one question: COULD CLAUDE BUILD THIS TODAY WITHOUT ANYBODY ANSWERING
    ANYTHING?

      BUILDABLE -> IT GOES IN A PHASE. Either an existing later phase (add it
        to that prompt in terms, and say so) or a NEW numbered phase inserted
        before the sweep. NOT a tracker row on its own. NOT a sentence in a
        record. NOT a line in the chat. A TRACKER ROW WITH NO PHASE IS HOW WORK
        SITS STILL - that is what the three orphans above were.

      BLOCKED -> IT GOES IN A DOCUMENT. A question in CAPREBATE QUESTIONS under
        the person who must answer it, or a section of this action plan where it
        is a decision rather than a question. Retag the item so its status names
        the ACTUAL blocker.

    "I ran out of room" is BUILDABLE. "I did not think of it until now" is
    BUILDABLE. "It is waiting on a signature" is BUILDABLE and NOT blocked.
    Only genuine impossibility is BLOCKED - step 3 governs, and it is strict.

4B. BEFORE YOU CLOSE, LOOK AT THE TRACKER AND NOT ONLY AT YOUR OWN SCOPE.
    Fetch every item at "Ready - Claude can build" and check each against the
    phase list in this document - BY BOARD ID AND BY SUBJECT, because an item
    can be covered under a different name. Anything no phase covers is an
    ORPHAN. GIVE EVERY ORPHAN A PHASE BEFORE YOU CLOSE. Where there are
    several, one new phase covering them all beats several thin ones.
    This costs one command and one grep of this document:
      node 03-app/caprebate-tracker.cjs list --status "Ready - Claude can build"
    DO IT EVEN WHEN YOUR OWN PHASE WENT PERFECTLY - the orphans are never
    yours; they are the ones an earlier phase created and nobody adopted.

AND THE CLOSING CHECK'S "NOT DONE" LIST NOW CARRIES A LABEL ON EVERY LINE:

    <what it is> - BUILDABLE - <the phase it went into>
    <what it is> - BLOCKED on <what exactly> - <question title, or plan section>

A line with a destination but no label is a failed close. So is a line labelled
BLOCKED for something that merely awaits a signature, a review or a purchase
decision somebody could make today.

THE TEST THE CONTROLLER SHOULD NEVER HAVE TO RUN HIMSELF: if a phase closes and
the honest answer to "is everything buildable either built or written into a
phase" is not YES, THE PHASE HAS NOT CLOSED.
═════════════════════════════════════════════════════════════════════════════

```

```text
═══ STANDING INSTRUCTION, AMENDMENT 2 — 22 SEPTEMBER 2026 ═══
PART OF THE STANDING INSTRUCTION, LIKE AMENDMENT 1. It is its own block for the
same reason: the block above it is 13 KB and is not retyped to change a name.

THE QUESTIONS AND THE ANSWERS LIVE IN A WORD DOCUMENT, AND IT IS THE SOURCE OF
TRUTH. Lakhbir, 22 September 2026: "the word document is the source of truth
for questions and answers". It is Caprebate_Questions.docx, in Lakhbir's
OneDrive (the link is in the CAPREBATE QUESTIONS item's comments, 12976075805,
in hub/COMMENTS-ARCHIVE.md). The monday.com document called CAPREBATE QUESTIONS
is BACKGROUND ONLY from this date, and since 25 Sep 2026 it is the file
hub/QUESTIONS-BACKGROUND.md: its longer reasoning stays readable, but no
question is asked there and no answer counts until it is in the Word document.

SO, WHEREVER THIS INSTRUCTION, AMENDMENT 1, COORDINATES OR ANY PHASE PROMPT
(THE SWEEP'S INCLUDED) SAYS "CAPREBATE QUESTIONS", READ "THE WORD QUESTIONS
DOCUMENT". In particular:
  step 2   re-read the top of this document AND the Word questions document;
  step 4   a loose end BLOCKED on a person becomes a question in the Word
           questions document, under the person who must answer it;
  step 6   opening or closing a question is done in the Word questions
           document;
  4A       "BLOCKED -> IT GOES IN A DOCUMENT" means the Word questions document;
  CLOSING CHECK   "question added to the Word questions document under
           <person>".

SINCE 29 SEP 2026 THERE IS ALSO "Caprebate - Unanswered Questions (29 Sep
2026).docx" beside it: the same open questions, re-sectioned for the director,
Lakhbir, Sadique, the surveyor and the accountant, with the SAME numbers.
Read answers typed in either; copy one into Caprebate_Questions.docx the
AMENDMENT 2 way before acting on it.
READ THE ANSWERS THERE. Before you act on any question, read its Answer line
and the paragraphs under it in the Word document. Lakhbir writes his answers
there. An answer found only in the monday.com document is copied into the Word
document ("Recorded answer (<date>, <who>, <where>): ...") before it is acted
on.

HOW A QUESTION IS WRITTEN - THE WORD DOCUMENT'S OWN LAYOUT, AND NO OTHER:
  Heading 2    "N) <the question, in plain English a 12-year-old can read>"
  Normal       one short paragraph: what is going on and why it matters
  Normal       "What it unblocks: " (bold) then the text
  Normal       "Who it is for: " (bold) then Lakhbir / the tax adviser /
               the accountant / the surveyor / the data protection officer /
               the solicitor / the developer
  Normal       "AI suggestion: " (bold) then our recommendation
  Normal       "Answer: " (bold) then nothing, or a recorded answer
  Normal x 2   empty, for the person to write in
It goes at the END of its person's section: Section 1 Lakhbir, 2 the tax
adviser, 3 the accountant, 4 the surveyor, 5 the developer, the host and the
data protection officer. Number it one above the HIGHEST number already used,
wherever that sits: numbers are never reused or renumbered, because answers
are discussed by number. Phase 146 added 186 to 190 on 22 Sep 2026.

WHERE IT IS AND HOW TO EDIT IT SAFELY (rewritten 24 Sep 2026; corrected 28
Sep 2026 by the Phase 152 sweep)
  THE CLOUD ITEM IS THE DOCUMENT - THE ITEM, NOT THE NAME. It is
  Caprebate_Questions.docx in Lakhbir's OneDrive, Health Capital Allowances
  folder (folder item 01MGXUCTLLJJYYJPPZVZHISE2ISV4RLKP6): Microsoft 365
  connector, drive b!W41wb3ul9kWs7vuWtYvVPVjSKVUQtx5Am22Z3VRpClxUxJroNP8-
  TqaJLU1eo1aq, item 01MGXUCTLKJIP4DY6BJZGL7KO5ZTZZABK3 - the item his link
  opens, where he and the officer type. The closed document beside it is
  item 01MGXUCTIA3HHQAUXJ2JCIIXWRUKNXO7BI (no link to it is recorded).
  READ THE FOLDER FIRST: read_resource on file:///<drive>/<folder item>
  lists every name with its item id. Check that the item above still
  carries the name Caprebate_Questions.docx before you trust any copy of it.
  WHAT WENT WRONG FROM 25 TO 28 SEP 2026, SO IT IS NOT REPEATED. A phase made
  its backup by MOVING the Mac file (mv Caprebate_Questions.docx
  Caprebate_Questions.docx.bak-phase151e3) and wrote a new file in its
  place. OneDrive followed the move: the linked item was RENAMED to the
  backup, and the new file became a second item. So his link opened a frozen
  backup, every Claude write reached only the second item, and four phases
  copied the linked item down, found it "still the document from before
  230", and reported a Mac-to-cloud fault that never existed - the Mac file
  reached the cloud every time. Phase 152 renamed the second item "DELETE -
  Caprebate_Questions (a second item ...)", gave the linked item its name
  back, and wrote the document into it, proved byte for byte. THE RULE: take
  a backup with cp, NEVER mv, and write the new document INTO the existing
  Mac file (cp new.docx Caprebate_Questions.docx keeps the same file, so the
  same item; ls -i shows the same number before and after).
  Read  copy the ITEM, by id, to a new name in the same folder
        (sharepoint_copy_item; the copy syncs down to the Mac within a
        minute), then read that with python-docx. read_resource on the item
        gives the text only, through a PDF conversion.
  Edit  build the new body with python-docx (deep-copy an existing question's
        eight paragraphs and change the text of their runs), then put ONLY
        word/document.xml back into the ORIGINAL zip, keeping every other
        entry as it was: python-docx's own save drops two empty relationship
        files. Build zip entries from a fresh ZipFile for each output:
        writestr(info) changes the info it is given.
  Check immediately before writing, copy the item down again and compare it
        with the file you built from. If it changed, somebody is typing:
        stop and merge again.
  Write into the Mac file in place, as above - it reaches the item within a
        minute (proved 28 Sep 2026). sharepoint_update_file also writes the
        item itself, but it takes the whole file as base64 in one call.
  Then  copy the ITEM down again and cmp it with what you sent; look in the
        folder listing for a OneDrive conflict copy; move the temporary
        copies to the recycle bin (sharepoint_delete_item).

ANSWERED QUESTIONS LEAVE THE DOCUMENT (Lakhbir, 24 Sep 2026). When an answer is
DEFINITIVE: build it or put it in a phase; move the question, unchanged, to
"Caprebate_Questions - answered and closed.docx" in the same folder, with a
last paragraph "Closed (<date>): <what was decided and where it went>"; and
write any follow-up as a new question. An answer still being researched,
discussed or waited on stays where it is, untouched. So does a tax-law or
surveying answer typed by someone other than the adviser or the surveyor: it
is their input, not their sign-off. Closed questions keep their numbers, and
numbers are never reused, so a citation of a closed question stays right.

THE CHECKS READ BOTH. The CRM fold check's A2 reads the Word headings from
00-START-HERE/hub/QUESTIONS-WORD-HEADINGS.txt, built from the open document
AND the closed one as `node 03-app/caprebate-signoff-register-check.cjs
--word-headings` prints. Rebuild it and commit it whenever a question is
added, retitled or closed.
═════════════════════════════════════════════════════════════════════════════

```

### 📍 COORDINATES — every id and path a phase needs. For Claude, not for people.

```text
Use these ids freely in your own working. Rule 11 governs OUTPUT - what a human
reads carries names, never numbers. This block governs the WORK, where a name is
not enough to act on. Re-derive anything that looks stale; nothing here is a
substitute for looking.
REWRITTEN 25 SEP 2026 BY PHASE 151d, THE DAY monday.com WAS DROPPED. Lakhbir
became a guest on the seveneightsixmediagroup monday.com account and every
connector call began to fail ("the account admin must enable 'Public Hosted
MCP'"); he decided to leave monday.com that day. Everything it held was
exported, checked complete, and is now a file in the repository.
CHANGED 3 AND 4 OCT 2026 (Lakhbir): monday.com is the main board again, and
its doc 18429698457 is the run sheet the phases are pasted from. Follow the
note under "How the phases at the top of this document work" and each
phase's banner; OneDrive stays the full copy. Every monday.com-only trap (block ids and positions, the
25-item limit, document columns, asset ids, re-uploading files) was deleted
with it; the old blocks, and the 25 dated notes that sat under them, are
verbatim in the export in _archive/ if a record is ever needed.
IT IS TWO BLOCKS; the second follows directly. They are files now, so correct
a fact IN THE BLOCK, never in a note beneath it.

DECIDED - DO NOT REOPEN. Lakhbir's settled decisions that a phase or a sweep
keeps meeting in older text. Do not rebuild, re-ask or re-list them.
  THE VOA RATING LIST - SCRAPPED (Lakhbir, 4 Oct 2026: "scrap the VOA
    rating"). Its licence restricts it to business rates purposes ("An open
    government licence does not apply"; read by Phase 155). Floor area comes
    from the EPC register, Homedata's estimate (paid, off) and the surveyor.
    The tracker row (12830205481) is SCRAPPED in group Z and archived on
    monday.com; the source register keeps the VOA row, its licence
    VOA_RATING_LIST with every channel shut, and the panel says "not built";
    the phase9 importer stays unshipped and nothing is to wire it in. Older
    text that says VOA is "waiting on the licence" is history.
  THE ORDNANCE SURVEY LICENCE EMAIL - NOT SENT (Lakhbir, 4 Oct 2026: "OS
    email no we dont need to send it"). Email 2 of tracker 12933604947 is
    dropped. Nothing waits on it: site size and a boundary plan rest on HM
    Land Registry's conditions, and the building outlines (Phase 156a A2) use
    the free OS OpenData plan, which needs no letter. Without it the building
    footprint is not taken from Ordnance Survey's paid maps; the client or
    the surveyor gives it, as today.
  GOOGLE ANALYTICS - DROPPED FOR NOW (Lakhbir, 4 Oct 2026: "we can drop this
    and marketing can pick it back up in the futer during development if
    needed"). The code built by Phase 146f stays as it is, OFF (no
    GA4_MEASUREMENT_ID, nothing loads); no phase asks for the measurement ID
    or sets it up. Only the marketing team, through Lakhbir, picks it up
    again. Tracker 12552691720 stays "Parked - deliberate".
  (Still open: whether to ask the Valuation Office about its Rating Cost
    Guide - a different document, about building costs, not the rating
    list. Word question 11.)

WHERE EVERYTHING LIVES - Caprebate/00-START-HERE/hub/, committed to git
  ACTION-PLAN.md                    this document
  PHASE-HISTORY.md                  what every completed phase did; append a
                                    record at the END; an archive, never a runbook
  FOR-THE-ACCOUNTANT.md             the three LIVE registers of everything
  FOR-THE-SURVEYOR.md               waiting on a named person's signature
  FOR-THE-SOLICITOR-DPO-DEVELOPER.md
  TRACKER.csv                       THE BOARD: one row per item and subitem,
                                    by the id monday.com gave it
  TRACKER.md                        the same, grouped and readable - RENDERED
                                    from the CSV, never edited by hand
  COMMENTS-ARCHIVE.md               the comments the board carried until
                                    25 Sep 2026, by item, oldest first. A
                                    RECORD, NEVER EDITED
  QUESTIONS-BACKGROUND.md           the old monday.com questions document -
                                    BACKGROUND ONLY since 22 Sep 2026
  QUESTIONS-WORD-HEADINGS.txt       the Word questions document's Heading 2
                                    texts, open AND closed - read by the checks
  CLAIM.md                          THE LOCK
  The questions and answers are NOT here: Caprebate_Questions.docx in
  Lakhbir's OneDrive is the source of truth (AMENDMENT 2).
  The exports as they came off monday.com (the plan, the history, the three
  registers, the questions document, and Health_Capital_1790331783.xlsx, the
  board with every comment) are kept unedited in Caprebate/_archive/.
  THE TEST WEBSITE SERVES NO FILE OF OURS since Phase 151e (Lakhbir answered
  Word question 229 "yes", 25 Sep 2026): vercel.json's outputDirectory is
  public/, which holds robots.txt alone, and every page comes from the
  application itself. Until then it was "." and every committed file was
  public; SETTING IT BACK TO "." PUBLISHES THE WHOLE STORE AGAIN.
  /.vercelignore still keeps hub/ out of the upload. The test website's logins
  take CAPREBATE_TEST_PASSWORD from its settings, and only when that is set
  are DIDIT_API_KEY, DIDIT_WEBHOOK_SECRET and DIDIT_WORKFLOW_ID read from its
  settings too (api/index.mjs, configureTestDeploy).
  ITS RECORDS ARE IN MEMORY until a lasting database is set (Phase 151e, 27
  Sep 2026): with TURSO_DATABASE_URL and TURSO_AUTH_TOKEN (what Vercel's
  Turso integration adds; CAPREBATE_DB_URL and CAPREBATE_DB_TOKEN win) AND
  the test password, every copy uses one Turso database and the seed runs
  only when it is empty (lastingDatabase, seedOnce). If it cannot be opened,
  or holds a seed that never finished, the site runs on memory and the log
  says why (openLasting, Phase 151e line 7). Put it in AWS us-east-1, beside
  the function. Lakhbir said "set up Turso" on 28 Sep 2026 (Word question
  230).
  UPLOADED DOCUMENTS (Phase 151i, 28 Sep 2026): with the lasting database IN
  USE (it opened) AND a private Vercel Blob store connected (BLOB_STORE_ID,
  or a token: CAPREBATE_BLOB_TOKEN wins over BLOB_READ_WRITE_TOKEN), every
  copy keeps them in that one store (src/web/shared-objectstore.ts;
  sharedDocumentStore in api/index.mjs); anything less, the temporary disk.
  Every Blob call is private and a public store refuses it; no Blob address
  is kept. Word question 231 asks Lakhbir. The audit log reads the chain's
  end once and retries a clash on seq; Db.tx begins IMMEDIATE.
  WHAT CLAUDE CAN SEE OF IT (Phase 152): the Vercel connector's only team,
  ldhillonaqlios, holds no projects - caprebate-test is not found there - so
  its logs are Lakhbir's to read. GitHub keeps each deploy's status and own
  address (gh api repos/ldhillonaqlios/caprebate/deployments, then its
  /statuses); that address is behind Vercel's sign-in. The public address is
  https://caprebate-test.vercel.app. Each copy logs "test deployment: this
  copy started in N ms".
  THE OUTSIDE REPLY TIMER (Phase 155 line 5, 4 Oct 2026): a cron-job.org job,
  set up by hand by Lakhbir (Phase 156b A1) and held in HIS account - nothing
  here can see or change it. Every 5 minutes it calls POST /hooks/read-replies
  with "Authorization: Bearer <REPLY_TIMER_TOKEN>" (the word is in Vercel's
  settings only; src/web/inbound-email.ts timerRefusal). Its history is on
  cron-job.org (200 = read; 401/403 = word or Vercel protection). Ours: one
  row, mailbox_reads (migration 088, times only). If it stops, replies wait
  in the mailbox, nothing is lost, and Admin's home page warns after an hour
  without a read, weekdays 09:00-17:30 UK (repliesStale, REPLY_WATCH). The
  continuity plan's section 5 row says the same.
  SIGNING IN (Phase 151j, 28 Sep 2026): every staff login gives a second
  step (an authenticator app or an email code); a client may; a new account
  gets a temporary password shown once (7 days). login() itself refuses
  while a step is left. createApp(..., { twoFactor: 'off' }) is for the older
  test files and tools/payload-proof.ts ONLY - never src/ or api/. On the
  test website emails are not sent, so use the authenticator app there.
  SINCE 29 SEP 2026 (Lakhbir): on the test website ONLY, a login at the
  reserved domain example.invalid (the invented seed logins) asks for no
  second step - policy STAFF_EXCEPT_INVENTED, set by api/index.mjs
  (TEST_WEBSITE_TWO_FACTOR), never by src/ and never the default; every other
  login still must give one (test/invented-logins.test.ts). A sign-in step
  lives in the database, so ON MEMORY each copy of the website has its own
  and a step begun on one is "timed out" on the next - reproduced that day;
  the time-out page now says so (stepGoneWhy). Sessions live there too.
  Since Phase 151k: /api/login answers 202 and a step token, and
  /api/login/step/... walk the SAME functions (src/web/sign-in.ts); the
  app's secret is sealed where CAPREBATE_MFA_KEY is set (key file, or the
  test website's settings; unset = text, as before; src/mfa-seal.ts); a
  SENT sign-in code or reset link loses its outbox body (migration 058).
  The screenshot tool signs in with 09-app/backend/tools/demo-sign-in.ts,
  demo logins on this machine only.
  Since Phase 151m: ten RECOVERY CODES, shown once when a second step is set
  up and on "Make new recovery codes" (/staff/two-factor, /portal/two-
  factor; POST /api/account/recovery-codes), kept only as scrypt hashes in
  recovery_codes (migration 059, src/web/recovery-codes.ts). One is taken
  in place of the code at the VERIFY step (/login/step/recovery,
  /api/login/step/recovery), once, within the same 5 wrong codes.

THE LOCK - hub/CLAIM.md replaces monday.com's "Claimed by (machine)" column
  Before a phase starts: write the phase, the machine and the time there,
  commit, and PUSH. A claim already there STOPS WORK - another phase is running,
  or one died without clearing it; ask Lakhbir. At the close: set it back to
  (none), commit and push. git pull first, or you are reading a stale lock.

THE TRACKER - node 03-app/caprebate-tracker.cjs, the ONLY way to change it
  list [--status "<label>"] [--owner "<type>"] [--group "<text>"]
  show <id>
  set <id> status "<label>" [claimed_by "" ...]   several fields = one change
  note <id> "<one line>" --phase "Phase N"         = "post an update on the item"
  add --name ... --group ... --status ... --owner ... [--parent <id>]
                                   a new id is one above the highest; never reused
  render                           TRACKER.csv -> TRACKER.md (every write renders)
  check                            exit 1 on a label that does not exist, a
                                   duplicate id, an orphan subitem, a name over
                                   255 characters, a claim left on an item that is
                                   not "Working on it", "Ready - Lakhbir action"
                                   owned by Claude, an undated note, or TRACKER.md
                                   out of step with the CSV
  --self-test                      nine planted faults must fail, and the CSV must
                                   read and write back byte for byte
  Columns: board_id parent_id name group status owner_type person deadline
  files files_on_disk document claimed_by cta_answer_status cta_severity notes.
  files is what was attached on monday.com; files_on_disk is where each one is
  in the tree. THE FILE ON DISK IS THE FILE - nothing is re-attached anywhere.
  EVERY ATTACHMENT IS ON DISK. The three that were only on monday.com were
  downloaded by Lakhbir on 25 Sep 2026 and filed: the assessment page in
  _archive/superseded/, the Stage 1 question leverage tiers in
  02-modules-and-build-prep/.

GROUPS - seven, in the tracker's group column, matched on the WHOLE TEXT:
  00 · START HERE
  01 · FOR LAKHBIR — decisions, appointments, company, governance
  02 · FOR THE TAX ADVISER — rulebooks, switches, tax sign-off
  03 · FOR THE ACCOUNTANT — the referral channel
  04 · FOR THE SURVEYOR — valuation, quantities, calibration
  05 · FOR DEVELOPMENT — engine, data layer, build, hosting
  Z · Complete / Not Applicable
  THERE IS NO "R - MARKED FOR REMOVAL" GROUP and nothing should recreate it.
  Nine SUBITEMS carry a "REMOVE-" prefix; they are closed decisions of 1 Sep.

STATUS LABELS - the ten, exactly as written; the tracker refuses any other.
  Ready - Claude can build        THE BUILD QUEUE
  Ready - Lakhbir action
  Built - awaiting sign-off       blocks nothing
  Blocked - question              the real blockers
  Blocked - licence or purchase
  Blocked - incorporation         EMPTY since CAP REBATE LTD (17307313) was
                                  confirmed on 18 Sep; the label stays, unused
  Blocked - needs live jobs
  Parked - deliberate
  Working on it                   the claim state: needs claimed_by
  Done
  THE LIVE SPREAD IS NOT QUOTED HERE. TRACKER.md's two tables are the tally,
  counted by the tool at every write, and node 03-app/caprebate-signoff-
  register-check.cjs prints it too. The Action plan row and the four other hub
  rows sit at "Ready - Lakhbir action" and are not tasks.
  "READY" MEANS NOTHING IS IN THE WAY. IT SAYS NOTHING ABOUT PROGRESS, AND NOTHING
  ABOUT WHO TYPES IT. An empty build queue is not an empty job list: on 17 Sep
  the queue was empty while five items at other labels carried work, in their
  documents and notes, that nobody needed to answer anything for; on 22 Sep,
  39 open items carried a latest comment the decisions had overtaken, which
  Phase 146 closed. On 23 Sep the queue held one item and the sweep still found
  three more jobs nobody had to answer anything for, two of them named in
  comments written eleven days earlier. On 24 Sep it held one again, while ten
  answers Lakhbir had typed into the Word questions document sat unread by any
  phase. READ THE ANSWER LINES AND THE TWO PARAGRAPHS UNDER THEM, EVERY SWEEP.

OWNER TYPES - the six:  Claude . CTA . Lakhbir . Surveyor . Solicitor/DPO .
  Developer.  "Director (CAP REBATE LTD)" was on eight items in the 25 Sep 2026
  export; Lakhbir said "leave as lakhbir and not director" the same day, so
  they are Lakhbir's again and the tracker check refuses that value.
  Never re-create "Working on it" / "Done" / "Stuck" here. The owner says who
  ACTS: "Ready - Lakhbir action" owned by Claude is a contradiction (one
  corrected 10 Sep; the tracker now refuses it). The five APPLICATION roles -
  Admin, Sales, Accounting, Surveying, Client - are a different thing.
  Accounting is Caprebate's own finance; the client's accountant is an offline
  actor with no login.

THE HUB ROWS - the old monday.com items, found in the tracker by these ids
  CAPREBATE ACTION PLAN     12976111942   -> hub/ACTION-PLAN.md; its monday
                                             doc 18429698457 is THE RUN SHEET
                                             again since 4 Oct 2026 (the live
                                             phases on top, then DONE - ACTIONS
                                             AND OUTCOMES); the doc as it was is
                                             in 08-monday-doc-exports/
                                             18429698457 is the doc's OBJECT id;
                                             its API doc id is 46840326. Adding
                                             blocks (add_markdown_content,
                                             create_block) fails with an internal
                                             error on the object id - pass
                                             46840326 (Phase 153a, 4 Oct 2026)
  CAPREBATE QUESTIONS       12976075805   -> the Word document (background:
                                             hub/QUESTIONS-BACKGROUND.md)
  PHASE HISTORY             12878920167   -> hub/PHASE-HISTORY.md
  FOR THE ACCOUNTANT        12980421567   -> hub/FOR-THE-ACCOUNTANT.md
  FOR THE SURVEYOR          12980410244   -> hub/FOR-THE-SURVEYOR.md
  FOR THE SOLICITOR/DPO/DEV 12983537653   -> hub/FOR-THE-SOLICITOR-DPO-DEVELOPER.md
  The three registers house every item at "Built - awaiting sign-off", each in
  EXACTLY ONE. They go stale silently - run the register check, which derives
  the split; do not quote it.
  The restricted breach register and names annex were two monday.com boards,
  both empty (0 items) when last read on 24 Sep 2026. They went with monday.com;
  nothing held in them was lost.

SUBITEMS - rows with a parent_id. Their status is a DIFFERENT column with five
  labels of its own - Working on it / Done / Stuck / Drafted, not approved /
  Waiting on someone else - and most carry none. Do not read the ten onto them.
  cta_answer_status (Open / Answered / Superseded) and cta_severity (BLOCKER /
  HIGH / STANDARD / Not rated) are set on the tax adviser's review pack only.
  THE THREE CATALOGUE PARENTS - blank subitem rows here are DATA, not work:
    12818313893   name exclusion register
    12818978746   Stage 2 document upload list
    12830043701   the tax adviser's review pack
  Every other blank subitem is a live step of its parent, or - under a Done
  parent - a closed class (Lakhbir, 1 Sep). A parent's status moving is how a
  closed class reopens: Phase 128 moved two parents to "Built - awaiting
  sign-off", and their rows became rows of a document under sign-off.
```

```text
COORDINATES, CONTINUED - the second of two blocks, rewritten 25 Sep 2026 by
Phase 151d for files.

DISK - ONE MACHINE, THE MAC. THE ACER IS RETIRED (Lakhbir, 25 Sep 2026).
  Mac   "/Users/lakhbir/Library/CloudStorage/OneDrive-AqliosLTD/Health Capital
         Allowances/Business Development/Development/Caprebate"
  It contains spaces - quote it. Every phase runs here. The Acer copy
  ("C:/Users/L.Dhillon/OneDrive - IT Roadway/Desktop/Caprebate", in another
  OneDrive account) is no longer used, and nothing needs bringing level with it
  (Word question 228, closed 25 Sep 2026). Older text that mentions the Acer,
  its junctions, its node or its stale copies is history.
  OneDrive backs up the whole tree. Development/ (one level above the tree) is
  also a git working copy (its .git file points at /Users/lakhbir/code/
  caprebate.git): remote github.com/ldhillonaqlios/caprebate (private), branch
  main, one commit per phase since Phase 134. Read "git log --oneline" at the
  start of a phase: a commit you do not recognise is another session.
  WHAT GIT HOLDS. Its .gitignore is an ALLOW-LIST: the site file, 09-app/,
  03-app/, 04-phase-work/phase3 and phase9, the six Module files and the
  fixture taxonomy, the engagement letter, and 00-START-HERE/hub/ - never the
  other documents, board exports, .bak files, databases or keys. They live in
  OneDrive only, on purpose, in case one ever holds a real client's data.
  08-monday-doc-exports/ holds THE LIVE COPY of every document that was
  attached to a board item, as <item id>__<name>.md (Phase 87 exported them and
  cleared the doc columns). The tracker's files_on_disk says which file is
  whose. A name ending .bak-phaseNN is a dated backup: never edit one.
  The tree: 00- to 08-, 09-app/, _archive/ and README-file-index.md. Nothing
  numbered may be renamed.
  THE ENGINE, "Caprebate site.html", IS ONE LEVEL ABOVE THE TREE, in
  Development/, and is copied
  byte for byte into 09-app/engine/src/generated/. Change the site file and
  re-run the extractor; never hand-edit generated/.
  03-app/phase3 and 03-app/phase9 are EMPTY FOLDERS (on the Acer they were
  junctions). The harness traverses them and falls back to ../04-phase-work.
  THE MODULE FILES: the six Module-*.md files and Caprebate-Fixture-Taxonomy-
  v1.csv live ONLY in 02-modules-and-build-prep/ on the Mac, read there by the
  harness and the phase9 cost-model test since Phase 132g. THE COMPETITOR
  PROGRAM'S FULL COPY (Word questions 9 and 214) WAS DELETED AS NOT NEEDED
  (Lakhbir, 25 Sep 2026, Phase 151f); nothing reads it. Phase 151f wrote that
  this block said so, and it did not until the Phase 152 sweep.
  KEYS live only in ~/.caprebate-secrets.env, outside the repository (names in
  09-app/backend/secrets.example.env); src/secrets.ts refuses a key file inside
  the tree, and .gitignore ignores *.env, *secret*, *.p12, *.pfx, *.pem and
  *.key anywhere. Check the key file BY NAME ONLY - never print a value.
  src/connectors/http.ts is the only file under src/ that may call fetch, and
  test/phase146b.test.ts fails on any other.
  A MIGRATION AND ITS RECORD LAND TOGETHER (Phase 152, src/db.ts migrate and
  splitMigration). A plain file runs in one transaction with its
  schema_migrations row. A file that needs its own transaction (foreign keys
  off) has ONE shape: "PRAGMA foreign_keys = OFF;", a line "BEGIN;", the
  body, a line "COMMIT;", "PRAGMA foreign_keys = ON;" - anything else is
  refused with a sentence and nothing from it lands.
  THE TEST LOOKUP LOG (Phase 151g) is ~/.caprebate-test-lookups.jsonl, or
  CAPREBATE_TEST_LOOKUP_LOG - outside the repository, refused inside it. The
  smoke command keeps Lakhbir's five conditions there (Word question 170):
  who and why, three per connector per switch-on (node src/cli.ts
  smoke-switched-on <SOURCE> --who --why restarts the count), never a
  client's values, only connector, time, PASS or NO, who and why.
  node  on PATH (Homebrew).
  A DOCX ZIP may use BACKSLASH entry paths: the engagement letter's is
  "word\document.xml" and the seven policy templates' are not. Match both. To
  EDIT one, rewrite that single entry and keep every other entry's bytes and
  every entry NAME exactly - a zip tool that normalises the backslashes changes
  a file the back end's letter tests read. Verify every entry's CRC afterwards.

THE CHECKS - every one green where it must be and red where it must be at the
close of Phase 151d. RUN A NEGATIVE CONTROL'S EXIT CODE ON ITS OWN LINE:
"node ... | tail" hands you tail's exit code, and a zsh for-loop splitting on
"|" hands you node with no arguments - both print a green 0 over a control that
never ran (23 Sep 2026).
NO FIGURES IN THIS BLOCK, ON PURPOSE: a figure copied here goes stale, and the
register check reads this document. The live figures are the first lines the
drift checker prints, and section 4 of 09-app/CAPREBATE-DEVELOPER-SPEC.md.
A COUNT FOR ONE FILE IS CHECKED BY NOTHING. The drift checker derives five
totals only, so "`x.test.ts` (N assertions)" can never be compared. Write the
command that counts it, never the number.
  node 03-app/caprebate-regression.cjs                site harness; ~10-20 s a mode
  node 03-app/caprebate-regression.cjs --package      the package - MUST MATCH the line above
  cd 04-phase-work/phase3 && node --test              from INSIDE the folder
  cd 04-phase-work/phase9 && node --test              from INSIDE the folder
  cd 09-app/backend && npm run check                  lint-sql, typecheck, tests
  node 09-app/engine/tools/verify-extraction.cjs      byte for byte, the must-nots, and
                                                      THE SWITCH COUNT - read it there.
                                                      Step 3's "eleven engine readings"
                                                      is a dated example, not a count.
  node 09-app/engine/tools/extract.cjs --check        exit 1 if the package is stale
  node 03-app/caprebate-figure-drift.cjs              exit 0; it runs all four suites itself,
                                                      after section 0, the STRAY-COPY GUARD:
                                                      exit 1 if a module file is back in
                                                      03-app/ or missing from 02-modules-
  node 03-app/caprebate-figure-drift.cjs --self-test  classifier cases and the guard cases
  node 03-app/caprebate-figure-drift.cjs --fast --expect 999,998,997,996   MUST EXIT 1
  node 03-app/caprebate-figure-drift.cjs --twins-only   the guard alone (--twin-root <dir>
                                                      runs it on a scratch tree: the control)
  node 03-app/caprebate-figure-drift.cjs --file <path>  one file, a .bak copy included
     THE DRIFT CHECKER DOES NOT READ 00-START-HERE/hub/ (Phase 151d): the
     register check's section 5 reads those files, each under its own policy -
     PHASE HISTORY, the comments and the background questions document are
     chronicle, a block that disclaims quotation is chronicle, the rest is live.
     One check owns the hub, so a file never gets two verdicts.
  node 03-app/caprebate-figure-classify.cjs --self-test --against <an older copy>
                                                      proves a new case can fail
  node 03-app/caprebate-tracker.cjs check             and --self-test (nine planted faults)
  node 03-app/caprebate-signoff-register-check.cjs    reads hub/: TRACKER.csv, the comments and
                                                      the three registers. exit 2 means it
                                                      COULD NOT RUN. CHECK 1: every item on one
                                                      of the ten labels. CHECK 4: evidence is a
                                                      note or a comment, a file ON DISK, or a
                                                      document. It runs the drift checker for
                                                      section 5 unless --no-figures.
  node 03-app/caprebate-signoff-register-check.cjs --self-test   eleven controls; --against
                                                      <an older copy> runs them on that copy
  node 03-app/caprebate-signoff-register-check.cjs --word-headings
                                                      how to rebuild hub/QUESTIONS-WORD-
                                                      HEADINGS.txt from the two Word documents
                                                      (read the cloud copy); commit it
  node 03-app/caprebate-crm-fold-check.cjs            and --self-test; reads hub/ACTION-PLAN.md,
                                                      hub/QUESTIONS-BACKGROUND.md and the Word
                                                      headings. Check C reads the site file,
                                                      the engine, phase3 and phase9 references
                                                      too (132g). A5 reads the italic test
                                                      titles in EVERY evidence part, Part G
                                                      onwards, against the back end's test
                                                      TITLES (146). A2 finds a cited question
                                                      title in either questions document, and
                                                      checks every "(Word question N)" pointer
                                                      names question N by its own title (146a).
                                                      A row CARRIED to a phase is listed, not
                                                      failed, only while that phase's heading
                                                      is in this document. C fails on a file
                                                      with a colon and no line number after it
                                                      ("`src/web/crm.ts:`"), which it passed
                                                      silently until Phase 152.
  node 03-app/caprebate-notices-acceptance.cjs        structural checks only; green is only that.
                                                      --live also fails while a fact is unset
  cd 09-app/backend && CAPREBATE_ALLOW_SEED=1 node tools/payload-proof.ts
                                                      the surveyor receives no estimate AND
                                                      admin receives all seven - both halves
  cd 09-app/backend && npm run verify-audit           the audit chain; needs CAPREBATE_DB
  node 03-app/caprebate-analytics-allowlist-check.cjs  and --self-test (twelve planted faults,
                                                      146f). Section D runs the site's cookie
                                                      choice in a sandbox: Refuse loads nothing,
                                                      is kept, and is no longer than Accept
  cd 09-app/backend && node tools/match-measure.ts --self-test   must print "every check held";
                                                      --run is LIVE and REFUSES (exit 2) until
                                                      the data protection officer answers the
                                                      200-address question (146c)
  node 03-app/caprebate-brand-check.cjs               and --self-test; the site file, the notices
                                                      page and the complaint form: fonts, brand
                                                      colours, voice, logo, the company named
                                                      exactly as registered (133d, 133g)
  node 03-app/caprebate-plain-words-check.cjs         and --self-test; every screen's words, the
                                                      connectors' words, the guide and Help at
                                                      grade 7 (--guide), the assessment at grade
                                                      9. --suffix .bak-phase144a MUST EXIT 1
  node 04-phase-work/phase144/tools/crawl-shots.mjs <outdir>   against a running demo:
                                                      every screen, each login, 1280 and 360 px
  node 03-app/caprebate-gated-exit-renderer-proof.cjs the site's funnel after a gated exit
  node 03-app/caprebate-cash-route-proof.cjs          Rulebook A's claim routes in CB_CASH
     both proofs take --against <an older site file> and MUST go red on a
     pre-change copy: the gated-exit proof against .bak-phase127 (and its K1-K4,
     contact details at the close, against .bak-phase151e4), the cash
     proof against .bak-phase129b (R13, R15 and R17 fail). A proof goes red only
     against a copy older than the change it guards.
     --moves-from <older file> lists every state whose cash figure moved and
     fails if any moved UP. --equivalent-to <a PRE-RELABEL copy> proves a relabel
     moved no cash figure; its check is EQV1. Against the live site it prints
     red, because Phase 129 moved cash figures on purpose. To re-prove the
     relabel alone: --against <.bak-phase129> --equivalent-to <.bak-phase127> -
     EQV1 HOLDS, and read EQV1 ONLY: that older copy fails SEVEN later checks,
     R8, R9, R11, R12, R13, R15 and R17.
     --equivalent-to REFUSES, exit 2 and a plain sentence, a file that already
     carries the relabelled route keys. That exit 2 is a refusal, not RED.
     --self-test proves the refusal: four cases; it needs .bak-phase127 beside
     the site file, or --pre-relabel <file>.
  THE HARNESS CANNOT BE POINTED AT ANOTHER SITE FILE. To prove new tests fail
  on a pre-change copy, serve the older copy for one run with
  03-app/caprebate-site-redirect-hook.cjs (Phase 129a), all paths absolute:
     NODE_OPTIONS="--require \"<abs path>/03-app/caprebate-site-redirect-hook.cjs\"" \
     CB_SITE_REAL="<abs path to Caprebate site.html>" \
     CB_SITE_ALT="<abs path to the .bak copy>" node 03-app/caprebate-regression.cjs
  QUOTE THE PATH INSIDE NODE_OPTIONS - unquoted, node dies MODULE_NOT_FOUND
  before the harness starts, which is not a red result. Check the line the hook
  prints on exit: zero reads redirected means the run proved nothing.
  AE5 takes CB_AE5_DUMP=<file> and writes one fingerprint per question, so a
  re-pin can be proved question by question against a pre-change copy (132j).
  A TEST THAT READS THE WALL CLOCK passes all week and fails on one afternoon.
  Move the process clock for one run with 03-app/caprebate-clock-shift.mjs:
     CB_FAKE_NOW="2026-09-13T15:45:00.000Z" \
       node --import "<abs path>/03-app/caprebate-clock-shift.mjs" --test <file>
  node 03-app/caprebate-clock-grid.mjs --suite backend|phase3|phase9 [--at <ISO>]
     [--file <test>] [--jobs N], and --self-test: a week at every half hour,
     both clock changes, 31 Dec, 29 Feb 2028; a red instant is run twice so a
     flake is reported as a flake. The back end takes about an hour - run it on
     an rsync copy of the tree without .bak-phase* and _archive (Phase 132).
  A fix is proved only when the PRE-CHANGE file goes red under the same clock.
  --expect TAKES FOUR NUMBERS: site, phase3, phase9, back end. Given three it
  exits 2 and refuses - which is NOT a failure report.
  node --test 04-phase-work/phase9/ from the root DOES NOT RUN on Node 24 (the
  directory resolves as a module), and a glob from the root also runs the
  .bak-phaseNN snapshots. Always run the module suites from inside the folder.
  The drift checker prints section 0 (the stray-copy guard), then the
  re-derived figures, then three sections, and only the FIRST of those is the
  failure list. Its classifier, 03-app/caprebate-figure-classify.cjs, is shared
  with the register check and records its own remaining blind spots in the
  comment under PASS_RE. Read them there, not here.
  node --test prints its totals behind a multi-byte glyph: grep "pass [0-9]"
  UNANCHORED, or an anchored match finds nothing and looks like a broken suite.
```

 **The dated notes that sat under these two blocks** — twenty-five of them, added by Phases 92 to 148 because a monday.com block could only be replaced whole — **were folded into the blocks above, or deleted where they described monday.com alone, by Phase 151d on 25 September 2026.** Each is verbatim in the export of this document in `_archive/`.

---

 **When the phases below are finished, the tracker itself is the queue.** Two labels matter day to day: **`Ready - Claude can build`** is the build queue, and **`Blocked - question`** is the list of things genuinely stopping Claude. Everything else is waiting on a person, a licence, the company existing, or real client work.

---

# ▶ THE BUILD — phases 102 to 108. Seven phases, three deliverables, and everything else folds into them


 **ALL SEVEN ARE BUILT. Blocks A, B, C and D on 8 September 2026; E, F and the Developer Spec on 9 September.** Block A, the engine as a package (`09-app/engine`, Phase 102). Block B, the back end's authentication, five roles, server-side authorisation and the append-only audit log (`09-app/backend`, Phase 103). **Block**** C, deliverable 1 fini****s****hed** — the public site, the six-screen assessment, the customer login and the client portal (Phase 104), which is also the first thing that ever called the upload handler. **Block**** D, the back office'****s ****first three sections** — settings, the filled-assessments list and detail, and the calendar (Phase 105). **Block E, the engaged-client list and the five-panel business page** — the screen where the work of a claim is actually done (Phase 106). It is the first implementation `assertSigned``E``ngagement` has ever had. **Bl****o****ck F, the s****u****rveyor review-and-sign**** ****w****o****rks****p****ac****e**** a****n****d the account****ing ****vi****e****w** — the two remaining roles, and the block that carries **the ****one te****s****t that can fail th****e**** whol****e**** buil****d** (Phase 107). **THAT TEST PASSED ON THE WIRE, NOT IN THE CODE:** a surveyor session's captured response body carries no `e``st``i``ma``t``e` key at all, and searching it for every one of the sealed estimate's seven field names and seven values — by name, by value at any depth, and by raw text — found nothing three ways, while the identical searches as ADMIN found all seven. Re-run it: `cd`` ``09-``a``pp/backe``nd ``&& CAPREBATE_ALLOW_SEED=1 node`` ``tools/p``a``yload-p``r``oof.ts`. **AND DELIVERABLE 3 IS DONE — Phase 108, 9 September 2026, and its section has deleted itself from the list above.** The Developer Spec is `09-app/CAPREBA``T``E``-D``EVE``LOPER-SPEC.md`: the user cases, every screen in both applications, every internal and external API, **a t****able ****naming every stub and the file and line it is in**, what the developer must still do, and what is not theirs to decide. **The**** fold**** is closed**** at fifteen files** — fourteen archived by Phases 104, 107 and 108, and the fifteenth, the retired Client Journey (FINAL), recovered by Phase 100 from an attachment because it existed on disk nowhere. **108 WAS NEVER “BLOCK G”** and an earlier version of this paragraph said it was. The Build Order's Block G is the public notices page at `/notices/`, which Phase 99 built on 8 September and which waits on hosting, not on a phase. The seven build phases and the Build Order's lettered blocks are two overlapping schemes, not one. **WHAT IS LEFT IS NOT PART OF**** ****THE**** ****SEVEN.** Phases 110 to 113c below are follow-on work the build surfaced, and the sweep is last as always. 

 **CORRECTION TO THE LAST SENTENCE ABOVE, 9 SEPTEMBER 2026 BY PHASE 113b.** It says the follow-on work is _"Phases 110 to 113c"_. **That span is stale in both directions and re-deriving it is a five-second read of the list below.** Phases 110, 111, 112, 113, 113a and 113b have all run and deleted themselves, and three phases have been inserted since it was written. **What actually stands below today is 113c, 113d, 113e and 113f, then the sweep** — and it will be different again by the time you read it, which is why the rule at the top says the next phase to run is the first one below COORDINATES rather than a number anybody quotes. A note rather than an edit to that paragraph: it is one block of dense inline formatting, `update_block` replaces all of it, and hand-retyping it to correct a span the reader can see for themselves risks damage nobody asked for.

 **The sentence above names a range whose first number moves every time a phase finishes, so read it as “everything below COORDINATES” rather than as a list.** **Phase 110 closed on 9 September 2026** — the postcode resolver now has a store, a consumer and a refresh procedure — and its section has deleted itself, so the range begins at **111** today and will begin somewhere else tomorrow. A note rather than an edit: that paragraph is a single 2.5 KB block whose delta serialises to about 9.6 KB, which is the size at which a write has already failed once on this board, and re-sending it by hand to change one digit risks damaging text nobody asked to touch. **Do not “fix” the number — it is designed to go stale. The first phase below COORDINATES is always the next one to run.**

 **DO NOT RE-CUT THE SPAN IN THE HEADING ABOVE AS PHASES FINISH.** It names the block, not the remainder. The paragraph below it says "the seven phases", and the board items are named "BUILD 1 of 7" through "BUILD 7 of 7" — so shaving the heading leaves it contradicting its own body one line down and the board at the same time. **Phases 102 and 103 each did exactly that**, taking it from "102 to 108" to "103 to 108" to "104 to 108" on the same day, which is how a heading and its body drift apart one reasonable-looking edit at a time. Record progress in this paragraph instead.

 **Scope set by Lakhbir, 6 September 2026.** Not a demo. **Build it as if it ships**, and the developer finishes what could not be finished here. When the seven phases are done, the working set is three things:

|  **1** |  **Caprebate HTML** |  The public website, the assessment, a **customer login**, and the client portal behind it. One application. |
| --- | --- | --- |
|  **2** |  **Caprebate back end** |  The staff application — Sales, Admin, Accounting, Surveying, and a super user who creates the rest. |
|  **3** |  **Caprebate Developer Spec** |  One document: the user cases, how to build it, the wireframe, and what every API does. |

 **Fifteen existing files fold into those three and are then archived, not deleted** — four wireframes, three specs, the client script, the journey map, the business flow, the sample report, the validation brief, the provenance map and the data-sourcing blueprint. **Each phase archives what it supersedes at the moment it replaces it**, with a note saying where the content went. **THE FOLD IS CLOSED. ****Phase 108 swe****pt up the last seven on 9 S****ep****tember 2026** and the count resolves like this: **fo****u****rteen were archived by the fold ****p****hases** — 104 four, 107 three, 108 seven — and the fifteenth, the retired Client Journey (FINAL), was superseded on 3 September, found to exist on disk nowhere, and recovered by Phase 100 from an attachment on the handover pack. **So “f****i****fteen” and “the fold archived fourteen” are both true and neither ****s****hould**** ****be corrected into the other.** Every archived file sits in `_archive/superseded/` with a dated README saying where its content went, and where one of them disagrees with the running application, the application is right. 

 **What is NOT touched, and it is not negotiable:** the twelve rulebooks, the twenty code and test files, the eight policy documents and the 219 governance exports. That is the evidence a tax adviser, a surveyor, a solicitor and a data protection officer sign off, and the harness reads it. Consolidating deliverables is housekeeping; deleting the evidence base would destroy the thing that makes the build defensible. **Seven of the eight policy documents were DRAFT TEMPLATES, not evidence: Phase 115 archived them on 10 September 2026, after carrying every line that existed only in a template into the governance pack as a flagged draft addition. The eighth, the engagement letter, stays live.**


## The stack, and the bet inside it

 Node and TypeScript, settled 6 September 2026, because the engine, the eleven data modules, the upload handler and every assertion in the four suites already are TypeScript or JavaScript, and a PHP port of a tax engine that must keep its whole site harness green is the largest and riskiest job in the project.


 **THIS PARTIALLY REVERSES THE 1 SEPTEMBER DECISION** that WordPress is the whole back end and front end, and that must be recorded rather than quietly assumed. The reversal is narrow and the fallback is defined: **if the host can run a Node process, this ships behind WordPress. If it cannot, this becomes the executable specification the PHP rebuild is tested against** — the tests define done either way, so no work is thrown away. **Whether the hosting can run Node is still unanswered and it is the question that most changes the developer's price.** It sits on the board.

## The security baseline — every phase builds to this, and none of them restates it

 **"As if it ships" means these are requirements, not aspirations, and each one is testable.**

-  **Authorise on the server, for that requester and that specific object, on every request.** Never trust a client-side check, a hidden field or an unguessable URL. This is requirement DB-W1 in the Developer Brief and it carries six acceptance tests, DB-W1-T1 to DB-W1-T6 — build to those.


-  **Client documents are written OUTSIDE the web root** and served only through an endpoint that authorises each request. A file placed in a public uploads folder is readable by anyone who holds or guesses the URL.

-  **Uploads:** allow-list on the server not the client, size cap, **content sniffing rather than trusting the extension**, and no execute permission on the storage directory.

-  **Passwords** hashed with argon2id or bcrypt, never logged, never returned. **Sessions** httpOnly, secure, sameSite, rotated on privilege change, revocable server-side.

-  **Escape on output, never build HTML by concatenation.** No `innerHTML` with anything a user supplied. A Content-Security-Policy with no `unsafe-inline`.

-  **Validate every input server-side.** Client-side validation is a courtesy to the user and is not a control.

-  

 

-  **No personal data in URLs, logs or error messages.** Rate-limit authentication and anything that can fire a paid call.

-  **The audit log is append-only and tamper-evident** — that is already a data protection officer determination, not a design choice.

-  **The four non-negotiables are security controls here, not business rules:** the anchor quarantine, the name exclusion register, the RECEIPT_CONTRACT call order, and unknown never routing to the favourable branch.

 **What is honestly beyond this build, and phase 108 says so in the developer's own list:** TLS and certificates, production secrets management, a web application firewall, penetration testing, real API credentials, email deliverability, and the hosting itself.

## Two gates stay shut, and the build must show them shut

 **Free register calls** are gated on a published privacy notice — `CB_REGISTRY.precondition` is `enabled:false` and its own text says why. **Paid calls** are gated on a signed engagement asserted server-side, plus one operator click that then fires everything outstanding. **Do not open either to make a screen flow.** The connectors are stubbed; the gates are real.

---

# ▶ THE CRM LAYER — phases 116 to 125. Ten phases, built onto the back end that already exists

 **Added 10 September 2026, at Lakhbir's instruction, after two CRM documents were read against the build.** Both sit on the Mac Desktop and in no folder of the tree: **CapRebate - CRM.docx**, a full CRM requirements specification (version 1.0, dated 2 September 2026), and **CapRebate - CRM.1.docx**, a startup cut of it saying what to build first and what to leave. **Both are generic capital allowances CRM specifications, and neither knows that 09-app/backend exists.** Handed to a developer as written, they would be priced as a rebuild of what is already running, and several of their lines would break rules this build enforces.

 **The ten phases build two things.** First, **what the documents add that the build does not have**: lead management, organisation depth, full property records, a claim record so one client can hold several properties and several claims, staff tasks and next actions, introducers, management dashboards, search, saved views and export. Second, **what both documents miss**: the rules the application already enforces, the capital allowances facts a claim cannot be defended without, the compliance registers the governance pack describes, and the commercial model — the fee controls and the referral channel.

 **The order is the dependency order.** The backbone — organisation, property, claim — comes first because every other phase hangs off it; the pipeline next, because tasks, automation and dashboards are keyed on its stages; then tasks, documents, introducers, the claim's tax facts, finance, the compliance registers, dashboards and search; and the fold into the Developer Spec last. **Run them straight down the page, like every other phase.** Each block carries the same CRM ground rules, so they are not repeated here.

 **Where a CRM document and the running application disagree, the application is right.** The conflicts already known, so no phase rediscovers them: seven roles against the five built; a client portal listed as future work that is already built; an accountant portal, when the client's accountant has no login by decision; a surveyor who sees claim information and value, against the anchor quarantine; finance editing the agreed fee, when the fee derives from the engine; seventeen generic stages, against the ten-stage operating procedure with a gate at every stage and a reasoned exit; survey booked, against a desktop-first model; payment tracking, against no card processor and an invoice email that waits on a fraud procedure; mandatory fields and lead scoring, against unknown never routing to the favourable branch; AI document extraction as future work, when extraction and the receipt strip already run behind the upload handler; and documents as simple uploads, against the receipt contract and the three stores. **CRM 1 writes each into a disposition table, 09-app/CAPREBATE-CRM-DISPOSITION.md, which is the scope of all ten.**

 **Phase 115 changed one thing here, and it is small.** It redrafted clause 7 of the engagement letter and section 4 of the privacy notice so both name the processors — so any CRM host, email provider or accounting integration this work introduces is a processor that must be added to both before it carries client data. It also built the break-even reading, which CRM 6 reads rather than re-implements.

 **Progress, and the board.** All ten CRM phases have run, and all ten are Done. CRM 1 of 10 to CRM 9 of 10 ran between 10 and 12 September 2026, together with the gated-exit repair that CRM 2 of 10 found was needed. They built, on migrations 009 to 019: the organisation, property and claim record; leads and the procedure's ten stages, each with a gate; staff tasks and automation; documents on the claim; introducers and the referral channel; the claim's capital allowances facts and figures; finance on the claim; the compliance registers; and dashboards, search, lists and admin settings. PHASE HISTORY records what each did, and the disposition table's Parts G to P are their evidence. CRM 10 of 10 ran on 12 September 2026 and is Done. It closed the disposition table with a check that can fail, 03-app/caprebate-crm-fold-check.cjs, and wrote its evidence as Part Q. It made the Developer Spec read as one system, with what the CRM needs and this build cannot have at section 5.5. It wrote the administrator guide and the user guide, 09-app/CAPREBATE-ADMIN-AND-USER-GUIDE.md, with training for every CRM screen. And it archived the two Word documents into _archive/superseded/. **T****h****e**** ****C****R****M**** follow-on**** ****r****a****n on 12**** ****Se****p****t****e****mb****er**** ****2026 and ****i****s D****on****e****.** It built the eleven adopted rows CRM 10 of 10's check found unbuilt, on migration 020: the introducer and the source read through the lead; the claim team; the document centre; the dashboard over a period as the reports screen; the estimated fee on the claim; the prior-claim position derived; and mandatory documents, built and switched off. It fixed the nine defects the guide's exercises found, a client's upload from a browser among them, and gave Admin an audit log page and npm run verify-audit. Its evidence is Part R. The fold check is green on a refreshed snapshot, with no row carried. Which Stage 2 documents are mandatory, and at which stage, is put to Lakhbir in CAPREBATE QUESTIONS, and the data import is still a one-line confirmation there. The one correction the gated-exit repair left undone - the site file's own renderer - was made by the Phase 127 sweep on 12 September 2026. **Phase 128 ****ran on 12 September**** 2026 and is Done** - it moved forty finished drafts from Done, and two built items from Blocked - question, to Built - awaiting sign-off, each housed in one register. **Phase 129 ran on 12 September 2026 and Phase 129a on 13 September 2026, and both are Done. W****h****at**** ****ru****ns**** n****e****x****t**** is Phas****e**** ****129b,**** th****en ****t****he**** sweep.** Do not re-cut the span in this heading as phases finish: it names the block, as THE BUILD - phases 102 to 108 does, and shaving it leaves the heading contradicting its own body. Record progress in this paragraph instead.


 **Added 13 September 2026 by Phase 129b, and corrected the same day by the Phase 130 sweep.** The paragraph above says what runs next is Phase 129b, then the sweep. That is out of date twice over: Phase 129b ran on 13 September 2026 and is Done, and so did the Phase 130 sweep, which found work in the board's comments that nothing stops and wrote it into two new phases. What runs next is Phase 131, then Phase 132, then the sweep as Phase 133. A note rather than an edit, because that paragraph carries more than a hundred formatting runs and update_block replaces every one of them.


 **Added 14 September 2026 by Phase 131, and corrected 17 September 2026 by Phase 133.** Phase 131 ran on 13 and 14 September 2026 and is Done. This note, and the one of 13 September above it, used to name the phases that ran next; every phase they named has since run and is recorded in PHASE HISTORY. What runs next is the first phase below COORDINATES.


---

# ▶ THE BACK OFFICE AND PORTAL CLEAN-UP — phases 134 to 144. Eleven phases, from Lakhbir's review of the test site

 **Added 18 September 2026, at Lakhbir's instruction, after using caprebate-test.vercel.app.** Lakhbir listed thirteen things wrong with how the back office and the client portal look and read. They are about the screens, not the rules underneath: every phase here changes what a person sees and reads, and none of them weakens what the server enforces. **Each point has a home:** company name first, and one company with many claims — Phase 134. Repeated tabs, and too much under More — 135. The home page as tiles, in Lakhbir's order — 136. Leads as cards, split so a new one cannot get lost — 137. Coloured sections that fold, and cutting what is bloat — 138. Where each fact came from, an Approve box, and telling the client — 139. A documents folder, and staff uploads — 140. Free-typed email from contactus@caprebate.com — 141. Internal and client chat with file upload — 142. Grants and contributions — 143. Plain English a 12-year-old can read — 144, last, so it catches the words the other ten add. The sweep moves to 145. **Run them straight down the page.** Each block carries the same eight ground rules, so they are not repeated here. Each phase has its own item in 05 · FOR DEVELOPMENT, named "Clean-up N of 11".


 **Three of them touch a decision that is not Claude's, and each is built switched off with a question to Lakhbir:** keeping the original of a client's uploaded file (140), the email provider and the contactus@ mailbox (141), and whether the surveyor sees either chat thread (142).

---

## PHASE 156a — the missing keys in Vercel, and Ordnance Survey and Cloudflare set up, step by step

 **Model: Opus. Written 4 October 2026** when Lakhbir asked for Phase 156 to be broken down. **The keys the test website is missing, from the key check of 4 October (names only), and the two free accounts it still needs.** Each PART B line runs only once its PART A step is done; a phase whose PART A is not done yet is left in place, not closed.

 **Phase 156 was split into 156a to 156e on 4 October 2026.** Lakhbir: "lets break down phase 156 and include 156a this is a step by step on adding the missing keys in vercel and setting up OS, Cloudfare". The one Phase 156 held every outside service in one block (its PART A ten steps for Lakhbir, its PART B seven for Claude). It is now five phases, each one service area, run straight down the page. **Where each old step went**, so older text that says "Phase 156 A5" or "156 B3" can be followed:

| Old step | Now | | Old step | Now |
| --- | --- | --- | --- | --- |
| A1 Cloudflare Turnstile | 156a A3 | | B1 Turnstile in the code | 156a B2 |
| A5 CQC, EPC (and its OS addition) | 156a A1, A2 | | B3 test calls: CQC, EPC | 156a B3 |
| A5 Homedata (key, balance) | 156e A1 | | B3 Companies House, Anthropic, Homedata calls; "answer it myself" | 156e B1, B2 |
| A3 the reply timer | 156b A1 | | B2 WhatsApp | 156c B1 |
| A4 IONOS signing | 156b A2 | | B4 the Connections page | 156e B3 |
| A2 WhatsApp | 156c A1 | | B5 update the documents | every phase |
| A6 Zoom | 156d A1 | | B6 Zoom's call length | 156d B1 |
| A7 Google Analytics | 156e A5 | | B7 the care regulators' lists | 156e B4 |
| A8 Anthropic, A9 GoAddress, A10 Didit | 156e A2, A3, A4 | | | |

 The board item "Phase 156" became 156a, with new items for 156b to 156e (all in 05 · FOR DEVELOPMENT, all in the tracker).

```
═══ FIRST, BEFORE ANYTHING ELSE ═══
This is the Caprebate build. Lakhbir pasted this phase from the monday.com
RUN SHEET: the document on the CAPREBATE ACTION PLAN item (item 12976111942,
board "💰 Health Capital" 18422317809, doc 18429698457). The same phase is in
OneDrive at Caprebate/00-START-HERE/hub/ACTION-PLAN.md. The repository is
github.com/ldhillonaqlios/caprebate. On the Mac the working copy is
Development/, inside OneDrive: /Users/lakhbir/Library/CloudStorage/
OneDrive-AqliosLTD/Health Capital Allowances/Business Development/Development
(quote it: it has spaces). git pull, then git log --oneline. Read THE
STANDING INSTRUCTION (thirteen points, AMENDMENTS 1 AND 2, the CLOSING CHECK)
and COORDINATES in ACTION-PLAN.md first. Claim the work in hub/CLAIM.md
(commit and push first; a claim already there stops you). Set this phase's
board item to "Working on it" and fill "Claimed by (machine)"; if it has no
item, create one in 05 · FOR DEVELOPMENT and add it to the tracker. Work on a
claude/... branch; never push to main; Lakhbir merges. Retag what you touch
and give every loose end a home.

KEEP ONEDRIVE UP TO DATE, all the way through:
- monday is where we run and track the work; OneDrive (the repository) is the
  full copy. Every document you write or change goes in OneDrive, never only
  on monday.
- Every board change you make (status, owner, note, new item) is written to
  hub/TRACKER.csv too (node 03-app/caprebate-tracker.cjs), and
  node 03-app/caprebate-tracker.cjs check passes. If the board and the
  tracker disagree, stop and ask Lakhbir which is right.
- The board is shared: no client data and no keys on it.
- Commit and push as you go. If you are not on the Mac's OneDrive copy, say
  so at the end and tell Lakhbir to git pull on the Mac.

WHEN THE PHASE IS DONE, in this order:
1. Write the full record at the end of hub/PHASE-HISTORY.md (OneDrive).
2. Add a short ACTIONS AND OUTCOMES entry at the END of the monday run
   sheet, below the last entry under "DONE - ACTIONS AND OUTCOMES": a title
   line "<phase> - <date>", then what you did, what you found, what is left
   and where it now lives, the test count, and the branch or pull request.
   Plain words; no client data, no keys. (update_doc add_markdown_content
   with no after_block_id adds it at the end.) Put the same entry at the top
   of your PHASE-HISTORY record.
3. DELETE THIS SECTION from the top of the run sheet (its title, its note
   and this block: read_docs with include_blocks gives the block ids, then
   one delete_blocks) AND from hub/ACTION-PLAN.md. The next phase is then
   at the top of both.
4. Set this phase's board item to its true status (Done goes to group Z) and
   clear "Claimed by (machine)"; write both to the tracker.
5. Clear hub/CLAIM.md in the final commit, push, and tell Lakhbir in a few
   plain lines what was done and what is next.
═══════════════════════════════════

RULES FOR EVERY STEP: never ask Lakhbir to paste a key into the chat. Keys go
into Vercel (project caprebate-test > Settings > Environment Variables,
Production, Sensitive) and into the key file, by him. You may list NAMES in
Vercel (the Vercel connector; project id prj_sKZ3nEAEc5GLC8j3bEFcZv3GmGan);
never read, decrypt or print a value. A key in Vercel does nothing until its
name is also in TEST_DEPLOY_KEYS (api/index.mjs). A setting reaches the site
only on the next deploy. Nothing here switches anything on for real clients:
the test website and invented data only, and each service's paper (privacy
notice, the data protection officer's approval of a transfer) stays its own
sign-off.

THE CHECK OF 4 OCTOBER 2026 (names only, never a value) - re-check it first:
  IN VERCEL ALREADY: Didit (3), Companies House, Zoom (6), IONOS sending (4)
    and reading (4), GoAddress, REPLY_TIMER_TOKEN, CAPREBATE_MFA_KEY, the test
    password, CAPREBATE_ORIGINALS_KEY, Turso (2), the Blob store.
  IN THE KEY FILE BUT NOT IN VERCEL: EPC_API_TOKEN, CQC_SUBSCRIPTION_KEY.
  IN NEITHER: OS_DATA_HUB_API_KEY, TURNSTILE_SITE_KEY, TURNSTILE_SECRET_KEY.
  (Not for this phase: WhatsApp - 156c; Homedata, Anthropic, Google
  Analytics - 156e.)
  How: the Vercel connector's filter_project_envs on the project, reading only
  each "key"; the key file by name only:
    awk -F= '/^[A-Z][A-Z0-9_]*=/{print $1}' ~/.caprebate-secrets.env

PART A - LAKHBIR, STEP BY STEP (about 30 minutes; tick each in
hub/KEYS-AND-SWITCHES.md, or tell Claude and Claude ticks it)

A1. EPC AND CQC INTO VERCEL (5 minutes). Both keys are already in our key file.
    1. Open the key file: OneDrive > Health Capital Allowances > "Private -
       keys (do not share)" > caprebate-secrets.txt (the Mac's
       ~/.caprebate-secrets.env is a link to it). Copy from it; paste nowhere
       but Vercel.
    2. vercel.com > sign in > the caprebate-test project > Settings >
       Environment Variables > Add New.
    3. Key: EPC_API_TOKEN. Value: everything after "EPC_API_TOKEN=" on its
       line (no quotes, no spaces). Environments: Production only. Tick
       Sensitive. Save.
    4. The same for CQC_SUBSCRIPTION_KEY.
    (Not HOMEDATA_API_KEY: it is paid and waits for 156e.)
A2. ORDNANCE SURVEY (free, about 10 minutes). It draws the building outlines on
    the report's site plan. The free OS OpenData plan needs no letter to
    Ordnance Survey (the licence email is not being sent, 4 Oct 2026).
    1. osdatahub.os.uk > Sign up (or Log in) with the company email. Choose
       the OS OpenData plan: free, no card.
    2. Dashboard > API projects > Create a new project. Name it "Caprebate
       test".
    3. Inside the project: Add an API to this project > OS Features API.
    4. The project page shows a Project API Key. Copy it.
    5. Vercel (as A1): Key OS_DATA_HUB_API_KEY, the value, Production,
       Sensitive. Save.
    6. Key file: add a new line  OS_DATA_HUB_API_KEY=<the key>  and save, so
       the Mac's copy matches Vercel.
A3. CLOUDFLARE TURNSTILE (free, about 10 minutes). The anti-bot check on the
    home page's contact form; today the page shows Cloudflare's TEST key and
    the server check is off.
    1. dash.cloudflare.com > sign in, or create a free account with the
       company email.
    2. Left menu: Turnstile > Add widget.
    3. Widget name "Caprebate contact form". Hostnames: caprebate-test.
       vercel.app (add caprebate.co.uk later, when the real site goes live).
       Widget mode: Managed. Create.
    4. Cloudflare shows a SITE KEY and a SECRET KEY. In Vercel add
       TURNSTILE_SITE_KEY and TURNSTILE_SECRET_KEY (Production, Sensitive).
    5. Key file: add the same two lines.
    6. Ask Sadique to approve Cloudflare (a US company) for testing. Until he
       does, the server check stays off and every enquiry is kept unchecked
       (the function log says so).
A4. REDEPLOY (1 minute): Vercel > Deployments > the newest Production
    deployment > the three dots > Redeploy. A new setting only reaches the
    site on the next deploy.
A5. Tell Claude which of A1 to A3 are done. Never paste a key into the chat.

PART B - CLAUDE (after A5)

B1. Confirm the new names are in Vercel and the key file (names only), and
    that a deploy since then is live.
B2. TURNSTILE IN THE CODE (old 156 B1): add TURNSTILE_SITE_KEY and
    TURNSTILE_SECRET_KEY to TEST_DEPLOY_KEYS; serve the real site key in the
    contact form instead of Cloudflare's test key (src/web/home-site.ts);
    prove the server check refuses a missing or wrong token and passes a
    right one (Cloudflare publishes always-pass and always-fail test keys -
    use those in tests, red on the code before); record the transfer as
    waiting on Sadique and do NOT set international_transfer_approved
    without his yes.
B3. ONE TEST LOOKUP EACH for EPC, CQC and the Ordnance Survey site plan, under
    the five conditions of Word question 170 (node src/cli.ts smoke ...; our
    own company and 70 Whitehall, never a client). Report PASS or NO per
    service. Switch nothing on that ships. EPC_API_TOKEN, CQC_SUBSCRIPTION_KEY
    and OS_DATA_HUB_API_KEY are already in TEST_DEPLOY_KEYS.
B4. Update hub/KEYS-AND-SWITCHES.md and the Developer Spec's keys table to
    what is now true.

When every line that could run is done: run every check in COORDINATES,
re-derive the figures, update the registers and hub/KEYS-AND-SWITCHES.md, write
the record, and leave each PART A step not yet done as a line in
hub/WAITING-ON-PEOPLE.md.
Then do WHEN THE PHASE IS DONE, at the top of this block.
```


## PHASE 156b — email: the reply timer and signed emails

 **Model: Opus. Written 4 October 2026** when Lakhbir asked for Phase 156 to be broken down. **The two email steps of the old Phase 156.** Each PART B line runs only once its PART A step is done; a phase whose PART A is not done yet is left in place, not closed.

```
═══ FIRST, BEFORE ANYTHING ELSE ═══
This is the Caprebate build. Lakhbir pasted this phase from the monday.com
RUN SHEET: the document on the CAPREBATE ACTION PLAN item (item 12976111942,
board "💰 Health Capital" 18422317809, doc 18429698457). The same phase is in
OneDrive at Caprebate/00-START-HERE/hub/ACTION-PLAN.md. The repository is
github.com/ldhillonaqlios/caprebate. On the Mac the working copy is
Development/, inside OneDrive: /Users/lakhbir/Library/CloudStorage/
OneDrive-AqliosLTD/Health Capital Allowances/Business Development/Development
(quote it: it has spaces). git pull, then git log --oneline. Read THE
STANDING INSTRUCTION (thirteen points, AMENDMENTS 1 AND 2, the CLOSING CHECK)
and COORDINATES in ACTION-PLAN.md first. Claim the work in hub/CLAIM.md
(commit and push first; a claim already there stops you). Set this phase's
board item to "Working on it" and fill "Claimed by (machine)"; if it has no
item, create one in 05 · FOR DEVELOPMENT and add it to the tracker. Work on a
claude/... branch; never push to main; Lakhbir merges. Retag what you touch
and give every loose end a home.

KEEP ONEDRIVE UP TO DATE, all the way through:
- monday is where we run and track the work; OneDrive (the repository) is the
  full copy. Every document you write or change goes in OneDrive, never only
  on monday.
- Every board change you make (status, owner, note, new item) is written to
  hub/TRACKER.csv too (node 03-app/caprebate-tracker.cjs), and
  node 03-app/caprebate-tracker.cjs check passes. If the board and the
  tracker disagree, stop and ask Lakhbir which is right.
- The board is shared: no client data and no keys on it.
- Commit and push as you go. If you are not on the Mac's OneDrive copy, say
  so at the end and tell Lakhbir to git pull on the Mac.

WHEN THE PHASE IS DONE, in this order:
1. Write the full record at the end of hub/PHASE-HISTORY.md (OneDrive).
2. Add a short ACTIONS AND OUTCOMES entry at the END of the monday run
   sheet, below the last entry under "DONE - ACTIONS AND OUTCOMES": a title
   line "<phase> - <date>", then what you did, what you found, what is left
   and where it now lives, the test count, and the branch or pull request.
   Plain words; no client data, no keys. (update_doc add_markdown_content
   with no after_block_id adds it at the end.) Put the same entry at the top
   of your PHASE-HISTORY record.
3. DELETE THIS SECTION from the top of the run sheet (its title, its note
   and this block: read_docs with include_blocks gives the block ids, then
   one delete_blocks) AND from hub/ACTION-PLAN.md. The next phase is then
   at the top of both.
4. Set this phase's board item to its true status (Done goes to group Z) and
   clear "Claimed by (machine)"; write both to the tracker.
5. Clear hub/CLAIM.md in the final commit, push, and tell Lakhbir in a few
   plain lines what was done and what is next.
═══════════════════════════════════

RULES FOR EVERY STEP: never ask Lakhbir to paste a key into the chat. Keys go
into Vercel (project caprebate-test > Settings > Environment Variables,
Production, Sensitive) and into the key file, by him. You may list NAMES in
Vercel (the Vercel connector; project id prj_sKZ3nEAEc5GLC8j3bEFcZv3GmGan);
never read, decrypt or print a value. A key in Vercel does nothing until its
name is also in TEST_DEPLOY_KEYS (api/index.mjs). A setting reaches the site
only on the next deploy. Nothing here switches anything on for real clients:
the test website and invented data only, and each service's paper (privacy
notice, the data protection officer's approval of a transfer) stays its own
sign-off.

PART A - LAKHBIR

A1. THE REPLY TIMER (old 156 A3). You chose cron-job.org on 1 Oct; the website
    side is built and REPLY_TIMER_TOKEN is in Vercel. If the job is not made:
    1. cron-job.org > sign in > Create cronjob.
    2. URL https://caprebate-test.vercel.app/hooks/read-replies, every 5
       minutes, method POST.
    3. Advanced > Headers: Authorization = Bearer <the REPLY_TIMER_TOKEN
       value, which only you have>.
    4. Save. If it is made already, open its history: each run should show
       200. A 401 means the word does not match; a 403 or a Vercel login page
       means Vercel's deployment protection is in the way - tell Claude.
A2. IONOS - CHECK EMAILS ARE SIGNED (old 156 A4; the first test email went to
    junk).
    1. IONOS control panel > Domains & SSL > caprebate.co.uk > DNS.
    2. Check there is a DKIM record for IONOS mail and an SPF record that names
       IONOS (IONOS shows the exact value it wants; copy it from there). If
       IONOS offers to switch DKIM on for the domain, switch it on.
    3. Send a test email from the back office to the address mail-tester.com
       gives you, and tell Claude the score.

PART B - CLAUDE

B1. Read when replies were last read (the mailbox_reads row, Phase 155) and
    whether Admin's home shows the "Email replies are not being read" warning
    on the test website; report what cron-job.org's history should then show.
B2. With the mail-tester score: name each thing it marks down and whether it
    is ours to fix in code (a header, the From line) or Lakhbir's in IONOS
    (DNS). Fix what is ours, with a test.

When every line that could run is done: run every check in COORDINATES,
re-derive the figures, update the registers and hub/KEYS-AND-SWITCHES.md, write
the record, and leave each PART A step not yet done as a line in
hub/WAITING-ON-PEOPLE.md.
Then do WHEN THE PHASE IS DONE, at the top of this block.
```


## PHASE 156c — WhatsApp

 **Model: Opus. Written 4 October 2026** when Lakhbir asked for Phase 156 to be broken down. **The old Phase 156's WhatsApp steps.** Each PART B line runs only once its PART A step is done; a phase whose PART A is not done yet is left in place, not closed.

```
═══ FIRST, BEFORE ANYTHING ELSE ═══
This is the Caprebate build. Lakhbir pasted this phase from the monday.com
RUN SHEET: the document on the CAPREBATE ACTION PLAN item (item 12976111942,
board "💰 Health Capital" 18422317809, doc 18429698457). The same phase is in
OneDrive at Caprebate/00-START-HERE/hub/ACTION-PLAN.md. The repository is
github.com/ldhillonaqlios/caprebate. On the Mac the working copy is
Development/, inside OneDrive: /Users/lakhbir/Library/CloudStorage/
OneDrive-AqliosLTD/Health Capital Allowances/Business Development/Development
(quote it: it has spaces). git pull, then git log --oneline. Read THE
STANDING INSTRUCTION (thirteen points, AMENDMENTS 1 AND 2, the CLOSING CHECK)
and COORDINATES in ACTION-PLAN.md first. Claim the work in hub/CLAIM.md
(commit and push first; a claim already there stops you). Set this phase's
board item to "Working on it" and fill "Claimed by (machine)"; if it has no
item, create one in 05 · FOR DEVELOPMENT and add it to the tracker. Work on a
claude/... branch; never push to main; Lakhbir merges. Retag what you touch
and give every loose end a home.

KEEP ONEDRIVE UP TO DATE, all the way through:
- monday is where we run and track the work; OneDrive (the repository) is the
  full copy. Every document you write or change goes in OneDrive, never only
  on monday.
- Every board change you make (status, owner, note, new item) is written to
  hub/TRACKER.csv too (node 03-app/caprebate-tracker.cjs), and
  node 03-app/caprebate-tracker.cjs check passes. If the board and the
  tracker disagree, stop and ask Lakhbir which is right.
- The board is shared: no client data and no keys on it.
- Commit and push as you go. If you are not on the Mac's OneDrive copy, say
  so at the end and tell Lakhbir to git pull on the Mac.

WHEN THE PHASE IS DONE, in this order:
1. Write the full record at the end of hub/PHASE-HISTORY.md (OneDrive).
2. Add a short ACTIONS AND OUTCOMES entry at the END of the monday run
   sheet, below the last entry under "DONE - ACTIONS AND OUTCOMES": a title
   line "<phase> - <date>", then what you did, what you found, what is left
   and where it now lives, the test count, and the branch or pull request.
   Plain words; no client data, no keys. (update_doc add_markdown_content
   with no after_block_id adds it at the end.) Put the same entry at the top
   of your PHASE-HISTORY record.
3. DELETE THIS SECTION from the top of the run sheet (its title, its note
   and this block: read_docs with include_blocks gives the block ids, then
   one delete_blocks) AND from hub/ACTION-PLAN.md. The next phase is then
   at the top of both.
4. Set this phase's board item to its true status (Done goes to group Z) and
   clear "Claimed by (machine)"; write both to the tracker.
5. Clear hub/CLAIM.md in the final commit, push, and tell Lakhbir in a few
   plain lines what was done and what is next.
═══════════════════════════════════

RULES FOR EVERY STEP: never ask Lakhbir to paste a key into the chat. Keys go
into Vercel (project caprebate-test > Settings > Environment Variables,
Production, Sensitive) and into the key file, by him. You may list NAMES in
Vercel (the Vercel connector; project id prj_sKZ3nEAEc5GLC8j3bEFcZv3GmGan);
never read, decrypt or print a value. A key in Vercel does nothing until its
name is also in TEST_DEPLOY_KEYS (api/index.mjs). A setting reaches the site
only on the next deploy. Nothing here switches anything on for real clients:
the test website and invented data only, and each service's paper (privacy
notice, the data protection officer's approval of a transfer) stays its own
sign-off.

PART A - LAKHBIR (old 156 A2) - WHATSAPP, messaging clients from the back
office. Meta charges per template message.

A1. 1. business.facebook.com: make sure CAP REBATE LTD has a Meta Business
       account, verified (Business settings > Security centre).
    2. developers.facebook.com > My Apps > Create app > type Business > add
       the WhatsApp product, linked to that business account.
    3. WhatsApp > API Setup: add a phone number that is NOT already used in
       the WhatsApp app, and verify it by text or call. Copy its "Phone number
       ID" -> WHATSAPP_PHONE_NUMBER_ID.
    4. Business settings > Users > System users: add a system user (Admin),
       give it the app and the WhatsApp account, and generate a token with
       whatsapp_business_messaging and whatsapp_business_management, set to
       never expire -> WHATSAPP_ACCESS_TOKEN.
    5. App settings > Basic > App secret (Show) -> WHATSAPP_APP_SECRET.
    6. Make up a long random word (40+ characters) -> WHATSAPP_VERIFY_TOKEN.
    7. WhatsApp Manager > Message templates > Create: category Utility, a
       short opening message; submit and wait for approval. Its name ->
       WHATSAPP_OPENING_TEMPLATE; its language code (for example en_GB) ->
       WHATSAPP_TEMPLATE_LANGUAGE.
    8. Add all six to Vercel (Production, Sensitive) and to the key file, and
       redeploy.
    9. App > WhatsApp > Configuration > Webhook: callback URL
       https://caprebate-test.vercel.app/hooks/whatsapp, verify token = the
       word from step 6. Subscribe to "messages".
    10. Sadique confirms the Meta transfer (approved for testing only today)
        and the privacy notice line.
    The six names are already in TEST_DEPLOY_KEYS.

PART B - CLAUDE

B1. (old 156 B2) Once the six are in, send ONE opening template to Lakhbir's
    own number (ask him for it in the chat; never a client), read the
    webhook's reply, and report PASS or NO. Switch nothing else on.

When every line that could run is done: run every check in COORDINATES,
re-derive the figures, update the registers and hub/KEYS-AND-SWITCHES.md, write
the record, and leave each PART A step not yet done as a line in
hub/WAITING-ON-PEOPLE.md.
Then do WHEN THE PHASE IS DONE, at the top of this block.
```


## PHASE 156d — Zoom: the paid licence, a user for each member of staff, and call lengths

 **Model: Opus. Written 4 October 2026** when Lakhbir asked for Phase 156 to be broken down. **The old Phase 156's Zoom steps.** Each PART B line runs only once its PART A step is done; a phase whose PART A is not done yet is left in place, not closed.

```
═══ FIRST, BEFORE ANYTHING ELSE ═══
This is the Caprebate build. Lakhbir pasted this phase from the monday.com
RUN SHEET: the document on the CAPREBATE ACTION PLAN item (item 12976111942,
board "💰 Health Capital" 18422317809, doc 18429698457). The same phase is in
OneDrive at Caprebate/00-START-HERE/hub/ACTION-PLAN.md. The repository is
github.com/ldhillonaqlios/caprebate. On the Mac the working copy is
Development/, inside OneDrive: /Users/lakhbir/Library/CloudStorage/
OneDrive-AqliosLTD/Health Capital Allowances/Business Development/Development
(quote it: it has spaces). git pull, then git log --oneline. Read THE
STANDING INSTRUCTION (thirteen points, AMENDMENTS 1 AND 2, the CLOSING CHECK)
and COORDINATES in ACTION-PLAN.md first. Claim the work in hub/CLAIM.md
(commit and push first; a claim already there stops you). Set this phase's
board item to "Working on it" and fill "Claimed by (machine)"; if it has no
item, create one in 05 · FOR DEVELOPMENT and add it to the tracker. Work on a
claude/... branch; never push to main; Lakhbir merges. Retag what you touch
and give every loose end a home.

KEEP ONEDRIVE UP TO DATE, all the way through:
- monday is where we run and track the work; OneDrive (the repository) is the
  full copy. Every document you write or change goes in OneDrive, never only
  on monday.
- Every board change you make (status, owner, note, new item) is written to
  hub/TRACKER.csv too (node 03-app/caprebate-tracker.cjs), and
  node 03-app/caprebate-tracker.cjs check passes. If the board and the
  tracker disagree, stop and ask Lakhbir which is right.
- The board is shared: no client data and no keys on it.
- Commit and push as you go. If you are not on the Mac's OneDrive copy, say
  so at the end and tell Lakhbir to git pull on the Mac.

WHEN THE PHASE IS DONE, in this order:
1. Write the full record at the end of hub/PHASE-HISTORY.md (OneDrive).
2. Add a short ACTIONS AND OUTCOMES entry at the END of the monday run
   sheet, below the last entry under "DONE - ACTIONS AND OUTCOMES": a title
   line "<phase> - <date>", then what you did, what you found, what is left
   and where it now lives, the test count, and the branch or pull request.
   Plain words; no client data, no keys. (update_doc add_markdown_content
   with no after_block_id adds it at the end.) Put the same entry at the top
   of your PHASE-HISTORY record.
3. DELETE THIS SECTION from the top of the run sheet (its title, its note
   and this block: read_docs with include_blocks gives the block ids, then
   one delete_blocks) AND from hub/ACTION-PLAN.md. The next phase is then
   at the top of both.
4. Set this phase's board item to its true status (Done goes to group Z) and
   clear "Claimed by (machine)"; write both to the tracker.
5. Clear hub/CLAIM.md in the final commit, push, and tell Lakhbir in a few
   plain lines what was done and what is next.
═══════════════════════════════════

RULES FOR EVERY STEP: never ask Lakhbir to paste a key into the chat. Keys go
into Vercel (project caprebate-test > Settings > Environment Variables,
Production, Sensitive) and into the key file, by him. You may list NAMES in
Vercel (the Vercel connector; project id prj_sKZ3nEAEc5GLC8j3bEFcZv3GmGan);
never read, decrypt or print a value. A key in Vercel does nothing until its
name is also in TEST_DEPLOY_KEYS (api/index.mjs). A setting reaches the site
only on the next deploy. Nothing here switches anything on for real clients:
the test website and invented data only, and each service's paper (privacy
notice, the data protection officer's approval of a transfer) stays its own
sign-off.

PART A - LAKHBIR (old 156 A6) - ZOOM, A PAID LICENCE. The free plan ends calls
at 40 minutes and has no cloud recording (walkthrough calls ask for it).

A1. 1. zoom.us > Admin > Account management > Plans and billing: upgrade the
       host user (ZOOM_HOST_EMAIL) to Pro.
    2. marketplace.zoom.us > Manage > the app behind ZOOM_CLIENT_ID > Scopes:
       add cloud recording read.
    3. Sadique confirms Zoom's transfer for real clients (approved for testing
       only).
    4. Each call is hosted by its own member of staff (Phase 153f): add each
       member of staff who takes video calls as a user on our Zoom account,
       under the SAME email they sign in to Cap Rebate with, each with a Pro
       licence. Anyone not on Zoom falls back to the shared host.
    5. To see how long a call lasted and who came, add two more scopes to the
       same app: meeting:read:past_meeting:admin and
       meeting:read:list_past_participants:admin.

PART B - CLAUDE

B1. (old 156 B6) Once step 5's scopes are on: after a call, read GET
    /v2/past_meetings/{meetingId} (its duration) and /participants (how many
    came; keep the count and the minutes, never a name or an email); show
    them on the call and the Communication tab, with a test on recorded
    answers, red on the code before.

When every line that could run is done: run every check in COORDINATES,
re-derive the figures, update the registers and hub/KEYS-AND-SWITCHES.md, write
the record, and leave each PART A step not yet done as a line in
hub/WAITING-ON-PEOPLE.md.
Then do WHEN THE PHASE IS DONE, at the top of this block.
```


## PHASE 156e — the paid and paper-first services, the Connections page and the care regulators' lists

 **Model: Opus. Written 4 October 2026** when Lakhbir asked for Phase 156 to be broken down. **Everything else the old Phase 156 held: Homedata, Anthropic, GoAddress, Didit, Google Analytics (dropped for now; was to ask about), the Connections page and the Welsh and Scottish lists.** Each PART B line runs only once its PART A step is done; a phase whose PART A is not done yet is left in place, not closed.

```
═══ FIRST, BEFORE ANYTHING ELSE ═══
This is the Caprebate build. Lakhbir pasted this phase from the monday.com
RUN SHEET: the document on the CAPREBATE ACTION PLAN item (item 12976111942,
board "💰 Health Capital" 18422317809, doc 18429698457). The same phase is in
OneDrive at Caprebate/00-START-HERE/hub/ACTION-PLAN.md. The repository is
github.com/ldhillonaqlios/caprebate. On the Mac the working copy is
Development/, inside OneDrive: /Users/lakhbir/Library/CloudStorage/
OneDrive-AqliosLTD/Health Capital Allowances/Business Development/Development
(quote it: it has spaces). git pull, then git log --oneline. Read THE
STANDING INSTRUCTION (thirteen points, AMENDMENTS 1 AND 2, the CLOSING CHECK)
and COORDINATES in ACTION-PLAN.md first. Claim the work in hub/CLAIM.md
(commit and push first; a claim already there stops you). Set this phase's
board item to "Working on it" and fill "Claimed by (machine)"; if it has no
item, create one in 05 · FOR DEVELOPMENT and add it to the tracker. Work on a
claude/... branch; never push to main; Lakhbir merges. Retag what you touch
and give every loose end a home.

KEEP ONEDRIVE UP TO DATE, all the way through:
- monday is where we run and track the work; OneDrive (the repository) is the
  full copy. Every document you write or change goes in OneDrive, never only
  on monday.
- Every board change you make (status, owner, note, new item) is written to
  hub/TRACKER.csv too (node 03-app/caprebate-tracker.cjs), and
  node 03-app/caprebate-tracker.cjs check passes. If the board and the
  tracker disagree, stop and ask Lakhbir which is right.
- The board is shared: no client data and no keys on it.
- Commit and push as you go. If you are not on the Mac's OneDrive copy, say
  so at the end and tell Lakhbir to git pull on the Mac.

WHEN THE PHASE IS DONE, in this order:
1. Write the full record at the end of hub/PHASE-HISTORY.md (OneDrive).
2. Add a short ACTIONS AND OUTCOMES entry at the END of the monday run
   sheet, below the last entry under "DONE - ACTIONS AND OUTCOMES": a title
   line "<phase> - <date>", then what you did, what you found, what is left
   and where it now lives, the test count, and the branch or pull request.
   Plain words; no client data, no keys. (update_doc add_markdown_content
   with no after_block_id adds it at the end.) Put the same entry at the top
   of your PHASE-HISTORY record.
3. DELETE THIS SECTION from the top of the run sheet (its title, its note
   and this block: read_docs with include_blocks gives the block ids, then
   one delete_blocks) AND from hub/ACTION-PLAN.md. The next phase is then
   at the top of both.
4. Set this phase's board item to its true status (Done goes to group Z) and
   clear "Claimed by (machine)"; write both to the tracker.
5. Clear hub/CLAIM.md in the final commit, push, and tell Lakhbir in a few
   plain lines what was done and what is next.
═══════════════════════════════════

RULES FOR EVERY STEP: never ask Lakhbir to paste a key into the chat. Keys go
into Vercel (project caprebate-test > Settings > Environment Variables,
Production, Sensitive) and into the key file, by him. You may list NAMES in
Vercel (the Vercel connector; project id prj_sKZ3nEAEc5GLC8j3bEFcZv3GmGan);
never read, decrypt or print a value. A key in Vercel does nothing until its
name is also in TEST_DEPLOY_KEYS (api/index.mjs). A setting reaches the site
only on the next deploy. Nothing here switches anything on for real clients:
the test website and invented data only, and each service's paper (privacy
notice, the data protection officer's approval of a transfer) stays its own
sign-off.

PART A - LAKHBIR (each on its own; any order)

A1. HOMEDATA (paid address lookup, after a client signs). Copy
    HOMEDATA_API_KEY from the key file into Vercel (Production, Sensitive) and
    put a balance on the account (Word question 207); tell Claude when it is
    there. It stays OFF for real clients until a signed engagement.
A2. ANTHROPIC CLAUDE API (reading clients' documents). PAPER FIRST, KEY LAST.
    1. Sadique approves Anthropic as the document reader and its terms; the
       director signs (Developer Spec, the document-reading rows).
    2. Only then: console.anthropic.com > the company's organisation > Billing
       > API keys > Create key -> ANTHROPIC_API_KEY (the key file has one
       already; Vercel does not, on purpose).
A3. GOADDRESS ("Find my address"). 100 free lookups, then a paid plan: when the
    free ones run out, buy the smallest plan on its account page. Find out
    (and tell Claude) GoAddress's company and where it is hosted
    (src/connectors/sources.ts asks).
A4. DIDIT (identity checks). 500 free a month, then about 33 US cents a check.
    In Didit's console, set how long it keeps results, to match the retention
    schedule once Sadique approves it.
A5. GOOGLE ANALYTICS 4 - DROPPED FOR NOW (Lakhbir, 4 Oct 2026: the marketing
    team can pick it up later if needed). Nothing to do: the code stays OFF,
    and no one is asked for a measurement ID. See COORDINATES, "DECIDED - DO
    NOT REOPEN".

PART B - CLAUDE

B1. (old 156 B3, the rest) One recorded test call each, under Word question
    170's five conditions: Companies House (switched on for testing, never a
    recorded test call), the Anthropic key (one read of an invented page, only
    after A2), and Homedata (only once A1's balance is there). Report PASS or
    NO; switch nothing on that ships.
B2. When the free gate opens: put "answer it myself" (Word answer 180) on the
    four-stage funnel's details screen.
B3. (old 156 B4) AN ADMIN "CONNECTIONS" PAGE, so nobody has to read code to
    know: one row per outside service - key present (yes/no, never the value),
    switched on (and the switch's name), on for testing under a waiver or for
    real, last call and its result, and what it waits on. Read only; Admin
    only.
B4. (old 156 B7, added by Phase 155) THE WELSH AND SCOTTISH CARE REGULATORS'
    LISTS: an Admin upload for each downloaded file (the same import as
    "node src/cli.ts import-register", refused whole on wrong columns; the
    Scottish file is Windows-1252), each list's last import on B3's page, and
    a monthly reminder to import the new month's file. ASK LAKHBIR whether his
    2 Oct waiver ("All the free ones") covers these two; only on his yes add
    them to TEST_WEBSITE_LOOKUPS.

When every line that could run is done: run every check in COORDINATES,
re-derive the figures, update the registers and hub/KEYS-AND-SWITCHES.md, write
the record, and leave each PART A step not yet done as a line in
hub/WAITING-ON-PEOPLE.md.
Then do WHEN THE PHASE IS DONE, at the top of this block.
```


## PHASE 157 — Sweep and stress-test (the recurring one, always last)


 **Model: Opus.** **This is the one section that is never deleted.** It renumbers itself forward each time it runs and stays at the bottom of this list.

 **Why this exists.** Every sweep so far has found something, and several found things that had survived multiple earlier passes. Re-run it after a meaningful batch of phases has landed, and **always before anything external goes out** — the adviser pack, the solicitor brief, the Valuation Office letter, the insurance broker brief.

```text
═══ FIRST, BEFORE ANYTHING ELSE ═══
This is the Caprebate build. Lakhbir pasted this phase from the monday.com
RUN SHEET: the document on the CAPREBATE ACTION PLAN item (item 12976111942,
board "💰 Health Capital" 18422317809, doc 18429698457). The same phase is in
OneDrive at Caprebate/00-START-HERE/hub/ACTION-PLAN.md. The repository is
github.com/ldhillonaqlios/caprebate. On the Mac the working copy is
Development/, inside OneDrive: /Users/lakhbir/Library/CloudStorage/
OneDrive-AqliosLTD/Health Capital Allowances/Business Development/Development
(quote it: it has spaces). git pull, then git log --oneline. Read THE
STANDING INSTRUCTION (thirteen points, AMENDMENTS 1 AND 2, the CLOSING CHECK)
and COORDINATES in ACTION-PLAN.md first. Claim the work in hub/CLAIM.md
(commit and push first; a claim already there stops you). Set this phase's
board item to "Working on it" and fill "Claimed by (machine)"; if it has no
item, create one in 05 · FOR DEVELOPMENT and add it to the tracker. Work on a
claude/... branch; never push to main; Lakhbir merges. Retag what you touch
and give every loose end a home.

KEEP ONEDRIVE UP TO DATE, all the way through:
- monday is where we run and track the work; OneDrive (the repository) is the
  full copy. Every document you write or change goes in OneDrive, never only
  on monday.
- Every board change you make (status, owner, note, new item) is written to
  hub/TRACKER.csv too (node 03-app/caprebate-tracker.cjs), and
  node 03-app/caprebate-tracker.cjs check passes. If the board and the
  tracker disagree, stop and ask Lakhbir which is right.
- The board is shared: no client data and no keys on it.
- Commit and push as you go. If you are not on the Mac's OneDrive copy, say
  so at the end and tell Lakhbir to git pull on the Mac.

WHEN THE PHASE IS DONE, in this order:
1. Write the full record at the end of hub/PHASE-HISTORY.md (OneDrive).
2. Add a short ACTIONS AND OUTCOMES entry at the END of the monday run
   sheet, below the last entry under "DONE - ACTIONS AND OUTCOMES": a title
   line "<phase> - <date>", then what you did, what you found, what is left
   and where it now lives, the test count, and the branch or pull request.
   Plain words; no client data, no keys. (update_doc add_markdown_content
   with no after_block_id adds it at the end.) Put the same entry at the top
   of your PHASE-HISTORY record.
3. THIS SECTION IS NEVER DELETED: it is the sweep. Renumber it forward in
   BOTH places (the run sheet and hub/ACTION-PLAN.md) so it stays the
   highest number and last, just above "DONE - ACTIONS AND OUTCOMES".
4. Set this phase's board item to its true status (Done goes to group Z) and
   clear "Claimed by (machine)"; write both to the tracker.
5. Clear hub/CLAIM.md in the final commit, push, and tell Lakhbir in a few
   plain lines what was done and what is next.
═══════════════════════════════════
═══ CHECKED 3 OCTOBER 2026 — CORRECTIONS. They overrule the text below where they differ. ═══
MONDAY.COM IS THE MAIN BOARD AGAIN (Lakhbir, 3 Oct 2026): follow the note under
"How the phases at the top of this document work" - it overrules this phase's
banner. Write every change to the board AND to hub/TRACKER.csv.
BRANCHES: since 2 Oct work goes on claude/* branches and pull requests (#1-#7);
  Lakhbir merges, and a merge deploys the test website. Never push to main.
COUNT THE SUITE as `node --test $(git ls-files 'test/*.test.ts')` (plus any new
  file). The untracked stray files that made npm run check and the register
  check red on the Mac were deleted on 4 Oct 2026 with Lakhbir's yes; if a new
  untracked file appears, ask him before deleting it. Since Phase 154a1 (line
  11) the drift checker and the register check count only the test files git
  tracks and name any untracked one, so a stray file cannot turn them red.
  On 3 Oct: 1279 / 439 / 403 / 2221. The Mac can be overloaded: run the suite in
  chunks of about 12 files, and if a file fails with ETIMEDOUT reading the source,
  OneDrive stalled - wait and run it again.
SAY WHICH COPY YOU READ: the Mac, or a cloud clone (where five Mac-only tests
  always fail: Disposal, invoice-fraud SOP, rulebooks, logo, phase144a).
WORD QUESTIONS 230 AND 231 are settled in practice: Turso rebuilt on 1 Oct and
  Lakhbir said "yes its working" (PHASE-HISTORY ~11017); the Blob store holds the
  survey photos (~11132, ~11155). Write both answers into the Word document.
THE VERCEL CONNECTOR now reaches the project (caprebate-test): deployments,
  setting NAMES (never values) and redeploys; the browser pane reads the site
  while Lakhbir is signed in. The "Claude cannot" lines below are out of date.
THE NOTES AT THE END (the Acer copy, update_block, 06-.../_doc.xml) are history:
  the Acer is retired and _doc.xml is gone.
THE NUMBER: phases 153f, 154a1, 155 and 156 were added above this one on 3 Oct, so
  this sweep's heading is now PHASE 157.
FROM PHASE 153c (4 Oct 2026), A LOOSE END WITH ITS HOME HERE: the enquiry
  clean-up (src/web/enquiry-retention.ts, sweep-enquiries) deletes closed
  contact-form enquiries only. A funnel enquiry is a CRM lead (migration 061,
  leads.enquiry_id), tied to its organisation, contacts and bookings, so the
  job only COUNTS lost funnel leads past twelve months. Write the deletion path
  for a lead (what goes, what stays, the deletion-log entry), with its test,
  for the officer to check alongside Word question 222.
FROM PHASE 153d (4 Oct 2026), A LOOSE END WITH ITS HOME HERE: the draft
  introducer terms (06-commercial-and-governance/Caprebate-Introducer-Terms-
  DRAFT-v0.1.md) say a firm is "registered" once it has SIGNED them. The back
  office counts any firm marked ACCOUNTANT_FIRM (introducers.ts onFeeInvoiced).
  Once the director and the solicitor agree the terms, record the signature
  (a dated, append-only row) and pay model C only to a firm with one, with
  its test. Model C stays off until then.
FROM PHASE 153e (4 Oct 2026), A LOOSE END WITH ITS HOME HERE: the cost model
  (04-phase-work/phase9/caprebate-cost-model.cjs) now has preliminaries by job
  size, the index factor from a table, the insurance cross-check and the
  past-claim limits, all run in its own test system (TEST_SYSTEM_GATES). The
  back end's survey pack does not use the cost model at all. Wire it into the
  pack (the preliminaries, the index and the insurance check, each shown as a
  test placeholder to the surveyor), with tests, and keep each gate off in the
  shipped model.
  ADDED 4 Oct 2026 by Phase 153g: when it is wired in, show its results in the
  pack's chapters too — the index dates in chapter 11 and the checks in 14 —
  and bring the phase3 module's £/m² review flag (Phase 153e line 14) into
  chapter 22. Neither is in the back end today.
  ADDED 4 Oct 2026 by Phase 155: the index factor (Phase 153e line 12) is to
  read the real BCIS table when one has been imported (bcisIndexTable in
  09-app/backend/src/web/bcis-index.ts; node src/cli.ts import-bcis-index),
  and the labelled placeholder only in the test system; never a guess.
FROM PHASE 154a1 (4 Oct 2026), TWO LOOSE ENDS WITH THEIR HOME HERE, both
  buildable today. Line 13 built the s.187A pooling requirement (R-B1,
  CB_S187A.poolingAssess) for a seller KNOWN to have been able to claim.
  (a) The fixed-value questions (14po, 14fvr and the rest) are still asked
      of a seller the pooling requirement already takes to nil. Rulebook A
      Addendum 1 says they are gated behind the pooling answer. Hide them
      then - keep the sale-date question (14pod), which the pooling check
      reads - with harness checks both ways and the pack's legal check.
  (b) A seller whose ENTITLEMENT is not known ("not sure" or never asked) and
      who never claimed still gets the upper half of the band at Stage 3,
      with the words "no prior entitlement ... (best case)". Rulebook B says
      that seller is undetermined between branches B and C, so it should
      be nil at the bottom with a flag (N4: "not sure" and absent alike).
      And for a seller known entitled who never claimed and sold before
      April 2014 (branch D) the figure is right but those words are not:
      use Rulebook B section 6's replacement wording. Re-run
      03-app/caprebate-switch-direction.cjs after both.
═══════════════════════════════════

DO NOT REOPEN what COORDINATES lists under "DECIDED - DO NOT REOPEN" (added
4 Oct 2026: the VOA rating list, scrapped by Lakhbir; the Ordnance Survey
licence email, not sent; Google Analytics, dropped for now). A sweep that finds
older text saying otherwise corrects the text, not the decision.

THE SWEEP DOES NOT DELETE ITSELF - it renumbers itself forward and stays last.

Read TWO sections before you touch anything:
  THE STANDING INSTRUCTION - thirteen numbered points, AMENDMENTS 1 AND 2 and a
                             CLOSING CHECK, applies to this phase in full,
                             and THIS PROMPT DOES NOT REPEAT IT;
  COORDINATES              - every id and path, the disk, the checks to run,
                             and the traps.

YOU ARE RUNNING THE SWEEP: a full board-versus-disk sweep and stress-test.

ITS NUMBER IS IN THE HEADING DIRECTLY ABOVE THIS BLOCK, AND THIS BODY DOES NOT
REPEAT IT. On 6 September 2026 the heading said 93 while the body said 92. A
number stated once cannot drift from itself. WHEN YOU RENUMBER, CHANGE ONLY
THE HEADING - and if you insert a phase before it, the sweep takes the number
after that phase.

1. READ THE WHOLE TRACKER - hub/TRACKER.csv, or TRACKER.md to read it. For
   every item AND EVERY SUBITEM (a row with a parent_id) read Status, Owner
   type, Claimed-by and the ACTUAL CONTENT - its notes, its comments in
   hub/COMMENTS-ARCHIVE.md and its files on disk - not "a file exists". Tally
   statuses IN CODE: node 03-app/caprebate-tracker.cjs check, and the tables
   at the top of TRACKER.md.
   EXCLUDE THREE CATALOGUE PARENTS whose blank subitem rows are data, not tasks:
     12818313893  name exclusion register
     12818978746  Stage 2 document upload list
     12830043701  the tax adviser's review pack
   Re-derive the blanks yourself.
   CHECK EVERY STATUS AGAINST WHAT IS ACTUALLY IN THE WAY, IN BOTH DIRECTIONS.
   Blocked-but-built is a finding (48 items looked stuck on 4 Sep). So is
   Ready-but-finished (two on 6 Sep). So is THE THIRD SHAPE: a correctly
   labelled item whose COMMENTS carry work that is not blocked. On 10 Sep it
   came in two more forms - an item at "Blocked - question" whose own first
   update said nothing stops without the answer, and an item at "Ready -
   Lakhbir action" carrying a drafting job nobody needed to answer anything
   for, because the recommendation happened to be addressed to Lakhbir.
   READ THE COMMENTS, NOT THE LABEL.
   AN ITEM WITH NO UPDATE, NO FILE AND NO DOCUMENT says nothing about what it
   waits for. The register check catches that only at "Built - awaiting
   sign-off"; look at every other label yourself (three found on 10 Sep).
   AND OPEN THE DOCUMENTS OF THE DONE ITEMS, NOT ONLY THEIR LABELS: on 12 Sep
   fifty-one Done items carried pages saying DRAFT, NOT APPROVED or NOT IN
   FORCE. A draft at Done is invisible to every register.

2. CROSS-REFERENCE AGAINST THE DISK. One copy of the tree, on the Mac, since
   25 Sep 2026 (the Acer is retired); its path is in COORDINATES and contains
   spaces, so quote it. SAY IN YOUR RECORD WHAT THE SUITES PRINTED. A total
   LOWER than the last phase recorded is a finding: look for a lost file or a
   deleted test before calling it anything else.
   03-app/phase3 and 03-app/phase9 are EMPTY FOLDERS; the suites live in
   04-phase-work. VERIFY BY TRAVERSING, NOT BY READING THE LINK TEXT.
   READ THE FILES, NOT THE FILE LIST. On 6 Sep a finished engagement letter sat
   unread while six documents said it did not exist; on 10 Sep seven "DRAFT
   TEMPLATE" policies sat unread in the same folder, on no board item.
   LOOK ONE LEVEL ABOVE THE TREE TOO - the engine lives there.
   DOCX ENTRY PATHS: some use BACKSLASHES and some do not. A lookup for
   "word/document.xml" alone can return nothing and look like a corrupt file.

3. RUN EVERY CHECK AND RE-DERIVE EVERY FIGURE. The commands are in COORDINATES
   and there are more than four: both harness modes (which must agree), the two
   module suites from INSIDE their folders, the back end's npm run check, the
   extraction verifier, the drift checker and its self-test, the notices
   acceptance check, the tracker check and its self-test, the register check
   (it reads hub/) and its self-test, the CRM fold check and its self-test,
   the surveyor payload
   proof, and the two proofs added 12 Sep - the gated-exit renderer and the
   cash route - each of which MUST go red --against its pre-change copy. grep "pass [0-9]" UNANCHORED.
   THE DRIFT CHECKER IS ITSELF A CHECK THAT MUST BE CHECKED. RUN THE NEGATIVE
   CONTROL EVERY TIME: --fast --expect 999,998,997,996 MUST EXIT 1 (it listed
   eleven failures on 10 Sep). IT TAKES FOUR NUMBERS. Given three it EXITS 2
   AND REFUSES, which is not a failure report - and until 10 Sep this prompt
   told every sweep to run the three-number form. A negative control that is
   refused is not a negative control.
   Then READ the "no marker either way" section rather than trusting the green
   line, and ASK WHAT PHRASING IT STILL CANNOT SEE. It has been found blind
   five times: "N / 0 / 4" and "N passing assertions" (6 Sep); a command line
   with no marker word (9 Sep); a thousands separator (9 Sep); a marker wrapped
   onto the line above (10 Sep); and a noun between the figure and "pass" -
   the action plan's own evidence table, read green by the register check
   while three days stale (10 Sep). Its remaining blind spots are written down
   in 03-app/caprebate-figure-classify.cjs. BETTER THAN WIDENING IT AGAIN: a
   table of evidence should carry the command, not the number.
   A PROTOTYPE WHOSE ANCHOR QUARANTINE HAS QUIETLY STOPPED HOLDING IS WORSE THAN
   NO PROTOTYPE. The payload proof must find no estimate field as surveyor AND
   all seven as admin - the second half is its negative control.
   THE QUESTIONS DOCUMENT NEVER FELL OUT OF STEP WITH THE CLOUD - ITS LINK DID
   (Phase 152, 28 Sep 2026). From 25 to 28 Sep four phases copied down the
   item Lakhbir's link opens (COORDINATES, AMENDMENT 2) and found it "still
   the document from before 230". It was: a backup had been made by MOVING
   the Mac file, so that item had become Caprebate_Questions.docx.bak-
   phase151e3, and every write after went to a second, new item. Phase 152
   gave the linked item its name back and wrote the document into it, proved
   byte for byte; the second item is now named "DELETE - Caprebate_Questions
   (a second item 25-28 Sep ...)". EVERY SWEEP: read the folder listing
   first and check that the item in COORDINATES still carries the name
   Caprebate_Questions.docx, and the closed document's item likewise. Read
   the listing for DELETE files too: deletions made on the Mac on 25 Sep
   never reached OneDrive (the DELETE row, 13053370722).
   STILL OPEN, AND ONLY LAKHBIR CAN CLOSE THEM:
     Word question 230 ("set up Turso", recorded 28 Sep): prove the test
     website runs on it. He signs in there and opens a client's Identity
     check - no "Records kept in memory" box means Turso - or reads the
     function log's "test deployment:" lines. Claude cannot: the Vercel
     connector's only team holds no projects, and signing in there is his.
     When he says which, close 230 naming Phase 151e lines 4 to 7 and Phase
     151i follow-ups 3 to 5.
     Word question 231 (the private Blob store, recorded 28 Sep): the same,
     plus the log line "uploaded documents are kept in the private document
     store" and an invented file uploaded through one sign-in opening in
     another after a redeploy. Then close 231 naming Phase 151i.
   Each copy of the test website now logs "test deployment: this copy
   started in N ms" (Phase 152): read it whenever the log is read. The first
   request after a deploy answered 200 in about 5 s on 28 Sep; if one ever
   answers 504 again, time build() step by step as Phase 152's record does.
   DONE BY PHASE 152, SO NOT REPEATED: Word question 205 closed, 207's Land
   Registry half recorded, 233 and 234 (the two answers that never had a
   question) written and closed, 230's answer recorded; the sign-up
   confirmation link out of the outbox (migration 060); a migration and its
   record as one step (src/db.ts, splitMigration); the CRM fold check's colon
   with no line number; the grid tool's test no longer reads a slow machine
   as a wrong answer.

3a. THREE HOMEDATA FIGURES THAT WENT STALE, AND THE SHAPE THEY WENT STALE IN.
   A supplier's published price, read once and never re-read, is a sweep
   failure mode in its own right - check the SHAPE, not only these three.
   (a) The Developer Spec's Tier 2 table said "Rate card not on file. It is an
       open question" while the rate card was published and readable.
   (b) PARAMS.homedata_cost_per_lookup in 04-phase-work/phase9 is null. Section
       6 of caprebate-job-economics.md was once written entirely around that
       null; it no longer is, and its "at a high price" branch is withdrawn,
       not merely unfired (Phase 147). The supplier's 7p is its find-then-
       retrieve; our lookup is 8p (postcode 2, address 5, title check 1), and
       the price stays null because it is a list price, not an account price.
       Check the SHAPE this point names, not these words.
   (c) The 26 August 2026 record of "a free tier of 100 lookups a month, GBP
       49 a month for Starter" was corrected once by Phase 133 and is now
       contradicted a second time by the supplier's own words: "there is no
       monthly allowance and nothing resets". A fact corrected once is not a
       fact that stays correct.
   (d) Phase 152 found the shape twice more, both corrected by Phase 153: the
       session record's s.9 still asking whether unauthenticated searches
       count against the 100 a month, and a phase9 header calling the price
       null that the code sets to 0.08.
4. TEST EVERY ITEM AGAINST FIVE OUTCOMES: (a) genuinely complete - prove it with
   a file or a test; (b) Claude can do it now - it goes INTO A PHASE, per
   AMENDMENT 1, not onto the board alone; (c) blocked on a person - a question
   with a recommendation in CAPREBATE QUESTIONS; (d) a real gap with no board
   item - create one; (e) A FINISHED ARTEFACT WITH NO BOARD ITEM AT ALL, which
   the registers cannot see because they are derived from the board.

5. TEST THE CLAIMS THE BOARD MAKES ABOUT ITSELF. Most sweeps have found a false
   blocker: "not fixable via API" (one call fixed it); Monday's doc API "down
   platform-wide" (worked first time); a regulator's site "unreadable" (it
   blocked one fetch method); a mailbox "waiting on a domain decision" (one DNS
   query showed it live); a purchase held open while four price books sat
   unopened on disk; two files that "cannot be removed" while the refutation
   sat forty lines above them.
   THE MIRROR IMAGE: a method that LOOKS like evidence and is not. An SMTP probe
   rejected the real mailbox and an invented one identically. ALWAYS RUN THE
   NEGATIVE CONTROL - and check that the control itself still runs as written.
   THE THIRD SHAPE: a capability that half works. A Files column accepts a doc
   reference - and clearing a doc column DELETES the document. TEST THE
   DESTRUCTIVE HALF ON SOMETHING YOU CAN RESTORE, and never write a method into
   this document until it has worked once.
   DISPROVING A BLOCKER IS NOT REMOVING IT. Grep the corpus, correct EVERY
   instance, then READ the thing you proved you can read.

6. KNOWN, AND NOT BLOCKERS. The traps are in COORDINATES; read them before
   your first write. The costliest now: a negative control run through a pipe
   reports the pipe's exit code; node --test from the root does not run; a
   DOCX zip may use backslash entry paths; vercel.json's outputDirectory set
   back to "." would publish every committed file on the test website.

THE PATTERN TO HUNT, in thirteen variants, because each pass finds a different one.
 (i)   Complete on its own terms, silently incomplete on the next person's. WHEN A
       PHASE REPORTS A COUNT, RE-DERIVE IT - every sweep has found one wrong. On
       10 Sep the questions document said 26 for Lakhbir and 115 in all; the
       headings counted 28 and 117.
 (ii)  A control sitting one step downstream of the thing it was meant to control.
 (iii) A fact, an ANSWER or a QUESTION that whole phases reasoned around, stated
       plainly somewhere nobody in that workstream reads. LOOK ON THE DESKTOP
       FIRST, THEN OPEN THE .docx FILES.
 (iv)  An option offered to a human as a live choice the system cannot perform.
 (v)   An operation that reports success and does nothing. Read every write back.
       AND READ BACK THE RIGHT THING: from 25 to 28 Sep a read-back of "the
       cloud copy" read the right NAME's old item - a backup made by mv had
       carried the item away - so four phases reported a fault that did not
       exist and missed the one that did (Phase 152). Check what a copy is
       OF, not what it is called.
 (vi)  A CHECK THAT CANNOT FAIL beside one that can - and its quieter cousins: a
       check that can fail but is blind to the exact phrasing it guards, and a
       NEGATIVE CONTROL THAT NO LONGER RUNS AS WRITTEN.
 (vii) AN ANSWER THAT CLOSES A QUESTION AND OPENS A LARGER JOB.
 (viii)A correction that diagnoses a stale row without fixing it. Whenever a phase
       records "X is now out of date", go to X - and whenever a phase writes a
       defect into a comment and says the status is unchanged, ask whether the
       defect is actually blocked by anything.
 (ix)  AN ANSWER GIVEN BY THE WRONG PERSON, OR TO A DIFFERENT QUESTION. A
       director's view is PROVISIONAL. An answer giving the date, when the
       question asked whose purchase, is not an answer.
 (x)   A BLANKET CLOSURE THAT SWALLOWS ITS OWN EXCEPTION.
 (xi)  A BLANK IN A DOCUMENT THAT IS BINDING ON SOMEBODY. Search the corpus for
       the placeholder itself - the square bracket - not for the topic.
 (xii) THE SAME QUESTION ASKED TWICE, AND CORRECTED IN ONE COPY. On 10 Sep the
       questions document asked Homedata's price in two places; one copy had
       been corrected to say the lookup fires after signature and the other,
       written the same day, still said before. Search question titles by
       their nouns, not their wording.
 (xiii) ONE LABEL, TWO MEANINGS. On 12 Sep the claim-route codes W2, W3 and W4
       meant one thing in the rulebook that defines them and in every document
       that follows it, and another in the engine and the handoff pack - so a
       still-owned client carried the code the report chain reads as a dead
       claim. When a code, a status or a term appears in two places, check what
       each copy SAYS it means, not that the spelling matches.

WHEN DONE
1. RENUMBER THIS SWEEP FORWARD - retitle the HEADING above this block as the
   next "Phase N - Sweep and stress-test", after any phase you inserted, and
   keep it BOTH the highest number AND last. DO NOT DELETE IT.
2. Re-read the top of this document and make it true - FIRST as well as last.
   THAT INCLUDES COORDINATES: verify every id and path against the tracker and
   the disk, and correct the block itself, not a note beneath it.
3. Leave the drift checker, the tracker check and the register check green,
   and prove the drift checker can still go red.

Then do WHEN THE PHASE IS DONE, at the top of this block.
```

 **ADDED 24 SEPTEMBER 2026 BY PHASE 147 — TWO MORE JOBS FOR THE SWEEP, BOTH BUILDABLE, AND ONE CORRECTION TO ITS OWN PROMPT.** A note rather than an edit, because the prompt block above is 13 KB and `update_block` replaces all of it. The sweep folds it in. **(1) Read CIBSE's "Fair Use Policy" page live, and its "CIBSE copyright" section.** CIBSE's terms point to it for Knowledge Portal content. Phase 147 could not read it: the site answered 503 and "HTTP Error 500.30" on 24 September, and the page is not archived. It may settle the three things CIBSE does not publish: whether a report a client pays for is "a text for sale", whether using a life in a calculation is reproduction, and whether several staff may use one download. If it does, update the licence CIBSE_KNOWLEDGE in `04-phase-work/phase3/caprebate-source-register.ts`, its write-up `caprebate-cibse-plant-lives-source-register-row.md`, and Word question 213 — **and loosen a refusal only on CIBSE's own words.** **(2) Point 3a(b) of the prompt above is out of date.** Section 6 of `caprebate-job-economics.md` is no longer "written ENTIRELY around that null", and its "at a high price" branch is withdrawn, not merely unfired. And "7p for an address and UPRN" is the supplier's find-then-retrieve: our lookup is 8p (postcode 2, address 5, title check 1). The price stays null for a new reason: it is a list price, not an account price. Fold that into 3a when the prompt is next retyped, and check the SHAPE 3a names, not these words. **DONE 24 SEPTEMBER 2026 BY THE SWEEP (Phase 149, renumbered 151): (1) is done.** The page is gone from CIBSE's live site - it is not among the 3,703 pages in its sitemap, though the live terms still point to it - and it was read as last archived, on 29 May 2022. It confirms all three refusals and loosens none: downloads are for personal use, and re-use "for re-use, re-sale or other gain" or for a third party needs permission. The licence note, the write-up (re-uploaded) and Word question 213 say so. (2) still stands: this sweep changed only the prompt's heading, as the prompt instructs, so point 3a is still to be folded when the prompt is next retyped. **FOLDED 25 SEPTEMBER 2026 BY PHASE 151d:** point 3a(b) of the prompt above now says this.

 **ADDED 9 SEPTEMBER 2026 BY PHASE 110 — ONE MORE JOB FOR THE SWEEP, AND IT IS ABOUT THE TWO DISK COPIES RATHER THAN THE BOARD.** A paragraph rather than an edit to the code block above, which is the pattern Phase 107a used for the same reason: that block is large, `update_block` replaces the whole of it, and retyping it to add four lines risks damaging text nobody asked to touch.

 **CHECK THAT THE TREE THE MACHINE YOU ARE ON CAN SEE IS THE CURRENT ONE, AND SAY WHICH ONE IT IS.** COORDINATES already records that the tree exists twice, in two different OneDrive accounts, and that an edit in one does not appear in the other. What it does not say is that **the rule it gives — push every changed file to the board — covers DOCUMENTS and not SOURCE CODE.** No phase9 or phase3 source file has ever been on the board, so the two copies diverge for code silently and permanently, and nothing checks it.

 **THE SYMPTOM TO WATCH FOR, BECAUSE IT LOOKS LIKE A DEFECT AND IS NOT ONE.** A suite total that is LOWER than the one the last phase recorded, with the drift checker green against the lower number. That is not a regression and no test has been deleted — it is a machine looking at an older copy of the tree. **Phase 110 wrote eight new source files into the Mac copy on 9 September 2026 and moved phase9 from 245 to 297**, so a run reporting 245 on another machine means the copy, not the code.

 **The sweep should say plainly, every time, which copy it read and what the four suites printed there.** It costs one line and it is the only thing that will catch a fork before somebody spends an afternoon on it.

 **Both of the things Phase 87 carried into this sweep are now closed, and one of them was closed by reading this document rather than ****by d****o****ing**** ****a****ny work.** They are recorded here rather than deleted, because how each turned out is the useful part.


1.  **CLOSED 6 September 2026 — the empty document was an empty shell, and nothing was ever lost.** It sat on "Correct the '4 yrs' reach-back claim on the homepage", document object id 18428048235. The test that settled it was the version history: **ex****a****ctly**** ****o****n****e ****r****e****sto****ring ****p****o****i****nt,**** d****at****e****d th****e**** momen****t**** ****the**** document w****a****s**** cr****e****at****e****d ****o****n 25 Augus****t ****2026, and noth****i****ng ****s****ince** — so it was created empty and never written to, and Phase 87's empty export was accurate rather than a failure. It was not deleted, because clearing a document column destroys the document rather than unlinking it and there is nothing to gain. Instead it now says, in its own body, that it is deliberately empty and why. Its title said "Ledgerstone" and now says Caprebate.


2.  **RESOLVED 7 September 2026 — there was nothing left to remove.** Two unreadable files were said to be attached to the surveyor appointment item alongside good copies suffixed __CLEANED. Phase 87 recorded that they "cannot be removed through the API — there is no asset-deletion mutation" and asked a person to delete them by hand. That claim was false, and Phase 88 had already acted on it. Phase 92 checked rather than assumed: the item carries three files, none of them suffixed, and the two in question were downloaded and checksummed against the copies on disk as byte-identical. **Th****e**** entry stay****s**** ****he****re because the lesson does** — a false blocker and its refutation sat in this same document for a day, and the sweep carried the blocker forward anyway.


 **ADDED 10 SEPTEMBER 2026 BY PHASE 115 — THREE THINGS FOR THE NEXT SWEEP.** A paragraph rather than an edit to the sweep's code block, for the reason Phase 110 gives above.

 **1. A loose file in the folder the portal reads the letter from.** `06-commercial-and-governance/_doc.xml` is a WordprocessingML body dated 8 September 2026, and it differs from the engagement letter's own. The file index has recorded it as referenced by nothing since 9 September; Phase 115 did not touch it, because it was not one of the seven templates. BUILDABLE: compare its paragraphs with `Caprebate Engagement Letter.docx.bak-phase115`, and if it is a stale extract, move it to `_archive/superseded/` with a README line. Archive; never delete.

 **2. The Acer copy does not have Phase 115.** Phase 115 ran on the Mac copy. Its source changes never reach the board: the break-even switch in `09-app/backend/src/web/funnel-session.ts`, its tests in `09-app/backend/test/engaged.test.ts`, and a comment in `letter.ts`. Neither does the move of the seven templates to `_archive/superseded/`. A run on the Acer reporting the back end at 378 rather than 381 is that copy, not a regression.

 **3. A pattern to hunt, found by Phase 115 on two items it touched.** The governance policies and the privacy notice both sat at Done in the Complete group while every one of their own pages said DRAFT — NOT APPROVED. Done means finished and in force, so both were retagged Built — awaiting sign-off and entered in the third register. Test every Done item that carries a document for the same shape: a draft marked Done is invisible to all three registers.

 **CARRIED FORWARD 12 SEPTEMBER 2026 BY THE PHASE 127 SWEEP.** The loose file at 1 is still there, and is line 26 of Phase 129. Point 2 is still true, and now covers the Phase 127 sweep too: the site file, the engine package, the two new proofs and the corrected documents are on the Mac copy only, apart from the documents it re-uploaded to their items. Point 3 was hunted across every Done item that carries a document: fifty-one carry drafts, and Phase 128 retags them.

 **CARRIED FORWARD 12 SEPTEMBER 2026 BY PHASE 129.** Point 2 now covers Phase 129 too: the site file, the engine package, the cash route proof, the harness, the phase9 cost model, and the back end's source, migration and tests are on the Mac copy only — the documents were re-uploaded to their items, the code was not. **Two things for the sweep to hunt.** First, **answers written into CAPREBATE QUESTIONS that nobody has acted on**: Phase 129 found three answer boxes reading as a flat 3% fee against the decided 5%, and an unsigned answer under the stamp-duty question, and turned the first into one question for Lakhbir. Second, **a count sentence under a section heading that disagrees with its own table**: section four of that document still does, and Phase 129a line 3 corrects it. Phase 129a, on 13 September 2026, adds the site file's item-9 switch, the extracted engine package, the harness's H23 and the redirect hook, and a comment in the phase9 cost model — all written on the Mac copy only. Phase 129b, on 13 September 2026, adds the site file's amendment-window corrections and its nineteenth switch, the extracted engine package, the harness's Suite W, and the cash route proof's four new checks, its refusal and its self-test — also on the Mac copy only; the documents it changed were re-uploaded to their items.


 **CARRIED FORWARD 13 SEPTEMBER 2026 BY THE PHASE 130 SWEEP.** Point 2 now covers this sweep too: the back end's staff test file, the clock tool at `03-app/caprebate-clock-shift.mjs`, the archived paste file and its README in `_archive/superseded/`, and this sweep's section of the file index are on the Mac copy only. **Three things for the next sweep to hunt.** First, **a test that reads the wall clock**: "a taken slot is not offered twice" was green every time it had ever run, and failed at 15:43 UTC on a Sunday because the week it asked for had no slot left. Phase 132 runs every suite across a grid of clocks to find the rest. Second, **a document at Built - awaiting sign-off whose text was never brought up to date** with the decisions since it was written: Phase 128 retagged many without touching them, and Phase 131 carries every one the sweep found - check that none is left. Third, **a board item whose question points at a question with a different subject**: the test-lookup item was mapped for a week to the signer-verification question, while its own question had never been written down.

 **CARRIED FORWARD 14 SEPTEMBER 2026 BY PHASE 131.** Point 2 now covers Phase 131 too. Its corrected documents were re-uploaded to their items, but on disk they are in the Mac copy only, as are the new VAT note, the three pre-session files for the paid surveyor review, and this phase's section of the file index. **One change is not a document:** the register check's manifest, `03-app/caprebate-signoff-registers.json`, lost its entry for the HR framework, which Phase 131 parked and took out of the solicitor's register. A register check run on the Acer copy will report the manifest naming an id the register no longer contains until that copy is brought level. **Two things for the next sweep to hunt.** First, **a document that says something was fixed when it was not**: the risk register recorded the website's four-year promise as corrected before launch, and the site still makes it. Second, **a correction that reaches only the copies a line named**: Phase 131 corrected the review pack's counts in the two tax adviser packs while the hiring pack, which no line named, still says 42 questions and 13 blockers. After Phase 132a, search the whole corpus for each number and phrase Phase 131 corrected, not only the documents its lines named.

 **CARRIED FORWARD 15 SEPTEMBER 2026 BY PHASE 132.** Point 2 now covers Phase 132 too: the site file and the engine package; the harness, with suites X, Y and Z and new checks in suite H; the cash route proof; the back end's source, migrations 022 to 024 and tests; the phase3 and phase9 modules; two new checks, `03-app/caprebate-clock-grid.mjs` and `03-app/caprebate-analytics-allowlist-check.cjs`; the register check's section 5; and the line-15 change map in `04-phase-work/phase132/` — all on the Mac copy only, apart from the documents re-uploaded to their items. **Two things for the next sweep to hunt.** First, **a test that passes only while the calendar agrees with its fixtures**: four back-end tests failed at every clock before September 2026, and one would have failed from 31 December 2027, because the seeded server read the real clock while its fixtures carried fixed dates. The clock grid is the tool that finds the next one; run it on a copy of the tree. Second, **a new check whose own comment trips it**: the analytics check failed on its wrapper's explanatory comment until the wrapper was taken to start at its banner — read a new check's first red before trusting its green.

 **CARRIED FORWARD 15 SEPTEMBER 2026 BY PHASE 132a.** Point 2 now covers Phase 132a too: about sixty corrected documents with `.bak-phase132a` siblings, every one attached to a board item re-uploaded there; three archive moves into `_archive/superseded/` — the old site fork, the whole former `Development/ledgerstone all/` folder, and two stale `__CLEANED` duplicates — each with a README line; and this phase's section of the file index. The moves and the index are on the Mac copy only. No source code, test or site file changed. **Three things for the next sweep to hunt.** First, **a document whose own order has quietly broken**: count top-level blocks per `position` in every Monday document — a tie group means the reader sees text in an undefined order, and CAPREBATE QUESTIONS carried one unnoticed from 14 to 15 September. Second, **an answer box with typed content and no follow-up**: 144 of 164 carried text on 15 September, some of them the question's own "what it unblocks" line pasted back; Phase 132c line 2 works through them, and the sweep checks it did. Third, **a phase line whose premise would have produced a wrong edit**: Phase 132a found several — no dead ICO address anywhere in the corpus; the wrong statutory instrument for the regulator's new name; the fees wording credited to the wrong 2026 publication; the Ordnance Survey email addressed to an unchecked route; two corrections already made; and a WordPress back end that was a decision, not an error. Test each prompt line against its file before writing to it.

 **CARRIED FORWARD 15 SEPTEMBER 2026 BY PHASE 132c.** Point 2 now covers Phase 132c too: the site file and the engine package (the two name fields gated after signature, the alteration-spend question behind its switch, the landlord seller answer in four more flows, and the corrected trust-strip, upload-screen and refund copy); the harness, with suite AA; the Developer Spec, the file index and two documents whose harness figure moved; the public notices page, the printable complaint form and four data protection documents; the advertising audit, the S12 specification and the archived sample report. Fifteen files carry a `.bak-phase132c` sibling, all on the Mac copy only. Every changed document attached to a board item was re-uploaded there, but source code never reaches the board, so the Acer copy's site file, engine package and harness now fork from the Mac copy's. The sweep's tree check must name the Mac copy as current.

 **CARRIED FORWARD 16 SEPTEMBER 2026 BY PHASE 132d.** Point 2 now covers Phase 132d too: forty files with `.bak-phase132d` siblings are on the Mac copy only — Rulebook E with its decision steps renumbered ES0–ES6; the site file and the engine package (six comments naming the accountant register's entries, re-extracted); the harness's three comments; the register manifest `03-app/caprebate-signoff-registers.json` with every ref prefixed; the phase3 ingestion module, its test and the name-exclusion module (comments and two reason strings); the cost model; the CRM disposition; the switch table, the item-9 note and the decided-and-not-decided paper; twenty-two monday document exports; and the file index. Every one of those attached to a board item was re-uploaded there, but the source files never reach the board, so the Acer copy still has the old codes in all of them.

 **CARRIED FORWARD 16 SEPTEMBER 2026 BY PHASE 132e.** Point 2 now covers Phase 132e too: 121 files with `.bak-phase132e` siblings, and eight new ones, are on the Mac copy only — the site file and the engine package (the flat 3% fee, the discretionary discount, the no-claim threshold, the gate on at 120 jobs); the harness with suite AB; the business plan model; phase9's job economics, break fee, boundary import and region modules with their tests and papers; the back end (migrations 025 to 029, the new modules `client-filing.ts` and `fee-discounts.ts`, twenty-odd changed source and test files and the new `test/phase132e.test.ts`); the engagement letter; the three 09-app documents; the file index; and forty-six exports plus the new accountant call agenda, every one of those re-uploaded and compared byte for byte. The engine and the back end are the part that forks silently: the Acer copy still charges 5%.

 **CARRIED FORWARD 16 SEPTEMBER 2026 BY PHASE 132f.** Point 2 now covers Phase 132f too. Every file below has a `.bak-phase132f` sibling and is on the Mac copy only:

-  the site file and the engine package: no "our tax adviser" left, and a changed seller answer now clears its fact and line; re-extracted;

-  the engine's hand-written `shared.d.ts` and its type tests;

-  the harness, with suite AC;

-  the back end: research tiering after signature, the engagement gate given its costs, the no-claim and region readings, the regulator's dual wording in three compliance modules, and the new `test/phase132f.test.ts`;

-  the drift checker's new twin comparison;

-  the Developer Spec, the build specification, the decided-and-not-decided paper, the session record and the file index;

-  the notices page's header comment;

-  the archive README and the archived sample report;

-  two 06-commercial documents and about twenty exports, among them a new company tax implication summary.

 Every changed document attached to a board item was re-uploaded there. The site file, the engine and the back end never reach the board, and those are where the Acer copy forks silently. **One thing for the next sweep to hunt: a reading the back end shows beside a figure it does not change.** The engagement gate and the no-claim threshold are wired as readings on the expected fee, never as a withheld figure, because nothing may refuse. Check that no screen prints the fee in a way a reader could take as a quote the gate has stopped.

 **CARRIED FORWARD 16 SEPTEMBER 2026 BY PHASE 132g.** Point 2 now covers Phase 132g too. These files have `.bak-phase132g` siblings and are on the Mac copy only:

-  the site file and the engine package: a per-flow helper so a changed answer takes back its facts and lines; re-extracted;

-  the harness, with suite AD and the module twins read from `02-modules-and-build-prep/`;

-  phase9's cost-model test, which read the fixture taxonomy from `03-app/`;

-  the drift checker's twin messages;

-  the CRM fold check, whose check C now reads the site file, the engine package, phase9 and phase3;

-  the Developer Spec, the build specification, the decided-and-not-decided paper and the file index.

 **On the Acer copy the harness still reads ****`03-app/`**** for the twins**, so deleting those copies there would break it until that copy is brought level. **One thing for the next sweep to hunt: a helper that wraps a handler and changes what the extractor reads.** Phase 132g's wrapper returns the handler's own source from `toString` because the extractor reads fact names from it, and `session.d.ts` came out byte-identical. Check that stays true after Phase 132h extends the helper.

 **CARRIED FORWARD 16 SEPTEMBER 2026 BY PHASE 132h.** Point 2 now covers Phase 132h too. The site file and the engine package, the harness with suite AE, the Developer Spec, the build specification, the decided-and-not-decided paper and the file index have `.bak-phase132h` siblings and are on the Mac copy only. The site change is every question wrapped so a changed answer takes back its flags; a renderer step that takes back an answer a later change hides; and derelict land with the polluter question worked out from both answers. **The harness now takes about 19 seconds a mode, up from about 2; suite AE is most of that. A slow run is not a hung run.** **One thing for the next sweep to hunt: a handler that reads an answer given after it.** Q14fvr reads the intervening owner, and Q51gtr and S51gtr read the grant share, so a second pass forward can differ from the first. Phase 132i line 3 carried it, and built it on 16 September 2026. **CARRIED FORWARD 16 SEPTEMBER 2026 BY PHASE 132i.** Point 2 now covers Phase 132i too. The site file, the harness with suite AF, the Developer Spec, the build specification, the decided-and-not-decided paper, the private hospitals question flow and the file index have `.bak-phase132i` siblings and are on the Mac copy only, and so is the re-extracted engine package. The site change: an unanswered heating question in supported living is a referral, as "not sure" is; the land remediation panel needs a known "no" to the polluter question; the seller question moves before the earlier-owner question, the duplicate earlier-owner question is retired, and the grant-share question follows the grant amount; a handler that read a later answer is applied again when that answer changes; and Back steps over a hidden question. The harness takes about 11 seconds a mode. For the sweep to check: suite AF3 re-runs the one-pass-equals-two walk, so a new question that reads a later answer turns it red. **CARRIED FORWARD 16 SEPTEMBER 2026 BY PHASE 132j.** Point 2 now covers Phase 132j too. The site file, the harness with suite AG, the Developer Spec, the build specification, the decided-and-not-decided paper, the four other sector question flows and the file index have `.bak-phase132j` siblings and are on the Mac copy only, and so is the re-extracted engine package. The site change: care homes, dental, supported living and GP ask the polluter question after the derelict-land question, work out land remediation from both answers, and show its panel only on a known "no". The harness takes about 17 seconds a mode. For the sweep to check: AE5 now takes CB_AE5_DUMP=<file>, which writes one fingerprint per question, so a future re-pin can be proved question by question against a pre-change copy. **CARRIED FORWARD 17 SEPTEMBER 2026 BY THE PHASE 133 SWEEP, NOW PHASE 134.** It read the Mac copy, which is current. On disk it changed only the register check's snapshot in 03-app/signoff-snapshot/, each file with a .bak-phase133 sibling; no source, test, site or document file. What was found and where it went is in its PHASE HISTORY record, and the buildable part is Phase 133 above. **Four things for the next sweep to hunt.** First, an answer box whose answer changes the SUBJECT of everything else: the officer question's box names a different person from the one 86 board notes name, and until 17 September no task said so. Read every box's answer for a name, a date or a supplier that differs from what the board assumes. Second, a closed class that reopens when a parent's status moves: the 1 September closure of blank subitems covered Done parents, and Phase 128 moved two of those parents to awaiting sign-off. Third, a task whose purpose was answered away: the Homedata trial still tests Scotland after Scotland was dropped. Fourth, a correction pass that misses a document because it searched for the old figure and the document never held the new one: search for files that lack the new value, not only for files that still hold the old.


---

## 1 · What we are building, in one paragraph 

 **A capital allowances platform for UK healthcare property.** An owner of a dental practice, GP surgery, care home, supported-living scheme or private clinic answers six questions on a website and gets an indicative ceiling for the tax relief built into their building — the boilers, air handling, medical gas, lighting, alarms and specialist drainage that most owners never claim. The system then researches the property against public registers, reconciles what it finds against what the owner said, and produces a refined figure. **A chartered surveyor and a chartered tax adviser turn that into a defensible claim.** We charge a percentage of the allowances identified, invoiced — there is no card processor anywhere in this build. **We serve England and Wales; Scotland is second and Northern Ireland third.**

---

## 2 · What is actually done — with the evidence, not the claim 

 **The rule here: a title that says DONE is not evidence. A file you can open, or a test you can run, is.**

|  What |  Evidence you can check yourself |
| --- | --- |
|  **The estimate engine, all five sectors** |  `Caprebate site.html`, one folder above the Caprebate tree, and byte for byte the same engine as a package in `09-app/engine`. Run `node 03-app/caprebate-regression.cjs`, then again with `--package`: **the two must report the same totals**, with four deliberate expected failures |
|  **The data layer — eleven modules** |  `04-phase-work/phase3/`. Run `cd 04-phase-work/phase3 && node --test` from inside the folder |
|  **Valuation and cost model groundwork** |  `04-phase-work/phase9/`. Run `cd 04-phase-work/phase9 && node --test`. Mechanisms built with clearly labelled empty stubs waiting on licences, and the engagement gate built and switched off |
|  **The back end and the client portal** |  `09-app/backend` — five roles, authorisation on the server for each object, an append-only audit log, and a portal that renders the engagement letter from the document itself. Run `cd 09-app/backend && npm run check` |
|  **The surveyor never receives our estimate** |  Proved on the wire, not on screen: `cd 09-app/backend && CAPREBATE_ALLOW_SEED=1 node tools/payload-proof.ts` finds none of the sealed estimate's seven fields in a surveyor's response, searched three ways, and all seven as admin. Re-run 10 September 2026 |
|  **The Developer Spec** |  `09-app/CAPREBATE-DEVELOPER-SPEC.md` — user cases, every screen, every API, a table naming every stub by file and line, and the current test figures in its section 4. **The figures live there and are deliberately not repeated here**: the ones this table used to carry went three days stale and no check could see them |
|  **Eleven statutory rulebooks** |  `01-rulebooks/`. All written, all awaiting the tax adviser |
|  **Twenty-four tax-adviser switches, all off**
 |  Fifteen would make a claim bigger if switched on; three can only make one smaller; four move money either way — the Scottish rate band, whether a lease granted for a premium with no joint election is item 9 of the disposal table, the corporation tax rate from the associated-company count, and the 60% band where the personal allowance is withdrawn; and two change a basis or remove false negatives. Three of them were readings already live before they were switched. Five were added by Phase 132 on 14 September 2026. The count is taken at runtime by node 09-app/engine/tools/verify-extraction.cjs, and the harness fails if any switch is flipped without its assertions being changed deliberately
 |
|  **The client-document upload handler** |  `04-phase-work/phase3/caprebate-upload-handler.ts`, all twelve contract steps, called by the back end since Phase 104 |
|  **The fee-versus-benefit model** |  Reproduces a real competitor's published schedule line for line. Both its switches are off |
|  **The public notices page** |  `03-app/caprebate-notices-page.html` and a printable complaint form. `node 03-app/caprebate-notices-acceptance.cjs` checks the structure; nine acceptance tests need a live host and are named, not claimed |
|  **Thirteen governance documents** |  Privacy notice, breach register, complaints pack, eight response letters, retention procedure. **All written. None in force** — they wait on the data protection officer's signature (Sadique Maskeen, with the company countersigning; the company has existed since 29 June 2026). Since 12 September 2026 the board says so too: each is at Built — awaiting sign-off. Section 3
 |
|  **Surveyor deliverables** |  Nine items in FOR THE SURVEYOR are finished and awaiting sign-off, the overheads gate and the rebuild-cost cross-check among them. The calibration set cannot be finished before real jobs exist, and sits at "Blocked — needs live jobs"
 |
|  **The checks that guard the paperwork** |  `node 03-app/caprebate-figure-drift.cjs` walks the disk for stale test figures; `node 03-app/caprebate-signoff-register-check.cjs` reconciles the three registers with the tracker and reads the hub documents (since 25 September 2026, files in `00-START-HERE/hub/`). **Both have been made to go red on purpose, and both have been found blind** — most recently on 10 September, to the wording this very table used, which is why it now carries commands rather than numbers |

 **The honest summary: almost everything that can be built without a professional appointment or a licence has been built.** What is left is mostly decisions, appointments and signatures — plus, as the Phase 114 sweep found on 10 September 2026, three pieces of drafting and tidying that nothing stops, all written into Phase 115. **One thing the table does not show, because it is a contract rather than code:** the client engagement letter, fourteen clauses, at 06-commercial-and-governance/Caprebate Engagement Letter.docx. Its open commercial terms are listed by the client portal, which derives them from the document itself rather than from a list somebody keeps, and no solicitor has read it — so it is finished rather than ready.


---

## Two different kinds of stuck, and they were being counted as one

 **Nothing on this board blocks Claude from building except three items at Blocked - question.** Everything else that looks stuck is waiting on a person, a signature or a licence, and that stops us **trading**, not building. Conflating the two is what made this project look four times more stuck than it is. (Corrected 22 September 2026 by the Phase 145 sweep: this said two items, and listed the company existing among the things we wait on. CAP REBATE LTD exists.)


 **Re-derived from the live board by the Phase 147 sweep on 23 September 2026** and tallied in code, with its own claim counted back to where it sits when cleared. It must sum to the item count or one of the two is wrong. The table below replaced one taken by the Phase 145 sweep on 22 September, which read 407 items and 114 awaiting sign-off. All 423 items:


|  State |  Items |  What it actually means |
| --- | --- | --- |
|  Done |  248 |  Finished and in force. Phase 128 moved forty items out of this row on 12 September 2026 because their own documents said they were drafts; the Phase 130 sweep found nine subitems under two such items still at Done and marked them drafted, not approved |
|  Built — awaiting sign-off |  119 |  Claude is finished. A named professional confirms. Blocks trading, blocks no building |
|  Ready — Lakhbir action |  35 |  A person must appoint, buy, send, sign or decide. Five of the 35 are the hub documents beside this one. Section 3 |
|  Ready — Claude can build |  4 |  Phases 146j, 147 and 148, and the CIBSE plant lives. Three of the four were created by this sweep. Section 6 |
|  Blocked — question |  3 |  The list that stops a build. Section 7 |
|  Blocked — incorporation |  0 |  Empty since CAP REBATE LTD (17307313) was confirmed on 18 September 2026 |
|  Blocked — licence or purchase |  4 |  Needs money or a licence first |
|  Parked — deliberate |  7 |  Deferred on purpose, with a trigger |
|  Blocked — needs live jobs |  3 |  Only real client work produces it |

 **Read it this way.** The 119 awaiting sign-off are not a backlog of unbuilt work. They are finished documents and coded, tested, switched-off branches waiting for a professional to confirm or amend. Each has one entry in the three sign-off registers beside this document — 45 for the accountant and the tax adviser, 9 for the surveyor, 65 for the solicitor, the data protection officer and the developer — and a check reconciles that split against the board in every phase. They are not repeated below. The three positions decided in mid-September — the flat 3% fee, CAP REBATE LTD and the new data protection officer — reached the documents by 22 September and the board's comments the same day, so nothing is now carrying the old ones as current. **Th****is**** ta****ble ****is a da****t****ed**** re****adin****g, taken by the Phase 147 sweep on 23 September 2026, no****t**** ****a f****a****c****t ****to**** ****q****u****o****t****e: count the board yourself.**


---

## 3 · For Lakhbir — what only you can do

 **Ordered by what each releases against what it costs you.** Rewritten in place on 24 September 2026 by Phase 150, because Lakhbir's answers in the Word questions document had overtaken it. This section lists the items at "Ready - Lakhbir action" that are tasks (five more at that label are the hub documents beside this one). Nothing of Lakhbir's sits at "Blocked - question" any more: the two items there both wait on the data protection officer (section 7). The table below was built on 6 September and a row cannot be added to it, so rows the answers have closed are rewritten in place, and the things that reached this label since are named here instead: the decision to switch the engagement gate on; the rate card's fee-band breakpoints; the rebuilt minimum-fee papers; the Valuation Office email (still open as "Should we send the Valuation Office and Ordnance Survey emails?" - the Valuation Office one is needed, the Ordnance Survey one is not); when our fee is earned; whether anything is paid to an introducing accountant; the data import; which Stage 2 documents are mandatory; sending the brief to the solicitor; the break fee; the Information Commissioner registration; the five decisions the data protection officer's appointment needs; and, since 24 September 2026, the director's confirmation of the business decisions Lakhbir makes for the company, asked as "Does the director of CAP REBATE LTD agree the business decisions you make for the company?". **Th****e ****host**** ****em****a****il**** ****h****as b****ee****n**** ****re****w****r****itt****e****n**** ****aga****in** (24 September 2026) for whichever host the developers choose, with only the backup question in it; it goes when the developers propose a host. **Two t****hings this paragraph used ****t****o**** wa****r****n**** a****b****o****u****t ****a****re se****t****tled:** CAP REBATE LTD is ours (confirmed 18 September 2026), and the fee is a flat 3%, which Lakhbir kept on 24 September 2026.


|   |  Do this |  Why it matters |  Time |  What it unblocks |
| --- | --- | --- | --- | --- |
|  **1** |  **DONE: the mailboxes are read, and the test email arrived**
 |  Answered 24 September 2026: Sadique Maskeen reads all three. The test email from contact@ reached Lakhbir, in junk at first. Left: check in the IONOS panel that DKIM signing is switched on for caprebate.co.uk
 |  10 min |  Four legal duties |
|  **2** |  **DECIDED 24 September 2026: the fee stays a flat 3%**
 |  Over the five to seven years the relief runs, the client gains more than the fee. The cap, the warning and a new percentage stay switched off. Left: the director's confirmation of the decided terms
 |  15 min |  Every fee we quote |
|  **3** |  **Send the Valuation Office email** (the Ordnance Survey one can wait) |  Both are drafted and attached. Read them and say send |  15 min |  Seven tasks blocked on a licence |
|  **4** |  **"Yes and yes" - answered "Not sure"**
 |  It no longer matters: IONOS is not the host, and the email goes to whichever host the developers choose, asking only the backup question
 |  -
 |  The upload page, once the chosen host answers in writing
 |
|  **5** |  **Book the free 45-minute surveyor call** |  The cheap test of whether the desktop-first model holds up at all |  5 min |  Six deliverables and nineteen questions. There is no £330 to save now: we take the BCIS route and buy no Spon's books (24 September 2026)
 |
|  **6** |  **Confirm whether the ICO registration was applied for** |  It was said on 1 September it would be done. Nothing records that it was |  10 min |  About £52, and a condition of the data protection position |
|  **7** |  **Incorporate — DONE** |  CAP REBATE LTD, company number 17307313, incorporated 29 June 2026 and confirmed as ours on 18 September 2026 |  — |  Nothing is at Blocked - incorporation any more |
|  **8** |  **Sign the data protection officer's appointment** |  The company exists, so nothing stops it: Sadique Maskeen signs and the company countersigns |  30 min |  Thirteen finished documents and three live duties |
|  **9** |  **Engage a chartered tax adviser, one-off** |  Not a retainer. A fixed-fee review of finished documents |  A fee |  Thirty-five items — see section 4 |
|  **10** |  **Decide the British Standards, a****nd buy ****BCIS**
 |  The two British Standards; and BCIS, most likely CapX, which is not bought yet (24 September 2026). When it is bought, send the order form or licence terms - "Which BCIS product did you agree to, and does its licence let our software use its rates?". No Spon’s; the three copies on our disk stay unused
 |  — |  Parts of the cost and quantity models |
|  **11** |  **Do the information governance training and record it** |  The duty is on the board and the record is what evidences it |  1 hr |  A control the data protection position asserts |
|  **12** |  The remaining ten — Homedata trial, cyber security, hardware, brand and online presence, analytics, mailbox provisioning, the business-request template, surveyor steps 2 and 3, and the legal clearance to use government valuation data commercially
 |  Real, but none of them gates anything else today |  — |  — |
|  **13** |  **Run the land boundary's first download** (added 28 September 2026 by Phase 151l) |  The tool is built and keeps your five conditions. From 09-app/backend: first `node src/cli.ts smoke-switched-on HMLR_INSPIRE --who "<you>" --why "<reason>"`, then `CAPREBATE_LIVE_SMOKE=1 node src/cli.ts smoke HMLR_INSPIRE --who "<you>" --why "<reason>"`. It downloads Westminster's file and looks for 70 Whitehall; nothing about a client leaves, and nothing is kept but one line of PASS or NO. You may name someone else to run it. Switching the fetcher on is a separate decision, and yours |  10 min, plus the download |  Proof that HM Land Registry's file reads, which is what switching on the site area waits for |
|  **14** |  **Look once at the test website: is it on Turso, and does a file stay put?** (added 28 September 2026 by the Phase 152 sweep) |  Sign in at caprebate-test.vercel.app and open any client's Identity check. If there is no box saying "Records kept in memory", the records are in the lasting database. Then upload an invented file as one person and open it as another. Tell us what you saw. Or, in Vercel, read the function log's lines that begin "test deployment:". We cannot see either: the connector reaches no project of yours |  5 min |  Closing Word questions 230 and 231 |
|  **15** |  **Delete the DELETE files on the OneDrive web page, not the Mac** (added 28 September 2026 by the Phase 152 sweep) |  In OneDrive on the web, Health Capital Allowances: the folder "DELETE - files to delete (sweep 25 Sep 2026)" (143 MB) and the files whose names begin "DELETE -". The folder was deleted on the Mac on 25 September and is still in the cloud, so deleting there did not reach OneDrive |  5 min |  A folder that holds only the live documents and their dated backups |
|  **16** |  **Answer three new questions** (added 28 September 2026 by the Phase 152 sweep) |  235: do the old extra charges stay - the add-on for complicated jobs and the £1,500 manual-handling charge? (question 60's answer covered the discount, not these). 236: two tasks are marked done with nothing on file - startup funding and the back-end developer meeting. Were they done? And 237 is for the tax adviser, when one is engaged: may the estimate say "refund" when a claim through the pool creates a loss that is carried back? |  10 min |  The rate card; two task records; whether the estimate or the rulebook is corrected |
|  **17** |  **Three one-word answers, and who the solicitor is** (added 28 September 2026 by Phase 153) |  238: which solicitor gave the answers of 24 and 27 September (filing a client's return; title figures in the accountant's pack), and are they formally instructed? 187: send the surveyor the four drafts as they are, or the two copies with the pre-fill rule and the 63/46/80 figures withheld - the copies are ready. 34: the clawback clause's two bracketed terms (any reduction or only a large one; whether a settlement the client accepts counts) - the clause now waits on you, not the solicitor. |  10 min |  The solicitor's answers counted as advice; the surveyor pack sent; clause 13 finished |

 **Corrected 13 September 2026 by the Phase 130 sweep, because a row cannot be added to the table above.** Row 3 says both emails are drafted and attached and only need reading and a yes. The Valuation Office one does not yet carry the rewritten question 6 that a later addendum wrote, and the brief to the solicitor, in the list above the table, asks for a company number and registered office that do not exist. Both went back to Claude at Ready - Claude can build and are the first lines of Phase 131; each returns here when it can be sent as written. **One thing arrives here instead:** the address lookup's licence facts, which one drafted email to the supplier settles. **And the first paid surveyor review is parked** until the free call has been held, which its own notes say must come first.

 **Corrected 14 September 2026 by Phase 131.** The paragraph above is now out of date in the right direction: both drafts are back here, sendable as written. The Valuation Office email carries the rewritten question 6 and names the only route GOV.UK publishes — the Valuation Office contact form, because the Valuation Office has been part of HMRC since 1 April 2026 and publishes no data-licensing route. The Ordnance Survey email now asks only what our Data Hub account permits, because HM Land Registry's boundaries turned out to be under the Open Government Licence. The brief to the solicitor, version 2.1, signs off as a business being set up and not yet incorporated, and deliberately asks nothing about clearing the Caprebate name. Row 3 of the table is accurate again, and sending the brief joins it. **One more thing arrives here:** switching on the site-area calculation from the land boundaries, which is a decision rather than a licence, asked in CAPREBATE QUESTIONS.

### The five that are worth more than the line above says

 **The three mailboxes exist, are read, and send.** Lakhbir confirmed on 24 September 2026 that security@, data.protection@ and contact@caprebate.co.uk run on IONOS, and that Sadique Maskeen reads all three. The same afternoon a test email went from contact@ to Lakhbir through the back office’s own sending code and arrived, in junk at first (a new domain; whether IONOS signs with DKIM is still to check). Every document now names these addresses. Sending stays off until the privacy notice and the engagement letter name IONOS.


 **The fee problem is decided: the fee stays a flat 3%.** Lakhbir answered on 24 September 2026, in the Word questions document, that we keep 3% because over the whole five to seven years the relief is spread across, the client gains more than the fee. The arithmetic behind the question is kept here so nobody re-derives it: on a real competitor's client file our old 5% fee would have been £3,687 against £3,405 of year-one tax relief; at 3% it is £2,212, below that year-one relief, but 2.19 times the £1,010 that client actually realised, and it still exceeds the year-one relief where most of the spend is special-rate plant or profits are low. The answer is about the whole term, not year one. So the cap, the warning and a change of percentage all stay built and switched off. **What is left is not a decision but a signature:** CAP REBATE LTD signs the letters, so its director is asked to confirm the decided terms - "Does the director of CAP REBATE LTD agree the business decisions you make for the company?".


 **One of the two emails unblocks something the other cannot.** The Valuation Office one seeks clearance to use official valuation data commercially and sits behind the depreciation model, the location factor and the fee-scale correction. The Ordnance Survey one gets boundary maps, which is a quality improvement we can live without. **And do not wait for either reply to fix the preliminaries double count** — that is our own arithmetic mistake, it inflates every job we produce, and it needs nobody's permission.

 **Incorporation is done.** CAP REBATE LTD, company number 17307313, was incorporated on 29 June 2026 and confirmed as ours on 18 September 2026; its only director is Jalil Ahmed. This paragraph said incorporation was deferred indefinitely until the Phase 145 sweep corrected it on 22 September 2026. What sat behind the company now waits on people, not on the company: the data protection officer's appointment, ICO registration, corporation tax registration, a bank account, insurance and the Google listing. Professional indemnity cover can now be bought, so the breach paperwork's "no policy in force" ends when it is. **Thirteen governance documents are still queued behind one signature — the officer's — and nothing but that signature stops it.**


 **The unsigned data protection appointment leaves three duties that do not work.** Data protection complaints have no proper handler, breach notifications have nobody to sign them, and requests from people about their own data have no decision-maker. **If a complaint or a breach arrived tomorrow, the routes described in our own documents do not exist yet.** Two things to know rather than tidy. First, the thirteen documents were moved to Done on the board on 31 August on instruction, while their own headers still said "DRAFT — NOT APPROVED". **That gap**** i****s**** ****clos****e****d by a s****i****gnatu****r****e,**** ****n****o****t by editi****n****g the**** headers**** —**** and until the signature, by the status:** the label's own definition governs, as Phase 115 decided, so every one of them that is a document now sits at Built — awaiting sign-off (the privacy notice since Phase 115, the rest since Phase 128 on 12 September 2026) with an entry in FOR THE SOLICITOR, THE DPO AND THE DEVELOPER, and the ones that were only amendments to those documents stay Done, because the text they changed is in front of its signer. Second, the breach deputy route. **Updated 18 Septem****b****er 2026 (Phase 133****i****): it**** is ****n****o****w a ****t****wo-person c****h****eck.** The officer is Sadique Maskeen; Lakhbir Dhillon, who has no affiliation with CAP REBATE LTD, is only the deputy who decides a breach when the officer cannot be reached; and every countersignature, on the deputy route too, is the company's — CAP REBATE LTD, by a director. So the deputy decides and the company countersigns. (Until 18 September 2026 this said Lakhbir was both the deputy and the person who would approve, recorded as a known limitation.) What written authority the company gives a deputy outside it is asked of the solicitor in CAPREBATE QUESTIONS.


---

## 4 · For the accountant and the tax adviser

 **Everything on the tax side is itemised, one entry each, in FOR THE ACCOUNTANT** — the register beside this document in 00 START HERE. **It is not repeated here, and this section should never grow into a second copy of it.** What follows is only what a reader of the plan needs in order to decide whether to act.

 **Forty-five board items are finished and waiting on a signature from this side** (re-derived by the Phase 130 sweep on 13 September 2026 and reconciled by the register check; the register carries the live count). Phase 129 counted forty-three, and Phases 129a and 129b each added one. The six Phase 129 closed were file-carrier records holding identical copies of rulebook files that the rulebook items already carry, so no work was lost. The register keeps two roles apart, because they may be the same firm or two different ones:


|   |  Who |  What they are asked for |
| --- | --- | --- |
|  **Part 1** |  A **chartered tax adviser** |  Read eleven finished rulebooks, four output documents and twenty-four switched-off engine readings, and say where we are wrong. A fixed-fee document review, not a retainer
 |
|  **Part 2** |  **A practising accountant** |  Thirteen questions about the referral channel that only somebody who would use it can answer, including whether we need money-laundering supervision |

 **It is a cheap engagement because we have taken no position.** Every reading of the law that would make a claim bigger is coded, tested both ways, and switched **off**. Confirming one is a one-line change; rejecting one is doing nothing at all. **That is only true while it stays true** — the moment a switch is flipped on our own reading, the engagement becomes a request to ratify a live position, and stops being cheap.

 **Section A of the register is ordered by money, so a partial answer is still useful.** Its first entry is the stamp-duty point, which on our own reading understates every purchase claim by roughly 4 to 5%. **Bot****h**** of ****i****ts ha****l****ves ar****e ****n****o****w b****u****ilt and switched off** - the transaction tax since 7 September 2026, and the legal and incidental acquisition costs since 12 September - and the sentence that used to tell clients outside England that acquisition costs were added now follows the switch, so the wording no longer contradicts the arithmetic. **The same ****contrad****i****c****t****ion**** o****n**** the buyer's-own-alterations entry**** w****as**** ****cl****o****se****d**** ****the**** ****same**** ****d****a****y, ****th****e**** ****s****a****m****e**** w****a****y****.** The adviser now rules on the numbers; the words follow.


 **One number in our own paperwork is wrong and an adviser will find it.** The hiring documents and the draft engagement letter say "42 questions" and "13 blockers"; the review pack actually holds **46** tracked lines. **If the letter is signed as drafted, the contracted scope will not match the pack.** The register says so on its own face rather than leaving it to be discovered.

 **Corrected 14 September 2026 by Phase 131.** The review pack's count was re-derived from the board: 46 questions recorded, two of them superseded, so 44 are put to the adviser, 15 of them blockers. The two tax adviser packs now say so. The hiring documents and the rulebooks question pack's Part 4 still say 42 and 13; correcting them is Phase 132a, line 1, and FOR THE ACCOUNTANT says so on its own face. **Corrected again 28 September 2026 by Phase 153: the pack is now 53 lines.** Word question 50 (closed 24 September) put Rulebook I's seven questions into this review. Re-derived in code from TRACKER.csv (the subitems of the review pack, by `cta_answer_status` and `cta_severity`): **53 recorded — 49 open, 2 answered, 2 superseded — so 51 are put to the adviser: 15 blockers, 28 high and 8 standard** (the one unrated line is superseded). The three-day estimate (Word question 7, closed) was set when the pack was 46; it is kept, with the note that complicated property structures may need more time, and is not re-priced here.

 **Also open on this side, and still unanswered: whether anti-money-laundering supervision is legally required.** Our reading is that it probably is, and operating unsupervised where supervision is required is a criminal offence rather than a compliance gap. Lakhbir's account of his previous firm is recorded under "Does the law require us to be supervised for anti-money-laundering?" (24 September 2026): no supervision was needed there, and clients were checked by ID and facial recognition through Apyid after HMRC fined that firm for missing checks. **That is about checki****n****g clients, and i****t ****does not answer whether we must be su****p****e****r****vised** - another firm's position is not ours. The question stays open, put to the accountant ("Do we need to be supervised under anti-money-laundering rules?") and separately to a solicitor. What his account does add is a build: an outside identity check the client completes online, which Phase 151 researches and builds switched off. **Updated 28 September 2026 (Phase 153):** Lakhbir answered in the chat on 24 September, "no, we do not need to be supervised; we still check every client's identity" — recorded under that question, which stays open until the accountant confirms. The identity check was built for Veriff (Phase 151) and moved to **Didit** at his word on 25 September (Phase 151f), switched off; "Apyid" is APLYiD, the service his previous firm used (Word question 225).


---

## 5 · For the surveyor

 **Everything on the valuation side is itemised in FOR THE SURVEYOR**, beside this document. **Nine board items awaiting sign-off. Not repeated here.**


 **Nine are finished drafts or built work awaiting sign-off****:** the quantity model, the room-by-room equipment schedule, the valuation report template, when a video walkthrough may replace a visit, equipment lives and per-element ageing (with a completeness check on the equipment-life table, built and switched off on 12 September 2026), the cost of the small end, the rate library keyed on a real region, the preliminaries double count, and the rebuild-cost cross-check. **The preliminaries gate is built and switched**** ****off** - whether to switch it on turns on a convention only a surveyor can state, and a run on 12 September 2026 confirmed that switching it on disturbs no test of the allowance cap. **T****h****e**** two rebuild costs ****we****r****e traced**** the same ****day:** the element build-up of £2,841,400 is the right one and the other figure was a leftover, so what remains is what must be made like-for-like before our figure is compared with an insurance reinstatement valuation - a question, not a build.


 **We built everything and filled in nothing.** Not one coefficient has a value, not one qualifying percentage is pre-filled, and both depreciation methods ship switched off so that choosing between them stays a real choice rather than a default that ran while nobody was looking. **A surveyor reviewing finished work costs a fraction of one producing it**, and that is the whole argument for the engagement.

 **Four questions cut across more than one document and are worth more than everything else on that list put together:** whether a valuation resting partly on a video walkthrough is a basis they would put their name to, and what it is properly called; which pool emergency lighting belongs in, in every building we will ever survey; whether the ventilation family is one question or four; and how a theatre suite is counted, given that it is three to five enclosed spaces rather than one room.

 **Two things to raise on the free call, before any money is spent.** **BCIS is now ou****r ****cos****t**** s****o****u****rce** - Lakhbir chose the BCIS route on 24 September 2026, after meeting BCIS, and no Spon's books are bought - so ask whether the surveyor works from BCIS and would price our cost schedules from it (which BCIS product was agreed, and what its licence lets our software do, is asked of Lakhbir). And **whether preliminaries sit inside or outside the rates**, because that decides whether our own 18% uplift is correct or is a double count in every job we produce.


 **One piece genuinely cannot start until a surveyor is working:** the calibration set, built from the corrections a surveyor makes to our figures. **It is the only real evidence we will ever have about whether our pre-filled numbers are any good**, and it is the single item on the board at "Blocked — needs live jobs".

---

## 6 · What Claude is building next

 **3 October 2026: Phases 153a to 153e were checked line by line against the code; each now carries a dated corrections block, and Phases 153f, 154a1, 155 and 156 were added, so the sweep is Phase 157. What only a person can do is in `hub/WAITING-ON-PEOPLE.md`; every outside service and its switch is in `hub/KEYS-AND-SWITCHES.md`; how to carry on in a new chat is `hub/CONTINUE-IN-A-NEW-CHAT.md`.** Before that this read: **Straight off the tracker's "Ready - Claude can build" queue, re-derived on 29 September 2026 after the question review: five items, Phases 153a to 153e, each covered by its own section.** On 29 September Lakhbir set the rule that a sign-off never blocks a build: we build on our recommendation in the test system and ask the reviewer whether it is viable. Every one of the 160 open questions was reviewed against it (`hub/QUESTIONS-REVIEW-2026-09-29.json`); none stops the build, and the sixty builds they named are Phases 153b to 153e. The questions themselves are asked in `Caprebate - Unanswered Questions (29 Sep 2026).docx`, in five sections: the director, Lakhbir, Sadique, the surveyor and the accountant. Before that: Phase 153 carried the five decisions of 22 to 25 September into about fifty documents and corrected the rows whose labels said more than was true (its record is in PHASE HISTORY); what it found and could build but did not — the grant trace, the direction of the 24 tax adviser switches, recovery rows for the systems in use, and three document reconciliations — is Phase 153a, and the sweep (154) runs after it. Before Phase 153 this read: one item, Phase 153. Until the sweep this read: empty, and no orphan. Recovery codes (151m) ran on 28 September 2026 and are Done. The land boundary's first download as a test lookup (151l) is built: `smoke HMLR_INSPIRE`, and running it is Lakhbir's (section 3, row 13). Sign-in hardening (151k) ran on 28 September 2026 and is Done. The test website's uploaded documents on a store every copy reaches (151i) are built; seeing them work is Lakhbir's (section 3, row 14).


|  Owner |  What it is |  Why it is on the queue |
| --- | --- | --- |
|  Claude |  Phase 153a — the grant trace, the 24 switches' direction, recovery rows for the systems in use, and three document reconciliations (13199500801) |  Phase 153 found it; nobody has to answer anything first |
|  Claude |  Phase 153b — tax readings built on our recommendation, for the accountant to check (13199454668) |  The 29 September question review: build, then ask if it is viable |
|  Claude |  Phase 153c — data protection and the back office, for Sadique to check; one test call per keyed connector (13199468908) |  The same review |
|  Claude |  Phase 153d — the commercial papers in test form, for the director and the solicitor (13199500802) |  The same review |
|  Claude |  Phase 153e — the surveyor's workbench, for the surveyor to check (13199476474) |  The same review |
|  Claude |  Phase 153f — work found on 3 October that no phase held (survey pack stage 6 and chapters, an engine date bug, Zoom hosts, the old screens, WhatsApp, answers into the record, the tracker) |  The 3 October check of 153a-154 |
|  Claude |  Phase 154a1 — the faults the 3 October sweep found, fixed (13 lines) — **done 4 Oct 2026**, see PHASE HISTORY |  Lakhbir, 3 Oct: "these should be fixed in phase 154a1" |
|  Claude |  Phase 155 — the services the plans name but nobody has built (CIW, the Care Inspectorate, the VOA list, BCIS, the reply timer, the three server files) — **done 4 Oct 2026**, see PHASE HISTORY (the VOA list not built: its licence forbids our use) |  Lakhbir, 3 Oct: "this needs to be phase 156" (renumbered 155 when the services phase moved near the end) |
|  Claude and Lakhbir |  Phases 156a to 156e — every outside service, split on 4 Oct 2026 (156a the missing keys in Vercel, Ordnance Survey and Cloudflare; 156b email; 156c WhatsApp; 156d Zoom; 156e the rest): PART A is Lakhbir's, step by step; PART B is Claude's, after each step |  Lakhbir, 3 Oct: "all API's needed should be phase 155" |
|  Claude |  Phase 157 — the sweep, always last |  The standing rule |

 **"Ready" means nothing is in the way. It has never meant unstarted, and it has never meant Claude specifically types it** — the owner column is the truth about who acts. Test it as hard as "Blocked".

---

## 7 · What is genuinely blocking Claude

 **Corrected 28 September 2026 by Phase 151l.** The paragraph below says the land boundary maps wait on the data protection officer. They do not any more: Lakhbir answered the test-lookup question on 25 September 2026 (Word question 170), Phase 151g built his five conditions into the smoke command, and Phase 151l made the first boundary download a test lookup under them. The land boundary row is at "Ready - Lakhbir action": running the download, and then switching the fetcher on, are his (section 3, row 13). Nothing in this section blocks Claude today.

 **This is the whole of it: two items, re-derived from the live board by Phase 150 on 24 September 2026.** Both wait on the same answer from the data protection officer: the officer's own question item, and the land boundary maps for site size. The boundary item used to wait on a developer's fetcher as well; Phase 150 built that fetcher for real and switched it off, so it waits on the officer alone. **The ****s****e****c****on****d ****r****o****w**** ****o****f**** ****t****h****e**** ****t****a****bl****e ****b****el****o****w**** ****i****s**** an****sw****er****e****d:** the officer said "Not needed" to prior consultation on the backup risk (24 September 2026), and its board item is closed. For the record, the fourteen that sat here when the Phase 127 sweep started on 12 September were read one by one, and seven were not blocking a build:


 - the fee problem: decided on 24 September 2026 - the fee stays a flat 3% and all three options stay switched off; what is left is the director's confirmation of the decided terms;
- "yes and yes": answered "Not sure" on 24 September 2026, and it no longer matters, because IONOS keeps only the domain and email and the developers choose the host;
- the British Standards: a purchase, with the recommendation already written;
- the host's backup question: the email is rewritten (24 September 2026) for whichever host the developers choose, with only the backup question in it; the Ordnance Survey email is not needed for the boundaries, which come from HM Land Registry's free data;
- who publishes the address data, and which strip each new document type carries: things Claude could research and draft, both done by Phase 129.

Two more were already built and switched off - the overheads gate and the upload boundary - so they waited on a signature rather than a build. Phase 128 moved both to Built - awaiting sign-off on 12 September 2026. **W****ho**** ha****s**** ****t****o**** a****n****s****wer th****e one question that re****mains: the data protection office****r.**


|   |  What is stuck |  Who answers |  The question that unblocks it |
| --- | --- | --- | --- |
|  **1** |  Whether we may make a small, logged test lookup against a real register to prove a data connector works, before the first live fetch. The land boundary fetcher, built and switched off on 24 September 2026, waits on it too
 |  Data protection officer |  _"Can we make a few small, logged test lookups to check a data connector works?"
_ |
|  **2** |  ANSWERED 24 September 2026 - nothing stuck: the backup risk needs no prior consultation with the regulator
 |  Data protection officer |  _"Is the backup risk serious enough that we must first ask the Information Commissioner?" - answered "Not needed", and closed
_ |

 **Corrected 17 September 2026 by the Phase 133 sweep, and**** ****ag****a****i****n**** ****o****n**** ****24**** ****S****e****p****te****mb****er**** ****2026**** ****by**** ****Ph****as****e**** ****150.** Land boundary maps for site size sits at Blocked - question because **fetching** waits on the first row of the table above - the test lookup - and nothing else. Its permission was set on 16 September (internal calculation only, no maps in reports); the format was checked and the translation built on invented fixtures on 17 September (Phase 133); and the real fetcher of HM Land Registry's INSPIRE Index Polygons was built and switched off on 24 September (Phase 150), so no developer's fetcher is waited on any more. Re-derive this count from the board; do not quote it.


### Every row points at a written question


 **Re-checked 12 September 2026 by the Phase 127 sweep.** Every row names its question in CAPREBATE QUESTIONS under the title quoted, word for word, as the Phase 114 sweep checked them. **The rows that left this table did not lose**** th****eir**** ****q****ue****s****ti****on****s.** Every one is still asked in CAPREBATE QUESTIONS. What changed is the label on its board item, which now names what is actually in the way, with an update on the item saying why.


### The two worth understanding rather than just answering

 **The upload strip, and where it runs.** The design assumed the strip runs before the first write, and a file cannot be read before it has arrived somewhere. What is built, since 30 August 2026, is a fail-closed quarantine: the upload lands where nothing else can reach it, is stripped there, and only the clean result is promoted, with the quarantine copy deleted on the failure path too. **Whether that is the right boundary, or whether the quarantined ****wri****t****e**** is ****its****e****l****f**** ****t****h****e**** probl****e****m, is**** a ****da****t****a p****ro****t****e****ction**** de****ci****s****ion ****r****ath****e****r**** ****th****an**** a ****pat****c****h** — so since 12 September 2026 it has been at Built - awaiting sign-off with the data protection officer, and it has left the table above.


 **The preliminaries double count is not waiting ****o****n a ****b****u****i****l****d a****t**** ****a****l****l.** The gate that removes the uplift is built and switched off, and the item says so: Built - awaiting sign-off, with the surveyor. Flipping it waits only on the surveyor saying where preliminaries sit. Its update of 4 September asked for a replacement for the only regression test of the £1m allowance cap. **Phase 128 found that test already exists****, a****n****d**** Phase ****12****9**** ****prov****e****d i****t**** ****by**** ****a**** run:** with the gate switched on in memory, the cost model's own tests fail only where they check the gate itself, and the site harness's cap tests do not move. **Ask the surveyor on the free call.**


---

## 8 · What we are unsure about, or may have missed 

 **This is the most useful section in this document and it is deliberately not tidy.** A confident plan with a silent gap in it is worse than an honest one with a list.

### Things we do not know the answer to

 **The cost source is decided: BCIS, not Spon's** (Lakhbir, 24 September 2026, after meeting BCIS on 23 September). No Spon's books are bought, and the three copies on our disk were only a placeholder to test whether the engine could pull prices; they stay unused where they are. The case had been weakening since 3 September, when a real competitor's report priced an entire invoiced job on BCIS elemental costs and never mentioned Spon's, and the Spon's books have nothing for dental practices or care homes. **W****h****a****t**** ****w****e**** s****t****ill**** ****do**** ****n****o****t**** k****n****ow**** ****is**** ****narr****o****w****e****r:** which BCIS product was agreed and whether its licence lets our software use its rates - "Which BCIS product did you agree to, and does its licence let our software use its rates?" - and, from the surveyor, whether preliminaries sit inside or outside the rates, which decides whether our 18% uplift is a double count. Moving the cost model's source notes and the build papers to BCIS is Phase 151.


 **One honest limit on all of that:** it is one report, on one furnished holiday let, from one firm. It tells us what that firm does. It does not tell us what the profession does.

 **What Homedata actually costs per lookup — and this entry has now largely answered itself.** It used to say "we do not have the rate card". **We do: it was read on 23 ****Se****p****temb****er**** 2026 and it is on th****e suppl****i****er'****s ****own ****p****r****icing p****ag****e.** A hundred tokens cost £1, pay as you go, with no plan, no monthly allowance and nothing that resets — only a prepaid balance that answers with a payment error when it runs out. The lookup the connector actually makes costs 8 tokens, 8p: two for the postcode search, five for the address, one for the penny title pre-check. **Two thi****ng****s ****a****bout this ****ent****ry**** a****re worth keepi****n****g rather**** ****th****an ****d****e****le****t****ing.** The first is that a published price read once is not a fact that stays read: this one has been corrected three times, and the free tier recorded on 26 August never existed at all. The second is that the corpus stated the cost of "one lookup" two ways — 8p where it means ours, 7p where it means the supplier's find-then-retrieve. **Phase 147**** ****settle****d it**** on 24 Septemb****e****r**** ****2026:** every sentence about our cost now says 8p and says it is ours, including the worked example and the recommendation in the monday.com questions document, where they were (not in the Word one). The job cost model no longer treats the lookup as money spent before a signature. **What is ****genuinely ****still unknown is ****narrow****e****r**** ****than**** it**** ****w****a****s:** whether the price falls with volume, and whether 8p holds on a real account. Whether we buy a paid lookup at all is no longer open: Lakhbir answered yes on 22 September 2026. So the job cost model's Homedata price stays blank until the account is opened and the first lookup confirms it.


 **The contact telephone number - ****answ****ere****d**** ****24 September**** ****2026: none for now, em****a****il**** ****only.** The gap where a number should have been is gone from both thank-you screens (checked in the site file on 24 September 2026), and the address to show is contact@caprebate.co.uk, which Phase 151 puts on the screens. Kept here so nobody goes looking for the placeholder.


 **What "24 working hours" means ****-**** ****a****n****s****w****er****e****d**** ****24**** ****S****e****p****t****e****m****b****e****r 2026:**** ****o****n****e**** ****work****i****ng**** ****d****a****y.** The screens now say "within one working day" (checked in the site file the same day). It is the only service promise the product makes and it read three ways; it sets the adviser rota, and the rota now has one clear target.


 **Whether the small end of the market is worth serving.** There is no minimum job size and no minimum fee: the fee is a flat 3% of the allowances we identify. A £40,000 allowance earns £1,200 at 3% - profitable from a desk, loss-making if it needs a surveyor visit and a travel day. **Which it is still depends on the surveyor's answer about desktop valuation.** Lakhbir's own view, typed on 24 September 2026 under "Can you value a building safely without ever visiting it?", is that most surveys can be done from a desk given all the information. That is his input, not the surveyor's sign-off, so this still cannot be settled first.


 **The VAT position.** We are not registered. There is a monthly check on the board for when rolling twelve-month turnover crosses the threshold, or when a single month alone will. **Worth knowing: it changes the fee comparison.** The one competitor invoice we can see charged 4% plus VAT — and their 4% did _not_ exceed the client's year-one relief, while their fee _with_ VAT did.

 **Whether anti-money-laundering supervision is legally required - still open.** Our reading is that it probably is, because capital allowances advice by way of business may fall within the definition of a tax adviser. **Operating unsupervised where supervision is required is a criminal offence rather than a compliance gap.** Lakhbir's account of his previous firm (no supervision there; clients' ID and facial recognition checked through Apyid) is recorded under the question and does not answer it: it is about checking clients, not about supervision. Put it to the accountant.


 **Whether the Information Commissioner registration was ever applied for.** It was said on 1 September that it would be done that day. Nothing records that it was. It is roughly £52 and ten minutes - **and it does not need the company to exist:** the regulator's own registration pages offer sole traders and partnerships, and ask for a company number only from a limited company (read 12 September 2026). Registering as an individual now does mean paying again once the company exists.


### Things that are ambiguous rather than unknown

 **"Yes and yes" - answered "Not sure" on 24 September 2026, and it no longer matters.** On 3 September that was the reply to a message asking for two questions to be sent to the website host: could the client-document folders be left out of its backups, and could it run Node. Since then there is no WordPress, IONOS keeps only the domain and email, and the developers choose the host. The Node question went with WordPress, and the backup question is rewritten for whichever host the developers propose. Whether IONOS was ever asked no longer decides anything.


 **Whether the WordPress answer really means a full rebuild ****-**** answered ****18**** ****Sep****t****e****mb****er ****2026: the****re**** ****i****s**** ****no**** WordPress ****at**** ****all.** The Node application is the whole website and platform, on one server in the UK, and IONOS keeps only the domain and email. The expensive reading - roughly 19,500 lines of code and 8,500 lines of tests rebuilt or wrapped - is off the table, and the developers choose the host. See "The stack, and the bet inside it".


### Things we think are wrong and have not fixed

 **Added 14 September 2026 by Phase 131, and CORRECTED 28 September 2026 by Phase 153 — the website no longer promises clients what the law does not give them.** In September the site's own copy said a client could "typically reach back and amend tax returns within 4 years" (false for every client we serve: a company can make a capital allowances claim only until one year after its filing date, an individual or partnership twelve months after theirs, and the four-year overpayment relief cannot be used for a missed claim); it also said "No win, no fee", "From £5,000" and "Our fee comes only from what we recover", said a chartered tax adviser signs off the filing position, and called land remediation relief "an extra 150% deduction". **None of that is in the site file now** — grepped on 28 September 2026: "within 4 years", "reach back", "No win, no fee", "From £5,000", "£5,000", "Our fee comes only from", "signs off the filing" and "extra 150" each occur 0 times in `Caprebate site.html`, and every mention of land remediation relief says "an additional 50% deduction … (150% in all)". Phase 132 line 17 corrected the copy. What was true then and is not now: "none of it is live, because the site is not hosted" — the test website has been live at caprebate-test.vercel.app since September, which is why the correction mattered. Nothing is left open here.


 **The 18% preliminaries double count.** Our own arithmetic error, and it inflates every job. The gate that removes it is built and switched off, and it waits only on the surveyor saying where preliminaries sit - not on a licence, and not on a replacement test of the allowance cap, which a run on 12 September 2026 showed it does not need.


 **Stamp duty is still outside the apportionable base, and both halves of the fix are now built.** A competitor's real report puts the transaction tax inside the consideration that gets apportioned; our engine does not. The fix is built, tested and switched off (7 September 2026), and since 12 September so is its second half - legal and incidental acquisition costs, behind a switch of its own. **T****h****e ****con****t****radic****t****i****o****n**** ****t****ha****t**** ****m****a****d****e this ur****gent is closed:** the sentence that told clients outside England that acquisition costs were added now follows the switch, so today it says the tax is not added. What is left is the tax adviser's one-line answer on each half.


 **Seven fixture classifications are guesses.** Emergency lighting, commercial kitchen extract, clinical flooring, security glazing, drug storage, standby generators and the ventilation family. **Emergency lighting matters most — it is in every building we will ever see and the answer moves it between 14% and 6%.**

 **FIXED 7 September 2026 — the two facts the system read and no question asked.** The annual investment allowance headroom and whether there was enough taxable profit. Both had a reader in the engine and no source, so every benefit figure we produced was the slow one on one axis and the optimistic one on the other at the same time. Both are now asked, in all five sector flows, with "I don't know" as a real answer that routes to the cautious branch and invents nothing. **What**** we ****still ****cannot say**** is**** which effect dominate****d, ****and**** that**** is**** n****ow a ta****s****k**** r****ath****e****r th****a****n**** a**** se****n****tence** — it is on the board as "Measure which way the benefit figure actually moved once real clients answer the allowance and profit questions", at Blocked — needs live jobs. It needs real answers from real clients; no amount of modelling produces it.


 **CORRECTED 13 September 2026 by the Phase 130 sweep - the Accountant Handoff Pack no longer carries the old brand name.** It was missed when the name changed, because it lived as a document on this board rather than as a file on disk. Its live copy is now the exported file attached to its item, and that file contains neither the old name nor the one before it - searched on the Mac copy today. Nothing is left to fix here; the entry stays so nobody goes looking.


 **FIXED - we applied a regional cost factor in a way the book we cite forbids.** Spon's says twice that its location adjustment belongs on the total cost plan, not on individual element items, and our full specification's worked example put "Cardiff 94" on five separate element lines. It was found on 5 September and closed in a comment with the words "none of this changes the status" - in the same update that said fixing it did not wait on the purchase. It then got its own item, and that item is Done: the factor now lands on the total, before preliminaries and fees, and the cost model's own test asserts that order (re-checked by the Phase 130 sweep on 13 September 2026). **The related question, which does wait on the data,** is that our table declares a mean of 100 while the two source books use two different London bases.


 **Nobody with a practising certificate has read the contract our clients sign.** The engagement letter is finished and it is the most legally exposed document in the business — a break fee, a liability cap, a cancellation right, a fee disclosure. It was invisible to the three sign-off registers for the simple reason that they are built from the board and it had no board item. **That is a hole in the method, not just a missed document:** anything finished but untracked is invisible to every control we have. It now has an item, and an entry in the solicitor's register.

### Things we deliberately have not done, so nobody "fixes" them

 **No claim-increasing reading is switched on.** Twenty-four switches are built, tested and inert. Fifteen would make a claim bigger if switched on; three can only make one smaller - a grant taken off after the ceilings, the flats reading, and a landlord's contribution in supported living; four move money either way - the Scottish rate band, whether a lease granted for a premium with no joint election is item 9 of the disposal table, the corporation tax rate from the associated-company count, and the 60% band where the personal allowance is withdrawn; and two more change the basis of a figure or remove false negatives. Three of the twenty-four - the flats, the shared lounge and the purchase clock - are readings that were already live before anyone asked, so for those three, off is the live reading and on is the other one. They all stay off until a qualified adviser confirms them, because a client assessed for an over-claim is defended by an adviser's opinion and not by ours. (Corrected 15 September 2026 by Phase 132: this said nineteen; Phase 132 built five more.)


 **No register lookup fires before a signature.** The whole pre-signature derivation layer is built and switched off, because it processes personal data at a point where no contract exists and the privacy notice it depends on is not published. **Do not switch it on to make a demo look better.**

 **Unknown never routes to the favourable answer.** Where a fact is missing the system asks, or takes the lower figure. It never guesses, never interpolates, and never carries a value forward as an average. **"I don't know" is a first-class answer on every field**, and the estimate is allowed to have a gap in it.

 **The surveyor never sees our number first.** Structurally, not by hiding it on screen — our figures are not in the data their session receives at all. It is the only way to measure whether our estimates are any good.

 **`.bak-`**** snapshots keep their old filenames.** A dated snapshot of a file that was called something else on the day it was taken should say so.

---

## How the phases at the top of this document work 

 **MONDAY.COM IS THE MAIN BOARD AGAIN — LAKHBIR, 3 OCTOBER 2026: "im happy with monday becoming the main board we use to build and keep on top of tasks, but we shouldnt neglect one drive".** This overrules every older line in this document that says monday.com was dropped or "DO NOT CALL ANY monday.com TOOL". From now on:
 1. **The board is where the work is tracked**: "💰 Health Capital" (board 18422317809, BDM workspace; groups 00 START HERE to 05 FOR DEVELOPMENT and Z). A phase sets its item's Status to "Working on it" and fills "Claimed by (machine)" when it starts, and sets the true status and clears the claim when it ends. `hub/CLAIM.md` is still the lock and is still claimed and cleared as before.
 2. **OneDrive is never neglected.** Every status, owner or new item written to the board is written to `hub/TRACKER.csv` too, in the same phase (`node 03-app/caprebate-tracker.cjs`), so the files in OneDrive stay a complete record and every check that reads them keeps working. Documents, papers, the plan, PHASE HISTORY and the registers stay in OneDrive; the board links to them and never holds the only copy.
 3. **If the board and the tracker disagree, stop and ask Lakhbir** which is right, and say what each says. Never overwrite one with the other without asking.
 4. **The board is shared** (its owners include Abdul Rahman Hijazi, Shafiek Mohabbat and Umar Hussain, and it is open to everyone in the account): no client personal data, no keys or passwords, and no invented-data logins on it.
 5. **The board was brought up to date from the tracker on 3 October 2026** (with Lakhbir's yes; the record is in PHASE HISTORY).
 6. **THE RUN SHEET — LAKHBIR, 4 OCTOBER 2026.** The monday document on the CAPREBATE ACTION PLAN item (doc 18429698457) is where the phases are run from. It holds only the live phases, in order, at the very top (each one fenced block, ready to copy and paste), then **DONE — ACTIONS AND OUTCOMES**, a short entry per finished phase, oldest first. Every phase's banner says what to do when it finishes: write the full record in PHASE HISTORY; add its short entry at the END of the run sheet; **delete its own section from the run sheet AND from this document** (the sweep never deletes itself — it renumbers forward and stays last); set its board item and the tracker; clear the claim. **The phases here and on the run sheet must stay the same**: a phase added, changed or deleted in one is added, changed or deleted in the other in the same phase, and the copy in this document wins if they ever differ. The doc as it was before 4 October is saved in `08-monday-doc-exports/`.

 The engineering work runs as numbered phases, and the live ones are at the top of this document — copy a whole block, paste it into Claude, and it claims the work, does it, records what it found and deletes its own section. **Every phase also works THE STANDING INSTRUCTION**, which is the same thirteen numbered points and a closing check every time: retag what you touched, carry every loose end into a phase or a question, update the three sign-off registers, re-derive any figure you quote, and write the record into PHASE HISTORY. **A**** ****phas****e**** may not cl****ose wh****il****e ****a****nything it did not fini****sh**** is still only a**** sent****e****n****c****e** — that is the rule that stops work quietly disappearing into prose, and it is why the brand rename inside the Monday documents became its own phase rather than a line in a report when the disk rename could not reach them.


 **Two conventions worth knowing.** Every test figure is re-derived by running the suites, never carried forward from a previous phase — so there is an automated checker that runs all four suites and fails if any document on disk asserts a figure that is not current, and a second that reads the hub documents, which the first leaves to it on purpose. **Neither i****s a**** guarantee:** the first has been found blind to a phrasing five times, and each time the fix was to widen it and write down what it still cannot see. And **the sweep is always the highest-numbered phase and always last**; it is the one section that renumbers itself forward instead of deleting itself. What each completed phase actually did is recorded in PHASE HISTORY, which is an archive and holds no instructions.


---

 _Prepared 4 September 2026; restructured 5 September, when the plan below the phases was split by who has to act; counts re-derived 6 September. This is the document to work from: the live ph__a__se __pr__ompts ar__e__ __at__ the top, th__e __plan is below them. __**It**__** ha**__**s **__**five companions a**__**nd none of them is wo**__**r**__**k**__**e**__**d from.**__ CAPREBATE QUESTIONS holds every open question, each with an answer block to write in. FOR THE ACCOUNTANT, FOR THE SURVEYOR and FOR THE SOLICITOR, THE DPO AND THE DEVELOPER are the three live registers of everything waiting on a named person's signature — sections 4 and 5 point at the first two rather than repeating them. PHASE HISTORY record__s__ what each completed phase actually did. Where this plan says a question unblocks something, that question is in the questions document under the title quoted — there are no reference numbers in any of these documents, on purpose._
