-- ===========================================================================
-- 101 — THE CLIENT ACCEPTS THE REPORT, IN THE PORTAL                        Phase 158c, 7 October 2026
--
-- The Friary House run (04-phase-work/sim-2026-10-06, finding F39): the client was told the report was issued and had
-- nothing to open or accept; "The client accepted the report" was a tick staff made for them. Now a client login of the
-- business accepts the version released to it (src/web/report-accept.ts), and the Reports gate reads that acceptance of
-- the issued report's own fingerprint. One row a login a version. Never changed and never deleted.
-- ===========================================================================

CREATE TABLE client_report_acceptances (
  id           TEXT PRIMARY KEY,
  claim_id     TEXT NOT NULL REFERENCES claims(id),
  approval_id  TEXT NOT NULL REFERENCES survey_pack_approvals(id),
  -- The approved version's fingerprint, as accepted: 64 lower-case hex characters.
  fingerprint  TEXT NOT NULL CHECK (length(fingerprint) = 64 AND fingerprint NOT GLOB '*[^0-9a-f]*'),
  user_id      TEXT NOT NULL REFERENCES users(id),
  accepted_at  TEXT NOT NULL,
  UNIQUE (approval_id, user_id)
) STRICT;

CREATE INDEX client_report_acceptances_claim ON client_report_acceptances(claim_id, fingerprint);

CREATE TRIGGER client_report_acceptances_no_update BEFORE UPDATE ON client_report_acceptances
BEGIN SELECT RAISE(ABORT, 'a client''s acceptance is never changed'); END;

CREATE TRIGGER client_report_acceptances_no_delete BEFORE DELETE ON client_report_acceptances
BEGIN SELECT RAISE(ABORT, 'a client''s acceptance is never deleted'); END;
