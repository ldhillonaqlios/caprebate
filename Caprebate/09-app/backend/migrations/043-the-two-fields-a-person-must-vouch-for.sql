-- ===========================================================================
-- 043 — THE TWO FIELDS A PERSON MUST VOUCH FOR, AND WHAT HAPPENED WHEN WE READ A DOCUMENT.
--                                                            Phase 146i, 23 September 2026
--
-- TWO TABLES, ONE CAUSE. Phase 146g gave the upload flow steps 8, 9 and 10 of the receipt contract at last. Two
-- things about the reader became true that day and neither had anywhere to live.
--
-- ---------------------------------------------------------------------------------------------------------------
-- document_field_vouches — A PERSON SAYING A NAME BELONGS TO AN ORGANISATION AND NOT TO SOMEBODY.
--
-- assertClaimsWritable (04-phase-work/phase3/caprebate-client-doc-ingestion.ts) keeps two CLIENT_DOC fields only on
-- the footing that their value names an organisation: grant_funder_name ("the funding body, not an individual") and
-- brc_issuing_body (a local authority, not an individual approved inspector). The name exclusion register classifies
-- by field NAME and never sees a value, so it cannot tell the two apart; the caller has to assert it, and an absent
-- assertion fails closed. Until this phase NOTHING SUPPLIED EITHER, so a grant funding agreement and a building
-- regulations completion certificate had every one of their claims refused, not merely that field.
--
-- IT CANNOT BE INFERRED FROM THE DOCUMENT — that is the whole point of the control — so it is a person's answer,
-- recorded here, against the logical document rather than one upload of it: a second version of the same agreement
-- is the same agreement, and the answer stands until somebody changes it.
--
--   answer    'yes' | 'no' | 'not_sure'. ONLY 'yes' lets the field be kept. 'not_sure' and NO ROW AT ALL behave
--             identically in the decision (N4) — the row exists so that "somebody looked and was not sure" can be
--             told from "nobody has been asked", which is a fact about the work, not about the claim.
--
-- NO VALUE IS STORED HERE. Not the funder's name, not the issuing body's. This table says that a person answered a
-- yes-or-no question about a field of a document, and which way.
-- ---------------------------------------------------------------------------------------------------------------

CREATE TABLE document_field_vouches (
  id                   TEXT PRIMARY KEY,
  logical_document_id  TEXT NOT NULL REFERENCES logical_documents(id),
  field_id             TEXT NOT NULL,
  answer               TEXT NOT NULL CHECK (answer IN ('yes','no','not_sure')),
  answered_by          TEXT NOT NULL REFERENCES users(id),
  answered_at          TEXT NOT NULL,
  UNIQUE (logical_document_id, field_id)
) STRICT;

-- The other direction — every answer one person gave — which is what an audit of "who vouched for what" reads.
CREATE INDEX document_field_vouches_by_person ON document_field_vouches (answered_by, answered_at);

-- ---------------------------------------------------------------------------------------------------------------
-- document_readings — WHAT HAPPENED WHEN WE READ A DOCUMENT, WHERE A PERSON CAN SEE IT.
--
-- finishUpload has returned a ReadingOutcome since Phase 146g and nothing drew it, so a document that was sent and
-- came back unreadable looked exactly like one nobody had asked about. One row per reading that actually started.
--
-- A READING THAT NEVER STARTED IS NOT A READING. No row is written where the reader was not wired in at all, or
-- where CLAUDE_SWITCHES.DOCUMENT_READING is false — which is how this ships. That is deliberate: with the switch
-- off a finished upload must behave exactly as it did before Phase 146g, and a row is a difference.
--
--   state      the ReadingState (src/web/uploads.ts): NOT_CONFIGURED, HUMAN_ONLY, NOT_READY, NOT_READ, NOT_WRITTEN
--              or CLAIMED. The screen shows words, never this code.
--   why        the same sentence in plain words. NEVER a key, a path, or a word of the document.
--   fields     how many facts were kept, not_found how many the document did not answer — every one of those is
--              still ASKED of the client, never a zero and never a guess (N4).
--   left_out   how many fields were dropped because nobody has vouched for them. See the table above.
--
-- STAFF READ THIS AND THE CLIENT NEVER DOES. The client's own page says what we did with their file in the words it
-- already used; why our reader could not read it is ours.
-- ---------------------------------------------------------------------------------------------------------------

CREATE TABLE document_readings (
  id          TEXT PRIMARY KEY,
  document_id TEXT NOT NULL REFERENCES documents(id),
  at          TEXT NOT NULL,
  state       TEXT NOT NULL,
  why         TEXT NOT NULL,
  fields      INTEGER NOT NULL,
  not_found   INTEGER NOT NULL,
  left_out    INTEGER NOT NULL
) STRICT;

CREATE INDEX document_readings_by_document ON document_readings (document_id, at);
