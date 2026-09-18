-- ===========================================================================
-- 022 — THE CASE STAMP, THE DELETION LOG, AND RESTORATIONS OF A DELETED RECORD.
--                                                     Phase 132, 14 Sep 2026
--
-- The code is src/web/case-stamp.ts, src/web/defence-pack.ts and, for the
-- backup cycle and the restore guard, 04-phase-work/phase3/caprebate-client-
-- doc-ingestion.ts read through src/web/upload-handler-port.ts.
--
-- EXTENDED, NEVER REBUILT. Three tables are created. Nothing existing changes.
--
-- WHAT IS NOT IN THIS FILE, ON PURPOSE
--   RET-7's TWO DATES. The claim period end and the report's delivery are READ,
--     NOT STORED (017, and src/web/claim-record.ts's header): the accounting
--     period end is a claim fact (015) and the delivery is the client report's
--     issue date (015). A column for either would be a second place to disagree.
--   A PERSON'S NAME. The deletion log names a record by its kind and id, never
--     by who it is about; who approved, executed and verified is a user id or a
--     role token, as every other table here.
--   A GENERATED DEFENCE PACK. Nothing writes one: the generator is switched off,
--     and switched on it builds a manifest and issues nothing.
-- ===========================================================================


-- ---------------------------------------------------------------------------
-- 1 · THE CASE STAMP — what decided a sealed case, written when it is issued
--
-- One row per ISSUED deliverable, written in the same transaction that issues
-- it (recordDeliverable, src/web/claim-record.ts): the engine version, the
-- rulebook module versions, every switch the build carries and its position,
-- the sign-off records with their hashes, the estimate's hash and the head of
-- the anchor log. `engine_version` is NULL where the engine package states no
-- version — read "not known", never a default. Hashed, and never changed.
-- ---------------------------------------------------------------------------
CREATE TABLE claim_version_stamps (
  id                     TEXT PRIMARY KEY,
  claim_id               TEXT NOT NULL REFERENCES claims(id),
  deliverable_id         TEXT NOT NULL UNIQUE REFERENCES claim_deliverables(id),
  engine_version         TEXT CHECK (engine_version IS NULL OR length(trim(engine_version)) BETWEEN 1 AND 100),
  rulebook_modules_json  TEXT NOT NULL CHECK (json_valid(rulebook_modules_json) AND json_type(rulebook_modules_json) = 'array'),
  switch_readings_json   TEXT NOT NULL CHECK (json_valid(switch_readings_json) AND json_type(switch_readings_json) = 'object'),
  signoff_refs_json      TEXT NOT NULL CHECK (json_valid(signoff_refs_json) AND json_type(signoff_refs_json) = 'array'),
  estimate_hash          TEXT,
  anchor_log_head_hash   TEXT,
  stamp_hash             TEXT NOT NULL CHECK (length(stamp_hash) = 64),
  stamped_by             TEXT NOT NULL REFERENCES users(id),
  stamped_at             TEXT NOT NULL
) STRICT;

CREATE INDEX claim_version_stamps_claim_idx ON claim_version_stamps(claim_id, stamped_at);

CREATE TRIGGER claim_version_stamps_issued_deliverable BEFORE INSERT ON claim_version_stamps
WHEN NOT EXISTS (
  SELECT 1 FROM claim_deliverables cd WHERE cd.id = NEW.deliverable_id AND cd.claim_id = NEW.claim_id AND cd.state = 'ISSUED')
BEGIN SELECT RAISE(ABORT, 'a case stamp is written for an issued deliverable of its own claim, as it is issued'); END;

CREATE TRIGGER claim_version_stamps_no_update BEFORE UPDATE ON claim_version_stamps
BEGIN SELECT RAISE(ABORT, 'a case stamp never changes: it records what decided the case when it was issued'); END;

CREATE TRIGGER claim_version_stamps_no_delete BEFORE DELETE ON claim_version_stamps
BEGIN SELECT RAISE(ABORT, 'a case stamp is never deleted'); END;


-- ---------------------------------------------------------------------------
-- 2 · THE DELETION LOG — Retention Procedure 4.3
--
-- One entry per deletion: a reference, the record's kind and id (NEVER A
-- NAME), its category, the rule that fired and the date it computed, who
-- approved it and the review record, who executed it and when, the stores it
-- left, whether backups are still pending expiry, the backup cycle it relied on
-- and the day the last copy expires, and who verified it and when.
--
-- THE BACKUP CYCLE IS NOT SET (Retention Procedure 4.1 point 4). So:
--   a cycle not known carries NO expiry, and IS pending — an unknown cycle never
--     becomes "no backups" (N4);
--   only a known cycle with no copies (zero days) may say nothing is pending.
-- RET-3 — six years from the deletion complete everywhere — is computed from
-- `verified_at` and the expiry by `ret3DueAt`, and has no date while the cycle
-- is not known. Nothing is deleted from here, and the only change an entry
-- takes is its verification, once.
-- ---------------------------------------------------------------------------
CREATE TABLE deletion_log (
  deletion_ref             TEXT PRIMARY KEY CHECK (length(trim(deletion_ref)) BETWEEN 1 AND 100),
  record_kind              TEXT NOT NULL CHECK (length(record_kind) BETWEEN 1 AND 60 AND record_kind NOT GLOB '*[^A-Z0-9_]*'),
  record_id                TEXT NOT NULL CHECK (length(trim(record_id)) BETWEEN 1 AND 200),
  category                 TEXT NOT NULL CHECK (length(trim(category)) BETWEEN 1 AND 200),
  basis_rule               TEXT NOT NULL CHECK (length(trim(basis_rule)) BETWEEN 1 AND 60),
  basis_due_on             TEXT CHECK (basis_due_on IS NULL OR basis_due_on GLOB '[0-9][0-9][0-9][0-9]-[01][0-9]-[0-3][0-9]*'),
  approved_by              TEXT NOT NULL CHECK (length(trim(approved_by)) BETWEEN 2 AND 200),
  review_ref               TEXT NOT NULL CHECK (length(trim(review_ref)) BETWEEN 1 AND 200),
  executed_by              TEXT NOT NULL CHECK (length(trim(executed_by)) BETWEEN 2 AND 200),
  executed_at              TEXT NOT NULL,
  stores_json              TEXT NOT NULL CHECK (json_valid(stores_json) AND json_type(stores_json) = 'array'),
  backups_pending          INTEGER NOT NULL CHECK (backups_pending IN (0,1)),
  backup_cycle_days        INTEGER CHECK (backup_cycle_days IS NULL OR backup_cycle_days >= 0),
  backup_copies_expire_at  TEXT,
  verified_by              TEXT CHECK (verified_by IS NULL OR length(trim(verified_by)) BETWEEN 2 AND 200),
  verified_at              TEXT,
  -- No cycle, no expiry: a date is never computed from a cycle nobody stated.
  CHECK (backup_cycle_days IS NOT NULL OR backup_copies_expire_at IS NULL),
  -- No cycle is pending: not known never reads as "no copies".
  CHECK (backup_cycle_days IS NOT NULL OR backups_pending = 1),
  -- Nothing pending, nothing to expire.
  CHECK (backups_pending = 1 OR backup_copies_expire_at IS NULL),
  CHECK ((verified_by IS NULL) = (verified_at IS NULL))
) STRICT;

CREATE INDEX deletion_log_record_idx ON deletion_log(record_kind, record_id);

CREATE TRIGGER deletion_log_no_delete BEFORE DELETE ON deletion_log
BEGIN SELECT RAISE(ABORT, 'a deletion log entry is never deleted: it is the evidence that the deletion happened'); END;

CREATE TRIGGER deletion_log_verified_once BEFORE UPDATE ON deletion_log
WHEN OLD.verified_at IS NOT NULL OR NEW.verified_at IS NULL
  OR NEW.deletion_ref IS NOT OLD.deletion_ref OR NEW.record_kind IS NOT OLD.record_kind OR NEW.record_id IS NOT OLD.record_id
  OR NEW.category IS NOT OLD.category OR NEW.basis_rule IS NOT OLD.basis_rule OR NEW.basis_due_on IS NOT OLD.basis_due_on
  OR NEW.approved_by IS NOT OLD.approved_by OR NEW.review_ref IS NOT OLD.review_ref
  OR NEW.executed_by IS NOT OLD.executed_by OR NEW.executed_at IS NOT OLD.executed_at OR NEW.stores_json IS NOT OLD.stores_json
  OR NEW.backups_pending IS NOT OLD.backups_pending OR NEW.backup_cycle_days IS NOT OLD.backup_cycle_days
  OR NEW.backup_copies_expire_at IS NOT OLD.backup_copies_expire_at
BEGIN SELECT RAISE(ABORT, 'the only change to a deletion log entry is its verification, recorded once'); END;


-- ---------------------------------------------------------------------------
-- 3 · RESTORATIONS — no deleted record comes back without the DPO's approval
--
-- Retention Procedure 4.1 point 4. A restoration names the deletion it undoes
-- — which must be in the log — who approved it and the approval's reference.
-- Nothing in this build restores a record; this is where one would be recorded,
-- and `assertRestoreApproved` is the guard it passes first.
-- ---------------------------------------------------------------------------
CREATE TABLE deletion_restorations (
  id            TEXT PRIMARY KEY,
  deletion_ref  TEXT NOT NULL REFERENCES deletion_log(deletion_ref),
  approved_by   TEXT NOT NULL CHECK (length(trim(approved_by)) BETWEEN 2 AND 200),
  approval_ref  TEXT NOT NULL CHECK (length(trim(approval_ref)) BETWEEN 1 AND 200),
  restored_by   TEXT NOT NULL CHECK (length(trim(restored_by)) BETWEEN 2 AND 200),
  restored_at   TEXT NOT NULL
) STRICT;

CREATE TRIGGER deletion_restorations_logged_deletion BEFORE INSERT ON deletion_restorations
WHEN NOT EXISTS (SELECT 1 FROM deletion_log l WHERE l.deletion_ref = NEW.deletion_ref)
BEGIN SELECT RAISE(ABORT, 'a restoration undoes a deletion in the deletion log, and this reference has no entry there'); END;

CREATE TRIGGER deletion_restorations_no_update BEFORE UPDATE ON deletion_restorations
BEGIN SELECT RAISE(ABORT, 'a restoration record never changes'); END;

CREATE TRIGGER deletion_restorations_no_delete BEFORE DELETE ON deletion_restorations
BEGIN SELECT RAISE(ABORT, 'a restoration record is never deleted'); END;
