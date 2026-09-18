-- ===========================================================================
-- 032 — THE CLIENT IS THE COMPANY.                  Phase 134, 18 September 2026
--
-- WHY. Lakhbir, after using the test site: "There is too much of an emphasis on
-- the CR number - the main focus point should be the company name", and "all
-- communication needs to be under one client's portal and dashboard". A
-- company can hold many claims; what is said to the client belongs to the
-- COMPANY, and may say which claim it is about.
--
-- 1 · A QUESTION TO THE CLIENT MAY SAY WHICH CLAIM IT IS ABOUT.
--
-- Migration 013 let a DOCUMENT request carry a claim and refused one on a
-- QUESTION. That refusal is lifted, and nothing else in the trigger moves: a
-- question still carries no requested type and no received document, and a
-- document request is still opened, never recorded already received. The
-- same-organisation trigger (client_tasks_request_claim_insert) is untouched,
-- so a question can only ever name one of its own company's claims, and
-- client_tasks_request_fixed still stops the claim changing afterwards.
-- ---------------------------------------------------------------------------

DROP TRIGGER client_tasks_kind_insert;

CREATE TRIGGER client_tasks_kind_insert BEFORE INSERT ON client_tasks
WHEN (NEW.kind = 'QUESTION' AND (NEW.requested_type IS NOT NULL OR NEW.received_document_id IS NOT NULL))
  OR (NEW.kind = 'DOCUMENT' AND (NEW.requested_type IS NULL OR NEW.state <> 'OPEN' OR NEW.received_document_id IS NOT NULL OR NEW.fact_id IS NOT NULL))
BEGIN SELECT RAISE(ABORT, 'a question carries no requested type; a document request carries one, and is opened, never recorded already received'); END;

-- ---------------------------------------------------------------------------
-- 2 · THE SEEDED EMAIL'S SUBJECT LEADS WITH THE COMPANY.
--
-- Migration 012 seeded "Your claim {{claim_reference}} — the next step". It is
-- changed ONLY while it still holds exactly those words, so a subject an
-- administrator has since edited is left as they wrote it (as migration 030
-- did for the sign-off). src/web/templates.ts also puts the company first on
-- any merged subject that does not already start with it.
-- ---------------------------------------------------------------------------

UPDATE email_templates
   SET subject = '{{organisation}} — the next step on your claim'
 WHERE id = 'template-next-step'
   AND subject = 'Your claim {{claim_reference}} — the next step';
