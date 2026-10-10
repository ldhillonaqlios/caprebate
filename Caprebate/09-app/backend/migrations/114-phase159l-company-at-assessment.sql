-- ===========================================================================
-- 114 — WHAT THE COMPANY SEARCH READ, KEPT WITH THE ASSESSMENT    Phase 159l (item 1, L13), 10 October 2026
--
-- The second Lockwood run (10 Oct 2026): "Find this company" flagged LOCKWOOD SURGERY PRIME HEALTH LTD as dormant, but
-- the assessment kept only its number. The lead's qualifying-activity evidence read only the Companies House register
-- record, which only the paid research writes, so the letter was signed and Homedata paid before "dormant" first
-- showed. Now the assessment keeps what the search read of the company the person picked:
--
--   assessments.company_number         the company picked from the search (NULL: none picked)
--   assessments.company_status         its status on the register at the search ("active" ...)
--   assessments.company_accounts_type  the type of its latest accounts ("dormant", "micro-entity" ...); NULL where none
--                                      is filed or its profile could not be read: NOT KNOWN, never "not dormant" (N4)
--
-- The lead and the claim show it beside the qualifying-activity check until the research's own register record exists.
-- Nothing refuses (rule 13(c)): it warns, and a person answers the check.
-- ===========================================================================

ALTER TABLE assessments ADD COLUMN company_number TEXT;
ALTER TABLE assessments ADD COLUMN company_status TEXT;
ALTER TABLE assessments ADD COLUMN company_accounts_type TEXT;
