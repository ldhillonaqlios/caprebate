# Test names: the old name of each test file and its name by feature

Written by Phase 161i1 (8 November 2026); Phase 161j added the tests of the public site, the assessment, the portal,
the CRM and the claims, in `test/public-site/`, `test/assessment/`, `test/portal/`, `test/crm/` and `test/claims/`. The tests of the core, the shared parts and the outside services moved
into `test/core/`, `test/shared/` and `test/integrations/`, each named by the feature it tests rather than by the
phase that built it. Older records (the phase history, the tracker, the changelog) keep the old names: this list
turns one into the other. Phase 161k adds the other business modules' tests here the same way.

| Old name (`test/`) | New name (`test/`) | What it tests |
|---|---|---|
| `allowance-profit-comparison.test.ts` | `assessment/allowance-profit-comparison.test.ts` | with-and-without allowance and profit comparison |
| `phase159b.test.ts` | `assessment/funnel-input-checks.test.ts` | amounts, dates and extensions in funnel inputs |
| `phase158a.test.ts` | `assessment/funnel-lookup-fixes.test.ts` | planning answer reading and spend wording |
| `funnel4.test.ts` | `assessment/funnel-stages.test.ts` | the four-stage assessment funnel |
| `gated-exit.test.ts` | `assessment/gated-exit.test.ts` | the funnel's only gate and its call offer |
| `phase156f.test.ts` | `assessment/homedata-address-lookup.test.ts` | Homedata address box and daily cap |
| `phase157.test.ts` | `assessment/lost-enquiry-deletion.test.ts` | lost funnel enquiries deleted after the period |
| `phase159g.test.ts` | `assessment/who-claims.test.ts` | who claims and what registers say |
| `phase132-window.test.ts` | `claims/amendment-window-partnership.test.ts` | amendment window for company partner partnerships |
| `phase132-dates.test.ts` | `claims/claim-month-end-dates.test.ts` | months that lack the day end on the last day |
| `phase160i.test.ts` | `claims/claim-overview.test.ts` | where a claim stands, stages and sources |
| `claim-record.test.ts` | `claims/claim-record.test.ts` | claim facts, figures, sign-off and aftercare |
| `caprebate-client-doc-ingestion.test.ts` | `claims/client-doc-ingestion.test.ts` | client documents kept to the least needed |
| `phase153d.test.ts` | `claims/commercial-test-terms.test.ts` | test disposal fee, letter and defaults |
| `phase132-records.test.ts` | `claims/defence-pack-and-case-stamp.test.ts` | defence pack, case stamp and deletion log |
| `caprebate-document-pipeline.test.ts` | `claims/document-pipeline.test.ts` | the AI document reading pipeline |
| `phase146i.test.ts` | `claims/document-reader-name-checks.test.ts` | document reader follow-ons and name checks |
| `phase146e.test.ts` | `claims/document-reading-by-claude.test.ts` | client documents read by the Claude API |
| `documents.test.ts` | `claims/documents.test.ts` | claim documents, types, versions and visibility |
| `engaged.test.ts` | `claims/engaged-clients.test.ts` | engaged clients list and the business page |
| `phase157c.test.ts` | `claims/engagement-letter-signing.test.ts` | engagement letter, signature and lookup findings |
| `phase132e.test.ts` | `claims/engagement-terms-and-fees.test.ts` | engagement terms, fee discounts and view-only login |
| `phase160.test.ts` | `claims/filing-per-return.test.ts` | a filing recorded per return |
| `phase143.test.ts` | `claims/grants-screen.test.ts` | grants and contributions screen |
| `phase159h.test.ts` | `claims/legal-check-readings.test.ts` | legal check readings for every route |
| `phase146d.test.ts` | `claims/paid-lookups.test.ts` | paid lookups and signed engagement gate |
| `phase157b.test.ts` | `claims/rate-card-uplifts.test.ts` | old extra charges as a switched test default |
| `phase146h.test.ts` | `claims/register-match-review.test.ts` | ranked review list and the back-office pick |
| `phase146c.test.ts` | `claims/register-research-sources.test.ts` | where each research source comes from |
| `phase146b.test.ts` | `claims/research-connector-foundation.test.ts` | key file, one way out, connector gates |
| `phase159k.test.ts` | `claims/seller-allowance-and-long-life.test.ts` | seller statement, s.33B and long-life readings |
| `phase151b-signatory.test.ts` | `claims/signatory-check.test.ts` | who signed and whether the register agrees |
| `signing-for-testing.test.ts` | `claims/signing-for-testing.test.ts` | signing switched on for testing |
| `phase157d.test.ts` | `claims/signing-from-emailed-link.test.ts` | signing from a link and second signer |
| `phase151c.test.ts` | `claims/site-area.test.ts` | site area caller, neighbouring council and grid tool |
| `phase159j.test.ts` | `claims/stress-suite.test.ts` | engine, pack and window stress walks |
| `phase158b.test.ts` | `claims/survey-job-and-letter.test.ts` | survey job from the claim and letter wording |
| `phase158c.test.ts` | `claims/surveyor-approval-and-reports.test.ts` | surveyor approval and issued reports |
| `phase146j.test.ts` | `claims/take-back-picks.test.ts` | taking back a pick or a reading yes |
| `phase151b-documents.test.ts` | `claims/tax-documents-and-retention.test.ts` | tax documents, must-arrive list, later keep date |
| `phase146k.test.ts` | `claims/title-register-by-hand.test.ts` | title register recorded by hand |
| `phase146l.test.ts` | `claims/title-register-upload.test.ts` | uploaded official copy of the title register |
| `caprebate-upload-handler.test.ts` | `claims/upload-handler.test.ts` | the client document upload handler |
| `phase146g.test.ts` | `claims/upload-reading-steps.test.ts` | upload flow runs the reading steps |
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
| `automation.test.ts` | `crm/automation.test.ts` | automation rules and email templates |
| `phase142a.test.ts` | `crm/chat-cleanup-job.test.ts` | message clean-up job and kept files |
| `ui-tidy-claim.test.ts` | `crm/claim-page.test.ts` | claim page sections and menu |
| `ui-tidy-accounting.test.ts` | `crm/claims-list-and-accounting.test.ts` | claims list shows only readable columns |
| `phase142.test.ts` | `crm/client-chat.test.ts` | team and client chat threads |
| `phase160j.test.ts` | `crm/client-checks.test.ts` | what the client sent waits to be checked |
| `phase134.test.ts` | `crm/client-is-the-company.test.ts` | the client is the company, one timeline |
| `phase138.test.ts` | `crm/client-page-sections.test.ts` | client page coloured folding sections |
| `ui-tidy-client.test.ts` | `crm/client-page-top.test.ts` | top of a client's page and its menu |
| `ui-tidy-clients.test.ts` | `crm/clients-list.test.ts` | the Clients list top and rows |
| `conversations.test.ts` | `crm/conversations.test.ts` | email and WhatsApp as conversations |
| `crm.test.ts` | `crm/crm.test.ts` | organisations, contacts, properties and claims |
| `phase141.test.ts` | `crm/free-typed-email.test.ts` | free-typed email to a client |
| `dashboard-home.test.ts` | `crm/home-dashboard.test.ts` | Home as a dashboard and blocked time |
| `follow-on.test.ts` | `crm/introducer-source-claim-team.test.ts` | introducer, source and claim team follow-on |
| `ui-tidy-introducers.test.ts` | `crm/introducers-page.test.ts` | the introducers list and one firm |
| `introducers.test.ts` | `crm/introducers.test.ts` | introducers and the referral channel |
| `phase137.test.ts` | `crm/lead-card-sections.test.ts` | Leads as cards in four sections |
| `ui-tidy-leads.test.ts` | `crm/leads-page-top.test.ts` | top of Leads and its counts |
| `leads.test.ts` | `crm/leads.test.ts` | leads, enquiry gate and conversion to a claim |
| `dashboard.test.ts` | `crm/management-dashboard.test.ts` | the management dashboard and my work |
| `ui-tidy-pipeline.test.ts` | `crm/pipeline-table.test.ts` | the pipeline as one table |
| `pipeline.test.ts` | `crm/pipeline.test.ts` | the claim pipeline stages, gates and exits |
| `reply-reading.test.ts` | `crm/reply-reading.test.ts` | reading email replies |
| `ui-tidy-tasks.test.ts` | `crm/tasks-page.test.ts` | the Tasks page layout |
| `tasks.test.ts` | `crm/tasks.test.ts` | staff tasks, next action and activity timeline |
| `video-calls.test.ts` | `crm/video-calls.test.ts` | video calls through Zoom |
| `phase156c.test.ts` | `crm/whatsapp-upload.test.ts` | WhatsApp chat exports added to a record |
| `phase156d.test.ts` | `crm/zoom-free-plan.test.ts` | Zoom free plan with one shared host |
| `zoom-local-guard.test.ts` | `crm/zoom-local-guard.test.ts` | only the test website calls Zoom |
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
| `phase140.test.ts` | `portal/client-files.test.ts` | client file folder, staff upload and file visibility |
| `portal-booking.test.ts` | `portal/move-own-call.test.ts` | a client moves their own call |
| `phase158d.test.ts` | `portal/portal-claim-knowledge.test.ts` | portal shows what the claim knows |
| `phase161f.test.ts` | `public-site/claim-calculator-source.test.ts` | claim calculator edited as code, site uses it |
| `phase161g.test.ts` | `public-site/cookie-and-privacy-pages.test.ts` | cookie choice, cookie list and privacy policy |
| `home-page.test.ts` | `public-site/home-page.test.ts` | the public home page and assessment colours |
| `tiles-and-storage-reason.test.ts` | `public-site/home-tiles-text.test.ts` | Home tiles show whole text, memory box reason |
| `ui-tidy-home.test.ts` | `public-site/home-two-columns.test.ts` | Home in two columns |
| `phase160h.test.ts` | `public-site/legal-pages-and-cookie-banner.test.ts` | legal pages, cookie banner and footers |
| `phase160g.test.ts` | `public-site/notices-confirmed-facts.test.ts` | the notices' confirmed facts |
| `phase160f.test.ts` | `public-site/public-notices.test.ts` | public notices and complaint form |
| `stress-fixes.test.ts` | `public-site/public-page-fixes.test.ts` | unowned addresses, footer pages and tab icon |
| `phase160k.test.ts` | `public-site/sector-landing-pages.test.ts` | the five sector landing pages |
| `phase161d1.test.ts` | `public-site/site-files-inside-app.test.ts` | site files and notices read from inside the app |
| `phase133j.test.ts` | `public-site/website-and-enquiry-form.test.ts` | website served by back end, enquiry form, client login |
| `phase160l.test.ts` | `public-site/website-finishing-touches.test.ts` | retired drawing-sheet touches |
| `phase160o.test.ts` | `public-site/website-one-design.test.ts` | every website page in one design |
| `phase160m.test.ts` | `public-site/website-section-fit.test.ts` | each website section fits one window |
| `phase160n.test.ts` | `public-site/xray-home-page.test.ts` | the X-ray home page and converter |
| `phase151i.test.ts` | `shared/document-store.test.ts` | Uploaded documents on one store every copy reaches |
| `images.test.ts` | `shared/image-re-encoder.test.ts` | The image re-encoder |
