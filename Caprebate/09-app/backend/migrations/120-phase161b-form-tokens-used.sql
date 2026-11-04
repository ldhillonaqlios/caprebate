-- ===========================================================================
-- 120 — SINGLE-USE FORM TOKENS, ONCE ACCEPTED, NEVER AGAIN            Phase 161b, 4 November 2026
--
-- The ITRoadway audit (2 Nov 2026), section 4, row 3: a one-time security token on sensitive forms (payments and
-- refunds, roles and staff logins, settings and switches, keys and connections, holds and data rights). A form for one
-- of them carries a single-use token (src/web/form-token.ts). When one is accepted its random number is kept here, so
-- the same form sent again is refused. A row holds no personal data: a random number, whose session used it, and when.
-- Rows older than the token's two-hour life are deleted as new ones arrive: after that the token is refused anyway.
-- ===========================================================================

CREATE TABLE form_tokens_used (
  nonce    TEXT PRIMARY KEY CHECK (length(nonce) = 32),
  user_id  TEXT NOT NULL REFERENCES users(id),
  used_at  TEXT NOT NULL
) STRICT;

CREATE INDEX form_tokens_used_by_time ON form_tokens_used (used_at);
