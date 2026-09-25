-- ===========================================================================
-- 052 — THE SITE AREA'S CALLER AND ITS SCREEN: A POINT AND A NEIGHBOURING COUNCIL A PERSON ENTERS, AND WHAT EACH
--       CLICK FOUND.    Phase 151c, 25 September 2026
--
-- Phase 151a built siteAreaFromLandBoundary (src/connectors/site-area.ts) and left it with no caller. Phase 151c makes
-- "Run the research" its caller, after signing (src/web/site-area-run.ts), and gives staff a form on the property page.
-- Two tables:
--
--   site_area_inputs   WHAT A PERSON ENTERED FOR ONE PROPERTY, kept with who and when. Two kinds:
--                        POINT              a British National Grid easting and northing, in metres. The latest one
--                                           is the point; an earlier one is kept, because it is what an earlier click
--                                           used. A person's point is used before Homedata's.
--                        NEIGHBOUR_COUNCIL  the ONS code of a council whose land boundary file must also be read,
--                                           for a site on a council boundary. Every one is read, beside the
--                                           postcode's own council.
--                      Admin or Sales, only once the engagement letter is signed, and audited (SITE_POINT_ENTERED,
--                      SITE_COUNCIL_ADDED). APPEND-ONLY: a wrong point is corrected by entering the right one.
--
--   site_area_runs     WHAT ONE CLICK CAME TO FOR ONE PROPERTY, only where the land boundary was actually asked:
--                      a site area stored, one already held, or none found. The state and the plain sentence the
--                      research panel shows. NOT KEPT: an outcome where nothing happened — switched off, not allowed
--                      yet, no point, no council. Those are worked out afresh each time the panel is drawn, so no row
--                      and "not asked" read alike, as the check of who signed does (migration 050).
--
-- NO POLYGON, NO MAP, NO COORDINATE FROM THE BOUNDARY, ANYWHERE. The point in site_area_inputs is the one a person
-- typed, not the boundary's. The site area itself is a register record under HMLR_INSPIRE, through the one door.
-- ===========================================================================

CREATE TABLE site_area_inputs (
  id           TEXT PRIMARY KEY,
  business_id  TEXT NOT NULL REFERENCES businesses(id),
  property_id  TEXT NOT NULL REFERENCES properties(id),
  kind         TEXT NOT NULL CHECK (kind IN ('POINT','NEIGHBOUR_COUNCIL')),
  easting      REAL,
  northing     REAL,
  lad_code     TEXT,
  entered_by   TEXT NOT NULL REFERENCES users(id),
  entered_at   TEXT NOT NULL,
  -- A point is an easting and a northing inside Great Britain's national grid and nothing else; a council is a code.
  CHECK ((kind = 'POINT' AND easting IS NOT NULL AND northing IS NOT NULL AND lad_code IS NULL
          AND easting >= 0 AND easting <= 700000 AND northing >= 0 AND northing <= 1300000)
      OR (kind = 'NEIGHBOUR_COUNCIL' AND lad_code IS NOT NULL AND easting IS NULL AND northing IS NULL))
) STRICT;

CREATE INDEX site_area_inputs_by_property ON site_area_inputs (property_id, kind, entered_at);

CREATE TRIGGER site_area_inputs_no_update BEFORE UPDATE ON site_area_inputs
BEGIN SELECT RAISE(ABORT, 'what a person entered for the site area is kept as entered; enter a new point instead'); END;

CREATE TRIGGER site_area_inputs_no_delete BEFORE DELETE ON site_area_inputs
BEGIN SELECT RAISE(ABORT, 'what a person entered for the site area is kept with who and when'); END;

CREATE TABLE site_area_runs (
  id           TEXT PRIMARY KEY,
  business_id  TEXT NOT NULL REFERENCES businesses(id),
  property_id  TEXT NOT NULL REFERENCES properties(id),
  state        TEXT NOT NULL CHECK (state IN ('STORED','ALREADY_HELD','NOT_FOUND')),
  why          TEXT NOT NULL,
  run_at       TEXT NOT NULL,
  run_by       TEXT NOT NULL REFERENCES users(id)
) STRICT;

CREATE INDEX site_area_runs_by_property ON site_area_runs (property_id, run_at);
