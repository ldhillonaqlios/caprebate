-- ===========================================================================
-- 089 — REGISTERS PUBLISHED AS A FILE, IMPORTED HERE   Phase 155 (lines 1-2), 4 October 2026
--
-- Care Inspectorate Wales and the Care Inspectorate (Scotland) publish downloadable lists of registered care services,
-- not APIs. (The Valuation Office Agency's rating list is a file too, but its licence restricts it to business rates
-- purposes, so it is recorded in the source register and NOT imported: Phase 155 line 3.) A person downloads the file and imports it (node src/cli.ts import-register); a lookup reads this table and
-- sends nothing outside (src/web/register-files.ts, src/connectors/register-files.ts). Each import REPLACES that
-- source's rows whole. Only the register's reference, the postcode, the address lines (for the match) and the fields
-- the source register permits are kept — never a person's name.
-- ===========================================================================

CREATE TABLE register_file_rows (
  source_id     TEXT NOT NULL CHECK (source_id IN ('CIW', 'CARE_INSPECTORATE')),
  ref           TEXT NOT NULL CHECK (length(trim(ref)) BETWEEN 1 AND 64),
  postcode_key  TEXT NOT NULL CHECK (length(postcode_key) BETWEEN 5 AND 8),
  address       TEXT NOT NULL,
  -- JSON of the permitted fields only (FILE_SOURCES in src/web/register-files.ts).
  fields        TEXT NOT NULL CHECK (json_valid(fields)),
  imported_at   TEXT NOT NULL,
  PRIMARY KEY (source_id, ref)
) STRICT;
CREATE INDEX register_file_rows_by_postcode ON register_file_rows (source_id, postcode_key);

CREATE TABLE register_file_imports (
  id            INTEGER PRIMARY KEY,
  source_id     TEXT NOT NULL CHECK (source_id IN ('CIW', 'CARE_INSPECTORATE')),
  file_name     TEXT NOT NULL,
  imported_at   TEXT NOT NULL,
  rows_kept     INTEGER NOT NULL CHECK (rows_kept >= 0),
  rows_skipped  INTEGER NOT NULL CHECK (rows_skipped >= 0),
  by_user       TEXT NOT NULL REFERENCES users(id)
) STRICT;

CREATE TRIGGER register_file_imports_never_edited BEFORE UPDATE ON register_file_imports
BEGIN SELECT RAISE(ABORT, 'an import record is never edited'); END;
CREATE TRIGGER register_file_imports_never_deleted BEFORE DELETE ON register_file_imports
BEGIN SELECT RAISE(ABORT, 'an import record is never deleted'); END;
