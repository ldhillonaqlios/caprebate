-- PHASE 151j, 28 September 2026 — SIGN-IN: A TEMPORARY PASSWORD, A SECOND FACTOR, AND THE STEPS BETWEEN.
--
-- Lakhbir, 28 September 2026: the super user creates a person's account with a temporary password; at the first
-- sign-in they choose their own password and set up a second factor; every staff login uses one, a client may; the
-- second factor is a code by email or an authenticator app (no text messages); and a forgotten password is reset by
-- an emailed link (the reset tokens have existed since migration 001 and had no screen).

-- A password the super user gave out: it works once, to reach the "choose your own password" step, and only until
-- this time. NULL is a password the person chose themselves.
ALTER TABLE users ADD COLUMN password_temporary_until TEXT;

-- The second factor the person set up: a code sent to their email address, or an authenticator app. NULL is none.
ALTER TABLE users ADD COLUMN mfa_method TEXT CHECK (mfa_method IS NULL OR mfa_method IN ('EMAIL', 'APP'));
-- The authenticator app's shared secret (base32). Only with APP; never selected into anything a page or the API returns.
ALTER TABLE users ADD COLUMN mfa_secret TEXT CHECK (mfa_secret IS NULL OR mfa_method = 'APP');
-- The time step of the last app code accepted, so the same code cannot be used twice.
ALTER TABLE users ADD COLUMN mfa_last_step INTEGER;

-- ONE SIGN-IN, PART WAY THROUGH. The password was right; the person still has a step to finish before a session is
-- issued: choose their own password, set up a second factor, or give a code. The browser holds a random token in an
-- httpOnly cookie; only its hash is here. Short-lived, attempts counted, finished once.
-- purpose ACCOUNT is the same machinery used from a signed-in account page, to set up or change the second factor.
CREATE TABLE sign_in_steps (
  id              TEXT PRIMARY KEY,
  token_hash      TEXT NOT NULL UNIQUE,
  user_id         TEXT NOT NULL REFERENCES users(id),
  purpose         TEXT NOT NULL CHECK (purpose IN ('SIGN_IN', 'ACCOUNT')),
  step            TEXT NOT NULL CHECK (step IN ('NEW_PASSWORD', 'SETUP', 'VERIFY')),
  -- during SETUP: the method being set up, and for an app the secret shown to the person, until a code proves it
  pending_method  TEXT CHECK (pending_method IS NULL OR pending_method IN ('EMAIL', 'APP')),
  pending_secret  TEXT,
  -- an emailed code: only its hash, when it stops working, and how many have been sent on this step
  code_hash       TEXT,
  code_expires_at TEXT,
  codes_sent      INTEGER NOT NULL DEFAULT 0,
  attempts        INTEGER NOT NULL DEFAULT 0,
  created_at      TEXT NOT NULL,
  expires_at      TEXT NOT NULL,
  finished_at     TEXT
) STRICT;
CREATE INDEX sign_in_steps_user_idx ON sign_in_steps(user_id, created_at);
