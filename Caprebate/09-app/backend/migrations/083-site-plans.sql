-- ===========================================================================
-- 083 — THE REPORT'S SITE PLAN: THE BUILDING FROM ORDNANCE SURVEY'S FREE MAPS
-- 2 October 2026. src/web/site-plan.ts, src/connectors/os-buildings.ts. The survey pack, stage 6. Written as 078 on an
-- unmerged branch; brought across and renumbered 083 by Phase 153f, 4 October 2026 (078 had been taken meanwhile).
--
-- Lakhbir, 1 Oct 2026: the report's cover shows the building from Ordnance Survey's free building outlines; the site
-- boundary (INSPIRE) never appears in a report. 2 Oct 2026: the client's building is picked automatically — the one the
-- postcode's point falls in, else the nearest.
--
-- One row each time a site plan is fetched for a survey job; the newest is the one shown. It holds the postcode it was
-- placed by, that postcode's point on the British National Grid (metres), and the building outlines in a 160 m square
-- round it (OS Open Zoomstack, Open Government Licence), each as rings of [east, north] in decimetres FROM THE POINT,
-- and which outline is the client's. Never a boundary, never a name. An approved version keeps its own copy (its JSON),
-- so a later fetch never changes a report already approved. None is ever edited or deleted.
-- ===========================================================================

CREATE TABLE site_plans (
  id              TEXT PRIMARY KEY,
  job_id          TEXT NOT NULL REFERENCES surveyor_jobs(id),
  postcode        TEXT NOT NULL CHECK (length(postcode) BETWEEN 5 AND 8),
  easting         INTEGER NOT NULL CHECK (easting BETWEEN 0 AND 800000),
  northing        INTEGER NOT NULL CHECK (northing BETWEEN 0 AND 1300000),
  half_m          INTEGER NOT NULL CHECK (half_m BETWEEN 10 AND 500),
  buildings_json  TEXT NOT NULL CHECK (json_valid(buildings_json) AND json_type(buildings_json) = 'array' AND length(buildings_json) <= 400000),
  chosen          INTEGER CHECK (chosen IS NULL OR chosen >= 0),
  how             TEXT CHECK (how IS NULL OR how IN ('INSIDE', 'NEAREST')),
  metres          INTEGER CHECK (metres IS NULL OR metres >= 0),
  attribution     TEXT NOT NULL CHECK (length(attribution) BETWEEN 10 AND 200),
  fetched_by      TEXT NOT NULL REFERENCES users(id),
  fetched_at      TEXT NOT NULL,
  CHECK ((chosen IS NULL) = (how IS NULL) AND (how IS NULL) = (metres IS NULL))
) STRICT;
CREATE INDEX site_plans_by_job ON site_plans (job_id, fetched_at);

CREATE TRIGGER site_plans_never_edited BEFORE UPDATE ON site_plans BEGIN SELECT RAISE(ABORT, 'a site plan is never edited: fetch a new one'); END;
CREATE TRIGGER site_plans_never_deleted BEFORE DELETE ON site_plans BEGIN SELECT RAISE(ABORT, 'a site plan is never deleted'); END;
