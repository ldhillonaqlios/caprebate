-- PHASE 151k, 28 September 2026 — A SENT SIGN-IN CODE OR RESET LINK IS NOT KEPT IN THE OUTBOX.
--
-- Migration 036 made what an email said never editable (outbox_content_never_edited). That stays true for every
-- column and every email, with ONE exception: once an email of kind SIGN_IN_CODE or PASSWORD_RESET has been SENT, its
-- body may be replaced by the one fixed sentence below, and by nothing else (src/stubs/email-provider.ts,
-- SENT_SECRET_BODY and blankSentSecrets). Who it went to, when, the subject and the kind stay as they were.
-- An unsent email of those kinds is not touched: while sending is off it is the only copy.

DROP TRIGGER outbox_content_never_edited;

CREATE TRIGGER outbox_content_never_edited BEFORE UPDATE OF
  id, created_at, to_email, subject, kind, business_id, from_header, reply_to, claim_id, lead_id, contact_id,
  written_by, send_requested ON outbox
BEGIN SELECT RAISE(ABORT, 'what an email said, and who it went to, is never edited'); END;

CREATE TRIGGER outbox_body_never_edited BEFORE UPDATE OF body ON outbox
WHEN NOT (
  OLD.sent_at IS NOT NULL
  AND OLD.kind IN ('SIGN_IN_CODE', 'PASSWORD_RESET')
  AND NEW.body = 'This email held a sign-in code or a password reset link. It was sent, and then its words were removed so the code or link is not kept.'
)
BEGIN SELECT RAISE(ABORT, 'what an email said, and who it went to, is never edited'); END;
