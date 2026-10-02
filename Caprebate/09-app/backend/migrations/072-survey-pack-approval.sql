-- ===========================================================================
-- 072 — THE SURVEY PACK'S APPROVAL: CHAPTERS READ, THE SURVEYOR'S DETAILS, AND EACH APPROVED VERSION, FINGERPRINTED
-- 2 October 2026. src/web/pack-approve.ts.
--
-- Lakhbir: "whole pack needs to be read through then approve button ungreys like someone reading and accepting T&C";
-- "when the surveyor signs it should be a single CTA approve click"; and, of the fingerprint, approved.
--
--   survey_pack_reads        a chapter the surveyor opened, and the legal check's counter as it then stood — so a
--                            legal answer someone else gives afterwards sends them back to that chapter.
--   surveyor_details         the surveyor's RICS number (and firm), given once and stamped onto each approval. The
--                            newest row is current; never edited or deleted.
--   survey_pack_approvals    each approved version: the whole report as it stood (JSON), its SHA-256 fingerprint, who
--                            and when. Never edited or deleted. A later change makes the next version; the earlier one
--                            stays exactly as it was approved.
-- ===========================================================================

CREATE TABLE survey_pack_reads (
  id         TEXT PRIMARY KEY,
  job_id     TEXT NOT NULL REFERENCES surveyor_jobs(id),
  user_id    TEXT NOT NULL REFERENCES users(id),
  chapter    INTEGER NOT NULL CHECK (chapter BETWEEN 1 AND 23),
  legal_seq  INTEGER NOT NULL CHECK (legal_seq >= 0),
  at         TEXT NOT NULL,
  UNIQUE (job_id, user_id, chapter, legal_seq)
) STRICT;

CREATE TABLE surveyor_details (
  id           TEXT PRIMARY KEY,
  user_id      TEXT NOT NULL REFERENCES users(id),
  rics_number  TEXT NOT NULL CHECK (length(rics_number) BETWEEN 4 AND 10 AND rics_number NOT GLOB '*[^0-9]*'),
  firm         TEXT CHECK (firm IS NULL OR length(trim(firm)) BETWEEN 1 AND 200),
  at           TEXT NOT NULL
) STRICT;
CREATE INDEX surveyor_details_by_user ON surveyor_details (user_id, at);

CREATE TABLE survey_pack_approvals (
  id             TEXT PRIMARY KEY,
  pack_id        TEXT NOT NULL REFERENCES survey_packs(id),
  version        INTEGER NOT NULL CHECK (version >= 1),
  -- The pack's and the legal check's counters as approved: the same state cannot be approved twice.
  pack_seq       INTEGER NOT NULL CHECK (pack_seq >= 0),
  legal_seq      INTEGER NOT NULL CHECK (legal_seq >= 0),
  snapshot_json  TEXT NOT NULL CHECK (json_valid(snapshot_json)),
  -- SHA-256 of snapshot_json, as 64 lower-case hex characters.
  fingerprint    TEXT NOT NULL CHECK (length(fingerprint) = 64 AND fingerprint NOT GLOB '*[^0-9a-f]*'),
  approved_by    TEXT NOT NULL REFERENCES users(id),
  approved_at    TEXT NOT NULL,
  UNIQUE (pack_id, version),
  UNIQUE (pack_id, pack_seq, legal_seq)
) STRICT;

CREATE TRIGGER survey_pack_reads_never_edited BEFORE UPDATE ON survey_pack_reads
BEGIN SELECT RAISE(ABORT, 'a chapter read is never edited'); END;
CREATE TRIGGER surveyor_details_never_edited BEFORE UPDATE ON surveyor_details
BEGIN SELECT RAISE(ABORT, 'a surveyor''s details are never edited: give new ones'); END;
CREATE TRIGGER surveyor_details_never_deleted BEFORE DELETE ON surveyor_details
BEGIN SELECT RAISE(ABORT, 'a surveyor''s details are never deleted'); END;
CREATE TRIGGER survey_pack_approvals_never_edited BEFORE UPDATE ON survey_pack_approvals
BEGIN SELECT RAISE(ABORT, 'an approved version is never edited: approve a new one'); END;
CREATE TRIGGER survey_pack_approvals_never_deleted BEFORE DELETE ON survey_pack_approvals
BEGIN SELECT RAISE(ABORT, 'an approved version is never deleted'); END;
