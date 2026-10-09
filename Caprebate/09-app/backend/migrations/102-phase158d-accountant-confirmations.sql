-- ===========================================================================
-- 102 — THE CLIENT'S ACCOUNTANT CONFIRMS FOR THEMSELVES                     Phase 158d, 9 October 2026
--
-- The second Friary House run (04-phase-work/sim-2026-10-06, finding F46): "The client's accountant confirmed the claim
-- fits the return and the amendment window" was a tick Sales made for the accountant, and the filing date was typed by
-- Sales too, while the same accountant had just signed off the figures through their own private link. Now staff email
-- the accountant a private link (src/web/accountant-confirm.ts) and the accountant answers for themselves:
--
--   RETURN_FIT  at Reports: the claim fits the return and the amendment window — confirmed, or not, with why.
--   FILED       after it: the amended return was filed, on a date they give — confirmed, or not, with why.
--
-- As with the sign-off link (migration 073), only the link's SHA-256 is kept, it works for 30 days and is answered once.
-- Nothing here is ever changed or deleted.
-- ===========================================================================

CREATE TABLE accountant_confirm_requests (
  id            TEXT PRIMARY KEY,
  claim_id      TEXT NOT NULL REFERENCES claims(id),
  kind          TEXT NOT NULL CHECK (kind IN ('RETURN_FIT', 'FILED')),
  contact_id    TEXT NOT NULL REFERENCES contacts(id),
  to_email      TEXT NOT NULL CHECK (length(to_email) BETWEEN 3 AND 320),
  token_sha256  TEXT NOT NULL UNIQUE CHECK (length(token_sha256) = 64 AND token_sha256 NOT GLOB '*[^0-9a-f]*'),
  outbox_id     TEXT NOT NULL REFERENCES outbox(id),
  sent_by       TEXT NOT NULL REFERENCES users(id),
  sent_at       TEXT NOT NULL,
  expires_at    TEXT NOT NULL CHECK (expires_at > sent_at)
) STRICT;

CREATE INDEX accountant_confirm_requests_claim ON accountant_confirm_requests(claim_id, kind, sent_at);

CREATE TABLE accountant_confirm_answers (
  id            TEXT PRIMARY KEY,
  request_id    TEXT NOT NULL UNIQUE REFERENCES accountant_confirm_requests(id),
  outcome       TEXT NOT NULL CHECK (outcome IN ('CONFIRMED', 'NOT_CONFIRMED')),
  signer_name   TEXT NOT NULL CHECK (length(trim(signer_name)) BETWEEN 2 AND 200),
  signer_firm   TEXT CHECK (signer_firm IS NULL OR length(trim(signer_firm)) BETWEEN 2 AND 300),
  -- FILED only: the day the amended return was filed, as the accountant gave it.
  filed_on      TEXT CHECK (filed_on IS NULL OR filed_on GLOB '[0-9][0-9][0-9][0-9]-[01][0-9]-[0-3][0-9]'),
  reason        TEXT CHECK (reason IS NULL OR length(trim(reason)) BETWEEN 1 AND 2000),
  answered_at   TEXT NOT NULL,
  CHECK (outcome <> 'CONFIRMED' OR signer_firm IS NOT NULL),
  CHECK (outcome <> 'NOT_CONFIRMED' OR reason IS NOT NULL)
) STRICT;

CREATE TRIGGER accountant_confirm_requests_no_update BEFORE UPDATE ON accountant_confirm_requests
BEGIN SELECT RAISE(ABORT, 'a confirmation link, once sent, is never changed'); END;

CREATE TRIGGER accountant_confirm_requests_no_delete BEFORE DELETE ON accountant_confirm_requests
BEGIN SELECT RAISE(ABORT, 'a confirmation link is never deleted'); END;

CREATE TRIGGER accountant_confirm_answers_no_update BEFORE UPDATE ON accountant_confirm_answers
BEGIN SELECT RAISE(ABORT, 'an accountant''s answer is never changed'); END;

CREATE TRIGGER accountant_confirm_answers_no_delete BEFORE DELETE ON accountant_confirm_answers
BEGIN SELECT RAISE(ABORT, 'an accountant''s answer is never deleted'); END;
