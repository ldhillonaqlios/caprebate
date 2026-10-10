-- ===========================================================================
-- 116 — A FILING PER RETURN, WHERE STAFF RECORD IT    Phase 160 (the sweep, job B carried by Phase 159l), 10 October 2026
--
-- Phase 159l (migration 115) made the accountant's filing link name one return at a time, and the defence pack's close
-- read each return a claim goes into. Where the client has NO accountant (src/web/client-filing.ts route CLIENT),
-- staff record the filing (recordFiling, src/web/claim-record.ts), and that still took one filed_on for the claim.
--
--   claim_return_filings   one row per return a claim goes into, by the last day of its accounting period, with the day
--                          it was filed, who recorded it and when. Never changed and never deleted: a filing recorded
--                          wrongly is corrected by the audit trail, not by an edit. A claim whose parts all go into one
--                          return keeps claim_reconciliations.filed_on alone, as before; the first return recorded here
--                          also writes that date, so every reader of the old column still finds one.
--
-- OUR READING (Word question 283): the claim closes once every return already due is filed; a return not yet due is held
-- in aftercare with its due date.
-- ===========================================================================

CREATE TABLE claim_return_filings (
  id           TEXT PRIMARY KEY,
  claim_id     TEXT NOT NULL REFERENCES claims(id),
  period_end   TEXT NOT NULL CHECK (period_end GLOB '[0-9][0-9][0-9][0-9]-[01][0-9]-[0-3][0-9]'),
  filed_on     TEXT NOT NULL CHECK (filed_on GLOB '[0-9][0-9][0-9][0-9]-[01][0-9]-[0-3][0-9]'),
  recorded_by  TEXT NOT NULL REFERENCES users(id),
  recorded_at  TEXT NOT NULL,
  UNIQUE (claim_id, period_end)
) STRICT;

CREATE TRIGGER claim_return_filings_no_update BEFORE UPDATE ON claim_return_filings
BEGIN SELECT RAISE(ABORT, 'a recorded filing is never changed'); END;

CREATE TRIGGER claim_return_filings_no_delete BEFORE DELETE ON claim_return_filings
BEGIN SELECT RAISE(ABORT, 'a recorded filing is never deleted'); END;
