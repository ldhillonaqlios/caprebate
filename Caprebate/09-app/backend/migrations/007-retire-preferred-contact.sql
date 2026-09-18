-- ===========================================================================
-- 007 — `businesses.preferred_contact` is REMOVED.       Phase 113a, 9 Sep 2026
--
-- MIGRATION 004 ENDED THIS COLUMN AND COULD NOT DELETE IT. Read that file's
-- section 3 first: it explains why the column exists, why it was wrong, and
-- why narrowing it with a trigger is impossible — a trigger can only make a
-- column stricter, migration 002's own CHECK allows only ('email','telephone',
-- 'virtual','post'), and CB_BOOKING's vocabulary is ('phone','sms_whatsapp',
-- 'email'). A trigger narrowing and a CHECK widening cannot meet.
--
-- So 004 set every value to NULL and put two triggers on the column refusing
-- ANY value at all. That left it INERT AND ENFORCED INERT — a dead column
-- nothing can write to — and said the last of it was a job for this phase.
--
-- ---------------------------------------------------------------------------
-- WHY THIS NEEDS A WHOLE TABLE REBUILD, WHICH LOOKS LIKE OVERKILL AND IS NOT
--
-- SQLite REFUSES `DROP COLUMN` on a column named in a table CHECK, and this one
-- is: `CHECK (preferred_contact IN ('email','telephone','virtual','post'))` is
-- part of the CREATE TABLE. The documented way to change a CHECK — or to remove
-- a column carrying one — is to rebuild the table, and that is what follows.
--
-- THIRTEEN TABLES CARRY A FOREIGN KEY INTO `businesses`. That is the whole risk
-- of this migration and the reason 004 declined it: properties, assessments,
-- assessment_answers, estimates, invoices, register_records, research_records,
-- engagements, bookings, contacts, client_tasks, documents and research_runs.
-- With `foreign_keys = OFF` those references survive the drop and the rename by
-- name, and `pragma_foreign_key_check` below proves it rather than assuming it.
--
-- ---------------------------------------------------------------------------
-- THE TWELVE STEPS, AND THE ONE THING SQL CANNOT DO ON ITS OWN
--
-- sqlite.org's "Making Other Kinds Of Table Schema Changes" is followed to the
-- letter: foreign keys off, transaction, new table, copy, drop, rename,
-- recreate what hung off the old table, foreign_key_check, commit, foreign keys
-- on.
--
-- STEP 8 IS THE AWKWARD ONE. `PRAGMA foreign_key_check` RETURNS ROWS; it does
-- not abort. A migration runner that executes a file of statements has nothing
-- to branch on, so the check would be a report nobody reads. THE GUARD BELOW
-- TURNS IT INTO A FAILURE: a one-column table whose CHECK demands zero, fed the
-- COUNT of violations. Zero violations inserts a 0 and the table is dropped
-- again; one violation aborts the statement, aborts the migration, and leaves
-- the transaction unclosed and uncommitted — so nothing is written and
-- `schema_migrations` never records this file as applied.
--
-- IT WAS PROVED ABLE TO FAIL BEFORE IT WAS KEPT: run against a database with a
-- deliberately dangling reference it raises `CHECK constraint failed: ok = 0`.
-- A check that cannot fail is a comment.
--
-- ---------------------------------------------------------------------------
-- WHAT HANGS OFF `businesses`, AND THEREFORE WHAT STEP 7 HAS TO PUT BACK
--
-- NOTHING, AND THAT IS CHECKED RATHER THAN REMEMBERED. `businesses` has no
-- index of its own (its only key is the INTEGER-less TEXT PRIMARY KEY, which
-- the rebuild recreates), no view reads it, and its only two triggers are 004's
-- retirement pair — which name `NEW.preferred_contact` and therefore CANNOT
-- survive a table without that column. They are dropped with the table, on
-- purpose: a trigger refusing writes to a column that no longer exists is not a
-- control, it is a fossil, and the schema itself now refuses the write with a
-- better error than the trigger's message did.
--
-- A test asserts all of that from the live schema after this runs, so the day
-- somebody adds an index or a trigger to `businesses` and this file is replayed
-- from scratch, the loss is caught rather than discovered.
-- ===========================================================================

-- 1 · foreign keys off. A no-op inside a transaction, so it goes FIRST.
PRAGMA foreign_keys = OFF;

-- 2 · one transaction. All of it, or none of it.
BEGIN;

-- 3, 4 · the same table, one column shorter. Every other column, constraint and
--        default is character for character migration 002's, including STRICT
--        and the sector CHECK — this migration removes one column and changes
--        nothing else, and a diff against 002 should show exactly that.
CREATE TABLE businesses_new (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  sector        TEXT NOT NULL CHECK (sector IN
                  ('care_homes','dental','supported_living','gp','private_hospital')),
  -- The pipeline stage the engaged-client list sorts on (Phase 106).
  stage         TEXT NOT NULL,
  -- NO PERSONAL NAMES. A business has a contact CHANNEL, not a named person:
  -- see the seed and the note in src/seed.ts. Nothing here is a field a
  -- register would have supplied.
  contact_email TEXT,
  contact_phone TEXT,
  -- `preferred_contact` was here. The contact channel lives on the booking row,
  -- in CB_BOOKING's vocabulary, with the entry point and the variant beside it.
  created_at    TEXT NOT NULL
) STRICT;

-- 5 · copy. COLUMNS NAMED ON BOTH SIDES rather than `SELECT *`: a positional
--     copy is how a column ends up in the wrong one the day the table changes
--     again, and this is the migration that proves that can happen.
INSERT INTO businesses_new (id, name, sector, stage, contact_email, contact_phone, created_at)
SELECT id, name, sector, stage, contact_email, contact_phone, created_at FROM businesses;

-- 6, 7 · drop and rename. The two retirement triggers go with the old table,
--        which is the intention — see the block above.
DROP TABLE businesses;

ALTER TABLE businesses_new RENAME TO businesses;

-- 8 · THE GUARD. Zero violations, or this migration does not happen at all.
CREATE TABLE _fk_check_guard (ok INTEGER NOT NULL CHECK (ok = 0)) STRICT;
INSERT INTO _fk_check_guard (ok) SELECT count(*) FROM pragma_foreign_key_check;
DROP TABLE _fk_check_guard;

-- 9 · commit.
COMMIT;

-- 10 · and back on. Referential integrity is not optional; src/db.ts asserts it
--      on every connection and this restores it for the one running migrations.
PRAGMA foreign_keys = ON;
