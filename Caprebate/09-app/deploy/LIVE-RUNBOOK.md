# The live website on Vercel: the runbook

_Phase 161h, 7 November 2026. For the developer (ITRoadway) and anyone who looks after the live website. Lakhbir decided on 6 November 2026 to host it on Vercel, for security: nobody runs a server, every change is built from GitHub, and a bad release is rolled back in one click._

The go-live checklist, the list of what must be true before the first client, is [GO-LIVE-CHECKLIST.md](GO-LIVE-CHECKLIST.md). Phase 161n works through it.

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

**How one repository makes two websites.** Both projects run `api/index.mjs`. With `CAPREBATE_PRODUCTION=1` in a project's settings, it starts the live website (`Caprebate/09-app/backend/src/core/live-website.ts`): no invented people, no demo logins, no test letter or signing, no notices test banner, every staff login with a second step, form tokens on, and never a database in memory. Without it, the test website, as before. `vercel.ts` (the settings file at the top of the repository) is worked out by each project when it builds, and adds the timers only where `CAPREBATE_PRODUCTION=1`.

## 2. Set up the live project (once)

You need a Vercel login in the `ldhillonaqlios` team with two-step sign-in on (section 8), and the Turso and Vercel command-line tools.

1. **Buy Pro** for the team (Lakhbir's decision and card: board item "Buy Vercel Pro").
2. **New project** from GitHub `ldhillonaqlios/caprebate`. Framework: **Other**. Root directory: the top of the repository. Node: **24.x**. Leave the build and install commands empty: `vercel.ts` gives them.
3. **Settings, Git: Production Branch = `live`.** A merge to `main` then never changes the live website. Previews of other branches still build, with the Preview settings (step 6).
4. **Settings, Functions: Function Region = London (`lhr1`).** A region written in `vercel.ts` was not followed when we tried it (7 Nov 2026); the project's own setting is.
5. **Storage: create a Blob store**, private, region London, and **connect it to this project only** (Production and Preview). Vercel adds `BLOB_STORE_ID` itself.
6. **The keys** (section 3), in Production. In **Preview** put example values and a **separate preview database** (its own Turso database, empty), so a preview never touches live records.
7. **Settings, Deployment Protection:** keep Vercel Authentication on for previews.
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

**The rest** (email, Companies House, Didit, Homedata and so on): a missing one leaves that service "not set up", which the Connections page shows, as on the test website. Add `CAPREBATE_REFERENCE_DB_URL` and `CAPREBATE_REFERENCE_DB_TOKEN` (section 10), and the four `BACKUP_S3_*` settings (section 7). **`CAPREBATE_LEGAL_PAGES=on` only once every legal page is approved** (board item "Legal pages approved").

**Never in the live project** (the start stops if one is there): `CAPREBATE_TEST_PASSWORD`, `CAPREBATE_ALLOW_SEED`, `CAPREBATE_SIGNING_TEST`, `CAPREBATE_COST_MODEL_TEST`, `CAPREBATE_LIVE_SMOKE`, `CAPREBATE_LOCAL_EMAIL`, `CAPREBATE_LOCAL_WHATSAPP`, `CAPREBATE_LOCAL_ZOOM`, `CAPREBATE_LOOKUPS_HERE`, `CAPREBATE_TEST_LOOKUP_LOG`.

## 4. The live database (once)

```bash
turso db locations                      # is London (aws-eu-west-2) listed? If yes, use it; if not, aws-eu-west-1 (Ireland)
turso group create caprebate-live --location aws-eu-west-1
turso db create caprebate-live --group caprebate-live
turso db show caprebate-live --url      # -> CAPREBATE_DB_URL
turso db tokens create caprebate-live   # -> CAPREBATE_DB_TOKEN
```

Make a second one the same way for **Preview** (`caprebate-live-preview`). Leave both empty: the first release's build step makes the tables. The build **never** adds the test website's invented people, and the live website refuses a database that has them.

## 5. Release (deploy and promote)

1. Merge the pull request into `main` as usual. The test website updates; **the live website does not**.
2. GitHub, **Actions, "Release to the live website", Run workflow.** Leave the commit blank for `main` as it stands, or give one. It checks the commit is on `main` and that "A fresh copy passes every check" passed on it, then moves the `live` branch to it.
3. Vercel builds it. The build log says `build (live website): the live database's tables are up to date`. **If the build step fails, the release fails** and the website stays on the release before.
4. Check: `https://caprebate.co.uk/api/health` answers `{"ok":true}`; the function log's first lines say `live website: started` and which keys were read (names only).

## 6. Roll back

Vercel, the live project, **Deployments**: open the release before, **Instant Rollback**. It is back in seconds. Then fix the fault on `main` and release again (section 5). The release workflow refuses to move `live` backwards, so a rollback is always Vercel's button, never a branch push.

Table changes (migrations) are not undone by a rollback. Every migration only adds (a new table or column), so the release before still runs on the newer tables. Keep it that way: a migration that removes or renames something needs its own plan, written before it is released.

## 7. Backups, and restoring one

**Every night at 02:00 UTC** the `backup` timer copies, to the bucket: the whole database as one file (`database/<date>.db.cbbk`), and every document that is new or changed (`documents/...`). Each file is locked with `CAPREBATE_BACKUP_KEY` (AES-256-GCM) before it leaves. Uploads still in the **holding place** (`quarantine/`) and locked photos waiting (`survey-incoming/`) are **left out**, on purpose (Word question 155). The reference database is not backed up: it is rebuilt from free downloads. The function log says what was copied, in counts.

**Set up the bucket (once):** an S3 bucket in `eu-west-2`, Block Public Access on, default encryption on; a **lifecycle rule** that deletes `database/` files 35 days after they are made; a user whose only permission is `s3:PutObject`, `s3:GetObject` and `s3:DeleteObject` on that bucket. Put its four details in `BACKUP_S3_BUCKET`, `BACKUP_S3_REGION`, `BACKUP_S3_ACCESS_KEY_ID` and `BACKUP_S3_SECRET_ACCESS_KEY`. Until they are set, the backup says `not run: there is nowhere to copy it to`. A document deleted from the website leaves the backup 35 days later.

Turso also keeps its own point-in-time copies (24 hours on its free plan, 10 to 90 days on paid plans). That is a second line, not the backup.

**Restore (tried on a copy on 7 Nov 2026 by test/phase161h.test.ts; try it again on a copy each quarter):**

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
- `CAPREBATE_MFA_KEY`: **do not simply replace it**: every authenticator app secret is sealed with it, and a new key alone locks everyone out of their app. First move them, from a computer, all or nothing: `CAPREBATE_DB=<CAPREBATE_DB_URL> CAPREBATE_DB_TOKEN=<token> CAPREBATE_MFA_KEY_OLD=<old> CAPREBATE_MFA_KEY=<new> node src/core/cli.ts reseal-app-secrets` (in `Caprebate/09-app/backend`). Then set the new key in the project and Redeploy at once: between the two steps the website cannot check app codes, so do both within a few minutes, out of hours.

## 9. The timers

| Job | When (UTC) | What |
|---|---|---|
| `/hooks/timer/every-five-minutes` | every 5 minutes | Read email replies (at most every two minutes); clear photo, video and piece uploads never finished; try again emails that could not be sent at the moment they were saved (only those safe to try again, for 24 hours). |
| `/hooks/timer/nightly` | 01:30 | The clean-up jobs (kept originals; messages and closed enquiries once the data protection officer sets their periods) and the audit chain checked end to end. |
| `/hooks/timer/backup` | 02:00 | The nightly backup (section 7). |

Each call carries `Authorization: Bearer <CRON_SECRET>`; without it the answer is 401 and nothing runs. Each run writes one line to the function log starting `timer <job>:`, with counts only. To run one now: `vercel crons run /hooks/timer/nightly --scope ldhillonaqlios` in the live project's folder. The land boundary files are not kept on the live website (no `CAPREBATE_INSPIRE_STORE_DIR`): a lookup downloads its council's file each time, slower and never wrong, and nothing of HM Land Registry's is stored past the call.

## 10. Refresh the postcode table (each quarter)

The Office for National Statistics publishes the postcode file (NSPL) each quarter, free; Ordnance Survey's OSTN15 grid file is free and rarely changes. On a computer, outside the code folder:

```bash
node Caprebate/04-phase-work/phase9/caprebate-postcode-authority-ingest.ts --csv NSPL_<MONTH>_<YEAR>_UK.csv \
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
| The live start and its checks | `Caprebate/09-app/backend/src/core/live-website.ts` |
| The build step (tables; never a seed on live) | `Caprebate/09-app/backend/tools/prepare-lasting.mjs` |
| The settings file, both projects | `vercel.ts` |
| The release | `.github/workflows/release-live.yml` |
| The timers | `Caprebate/09-app/backend/src/core/timers.ts` |
| The backup and restore | `src/core/backup.ts`, `src/integrations/connectors/s3-backup.ts`, `tools/restore-backup.ts` |
| The reference database | `src/integrations/postcodes/reference-db.ts`, `tools/build-reference-db.ts` |
| The tests | `test/phase161h.test.ts` |
