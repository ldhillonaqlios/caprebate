-- ===========================================================================
-- 018 — SAVED VIEWS, AND THE LEAD'S NEXT ACTION RETIRED INTO A TASK.
--                                                        CRM 9 of 10, 12 Sep 2026
--
-- The scope is 09-app/CAPREBATE-CRM-DISPOSITION.md, section 16 and row E33, and
-- every choice below that is not obvious is a row of its Part E from E119. The
-- code is src/web/lists.ts; the pages are src/web/lists-pages.ts.
--
-- EXTENDED, NEVER REBUILT. One new table, one data carry-over and two named
-- triggers. Nothing hanging off `leads` or `staff_tasks` is dropped or changed.
--
-- WHAT IS NOT IN THIS FILE, ON PURPOSE
--   A FILTER OR A SORT AS SQL. A saved view stores the list's own parameters as
--     a query string that src/web/lists.ts reads through a FIXED table of keys —
--     an unknown key is dropped, and an ORDER BY is never built from a stored
--     value. The column holds words, not SQL.
--   A PERMISSION. Who may share a view is ADMIN, and the trigger below reads the
--     role of the person who made the row; it grants nothing.
-- ===========================================================================

-- 1 · foreign keys off. A no-op inside a transaction, so it goes FIRST.
PRAGMA foreign_keys = OFF;

-- 2 · one transaction. All of it, or none of it.
BEGIN;


-- ---------------------------------------------------------------------------
-- 3 · SAVED VIEWS — a person's own, and the shared ones ADMIN sets
--
-- A VIEW IS RETIRED, NEVER EDITED OR DELETED. Changing one is saving another,
-- so a view somebody shared cannot quietly become a different list under the
-- same name. It is retired by the person who made it, or — a shared one — by an
-- administrator, and a trigger holds both.
-- ---------------------------------------------------------------------------
CREATE TABLE saved_views (
  id          TEXT PRIMARY KEY,
  list        TEXT NOT NULL CHECK (list IN ('CLAIMS','LEADS')),
  name        TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 120),
  -- The list's parameters as a query string of known keys, read by src/web/lists.ts.
  params      TEXT NOT NULL CHECK (length(params) BETWEEN 1 AND 2000),
  shared      INTEGER NOT NULL DEFAULT 0 CHECK (shared IN (0,1)),
  created_by  TEXT NOT NULL REFERENCES users(id),
  created_at  TEXT NOT NULL,
  retired_at  TEXT,
  retired_by  TEXT REFERENCES users(id),
  CHECK ((retired_at IS NULL) = (retired_by IS NULL))
) STRICT;

CREATE INDEX saved_views_list_idx ON saved_views(list, shared, created_by);

CREATE TRIGGER saved_views_never_deleted BEFORE DELETE ON saved_views
BEGIN SELECT RAISE(ABORT, 'a saved view is retired, never deleted'); END;

CREATE TRIGGER saved_views_shared_by_admin BEFORE INSERT ON saved_views
WHEN NEW.shared = 1
 AND NOT EXISTS (SELECT 1 FROM users u WHERE u.id = NEW.created_by AND u.role = 'ADMIN' AND u.disabled_at IS NULL)
BEGIN SELECT RAISE(ABORT, 'a shared view is set by an administrator'); END;

CREATE TRIGGER saved_views_retired_not_edited BEFORE UPDATE ON saved_views
WHEN NEW.id IS NOT OLD.id OR NEW.list IS NOT OLD.list OR NEW.name IS NOT OLD.name OR NEW.params IS NOT OLD.params
  OR NEW.shared IS NOT OLD.shared OR NEW.created_by IS NOT OLD.created_by OR NEW.created_at IS NOT OLD.created_at
  OR OLD.retired_at IS NOT NULL
BEGIN SELECT RAISE(ABORT, 'a saved view is retired, never edited: save another'); END;

CREATE TRIGGER saved_views_retired_by_its_owner BEFORE UPDATE OF retired_by ON saved_views
WHEN NEW.retired_by IS NOT NULL AND NEW.retired_by IS NOT OLD.created_by
 AND NOT (OLD.shared = 1 AND EXISTS (SELECT 1 FROM users u WHERE u.id = NEW.retired_by AND u.role = 'ADMIN' AND u.disabled_at IS NULL))
BEGIN SELECT RAISE(ABORT, 'a view is retired by the person who saved it, or a shared one by an administrator'); END;


-- ---------------------------------------------------------------------------
-- 4 · THE LEAD'S NEXT ACTION BECOMES A TASK — carried over, then retired
--
-- Row E33 kept `leads.next_action` as free text "for now" and put its retirement
-- in terms to CRM 9 of 10, whose lists sort by next action: one sort must read one
-- source. Migration 012's section 6 is followed to the letter. Every non-empty one
-- becomes an OPEN task on its lead, owned by the lead's owner where it has one and
-- due on the recorded date where it is one. A task on a lead is never a claim's
-- next action (staff_tasks' own CHECK), so a lead's next action is READ as its
-- earliest open task — src/web/leads.ts and src/web/lists.ts both say so.
-- NOTHING IS INVENTED: a lead with no owner carries an unowned task, and a lead
-- that recorded no next action gets none.
--
-- Then both columns are emptied, and two named triggers refuse a new value —
-- migration 004's idiom for a retired field, as 012 used it for the claim.
-- ---------------------------------------------------------------------------
INSERT INTO staff_tasks (id, title, description, owner_id, owner_role, due_on, priority, status, activity_type,
                         business_id, property_id, claim_id, lead_id, contact_id, fact_id, recurrence, recurred_from_id,
                         is_next_action, origin, automation_run_id, created_by, created_at, updated_at)
SELECT lower(hex(randomblob(16))),
       substr(trim(l.next_action), 1, 300),
       CASE WHEN length(trim(l.next_action)) > 300 THEN trim(l.next_action) ELSE NULL END,
       l.owner_id, NULL,
       CASE WHEN l.next_action_due GLOB '[0-9][0-9][0-9][0-9]-[01][0-9]-[0-3][0-9]' THEN l.next_action_due ELSE NULL END,
       NULL, 'OPEN', 'TASK', l.business_id, NULL, NULL, l.id, NULL, NULL, NULL, NULL,
       0, 'MIGRATION', NULL, NULL, l.updated_at, l.updated_at
  FROM leads l
 WHERE l.next_action IS NOT NULL AND length(trim(l.next_action)) > 0;

UPDATE leads SET next_action = NULL, next_action_due = NULL
 WHERE next_action IS NOT NULL OR next_action_due IS NOT NULL;

CREATE TRIGGER leads_next_action_retired_insert BEFORE INSERT ON leads
WHEN NEW.next_action IS NOT NULL OR NEW.next_action_due IS NOT NULL
BEGIN SELECT RAISE(ABORT, 'leads.next_action is retired: a lead''s next action is a staff task on the lead, with an owner and a due date'); END;

CREATE TRIGGER leads_next_action_retired_update BEFORE UPDATE OF next_action, next_action_due ON leads
WHEN NEW.next_action IS NOT NULL OR NEW.next_action_due IS NOT NULL
BEGIN SELECT RAISE(ABORT, 'leads.next_action is retired: a lead''s next action is a staff task on the lead, with an owner and a due date'); END;


-- 5 · THE GUARD. Zero violations, or this migration does not happen at all.
CREATE TABLE _fk_check_guard (ok INTEGER NOT NULL CHECK (ok = 0)) STRICT;
INSERT INTO _fk_check_guard (ok) SELECT count(*) FROM pragma_foreign_key_check;
DROP TABLE _fk_check_guard;

-- 6 · commit.
COMMIT;

-- 7 · and back on.
PRAGMA foreign_keys = ON;
