-- ===========================================================================
-- 068 — A REPLY SET ASIDE BEFORE A RULE EXISTED, FILED BY THAT RULE
-- 1 October 2026. src/web/inbound-email.ts (fileByRule).
--
-- Lakhbir's replies from his own iCloud address, to emails the test website sent to that address, were read before the
-- rule "a reply from the very address our email went to is filed" went live, and so waited in "Email replies to sort".
-- A message is read once, so the new rule never looked at them again. Now every read also files a reply waiting there
-- that answers one of our emails from the address it went to, or from one of that company's contacts. Such a filing has
-- no person behind it: it records the rule instead. A filing by hand still records who. Rebuilt with the same columns,
-- rows and triggers (migration 037, and 038's delete rule for the clean-up job) and one more column, `rule`.
-- ===========================================================================

CREATE TABLE inbound_email_filings_068 (
  id                 TEXT PRIMARY KEY,
  inbound_email_id   TEXT NOT NULL UNIQUE REFERENCES inbound_email(id),
  business_id        TEXT NOT NULL REFERENCES businesses(id),
  claim_id           TEXT REFERENCES claims(id),
  client_message_id  TEXT NOT NULL REFERENCES client_messages(id),
  filed_by           TEXT REFERENCES users(id),
  -- Set when no person filed it: the rule that did.
  rule               TEXT CHECK (rule IS NULL OR rule = 'ANSWERS_OUR_EMAIL'),
  filed_at           TEXT NOT NULL,
  CHECK ((filed_by IS NULL) = (rule IS NOT NULL))
) STRICT;

INSERT INTO inbound_email_filings_068 (id, inbound_email_id, business_id, claim_id, client_message_id, filed_by, rule, filed_at)
  SELECT id, inbound_email_id, business_id, claim_id, client_message_id, filed_by, NULL, filed_at FROM inbound_email_filings;

DROP TABLE inbound_email_filings;
ALTER TABLE inbound_email_filings_068 RENAME TO inbound_email_filings;

CREATE TRIGGER inbound_email_filings_only_queued BEFORE INSERT ON inbound_email_filings
WHEN NOT EXISTS (SELECT 1 FROM inbound_email e WHERE e.id = NEW.inbound_email_id AND e.outcome = 'QUEUED')
BEGIN SELECT RAISE(ABORT, 'only a reply waiting in the queue is filed by hand'); END;

CREATE TRIGGER inbound_email_filings_no_update BEFORE UPDATE ON inbound_email_filings
BEGIN SELECT RAISE(ABORT, 'a filing is never edited'); END;

CREATE TRIGGER inbound_email_filings_no_delete BEFORE DELETE ON inbound_email_filings
WHEN NOT EXISTS (SELECT 1 FROM deletion_log l
                  WHERE l.record_kind = 'INBOUND_EMAIL' AND l.record_id = OLD.inbound_email_id AND l.basis_rule = 'MSG-RETENTION')
BEGIN SELECT RAISE(ABORT, 'a filing is never deleted, except with its email by the clean-up job'); END;
