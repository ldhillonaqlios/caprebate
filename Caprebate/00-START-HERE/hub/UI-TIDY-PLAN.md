# UI TIDY — the plan, and where it has got to

Started 2 October 2026 by Lakhbir with Claude Code (branch `claude/tidy-every-tab`). **A new chat starts here:** read
this file, then `CLAIM.md`, then carry on from the first phase below that is not DONE.

## The goal, in Lakhbir's words

Make every tab of the back office and the client portal cleaner, less cluttered and easy to use without help. A busy
person at a medical practice, or a new member of staff, should find what they need in seconds.

## What was agreed

- **The design: "design 2", a left-hand menu with groups, and each list as one table.** Mock-ups of every page, using
  the demo data: https://claude.ai/artifact/G74T4SbqtQLJX7AeamdgBW, page "The chosen style" (the first five options
  are on page "First 5 options"). Lakhbir chose design 2 and asked for more colour and darker boxes, especially on the
  pipeline, and for menus that open out on inner pages.
- **Keep the brand**: mint `#ABEDD8`, ink `#111111`, mist `#F2F8F6`, Bookman Old Style headings, Calibri body, the
  logo. New colours are added for the stage groups only (below). Text 12px or more, 4.5:1 contrast.
- **Never remove a feature or a permission to tidy up.** A form that was always open may move behind a button, but
  Lakhbir is asked first, each time.
- **How we work: option 3.** Lakhbir approves a group of phases; Claude builds them one at a time, each with its own
  claim, tests (each proved by breaking a line), house checks, Developer Spec section, PHASE-HISTORY entry and
  commit, sending real screenshots after each. Then stops for review before the next group. No push to main, no PR
  unless asked.

## The look (from the mock-ups)

| Stage group | Steps | Solid (bands, boxes) | Tint (labels) | Text on tint |
| --- | --- | --- | --- | --- |
| Winning it | Enquiry, Assessment, Engagement | `#1e4fa3` | `#dfe9f9` | `#1a438c` |
| Gathering | Data gathering | `#6b3fa0` | `#ece3f7` | `#55308a` |
| Surveying | Survey, Valuation | `#0f6b5c` | `#d4efe8` | `#0b5548` |
| Signing off | Tax adviser sign-off, Client report, Defence pack | `#8a5300` | `#fbecd0` | `#6e4300` |
| Getting paid | Invoice, Closed | `#1d6b35` | `#dcf0e1` | `#185c2d` |

Late = solid `#a01e1e`, white text. No date = `#e3e8e6`. Nobody owns it = `#fff1d6` / `#6e4300`. Number boxes are
solid (red late, brown nobody owns it, green money, black with mint figure for totals). Tables: black header row,
alternate rows `#f6f9f8`. The left menu is black with the current page in mint.

## The menus (each login sees only its own; the gates are unchanged)

- **Admin:** Home, Tasks · WINNING CLIENTS Leads, Pipeline, Introducers · CLIENTS AND CLAIMS Clients, Survey jobs,
  Calendar · MONEY Finance · ADMIN Settings.
- **Sales:** Home, Tasks · Leads, Pipeline, Introducers · Clients, Calendar.
- **Accounting:** Home, Tasks · Clients, Claims · Finance, Introducer fees.
- **Surveyor:** Home, Survey jobs, Tasks.
- **Client portal:** Your claim (opens to the claim, Your documents, Your letter, Show us your building when a survey
  is open), Messages.
- **Menus that open out:** a client (Overview, each claim by site and number, Messages and calls, Property checks,
  Questions, People, Files, History); a survey job (The job, Rooms, Rates, From the client, Your figures, Survey pack,
  Messages); Finance (Invoices, Money by month, VAT, Fee controls and firms, Finance settings, Earlier invoices);
  Settings (each setting).

## The phases

| # | Phase | Status |
| --- | --- | --- |
| 1 | The shared look: stage colours, solid number boxes, black table headers, labels | DONE 2 Oct |
| 2 | The left-hand menu for every login, the menus that open out, a menu button on phones; Survey jobs leaves More | DONE 2 Oct (Settings opens out; the client, survey job and Finance open out in their own phases) |
| 3 | Pipeline | DONE 2 Oct |
| 4 | Home | NEXT |
| 5 | Leads | |
| 6 | Clients list | |
| 7 | A client's page, part 1: header, claim boxes, its own menu | |
| 8 | A client's page, part 2: messages, checks, people, files, history as menu entries | |
| 9 | Tasks | |
| 10 | Survey jobs and a survey job (each names its site and claim number) | |
| 11 | Survey pack (names the site and claim; "0 min 32 s" becomes "32 s") | |
| 12 | Finance | |
| 13 | Calendar | |
| 14 | Introducers | |
| 15 | Settings | |
| 16 | Client portal: Your claims, Messages, Show us your building | |
| 17 | Accounting's and the Surveyor's own pages, and a phone check of every page | |

**Groups approved so far:** phases 1 and 2 (2 October 2026); phases 3 to 6 (2 October 2026).

## What the first look found (2 October 2026), worst first

1. A client's page: 111 buttons and 92 forms in one page; opens on a blank message form; Communication and Files twice.
2. Home: 32 boxes; pipeline tiles, overdue cards and next actions repeat other tabs.
3. Client portal: 19 boxes; "Send us a message" four times; three boxes all saying nothing is needed.
4. Survey jobs hidden under More for Admin; Dunmarrow listed twice with nothing to tell the jobs apart; the pack names
   only the company; lengths read "0 min 32 s"; the job page lists both of the client's sites.
5. Tasks: two lists under the table repeat it. 6. Leads: three rows of switches before a lead; form always open.
7. Pipeline: runs off the right edge at laptop width. 8. Introducers: two long forms open before the list.
9. Finance: two boxes say the same thing; a Settings tab beside the main Settings. 10. Calendar: a sentence under
every heading. 11. Phone: the header fills a quarter of the first screen.

## Things to know

- This Mac has stray files that are not in the repository: `api/index.mjs.new0929`, `09-app/backend/test/assessment-start.test.ts`, `test/_tmp152-*.test.ts`, `test/_probe146l.test.ts`, several `*.mutbak` and `*.new0929`. They make `npm run check` and the sign-off register check red here. Never delete them; Lakhbir decides. Count the back end with `node --test $(git ls-files 'test/*.test.ts')` plus any new test file.

## Tools

- Screenshots: `09-app/backend/tools/ui-shots.mjs` (local demo only, `@example.invalid` logins). Start the demo with
  `cd 09-app/backend && npm run start:demo > /tmp/demo.log`, then, from a scratch folder,
  `CB_DEMO_LOG=/tmp/demo.log node <backend>/tools/ui-shots.mjs <outdir> <plan.json>`; `tools/ui-shots-tabs.json` lists
  every tab. It keeps the authenticator keys it made in `appkeys.json` in the folder it is run from; a fresh demo
  needs that file deleted.
