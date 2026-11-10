-- ===========================================================================
-- 122 — WHICH ENGINE AND WHICH RULES MADE EACH SEALED RESULT      Phase 161m, 10 November 2026
--
-- 09-app/docs/ARCHITECTURE.md rule 6: a sealed result says which version of the claim calculator and which version of
-- each rule made it, so changing a rule never quietly changes a result a client already has. Every rule is an entry in
-- its area's register (src/modules/<area>/logic/rules.ts), with an id and a version; the engine's version is
-- 09-app/engine/package.json's, raised by every change to the calculator.
--
--   versions_json   {"engine": "0.1.0" | null, "rules": {"<rule id>": <version>, ...}}: the engine's version and the
--                   version of every rule in the writer's register and the registers below it, as the result was
--                   sealed. Written with the row, in the same statement; never changed (each table already refuses
--                   an edit to what it sealed). NULL on a row sealed before this migration: "not recorded".
--
-- On:  estimates              the sealed estimate (src/modules/survey/survey-open.ts)
--      survey_pack_approvals  an approved version of the survey pack (src/modules/survey/pack-approve.ts)
--      invoices               an invoice raised on a claim (src/modules/finance/invoices.ts)
-- A report, and every other issued deliverable, has its case stamp (claim_version_stamps, migration 022), which already
-- records the engine's version; from this phase its switch_readings_json carries "rules" too.
-- ===========================================================================

ALTER TABLE estimates ADD COLUMN versions_json TEXT CHECK (versions_json IS NULL OR json_valid(versions_json));
ALTER TABLE survey_pack_approvals ADD COLUMN versions_json TEXT CHECK (versions_json IS NULL OR json_valid(versions_json));
ALTER TABLE invoices ADD COLUMN versions_json TEXT CHECK (versions_json IS NULL OR json_valid(versions_json));

-- Written with the row and never after: an edit to it would be a result claiming rules it was not made with.
CREATE TRIGGER estimates_versions_never_change BEFORE UPDATE OF versions_json ON estimates
BEGIN SELECT RAISE(ABORT, 'the versions an estimate was sealed with never change'); END;
CREATE TRIGGER invoices_versions_never_change BEFORE UPDATE OF versions_json ON invoices
BEGIN SELECT RAISE(ABORT, 'the versions an invoice was raised with never change'); END;
