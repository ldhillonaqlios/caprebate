-- ===========================================================================
-- 075 — PHOTOS SENT MANY AT ONCE, AND SORTED BY US
-- 2 October 2026. src/web/survey-evidence.ts (addPhotos, sortPhotos), src/web/evidence-pages.ts.
--
-- Lakhbir, 2 Oct 2026: "give users the ability to not only upload photos individually but also in one go. admin can
-- then split and upload photos as this is more user friendly"; asked who sorts: "Admin and Sales"; the mock-up: "Yes,
-- build it as shown".
--
-- A photo sent in one go is kept like any other (survey_photos), under the item key UNSORTED. Admin or Sales then
-- put it under a checklist item: each move is a row here. The newest move is the photo's item. The photo itself is
-- never edited; a photo that is not useful is taken back (survey_photo_withdrawals), never deleted.
--
--   survey_photo_sorts    a photo put under a checklist item: which, by whom, when.
-- None is ever edited or deleted.
-- ===========================================================================

CREATE TABLE survey_photo_sorts (
  id        TEXT PRIMARY KEY,
  photo_id  TEXT NOT NULL REFERENCES survey_photos(id),
  item_key  TEXT NOT NULL CHECK (length(item_key) BETWEEN 2 AND 60 AND item_key NOT GLOB '*[^A-Z0-9-]*' AND item_key <> 'UNSORTED'),
  by_user   TEXT NOT NULL REFERENCES users(id),
  at        TEXT NOT NULL
) STRICT;
CREATE INDEX survey_photo_sorts_by_photo ON survey_photo_sorts (photo_id, at);

CREATE TRIGGER survey_photo_sorts_never_edited BEFORE UPDATE ON survey_photo_sorts BEGIN SELECT RAISE(ABORT, 'a sort is never edited: make a new one'); END;
CREATE TRIGGER survey_photo_sorts_never_deleted BEFORE DELETE ON survey_photo_sorts BEGIN SELECT RAISE(ABORT, 'a sort is never deleted'); END;
