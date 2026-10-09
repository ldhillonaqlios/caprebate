-- ===========================================================================
-- 104 — THE TAX ADVISER SIGNS ONE VERSION, AND ITS RETURN ENTRIES NEVER CHANGE     Phase 159a, 9 October 2026
--
-- The stress test of 9 October 2026 (04-phase-work/stress-2026-10-09/claim, findings C4 and C29):
--
-- C4. A sign-off was matched to an approved version by its total. A second version with the same total but its spend
--     moved between the pools was released to the client, though the adviser never saw it. Now each sign-off names the
--     version it signed (approval_id), and only that version is released (src/web/report-signoff.ts releasedVersion).
--     Sign-offs recorded before today are given the version the old rule released for them: the newest version
--     approved before the sign-off was recorded with the same total. The no-update trigger is put back as it was.
--
-- C29. A version's return entries spreadsheet was worked out again on every download, from the claim's accounting
--     period and claimant type as they stood that day, so the file sent to the accountant could change after it was
--     sent. Now the first time a version's spreadsheet leaves us (emailed for sign-off, or the sign-off is recorded)
--     the two facts it was made from are kept here, once, and every later copy of that version is made from them.
-- ===========================================================================

ALTER TABLE tax_adviser_signoffs ADD COLUMN approval_id TEXT REFERENCES survey_pack_approvals(id);

DROP TRIGGER tax_adviser_signoffs_no_update;

UPDATE tax_adviser_signoffs SET approval_id = (
  SELECT a.id FROM survey_pack_approvals a JOIN survey_packs p ON p.id = a.pack_id JOIN surveyor_jobs j ON j.id = p.job_id
   WHERE j.claim_id = tax_adviser_signoffs.claim_id AND a.approved_at <= tax_adviser_signoffs.recorded_at
     AND json_extract(a.snapshot_json, '$.sums.qualifying_pence') = tax_adviser_signoffs.figure_pence
   ORDER BY a.approved_at DESC, a.version DESC LIMIT 1);

CREATE TRIGGER tax_adviser_signoffs_no_update BEFORE UPDATE ON tax_adviser_signoffs
BEGIN SELECT RAISE(ABORT, 'a sign-off record never changes: a later sign-off is a new record'); END;

CREATE TRIGGER tax_adviser_signoffs_version_on_claim BEFORE INSERT ON tax_adviser_signoffs
WHEN NEW.approval_id IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM survey_pack_approvals a JOIN survey_packs p ON p.id = a.pack_id JOIN surveyor_jobs j ON j.id = p.job_id
   WHERE a.id = NEW.approval_id AND j.claim_id = NEW.claim_id)
BEGIN SELECT RAISE(ABORT, 'a sign-off names an approved version of a survey pack on this claim'); END;

CREATE INDEX tax_adviser_signoffs_approval_idx ON tax_adviser_signoffs(approval_id);

CREATE TABLE return_entry_contexts (
  approval_id   TEXT PRIMARY KEY REFERENCES survey_pack_approvals(id),
  -- The accounting period's first day, as the claim recorded it, or NULL where it was not recorded.
  period_start  TEXT CHECK (period_start IS NULL OR period_start GLOB '[0-9][0-9][0-9][0-9]-[01][0-9]-[0-3][0-9]'),
  -- 1 a company, 0 self assessment, NULL not known.
  is_company    INTEGER CHECK (is_company IS NULL OR is_company IN (0, 1)),
  -- What first sent it: 'SENT_FOR_SIGNOFF' or 'SIGNOFF_RECORDED'.
  frozen_by     TEXT NOT NULL CHECK (frozen_by IN ('SENT_FOR_SIGNOFF', 'SIGNOFF_RECORDED')),
  frozen_at     TEXT NOT NULL
) STRICT;

CREATE TRIGGER return_entry_contexts_no_update BEFORE UPDATE ON return_entry_contexts
BEGIN SELECT RAISE(ABORT, 'a version''s return entries, once sent, never change'); END;

CREATE TRIGGER return_entry_contexts_no_delete BEFORE DELETE ON return_entry_contexts
BEGIN SELECT RAISE(ABORT, 'a version''s return entries, once sent, are never deleted'); END;
