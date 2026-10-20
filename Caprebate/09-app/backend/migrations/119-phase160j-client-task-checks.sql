-- ===========================================================================
-- 119 — WHAT THE CLIENT SENT, CHECKED                            Phase 160j, 20 October 2026
--
-- A client's answer in their portal, and a file they upload against a request, both end as an ANSWERED row in
-- client_tasks with answered_by_role CLIENT (src/web/portal.ts answerTask; src/web/documents.ts receiveByUpload).
-- Until now nothing recorded that anyone looked at it. Here a member of staff accepts it, or asks the client again
-- with a reason, which opens a new question or document request in the portal (asked_again_task_id).
--
--   client_task_checks   one check per thing the client sent: who, when, accepted or asked again, and why.
--
-- A check is kept for good: never edited, never deleted. Each is also written to the audit log.
-- ===========================================================================

CREATE TABLE client_task_checks (
  id                   TEXT PRIMARY KEY,
  task_id              TEXT NOT NULL UNIQUE REFERENCES client_tasks(id),
  outcome              TEXT NOT NULL CHECK (outcome IN ('ACCEPTED', 'ASKED_AGAIN')),
  reason               TEXT CHECK (reason IS NULL OR length(trim(reason)) BETWEEN 1 AND 1000),
  asked_again_task_id  TEXT REFERENCES client_tasks(id),
  checked_by           TEXT NOT NULL REFERENCES users(id),
  checked_at           TEXT NOT NULL,
  CHECK (outcome <> 'ASKED_AGAIN' OR (reason IS NOT NULL AND asked_again_task_id IS NOT NULL)),
  CHECK (outcome <> 'ACCEPTED' OR asked_again_task_id IS NULL)
) STRICT;

CREATE TRIGGER client_task_checks_never_edited BEFORE UPDATE ON client_task_checks
BEGIN SELECT RAISE(ABORT, 'a check is never edited: it is kept as it was made'); END;
CREATE TRIGGER client_task_checks_never_deleted BEFORE DELETE ON client_task_checks
BEGIN SELECT RAISE(ABORT, 'a check is never deleted'); END;
