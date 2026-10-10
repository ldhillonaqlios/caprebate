-- ===========================================================================
-- 115 — A FILING PER RETURN    Phase 159l (item 2, L15), 10 October 2026
--
-- The second Lockwood run (10 Oct 2026): the purchase went into the amended return for the year to 31 May 2025 and the
-- 2025 refit into the return for the year to 31 May 2026, not due until 31 May 2027 - but the accountant's filing link
-- asked once ("The amended return carrying this claim has been filed") and the claim closed on that one answer.
--
--   accountant_confirm_requests.period_end   for a FILED link, the last day of the accounting period whose return it
--                                            asks about (each part's route names it: src/web/claim-route.ts
--                                            claimReturns). NULL: the claim as a whole, as before - a claim whose parts
--                                            all go into one return, or whose returns are not settled yet.
--
-- OUR READING (Word question 283, the accountant): the claim closes once every return already due is confirmed filed;
-- a return not yet due is held in aftercare with its due date, and its own filing link is sent when it is filed.
-- ===========================================================================

ALTER TABLE accountant_confirm_requests ADD COLUMN period_end TEXT
  CHECK (period_end IS NULL OR (kind = 'FILED' AND period_end GLOB '[0-9][0-9][0-9][0-9]-[01][0-9]-[0-3][0-9]'));
