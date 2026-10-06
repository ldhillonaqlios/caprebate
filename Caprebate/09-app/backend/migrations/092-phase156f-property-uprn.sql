-- 092 — PHASE 156f, 6 October 2026: THE UPRN THE CLIENT PICKED AT THE ASSESSMENT.
--
-- The assessment's address box lists every address at the postcode from Homedata, each with its UPRN (Ordnance
-- Survey's number for one addressable property). The one the client picks is kept on the property, so the paid
-- research step after signing can start from it and skip its own postcode search. It is the client's pick, not a
-- register fact: the research checks it belongs to the address and postcode the client gave, and a mismatch goes
-- back to the postcode search (src/connectors/homedata.ts, uprnBelongs). NULL means none was picked.
ALTER TABLE properties ADD COLUMN uprn TEXT CHECK (uprn IS NULL OR (length(uprn) BETWEEN 1 AND 14 AND uprn NOT GLOB '*[^0-9]*'));

-- PHASE 156f (B3): WHICH ROUTE ANSWERED A RESEARCH ROW. Planning has two: the free one (planning.data.gov.uk, then
-- PlanIt) before signing, and Homedata by the property's number after. 'HOMEDATA_PLANNING' when Homedata answered the
-- PLANNING row, so its answer is the one used and shown; NULL for a source's own route (src/web/research.ts).
ALTER TABLE research_sources ADD COLUMN route TEXT CHECK (route IS NULL OR route IN ('HOMEDATA_PLANNING'));
