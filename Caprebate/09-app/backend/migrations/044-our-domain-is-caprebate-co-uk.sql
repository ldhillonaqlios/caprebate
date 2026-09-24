-- ===========================================================================
-- 044 — OUR DOMAIN IS caprebate.co.uk, AND OUR EMAIL COMES FROM contact@caprebate.co.uk.
--                                                            Phase 151, 24 September 2026
--
-- Lakhbir, Word answers 3, 13, 186 and 211 (closed 24 September 2026): the business is on caprebate.co.uk, not
-- caprebate.com, and three mailboxes exist on IONOS — contact@ (general, the sending address, the thank-you screens,
-- complaints), data.protection@ (the data protection officer) and security@ (breach reports).
--
-- Migration 036 wrote the first sender as contactus@caprebate.com. It is left exactly as it was: an applied migration
-- is history. Who emails come from is never edited — a change is a new row (036's triggers) — so this adds the row
-- that says what is true from today, dated today, set by nobody (a migration, as 036's first row was).
-- ===========================================================================

INSERT INTO email_sender (id, display_name, address, reply_to, set_by, set_at)
VALUES ('sender-phase151', 'Cap Rebate', 'contact@caprebate.co.uk', 'contact@caprebate.co.uk', NULL, '2026-09-24T00:00:00.000Z');
