-- ===========================================================================
-- 034 — CHECKED AND APPROVED, AND TELLING THE CLIENT.   Phase 139, 21 September 2026
--
-- WHY. Lakhbir, 18 September 2026: "When viewing the client's portfolio there
-- needs to be where the information has come from (API) with a secondary
-- approve box. When a user clicks approve this then pushes the details to say
-- Cap Rebate has completed this to the client - the idea is that we can then
-- manage the flow to the customer."
--
-- WHAT THIS IS. Two logs, and both only ever grow.
--
--   fact_approvals      one row each time a member of staff ticks "Checked and
--                       approved" beside a fact, or takes the tick off. Taking
--                       it off needs a reason. The current state of a fact is
--                       its latest row. A fact is named by `fact_ref`, built in
--                       src/web/approvals.ts from the row it came from — a
--                       register record's field, a client's answer, a recorded
--                       claim fact, a survey job, a sign-off or a report. A NEW
--                       VALUE IS A NEW ROW THERE, SO IT IS A NEW REF, AND IT
--                       STARTS UNCHECKED: nobody's tick carries over to a value
--                       they never saw.
--
--   client_step_notices  one row each time staff press "Tell the client" on a
--                       step, or Admin takes a step back. Taking back needs a
--                       reason, and the reason is OURS: the portal says "Being
--                       re-checked" and never the reason. The company step has
--                       no claim; every other step belongs to one claim of the
--                       same company.
--
-- WHAT IT NEVER DOES. Move a claim's stage, open a gate, or change a figure.
-- The steps sit on top of the ten-stage procedure and never replace it (the
-- mapping is a table in 09-app/CAPREBATE-DEVELOPER-SPEC.md). Nothing here is
-- read by the engine, the surveyor's payload or any cash gate.
--
-- AND ONE COLUMN. `register_records.property_id` says which of the company's
-- properties a property register's record is about. The connectors do not
-- exist yet; when they do, they key a record on the property they looked up.
-- A property record with no property is shown, and belongs to no step — it can
-- never make a step look complete (N4: not known is not a pass).
-- ===========================================================================

CREATE TABLE fact_approvals (
  id           TEXT PRIMARY KEY,
  business_id  TEXT NOT NULL REFERENCES businesses(id),
  fact_ref     TEXT NOT NULL CHECK (length(fact_ref) BETWEEN 3 AND 160),
  action       TEXT NOT NULL CHECK (action IN ('APPROVED','UNAPPROVED')),
  reason       TEXT CHECK (reason IS NULL OR length(trim(reason)) BETWEEN 1 AND 2000),
  actor_id     TEXT NOT NULL REFERENCES users(id),
  at           TEXT NOT NULL,
  CHECK (action <> 'UNAPPROVED' OR reason IS NOT NULL)
) STRICT;

CREATE INDEX fact_approvals_ref_idx ON fact_approvals(business_id, fact_ref, at);

CREATE TRIGGER fact_approvals_no_update BEFORE UPDATE ON fact_approvals
BEGIN SELECT RAISE(ABORT, 'an approval is never changed: taking a tick off is a new row with a reason'); END;

CREATE TRIGGER fact_approvals_no_delete BEFORE DELETE ON fact_approvals
BEGIN SELECT RAISE(ABORT, 'an approval is never deleted'); END;

CREATE TABLE client_step_notices (
  id           TEXT PRIMARY KEY,
  business_id  TEXT NOT NULL REFERENCES businesses(id),
  claim_id     TEXT REFERENCES claims(id),
  step         TEXT NOT NULL CHECK (step IN
                 ('COMPANY','PROPERTY','TAX','SURVEY_BOOKED','SURVEY_DONE','TAX_ADVISER','REPORT')),
  action       TEXT NOT NULL CHECK (action IN ('TOLD','TAKEN_BACK')),
  reason       TEXT CHECK (reason IS NULL OR length(trim(reason)) BETWEEN 1 AND 2000),
  actor_id     TEXT NOT NULL REFERENCES users(id),
  at           TEXT NOT NULL,
  CHECK (action <> 'TAKEN_BACK' OR reason IS NOT NULL),
  CHECK ((step = 'COMPANY') = (claim_id IS NULL))
) STRICT;

CREATE INDEX client_step_notices_idx ON client_step_notices(business_id, claim_id, step, at);

CREATE TRIGGER client_step_notices_claim_is_the_companys BEFORE INSERT ON client_step_notices
WHEN NEW.claim_id IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM claims c WHERE c.id = NEW.claim_id AND c.business_id = NEW.business_id)
BEGIN SELECT RAISE(ABORT, 'a step belongs to a claim of the same company'); END;

CREATE TRIGGER client_step_notices_no_update BEFORE UPDATE ON client_step_notices
BEGIN SELECT RAISE(ABORT, 'what the client was told is never changed: taking a step back is a new row with a reason'); END;

CREATE TRIGGER client_step_notices_no_delete BEFORE DELETE ON client_step_notices
BEGIN SELECT RAISE(ABORT, 'what the client was told is never deleted'); END;

ALTER TABLE register_records ADD COLUMN property_id TEXT REFERENCES properties(id);
