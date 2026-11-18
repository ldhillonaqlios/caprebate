# The live website on Vercel: the runbook

_Phase 161h, 7 November 2026. For the developer (ITRoadway) and anyone who looks after the live website. Lakhbir decided on 6 November 2026 to host it on Vercel, for security: nobody runs a server, every change is built from GitHub, and a bad release is rolled back in one click._

The go-live checklist, the list of what must be true before the first client, is [GO-LIVE-CHECKLIST.md](GO-LIVE-CHECKLIST.md). Phase 161n2 works through it.

**Hosting is the developer's (Lakhbir, 12 November 2026).** The developer buys Pro and sets up everything in sections 2 to 4, 7 and 8, including every live key, from the pack Phase 161n1 wrote for them: `Caprebate/06-commercial-and-governance/Cap Rebate - live website pack for the developer (12 Nov 2026).docx`, which gives each step its reason and ends with a sheet to send back. Claude makes no hosting; Phase 161n2 checks the developer's work and switches the website on.

## 1. What runs where

| Part | Where | Notes |
|---|---|---|
| The website and client portal | A Vercel project of its own (we suggest the name `caprebate-live`), team `ldhillonaqlios`, on the **Pro plan** (the free plan is for non-commercial use only) | Functions in **London** (`lhr1`). Built from the GitHub repository `ldhillonaqlios/caprebate`, branch **`live`** only. |
| The database | A **new Turso database**, apart from the test one | **Ireland** (`aws-eu-west-1`), unless `turso db locations` lists London when you make it. Checked 7 Nov 2026: Turso's servers answer London visitors from Ireland, and its documents name no London or Paris place. |
| Documents and survey photos | A **new private Vercel Blob store**, made in **London** (`lhr1`) and connected to the live project | Never the test website's US store. |
| The postcode table and the map grid | The **reference database**: its own Turso database, read-only, in the same place | Holds no personal data. Rebuilt each quarter (section 10). |
| Timers | **Vercel Cron**, on the live project only | Three jobs (section 9). `vercel.ts` gives them only when `CAPREBATE_PRODUCTION=1`. |
| The nightly backup | A storage bucket at a **second company**: we recommend **Amazon S3 in London** (`eu-west-2`) | Locked with our own key before it leaves. Kept 35 days. |
| Keys | The live project's **Environment Variables**, Production, each marked **Sensitive** | Never a file, never in GitHub. |

The test website (project `caprebate-test`) is unchanged: it still builds every merge to `main`, runs in Washington beside its US database, and is woken every five minutes by the outside timer (cron-job.org, Lakhbir's account), because Vercel's free plan allows a timer only once a day. **cron-job.org stays for the test website.** Nothing of the test website is used by the live one.

**How one repository makes two websites.** Both projects run `api/index.mjs`. With `CAPREBATE_PRODUCTION=1` in a project's settings, it starts the live website (`Caprebate/09-app/backend/src/app/live-website.ts`): no invented people, no demo logins, no test letter or signing, no notices test banner, every staff login with a second step, form tokens on, and never a database in memory. Without it, the test website, as before. `vercel.ts` (the settings file at the top of the repository) is worked out by each project when it builds, and adds the timers only where `CAPREBATE_PRODUCTION=1`.

## 2. Set up the live project (once)

You need a Vercel login in the `ldhillonaqlios` team with two-step sign-in on (section 8), and the Turso and Vercel command-line tools.

1. **Buy Pro** for the team `ldhillonaqlios` (the developer buys it, Lakhbir 11 Nov 2026: board item "Buy Vercel Pro"). Buying needs billing rights; the developer goes back to Member afterwards (section 8).
2. **New project** from GitHub `ldhillonaqlios/caprebate`. Framework: **Other**. Root directory: the top of the repository. Node: **24.x**. Leave the build and install commands empty: `vercel.ts` gives them.
3. **Settings, Git: Production Branch = `live`.** A merge to `main` then never changes the live website. No other branch builds here (step 7): previews run on the test project.
4. **Settings, Functions: Function Region = London (`lhr1`).** A region written in `vercel.ts` was not followed when we tried it (7 Nov 2026); the project's own setting is.
5. **Storage: create a Blob store**, private, region London, and **connect it to this project's Production only**. Vercel adds `BLOB_STORE_ID` itself. Never connect it to Preview or Development: code on a branch nobody has reviewed would then hold the token for every client document (ITRoadway's second review, H-03, and their answer to E1, 13 Nov 2026).
6. **The keys** (section 3): tick **Production only** for every one. Vercel ticks every environment by default when a setting is added, so untick Preview and Development each time, and then check that Preview and Development hold nothing.
7. **Settings, Git, Ignored Build Step:** `if [ "$VERCEL_ENV" = "production" ]; then exit 1; else exit 0; fi` (exit 0 skips the build), so no branch builds a preview here. **The one exception** is the proof on a preview before go-live (Phase 161n2, build item 1, and the timings in the pack's Part 6), as ITRoadway's H-03 step 4 allows: for that build only, the preview gets its own empty Blob store, its own empty Turso database (`caprebate-live-preview`, section 4), example and test keys only, and Vercel Authentication on (Settings, Deployment Protection). Afterwards put the Ignored Build Step back, disconnect and delete the preview's store, and check again that Preview holds no key.
8. **Domains:** add `caprebate.co.uk` and `www.caprebate.co.uk` (the go-live checklist has the DNS records at IONOS).

## 3. The keys

Every name is in `Caprebate/09-app/backend/secrets.example.env`, with what it is. The live website reads each from the project's settings (`LIVE_KEYS`: every key that is not retired). Mark every one **Sensitive**.

**Without these the live website does not start** (it answers 503 and its log names what is missing, never a value):

| Setting | What |
|---|---|
| `CAPREBATE_PRODUCTION` | `1`. This is what makes it the live website. |
| `CAPREBATE_DB_URL`, `CAPREBATE_DB_TOKEN` | The live database (section 4). `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN` also work, if Vercel's Turso integration adds them. |
| `BLOB_STORE_ID` | Added by Vercel when the London store is connected (or `CAPREBATE_BLOB_TOKEN`). |
| `CAPREBATE_MFA_KEY` | `openssl rand -base64 32`. Seals each person's authenticator app secret. |
| `CRON_SECRET` | 32 characters or more: `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"`. Vercel sends it with every timer call. |
| `CAPREBATE_BACKUP_KEY` | `openssl rand -base64 32`. **Also put it in the password manager**: without it no backup can be opened. |
| `CAPREBATE_PUBLIC_ORIGIN` | `https://caprebate.co.uk` |
| `CAPREBATE_UPLOAD_LINK_KEY` | `openssl rand -base64 32`. Signs each upload link (Phase 161n1b, ITRoadway L-15). Its own key: until then the links were signed with a key worked out from the database token, so changing the token broke every link. The developer sets it. |

**The rest** (email, Companies House, Didit, Homedata and so on): a missing one leaves that service "not set up", which the Connections page shows, as on the test website. Add `CAPREBATE_REFERENCE_DB_URL` and `CAPREBATE_REFERENCE_DB_TOKEN` (section 10), and the four `BACKUP_S3_*` settings (section 7). **`CAPREBATE_LEGAL_PAGES=on` only once every legal page is approved** (board item "Legal pages approved").

**The contact form's security check is required on the live website** (Phase 161n1c, ITRoadway M-04). Set `TURNSTILE_SITE_KEY` and `TURNSTILE_SECRET_KEY` (Cloudflare dashboard, Turnstile, a widget for `caprebate.co.uk`; the developer's to set), and the data protection officer must have approved the transfer to Cloudflare (it is on the outside services list). Without both, the live website refuses every enquiry with "Our security check is not working just now" and an email address; it never keeps one unchecked, as the test website still does. The enquiry form, the assessment's submit and a client's sign-up are also limited to 10 from one network address in 15 minutes, a hidden field drops what a robot fills in, and at most 30 thank-you emails go out an hour.

**Virus scanning of uploads** (Phase 161n1c, M-03) is a hook with no service behind it (`UPLOAD_SCANNING` in `src/integrations/connectors/upload-scanner.ts`, off). Which service is the developer's choice, as they host, and the data protection officer approves it before any file is sent. Wire it by writing an adapter of the `UploadScanner` shape that calls the service through `src/integrations/connectors/http.ts`, and give it to the app (`App.scanner`); then every upload is sent to it before it is stored, and only a clean answer goes on. Until then, every upload is still checked for what it is, its size, a PDF's end, and macros or scripts (refused in plain words). The Connections page shows the row.

**Never in the live project** (the start stops if one is there): `CAPREBATE_TEST_PASSWORD`, `CAPREBATE_ALLOW_SEED`, `CAPREBATE_SIGNING_TEST`, `CAPREBATE_COST_MODEL_TEST`, `CAPREBATE_LIVE_SMOKE`, `CAPREBATE_LOCAL_EMAIL`, `CAPREBATE_LOCAL_WHATSAPP`, `CAPREBATE_LOCAL_ZOOM`, `CAPREBATE_LOOKUPS_HERE`, `CAPREBATE_TEST_LOOKUP_LOG`.

## 4. The live database (once)

```bash
turso db locations                      # is London (aws-eu-west-2) listed? If yes, use it; if not, aws-eu-west-1 (Ireland)
turso group create caprebate-live --location aws-eu-west-1
turso db create caprebate-live --group caprebate-live
turso db show caprebate-live --url      # -> CAPREBATE_DB_URL
turso db tokens create caprebate-live   # -> CAPREBATE_DB_TOKEN
```

Make a second one the same way for the one preview proof (`caprebate-live-preview`, section 2 step 7), with test data only. Leave both empty: the first release's build step makes the tables. The build **never** adds the test website's invented people, and the live website refuses a database that has them.

## 5. Release (deploy and promote)

1. Merge the pull request into `main` as usual. The test website updates; **the live website does not**.
2. GitHub, **Actions, "Release to the live website", Run workflow.** Leave the commit blank for `main` as it stands, or give one. It checks the commit is on `main` and that "A fresh copy passes every check" passed on it, then moves the `live` branch to it.
3. Vercel builds it. The build log says `build (live website): the live database's tables are up to date`. **If the build step fails, the release fails** and the website stays on the release before.
4. Check: `https://caprebate.co.uk/api/health` answers `{"ok":true}`; the function log's first lines say `live website: started` and which keys were read (names only).

**Protecting the live branch (Phase 161n1e, ITRoadway's second review, L-11). Two GitHub settings, switched on by Lakhbir** (he chose to do these later, 17 Nov 2026; the workflow is ready for them):
- **A ruleset on the live branch:** GitHub, the repository, Settings, Rules, Rulesets, New branch ruleset. Target `refs/heads/live`. Turn on "Restrict updates", "Restrict deletions" and "Block force pushes". Bypass list: the **GitHub Actions** app only. Then only the release workflow can move `live`, and a direct push is refused.
- **An approval before each release:** Settings, Environments, `live` (the workflow has already made it), "Required reviewers": Lakhbir, and the ITRoadway engineer once their GitHub username is in. Every release then waits for an approval before anything moves.
The workflow also counts the check only when GitHub's own Actions app ran it (`app.slug == "github-actions"`), so a check of the same name from anything else cannot pass a release. Its Actions are pinned to commits, and `.github/dependabot.yml` proposes updates as pull requests. `.github/CODEOWNERS` names who reviews a change to the structure's rules (`architecture/`, the boundary check) and to `.github/`; turning on "Require review from Code Owners" in the main branch's rule makes that review required.

## 6. Roll back

Vercel, the live project, **Deployments**: open the release before, **Instant Rollback**. It is back in seconds. Then fix the fault on `main` and release again (section 5). The release workflow refuses to move `live` backwards, so a rollback is always Vercel's button, never a branch push.

Table changes (migrations) are not undone by a rollback. Every migration only adds (a new table or column), so the release before still runs on the newer tables. Keep it that way: a migration that removes or renames something needs its own plan, written before it is released.

**If a release stops at a migration** (the build log names the file and says why). Since Phase 161n1e a migration that rebuilds a table is sent to Turso as one batch, so its "foreign keys off" holds (it did not on 16 Nov 2026, and the test website's rebuild stopped at 049; `tools/turso-migration-proof.ts` proves it on a database). A file that runs its own transaction either lands whole with its record or not at all. If the build says a migration "left N reference(s) pointing at nothing", it did land: restore the database from before the release (Turso's point-in-time restore, or section 7), fix the file, and release again. In every other case nothing from the file landed: fix it on `main` and release again. The website stays on the release before throughout.

## 7. Backups, and restoring one

**Every night at 02:00 UTC** the `backup` timer copies, to the bucket: the whole database as one file (`database/<date>.db.cbbk`), and every document that is new or changed (`documents/...`). Each file is locked with `CAPREBATE_BACKUP_KEY` (AES-256-GCM) before it leaves. Uploads still in the **holding place** (`quarantine/`) and locked photos waiting (`survey-incoming/`) are **left out**, on purpose (Word question 155). The reference database is not backed up: it is rebuilt from free downloads. The function log says what was copied, in counts.

**Set up the bucket (once). The website can add to its backups and read them, and never delete them** (Phase 161n1d, ITRoadway's second review, M-09: leaked settings or a bad release must not be able to wipe the backups along with the live data):
1. An S3 bucket in `eu-west-2`, Block Public Access on, default encryption on, and **Versioning on**.
2. **Object Lock** on the bucket, in **Governance** mode, with a default retention of **35 days**. Every version is then kept at least that long, whoever asks.
3. **Lifecycle rules:** delete the current version of `database/` files 35 days after they are made; delete any **noncurrent** version (of anything) 35 days after it becomes noncurrent; delete expired delete markers. Do **not** expire the current version of `documents/`: a document still on the website has only that copy.
4. **The website's user** may do `s3:PutObject` and `s3:GetObject` on that bucket and nothing else (no `s3:DeleteObject`, no `s3:PutBucket*`, no `s3:BypassGovernanceRetention`). Put its four details in `BACKUP_S3_BUCKET`, `BACKUP_S3_REGION`, `BACKUP_S3_ACCESS_KEY_ID` and `BACKUP_S3_SECRET_ACCESS_KEY`. Until they are set, the backup says `not run: there is nowhere to copy it to`.
5. **A separate restore user**, read only (`s3:GetObject`, `s3:GetObjectVersion`, `s3:ListBucket`, `s3:ListBucketVersions`), kept in the password manager and **never in Vercel**. The restore below uses it.
6. The AWS account's **root** login has two-step sign-in on and **no access keys**.

**How a changed or deleted document is kept.** Each night copies a changed document over its backup under the same name; with Versioning, the copy before it becomes the older version and stays 35 days, so a document damaged or encrypted on the live store does not lose its good copy at 02:00 (get it back with the restore user, by version, in the S3 console). A document deleted from the website gets a small marker written over its copy (`GONE_MARKER`; no delete right is needed): the real copy becomes the older version, and the lifecycle rule removes it 35 days later, so a deletion we promise still reaches the backup within 35 days. The restore skips it.

Turso also keeps its own point-in-time copies (24 hours on its free plan, 10 to 90 days on paid plans). That is a second line, not the backup.

**Restore (tried on a copy on 7 Nov 2026 by test/core/live-website.test.ts; try it again on a copy each quarter):**

```bash
aws s3 sync s3://<BACKUP_S3_BUCKET> ~/caprebate-restore/bucket
cd Caprebate/09-app/backend
CAPREBATE_BACKUP_KEY=<from the password manager> node tools/restore-backup.ts \
  --from ~/caprebate-restore/bucket --date 2026-11-07 \
  --to ~/caprebate-restore/live-restored.db --documents ~/caprebate-restore/documents
```

It writes new files only and says whether the tables are complete and the audit chain is intact. To make it the live database: `turso db create caprebate-live-restored --from-file ~/caprebate-restore/live-restored.db --group caprebate-live`, a token for it, the two `CAPREBATE_DB_*` settings changed, and **Redeploy** the current release. The documents go back into the Blob store with the same tool's folder, uploaded to the same names under `caprebate-documents/`. Delete the downloaded copies afterwards (`rm -rf ~/caprebate-restore`).

## 8. People and keys

**Who can change the live website** is everyone who can do any of these: change the Vercel team or project, push to the `live` branch or run the release workflow on GitHub, sign in to the Turso organisation, or reach the backup bucket. Today that is **Lakhbir alone**: owner of the Vercel team `ldhillonaqlios`, the GitHub repository and the Turso account. Each new person is named here and in Word question 157 before they are added.

**Add a team member:** Vercel, Team Settings, Members, Invite (Pro allows more than one member), role **Member**, not Owner, unless they must manage billing. They must turn on **two-step sign-in** on Vercel and on GitHub before they are added; GitHub, Settings, Collaborators, write access only if they release. Turso: Organisation, Members, only if they look after the database. Take each away the day they leave.

**Rotate a key:** make the new one, change it in the live project's settings, then **Redeploy** the current release (settings are read when a copy starts). Then:
- a supplier key: also cancel the old one at the supplier;
- `CAPREBATE_DB_TOKEN`: `turso db tokens invalidate caprebate-live` after the redeploy (this ends every older token);
- `CRON_SECRET`: nothing else; Vercel sends the new word from the next call;
- `CAPREBATE_BACKUP_KEY`: keep the old key in the password manager for 35 days, to open the backups made with it;
- `CAPREBATE_MFA_KEY`: **do not simply replace it**: every authenticator app secret is sealed with it. Since Phase 161n1b (ITRoadway L-12) the change has no outage, in four steps:
  1. In the live project set `CAPREBATE_MFA_KEY_OLD` to the **current** key and `CAPREBATE_MFA_KEY` to a **new** one (`openssl rand -base64 32`), both Sensitive, and **Redeploy**. From now on a secret the new key will not open is opened with the old one, and sealed again with the new one the next time that person signs in. Nobody is locked out, and new set-ups use the new key.
  2. From a computer, move every secret at once, set-ups still in progress included, all or nothing: `CAPREBATE_DB=<CAPREBATE_DB_URL> CAPREBATE_DB_TOKEN=<token> CAPREBATE_MFA_KEY_OLD=<old> CAPREBATE_MFA_KEY=<new> node src/app/cli.ts reseal-app-secrets` (in `Caprebate/09-app/backend`). One already moved by a sign-in is left as it is. If any secret opens with neither key, nothing changes and the command says how many.
  3. **Delete** `CAPREBATE_MFA_KEY_OLD` from the project and Redeploy.
  4. Keep the old key in the password manager for 35 days: a backup made before the change holds secrets sealed with it (restored, set `CAPREBATE_MFA_KEY_OLD` to it again and run step 2).
  The live start refuses a `CAPREBATE_MFA_KEY_OLD` that is not 32 bytes of base64.
- `CAPREBATE_UPLOAD_LINK_KEY`: nothing else. Changing it ends any upload link issued in the last 15 minutes; the person asks for a new one. Nothing stored depends on it.

**Security headers** (Phase 161n1d, L-01): every answer carries `Strict-Transport-Security: max-age=31536000; includeSubDomains` and `Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=()` (the video-call page allows its own camera and microphone). After a few weeks live with no problem, add `preload` to the header (`EVERY_RESPONSE_HEADERS`, src/app/server.ts) and submit `caprebate.co.uk` at hstspreload.org; it is hard to undo, so not before.

**The visitor's address (Phase 161n1b, ITRoadway L-05).** The sign-in limits count, and a signature records, the address a request came from. On Vercel this needs nothing: `api/index.mjs` sets `CAPREBATE_TRUST_PROXY=1`, and Vercel overwrites `X-Forwarded-For` with the visitor's address, so its first entry is theirs. **On any other host, never set `CAPREBATE_TRUST_PROXY`.** Set `CAPREBATE_TRUSTED_PROXIES` instead, a comma-separated list of the addresses or ranges of the proxies in front of the website (for one proxy on the same machine, `127.0.0.1`; ranges like `10.0.0.0/8` work). `X-Forwarded-For` is then read only on a request that came from a listed proxy, and the address used is the right-most one in it that is not a listed proxy, so an address the visitor typed on the left is never used. Bind Node to `127.0.0.1` so only the proxy can reach it, and have the proxy add the address it was reached from (nginx: `proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;`, or `$remote_addr` to overwrite). With the list set, `CAPREBATE_TRUST_PROXY` is ignored.

## 9. The timers

| Job | When (UTC) | What |
|---|---|---|
| `/hooks/timer/every-five-minutes` | every 5 minutes | Read email replies (at most every two minutes); clear photo, video and piece uploads never finished; clear the documents' holding place (`quarantine/`) of anything past its hour, each one written to the audit log, and the run marked not ok if it found any, because one found means an upload went wrong (Phase 161n1c, ITRoadway M-08); try again emails that could not be sent at the moment they were saved (only those safe to try again, for 24 hours). |
| `/hooks/timer/nightly` | 01:30 | The clean-up jobs (kept originals; messages and closed enquiries once the data protection officer sets their periods) and the audit chain checked end to end. |
| `/hooks/timer/backup` | 02:00 | The nightly backup (section 7). |

**Somebody is told when a timer goes wrong** (Phase 161n1d, ITRoadway M-10). Every run is written down (the `timer_runs` table), and Admin's Connections page shows each job's last run and last good run. A run that is not ok emails every address in `CAPREBATE_ALERT_EMAILS` (the Admin's and the developer's, separated by commas; the live start refuses without it), with the job's name and its counts only, at most once an hour for each job; **"audit chain: BROKEN" emails at once, every time: treat it as an incident** (tell the data protection officer, delete nothing). The five-minute job also emails, once a day, when no good backup has run for 26 hours (once the timers have run that long), and when the database passes 200 MB, the size at which the nightly backup may no longer fit Vercel's 300 seconds and its disk (the load test, section 12, has the figures).

Each call carries `Authorization: Bearer <CRON_SECRET>`; without it the answer is 401 and nothing runs. Each run writes one line to the function log starting `timer <job>:`, with counts only. To run one now: `vercel crons run /hooks/timer/nightly --scope ldhillonaqlios` in the live project's folder. The land boundary files are not kept on the live website (no `CAPREBATE_INSPIRE_STORE_DIR`): a lookup downloads its council's file each time, slower and never wrong, and nothing of HM Land Registry's is stored past the call.

## 10. Refresh the postcode table (each quarter)

The Office for National Statistics publishes the postcode file (NSPL) each quarter, free; Ordnance Survey's OSTN15 grid file is free and rarely changes. On a computer, outside the code folder:

```bash
node Caprebate/09-app/backend/tools/postcode-ingest.ts --csv NSPL_<MONTH>_<YEAR>_UK.csv \
     --names LAD_names_and_codes.csv --release <MONTH>_<YEAR> --sqlite ~/ref/postcodes.sqlite
node Caprebate/09-app/backend/tools/build-reference-db.ts --postcodes ~/ref/postcodes.sqlite \
     --ostn15 ~/ref/OSTN15_OSGM15_DataFile.txt --out ~/ref/caprebate-reference-2027q1.db
turso db create caprebate-reference-2027q1 --from-file ~/ref/caprebate-reference-2027q1.db --group caprebate-live
turso db tokens create caprebate-reference-2027q1 --read-only
```

Set `CAPREBATE_REFERENCE_DB_URL` and `CAPREBATE_REFERENCE_DB_TOKEN` to the new database, Redeploy, check a postcode on the back office, then delete the old reference database. Never put either file in the repository.

## 11. Where the code is

| What | File |
|---|---|
| The entry, both websites | `api/index.mjs` |
| The live start and its checks | `Caprebate/09-app/backend/src/app/live-website.ts` |
| The build step (tables; never a seed on live) | `Caprebate/09-app/backend/tools/prepare-lasting.mjs` |
| The settings file, both projects | `vercel.ts` |
| The release | `.github/workflows/release-live.yml` |
| The timers | `Caprebate/09-app/backend/src/app/timers.ts` |
| The backup and restore | `src/integrations/backup.ts`, `src/integrations/connectors/s3-backup.ts`, `tools/restore-backup.ts` |
| The reference database | `src/integrations/postcodes/reference-db.ts`, `tools/build-reference-db.ts` |
| The tests | `test/core/live-website.test.ts` |

The back end is grouped by business area since Phase 161k (9 November 2026): `src/core/`, `src/shared/`,
`src/integrations/` and one module per area in `src/modules/` (public site, assessment, portal, CRM, claims, survey,
finance, compliance, admin), each reached through its front door `index.ts`; the tests sit in the same folders under
`test/`. `Caprebate/09-app/backend/README.md` maps every folder in a line; this runbook and the other specs and guides
are in `Caprebate/09-app/docs/`.

## 12. The load test (Phase 161n1d, ITRoadway L-14)

`node tools/load-test.ts [--days 365] [--audit 30000]` (in `Caprebate/09-app/backend`) builds a database file in a new folder of its own, sends a year of invented enquiries through the website's own assessment pages (one a day, the clock moved on), adds a year of staff work to the audit log, then times the key staff pages as Admin (the middle of three tries) and the nightly backup to a folder, prints the figures and deletes the folder. It never touches the test website or the live one.

**Run on 17 November 2026, on the Mac (a database file, so no network):** 365 enquiries in 7.0 s; 30,000 audit rows in 2.3 s; 371 businesses, 372 leads, 372 contacts, 371 bookings, 365 emails, 30,748 audit rows; a **18.9 MB** database. Home `/staff` 244 ms, the leads list 417 ms, the clients list 81 ms, a client's page 41 ms, the audit log 196 ms, the calendar 10 ms, the claims list 4 ms (no claims: an enquiry is a lead until it is won). The nightly backup: **248 ms** for the 19 MB database.

**What it does not measure:** each SQL call on the live website is a trip from London to Turso in Ireland, and some pages make many. Once the preview website runs on its own Turso database, the developer opens Home and the leads list there and reports how long they take, and checks `turso db locations` for a London place (the pack asks, Part 6). At this rate the database reaches the 200 MB alert (section 9) after many years; the backup's limit (Vercel's 300 seconds and its disk) is far off.

