# Carry on in a new chat — paste the block below into a new Claude Code chat

Written 3 October 2026. It is everything a new chat needs to pick up where the last one stopped. Copy the whole block.

```
I'm Lakhbir Dhillon, Head of Business Development at Cap Rebate (CAP REBATE LTD;
director Jalil Ahmed; DPO Sadique Maskeen). We're building Caprebate: capital
allowances claims for healthcare property. Talk to me in plain English and keep
it simple.

WHERE EVERYTHING IS
- Repository: github.com/ldhillonaqlios/caprebate. On my Mac the working copy is
  /Users/lakhbir/Library/CloudStorage/OneDrive-AqliosLTD/Health Capital
  Allowances/Business Development/Development (quote the path: it has spaces).
  git pull first. The app is Caprebate/09-app/backend (Node 24, TypeScript run
  directly, server-rendered HTML, strict security policy: no inline scripts or
  styles).
- The plan: Caprebate/00-START-HERE/hub/ACTION-PLAN.md. Read THE STANDING
  INSTRUCTION and COORDINATES first. The phases still to run are at the top, in
  order: 153a, 153b, 153c, 153d, 153e (each has a "CHECKED 3 OCTOBER 2026 -
  CORRECTIONS" block inside it that overrules its older lines), 153f, 154a1,
  155, 156, then 157 (the sweep, always last). Each phase is one fenced block.
- What only a person can do: hub/WAITING-ON-PEOPLE.md.
- Every outside service, its keys and whether it is on: hub/KEYS-AND-SWITCHES.md.
- History of everything done: hub/PHASE-HISTORY.md (read the end). The last
  work was the UI tidy (18 phases, PR #5) and "faster clicks" (PRs #6 and #7).

THE RULE FOR WHAT WE BUILD
We build everything in the test system first, then ask the right person (the
accountant, the tax adviser, the surveyor, the solicitor, Sadique, the
director) to sign it off; if it isn't viable we correct it. A sign-off never
blocks a build. The test website is caprebate-test.vercel.app with invented
data only. Where data is stored (the Turso database is in the USA today) is for
the developers to move to the UK at production; don't change it now.

HOUSE RULES (follow them exactly)
- Claim the lock in Caprebate/00-START-HERE/hub/CLAIM.md before starting (commit
  and push it), and clear it in the final commit. If a claim is already there,
  stop and tell me.
- Work on a new claude/... branch. Never push to main. Only open a pull request
  when I ask; I merge, and the merge deploys the test website.
- Tests go in Caprebate/09-app/backend/test. Break a line of code on purpose to
  prove each test catches it. Count the suite with
  node --test $(git ls-files 'test/*.test.ts') plus any new test file; the Mac
  is often overloaded, so run it in chunks of about 12 files. Last count on 3
  Oct: 2221.
- Run the house checks from Caprebate/ and commit only if they are green (run
  the gate on its own, never piped into tail):
  node 03-app/caprebate-crm-fold-check.cjs
  node 03-app/caprebate-plain-words-check.cjs
  node 03-app/caprebate-signoff-register-check.cjs
  node 03-app/caprebate-analytics-allowlist-check.cjs
  node 03-app/caprebate-figure-drift.cjs --fast --expect 1279,439,403,<backend total>
  and npm run typecheck in 09-app/backend. When code lines move, update the
  developer spec's line references (the CRM fold check finds them).
- Update 09-app/CAPREBATE-DEVELOPER-SPEC.md (a section per change, the test
  counts) and hub/PHASE-HISTORY.md.
- Font sizes 12px or more. Screen text in plain words (reading grade 9 or under);
  the guide grade 7 or under.
- Never permanently delete anything. Never delete the stray local files
  (*.mutbak, *.new0929, api/index.mjs.new0929, test/_tmp152-*.test.ts,
  test/_probe146l.test.ts, test/assessment-start.test.ts, _crawl_roles.ts,
  _s2.ts): they make two checks red on the Mac; I decide about them.
- You can't sign in to the test website yourself. Real emails or messages need
  my OK first. Never ask me to paste a key or password into the chat: keys go
  into Vercel or ~/.caprebate-secrets.env, by me.
- monday.com: the board "💰 Health Capital" (18422317809) was dropped on 25 Sep
  for the repository's tracker (hub/TRACKER.csv). I want to work from the board
  again; until the note under "How the phases at the top of this document work"
  in ACTION-PLAN.md says how the two are kept, read the files and don't write to
  the board without asking me.

WHAT TO DO FIRST
Tell me in a few lines where things stand (git log, CLAIM.md, the open pull
requests), then ask me which phase to run next. Don't start building until I
say.
```
