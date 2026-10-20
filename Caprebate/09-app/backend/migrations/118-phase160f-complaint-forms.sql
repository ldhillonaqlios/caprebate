-- ===========================================================================
-- 118 — A COMPLAINT SENT THROUGH THE PUBLIC NOTICES PAGE      Phase 160f, 20 October 2026
--
-- The notices page (03-app/caprebate-notices-page.html, served on the test website by Phase 160f) has a complaint
-- form. A complaint counts however it arrives, and its thirty days run from when it arrives, so the form keeps it here
-- at once, with when it arrived, emails it to the data protection address, and lists it on the staff complaints page.
-- A member of staff then logs it into the complaints log (complaints, migration 017, received_via FORM) with that same
-- arrival time; the log needs a member of staff as its recorder, which a form sent by the public has not.
--
--   complaint_forms   what the person sent, word for word, and the complaint it was logged as.
-- ===========================================================================

CREATE TABLE complaint_forms (
  id                   TEXT PRIMARY KEY,
  received_at          TEXT NOT NULL,
  name                 TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 200),
  reply_to             TEXT NOT NULL CHECK (length(trim(reply_to)) BETWEEN 1 AND 320),
  on_behalf            TEXT CHECK (on_behalf IN ('self', 'other')),
  authority_detail     TEXT,
  matching_info        TEXT,
  about                TEXT CHECK (about IN ('how_obtained', 'what_doing', 'not_told', 'answer_to_request', 'retention', 'other')),
  complaint_verbatim   TEXT NOT NULL CHECK (length(trim(complaint_verbatim)) BETWEEN 1 AND 20000),
  remedy_sought        TEXT,
  rights               TEXT NOT NULL CHECK (json_valid(rights) AND json_type(rights) = 'array'),
  logged_complaint_id  TEXT REFERENCES complaints(id),
  logged_at            TEXT,
  logged_by            TEXT REFERENCES users(id),
  CHECK ((logged_complaint_id IS NULL) = (logged_at IS NULL) AND (logged_at IS NULL) = (logged_by IS NULL))
) STRICT;

CREATE INDEX complaint_forms_waiting ON complaint_forms (received_at) WHERE logged_complaint_id IS NULL;
