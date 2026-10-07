-- ===========================================================================
-- 097 — A FILE SENT TWICE IS RECOGNISED                                    Phase 157d, 6 October 2026
--
-- The Friary House run (04-phase-work/sim-2026-10-06, finding F18): the client sent the same file twice and both were
-- kept, silently. Nothing could tell: a document kept no fingerprint of its bytes. Now acceptClientBytes
-- (src/web/uploads.ts) records the SHA-256 of the bytes it accepted, and when the same business sent the very same
-- bytes before, the client is told when ("You sent us this same file on ..."). The second copy is still kept, as a
-- version, so nothing anyone sent is lost.
--
-- ADD COLUMN only. The fingerprint is of the file as it arrived, before the strip; it identifies the bytes, not their
-- content, and says nothing about anyone. Existing rows have none, and are never compared.
-- ===========================================================================

ALTER TABLE documents ADD COLUMN content_sha256 TEXT
  CHECK (content_sha256 IS NULL OR (length(content_sha256) = 64 AND content_sha256 NOT GLOB '*[^0-9a-f]*'));

CREATE INDEX documents_business_fingerprint ON documents(business_id, content_sha256) WHERE content_sha256 IS NOT NULL;
