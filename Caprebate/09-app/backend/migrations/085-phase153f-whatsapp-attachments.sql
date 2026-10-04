-- ===========================================================================
-- 085 — A WHATSAPP PHOTO, VOICE NOTE OR DOCUMENT, KEPT HERE   Phase 153f, 4 October 2026
--
-- Until now an attachment someone sent us on WhatsApp was recorded only as "they sent a photo; open WhatsApp to see it".
-- One row per message that carried one: Meta's media id and what Meta said about it (type, size check, SHA-256, file
-- name), from the signed webhook. Admin or Sales press "Get it" on the WhatsApp page; the file is fetched from Meta
-- (src/connectors/whatsapp.ts, fetchWhatsAppMedia), its SHA-256 checked, and kept SEALED in the file store like a survey
-- photo (`object_key`). Fetched once, never changed. How long it is kept waits on the data protection officer (the
-- WhatsApp retention reading, FOR THE SOLICITOR, THE DPO AND THE DEVELOPER); until then nothing deletes it.
-- ===========================================================================

CREATE TABLE whatsapp_media (
  message_id   TEXT PRIMARY KEY REFERENCES whatsapp_messages(id),
  media_id     TEXT NOT NULL CHECK (length(media_id) BETWEEN 1 AND 200),
  media_type   TEXT NOT NULL CHECK (media_type IN ('image','video','audio','document','sticker')),
  mime         TEXT CHECK (mime IS NULL OR length(mime) <= 100),
  sha256       TEXT CHECK (sha256 IS NULL OR length(sha256) <= 100),
  filename     TEXT CHECK (filename IS NULL OR length(filename) <= 200),
  object_key   TEXT,
  bytes        INTEGER CHECK (bytes IS NULL OR bytes >= 0),
  fetched_by   TEXT REFERENCES users(id),
  fetched_at   TEXT,
  CHECK ((object_key IS NULL) = (fetched_at IS NULL) AND (fetched_at IS NULL) = (fetched_by IS NULL) AND (fetched_at IS NULL) = (bytes IS NULL))
) STRICT;

CREATE TRIGGER whatsapp_media_fetched_once BEFORE UPDATE ON whatsapp_media
WHEN OLD.fetched_at IS NOT NULL OR NEW.media_id <> OLD.media_id OR NEW.message_id <> OLD.message_id
BEGIN SELECT RAISE(ABORT, 'a WhatsApp attachment is fetched once and never changed'); END;

CREATE TRIGGER whatsapp_media_never_deleted BEFORE DELETE ON whatsapp_media
BEGIN SELECT RAISE(ABORT, 'a WhatsApp attachment is not deleted until a retention rule is set'); END;
