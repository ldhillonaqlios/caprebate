# Cap Rebate — the platform (private test repository)

The public website, the free assessment, the client portal and the back office are one Node application
(`Caprebate/09-app/backend`), with the estimate engine in `Caprebate/09-app/engine`. There is no WordPress
(decided 18 September 2026).

## THIS REPOSITORY IS FOR TESTING WITH INVENTED DATA ONLY

- No real client, no real document, no real personal data — ever. GitHub and Codespaces are not our production
  host and are not in our privacy notice or processor list.
- No live API keys (Companies House, EPC, CQC, Homedata, Land Registry, the document model). They belong only on
  the production UK server.
- Governance documents, board exports and backups are deliberately not in this repository (see `.gitignore`,
  which is an allow-list).

## Try it in a Codespace

Code → Codespaces → Create codespace on main. It installs, starts the demo and opens a preview on port 8105.
The demo builds a throwaway in-memory database with invented users and clients; nothing is kept when it stops.
Demo logins: `admin@example.invalid`, `sales@example.invalid`, `accounting@example.invalid`,
`surveying@example.invalid`, `client@example.invalid` — password `change-this-seed-password`.
Keep the forwarded port **Private** (the default).

## Run the checks

    cd Caprebate/09-app/backend && npm run check          # the back end
    node Caprebate/03-app/caprebate-regression.cjs         # the site harness
    cd Caprebate/04-phase-work/phase3 && node --test       # phase3 modules
    cd Caprebate/04-phase-work/phase9 && node --test       # phase9 modules

Needs Node 24 or later.
