-- ===========================================================================
-- 073 — THE SURVEY REPORT'S SIGN-OFF: THE LINK SENT TO THE CLIENT'S ACCOUNTANT, THEIR ANSWER, ITS RECORD ON THE CLAIM,
-- AND THE CLIENT TOLD
-- 2 October 2026. src/web/report-signoff.ts.
--
-- Lakhbir, 2 Oct 2026: the adviser signs off first, then the client gets the report ("Adviser, then client"); our own
-- adviser's sign-off is recorded by staff as today; the client's accountant gets the report by email with a private
-- sign-off link ("Email + private sign-off link").
--
--   pack_signoff_requests   one email to the client's accountant: which approved version, which contact, how the
--                             client gave their permission, who sent it and when, and the link's SHA-256 (never the link
--                             itself). The link works for 30 days and is answered once.
--   pack_signoff_answers    the accountant's answer, once: signed (their name, firm and title) or sent back (why).
--   pack_signoff_recorded   a signed answer recorded on the claim as the tax adviser's sign-off (tax_adviser_signoffs),
--                             by a member of staff — once.
--   pack_client_notices     the client told, by a portal message, that a version is in their portal — once a version.
-- None is ever edited or deleted.
-- ===========================================================================

CREATE TABLE pack_signoff_requests (
  id               TEXT PRIMARY KEY,
  approval_id      TEXT NOT NULL REFERENCES survey_pack_approvals(id),
  contact_id       TEXT NOT NULL REFERENCES contacts(id),
  to_email         TEXT NOT NULL CHECK (length(to_email) BETWEEN 3 AND 320),
  token_sha256     TEXT NOT NULL UNIQUE CHECK (length(token_sha256) = 64 AND token_sha256 NOT GLOB '*[^0-9a-f]*'),
  permission_note  TEXT NOT NULL CHECK (length(trim(permission_note)) BETWEEN 1 AND 500),
  outbox_id        TEXT NOT NULL REFERENCES outbox(id),
  sent_by          TEXT NOT NULL REFERENCES users(id),
  sent_at          TEXT NOT NULL,
  expires_at       TEXT NOT NULL CHECK (expires_at > sent_at)
) STRICT;
CREATE INDEX pack_signoff_requests_by_approval ON pack_signoff_requests (approval_id, sent_at);

CREATE TABLE pack_signoff_answers (
  id                 TEXT PRIMARY KEY,
  request_id         TEXT NOT NULL UNIQUE REFERENCES pack_signoff_requests(id),
  outcome            TEXT NOT NULL CHECK (outcome IN ('SIGNED', 'SENT_BACK')),
  signer_name        TEXT NOT NULL CHECK (length(trim(signer_name)) BETWEEN 2 AND 200),
  signer_firm        TEXT CHECK (signer_firm IS NULL OR length(trim(signer_firm)) BETWEEN 2 AND 300),
  signer_credential  TEXT CHECK (signer_credential IS NULL OR length(trim(signer_credential)) BETWEEN 2 AND 300),
  reason             TEXT CHECK (reason IS NULL OR length(trim(reason)) BETWEEN 1 AND 2000),
  answered_at        TEXT NOT NULL,
  CHECK (outcome <> 'SIGNED' OR (signer_firm IS NOT NULL AND signer_credential IS NOT NULL)),
  CHECK (outcome <> 'SENT_BACK' OR reason IS NOT NULL)
) STRICT;

CREATE TABLE pack_signoff_recorded (
  answer_id    TEXT PRIMARY KEY REFERENCES pack_signoff_answers(id),
  signoff_id   TEXT NOT NULL UNIQUE REFERENCES tax_adviser_signoffs(id),
  recorded_by  TEXT NOT NULL REFERENCES users(id),
  recorded_at  TEXT NOT NULL
) STRICT;

CREATE TABLE pack_client_notices (
  approval_id  TEXT PRIMARY KEY REFERENCES survey_pack_approvals(id),
  message_id   TEXT NOT NULL REFERENCES client_messages(id),
  told_by      TEXT NOT NULL REFERENCES users(id),
  told_at      TEXT NOT NULL
) STRICT;

CREATE TRIGGER pack_signoff_requests_never_edited BEFORE UPDATE ON pack_signoff_requests
BEGIN SELECT RAISE(ABORT, 'a sign-off request is never edited: send a new one'); END;
CREATE TRIGGER pack_signoff_requests_never_deleted BEFORE DELETE ON pack_signoff_requests
BEGIN SELECT RAISE(ABORT, 'a sign-off request is never deleted'); END;
CREATE TRIGGER pack_signoff_answers_never_edited BEFORE UPDATE ON pack_signoff_answers
BEGIN SELECT RAISE(ABORT, 'an answer is never edited'); END;
CREATE TRIGGER pack_signoff_answers_never_deleted BEFORE DELETE ON pack_signoff_answers
BEGIN SELECT RAISE(ABORT, 'an answer is never deleted'); END;
CREATE TRIGGER pack_signoff_recorded_never_edited BEFORE UPDATE ON pack_signoff_recorded
BEGIN SELECT RAISE(ABORT, 'a recorded sign-off is never edited'); END;
CREATE TRIGGER pack_signoff_recorded_never_deleted BEFORE DELETE ON pack_signoff_recorded
BEGIN SELECT RAISE(ABORT, 'a recorded sign-off is never deleted'); END;
CREATE TRIGGER pack_client_notices_never_edited BEFORE UPDATE ON pack_client_notices
BEGIN SELECT RAISE(ABORT, 'a notice to the client is never edited'); END;
CREATE TRIGGER pack_client_notices_never_deleted BEFORE DELETE ON pack_client_notices
BEGIN SELECT RAISE(ABORT, 'a notice to the client is never deleted'); END;

-- The email to the accountant carries the one-use link, so once it has really been sent its words are taken out of the
-- outbox like a sign-in code's (src/stubs/email-provider.ts, blankSentSecrets). Its fourth kind; the sentence unchanged.
DROP TRIGGER outbox_body_never_edited;

CREATE TRIGGER outbox_body_never_edited BEFORE UPDATE OF body ON outbox
WHEN NOT (
  OLD.sent_at IS NOT NULL
  AND OLD.kind IN ('SIGN_IN_CODE', 'PASSWORD_RESET', 'ACCOUNT_VERIFY', 'REPORT_FOR_SIGNOFF')
  AND NEW.body = 'This email held a sign-in code or a one-use link. It was sent, and then its words were removed so the code or link is not kept.'
)
BEGIN SELECT RAISE(ABORT, 'what an email said, and who it went to, is never edited'); END;
