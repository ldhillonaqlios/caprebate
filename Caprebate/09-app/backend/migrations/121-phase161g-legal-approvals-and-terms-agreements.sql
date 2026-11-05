-- ===========================================================================
-- 121 — WHO APPROVED EACH LEGAL PAGE, AND WHO AGREED TO THE TERMS      Phase 161g, 5 November 2026
--
-- The legal pages (src/web/legal-pages.ts) carry a "Draft" line until an approval of their current version is
-- recorded: who approved it, in what role, and on what date. With no approval nothing is in force. An admin records it
-- in the back office (src/web/legal-approvals.ts); the audit log records it too (LEGAL_PAGE_APPROVED). A row is never
-- changed or deleted: a new version of a page needs a new approval.
--
-- A client ticks that they have read the client's portal terms, the website terms and the privacy policy before
-- using the portal. The tick is kept with its date and the version of each of the three, and the audit log records
-- it (TERMS_AGREED). A new version of any of them asks again.
--
--   legal_approvals    one row per approval of one version of one page.
--   terms_agreements   one row per tick, per person.
-- ===========================================================================

CREATE TABLE legal_approvals (
  id               TEXT PRIMARY KEY,
  page             TEXT NOT NULL CHECK (page IN ('terms', 'portal-terms', 'privacy-policy', 'cookies', 'acceptable-use', 'accessibility', 'disclaimer', 'notices')),
  version          TEXT NOT NULL CHECK (version GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  approved_by      TEXT NOT NULL CHECK (length(trim(approved_by)) BETWEEN 1 AND 200),
  approver_role    TEXT NOT NULL CHECK (approver_role IN ('SOLICITOR', 'DPO')),
  approved_on      TEXT NOT NULL CHECK (approved_on GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  recorded_by      TEXT NOT NULL REFERENCES users(id),
  recorded_at      TEXT NOT NULL,
  UNIQUE (page, version, approver_role)
) STRICT;

CREATE TRIGGER legal_approvals_never_change BEFORE UPDATE ON legal_approvals
BEGIN SELECT RAISE(ABORT, 'an approval is never changed: record a new one for a new version'); END;
CREATE TRIGGER legal_approvals_never_deleted BEFORE DELETE ON legal_approvals
BEGIN SELECT RAISE(ABORT, 'an approval is never deleted'); END;

CREATE TABLE terms_agreements (
  id                     TEXT PRIMARY KEY,
  user_id                TEXT NOT NULL REFERENCES users(id),
  agreed_at              TEXT NOT NULL,
  portal_terms_version   TEXT NOT NULL,
  website_terms_version  TEXT NOT NULL,
  privacy_version        TEXT NOT NULL
) STRICT;

CREATE INDEX terms_agreements_by_user ON terms_agreements (user_id, agreed_at);

-- The sign-up offered after the free assessment (client_signups, migration 031) keeps the tick until the email link is
-- opened and the login is made; then it is copied into terms_agreements for the new login.
ALTER TABLE client_signups ADD COLUMN terms_agreed_at TEXT;
ALTER TABLE client_signups ADD COLUMN terms_versions TEXT CHECK (terms_versions IS NULL OR json_valid(terms_versions));
