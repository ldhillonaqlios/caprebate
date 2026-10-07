-- ===========================================================================
-- 100 — WHAT A SEALED ESTIMATE WAS BUILT FROM                              Phase 158b, 7 October 2026
--
-- The Friary House run (04-phase-work/sim-2026-10-06, finding F31): nothing in the application sealed an estimate, so
-- no surveyor's commit could release one. Staff now open a survey job from the claim at Survey
-- (src/web/survey-open.ts), and opening it seals the figure the four-stage funnel showed the client: the spend that
-- counts and its share of what was spent. The funnel does not split the pools, value the land or work out a tax
-- saving, so those are stored as 0 and this column says why: 'FUNNEL_CEILING'. A page showing a released estimate reads
-- it and says "not estimated at the assessment" rather than "£0".
--
-- ADD COLUMN only. Existing rows (the seed's) keep NULL: their figures are what was written.
-- ===========================================================================

ALTER TABLE estimates ADD COLUMN basis TEXT CHECK (basis IS NULL OR basis IN ('FUNNEL_CEILING'));
