-- ===========================================================================
-- 036 — FREE-TYPED EMAIL, FROM ONE SENDER, ON THE COMPANY'S TIMELINE.
--                                                   Phase 141, 21 September 2026
--
-- WHY. Lakhbir, 18 September 2026: "When on a client page there needs to be the
-- ability to free-type emails, which should come from contactus@caprebate.com."
--
-- FOUR THINGS.
--
--   email_sender     WHO EVERY EMAIL COMES FROM, AS ONE SETTING. It only ever
--                    grows: the current sender is the latest row. The first row
--                    is written here — "Cap Rebate", contactus@caprebate.com for
--                    both From and Reply-To — and Admin changes it on the admin
--                    settings screen. No address is written in code.
--
--   outbox.*         what a free-typed email needs the outbox to remember: the
--                    From and Reply-To it was written under (stamped on EVERY
--                    row, whatever wrote it), the claim it was tagged to, the lead
--                    it was written from, the contact it went to, who wrote it,
--                    and whether sending was on when it was saved.
--                      send_requested   1 only when sending was ON at the moment
--                                       the row was written. A row saved while
--                                       sending was off stays 0 for ever, so the
--                                       day sending goes on nothing saved before
--                                       it goes out by surprise.
--                      provider_ref     the provider's own id for a sent message
--                      last_error       why the last try to send it failed
--
--   outbox_attachments  the company's files an email carries. A file is named by
--                    its document and the version kept; the bytes are opened only
--                    when it is sent, and only if the original is still kept.
--
--   the outbox never edited. What an email said, who it went to and who it came
--   from are never changed once written. Only the four sending columns move,
--   and a sent time, once written, is never changed.
-- ===========================================================================

CREATE TABLE email_sender (
  id            TEXT PRIMARY KEY,
  display_name  TEXT NOT NULL CHECK (length(display_name) BETWEEN 1 AND 80),
  address       TEXT NOT NULL CHECK (address LIKE '%_@_%._%' AND length(address) <= 254),
  reply_to      TEXT NOT NULL CHECK (reply_to LIKE '%_@_%._%' AND length(reply_to) <= 254),
  -- NULL only on the first row, which this migration writes.
  set_by        TEXT REFERENCES users(id),
  set_at        TEXT NOT NULL
) STRICT;

CREATE TRIGGER email_sender_no_update BEFORE UPDATE ON email_sender
BEGIN SELECT RAISE(ABORT, 'who emails come from is never edited: a change is a new row'); END;

CREATE TRIGGER email_sender_no_delete BEFORE DELETE ON email_sender
BEGIN SELECT RAISE(ABORT, 'who emails come from is never deleted'); END;

INSERT INTO email_sender (id, display_name, address, reply_to, set_by, set_at)
VALUES ('sender-initial', 'Cap Rebate', 'contactus@caprebate.com', 'contactus@caprebate.com', NULL, '2026-09-21T00:00:00.000Z');

ALTER TABLE outbox ADD COLUMN from_header TEXT;
ALTER TABLE outbox ADD COLUMN reply_to TEXT;
ALTER TABLE outbox ADD COLUMN claim_id TEXT REFERENCES claims(id);
ALTER TABLE outbox ADD COLUMN lead_id TEXT REFERENCES leads(id);
ALTER TABLE outbox ADD COLUMN contact_id TEXT REFERENCES contacts(id);
ALTER TABLE outbox ADD COLUMN written_by TEXT REFERENCES users(id);
ALTER TABLE outbox ADD COLUMN send_requested INTEGER NOT NULL DEFAULT 0 CHECK (send_requested IN (0,1));
ALTER TABLE outbox ADD COLUMN provider_ref TEXT;
ALTER TABLE outbox ADD COLUMN last_error TEXT;

CREATE INDEX outbox_business_idx ON outbox(business_id, created_at);
CREATE INDEX outbox_lead_idx ON outbox(lead_id, created_at);

-- A claim an email is tagged to is one of the email's own company's claims.
CREATE TRIGGER outbox_claim_is_the_companys BEFORE INSERT ON outbox
WHEN NEW.claim_id IS NOT NULL
 AND NOT EXISTS (SELECT 1 FROM claims c WHERE c.id = NEW.claim_id AND c.business_id IS NEW.business_id)
BEGIN SELECT RAISE(ABORT, 'an email is tagged only to one of its own company''s claims'); END;

CREATE TRIGGER outbox_content_never_edited BEFORE UPDATE OF
  id, created_at, to_email, subject, body, kind, business_id, from_header, reply_to, claim_id, lead_id, contact_id,
  written_by, send_requested ON outbox
BEGIN SELECT RAISE(ABORT, 'what an email said, and who it went to, is never edited'); END;

CREATE TRIGGER outbox_sent_once BEFORE UPDATE OF sent_at ON outbox
WHEN OLD.sent_at IS NOT NULL
BEGIN SELECT RAISE(ABORT, 'a sent email stays sent'); END;

CREATE TRIGGER outbox_never_deleted BEFORE DELETE ON outbox
BEGIN SELECT RAISE(ABORT, 'an email is never deleted from the outbox'); END;

CREATE TABLE outbox_attachments (
  id                   TEXT PRIMARY KEY,
  outbox_id            TEXT NOT NULL REFERENCES outbox(id),
  logical_document_id  TEXT NOT NULL REFERENCES logical_documents(id),
  document_id          TEXT NOT NULL REFERENCES documents(id)
) STRICT;

CREATE INDEX outbox_attachments_outbox_idx ON outbox_attachments(outbox_id);

-- A file attached to an email is one of that email's company's own files.
CREATE TRIGGER outbox_attachments_companys_own BEFORE INSERT ON outbox_attachments
WHEN NOT EXISTS (
  SELECT 1 FROM outbox o JOIN logical_documents l ON l.id = NEW.logical_document_id
   WHERE o.id = NEW.outbox_id AND o.business_id IS NOT NULL AND l.business_id = o.business_id)
BEGIN SELECT RAISE(ABORT, 'an email carries only its own company''s files'); END;

CREATE TRIGGER outbox_attachments_no_update BEFORE UPDATE ON outbox_attachments
BEGIN SELECT RAISE(ABORT, 'what an email carried is never edited'); END;

CREATE TRIGGER outbox_attachments_no_delete BEFORE DELETE ON outbox_attachments
BEGIN SELECT RAISE(ABORT, 'what an email carried is never deleted'); END;
