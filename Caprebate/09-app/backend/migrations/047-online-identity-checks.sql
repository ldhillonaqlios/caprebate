-- ===========================================================================
-- 047 — ONLINE IDENTITY CHECKS: WHAT WE SENT, AND WHAT CAME BACK.       Phase 151b, 25 September 2026
--
-- Lakhbir chose Veriff (Word question 225, closed 24 September 2026), and identity is checked whether or not
-- money-laundering supervision applies (Word question 10, recorded 24 September 2026): the check does NOT wait on
-- AML_IN_SCOPE. src/connectors/identity-check.ts is the connector, built and switched off in Phase 151;
-- src/web/identity-checks.ts is what sends one and what receives the result, and it is off with IDENTITY_CHECK.
--
-- TWO TABLES, BECAUSE THEY ARE TWO FACTS.
--
--   identity_checks          ONE CHECK WE SENT: the organisation, the contact being checked, the due diligence check
--                            it was sent from (NULL when it was sent from the client's record), the service, the
--                            service's session id, the link the client follows, who sent it and when. NO NAME: the
--                            names sent to the service came from the form and went no further than the call — the
--                            contact row already holds who this is.
--   identity_check_results   EVERY SIGNED RESULT THE SERVICE SENT BACK, APPEND-ONLY. A session can report more than
--                            once (asked to try again, then approved), so the LATEST row is the answer and every row
--                            is kept. READ, NOT STORED: no column on identity_checks repeats the outcome.
--
-- OUR OWN COPY OF THE RESULT. The service keeps its copy for a short time only, far less than the five years the
-- money-laundering rules ask a firm to keep its evidence. So each result keeps: the outcome we read (PASS, FAIL,
-- REFER, NOT_COMPLETED — an unknown status is REFER, never PASS), the service's own status word, its decision time,
-- when we received it, the SHA-256 of the exact signed body (so the copy can be matched to the service's record), and
-- in result_json ONLY the decision's own fields: its status, code, reason and reason code, its decision and acceptance
-- times, and the TYPE and COUNTRY of the document checked.
--
-- NEVER THE ID IMAGES, AND NEVER WHAT IS ON THE DOCUMENT. No column holds an image, a media link, a document number,
-- a date of birth, an address or a name. The client's photographs go from their phone to the service and never
-- through us. A trigger refuses a result_json that carries a person or a document number, so a later change to the
-- reader cannot quietly start keeping them.
-- ===========================================================================

CREATE TABLE identity_checks (
  id            TEXT PRIMARY KEY,
  business_id   TEXT NOT NULL REFERENCES businesses(id),
  contact_id    TEXT NOT NULL REFERENCES contacts(id),
  cdd_check_id  TEXT REFERENCES cdd_checks(id),
  provider      TEXT NOT NULL CHECK (provider = 'VERIFF'),
  session_id    TEXT NOT NULL UNIQUE CHECK (length(session_id) BETWEEN 1 AND 200),
  link          TEXT NOT NULL CHECK (link GLOB 'https://*' AND length(link) <= 2000),
  sent_by       TEXT NOT NULL REFERENCES users(id),
  sent_at       TEXT NOT NULL
) STRICT;

CREATE INDEX identity_checks_by_business ON identity_checks (business_id, sent_at);
CREATE INDEX identity_checks_by_cdd ON identity_checks (cdd_check_id);

CREATE TABLE identity_check_results (
  id                 TEXT PRIMARY KEY,
  identity_check_id  TEXT NOT NULL REFERENCES identity_checks(id),
  outcome            TEXT NOT NULL CHECK (outcome IN ('PASS','FAIL','REFER','NOT_COMPLETED')),
  provider_status    TEXT NOT NULL CHECK (length(provider_status) BETWEEN 1 AND 80),
  decided_at         TEXT,
  received_at        TEXT NOT NULL,
  body_sha256        TEXT NOT NULL CHECK (length(body_sha256) = 64),
  result_json        TEXT NOT NULL CHECK (json_valid(result_json) AND json_type(result_json) = 'object')
) STRICT;

CREATE INDEX identity_check_results_by_check ON identity_check_results (identity_check_id, received_at);

CREATE TRIGGER identity_check_results_no_person BEFORE INSERT ON identity_check_results
WHEN json_extract(NEW.result_json, '$.person') IS NOT NULL
  OR json_extract(NEW.result_json, '$.document.number') IS NOT NULL
  OR json_extract(NEW.result_json, '$.documentNumber') IS NOT NULL
  OR json_extract(NEW.result_json, '$.dateOfBirth') IS NOT NULL
BEGIN SELECT RAISE(ABORT, 'an identity result keeps the decision only: never the person, never the document number'); END;

CREATE TRIGGER identity_check_results_no_update BEFORE UPDATE ON identity_check_results
BEGIN SELECT RAISE(ABORT, 'a result we received never changes: a later result is a new row'); END;

CREATE TRIGGER identity_check_results_no_delete BEFORE DELETE ON identity_check_results
BEGIN SELECT RAISE(ABORT, 'a result we received is kept as evidence'); END;

CREATE TRIGGER identity_checks_no_delete BEFORE DELETE ON identity_checks
BEGIN SELECT RAISE(ABORT, 'a check we sent is kept as evidence'); END;
