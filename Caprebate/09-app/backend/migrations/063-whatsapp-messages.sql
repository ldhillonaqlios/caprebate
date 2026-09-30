-- ===========================================================================
-- 063 — WHATSAPP WITH EACH CLIENT, FROM THE BACK OFFICE
-- 30 September 2026. src/connectors/whatsapp.ts, src/web/whatsapp.ts.
--
-- Lakhbir: "the ability to use whats app directly using our back end portal the idea is each client when we view back
-- end has full communication via email or whats app".
--
-- One row per WhatsApp message, either way. OUT: written by a member of staff to one of the company's contacts, sent
-- through Meta's WhatsApp Cloud API; its status follows what Meta reports (sent, delivered, read, failed). IN: received
-- by the webhook; filed under the company whose ONE contact has that number, or left unfiled (business_id NULL) for
-- Admin or Sales to file by hand. The words are never edited; only the status moves. How long they are kept is the
-- data protection officer's to set (as for the portal messages, src/web/message-retention.ts); nothing here deletes.
-- ===========================================================================

CREATE TABLE whatsapp_messages (
  id           TEXT PRIMARY KEY,
  business_id  TEXT REFERENCES businesses(id),
  contact_id   TEXT REFERENCES contacts(id),
  direction    TEXT NOT NULL CHECK (direction IN ('IN','OUT')),
  -- The international number without "+", as WhatsApp writes it: 447700900123.
  phone        TEXT NOT NULL CHECK (phone GLOB '[1-9]*' AND phone NOT GLOB '*[^0-9]*' AND length(phone) BETWEEN 8 AND 15),
  kind         TEXT NOT NULL CHECK (kind IN ('text','opening','media','other')),
  body         TEXT NOT NULL,
  -- Meta's id for the message (wamid...). NULL only for one that was never sent.
  wa_id        TEXT UNIQUE,
  status       TEXT NOT NULL CHECK (status IN ('RECEIVED','SENT','DELIVERED','READ','FAILED','NOT_SENT')),
  error        TEXT,
  written_by   TEXT REFERENCES users(id),
  filed_by     TEXT REFERENCES users(id),
  created_at   TEXT NOT NULL,
  status_at    TEXT,
  CHECK (direction = 'IN' OR written_by IS NOT NULL),
  CHECK (direction = 'OUT' OR status = 'RECEIVED'),
  CHECK (direction = 'IN' OR status <> 'RECEIVED')
) STRICT;

CREATE INDEX whatsapp_messages_business_idx ON whatsapp_messages(business_id, created_at);
CREATE INDEX whatsapp_messages_phone_idx ON whatsapp_messages(phone, direction, created_at);

CREATE TRIGGER whatsapp_messages_words_are_kept BEFORE UPDATE OF id, direction, phone, kind, body, written_by, created_at ON whatsapp_messages
BEGIN SELECT RAISE(ABORT, 'a WhatsApp message is never edited: only its status moves, and an unfiled one is filed once'); END;

CREATE TRIGGER whatsapp_messages_filed_once BEFORE UPDATE OF business_id, contact_id, filed_by ON whatsapp_messages
WHEN OLD.business_id IS NOT NULL
BEGIN SELECT RAISE(ABORT, 'a WhatsApp message already under a company stays there'); END;
