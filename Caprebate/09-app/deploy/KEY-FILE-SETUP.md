# The key file on the live server

_Phase 161c, 4 November 2026. For the developer who sets up the live server. It answers the ITRoadway technical audit (2 November 2026), section 4, rows 2 and 4._

The app reads every supplier key (email, Companies House, Homedata and the rest) from one file. On the Mac and the test website nothing changes. On the live server, systemd hands the file to the app, and the app will not start if the file is open to anyone else.

**The live website is on Vercel, not a server (Lakhbir, 6 November 2026, for security).** Its keys are the live Vercel project's encrypted settings, read by `src/core/live-website.ts`; there is no key file and no systemd. How they are set, and every other step, is in [LIVE-RUNBOOK.md](LIVE-RUNBOOK.md) (Phase 161h, 7 November 2026). This page stays for a server, should one ever be used: the code it describes is kept, unused.

## What the app does

1. **It reads systemd's copy first.** When systemd's `LoadCredential=` has put a file called `caprebate-secrets` in the folder named by `CREDENTIALS_DIRECTORY`, that file is the key file. Otherwise the app reads the file named by `CAPREBATE_SECRETS`, then `~/.caprebate-secrets.env`, as before (`src/core/secrets.ts`, `secretsPath`).
2. **The live setting is `CAPREBATE_PRODUCTION=1`.** Only the live server's unit file sets it. With it set, a key file read from anywhere but systemd's folder **stops the start** if anyone but the app's own user could read or change it (any mode wider than `600`), or if another user owns it. The message names the file and says what is wrong. It never shows a key. The server (`npm start`) and every command (`node src/core/cli.ts ...`) run the same check (`keyFileStartCheck`).
3. **Without `CAPREBATE_PRODUCTION=1`, the same fault is a warning**, and the app starts.
4. **systemd's own copy is not judged.** systemd keeps it in a folder only this service can open, in memory. It often grants the read with an access list on a file root owns, so the mode and owner look wrong even though nobody else can open it. The file systemd copies it from is what you lock down (step 2 below).
5. **The status page says only "OK".** `GET /api/health` answers `{"ok":true}` when the database answers, and `503 {"ok":false}` when it does not. Point the uptime check at it. The list of what is built and switched off is at `/staff/connections/switches.json`, for Admin only, and linked from the Connections page.

## Set-up steps

Run these as root on the server. The app's own user is `caprebate` here; use whatever the unit file names.

1. **Make the app's user**, if the deploy kit has not:

   ```bash
   useradd --system --home /srv/caprebate --shell /usr/sbin/nologin caprebate
   ```

2. **Put the key file where only root can read it.** Copy `09-app/backend/secrets.example.env` (names only, never values), fill in the keys, and lock it down:

   ```bash
   install -d -m 700 -o root -g root /etc/caprebate
   install -m 600 -o root -g root secrets.env /etc/caprebate/caprebate-secrets
   shred -u secrets.env
   ```

   Never put it inside the code folder: the app refuses a key file there.

3. **Hand it to the app in the unit file** (`/etc/systemd/system/caprebate.service`). These lines matter here; the 161h kit adds the rest (the proxy, the database and documents paths, the hardening):

   ```ini
   [Service]
   User=caprebate
   Group=caprebate
   WorkingDirectory=/srv/caprebate/Caprebate/09-app/backend
   Environment=CAPREBATE_PRODUCTION=1
   LoadCredential=caprebate-secrets:/etc/caprebate/caprebate-secrets
   ExecStart=/usr/bin/node src/core/server.ts
   ```

   Do not also set `CAPREBATE_SECRETS`: systemd's copy wins whenever it is there, and a second path is only confusing. Every timer that runs `node src/core/cli.ts ...` needs the same `User=`, `Environment=CAPREBATE_PRODUCTION=1` and `LoadCredential=` lines.

4. **Start it and read the log:**

   ```bash
   systemctl daemon-reload
   systemctl restart caprebate
   journalctl -u caprebate -n 20
   ```

   A good start says `caprebate back end on ...`. A start that says `NOT STARTED: the key file ...` names the file and what is wrong. Fix what it says and start again.

5. **Check the status page** from the server and from outside:

   ```bash
   curl -s https://caprebate.co.uk/api/health
   ```

   It must print exactly `{"ok":true}`.

## Changing a key

1. Edit `/etc/caprebate/caprebate-secrets` as root. Keep it `600` and owned by root.
2. `systemctl restart caprebate`. systemd copies the file again at each start; the app reads keys once, at start.

Admin can also save a new value for a key on Home's Admin tab, sealed in the database. That value wins over the key file until Admin goes back to the file's value.

## Proof

`09-app/backend/test/phase161c.test.ts` checks each rule above: the status page's exact answer, the 503, the switch list for Admin only, systemd's folder read first, a 644 file stopping a live start (on the function and on a real start of `src/core/server.ts`) and only warning elsewhere, another owner, and no key printed.
