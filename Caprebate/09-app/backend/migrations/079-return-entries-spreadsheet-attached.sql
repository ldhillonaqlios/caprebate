-- ===========================================================================
-- 079 — THE RETURN ENTRIES, AS A SPREADSHEET, MAY TRAVEL WITH AN EMAIL
--                                                            Phase 153b, 4 October 2026
--
-- Word question 121 ("In what format would you like us to send our results?"): the signed PDF report and, beside it,
-- a small spreadsheet of the return entries for each year (src/web/return-entries.ts). The accountant's sign-off email
-- carries both. outbox_inline_files (migration 040) allows only a calendar invitation and a PDF, and SQLite cannot
-- widen a CHECK in place, so the table is rebuilt with one more type, 'text/csv; charset=utf-8', every row copied as it
-- is, and its index and two triggers made again word for word. Nothing else names it in a trigger or a view; the guard
-- at the foot proves no foreign key broke. What an email carried is still never edited and never deleted.
-- ===========================================================================

-- 1 · foreign keys off. A no-op inside a transaction, so it goes FIRST.
PRAGMA foreign_keys = OFF;

-- 2 · one transaction. All of it, or none of it.
BEGIN;

-- 3 · outbox_inline_files, rebuilt with the spreadsheet type.
CREATE TABLE outbox_inline_files_new (
  id            TEXT PRIMARY KEY,
  outbox_id     TEXT NOT NULL REFERENCES outbox(id),
  part_no       INTEGER NOT NULL CHECK (part_no >= 1),
  filename      TEXT NOT NULL CHECK (length(filename) BETWEEN 1 AND 120),
  content_type  TEXT NOT NULL CHECK (content_type IN ('text/calendar; method=REQUEST; charset=utf-8',
                                                     'text/calendar; method=CANCEL; charset=utf-8',
                                                     'application/pdf',
                                                     'text/csv; charset=utf-8')),
  bytes         BLOB NOT NULL,
  sha256        TEXT NOT NULL CHECK (length(sha256) = 64),
  UNIQUE (outbox_id, part_no)
) STRICT;
INSERT INTO outbox_inline_files_new (id, outbox_id, part_no, filename, content_type, bytes, sha256)
  SELECT id, outbox_id, part_no, filename, content_type, bytes, sha256 FROM outbox_inline_files;
DROP TABLE outbox_inline_files;
ALTER TABLE outbox_inline_files_new RENAME TO outbox_inline_files;
CREATE INDEX outbox_inline_files_outbox_idx ON outbox_inline_files(outbox_id);
CREATE TRIGGER outbox_inline_files_no_update BEFORE UPDATE ON outbox_inline_files
BEGIN SELECT RAISE(ABORT, 'what an email carried is never edited'); END;
CREATE TRIGGER outbox_inline_files_no_delete BEFORE DELETE ON outbox_inline_files
BEGIN SELECT RAISE(ABORT, 'what an email carried is never deleted'); END;

-- 4 · the guard: no foreign key broke.
CREATE TABLE _fk_check_guard (ok INTEGER NOT NULL CHECK (ok = 0)) STRICT;
INSERT INTO _fk_check_guard (ok) SELECT count(*) FROM pragma_foreign_key_check;
DROP TABLE _fk_check_guard;

COMMIT;

-- 5 · foreign keys back on, after the transaction.
PRAGMA foreign_keys = ON;
