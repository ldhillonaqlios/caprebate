-- ===========================================================================
-- 080 — DATA PROTECTION IN THE BACK OFFICE, BUILT ON OUR RECOMMENDATION FOR THE OFFICER TO CHECK
--                                                            Phase 153c, 4 October 2026
--
-- 1. identity_persons.notice_published_too (Word question 162): "Through the client" is never the only route. A notice
--    recorded as sent through the client is refused unless the notice is also on our published notices page and that
--    is recorded for the same person. The application says why; this trigger is the floor under it.
-- 2. breach_names and breach_names_deputies (Word question 181): the restricted list of the names a breach entry may
--    need, linked from the entry only by its annex reference (ANX-nnn), and the record of who the named deputy is.
--    src/web/breach-names.ts lets only the data protection officer and that deputy open it. Both are append-only.
-- 3. healthcare_premises (Word question 183): healthcare premises from open-licence registers — the business's name,
--    the address, the sector and the source, and NOTHING about a person. No column holds a person's name, an email or a
--    telephone number, and nothing anywhere reads this table to contact anyone.
-- ===========================================================================

ALTER TABLE identity_persons ADD COLUMN notice_published_too INTEGER CHECK (notice_published_too IS NULL OR notice_published_too IN (0, 1));

CREATE TRIGGER identity_persons_client_route_needs_published BEFORE UPDATE OF notice_route, notice_published_too ON identity_persons
WHEN NEW.notice_route = 'CLIENT_ROUTE' AND COALESCE(NEW.notice_published_too, 0) <> 1
BEGIN SELECT RAISE(ABORT, 'a notice through the client needs the published notices page recorded too'); END;

CREATE TABLE breach_names (
  id            TEXT PRIMARY KEY,
  annex_ref     TEXT NOT NULL CHECK (annex_ref GLOB 'ANX-[0-9][0-9][0-9]*'),
  incident_id   TEXT NOT NULL REFERENCES breach_incidents(id),
  name          TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 200),
  how_involved  TEXT NOT NULL CHECK (length(trim(how_involved)) BETWEEN 1 AND 500),
  note          TEXT CHECK (note IS NULL OR length(note) <= 2000),
  recorded_by   TEXT NOT NULL REFERENCES users(id),
  recorded_at   TEXT NOT NULL
) STRICT;
CREATE INDEX breach_names_incident_idx ON breach_names(incident_id);
CREATE TRIGGER breach_names_no_update BEFORE UPDATE ON breach_names BEGIN SELECT RAISE(ABORT, 'a name in the restricted list is never edited'); END;
CREATE TRIGGER breach_names_no_delete BEFORE DELETE ON breach_names BEGIN SELECT RAISE(ABORT, 'a name in the restricted list is never deleted here'); END;

CREATE TABLE breach_names_deputies (
  id        TEXT PRIMARY KEY,
  user_id   TEXT NOT NULL REFERENCES users(id),
  source    TEXT NOT NULL CHECK (length(trim(source)) BETWEEN 2 AND 500),
  named_by  TEXT NOT NULL REFERENCES users(id),
  named_at  TEXT NOT NULL
) STRICT;
CREATE TRIGGER breach_names_deputies_no_update BEFORE UPDATE ON breach_names_deputies BEGIN SELECT RAISE(ABORT, 'naming a deputy is never edited: name another'); END;
CREATE TRIGGER breach_names_deputies_no_delete BEFORE DELETE ON breach_names_deputies BEGIN SELECT RAISE(ABORT, 'naming a deputy is never deleted'); END;

CREATE TABLE healthcare_premises (
  id             TEXT PRIMARY KEY,
  business_name  TEXT NOT NULL CHECK (length(trim(business_name)) BETWEEN 2 AND 200),
  address        TEXT NOT NULL CHECK (length(trim(address)) BETWEEN 2 AND 300),
  postcode       TEXT NOT NULL CHECK (length(postcode) BETWEEN 6 AND 8),
  sector         TEXT NOT NULL CHECK (sector IN ('care_homes','dental','supported_living','gp','private_hospital')),
  source_id      TEXT NOT NULL CHECK (source_id IN ('CQC_CARE_DIRECTORY','NHS_ODS_DENTAL','NHS_ODS_GP')),
  source_ref     TEXT NOT NULL CHECK (length(trim(source_ref)) BETWEEN 1 AND 40),
  licence        TEXT NOT NULL CHECK (licence = 'Open Government Licence v3.0'),
  imported_by    TEXT NOT NULL REFERENCES users(id),
  imported_at    TEXT NOT NULL,
  UNIQUE (source_id, source_ref)
) STRICT;
