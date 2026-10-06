-- ===========================================================================
-- 096 — THE ENGAGEMENT LETTER IS SENT, AND SIGNED THE DOCUSIGN WAY            Phase 157c, 6 October 2026
--
-- The Friary House run (04-phase-work/sim-2026-10-06, finding F21): nothing in the application prepared or sent an
-- engagement letter, and its sent and opened times were kept nowhere. And Lakhbir, the same day: "cant it be a docusign
-- style document which captures a signed digital copy?"
--
-- engagements gains when the letter was sent and by whom, and when the client first opened it (src/web/engagement-send.ts,
-- src/web/portal.ts markViewed). engagement_signatures gains what a version 2 record covers (src/web/signing.ts):
--   record_version     1 for every record before this phase (its fingerprint is checked exactly as before), 2 after
--   signature_method   DRAWN (the client drew it) or TYPED (they chose their typed name as their signature)
--   signature_ink      the drawn strokes, JSON: [[[x,y],...],...], each 0 to 1000 across and down the box
--   signer_email       the login's email at the moment of signing, for the certificate of completion
--   letter_prepared_at, letter_sent_at, letter_viewed_at   the letter's times, copied onto the record when it is signed
-- ADD COLUMN only: no row is rewritten, and the never-edited and never-deleted triggers stand as they are.
-- ===========================================================================

ALTER TABLE engagements ADD COLUMN sent_at TEXT;
ALTER TABLE engagements ADD COLUMN sent_by TEXT REFERENCES users(id);
ALTER TABLE engagements ADD COLUMN viewed_at TEXT;

ALTER TABLE engagement_signatures ADD COLUMN record_version INTEGER NOT NULL DEFAULT 1 CHECK (record_version IN (1, 2));
ALTER TABLE engagement_signatures ADD COLUMN signature_method TEXT CHECK (signature_method IS NULL OR signature_method IN ('DRAWN','TYPED'));
ALTER TABLE engagement_signatures ADD COLUMN signature_ink TEXT CHECK (signature_ink IS NULL OR json_valid(signature_ink));
ALTER TABLE engagement_signatures ADD COLUMN signer_email TEXT;
ALTER TABLE engagement_signatures ADD COLUMN letter_prepared_at TEXT;
ALTER TABLE engagement_signatures ADD COLUMN letter_sent_at TEXT;
ALTER TABLE engagement_signatures ADD COLUMN letter_viewed_at TEXT;
