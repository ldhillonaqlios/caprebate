-- PHASE 152 (the sweep), 28 September 2026 — A SENT SIGN-UP CONFIRMATION LINK IS NOT KEPT IN THE OUTBOX EITHER.
--
-- Migration 058 let exactly one edit through the outbox's never-edited rule: once an email of kind SIGN_IN_CODE or
-- PASSWORD_RESET has been SENT, its body may be replaced by one fixed sentence. The email that confirms a new client
-- login (kind ACCOUNT_VERIFY, src/web/signup.ts) carries a link that works once and for 24 hours - the same sort of
-- secret - and was not one of the two kinds asked for. It is now the third. The sentence changes to name all three
-- (src/stubs/email-provider.ts, SENT_SECRET_BODY). A row 058 already blanked keeps 058's sentence and, like every other
-- body, is never edited again. An unsent email of these kinds is not touched: while sending is off it is the only copy.

DROP TRIGGER outbox_body_never_edited;

CREATE TRIGGER outbox_body_never_edited BEFORE UPDATE OF body ON outbox
WHEN NOT (
  OLD.sent_at IS NOT NULL
  AND OLD.kind IN ('SIGN_IN_CODE', 'PASSWORD_RESET', 'ACCOUNT_VERIFY')
  AND NEW.body = 'This email held a sign-in code or a one-use link. It was sent, and then its words were removed so the code or link is not kept.'
)
BEGIN SELECT RAISE(ABORT, 'what an email said, and who it went to, is never edited'); END;
