# Test names: the old name of each test file and its name by feature

Written by Phase 161i1 (8 November 2026). The tests of the core, the shared parts and the outside services moved
into `test/core/`, `test/shared/` and `test/integrations/`, each named by the feature it tests rather than by the
phase that built it. Older records (the phase history, the tracker, the changelog) keep the old names: this list
turns one into the other. Phases 161j and 161k add the business modules' tests here the same way.

| Old name (`test/`) | New name (`test/`) | What it tests |
|---|---|---|
| `auth.test.ts` | `core/auth.test.ts` | Sign-in, sessions, sign-out, password change and reset |
| `phase160a.test.ts` | `core/back-office-layout.test.ts` | The back office layout |
| `phase161h1.test.ts` | `core/boundary-check.test.ts` | The module map and the boundary check |
| `phase160c.test.ts` | `core/branding-and-dashes.test.ts` | Branding in the back office and the portal; no long dashes on screen |
| `ui-tidy-calendar.test.ts` | `core/calendar.test.ts` | The calendar page |
| `db-reconnect.test.ts` | `core/database-reconnect.test.ts` | A dropped database connection is opened again |
| `faster-clicks.test.ts` | `core/faster-clicks.test.ts` | Reads remembered within one click |
| `phase161b.test.ts` | `core/form-tokens.test.ts` | A security token on every form that changes something |
| `phase161i.test.ts` | `core/front-doors.test.ts` | Core, shared parts and outside services behind front doors; the CSS file |
| `phase133a.test.ts` | `core/header-and-navigation.test.ts` | The header and the navigation |
| `invented-logins.test.ts` | `core/invented-logins.test.ts` | The test website's invented logins and the second step |
| `ui-tidy-menu.test.ts` | `core/left-hand-menu.test.ts` | The left-hand menu |
| `phase161h.test.ts` | `core/live-website.test.ts` | The live website: start, keys, timers, backup and restore |
| `ui-tidy-look.test.ts` | `core/look.test.ts` | The shared look |
| `phase135.test.ts` | `core/menus.test.ts` | The menus |
| `multipart.test.ts` | `core/multipart.test.ts` | The upload form reader |
| `authz.test.ts` | `core/permissions.test.ts` | What each role may do (the permission table) |
| `phase160b.test.ts` | `core/portal-layout.test.ts` | The client portal in the back office's layout |
| `phase151m.test.ts` | `core/recovery-codes.test.ts` | Recovery codes |
| `phase133d.test.ts` | `core/required-fields.test.ts` | Required fields marked in words, refused forms keep what was typed |
| `seed.test.ts` | `core/seed.test.ts` | The example data, the name exclusion register and the two gates |
| `phase151k.test.ts` | `core/sign-in-hardening.test.ts` | The sign-in steps through the JSON API, the sealed app secret |
| `phase151j.test.ts` | `core/sign-in-steps.test.ts` | Forgot password, temporary passwords and the second step |
| `phase152.test.ts` | `core/sign-up-link.test.ts` | The sign-up confirmation link leaves the outbox once sent |
| `phase161c.test.ts` | `core/status-page-and-key-file.test.ts` | The status page and the locked key file |
| `phase151e.test.ts` | `core/test-website-start.test.ts` | The test website starts on its lasting database |
| `phase150.test.ts` | `integrations/boundary-fetcher.test.ts` | The land boundary fetcher, switched off |
| `phase151l.test.ts` | `integrations/boundary-first-download.test.ts` | The land boundary's first download as a test lookup |
| `caprebate-boundary-import-inspire.test.ts` | `integrations/boundary-import-inspire.test.ts` | The land boundary import from INSPIRE files |
| `caprebate-boundary-import.test.ts` | `integrations/boundary-import.test.ts` | The land boundary import |
| `phase156a.test.ts` | `integrations/contact-form-keys.test.ts` | The contact form's security check keys on the test website |
| `email-sending.test.ts` | `integrations/email-sending.test.ts` | Email sending switched on for testing |
| `caprebate-name-exclusion.test.ts` | `integrations/name-exclusion.test.ts` | The name exclusion register |
| `caprebate-postcode-authority.test.ts` | `integrations/postcode-authority.test.ts` | Postcode to council |
| `caprebate-postcode-store.test.ts` | `integrations/postcode-store.test.ts` | The postcode store |
| `caprebate-region.test.ts` | `integrations/region.test.ts` | The region of a postcode |
| `send-local-guard.test.ts` | `integrations/send-local-guard.test.ts` | Only the test website sends WhatsApp messages and emails |
| `smtp-starttls.test.ts` | `integrations/smtp-starttls.test.ts` | Port 587 speaks plain first |
| `caprebate-source-register.test.ts` | `integrations/source-register.test.ts` | The source register |
| `phase151g.test.ts` | `integrations/test-lookups.test.ts` | The test lookups and their five conditions |
| `turnstile.test.ts` | `integrations/turnstile.test.ts` | The contact form's security check, on the server |
| `phase151i.test.ts` | `shared/document-store.test.ts` | Uploaded documents on one store every copy reaches |
| `images.test.ts` | `shared/image-re-encoder.test.ts` | The image re-encoder |
