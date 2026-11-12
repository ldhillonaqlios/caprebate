-- ===========================================================================
-- 123 — AN EMAIL CAN CARRY ITS BRANDED HTML VERSION      Phase 161m2, 11 November 2026
--
-- The branded emails (src/integrations/email/email-layout.ts, the design in 05-reports-and-templates/emails/build.py)
-- go out as two versions of the same words: the plain text every email has always had (`body`) and the branded HTML
-- (`html_body`), sent together as multipart/alternative (src/integrations/email/email-provider.ts, buildMessage).
-- A row without HTML (every row before this phase, and every email not yet converted) is sent exactly as before.
-- Screens that list the outbox keep showing `body`.
--
--   html_body   the HTML version, written with the row. NULL: a plain-text email.
--
-- Like every word of an email it is never edited, with the same ONE exception as `body` (migrations 058, 060, 073):
-- once an email of the four kinds that hold a sign-in code or a one-use link has been SENT, its HTML is removed
-- (set to NULL) in the same statement that replaces its body (blankSentSecrets), so the code or link is not kept.
-- ===========================================================================

ALTER TABLE outbox ADD COLUMN html_body TEXT;

CREATE TRIGGER outbox_html_never_edited BEFORE UPDATE OF html_body ON outbox
WHEN NOT (
  OLD.sent_at IS NOT NULL
  AND OLD.kind IN ('SIGN_IN_CODE', 'PASSWORD_RESET', 'ACCOUNT_VERIFY', 'REPORT_FOR_SIGNOFF')
  AND NEW.html_body IS NULL
)
BEGIN SELECT RAISE(ABORT, 'what an email said, and who it went to, is never edited'); END;
