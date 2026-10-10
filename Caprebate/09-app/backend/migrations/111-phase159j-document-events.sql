-- ===========================================================================
-- 111 — A DOCUMENT NAMES ITS EVENT    Phase 159j (item 5, carried from Phase 159c), 10 October 2026
--
-- Phase 159c listed each event's documents by type, with how many of that type the client's records hold, so a
-- purchase-then-refit building showed one count of contractor's invoices for two pieces of work. Now:
--
--   logical_documents.event_id  the event on the building the document proves (property_events, migration 105). It is
--                               on the DOCUMENT, not on each version: every version of one invoice proves the same work,
--                               and the counts read documents. NULL: not tied to one piece of work.
--   client_tasks.event_id       a request for a document may name the event it is for ("the final account for the
--                               2025 refit"); the document that answers it takes the same event.
--
-- logical_documents_fixed (migration 013) refused every change to a document. It is made again to allow one: the piece
-- of work a document proves, so a person can tie a document sent before this to its event, or correct the tie. Every
-- other column still never changes; each tie is in the audit log (DOCUMENT_EVENT_SET).
-- ===========================================================================

ALTER TABLE logical_documents ADD COLUMN event_id TEXT REFERENCES property_events(id);
ALTER TABLE client_tasks ADD COLUMN event_id TEXT REFERENCES property_events(id);

CREATE INDEX logical_documents_event_idx ON logical_documents(event_id) WHERE event_id IS NOT NULL;
CREATE INDEX client_tasks_event_idx ON client_tasks(event_id) WHERE event_id IS NOT NULL;

DROP TRIGGER logical_documents_fixed;
CREATE TRIGGER logical_documents_fixed BEFORE UPDATE ON logical_documents
WHEN NEW.id IS NOT OLD.id OR NEW.business_id IS NOT OLD.business_id OR NEW.type_code IS NOT OLD.type_code
  OR NEW.seq IS NOT OLD.seq OR NEW.created_by IS NOT OLD.created_by OR NEW.created_at IS NOT OLD.created_at
BEGIN SELECT RAISE(ABORT, 'nothing about a document changes: a new upload is a new version, not an edit'); END;
