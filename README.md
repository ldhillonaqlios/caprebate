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

Code → Codespaces → Create codespace on main. It installs everything and starts the demo in the terminal (leave that terminal open), then opens a preview on port 8105.
The demo builds a throwaway in-memory database with invented users and clients; nothing is kept when it stops.
Demo logins: `admin@example.invalid`, `sales@example.invalid`, `accounting@example.invalid`,
`surveying@example.invalid`, `client@example.invalid` — password `change-this-seed-password`.
Keep the forwarded port **Private** (the default).

What to try (since 18 September 2026):

- `/` is the home page (`Caprebate/09-app/site/home.html`, since 29 September 2026; `Caprebate site.html` without it).
  **Log in** (top bar) goes to the sign-in page; a signed-in person goes straight to their home. **Am I eligible?** goes to
  the real assessment, in the home page's colours.
- **Send my enquiry** (Contact us, above the questions) sends an enquiry. Sign in as `sales@example.invalid`, open
  **Leads**, then **Website enquiries**, and open it as a lead or close it.
- Finish the assessment signed out: the thank-you page offers **Create my login**. No email is really sent; the
  "Confirm your Cap Rebate login" message, with its link, is printed in the demo's terminal. Open the link and press
  the button, then log in with the address and password you chose. Use an invented address.

## Or on Vercel

Every push to `main` deploys the same demo to **https://caprebate-test.vercel.app** (Vercel project
`caprebate-test`, set up 18 September 2026). `api/index.mjs` builds the seeded in-memory demo once per instance,
and `vercel.json` sends every path to it. The same invented logins and password apply.

- **The address is public** on the free Hobby plan: Vercel Authentication does not cover the main address.
  Invented data only, always.
- **Nothing is kept.** A new instance starts again from the seed, and a login may need repeating.
- The sign-up's confirmation link is in the project's **Logs**, because no email is sent.
- The `package.json` files marked `"type"` in `phase3`, `phase9` and `engine/src` (and `"commonjs"` in
  `engine/src/generated`) are there because Vercel compiles typeless TypeScript as CommonJS. Keep them.

## Run the checks

    cd Caprebate/09-app/backend && npm run check          # the back end
    node Caprebate/03-app/caprebate-regression.cjs         # the site harness
    cd Caprebate/04-phase-work/phase3 && node --test       # phase3 modules
    cd Caprebate/04-phase-work/phase9 && node --test       # phase9 modules

Needs Node 24 or later.
