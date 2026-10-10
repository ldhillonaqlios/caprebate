# Waiting on people — what only a person can do

**As found on 3 October 2026; brought up to date by the Phase 159 sweep, 9 October 2026.** The rule (Lakhbir, 29 Sep 2026): **we build everything in test, then the right person
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
- [x] DKIM, SPF and DMARC for caprebate.co.uk — checked 5 Oct 2026 (Phase 156b): all published; a test email scored 10/10 on mail-tester.com.
- [ ] Get the director's confirmation of the 3% fee and the other terms (Word question 215).
- [x] Word question 11 — CLOSED 4 Oct 2026: neither licence email is sent (Lakhbir: the VOA rating list scrapped; "OS email no we dont need to send it"; on the Rating Cost Guide, "dont send it"). The fee percentage and the ageing method go to the surveyor (the free 45-minute call, Q9 and Q9a).
- [ ] Book the free 45-minute surveyor call.
- [ ] Get the DPO appointment signed by Sadique and the company, and its five blanks filled.
- [ ] Engage a chartered tax adviser.
- [ ] Decide on the two British Standards.
- [ ] Get the BCIS export (average prices, elements, location factors, the tender price index) or API access, for the survey pack's rates (tracker 13254356802). Our use is confirmed: Word question 218, closed 10 Oct 2026: BCIS confirmed our use (relayed by Lakhbir, 9 Oct 2026).
- [ ] Do the information governance training and record it.
- [x] ~~Run the land boundary's first test download.~~ Dropped 6 Oct 2026 (Lakhbir: "use home data"): the site boundary comes from Homedata's title outline; the fetcher stays built and off (tracker 12830205914, Parked).
- [x] Look once at the test website to confirm Turso and the Blob store (Word questions 230 and 231). Both work; closed 6 Oct 2026 by the Phase 157 sweep.
- [x] Delete the "DELETE" files on the OneDrive web page. Done 6 Oct 2026: moved to the OneDrive recycle bin on your yes.
- [x] One new "DELETE - Caprebate_Questions (a second item 6-7 Oct 2026, made by Phase 157c's mv backup).docx" in the Health Capital Allowances folder (Phase 158 sweep, 7 Oct 2026): Phase 157c backed up the questions document with `mv`, so your link opened a copy frozen at 10:22 on 6 Oct while four phases wrote to a second file. The sweep gave your linked file its name back and wrote the latest document into it. Nothing you typed was lost (the frozen copy was never edited). Say yes and Claude moves the DELETE copy to the recycle bin. Done 7 Oct 2026 on your yes: moved to the OneDrive recycle bin (recoverable for 93 days); gone from the Mac too.
- [ ] File your own care-provider confirming-letter template (Word question 77) in `05-reports-and-templates/`; until then the supported-living list points at our draft, `Caprebate-Care-Provider-Confirming-Letter-Template-DRAFT-v0.1.md` (Phase 153b, 4 Oct 2026).
- [ ] Confirm the two Phase 153b builds that are yours: the job cost model's line renamed "our own tax adviser, if we introduce one" (Word question 191), and Homedata as the chosen planning source (Word question 202 - closed 6 Oct 2026 by Phase 156f: Homedata answers planning history after signing).
- [ ] Answer Word questions 235, 236, 238 and 34 (237 is for the tax adviser). (187, answered by you in chat on 1 Oct 2026 - the drafts go to the surveyor pre-filled - and built by Phase 153e, was moved to the closed document by Phase 158a on 7 Oct 2026.)
- [ ] Confirm the two Phase 153c readings that are yours: "data is stored for 7 years" read as OUR copy (Word question 192), and the address lookup kept seven years in test until Homedata answers (Word question 37, and send Homedata the drafted email when the account opens).
- [ ] Others in the tracker: break and abort fee, clawback clause 13, Homedata licence facts, rate-card uplifts,
      solicitor brief, mailbox confirmation, Google Business Profile, bank and insurance, HMRC corporation tax,
      supplier breach clauses, and ten lower-priority items (Homedata, cyber security, hardware, brand, analytics…).
- [x] **Phase 156a PART A — done 5 Oct 2026 (Lakhbir):** EPC, CQC, Ordnance Survey and both Cloudflare keys set in Vercel
      and a production deploy made. EPC and CQC test lookups PASSED from the Mac the same day.
- [x] The three key-file lines (OS and both Turnstile) — added by Lakhbir 5 Oct 2026; the Ordnance Survey test lookup PASSED.
- [x] PRs 9 to 18 into main — done 5 Oct 2026 through PR 19 (claude/plan-156 into main); the live test site reads the keys.
- [x] Close PRs 10 to 17 on GitHub: their work is in main through PR 19. All eight closed (checked 7 Oct 2026).
- [x] Merge PR 34 (Phase 157d), then the Phase 158 sweep's PR (against main; it also carries 157d's commits, so merging it alone brings 157d in too). The sweep brought 157d up to date with main on 7 Oct 2026, so 34 merges cleanly now. Both merged by Claude on your word ("you merge them all"), 7 Oct 2026: PR 34, then PR 35.
- [x] Say yes and Claude deletes `Development/_claude-sweep158-transfer/` (git-ignored; the Phase 158 cloud session's patches, all now on the branch). Deleted 7 Oct 2026 on your yes.
- [ ] A two-minute look (Phase 158b, F26): search cqc.org.uk for "Friary House Surgery" in Plymouth (PL4 9BH) and say whether the regulator lists it at that postcode. Our lookup found one location there and could not match its address to ours; it is most likely another service. The regulator's site refuses our automated reading, and a test lookup on a client's property is not allowed (your Word question 170 conditions).
- [ ] Sadique: confirm the two WhatsApp answers Lakhbir gave on 5 Oct 2026 (uploaded chats follow the client-message
      retention rule; messages from before the client ticked the WhatsApp box are kept) — FOR-THE-SOLICITOR-DPO-DEVELOPER.
- [ ] An Android WhatsApp export, made-up content, when one is to hand: the reader was built for Android from WhatsApp's
      documented layout and tested on invented files only (Phase 156c). Put it in 09-app/backend/test/fixtures/whatsapp-export.
- [x] Sadique: approve Cloudflare (US) for testing, so the contact form's server check can run (Phase 156a A3.6). _(Approved 5 Oct 2026, relayed by Lakhbir; `sources.ts` updated the same day.)_
- [ ] The API steps in Phase 156 PART A (Turnstile, WhatsApp, the reply timer, IONOS DKIM, CQC/EPC/Homedata keys into
      Vercel, a free Ordnance Survey Data Hub key into Vercel (`OS_DATA_HUB_API_KEY`, for the report's site plan, Phase 153f), Zoom: two free scopes and a check that the host is contact@ (no payment, one shared host: both DONE 5 Oct 2026, Phase 156d), Anthropic paperwork (DONE for testing, 5 Oct 2026), GoAddress (REMOVED 6 Oct 2026, Phase 156f: Homedata answers the address box; Lakhbir deleted `GOADDRESS_API_KEY` from the key file and closed the GoAddress account the same day), Didit (how long it keeps results, in its console), Homedata (its key in Vercel and a balance)). Phase 156e, 5 Oct 2026, left these three as yours.
- [x] Zoom: hold one short test call and press "Ask Zoom how long it lasted" on its page. DONE 6 Oct 2026: "Lasted 4 minutes. 2 people joined." The free plan gives a call's length and attendees. Now Phases 156a to 156e. _Google Analytics was dropped for now on 4 Oct 2026; the marketing team may pick it up later._
- [ ] Send a test video from the iPhone through "Show us your building", and supply the tall hero video for the home
      page (PHASE-HISTORY ~11112-11160).
- [x] Decide whether the stray local files on the Mac (`*.mutbak`, `*.new0929`, `api/index.mjs.new0929`,
      `test/_tmp152-*.test.ts`, `test/_probe146l.test.ts`, `test/assessment-start.test.ts`, `_crawl_roles.ts`,
      `_s2.ts`) may go: they turn two checks red on the Mac. **Yes (Lakhbir, 4 Oct 2026); all 21 deleted that day.**

## The director (Jalil Ahmed)

- [ ] Agree the business terms and the 3% fee (Word question 215).
- [ ] Choose and instruct a solicitor (Word question 238).
- [ ] Who approves the rate card (Word question 69).
- [ ] Ask the accountant whether the fee-versus-benefit comparison should count VAT on our fee for clients who cannot reclaim it (Word question 59) — built on that recommendation on 4 Oct 2026 (Phase 153b), switched off, and dormant until we are VAT-registered.
- [ ] Break fee and abort fee; fill the engagement letter's eight blanks with the solicitor.
- [ ] Countersign the DPO's appointment. _(Anthropic: approved by Sadique and signed, for testing, 5 Oct 2026 — relayed by Lakhbir. For real clients it is confirmed again.)_
- [ ] Where the breach register lives and who may write to it (SDP-G1); the one-off adviser engagement (SDP-G2).
- [ ] Take the draft letter of authority for Lakhbir's breach decisions to the solicitor and, if they agree, sign it (Word question 184; `06-commercial-and-governance/Caprebate-Letter-of-Authority-Breach-Deputy-DRAFT-v0.1.md`, Phase 153c).
- [ ] Agree the draft deputy route for rights requests and complaints, with you countersigning (Word question 56; complaints pack 3.5A, rights procedure 5.9A, Phase 153c).
- [ ] Check the Phase 153d test defaults, each built on our recommendation and marked "test default, not agreed" (Word questions 23, 33, 34, 42, 45, 62 and 196): the disposal fee (£290, fixed); the test-only engagement letter's clause 5 (£995 a property plus a booked surveyor at cost), clause 7(d) and clause 13 (any reduction; settlements count); the introducer terms (10%, signed terms); the money-laundering check's scale, 25% and three new kinds of client; and the enquiry-support risk at 12 (High).
- [ ] Take the one-page list of insurance covers and the broker brief to a broker (Word question 62; `06-commercial-and-governance/Caprebate-Insurance-Covers-to-Ask-a-Broker-v0.1.md`).

## The DPO (Sadique Maskeen)

- [ ] Sign his own appointment.
- [ ] The 200-address matching test (Word question 200) — the tool is built and waits on your answer (SDP-P43; moved to "Built - awaiting sign-off" by the 6 Oct 2026 sweep, which left no item at "Blocked - question").
- [ ] May we keep a company's type from Companies House ("ltd", "plc", "llp")? Proposed as a permitted field on 4 Oct 2026 (Phase 153b), with its switch off — Word question 240.
- [ ] Check the Phase 153c builds, each built on our recommendation in the test system (Word questions 37, 55, 56, 162, 165, 178, 181, 182, 183, 184, 192, 193, 201, 208, 219 and 222, each marked "Built 4 October 2026 (Phase 153c)"); the new entries SDP-P41 (healthcare premises import) and SDP-P42 (the enquiry clean-up, off until you approve twelve months).
- [ ] May the survey pack show the surveyor how much each grant paid? Built hidden — Word question 241 (Phase 153c).
- [ ] Phase 153f: how long WhatsApp messages and their files are kept (a reading in FOR THE SOLICITOR, THE DPO AND THE
      DEVELOPER: the same rule as client messages); may staff WhatsApp a contact who did not tick the funnel's new optional
      WhatsApp box; is fetching a WhatsApp file from Meta's file host under your WhatsApp approval (our reading)?
- [ ] Approve the retention schedule, the document-pipeline impact assessment (DPIA), the breach procedure and the
      upload boundary.
- [ ] Approve and publish the privacy notice naming every service (IONOS, Didit, Postcodes.io, Companies House, Zoom,
      Homedata, Cloudflare, Google, Anthropic…). Then the testing waivers in the code are switched to "named". _(GoAddress removed 6 Oct 2026, Phase 156f: Homedata, in the UK, answers the address box.)_
- [ ] Approve each US transfer for real clients: Zoom, WhatsApp (Meta), Anthropic, Cloudflare, Didit. _(GoAddress removed 6 Oct 2026, Phase 156f.)_ _(WhatsApp, 5 Oct 2026: no transfer to Meta from us any more — chats are exported on the phone and uploaded to the record, Phase 156c. Sadique's two questions are 156c A2.)_
- [ ] With the director: are keys saved through the website's Admin tab (sealed with CAPREBATE_MFA_KEY) acceptable?
- [ ] Approve Cloudflare (Turnstile) as a processor.
- [ ] About 38 register entries in FOR-THE-SOLICITOR-DPO-DEVELOPER.md, and 26 Word questions.

## The solicitor (not yet instructed)

- [ ] Anti-money-laundering supervision: send the brief and get the answer (trading without supervision, if it is
      required, is an offence).
- [ ] The engagement letter: review it; confirm a typed-name signature is acceptable (then signing is switched on).
- [ ] SDP-L2 and SDP-L9 to L21; introducer terms; the terms, complaints and consent policies.
- [ ] Phase 153c: the email-only surveyor breach clause (Word question 55, 2C-T beside the draft), the letter of authority (question 184) and the deputy route (question 56).
- [ ] Phase 153d: the test-only engagement letter's clauses 5, 7(d) and 13 (is £995 a fair estimate of our losses; does clause 13 work; is "named in our privacy notice" sound?), the introducer terms and disclosure line (question 42), and the money-laundering check's test defaults (question 45).

## The accountant and the tax adviser

- [ ] 51 items in FOR THE ACCOUNTANT (counted by the register check, 9 Oct 2026; it said 45 and 24 switches on 3 Oct):
      among them the 29 switched-off tax readings (verify-extraction counts them), the rulebooks and the review pack,
      and the questions for the accountant on the referral channel and AML. The Word questions for the accountant are
      in its Section 3.
- [ ] Phase 158d (ACC-H3, board 13245993980): is the accountant's own confirmation link asking the right thing, and is
      the defence pack's list of the claim's records a sound minimum? Both built and on in test.
- [ ] Phase 153e: chapter 15's VAT half (FOR THE ACCOUNTANT, ACC-A16's dated line): only an exempt claimant's VAT not
      reclaimed is counted; a partly exempt claimant waits for you.

## The surveyor

- [ ] 9 built items; 27 Word questions (preliminaries, the video-only basis, emergency lighting, theatre counts…).
- [ ] Check the Phase 153e workbench, built on our recommendation (Word questions 129–131, 133–139, 145, 147–150, 203),
      each a test default or a placeholder: the desk-first grid's limits and the 80% pass mark; the shared-area fallback
      (25%); the ventilation and seven-item placements; the theatre suite's spaces; preliminaries by job size; the
      insurance and past-claim limits (10%; 5% and £25,000); the index table; the planning sentence; "Seen on site" or
      "From documents". How many re-shoots before a visit is not built: it waits for your answer.
- [ ] A second finished claim, not used to tune the cost model, for the past-claim test's empty slot (Word question 139).
- [ ] The Homedata five-home floor-area comparison: five homes whose floor areas you know (Word question 203). The Homedata account is open with a card since 6 Oct 2026, so nothing else waits.

## Licences and purchases

- [ ] BCIS; the location and job-size adjustment; the professional fees percentage (from the surveyor, not the Valuation Office: 4 Oct 2026); CIBSE plant
      lives; Zoom Pro — before real clients only, not needed for testing (Lakhbir, 5 Oct 2026: Phase 156d runs on the free plan with one shared host, contact@caprebate.co.uk; calls stop at 40 minutes, Zoom keeps no recording, one call at a time; staff as their own Zoom hosts later, when Lakhbir asks: each a free Zoom user under their Cap Rebate sign-in email, and the code already uses it - Phase 153f). (GoAddress: removed 6 Oct 2026, Phase 156f; its key-file line deleted and its account closed by Lakhbir. Homedata: the account is open with a card since 6 Oct 2026.) (WhatsApp: no cost — since 5 Oct 2026 chats are exported on the phone and uploaded to the record; no Meta connection.)

## For the developers (production, not test)

- [ ] Before real clients: consider moving caprebate.co.uk's DMARC from p=none (watch only) to p=quarantine once its reports show only IONOS sending (Phase 156b, 5 Oct 2026).

- [ ] A UK production host with a managed database, file store, key vault, HTTPS/HSTS and tested backups; move the
      data out of the US (Turso is in us-east-1 today).
- [ ] Remove the test-only behaviour: seed data and its password, the two-factor exception for invented logins, the
      "any Vercel deployment is the test website" rule; error monitoring; a scheduler for the five background jobs;
      a penetration test; edge rate limiting; Cyber Essentials.
- [ ] Professional indemnity insurance (the site already says "insured").
