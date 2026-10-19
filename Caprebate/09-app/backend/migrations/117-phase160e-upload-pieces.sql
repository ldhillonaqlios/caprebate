-- ===========================================================================
-- 117 — A FILE SENT IN PIECES                    Phase 160e (the stress test's fixes), 19 October 2026
--
-- The stress test of 19 October 2026 sent a 6 MB document to the test website and Vercel refused it before the website
-- saw it ("Request Entity Too Large"): Vercel takes at most 4.5 MB a request, and every document form sent its file
-- whole, while the portal says "The most we take is 50 MB". So the page's script now sends a file over that limit in
-- pieces (src/web/upload-pieces.ts), each kept in the private file store until the form that sends the file asks for it.
--
--   upload_pieces   one row per file sent in pieces: who sent it, its size and how many pieces, when it started and
--                   when it was taken by the form (or swept, after a day, with its pieces removed from the store).
-- ===========================================================================

CREATE TABLE upload_pieces (
  id           TEXT PRIMARY KEY,
  user_id      TEXT NOT NULL REFERENCES users(id),
  size         INTEGER NOT NULL CHECK (size > 0),
  pieces       INTEGER NOT NULL CHECK (pieces > 0),
  sealed       INTEGER NOT NULL CHECK (sealed IN (0, 1)),
  started_at   TEXT NOT NULL,
  ended_at     TEXT,
  ended_how    TEXT CHECK (ended_how IN ('TAKEN', 'SWEPT'))
) STRICT;

CREATE INDEX upload_pieces_open ON upload_pieces (started_at) WHERE ended_at IS NULL;
