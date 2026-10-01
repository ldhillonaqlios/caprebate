-- ===========================================================================
-- 067 — API KEYS SAVED FROM THE ADMIN TAB, SEALED
-- 1 October 2026. src/web/saved-keys.ts, src/secrets.ts (overlaySecrets).
--
-- Lakhbir: Admin should be able to "update the API keys and save them". A key saved here is SEALED (AES-256-GCM, under
-- CAPREBATE_MFA_KEY, its name bound in) before it is written, and is never shown again — not on a page, not in the audit
-- log, which names the key only. The newest row for a name wins over the key file or the website's settings; a row with
-- no sealed value says "use the key file's again". Rows are never edited or deleted: the history of who changed which
-- key, and when, is the table itself.
-- ===========================================================================

CREATE TABLE saved_keys (
  id       TEXT PRIMARY KEY,
  name     TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 64),
  sealed   TEXT CHECK (sealed IS NULL OR sealed LIKE 'cbkey1:%'),
  set_by   TEXT NOT NULL REFERENCES users(id),
  set_at   TEXT NOT NULL
) STRICT;

CREATE INDEX saved_keys_name_idx ON saved_keys(name, set_at);

CREATE TRIGGER saved_keys_never_edited BEFORE UPDATE ON saved_keys
BEGIN SELECT RAISE(ABORT, 'a saved key is never edited: save a new one'); END;

CREATE TRIGGER saved_keys_never_deleted BEFORE DELETE ON saved_keys
BEGIN SELECT RAISE(ABORT, 'a saved key is never deleted: take it off with a new row'); END;
