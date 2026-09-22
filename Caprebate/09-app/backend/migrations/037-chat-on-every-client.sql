-- ===========================================================================
-- 037 — CHAT ON EVERY CLIENT: A TEAM-ONLY THREAD AND A THREAD WITH THE CLIENT.
--                                                   Phase 142, 22 September 2026
--
-- WHY. Lakhbir, 18 September 2026: "There needs to be a chat feature internally
-- and externally for all clients. Clients should not see internal chats, however
-- they should be able to send and receive communication, also with the ability to
-- upload documentation which automatically saves within their client portfolio."
--
-- TWO THREADS PER COMPANY, IN TWO DIFFERENT TABLES. THAT IS THE CONTROL.
--
--   internal_notes    THE "TEAM ONLY" THREAD. It already was a table of its own that
--                     no client rule reaches (`internal_note.read` is Admin and Sales
--                     only, src/authz.ts). Every note ever written is already in it,
--                     with its date, its author and the claim it was about — so the
--                     notes are the thread's first messages, and NOTHING IS COPIED.
--                     A copy would be two stores of the same personal data, with two
--                     retention clocks. What changes here: a note is now never edited
--                     and never deleted (nothing ever did either — checked in code on
--                     22 Sep 2026 — so no row moves).
--
--   client_messages   THE "WITH THE CLIENT" THREAD — the portal's "Messages". The
--                     only thread the portal's code reads. It has no column that can
--                     point at a note, and no note can point at it.
--
-- AND FOUR MORE.
--
--   client_message_files  a file sent with a message. The file itself is an ordinary
--                     document, received through the upload path every file takes; this
--                     row only says which message brought it.
--   thread_reads      when a person last read a thread — for the unread numbers. A new
--                     row each time; the latest is the answer.
--   inbound_email     a reply that arrived at contactus@caprebate.com (Phase 141 B48),
--                     read by the read-only mailbox reader. Filed onto the company's
--                     "With the client" thread only when it answers an email we sent
--                     (its In-Reply-To or References names our Message-ID) AND it comes
--                     from one of that company's contacts. Anything else waits in a staff
--                     queue. Never filed by the sender's address alone.
--   inbound_email_files   which part of an emailed reply was a file, and once a member of
--                     staff has said what it is, the document it became. A file is never
--                     guessed into a type: the upload path reads each kind of document
--                     with its own reader, so "what is it?" is always a person's answer.
--   inbound_email_filings a queued reply that a member of staff filed under a company.
--
-- EVERY TABLE HERE ONLY EVER GROWS.
-- ===========================================================================

-- --- the team thread: the notes, now never edited and never deleted ----------
CREATE TRIGGER internal_notes_never_edited BEFORE UPDATE OF body, author_id, created_at ON internal_notes
BEGIN SELECT RAISE(ABORT, 'a team message is never edited'); END;

CREATE TRIGGER internal_notes_never_deleted BEFORE DELETE ON internal_notes
BEGIN SELECT RAISE(ABORT, 'a team message is never deleted'); END;

CREATE INDEX internal_notes_business_idx ON internal_notes(business_id, created_at);

-- --- the thread with the client ---------------------------------------------
CREATE TABLE client_messages (
  id           TEXT PRIMARY KEY,
  business_id  TEXT NOT NULL REFERENCES businesses(id),
  claim_id     TEXT REFERENCES claims(id),
  -- FROM_CLIENT: the client wrote it, in the portal or by email. TO_CLIENT: we did.
  direction    TEXT NOT NULL CHECK (direction IN ('FROM_CLIENT','TO_CLIENT')),
  source       TEXT NOT NULL CHECK (source IN ('PORTAL','STAFF','EMAIL')),
  -- The login that wrote it. NULL only for an emailed reply, which has a contact instead.
  author_id    TEXT REFERENCES users(id),
  contact_id   TEXT REFERENCES contacts(id),
  body         TEXT NOT NULL CHECK (length(trim(body)) BETWEEN 1 AND 8000),
  created_at   TEXT NOT NULL,
  CHECK (author_id IS NOT NULL OR source = 'EMAIL'),
  CHECK (source <> 'STAFF' OR direction = 'TO_CLIENT'),
  CHECK (source = 'STAFF' OR direction = 'FROM_CLIENT')
) STRICT;

CREATE INDEX client_messages_business_idx ON client_messages(business_id, created_at);

CREATE TRIGGER client_messages_claim_is_the_companys BEFORE INSERT ON client_messages
WHEN NEW.claim_id IS NOT NULL
 AND NOT EXISTS (SELECT 1 FROM claims c WHERE c.id = NEW.claim_id AND c.business_id = NEW.business_id)
BEGIN SELECT RAISE(ABORT, 'a message is tagged only to one of its own company''s claims'); END;

CREATE TRIGGER client_messages_contact_is_the_companys BEFORE INSERT ON client_messages
WHEN NEW.contact_id IS NOT NULL
 AND NOT EXISTS (SELECT 1 FROM contacts c WHERE c.id = NEW.contact_id AND c.business_id = NEW.business_id)
BEGIN SELECT RAISE(ABORT, 'a message comes only from one of its own company''s contacts'); END;

-- A client login writes only on its own company's thread.
CREATE TRIGGER client_messages_client_writes_own BEFORE INSERT ON client_messages
WHEN NEW.author_id IS NOT NULL
 AND EXISTS (SELECT 1 FROM users u WHERE u.id = NEW.author_id AND u.role = 'CLIENT' AND u.business_id IS NOT NEW.business_id)
BEGIN SELECT RAISE(ABORT, 'a client writes only on their own company''s thread'); END;

CREATE TRIGGER client_messages_never_edited BEFORE UPDATE ON client_messages
BEGIN SELECT RAISE(ABORT, 'a message is never edited'); END;

CREATE TRIGGER client_messages_never_deleted BEFORE DELETE ON client_messages
BEGIN SELECT RAISE(ABORT, 'a message is never deleted'); END;

-- --- a file sent with a message ---------------------------------------------
CREATE TABLE client_message_files (
  id                   TEXT PRIMARY KEY,
  message_id           TEXT NOT NULL REFERENCES client_messages(id),
  logical_document_id  TEXT NOT NULL REFERENCES logical_documents(id),
  linked_at            TEXT NOT NULL
) STRICT;

CREATE INDEX client_message_files_message_idx ON client_message_files(message_id);
CREATE UNIQUE INDEX client_message_files_document_uq ON client_message_files(logical_document_id);

CREATE TRIGGER client_message_files_companys_own BEFORE INSERT ON client_message_files
WHEN NOT EXISTS (
  SELECT 1 FROM client_messages m JOIN logical_documents l ON l.id = NEW.logical_document_id
   WHERE m.id = NEW.message_id AND l.business_id = m.business_id)
BEGIN SELECT RAISE(ABORT, 'a message carries only its own company''s files'); END;

CREATE TRIGGER client_message_files_no_update BEFORE UPDATE ON client_message_files
BEGIN SELECT RAISE(ABORT, 'what a message carried is never edited'); END;

CREATE TRIGGER client_message_files_no_delete BEFORE DELETE ON client_message_files
BEGIN SELECT RAISE(ABORT, 'what a message carried is never deleted'); END;

-- --- when a person last read a thread ---------------------------------------
CREATE TABLE thread_reads (
  id           TEXT PRIMARY KEY,
  user_id      TEXT NOT NULL REFERENCES users(id),
  business_id  TEXT NOT NULL REFERENCES businesses(id),
  thread       TEXT NOT NULL CHECK (thread IN ('TEAM','CLIENT')),
  read_at      TEXT NOT NULL
) STRICT;

CREATE INDEX thread_reads_idx ON thread_reads(user_id, business_id, thread, read_at);

CREATE TRIGGER thread_reads_no_update BEFORE UPDATE ON thread_reads
BEGIN SELECT RAISE(ABORT, 'a read is never edited: a new read is a new row'); END;

CREATE TRIGGER thread_reads_no_delete BEFORE DELETE ON thread_reads
BEGIN SELECT RAISE(ABORT, 'a read is never deleted'); END;

-- --- replies to contactus@caprebate.com -------------------------------------
CREATE TABLE inbound_email (
  id                 TEXT PRIMARY KEY,
  received_at        TEXT NOT NULL,
  -- The mailbox's own number for the message, so one message is read in once.
  mailbox_uid        TEXT NOT NULL UNIQUE,
  message_id         TEXT,
  from_address       TEXT NOT NULL CHECK (length(from_address) <= 254),
  subject            TEXT NOT NULL CHECK (length(subject) <= 998),
  -- The text part only. No HTML is kept, and nothing of it is ever drawn as HTML.
  text_body          TEXT NOT NULL CHECK (length(text_body) <= 20000),
  -- The email of ours it answers, found by Message-ID. NULL when none matched.
  matched_outbox_id  TEXT REFERENCES outbox(id),
  business_id        TEXT REFERENCES businesses(id),
  claim_id           TEXT REFERENCES claims(id),
  contact_id         TEXT REFERENCES contacts(id),
  outcome            TEXT NOT NULL CHECK (outcome IN ('FILED','QUEUED','DO_NOT_CONTACT')),
  queue_reason       TEXT CHECK (queue_reason IS NULL OR queue_reason IN ('NO_MATCH','NOT_A_CONTACT')),
  client_message_id  TEXT REFERENCES client_messages(id),
  CHECK ((outcome = 'QUEUED') = (queue_reason IS NOT NULL)),
  CHECK (outcome = 'QUEUED' OR (business_id IS NOT NULL AND client_message_id IS NOT NULL))
) STRICT;

CREATE INDEX inbound_email_outcome_idx ON inbound_email(outcome, received_at);

CREATE TRIGGER inbound_email_never_edited BEFORE UPDATE ON inbound_email
BEGIN SELECT RAISE(ABORT, 'an email we received is never edited'); END;

CREATE TRIGGER inbound_email_never_deleted BEFORE DELETE ON inbound_email
BEGIN SELECT RAISE(ABORT, 'an email we received is never deleted'); END;

CREATE TABLE inbound_email_files (
  id                   TEXT PRIMARY KEY,
  inbound_email_id     TEXT NOT NULL REFERENCES inbound_email(id),
  -- Which file in the email, counting from 1. No file NAME is kept: a name can be a person's (N2).
  part_no              INTEGER NOT NULL CHECK (part_no >= 1),
  content_type         TEXT NOT NULL CHECK (length(content_type) <= 120),
  size_bytes           INTEGER NOT NULL CHECK (size_bytes >= 0),
  UNIQUE (inbound_email_id, part_no)
) STRICT;

CREATE TRIGGER inbound_email_files_no_update BEFORE UPDATE ON inbound_email_files
BEGIN SELECT RAISE(ABORT, 'an email''s files are never edited'); END;

CREATE TRIGGER inbound_email_files_no_delete BEFORE DELETE ON inbound_email_files
BEGIN SELECT RAISE(ABORT, 'an email''s files are never deleted'); END;

-- A file of an emailed reply, once staff said what it is and it went through the upload path.
CREATE TABLE inbound_email_file_saves (
  id                   TEXT PRIMARY KEY,
  inbound_email_file_id TEXT NOT NULL UNIQUE REFERENCES inbound_email_files(id),
  logical_document_id  TEXT NOT NULL REFERENCES logical_documents(id),
  saved_by             TEXT NOT NULL REFERENCES users(id),
  saved_at             TEXT NOT NULL
) STRICT;

CREATE TRIGGER inbound_email_file_saves_no_update BEFORE UPDATE ON inbound_email_file_saves
BEGIN SELECT RAISE(ABORT, 'a saved file is never edited'); END;

CREATE TRIGGER inbound_email_file_saves_no_delete BEFORE DELETE ON inbound_email_file_saves
BEGIN SELECT RAISE(ABORT, 'a saved file is never deleted'); END;

CREATE TABLE inbound_email_filings (
  id                 TEXT PRIMARY KEY,
  inbound_email_id   TEXT NOT NULL UNIQUE REFERENCES inbound_email(id),
  business_id        TEXT NOT NULL REFERENCES businesses(id),
  claim_id           TEXT REFERENCES claims(id),
  client_message_id  TEXT NOT NULL REFERENCES client_messages(id),
  filed_by           TEXT NOT NULL REFERENCES users(id),
  filed_at           TEXT NOT NULL
) STRICT;

CREATE TRIGGER inbound_email_filings_only_queued BEFORE INSERT ON inbound_email_filings
WHEN NOT EXISTS (SELECT 1 FROM inbound_email e WHERE e.id = NEW.inbound_email_id AND e.outcome = 'QUEUED')
BEGIN SELECT RAISE(ABORT, 'only a reply waiting in the queue is filed by hand'); END;

CREATE TRIGGER inbound_email_filings_no_update BEFORE UPDATE ON inbound_email_filings
BEGIN SELECT RAISE(ABORT, 'a filing is never edited'); END;

CREATE TRIGGER inbound_email_filings_no_delete BEFORE DELETE ON inbound_email_filings
BEGIN SELECT RAISE(ABORT, 'a filing is never deleted'); END;
