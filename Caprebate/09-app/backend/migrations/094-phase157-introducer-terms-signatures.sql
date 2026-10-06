-- ===========================================================================
-- 094 — WHEN A FIRM SIGNED OUR INTRODUCER TERMS.   Phase 157 (the sweep), 6 October 2026
--
-- The draft introducer terms (06-commercial-and-governance/Caprebate-Introducer-Terms-DRAFT-v0.1.md, Phase 153d) say a
-- firm is a REGISTERED introducer only once it is on our list AND the terms are signed for the firm and for us. Until
-- now the back office counted any firm marked as an accountancy firm as registered (introducers.ts, onFeeInvoiced).
-- This table records a signature: one dated row per signing, never edited and never deleted. Model C (the 10% share)
-- accrues only for a firm with one. Model C itself stays off until the director and the solicitor agree the terms.
-- ===========================================================================
CREATE TABLE introducer_terms_signatures (
  id               TEXT PRIMARY KEY,
  introducer_id    TEXT NOT NULL REFERENCES introducers(id),
  terms_version    TEXT NOT NULL CHECK (length(trim(terms_version)) BETWEEN 1 AND 60),
  signed_on        TEXT NOT NULL CHECK (signed_on GLOB '[0-9][0-9][0-9][0-9]-[01][0-9]-[0-3][0-9]'),
  -- The names as written on the signed copy: the firm's signatory, and our director.
  firm_signatory   TEXT NOT NULL CHECK (length(trim(firm_signatory)) BETWEEN 2 AND 200),
  our_signatory    TEXT NOT NULL CHECK (length(trim(our_signatory)) BETWEEN 2 AND 200),
  recorded_by      TEXT NOT NULL REFERENCES users(id),
  recorded_at      TEXT NOT NULL
) STRICT;
CREATE INDEX introducer_terms_signatures_firm ON introducer_terms_signatures(introducer_id);

CREATE TRIGGER introducer_terms_signatures_never_edited BEFORE UPDATE ON introducer_terms_signatures
BEGIN SELECT RAISE(ABORT, 'a signature is never edited: record a new one'); END;

CREATE TRIGGER introducer_terms_signatures_never_deleted BEFORE DELETE ON introducer_terms_signatures
BEGIN SELECT RAISE(ABORT, 'a signature is never deleted'); END;
