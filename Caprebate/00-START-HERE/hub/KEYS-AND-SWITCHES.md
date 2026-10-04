# Keys and switches — every outside service, what it needs, and whether it is on

**As found on 3 October 2026** (the API audit Lakhbir asked for). Phase 156 (run near the end, before the sweep) is the work that moves this list: its PART A
is what Lakhbir does, step by step, and its PART B is what Claude builds after each step. When a line changes, change
it here and date it.

**How a key reaches the test website.** A key is read on Vercel only when (1) it is set in Vercel (project
caprebate-test > Settings > Environment Variables), (2) its name is in `TEST_DEPLOY_KEYS` in `api/index.mjs`, and (3)
`CAPREBATE_TEST_PASSWORD` is set (12+ characters). On the Mac, keys come from `~/.caprebate-secrets.env`. Admin can also
save a key from the Admin tab. Never paste a key into a chat or a file in the repository.

**Test mode, not production.** Everything below is the test website with invented data. Where data is kept (the Turso
database is in AWS us-east-1, in the USA; the Blob store's region is not stated) is for the developers to move to the UK
when the production host is chosen — the spec's UK-residency rule (DS-W11). Lakhbir, 3 Oct 2026: "we are currently in
test mode, developers will change this".

**4 October 2026 (planning): Phase 156 was split into 156a to 156e.** A "156 A…" or "156 B…" step named below is the old numbering; the table at the top of Phase 156a in ACTION-PLAN.md says where each one went (for example 156 A1 Turnstile is now 156a A3; 156 A5 CQC and EPC is now 156a A1). The keys still missing from Vercel (EPC, CQC, Ordnance Survey, the two Turnstile keys) are Phase 156a, step by step.

## On now (test website)

| Service | What it does | Keys (in Vercel?) | State | Before real clients |
|---|---|---|---|---|
| Turso database | The test website's records | `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN` (yes); `CAPREBATE_DB_LOCAL_COPY=on` (yes, 3 Oct) | Live; a local copy on each copy of the site since 3 Oct (clicks 0.6–0.8 s) | UK host (developers) |
| Vercel Blob | Uploaded documents | `BLOB_STORE_ID` (yes) | Live | UK host (developers) |
| IONOS email sending | Staff emails, invitations, sign-in codes, calendar invites | `IONOS_SMTP_*` (yes) | **Sends real email**, under a testing waiver (`EMAIL_SENDING`, src/stubs/email-provider.ts) | Privacy notice and letter clause 7 name IONOS; check DKIM (156 A4) |
| IONOS mailbox reading | Replies to contact@ come into the app | `IONOS_IMAP_*`, `REPLY_TIMER_TOKEN` (yes) | Live, read only; the outside timer (cron-job.org) is set up by hand (156 A3) | Privacy notice |
| Zoom | Video calls, meetings created on our account | `ZOOM_*` (yes) | Live, transfer approved for testing **Phase 153f (4 Oct 2026):** each call is hosted by its assigned member of staff, under their sign-in email (each needs a Zoom user on our account and a licence); anyone else falls back to the shared host. Call length and attendees need two more scopes (156 A6 step 5). | Paid licence (156 A6); Sadique for real clients |
| Didit | Identity checks | `DIDIT_*` (yes) | Live under a testing waiver; 500 free a month, then about 33 US cents a check | Privacy notice; retention set in Didit (156 A10) |
| Companies House "Find my company" | Company search at the assessment | `COMPANIES_HOUSE_API_KEY` (yes) | Live under a testing waiver | Privacy notice |
| Postcodes.io | Postcode check | none | Live under a testing waiver | Privacy notice |
| GoAddress | "Find my address" | `GOADDRESS_API_KEY` (yes) | Live under a testing waiver; 100 free, then paid | Who they are and where hosted (156 A9); privacy notice |

## Built, but missing keys or switched off

| Service | What it does | What is missing | Phase |
|---|---|---|---|
| Cloudflare Turnstile | Anti-bot check on the contact form | **Not working**: the page shows Cloudflare's test key, the server check is off. `TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY` not set and not in `TEST_DEPLOY_KEYS`; transfer not approved | 156 A1/B1 |
| WhatsApp (Meta) | Messaging clients | All six `WHATSAPP_*` keys; Meta business account, approved template, webhook **Phase 153f:** a file someone sends is fetched from Meta's file host when staff press "Get it" (service WHATSAPP_MEDIA, same token); the funnel asks a separate, optional WhatsApp question. | 156 A2/B2 |
| Anthropic Claude API | Reading clients' documents | `ANTHROPIC_API_KEY`; switches off (`CLAUDE_SWITCHES`); Sadique's approval and the director's signature first | 156 A8 |
| CQC | Care registrations and beds | `CQC_SUBSCRIPTION_KEY` in the local key file, not in Vercel or `TEST_DEPLOY_KEYS`; switch off; free gate shut **Phase 153f (4 Oct 2026):** on the test website only, switched on under Lakhbir's 2 Oct waiver ("All the free ones", `TEST_WEBSITE_LOOKUPS`); the shipped switch stays off. The key is now in `TEST_DEPLOY_KEYS`; it still has to be set in Vercel. | 156 A5/B3 |
| EPC register | Floor area, age band | `EPC_API_TOKEN` in the local key file only; switch off **Phase 153f (4 Oct 2026):** on the test website only, switched on under Lakhbir's 2 Oct waiver ("All the free ones", `TEST_WEBSITE_LOOKUPS`); the shipped switch stays off. The key is now in `TEST_DEPLOY_KEYS`; it still has to be set in Vercel. | 156 A5/B3 |
| Homedata | Paid address/UPRN and planning; a floor-area estimate from the building's shape (Phase 153e, 4 Oct 2026: `HOMEDATA_DIMENSIONS`, off, its own switch, stamped on every case) | `HOMEDATA_API_KEY` in the local key file only; needs a balance; switch off | 156 A5/B3 |
| Companies House research | Profile, filings, PSC, officers after sign-up | Key is set; switches off; free gate (a published privacy notice) | 156 B3 (moved from 153c line 18) |
| HM Land Registry Price Paid | Sale prices | Switch off; free gate **Phase 153f (4 Oct 2026):** on the test website only, switched on under Lakhbir's 2 Oct waiver ("All the free ones", `TEST_WEBSITE_LOOKUPS`); the shipped switch stays off. | — |
| HM Land Registry INSPIRE | Land boundary / site area | Switched off in code; first test download; a folder on a server (`CAPREBATE_INSPIRE_STORE_DIR`) — written up for the developers, Developer Spec §5.1a (Phase 155) | 156 |
| Planning (planning.data.gov.uk, PlanIt) | Planning history | Switch off; free gate; PlanIt's "not for commercial use" **Phase 153f (4 Oct 2026):** on the test website only, switched on under Lakhbir's 2 Oct waiver ("All the free ones", `TEST_WEBSITE_LOOKUPS`); the shipped switch stays off. PlanIt only, for the test website's invented clients; Homedata stays the chosen route (Word question 202). | 153b line 19 |
| ONS postcode table | Postcode to council area | A 75 MB file on a server (`CAPREBATE_POSTCODE_DB`) — written up, with OSTN15 (`CAPREBATE_OSTN15_FILE`), Developer Spec §5.1a (Phase 155) | the production host |
| Care Inspectorate Wales | Care registrations and places in Wales (Phase 155, 4 Oct 2026) | No key: a downloaded file, imported on the server (`node src/cli.ts import-register CIW <file> --by <admin>`); `REGISTER_SWITCHES.CIW` off; free gate shut | — |
| Care Inspectorate (Scotland) | Care registrations, places and beds in Scotland (Phase 155) | No key: the month's datastore CSV, imported the same way (`import-register CARE_INSPECTORATE`); `REGISTER_SWITCHES.CARE_INSPECTORATE` off; free gate shut | — |
| BCIS index | The building price index the cost model turns costs back to the purchase date with (Phase 155) | BCIS bought (Word question 218); then `node src/cli.ts import-bcis-index <file>` keeps it outside the repository (`CAPREBATE_BCIS_INDEX_FILE`) | 157 (the pack's wiring) |
| Google Analytics 4 | Website visits after consent | **DROPPED FOR NOW (Lakhbir, 4 Oct 2026):** the code stays off (no `GA4_MEASUREMENT_ID`, so no cookie choice and nothing loads); the marketing team may pick it up later. Do not ask for the id | none (was 156 A7) |
| Engagement signing | Typed-name signature, in house | `ENGAGEMENT_SIGNING` off until the solicitor confirms | waiting on the solicitor |
| Keeping uploaded originals | Encrypted copies of client files | `CAPREBATE_ORIGINALS_KEY` is set; ON for the test website only (`KEEP_ORIGINALS_TEST_WEBSITE`, passed by api/index.mjs, seven years, Phase 153c); the shipped `KEEP_ORIGINALS` stays off; Sadique's check | waiting on Sadique |
| Ordnance Survey (OS Data Hub, Features API) | Building outlines for the report's site plan (Phase 153f, 4 Oct 2026, from the 2 Oct stage 6) | `OS_DATA_HUB_API_KEY` (free OS OpenData plan; in `TEST_DEPLOY_KEYS`, not yet set in Vercel); fetched on the test website only. Open data (OS Open Zoomstack, Open Government Licence): no letter to Ordnance Survey needed; the licence email is NOT being sent (Lakhbir, 4 Oct 2026) | 156a A2 |
| HM Land Registry title (Business Gateway) | Official title copy | Retired: done by hand | — |

## Named in the plans, not built

**The VOA rating list — SCRAPPED** (Lakhbir, 4 Oct 2026: "scrap the VOA rating"): its licence restricts it to business
rates purposes (Phase 155). Not to be reopened — COORDINATES, "DECIDED - DO NOT REOPEN". The rest of
what was here was built by Phase 155: the Welsh and Scottish care regulators and the BCIS index import (above), and the
outside reply timer, now in COORDINATES and the continuity plan, with Admin warned on the home page after an hour
without a read in working hours.

## Set in Vercel but doing nothing

`BLOB_WEBHOOK_PUBLIC_KEY` (read nowhere). (`CAPREBATE_ORIGINALS_KEY` was here until Phase 153c, 4 Oct 2026: the test website now keeps uploads with it.)
