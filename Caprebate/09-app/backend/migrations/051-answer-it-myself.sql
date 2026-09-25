-- ===========================================================================
-- 051 — "ANSWER IT MYSELF": A CLIENT WHO ASKED US NOT TO LOOK THEIR PROPERTY UP.    Phase 151b, 25 September 2026
--
-- Word answer 180, "Should people be able to skip the automatic lookups and answer the questions themselves?", closed
-- 24 September 2026 (Lakhbir): yes. At the address question a client may choose to answer the property questions
-- themselves instead of the free lookups in public records. The choice is offered only when the lookups could run at
-- all (the free-tier gate), so it is switched off with them (src/web/address-check.ts).
--
-- ONE ROW PER ORGANISATION, WRITTEN WHEN THE ASSESSMENT IS SENT, and the research run reads it: the free lookups for
-- that organisation are left unrun, each with a plain line saying why. NO ROW IS NOT A REFUSAL: a client who was never
-- offered the choice, or did not tick it, is looked up exactly as before (N4 — absent is not an answer).
--
-- KEPT, NOT DELETED: the choice is the reason the lookups did not run, and that reason is part of the claim file.
-- ===========================================================================

CREATE TABLE lookups_declined (
  business_id  TEXT PRIMARY KEY REFERENCES businesses(id),
  declined_at  TEXT NOT NULL,
  how          TEXT NOT NULL CHECK (how IN ('ASSESSMENT','STAFF'))
) STRICT;

CREATE TRIGGER lookups_declined_no_delete BEFORE DELETE ON lookups_declined
BEGIN SELECT RAISE(ABORT, 'a client''s choice not to be looked up is kept with their file'); END;
