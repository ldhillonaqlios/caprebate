-- ===========================================================================
-- 035 — THE CLIENT'S FILES: WHO MAY SEE A FILE WE UPLOAD, AND A KEPT ORIGINAL.
--                                                   Phase 140, 21 September 2026
--
-- WHY. Lakhbir, 18 September 2026: "There is no folder icon which allows the
-- user to see what the customer has uploaded, but also the ability to upload
-- and save documents ourselves within the portal."
--
-- TWO THINGS, AND NEITHER CHANGES A DOCUMENT.
--
--   document_visibility  one row each time staff say whether the client can see
--                        one of the company's documents. It only ever grows: the
--                        current answer is the latest row. A document is never
--                        edited (migration 013's logical_documents_fixed), so the
--                        answer lives beside it, not in it.
--                        NO ROW: a document the client sent themselves is theirs
--                        to see; a document staff sent is NOT shown until a row
--                        says so. That is the default Lakhbir set — "Default: no" —
--                        and it is read in src/web/documents.ts, never assumed.
--
--   documents.original_* WHERE AN ORIGINAL WAS KEPT. Written only when the switch
--                        KEEP_ORIGINALS (src/web/originals.ts) is on, which it is
--                        not: with it off the upload handler deletes every
--                        original once it has been read, exactly as before, and
--                        these three columns stay empty on every row.
--                          original_kept_at       the handler kept it, encrypted
--                          original_delete_after  when it must be gone by
--                          original_deleted_at    when it was deleted
-- ===========================================================================

CREATE TABLE document_visibility (
  id                   TEXT PRIMARY KEY,
  logical_document_id  TEXT NOT NULL REFERENCES logical_documents(id),
  shown_to_client      INTEGER NOT NULL CHECK (shown_to_client IN (0,1)),
  set_by               TEXT NOT NULL REFERENCES users(id),
  set_at               TEXT NOT NULL
) STRICT;

CREATE INDEX document_visibility_doc_idx ON document_visibility(logical_document_id, set_at);

CREATE TRIGGER document_visibility_no_update BEFORE UPDATE ON document_visibility
BEGIN SELECT RAISE(ABORT, 'who may see a file is never edited: a change is a new row'); END;

CREATE TRIGGER document_visibility_no_delete BEFORE DELETE ON document_visibility
BEGIN SELECT RAISE(ABORT, 'who may see a file is never deleted'); END;

ALTER TABLE documents ADD COLUMN original_kept_at TEXT;
ALTER TABLE documents ADD COLUMN original_delete_after TEXT;
ALTER TABLE documents ADD COLUMN original_deleted_at TEXT;
