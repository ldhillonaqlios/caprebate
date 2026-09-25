-- ===========================================================================
-- 053 — THE ONLINE IDENTITY CHECK IS DIDIT'S.                           Phase 151f, 25 September 2026
--
-- Lakhbir switched the identity check from Veriff to Didit on 25 September 2026 (free for 500 checks a month; the
-- reasons are in src/connectors/identity-check.ts). Migration 047 let identity_checks.provider be 'VERIFF' and nothing
-- else, so a check sent through Didit could not be kept. This lets it be 'DIDIT' as well - and keeps 'VERIFF', so a
-- row written before the switch, on any database, stays valid. Nothing else about either table changes.
--
-- A CHECK CAN ONLY BE CHANGED BY REBUILDING THE TABLE (sqlite.org, "Making Other Kinds Of Table Schema Changes"),
-- exactly as migration 007 did for businesses, and read that file's header for the twelve steps. Here:
--   identity_check_results carries a foreign key into identity_checks. With foreign_keys OFF that reference survives
--   the drop and the rename by name, and the guard below proves it rather than assuming it.
--   What hangs off identity_checks, and so must be put back: its two indexes and its one trigger
--   (identity_checks_no_delete). Dropping the table does NOT fire that trigger: the implicit DELETE of a DROP TABLE
--   fires no triggers.
--
-- AND ONE MORE REFUSAL ON OUR COPY OF A RESULT. Migration 047's trigger refuses a copy carrying Veriff's shapes of a
-- person or a document number. Didit's own field names for the same things are refused too, at the top of the copy
-- where the reader writes them, so a later change to the reader cannot start keeping them.
-- ===========================================================================

-- 1 · foreign keys off. A no-op inside a transaction, so it goes FIRST.
PRAGMA foreign_keys = OFF;

-- 2 · one transaction. All of it, or none of it.
BEGIN;

-- 3, 4 · the same table; only the provider CHECK widens. Every other column and constraint is 047's.
CREATE TABLE identity_checks_new (
  id            TEXT PRIMARY KEY,
  business_id   TEXT NOT NULL REFERENCES businesses(id),
  contact_id    TEXT NOT NULL REFERENCES contacts(id),
  cdd_check_id  TEXT REFERENCES cdd_checks(id),
  provider      TEXT NOT NULL CHECK (provider IN ('VERIFF','DIDIT')),
  session_id    TEXT NOT NULL UNIQUE CHECK (length(session_id) BETWEEN 1 AND 200),
  link          TEXT NOT NULL CHECK (link GLOB 'https://*' AND length(link) <= 2000),
  sent_by       TEXT NOT NULL REFERENCES users(id),
  sent_at       TEXT NOT NULL
) STRICT;

-- 5 · copy, columns named on both sides.
INSERT INTO identity_checks_new (id, business_id, contact_id, cdd_check_id, provider, session_id, link, sent_by, sent_at)
SELECT id, business_id, contact_id, cdd_check_id, provider, session_id, link, sent_by, sent_at FROM identity_checks;

-- 6, 7 · drop and rename; then put back what hung off the old table.
DROP TABLE identity_checks;
ALTER TABLE identity_checks_new RENAME TO identity_checks;

CREATE INDEX identity_checks_by_business ON identity_checks (business_id, sent_at);
CREATE INDEX identity_checks_by_cdd ON identity_checks (cdd_check_id);

CREATE TRIGGER identity_checks_no_delete BEFORE DELETE ON identity_checks
BEGIN SELECT RAISE(ABORT, 'a check we sent is kept as evidence'); END;

-- Didit's names for a person and a document, refused in our copy of a result.
CREATE TRIGGER identity_check_results_no_person_didit BEFORE INSERT ON identity_check_results
WHEN json_extract(NEW.result_json, '$.first_name') IS NOT NULL
  OR json_extract(NEW.result_json, '$.last_name') IS NOT NULL
  OR json_extract(NEW.result_json, '$.full_name') IS NOT NULL
  OR json_extract(NEW.result_json, '$.date_of_birth') IS NOT NULL
  OR json_extract(NEW.result_json, '$.document_number') IS NOT NULL
  OR json_extract(NEW.result_json, '$.personal_number') IS NOT NULL
  OR json_extract(NEW.result_json, '$.address') IS NOT NULL
  OR json_extract(NEW.result_json, '$.portrait_image') IS NOT NULL
  OR json_extract(NEW.result_json, '$.decision') IS NOT NULL
BEGIN SELECT RAISE(ABORT, 'an identity result keeps the decision only: never the person, never the document number'); END;

-- 8 · THE GUARD. Zero foreign-key violations, or this migration does not happen at all.
CREATE TABLE _fk_check_guard (ok INTEGER NOT NULL CHECK (ok = 0)) STRICT;
INSERT INTO _fk_check_guard (ok) SELECT count(*) FROM pragma_foreign_key_check;
DROP TABLE _fk_check_guard;

-- 9 · commit.
COMMIT;

-- 10 · and back on.
PRAGMA foreign_keys = ON;
