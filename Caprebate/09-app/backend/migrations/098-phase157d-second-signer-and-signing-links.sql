-- ===========================================================================
-- 098 — A SECOND SIGNER, AND SIGNING FROM A LINK IN THE EMAIL             Phase 157d, 6 October 2026
--
-- The rest of Lakhbir's "docusign style" request (Phase 157c built the drawn signature and the certificate).
--
--   engagement_required_signers   who must sign, recorded by staff: one or two of the business's client logins. With
--                                 none recorded, any one client login signs, as before. With two, the letter is signed
--                                 only when both have (a partnership's two partners, a company's two directors).
--   engagement_sign_links         a single-use, time-limited link in the letter email that opens the letter for
--                                 signing without a portal login. Only its SHA-256 is kept, never the link itself.
--                                 Used once; never deleted. What it proves is the email address it was sent to.
--   engagement_signatures         REBUILT: up to two signatures on one letter (signer_seq 1 or 2, one each), and a
--                                 third origin, EMAIL_LINK, signed through a link with no portal session. Version 3
--                                 records (src/web/signing.ts) bind the signer's number and the link as well.
--
-- WHY A REBUILD. engagement_id was UNIQUE (one signature a letter) and the CHECK demanded a session for every portal
-- signature; SQLite widens neither in place. Every row is copied as it is; the never-edited and never-deleted triggers
-- are made again; no other table, trigger, view or index names engagement_signatures (re-derived from migrations 040 to
-- 097 on 6 October 2026). The guard at the foot proves no foreign key broke.
-- ===========================================================================

PRAGMA foreign_keys = OFF;
BEGIN;

CREATE TABLE engagement_required_signers (
  id             TEXT PRIMARY KEY,
  engagement_id  TEXT NOT NULL REFERENCES engagements(id),
  user_id        TEXT NOT NULL REFERENCES users(id),
  seq            INTEGER NOT NULL CHECK (seq IN (1, 2)),
  set_by         TEXT NOT NULL REFERENCES users(id),
  set_at         TEXT NOT NULL,
  UNIQUE (engagement_id, user_id),
  UNIQUE (engagement_id, seq)
) STRICT;

CREATE TABLE engagement_sign_links (
  id             TEXT PRIMARY KEY,
  engagement_id  TEXT NOT NULL REFERENCES engagements(id),
  user_id        TEXT NOT NULL REFERENCES users(id),
  token_sha256   TEXT NOT NULL UNIQUE CHECK (length(token_sha256) = 64 AND token_sha256 NOT GLOB '*[^0-9a-f]*'),
  -- The address the link was emailed to, at that moment: what a signature through it proves.
  sent_to        TEXT NOT NULL CHECK (length(sent_to) BETWEEN 3 AND 320),
  created_by     TEXT REFERENCES users(id),
  created_at     TEXT NOT NULL,
  expires_at     TEXT NOT NULL CHECK (expires_at > created_at),
  used_at        TEXT
) STRICT;

CREATE TRIGGER engagement_sign_links_never_deleted BEFORE DELETE ON engagement_sign_links
BEGIN SELECT RAISE(ABORT, 'a signing link is never deleted: it is the record of what was sent'); END;

CREATE TRIGGER engagement_sign_links_used_once BEFORE UPDATE ON engagement_sign_links
WHEN NOT (OLD.used_at IS NULL AND NEW.used_at IS NOT NULL
          AND NEW.id IS OLD.id AND NEW.engagement_id IS OLD.engagement_id AND NEW.user_id IS OLD.user_id
          AND NEW.token_sha256 IS OLD.token_sha256 AND NEW.sent_to IS OLD.sent_to AND NEW.created_by IS OLD.created_by
          AND NEW.created_at IS OLD.created_at AND NEW.expires_at IS OLD.expires_at)
BEGIN SELECT RAISE(ABORT, 'a signing link is used once, and nothing else about it changes'); END;

CREATE TABLE engagement_signatures_new (
  id                 TEXT PRIMARY KEY,
  engagement_id      TEXT NOT NULL REFERENCES engagements(id),
  business_id        TEXT NOT NULL REFERENCES businesses(id),
  origin             TEXT NOT NULL CHECK (origin IN ('PORTAL','SEED','EMAIL_LINK')),
  user_id            TEXT REFERENCES users(id),
  session_id         TEXT REFERENCES sessions(id),
  signer_name        TEXT NOT NULL CHECK (length(signer_name) BETWEEN 2 AND 200),
  signer_role        TEXT NOT NULL CHECK (length(signer_role) BETWEEN 2 AND 120),
  business_name      TEXT NOT NULL CHECK (length(business_name) BETWEEN 1 AND 300),
  authority_confirmed INTEGER NOT NULL CHECK (authority_confirmed = 1),
  signed_at          TEXT NOT NULL,
  ip                 TEXT NOT NULL CHECK (length(ip) BETWEEN 2 AND 64),
  letter_text        TEXT NOT NULL,
  letter_sha256      TEXT NOT NULL CHECK (length(letter_sha256) = 64),
  pdf                BLOB NOT NULL,
  pdf_sha256         TEXT NOT NULL CHECK (length(pdf_sha256) = 64),
  record_sha256      TEXT NOT NULL UNIQUE CHECK (length(record_sha256) = 64),
  record_version     INTEGER NOT NULL DEFAULT 1 CHECK (record_version IN (1, 2, 3)),
  signature_method   TEXT CHECK (signature_method IS NULL OR signature_method IN ('DRAWN','TYPED')),
  signature_ink      TEXT CHECK (signature_ink IS NULL OR json_valid(signature_ink)),
  signer_email       TEXT,
  letter_prepared_at TEXT,
  letter_sent_at     TEXT,
  letter_viewed_at   TEXT,
  -- PHASE 157d: which signature on the letter this is, and the link it was signed through.
  signer_seq         INTEGER NOT NULL DEFAULT 1 CHECK (signer_seq IN (1, 2)),
  link_id            TEXT REFERENCES engagement_sign_links(id),
  UNIQUE (engagement_id, signer_seq),
  CHECK (origin = 'SEED'
      OR (origin = 'PORTAL' AND user_id IS NOT NULL AND session_id IS NOT NULL AND link_id IS NULL)
      OR (origin = 'EMAIL_LINK' AND user_id IS NOT NULL AND session_id IS NULL AND link_id IS NOT NULL))
) STRICT;

INSERT INTO engagement_signatures_new (id, engagement_id, business_id, origin, user_id, session_id, signer_name, signer_role,
  business_name, authority_confirmed, signed_at, ip, letter_text, letter_sha256, pdf, pdf_sha256, record_sha256, record_version,
  signature_method, signature_ink, signer_email, letter_prepared_at, letter_sent_at, letter_viewed_at, signer_seq, link_id)
SELECT id, engagement_id, business_id, origin, user_id, session_id, signer_name, signer_role,
  business_name, authority_confirmed, signed_at, ip, letter_text, letter_sha256, pdf, pdf_sha256, record_sha256, record_version,
  signature_method, signature_ink, signer_email, letter_prepared_at, letter_sent_at, letter_viewed_at, 1, NULL
  FROM engagement_signatures;

DROP TABLE engagement_signatures;
ALTER TABLE engagement_signatures_new RENAME TO engagement_signatures;

CREATE TRIGGER engagement_signatures_no_update BEFORE UPDATE ON engagement_signatures
BEGIN SELECT RAISE(ABORT, 'a signature is never edited'); END;

CREATE TRIGGER engagement_signatures_no_delete BEFORE DELETE ON engagement_signatures
BEGIN SELECT RAISE(ABORT, 'a signature is never deleted'); END;

CREATE TABLE _fk_check_guard (ok INTEGER NOT NULL CHECK (ok = 0)) STRICT;
INSERT INTO _fk_check_guard (ok) SELECT count(*) FROM pragma_foreign_key_check;
DROP TABLE _fk_check_guard;

COMMIT;
PRAGMA foreign_keys = ON;
