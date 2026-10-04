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

## On now (test website)

| Service | What it does | Keys (in Vercel?) | State | Before real clients |
|---|---|---|---|---|
| Turso database | The test website's records | `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN` (yes); `CAPREBATE_DB_LOCAL_COPY=on` (yes, 3 Oct) | Live; a local copy on each copy of the site since 3 Oct (clicks 0.6–0.8 s) | UK host (developers) |
| Vercel Blob | Uploaded documents | `BLOB_STORE_ID` (yes) | Live | UK host (developers) |
| IONOS email sending | Staff emails, invitations, sign-in codes, calendar invites | `IONOS_SMTP_*` (yes) | **Sends real email**, under a testing waiver (`EMAIL_SENDING`, src/stubs/email-provider.ts) | Privacy notice and letter clause 7 name IONOS; check DKIM (156 A4) |
| IONOS mailbox reading | Replies to contact@ come into the app | `IONOS_IMAP_*`, `REPLY_TIMER_TOKEN` (yes) | Live, read only; the outside timer (cron-job.org) is set up by hand (156 A3) | Privacy notice |
| Zoom | Video calls, meetings created on our account | `ZOOM_*` (yes) | Live, transfer approved for testing | Paid licence (156 A6); Sadique for real clients |
| Didit | Identity checks | `DIDIT_*` (yes) | Live under a testing waiver; 500 free a month, then about 33 US cents a check | Privacy notice; retention set in Didit (156 A10) |
| Companies House "Find my company" | Company search at the assessment | `COMPANIES_HOUSE_API_KEY` (yes) | Live under a testing waiver | Privacy notice |
| Postcodes.io | Postcode check | none | Live under a testing waiver | Privacy notice |
| GoAddress | "Find my address" | `GOADDRESS_API_KEY` (yes) | Live under a testing waiver; 100 free, then paid | Who they are and where hosted (156 A9); privacy notice |

## Built, but missing keys or switched off

| Service | What it does | What is missing | Phase |
|---|---|---|---|
| Cloudflare Turnstile | Anti-bot check on the contact form | **Not working**: the page shows Cloudflare's test key, the server check is off. `TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY` not set and not in `TEST_DEPLOY_KEYS`; transfer not approved | 156 A1/B1 |
| WhatsApp (Meta) | Messaging clients | All six `WHATSAPP_*` keys; Meta business account, approved template, webhook | 156 A2/B2 |
| Anthropic Claude API | Reading clients' documents | `ANTHROPIC_API_KEY`; switches off (`CLAUDE_SWITCHES`); Sadique's approval and the director's signature first | 156 A8 |
| CQC | Care registrations and beds | `CQC_SUBSCRIPTION_KEY` in the local key file, not in Vercel or `TEST_DEPLOY_KEYS`; switch off; free gate shut | 156 A5/B3 |
| EPC register | Floor area, age band | `EPC_API_TOKEN` in the local key file only; switch off | 156 A5/B3 |
| Homedata | Paid address/UPRN and planning; a floor-area estimate from the building's shape (Phase 153e, 4 Oct 2026: `HOMEDATA_DIMENSIONS`, off, its own switch, stamped on every case) | `HOMEDATA_API_KEY` in the local key file only; needs a balance; switch off | 156 A5/B3 |
| Companies House research | Profile, filings, PSC, officers after sign-up | Key is set; switches off; free gate (a published privacy notice) | 156 B3 (moved from 153c line 18) |
| HM Land Registry Price Paid | Sale prices | Switch off; free gate | — |
| HM Land Registry INSPIRE | Land boundary / site area | Switched off in code; first test download; the files a server needs | 155 line 6 |
| Planning (planning.data.gov.uk, PlanIt) | Planning history | Switch off; free gate; PlanIt's "not for commercial use" | 153b line 19 |
| ONS postcode table | Postcode to council area | A 75 MB file on a server (`CAPREBATE_POSTCODE_DB`) | 155 line 6 |
| Google Analytics 4 | Website visits after consent | `GA4_MEASUREMENT_ID`; Sadique's review of the measurement plan | 156 A7 |
| Engagement signing | Typed-name signature, in house | `ENGAGEMENT_SIGNING` off until the solicitor confirms | waiting on the solicitor |
| Keeping uploaded originals | Encrypted copies of client files | `CAPREBATE_ORIGINALS_KEY` is set; ON for the test website only (`KEEP_ORIGINALS_TEST_WEBSITE`, passed by api/index.mjs, seven years, Phase 153c); the shipped `KEEP_ORIGINALS` stays off; Sadique's check | waiting on Sadique |
| HM Land Registry title (Business Gateway) | Official title copy | Retired: done by hand | — |

## Named in the plans, not built

CIW (Wales), the Care Inspectorate (Scotland), the VOA rating list, BCIS cost rates (no API licence; product not
bought), and the outside reply timer written into the repository — Phase 155.

## Set in Vercel but doing nothing

`BLOB_WEBHOOK_PUBLIC_KEY` (read nowhere). (`CAPREBATE_ORIGINALS_KEY` was here until Phase 153c, 4 Oct 2026: the test website now keeps uploads with it.)
