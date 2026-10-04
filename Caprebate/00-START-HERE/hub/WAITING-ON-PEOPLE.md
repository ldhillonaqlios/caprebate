# Waiting on people — what only a person can do

**As found on 3 October 2026.** The rule (Lakhbir, 29 Sep 2026): **we build everything in test, then the right person
signs it off** — "anything you need signing off we build it, we then ask the accountant/solicitor/DPO to see if its
viable and if not we then correct it". So nothing here stops a build; each line is what turns a built thing into a
signed-off one, or what only a person can buy, send, sign or decide.

The live list is the tracker (hub/TRACKER.csv; statuses "Ready - Lakhbir action", "Blocked - question",
"Blocked - licence or purchase", "Built - awaiting sign-off") and section 3 of hub/ACTION-PLAN.md. This page is the
readable summary; when you do one, tell Claude and it updates the tracker and this page.

**Who's who.** Director: Jalil Ahmed (CAP REBATE LTD, company 17307313). DPO: Sadique Maskeen (named 18 Sep 2026,
appointment not yet signed). Lakhbir Dhillon: Head of Business Development, breach deputy.

## Lakhbir

- [ ] Confirm or complete the ICO registration (ACTION-PLAN ~1828).
- [ ] Check DKIM signing is on in IONOS (ACTION-PLAN ~1815; Phase 156 A4 has the steps).
- [ ] Get the director's confirmation of the 3% fee and the other terms (Word question 215).
- [ ] Send the Valuation Office email (Word question 11).
- [ ] Book the free 45-minute surveyor call.
- [ ] Get the DPO appointment signed by Sadique and the company, and its five blanks filled.
- [ ] Engage a chartered tax adviser.
- [ ] Decide on the two British Standards; buy BCIS (which product: Word question 218).
- [ ] Do the information governance training and record it.
- [ ] Run the land boundary's first test download.
- [ ] Look once at the test website to confirm Turso and the Blob store (Word questions 230 and 231).
- [ ] Delete the "DELETE" files on the OneDrive web page.
- [ ] Answer Word questions 235, 236, 238, 187 and 34 (237 is for the tax adviser).
- [ ] Others in the tracker: break and abort fee, clawback clause 13, Homedata licence facts, rate-card uplifts,
      solicitor brief, mailbox confirmation, Google Business Profile, bank and insurance, HMRC corporation tax,
      supplier breach clauses, and ten lower-priority items (Homedata, cyber security, hardware, brand, analytics…).
- [ ] The API steps in Phase 156 PART A (Turnstile, WhatsApp, the reply timer, IONOS DKIM, CQC/EPC/Homedata keys into
      Vercel, Zoom licence, Google Analytics, Anthropic paperwork, GoAddress, Didit).
- [ ] Send a test video from the iPhone through "Show us your building", and supply the tall hero video for the home
      page (PHASE-HISTORY ~11112-11160).
- [x] Decide whether the stray local files on the Mac (`*.mutbak`, `*.new0929`, `api/index.mjs.new0929`,
      `test/_tmp152-*.test.ts`, `test/_probe146l.test.ts`, `test/assessment-start.test.ts`, `_crawl_roles.ts`,
      `_s2.ts`) may go: they turn two checks red on the Mac. **Yes (Lakhbir, 4 Oct 2026); all 21 deleted that day.**

## The director (Jalil Ahmed)

- [ ] Agree the business terms and the 3% fee (Word question 215).
- [ ] Choose and instruct a solicitor (Word question 238).
- [ ] Who approves the rate card (Word question 69).
- [ ] Break fee and abort fee; fill the engagement letter's eight blanks with the solicitor.
- [ ] Countersign the DPO's appointment; sign the Anthropic contract when Sadique approves it.
- [ ] Where the breach register lives and who may write to it (SDP-G1); the one-off adviser engagement (SDP-G2).

## The DPO (Sadique Maskeen)

- [ ] Sign his own appointment.
- [ ] The 200-address matching test (Word question 200) — the only item at "Blocked - question".
- [ ] Approve the retention schedule, the document-pipeline impact assessment (DPIA), the breach procedure and the
      upload boundary.
- [ ] Approve and publish the privacy notice naming every service (IONOS, Didit, Postcodes.io, Companies House, Zoom,
      GoAddress, Cloudflare, Google, Anthropic…). Then the testing waivers in the code are switched to "named".
- [ ] Approve each US transfer for real clients: Zoom, WhatsApp (Meta), GoAddress, Anthropic, Cloudflare, Didit.
- [ ] With the director: are keys saved through the website's Admin tab (sealed with CAPREBATE_MFA_KEY) acceptable?
- [ ] Approve Cloudflare (Turnstile) as a processor.
- [ ] About 38 register entries in FOR-THE-SOLICITOR-DPO-DEVELOPER.md, and 26 Word questions.

## The solicitor (not yet instructed)

- [ ] Anti-money-laundering supervision: send the brief and get the answer (trading without supervision, if it is
      required, is an offence).
- [ ] The engagement letter: review it; confirm a typed-name signature is acceptable (then signing is switched on).
- [ ] SDP-L2 and SDP-L9 to L21; introducer terms; the terms, complaints and consent policies.

## The accountant and the tax adviser

- [ ] 45 built items for the tax adviser (24 switched-off tax readings, 11 rulebooks, a 53-line review pack) and 13
      questions for the accountant on the referral channel and AML. 58 Word questions for the accountant.

## The surveyor

- [ ] 9 built items; 27 Word questions (preliminaries, the video-only basis, emergency lighting, theatre counts…).

## Licences and purchases

- [ ] BCIS; the location and job-size adjustment; the professional fees scale; Valuation Office data; CIBSE plant
      lives; Homedata balance; Zoom Pro; WhatsApp (Meta) messages; GoAddress plan after 100 lookups.

## For the developers (production, not test)

- [ ] A UK production host with a managed database, file store, key vault, HTTPS/HSTS and tested backups; move the
      data out of the US (Turso is in us-east-1 today).
- [ ] Remove the test-only behaviour: seed data and its password, the two-factor exception for invented logins, the
      "any Vercel deployment is the test website" rule; error monitoring; a scheduler for the five background jobs;
      a penetration test; edge rate limiting; Cyber Essentials.
- [ ] Professional indemnity insurance (the site already says "insured").
