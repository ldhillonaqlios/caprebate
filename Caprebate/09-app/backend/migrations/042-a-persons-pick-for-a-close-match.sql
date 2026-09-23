-- ===========================================================================
-- 042 — A PERSON'S PICK FOR A CLOSE MATCH.   Phase 146h, 23 September 2026
--
-- The S10 Address Matching Spec, A.2 step 4, says of a REVIEW-band match: "never auto-selected. Full candidate list
-- (all postcode-blocked candidates, ranked) is surfaced to ops/surveyor for manual pick. Nothing is written until a
-- human resolves it." Until this phase there was nowhere to surface it to, so a close-but-not-certain match simply
-- ended the lookup and kept nothing.
--
-- This table is the record of one person resolving one of them. It is NOT the candidate list: the list is fetched
-- again for the request that shows it and is gone when that request ends (A.8 point 8, and condition CA5 of the
-- legitimate interests assessment — the candidates, their address lines and the raw responses are not stored or
-- logged). What is stored is the DECISION.
--
--   chosen_key    the candidate's own key in the register — a certificate number, a care regulator location id, a
--                 sale's transaction id, a company number, a UPRN. NULL where the person looked and chose NONE,
--                 which is an answer and is worth keeping: it stops the next person re-doing the same work, and it
--                 is the difference between "nobody has looked" and "somebody looked and none of them was us".
--   score         what the matcher scored that candidate, 0..1, as the person was shown it.
--   grade         the confidence grade this pick MINTS, and it is capped. The S10 spec's A.6 says an address-matched
--                 value is written at grade B at most until the 200-property test has calibrated a real threshold,
--                 and a person choosing from a list that did not reach the threshold is exactly that case. It is
--                 derived rather than typed: worstGrade of the source's own max_grade and UNMEASURED_MATCH_GRADE_CAP.
--                 NULL when nothing was chosen, because nothing was written to carry a grade.
--   record_id     the one register_records row this pick wrote, through ingestRegisterRecord — the one door, where
--                 the name exclusion register is checked. NULL where nothing was chosen, or where the register held
--                 the record already and it was left as it was.
--
-- ONE PICK PER CLIENT PER SOURCE, and a later one replaces it: a person who looks again and chooses differently has
-- made the decision that stands. The audit chain keeps every one of them, in order, with who made it — this table
-- says where it landed, the chain says how it got there.
--
-- NO ADDRESS, NO NAME, NO LABEL. A key and a number. Everything a person read on the way to the decision belonged to
-- the register and stayed there.
-- ===========================================================================

CREATE TABLE register_match_picks (
  id           TEXT PRIMARY KEY,
  business_id  TEXT NOT NULL REFERENCES businesses(id),
  source_id    TEXT NOT NULL,
  chosen_key   TEXT,
  score        REAL,
  grade        TEXT CHECK (grade IN ('A','B','C','D','E')),
  record_id    TEXT REFERENCES register_records(id),
  picked_by    TEXT NOT NULL REFERENCES users(id),
  picked_at    TEXT NOT NULL,
  UNIQUE (business_id, source_id)
) STRICT;

-- A pick is read back beside its source's row on the research panel, which is always keyed on the pair above; the
-- UNIQUE constraint already indexes it. This index is for the other direction — every pick a person made — which is
-- what an audit of "who chose what" reads.
CREATE INDEX register_match_picks_by_person ON register_match_picks (picked_by, picked_at);
