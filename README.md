# Cap Rebate — the platform (the test repository: public while ITRoadway review the code, private once they have signed it off)

The public website, the free assessment, the client portal and the back office are one Node application
(`Caprebate/09-app/backend`), with the estimate engine in `Caprebate/09-app/engine`. There is no WordPress
(decided 18 September 2026).

**The claim calculator: change the calculator in engine/src; the page is built from it** (since Phase 161f,
5 November 2026). Edit `Caprebate/09-app/engine/src/calculator/`, then run `npm run page` in
`Caprebate/09-app/engine`, which writes it into `Caprebate site.html` and the back end's copy. Never edit the
calculator inside `Caprebate site.html`: the checks fail on it. `Caprebate/09-app/engine/README.md` says more.

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
It prints its invented logins in its terminal when it starts. Every staff login sets up its second step (an
authenticator app) at its first sign-in. Keep the forwarded port **Private** (the default).

What to try (since 18 September 2026):

- `/` is the home page (`Caprebate/09-app/site/home.html`, since 29 September 2026; `Caprebate site.html` without it). Since 28 October 2026 (Phase 160n) it is the X-ray design: a clinic whose walls turn see-through on a twelve-second scan. Since Phase 160o the five sector pages (`/capital-allowances/<sector>/`) are in the same design.
  **Log in** (top bar) goes to the sign-in page; a signed-in person goes straight to their home. **Am I eligible?** goes to
  the real assessment, in the home page's colours.
- **Send my enquiry** (Contact us, above the questions) sends an enquiry. Sign in with the demo's sales login, open
  **Leads**, then **Website enquiries**, and open it as a lead or close it.
- Finish the assessment signed out: the thank-you page offers **Create my login**. No email is really sent. Sign in
  with the demo's Admin login and open **/staff/dev-outbox** ("Emails saved, not sent"): the "Confirm your Cap Rebate
  login" message is there, with its link. Open the link and press the button, then log in with the address and password
  you chose. Use an invented address. The terminal says only that an email of that kind was queued, never the email
  (Phase 161n1a: a code or a link in a shared terminal is one anybody can use).

## Or on Vercel

Every push to `main` deploys the test website to **https://caprebate-test.vercel.app** (Vercel project
`caprebate-test`, set up 18 September 2026). `api/index.mjs` starts it, and `vercel.json` sends every path to it.

- **Each tester has a login of their own** (since Phase 161n1a, 16 November 2026). The invented logins cannot sign in
  there. Lakhbir's Admin login was made once with `node src/app/cli.ts first-admin` (in `Caprebate/09-app/backend`);
  he makes one login per tester in **Admin > Users**, and each sets up an authenticator app at the first sign-in.
- **Invented data only, always.** The test website sends no email and calls no outside service that reaches a real
  person (no identity checks, WhatsApp, Zoom or paid lookups): its keys are listed in `TEST_DEPLOY_KEYS`, and only
  those are read. Every email it would send is on Admin's **/staff/dev-outbox** page, never in the project's logs.
- **The address is public**: Vercel Authentication does not cover the main address on the free plan.
- The `package.json` files marked `"type"` in `phase3`, `phase9` and `engine/src` (and `"commonjs"` in
  `engine/src/calculator`) are there because Vercel compiles typeless TypeScript as CommonJS. Keep them.

## Run the checks

    cd Caprebate/09-app/backend && npm run check          # the back end
    node Caprebate/03-app/caprebate-regression.cjs         # the site harness
    cd Caprebate/04-phase-work/phase3 && node --test       # phase3 modules
    cd Caprebate/04-phase-work/phase9 && node --test       # phase9 modules
    node Caprebate/09-app/engine/tools/verify-page.cjs     # the page carries exactly the built calculator

Needs Node 24 or later.
