-- PHASE 151m, 28 September 2026 — RECOVERY CODES: TEN ONE-USE CODES, SO A PERSON WHO LOSES THEIR PHONE CAN STILL SIGN IN.
--
-- Lakhbir, 28 September 2026 (Word question 232, closed): yes to recovery codes. Until now a person who lost their
-- phone had to ask the super user to reset their second step.
--
-- Ten codes are made when a second step is set up, and again whenever the person asks for new ones; each is shown to
-- them ONCE and never again. HERE IS ONLY A HASH OF EACH, bound to its person (src/web/recovery-codes.ts says how):
-- never the code as text, and the code never goes into a log line or an audit row. A code is used once: `used_at` is
-- set, and it never works again. Making new codes, setting up a new second step, the super user's "Reset second step"
-- and a client turning theirs off delete every row a person has. A new temporary password does not.
CREATE TABLE recovery_codes (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id),
  code_hash  TEXT NOT NULL,
  made_at    TEXT NOT NULL,
  used_at    TEXT
) STRICT;
CREATE INDEX recovery_codes_user_idx ON recovery_codes(user_id, used_at);

-- A used code stays used: its hash, its person and when it was made or used are never changed.
CREATE TRIGGER recovery_code_used_once BEFORE UPDATE ON recovery_codes
WHEN OLD.used_at IS NOT NULL OR NEW.code_hash <> OLD.code_hash OR NEW.user_id <> OLD.user_id OR NEW.made_at <> OLD.made_at
BEGIN SELECT RAISE(ABORT, 'a recovery code is used once, and is never changed'); END;
