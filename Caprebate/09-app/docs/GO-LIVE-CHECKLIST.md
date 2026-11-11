# Going live: the checklist

_Phase 161h, 7 November 2026. This is the gate of Phase 161n ("Go live"). Tick a line only with its evidence (a date, a screenshot, an answer recorded in the Word questions document). The live website opens to clients only when every line is ticked. How to do each step is in [LIVE-RUNBOOK.md](LIVE-RUNBOOK.md)._

## People and purchases (nobody can build these)

1. [ ] **Vercel Pro bought** for the team `ldhillonaqlios` (board item "Buy Vercel Pro"; the developer buys it, Lakhbir 11 Nov 2026). The free plan is for non-commercial use only, and allows timers only once a day.
2. [ ] **The ICO registration number** received and written into the privacy policy (Word question 287).
3. [ ] **Every legal page approved** by the data protection officer (no solicitor, Lakhbir 11 Nov 2026), recorded at `/staff/legal` (board item "Legal pages approved"). Only then `CAPREBATE_LEGAL_PAGES=on` in the live project.
4. [ ] **Where the live website keeps data agreed** by the developer and the data protection officer: Vercel in London, Turso in Ireland (or London), the document store in London, the backup bucket in London (Word question 291). The privacy policy's lines match (`src/integrations/outside-services.ts`).
5. [ ] **The backup store chosen and set up** (Amazon S3 in London recommended), its lifecycle rule set to 35 days, its four settings in the live project (Word question 155 answered: the holding place is left out).
6. [ ] **Everyone who can change the live website named** (Word question 157), each with two-step sign-in on Vercel and GitHub. LIVE-RUNBOOK.md section 8 lists them.

## The live project (the runbook, sections 2 to 4)

7. [ ] The live project made from the repository, **Production Branch `live`**, **Function Region London (`lhr1`)**, Node 24.
8. [ ] The **London Blob store** made, private, and connected to the live project only.
9. [ ] The **live and preview Turso databases** made (Ireland, or London if offered), both empty to start.
10. [ ] **Every required setting** in Production, each Sensitive (the runbook's table), and **none of the test-only settings**. `CAPREBATE_BACKUP_KEY` also in the password manager.
11. [ ] The **reference database** built from the current ONS release and uploaded; its two settings set (runbook section 10).
12. [ ] **The first release** run from GitHub ("Release to the live website"): the build log says the tables are up to date, and the function log says `live website: started`.

## The domain and email (at IONOS)

13. [ ] `caprebate.co.uk` and `www.caprebate.co.uk` added to the live project, and **the DNS records Vercel shows** added at IONOS (an A record for the apex, a CNAME for www). Vercel then issues the HTTPS certificate itself.
14. [ ] **Email records for contact@caprebate.co.uk** at IONOS, checked with an outside checker: **SPF** (IONOS's include), **DKIM** (IONOS's key, switched on), **DMARC** (start at `p=none` with a report address, then `quarantine`).

## Proved on the live website

15. [ ] `https://caprebate.co.uk/api/health` answers `{"ok":true}`, and an **uptime check** (for example UptimeRobot, free) watches it every 5 minutes and alerts Lakhbir and the developer.
16. [ ] A staff sign-in asks for **a second step**; a timer called without its word answers **401**; the three timers show a run each in the function log (`timer ...:`).
17. [ ] **A backup made and restored on a copy** from the live bucket (runbook section 7), the audit chain intact.
18. [ ] **The switches that stay off are off** on the live website: the free and paid lookups' gates, document reading, signing the letter from an emailed link (Word question 246), Google Analytics (Lakhbir dropped it, 4 Oct 2026), the WhatsApp live connection (manual upload only, 5 Oct 2026). Engagement signing and the clause 13 fee clawback are ON (Lakhbir approved, 11 Nov 2026, no solicitor). The Connections page's switch list (`/staff/connections/switches.json`, Admin only) is saved with the date.
19. [ ] **Run the sweep (the last phase on the run sheet; Phase 163 since 11 Nov 2026) before the first client**, and its findings closed or written into a phase.
