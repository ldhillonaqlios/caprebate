-- ===========================================================================
-- 027 — THE CLIENT'S OWN FILING CONFIRMATION, WHERE THERE IS NO ACCOUNTANT.
--                                                  Phase 132e, 16 September 2026
--
-- WHY. Lakhbir, answering "Where a client has no accountant or tax adviser, who
-- confirms the claim fits their return ...?": "The client". The REPORTS gate
-- (src/web/pipeline.ts) has needed the client's accountant to confirm the claim
-- fits the return and the amendment window. Where the client has none, it now
-- accepts THE CLIENT'S OWN WRITTEN CONFIRMATION of three things:
--   1. they will file the amendment themselves;
--   2. the last day to amend, as Caprebate states it (the date is stored, and the
--      gate requires it to be the amendment window's deadline as the application
--      reads it now) — THE SENTENCE IS AWAITING THE TAX ADVISER'S WORDING;
--   3. they remain responsible for the filing position.
--
-- A RECORD OF ITS OWN. It is never written as, or read as, an accountant's
-- confirmation: `confirmed_by_party` can hold only CLIENT, and the accountant's
-- confirmation stays the milestone it always was.
--
-- N4. Every answer is YES, NO or UNSURE, or absent (NULL). Only YES counts; NO,
-- UNSURE and absent all leave the gate shut, identically. The client route is
-- taken only where the client has confirmed they have no accountant or tax
-- adviser AND the organisation has no contact typed ACCOUNTANT or ADVISER — a
-- client with an accountant still goes the accountant's way.
--
-- APPEND-ONLY. A changed answer is a new row; the latest row since the claim
-- entered REPORTS is the one the gate reads.
-- ===========================================================================

CREATE TABLE client_filing_confirmations (
  id                         TEXT PRIMARY KEY,
  claim_id                   TEXT NOT NULL,
  business_id                TEXT NOT NULL,
  confirmed_by_party         TEXT NOT NULL CHECK (confirmed_by_party = 'CLIENT'),
  no_accountant_or_adviser   TEXT CHECK (no_accountant_or_adviser IN ('YES','NO','UNSURE')),
  will_file_amendment        TEXT CHECK (will_file_amendment IN ('YES','NO','UNSURE')),
  last_day_acknowledged      TEXT CHECK (last_day_acknowledged IN ('YES','NO','UNSURE')),
  last_day_stated            TEXT CHECK (last_day_stated IS NULL OR last_day_stated GLOB '[0-9][0-9][0-9][0-9]-[01][0-9]-[0-3][0-9]'),
  remains_responsible        TEXT CHECK (remains_responsible IN ('YES','NO','UNSURE')),
  -- Where the client's written confirmation is: a signed form, a dated email. Words, never the confirmation itself retyped.
  written_evidence           TEXT NOT NULL CHECK (length(trim(written_evidence)) BETWEEN 2 AND 1000),
  recorded_by                TEXT NOT NULL REFERENCES users(id),
  recorded_at                TEXT NOT NULL,
  FOREIGN KEY (claim_id, business_id) REFERENCES claims(id, business_id)
) STRICT;

CREATE INDEX client_filing_confirmations_claim_idx ON client_filing_confirmations(claim_id, recorded_at);

CREATE TRIGGER client_filing_confirmations_no_update BEFORE UPDATE ON client_filing_confirmations
BEGIN SELECT RAISE(ABORT, 'a client filing confirmation is kept as recorded: record a new one instead'); END;

CREATE TRIGGER client_filing_confirmations_no_delete BEFORE DELETE ON client_filing_confirmations
BEGIN SELECT RAISE(ABORT, 'a client filing confirmation is kept as recorded: record a new one instead'); END;
