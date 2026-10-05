-- PHASE 156c, 5 October 2026: WHATSAPP CHATS EXPORTED ON THE PHONE AND ADDED BY HAND (src/web/whatsapp-import.ts).
-- Lakhbir chose a manual upload ("go with manual upload, keep photos"). Each upload is checked by a person before
-- anything is saved; the messages it saves go into whatsapp_messages like any other, and each is tied to its upload
-- here, so the page can say where it came from and a newer copy of the same chat adds only what is not there yet.

CREATE TABLE whatsapp_imports (
  id           TEXT PRIMARY KEY,
  business_id  TEXT NOT NULL REFERENCES businesses(id),
  contact_id   TEXT NOT NULL REFERENCES contacts(id),
  -- The contact's number, as whatsapp_messages keeps it.
  phone        TEXT NOT NULL CHECK (phone GLOB '[1-9]*' AND phone NOT GLOB '*[^0-9]*' AND length(phone) BETWEEN 8 AND 15),
  status       TEXT NOT NULL CHECK (status IN ('CHECKING','SAVED','CANCELLED')),
  filename     TEXT NOT NULL CHECK (length(filename) BETWEEN 1 AND 200),
  layout       TEXT CHECK (layout IS NULL OR layout IN ('iphone','android')),
  -- The export's text, sealed in the file store. The whole .zip too, when it was small enough to come through the
  -- website in one piece; otherwise the browser sends the chosen files one at a time.
  chat_key     TEXT NOT NULL,
  zip_key      TEXT,
  -- JSON: every file name in the export, for matching the files sent later.
  file_names   TEXT NOT NULL,
  uploaded_by  TEXT NOT NULL REFERENCES users(id),
  uploaded_at  TEXT NOT NULL,
  us_name      TEXT,
  from_date    TEXT,
  saved_by     TEXT REFERENCES users(id),
  saved_at     TEXT,
  added        INTEGER CHECK (added IS NULL OR added >= 0),
  CHECK ((status = 'SAVED') = (saved_at IS NOT NULL)),
  CHECK ((saved_at IS NULL) = (saved_by IS NULL))
) STRICT;

CREATE INDEX whatsapp_imports_business_idx ON whatsapp_imports(business_id, uploaded_at);

CREATE TABLE whatsapp_import_lines (
  message_id   TEXT PRIMARY KEY REFERENCES whatsapp_messages(id),
  import_id    TEXT NOT NULL REFERENCES whatsapp_imports(id),
  contact_id   TEXT NOT NULL REFERENCES contacts(id),
  -- The name the phone wrote for the sender, and the file's name in the export where the message is a file.
  sender       TEXT NOT NULL,
  attachment   TEXT,
  -- One message is saved once: the contact, the moment, the direction and the words.
  fingerprint  TEXT NOT NULL UNIQUE
) STRICT;

CREATE INDEX whatsapp_import_lines_import_idx ON whatsapp_import_lines(import_id);
