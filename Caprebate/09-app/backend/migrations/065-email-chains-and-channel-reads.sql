-- ===========================================================================
-- 065 — EMAIL CHAINS, AND WHAT EACH PERSON HAS READ ON EACH CHANNEL
-- 1 October 2026. src/web/email-chains.ts, src/web/free-email-pages.ts, src/web/whatsapp-page.ts.
--
-- Lakhbir: "the right hand side should show the chain of emails allowing a user to click on reply making them apart of
-- the chain … if no current email chain (on the right) is selected then it fires as a new email" and "when we receive
-- emails, there needs to be a red dot on chat, signalling there is a notification for that client".
--
-- A REPLY JOINS ITS CHAIN. An email of ours carries the chain it belongs to (`thread_key`: the first email's id, or the
-- id of the client's email that began it), and the Message-IDs it answers (`in_reply_to`, `references_ids`), which go
-- out as the In-Reply-To and References headers so the client's mail program keeps it in the same conversation — and
-- their answer comes back matched to it. A new email has none of the three. Like every word of an email, never edited.
--
-- `channel_reads`: when a person last read a company's emails or its WhatsApp, for the red dot on Chat. The portal
-- thread keeps its own (`thread_reads`, migration 037). A new row each time; the latest is the answer.
-- ===========================================================================

ALTER TABLE outbox ADD COLUMN thread_key TEXT;
ALTER TABLE outbox ADD COLUMN in_reply_to TEXT;
ALTER TABLE outbox ADD COLUMN references_ids TEXT;

DROP TRIGGER outbox_content_never_edited;

CREATE TRIGGER outbox_content_never_edited BEFORE UPDATE OF
  id, created_at, to_email, subject, kind, business_id, from_header, reply_to, claim_id, lead_id, contact_id,
  written_by, send_requested, thread_key, in_reply_to, references_ids ON outbox
BEGIN SELECT RAISE(ABORT, 'what an email said, and who it went to, is never edited'); END;

CREATE INDEX outbox_thread_idx ON outbox(business_id, thread_key);

CREATE TABLE channel_reads (
  id           TEXT PRIMARY KEY,
  user_id      TEXT NOT NULL REFERENCES users(id),
  business_id  TEXT NOT NULL REFERENCES businesses(id),
  channel      TEXT NOT NULL CHECK (channel IN ('EMAIL','WHATSAPP')),
  read_at      TEXT NOT NULL
) STRICT;

CREATE INDEX channel_reads_idx ON channel_reads(user_id, business_id, channel, read_at);

CREATE TRIGGER channel_reads_no_update BEFORE UPDATE ON channel_reads
BEGIN SELECT RAISE(ABORT, 'a read is never edited: a new read is a new row'); END;

CREATE TRIGGER channel_reads_no_delete BEFORE DELETE ON channel_reads
BEGIN SELECT RAISE(ABORT, 'a read is never deleted'); END;
