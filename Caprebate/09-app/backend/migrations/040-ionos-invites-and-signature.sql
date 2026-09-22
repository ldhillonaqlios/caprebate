-- ===========================================================================
-- 040 — IONOS: BOUNCES, CALENDAR INVITES, AND THE BUILT-IN SIGNATURE.   Phase 146f, 22 September 2026
--
-- Lakhbir decided on 22 September 2026: email and calendar invitations through IONOS, and the engagement letter
-- signed inside the application rather than through a bought service. Everything here is built and switched off —
-- EMAIL_SENDING (src/stubs/email-provider.ts) and ENGAGEMENT_SIGNING (src/web/signing.ts) are both false.
--
--   outbox_inline_files     a file an email carries that is not one of the company's documents: a calendar
--                           invitation (.ics) or the signed copy of the engagement letter (.pdf). Written once, with
--                           its email, and never edited or deleted — like the email itself.
--   email_bounces           an email the mail server refused to deliver, or reported later that it could not. HARD is
--                           permanent (the address does not exist); SOFT is for now (a full mailbox). Never edited.
--   email_suppressions      an address that bounced HARD. Nothing more is sent to it until a member of staff lifts it,
--                           which is a new row, never an edit. The address is kept because it is the thing refused.
--   inbound_bounce_notices  a delivery report the mailbox reader found (multipart/report, delivery-status). It is not
--                           a reply and is never filed on a company's chat. Keyed on the mailbox's own number, so a
--                           report is read in once.
--   engagement_signatures   the signature record: who typed their name, the role they gave, that they confirmed they
--                           may sign for the business, when, from which address and session, the SHA-256 of the exact
--                           letter text they were shown, and the signed PDF. assertSignedEngagement reads it.
-- ===========================================================================

CREATE TABLE outbox_inline_files (
  id            TEXT PRIMARY KEY,
  outbox_id     TEXT NOT NULL REFERENCES outbox(id),
  part_no       INTEGER NOT NULL CHECK (part_no >= 1),
  filename      TEXT NOT NULL CHECK (length(filename) BETWEEN 1 AND 120),
  content_type  TEXT NOT NULL CHECK (content_type IN ('text/calendar; method=REQUEST; charset=utf-8',
                                                     'text/calendar; method=CANCEL; charset=utf-8',
                                                     'application/pdf')),
  bytes         BLOB NOT NULL,
  sha256        TEXT NOT NULL CHECK (length(sha256) = 64),
  UNIQUE (outbox_id, part_no)
) STRICT;

CREATE INDEX outbox_inline_files_outbox_idx ON outbox_inline_files(outbox_id);

CREATE TRIGGER outbox_inline_files_no_update BEFORE UPDATE ON outbox_inline_files
BEGIN SELECT RAISE(ABORT, 'what an email carried is never edited'); END;

CREATE TRIGGER outbox_inline_files_no_delete BEFORE DELETE ON outbox_inline_files
BEGIN SELECT RAISE(ABORT, 'what an email carried is never deleted'); END;

CREATE TABLE email_bounces (
  id                 TEXT PRIMARY KEY,
  outbox_id          TEXT NOT NULL REFERENCES outbox(id),
  kind               TEXT NOT NULL CHECK (kind IN ('HARD','SOFT')),
  -- SMTP: the server refused it while we were sending. REPORT: a delivery report arrived in the mailbox later.
  source             TEXT NOT NULL CHECK (source IN ('SMTP','REPORT')),
  -- The server's code: an SMTP reply code ("550") or an enhanced status ("5.1.1"). Never the server's words.
  status             TEXT NOT NULL CHECK (length(status) BETWEEN 3 AND 12),
  at                 TEXT NOT NULL
) STRICT;

CREATE INDEX email_bounces_outbox_idx ON email_bounces(outbox_id);

CREATE TRIGGER email_bounces_no_update BEFORE UPDATE ON email_bounces
BEGIN SELECT RAISE(ABORT, 'a bounce is a record and is never edited'); END;

CREATE TRIGGER email_bounces_no_delete BEFORE DELETE ON email_bounces
BEGIN SELECT RAISE(ABORT, 'a bounce is a record and is never deleted'); END;

CREATE TABLE email_suppressions (
  id                 TEXT PRIMARY KEY,
  address_canonical  TEXT NOT NULL CHECK (address_canonical = lower(trim(address_canonical)) AND address_canonical LIKE '%_@_%'),
  -- BOUNCED: set by a HARD bounce. LIFTED: a member of staff said the address works again.
  state              TEXT NOT NULL CHECK (state IN ('BOUNCED','LIFTED')),
  bounce_id          TEXT REFERENCES email_bounces(id),
  set_by             TEXT REFERENCES users(id),
  at                 TEXT NOT NULL,
  CHECK ((state = 'BOUNCED') = (bounce_id IS NOT NULL)),
  CHECK (state = 'BOUNCED' OR set_by IS NOT NULL)
) STRICT;

CREATE INDEX email_suppressions_address_idx ON email_suppressions(address_canonical, at);

CREATE TRIGGER email_suppressions_no_update BEFORE UPDATE ON email_suppressions
BEGIN SELECT RAISE(ABORT, 'a suppression is changed by a new row, never edited'); END;

CREATE TRIGGER email_suppressions_no_delete BEFORE DELETE ON email_suppressions
BEGIN SELECT RAISE(ABORT, 'a suppression is never deleted'); END;

CREATE TABLE inbound_bounce_notices (
  id                 TEXT PRIMARY KEY,
  mailbox_uid        TEXT NOT NULL UNIQUE,
  received_at        TEXT NOT NULL,
  -- The email of ours it reports on, found by the Message-ID we stamped. NULL when the report names none of ours.
  matched_outbox_id  TEXT REFERENCES outbox(id),
  bounce_id          TEXT REFERENCES email_bounces(id),
  CHECK (bounce_id IS NULL OR matched_outbox_id IS NOT NULL)
) STRICT;

CREATE TRIGGER inbound_bounce_notices_no_update BEFORE UPDATE ON inbound_bounce_notices
BEGIN SELECT RAISE(ABORT, 'a delivery report is read in once and never edited'); END;

CREATE TABLE engagement_signatures (
  id                 TEXT PRIMARY KEY,
  engagement_id      TEXT NOT NULL UNIQUE REFERENCES engagements(id),
  business_id        TEXT NOT NULL REFERENCES businesses(id),
  -- PORTAL: the client signed in the portal. SEED: invented demonstration data written by the seed or a test fixture,
  -- never by a running application (the seed refuses to run without CAPREBATE_ALLOW_SEED).
  origin             TEXT NOT NULL CHECK (origin IN ('PORTAL','SEED')),
  -- The client login that signed. The session is its row id, never the cookie's token.
  user_id            TEXT REFERENCES users(id),
  session_id         TEXT REFERENCES sessions(id),
  signer_name        TEXT NOT NULL CHECK (length(signer_name) BETWEEN 2 AND 200),
  signer_role        TEXT NOT NULL CHECK (length(signer_role) BETWEEN 2 AND 120),
  -- The business as it was named on the letter they signed, not as it may be renamed later.
  business_name      TEXT NOT NULL CHECK (length(business_name) BETWEEN 1 AND 300),
  authority_confirmed INTEGER NOT NULL CHECK (authority_confirmed = 1),
  signed_at          TEXT NOT NULL,
  ip                 TEXT NOT NULL CHECK (length(ip) BETWEEN 2 AND 64),
  -- The exact text they were shown, and its SHA-256. The letter file can change; this does not.
  letter_text        TEXT NOT NULL,
  letter_sha256      TEXT NOT NULL CHECK (length(letter_sha256) = 64),
  pdf                BLOB NOT NULL,
  pdf_sha256         TEXT NOT NULL CHECK (length(pdf_sha256) = 64),
  -- SHA-256 over every field above in a fixed order. The audit chain's ENGAGEMENT_SIGNED row carries it.
  record_sha256      TEXT NOT NULL UNIQUE CHECK (length(record_sha256) = 64),
  CHECK (origin = 'SEED' OR (user_id IS NOT NULL AND session_id IS NOT NULL))
) STRICT;

CREATE TRIGGER engagement_signatures_no_update BEFORE UPDATE ON engagement_signatures
BEGIN SELECT RAISE(ABORT, 'a signature is never edited'); END;

CREATE TRIGGER engagement_signatures_no_delete BEFORE DELETE ON engagement_signatures
BEGIN SELECT RAISE(ABORT, 'a signature is never deleted'); END;
