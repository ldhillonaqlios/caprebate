-- ===========================================================================
-- 001 — identity, sessions, audit.                      Phase 103, 8 Sep 2026
--
-- STRICT tables throughout: SQLite will otherwise store a string in an INTEGER
-- column without complaint, which is exactly the class of bug a real database
-- is here to prevent.
--
-- Times are ISO-8601 UTC strings ('2026-09-08T11:00:00.000Z'). They sort
-- lexicographically, they survive a Postgres port unchanged, and they cannot be
-- confused with seconds-vs-milliseconds the way an integer epoch can.
-- ===========================================================================

-- The FIVE APPLICATION ROLES. These are NOT the six board owner types, and they
-- are NOT the five roles in caprebate-anchor-quarantine.ts. Three vocabularies,
-- deliberately kept apart; src/roles.ts holds the only mapping between them.
CREATE TABLE roles (
  role        TEXT PRIMARY KEY,
  description TEXT NOT NULL
) STRICT;

INSERT INTO roles (role, description) VALUES
  ('ADMIN',      'Super user: creates, edits and disables users, assigns roles.'),
  ('SALES',      'The pipeline: assessments, calendar, engaged clients, tasks.'),
  ('ACCOUNTING', 'CAPREBATE''S OWN FINANCE. Client name, claim value, fee, invoice and payment status, VAT position. NOT the questions and answers, NOT the register data, NOT internal notes, NOT the surveyor''s workings.'),
  ('SURVEYING',  'The review-and-sign workspace, and nothing else. QUARANTINED from our estimate until commitment (N1).'),
  ('CLIENT',     'Their own record only.');

CREATE TABLE users (
  id               TEXT PRIMARY KEY,
  email            TEXT NOT NULL,
  -- Lower-cased at write time. Uniqueness is on THIS column, so two accounts
  -- cannot differ only by case and become an ambiguous login.
  email_canonical  TEXT NOT NULL UNIQUE,
  display_name     TEXT NOT NULL,
  role             TEXT NOT NULL REFERENCES roles(role),
  -- The argon2id PHC string. Never selected into any response DTO; see
  -- src/users.ts, where the row type that leaves the store has no such field.
  password_hash    TEXT NOT NULL,
  disabled_at      TEXT,
  created_at       TEXT NOT NULL,
  updated_at       TEXT NOT NULL,
  -- A CLIENT is a client OF a business and may read only that business.
  -- Enforced in can(), and constrained here so the two cannot drift apart.
  business_id      TEXT,
  CHECK (role <> 'CLIENT' OR business_id IS NOT NULL),
  CHECK (role  = 'CLIENT' OR business_id IS NULL)
) STRICT;

CREATE INDEX users_role_idx ON users(role);

-- Sessions are server-side records, so revocation is real: deleting or
-- expiring the row ends the session immediately rather than at next login.
-- The cookie carries an opaque id; the TOKEN is stored only as a hash, so a
-- database copy does not hand over live sessions.
CREATE TABLE sessions (
  id                TEXT PRIMARY KEY,
  user_id           TEXT NOT NULL REFERENCES users(id),
  token_hash        TEXT NOT NULL UNIQUE,
  created_at        TEXT NOT NULL,
  expires_at        TEXT NOT NULL,
  last_seen_at      TEXT NOT NULL,
  revoked_at        TEXT,
  revoked_reason    TEXT,
  -- Set when this session replaced another on a privilege change, so the
  -- rotation is auditable rather than merely asserted in a comment.
  rotated_from      TEXT REFERENCES sessions(id)
) STRICT;

CREATE INDEX sessions_user_idx ON sessions(user_id);

-- Single-use, expiring. Stored as a hash for the same reason as a session
-- token: the plaintext exists only in the outbox message and the caller's hand.
CREATE TABLE password_reset_tokens (
  id           TEXT PRIMARY KEY,
  user_id      TEXT NOT NULL REFERENCES users(id),
  token_hash   TEXT NOT NULL UNIQUE,
  created_at   TEXT NOT NULL,
  expires_at   TEXT NOT NULL,
  used_at      TEXT
) STRICT;

-- Rate limiting for login and reset. Counted per (key, window) so a fixed
-- window needs no sweeper to stay correct.
CREATE TABLE rate_limit_hits (
  bucket       TEXT NOT NULL,
  window_start TEXT NOT NULL,
  hits         INTEGER NOT NULL,
  PRIMARY KEY (bucket, window_start)
) STRICT;

-- ---------------------------------------------------------------------------
-- THE AUDIT LOG — append-only and tamper-evident.
--
-- Already a data protection officer determination, not a design choice.
--
-- Append-only is ENFORCED, not documented: the two triggers below make UPDATE
-- and DELETE fail at the database, so an application bug cannot quietly rewrite
-- history. Hash-chained the same way caprebate-anchor-quarantine.ts chains its
-- own log — sha256 over prev_hash plus the canonical entry — so removing or
-- reordering an entry is detectable rather than merely discouraged.
--
-- NO PERSONAL DATA IN LOG LINES. `detail` is JSON and is checked on the way in
-- by src/audit.ts against a deny-list; ids and role names go in, names and
-- email addresses do not.
-- ---------------------------------------------------------------------------
CREATE TABLE audit_log (
  seq        INTEGER PRIMARY KEY AUTOINCREMENT,
  at         TEXT NOT NULL,
  kind       TEXT NOT NULL,
  actor_id   TEXT,
  actor_role TEXT,
  object_type TEXT,
  object_id  TEXT,
  outcome    TEXT NOT NULL CHECK (outcome IN ('ALLOWED','REFUSED','ERROR')),
  detail     TEXT NOT NULL,
  prev_hash  TEXT NOT NULL,
  hash       TEXT NOT NULL
) STRICT;

CREATE TRIGGER audit_log_no_update BEFORE UPDATE ON audit_log
BEGIN SELECT RAISE(ABORT, 'audit_log is append-only'); END;

CREATE TRIGGER audit_log_no_delete BEFORE DELETE ON audit_log
BEGIN SELECT RAISE(ABORT, 'audit_log is append-only'); END;

-- ---------------------------------------------------------------------------
-- THE OUTBOX — the one stubbed transport.
--
-- The token mechanics are real; only the sending is not. A message lands here
-- and is shown on screen, clearly labelled as not sent. Replacing the stub is
-- one module (src/stubs/email.ts) behind one interface.
-- ---------------------------------------------------------------------------
CREATE TABLE outbox (
  id           TEXT PRIMARY KEY,
  created_at   TEXT NOT NULL,
  to_email     TEXT NOT NULL,
  subject      TEXT NOT NULL,
  body         TEXT NOT NULL,
  kind         TEXT NOT NULL,
  sent_at      TEXT,
  -- Always 'STUB' today. A real transport writes its own id here.
  transport    TEXT NOT NULL DEFAULT 'STUB'
) STRICT;
