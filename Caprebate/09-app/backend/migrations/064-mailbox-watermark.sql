-- ===========================================================================
-- 064 — WHERE READING THE contact@ INBOX STARTS
-- 30 September 2026. src/web/inbound-email.ts (readMailbox).
--
-- Reading replies was switched on for testing today. The inbox already held mail (23 messages): a first read from the
-- beginning would have brought every one of them into the site as "replies to sort", with the words of people who never
-- wrote to this system. So the first read only notes the inbox's highest message number here, and reads nothing; every
-- read after it takes only what arrived since. One row, never more. The number only moves forward.
-- ===========================================================================

CREATE TABLE mailbox_watermark (
  id      INTEGER PRIMARY KEY CHECK (id = 1),
  uid     INTEGER NOT NULL CHECK (uid >= 0),
  set_at  TEXT NOT NULL
) STRICT;

CREATE TRIGGER mailbox_watermark_forward_only BEFORE UPDATE OF uid ON mailbox_watermark
WHEN NEW.uid < OLD.uid
BEGIN SELECT RAISE(ABORT, 'where reading starts only moves forward'); END;
