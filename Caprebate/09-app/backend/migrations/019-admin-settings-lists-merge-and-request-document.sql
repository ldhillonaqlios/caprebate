-- ===========================================================================
-- 019 — ADMIN SETTINGS: THE CONFIGURABLE LISTS, A RULE THAT RAISES A DOCUMENT
-- REQUEST, A FIRM MERGED ONTO ONE ALREADY RECORDED, AND THE FIVE ROLES FIXED.
--                                                        CRM 9 of 10, 12 Sep 2026
--
-- The scope is 09-app/CAPREBATE-CRM-DISPOSITION.md, section 20 and rows 14.10,
-- 20.1 to 20.6, and every choice below that is not obvious is a row of its Part E
-- from E119. The code is src/web/vocabularies.ts, src/web/configuration.ts,
-- src/web/automation.ts and src/web/introducers.ts; the screen is
-- src/web/configuration-pages.ts.
--
-- EXTENDED, NEVER REBUILT — WITH TWO REBUILDS, AND EACH IS A CHECK SQLITE CANNOT
-- WIDEN IN PLACE, following migrations 011, 014, 016 and 017 to the letter:
--   `introducers`      its introducer_type CHECK becomes a named trigger pair
--                      reading the configurable list, and it gains the merge's
--                      three columns.
--   `automation_rules` its effect CHECK gains REQUEST_DOCUMENT, and it gains the
--                      document type such a rule asks for.
--
-- WHAT HANGS OFF THE TWO TABLES, RE-DERIVED FROM sqlite_master ON A FRESHLY
-- MIGRATED DATABASE ON 12 SEPTEMBER 2026, NOT REMEMBERED:
--   introducers       four triggers on the table itself — introducers_never_deleted,
--                     introducers_created_via_fixed, and the notice-contact pair —
--                     re-created here verbatim. Named in the bodies of triggers on
--                     OTHER tables: leads_introducer_exists_insert and _update, which
--                     are dropped first and re-created verbatim after, because SQLite
--                     re-parses every trigger on a RENAME. Referenced by name by
--                     contacts, staff_tasks, introducer_share_consents,
--                     introducer_notices and introducer_fees, which survive the drop
--                     and rename with foreign keys off, as 011 records.
--   automation_rules  five triggers on the table itself — never deleted, the stage
--                     pair and the activity pair. No trigger on another table names
--                     it. Referenced by name by automation_runs. The nine seeded rules
--                     are copied row for row.
--   test/configuration.test.ts reads every one of those names back.
--
-- THE NAMED TRIGGER PAIRS THAT HELD A LIST ARE REPLACED BY NAME, as migration 009
-- said a later phase would do: businesses_source, leads_source and
-- staff_tasks_vocabulary. The names are pinned by tests and do not change.
--
-- WHAT IS NOT IN THIS FILE, ON PURPOSE
--   A STAGE, A GATE, A SWITCH OR A PERMISSION AS A ROW. None of them is a list a
--     setting reaches: src/web/configuration.ts refuses each by name, and the
--     roles table below refuses any change at all.
--   THE RECIPROCITY KINDS ON THE ACTIVITY LIST. Reward model A's three kinds stay
--     outside it, held by their own trigger pair (migration 016, untouched), and
--     the list refuses a value named for one.
-- ===========================================================================

-- 1 · foreign keys off. A no-op inside a transaction, so it goes FIRST.
PRAGMA foreign_keys = OFF;

-- 2 · one transaction. All of it, or none of it.
BEGIN;


-- ---------------------------------------------------------------------------
-- 3 · THE CONFIGURABLE LISTS
--
-- A VALUE IS RETIRED, NEVER DELETED, AND ITS CODE IS PERMANENT: records name it.
-- A value the application writes itself is FIXED — the funnel writes WEBSITE, a
-- rule's task is TASK, a firm's type decides its referral source — and a fixed
-- value is never retired. Seeded from the lists the code shipped with, word for
-- word, so nothing anybody reads changes on the day this runs.
-- ---------------------------------------------------------------------------
CREATE TABLE vocabularies (
  list        TEXT NOT NULL CHECK (list IN ('LEAD_SOURCE','PRIORITY','ACTIVITY_TYPE','PROPERTY_TYPE','INTRODUCER_TYPE')),
  code        TEXT NOT NULL CHECK (length(code) BETWEEN 2 AND 60 AND code NOT GLOB '*[^A-Z0-9_]*'),
  label       TEXT NOT NULL CHECK (length(trim(label)) BETWEEN 1 AND 120),
  ord         INTEGER NOT NULL,
  active      INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)),
  fixed       INTEGER NOT NULL DEFAULT 0 CHECK (fixed IN (0,1)),
  source      TEXT NOT NULL CHECK (length(trim(source)) BETWEEN 2 AND 300),
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL,
  PRIMARY KEY (list, code),
  CHECK (fixed = 0 OR active = 1)
) STRICT;

CREATE TRIGGER vocabularies_never_deleted BEFORE DELETE ON vocabularies
BEGIN SELECT RAISE(ABORT, 'a value on a list is retired, never deleted: records still name it'); END;

CREATE TRIGGER vocabularies_code_is_permanent BEFORE UPDATE OF list, code ON vocabularies
WHEN NEW.list IS NOT OLD.list OR NEW.code IS NOT OLD.code
BEGIN SELECT RAISE(ABORT, 'a value''s code is permanent: records name it'); END;

CREATE TRIGGER vocabularies_fixed_is_fixed BEFORE UPDATE OF fixed ON vocabularies
WHEN NEW.fixed IS NOT OLD.fixed
BEGIN SELECT RAISE(ABORT, 'whether the application writes a value itself is fixed by a migration'); END;

CREATE TRIGGER vocabularies_fixed_stays_active BEFORE UPDATE OF active ON vocabularies
WHEN OLD.fixed = 1 AND NEW.active = 0
BEGIN SELECT RAISE(ABORT, 'the application writes this value itself, so it is never retired'); END;

CREATE TRIGGER vocabularies_reciprocity_reserved BEFORE INSERT ON vocabularies
WHEN NEW.list = 'ACTIVITY_TYPE' AND NEW.code IN ('CPD_SESSION','CO_BRANDED_ONE_PAGER','PRIORITY_TURNAROUND')
BEGIN SELECT RAISE(ABORT, 'E_RECIPROCITY_RESERVED: the three reciprocity kinds are reward model A''s, held by their own triggers, and never a value on the task-type list'); END;

INSERT INTO vocabularies (list, code, label, ord, active, fixed, source, created_at, updated_at) VALUES
  ('LEAD_SOURCE', 'WEBSITE', 'Website', 10, 1, 1, 'The lead-source list CRM 2 of 10 adopted. The funnel writes it.', strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('LEAD_SOURCE', 'REFERRAL', 'Referral', 20, 1, 1, 'The lead-source list CRM 2 of 10 adopted. A referral writes it.', strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('LEAD_SOURCE', 'ACCOUNTANT', 'Accountant', 30, 1, 1, 'The lead-source list CRM 2 of 10 adopted. An accountancy firm''s referral writes it.', strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('LEAD_SOURCE', 'ADVISER', 'Adviser', 40, 1, 1, 'The lead-source list CRM 2 of 10 adopted. A tax adviser''s referral writes it.', strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('LEAD_SOURCE', 'OUTBOUND', 'Outbound', 50, 1, 0, 'The lead-source list CRM 2 of 10 adopted.', strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('LEAD_SOURCE', 'EVENT', 'Event', 60, 1, 0, 'The lead-source list CRM 2 of 10 adopted.', strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('LEAD_SOURCE', 'EXISTING_CLIENT', 'Existing client', 70, 1, 0, 'The lead-source list CRM 2 of 10 adopted.', strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('LEAD_SOURCE', 'OTHER', 'Other', 80, 1, 1, 'The lead-source list CRM 2 of 10 adopted. The lead backfill writes it.', strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')),

  ('PRIORITY', 'LOW', 'Low', 10, 1, 0, 'CRM 1 of 10''s priorities.', strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('PRIORITY', 'NORMAL', 'Normal', 20, 1, 1, 'CRM 1 of 10''s priorities. The seed writes it.', strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('PRIORITY', 'HIGH', 'High', 30, 1, 0, 'CRM 1 of 10''s priorities.', strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')),

  ('ACTIVITY_TYPE', 'CALL', 'Call', 10, 1, 1, 'The full specification''s 10.4. A seeded rule and the firm''s contact log write it.', strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('ACTIVITY_TYPE', 'EMAIL', 'Email', 20, 1, 1, 'The full specification''s 10.4. The firm''s contact log writes it.', strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('ACTIVITY_TYPE', 'MEETING', 'Meeting', 30, 1, 1, 'The full specification''s 10.4. The firm''s contact log writes it.', strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('ACTIVITY_TYPE', 'NOTE', 'Note', 40, 1, 1, 'The full specification''s 10.4. The firm''s contact log writes it.', strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('ACTIVITY_TYPE', 'TASK', 'Task', 50, 1, 1, 'The full specification''s 10.4. A rule''s task and every migrated next action write it.', strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('ACTIVITY_TYPE', 'SURVEY', 'Survey', 60, 1, 1, 'The full specification''s 10.4. A seeded rule writes it.', strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('ACTIVITY_TYPE', 'DOCUMENT_REQUEST', 'Document request', 70, 1, 1, 'The full specification''s 10.4. The information-request rule writes it.', strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('ACTIVITY_TYPE', 'REVIEW', 'Review', 80, 1, 1, 'The full specification''s 10.4. A seeded rule writes it.', strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('ACTIVITY_TYPE', 'OTHER', 'Other', 90, 1, 1, 'The full specification''s 10.4. The firm''s contact log writes it.', strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')),

  ('PROPERTY_TYPE', 'CARE_HOME', 'Care home', 10, 1, 0, 'Seeded by CRM 9 of 10 from the sectors the build serves. It was free text until then.', strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('PROPERTY_TYPE', 'NURSING_HOME', 'Nursing home', 20, 1, 0, 'Seeded by CRM 9 of 10 from the sectors the build serves.', strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('PROPERTY_TYPE', 'SUPPORTED_LIVING', 'Supported living scheme', 30, 1, 0, 'Seeded by CRM 9 of 10 from the sectors the build serves.', strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('PROPERTY_TYPE', 'DENTAL_PRACTICE', 'Dental practice', 40, 1, 0, 'Seeded by CRM 9 of 10 from the sectors the build serves.', strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('PROPERTY_TYPE', 'GP_SURGERY', 'GP surgery', 50, 1, 0, 'Seeded by CRM 9 of 10 from the sectors the build serves.', strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('PROPERTY_TYPE', 'PRIVATE_HOSPITAL', 'Private hospital', 60, 1, 0, 'Seeded by CRM 9 of 10 from the sectors the build serves.', strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('PROPERTY_TYPE', 'CLINIC', 'Clinic or treatment centre', 70, 1, 0, 'Seeded by CRM 9 of 10.', strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('PROPERTY_TYPE', 'MIXED_USE', 'Mixed use', 80, 1, 0, 'Seeded by CRM 9 of 10.', strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('PROPERTY_TYPE', 'OTHER', 'Other', 90, 1, 0, 'Seeded by CRM 9 of 10.', strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')),

  ('INTRODUCER_TYPE', 'ACCOUNTANT_FIRM', 'Accountancy firm', 10, 1, 1, 'CRM 5 of 10''s introducer types. It decides a referral''s source.', strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('INTRODUCER_TYPE', 'TAX_ADVISER', 'Tax adviser', 20, 1, 1, 'CRM 5 of 10''s introducer types. It decides a referral''s source.', strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('INTRODUCER_TYPE', 'AGENT', 'Agent', 30, 1, 1, 'CRM 5 of 10''s introducer types. It decides a referral''s source.', strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('INTRODUCER_TYPE', 'SOLICITOR', 'Solicitor', 40, 1, 1, 'CRM 5 of 10''s introducer types. It decides a referral''s source.', strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('INTRODUCER_TYPE', 'OTHER', 'Other', 50, 1, 1, 'CRM 5 of 10''s introducer types. It decides a referral''s source.', strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now'));

-- A PROPERTY TYPE RECORDED AS FREE TEXT THAT MATCHES A VALUE BECOMES THAT VALUE. One that does not is left exactly as
-- it was written — nothing is guessed — and reads as written; the trigger pair below refuses only a NEW value off the list.
UPDATE properties
   SET property_type = (SELECT v.code FROM vocabularies v WHERE v.list = 'PROPERTY_TYPE'
                         AND (lower(v.label) = lower(trim(properties.property_type)) OR v.code = upper(trim(properties.property_type))))
 WHERE property_type IS NOT NULL
   AND EXISTS (SELECT 1 FROM vocabularies v WHERE v.list = 'PROPERTY_TYPE'
                AND (lower(v.label) = lower(trim(properties.property_type)) OR v.code = upper(trim(properties.property_type))));


-- ---------------------------------------------------------------------------
-- 4 · THE NAMED TRIGGER PAIRS THAT HELD A LIST, REPLACED BY NAME TO READ IT
--
-- A NEW value must be an ACTIVE one. A record that keeps the value it already
-- holds is never refused for it — an UPDATE that does not change it passes.
-- ---------------------------------------------------------------------------
DROP TRIGGER businesses_source_insert;
DROP TRIGGER businesses_source_update;

CREATE TRIGGER businesses_source_insert BEFORE INSERT ON businesses
WHEN NEW.source IS NOT NULL
 AND NOT EXISTS (SELECT 1 FROM vocabularies v WHERE v.list = 'LEAD_SOURCE' AND v.code = NEW.source AND v.active = 1)
BEGIN SELECT RAISE(ABORT, 'businesses.source is not on the lead-source list'); END;

CREATE TRIGGER businesses_source_update BEFORE UPDATE OF source ON businesses
WHEN NEW.source IS NOT NULL AND NEW.source IS NOT OLD.source
 AND NOT EXISTS (SELECT 1 FROM vocabularies v WHERE v.list = 'LEAD_SOURCE' AND v.code = NEW.source AND v.active = 1)
BEGIN SELECT RAISE(ABORT, 'businesses.source is not on the lead-source list'); END;

DROP TRIGGER leads_source_insert;
DROP TRIGGER leads_source_update;

CREATE TRIGGER leads_source_insert BEFORE INSERT ON leads
WHEN NOT EXISTS (SELECT 1 FROM vocabularies v WHERE v.list = 'LEAD_SOURCE' AND v.code = NEW.source AND v.active = 1)
BEGIN SELECT RAISE(ABORT, 'leads.source is not on the lead-source list'); END;

CREATE TRIGGER leads_source_update BEFORE UPDATE OF source ON leads
WHEN NEW.source IS NOT OLD.source
 AND NOT EXISTS (SELECT 1 FROM vocabularies v WHERE v.list = 'LEAD_SOURCE' AND v.code = NEW.source AND v.active = 1)
BEGIN SELECT RAISE(ABORT, 'leads.source is not on the lead-source list'); END;

DROP TRIGGER staff_tasks_vocabulary_insert;
DROP TRIGGER staff_tasks_vocabulary_update;

-- The reciprocity kinds stay outside the list, and their own pair (migration 016) still decides where one may be.
CREATE TRIGGER staff_tasks_vocabulary_insert BEFORE INSERT ON staff_tasks
WHEN (NEW.activity_type NOT IN ('CPD_SESSION','CO_BRANDED_ONE_PAGER','PRIORITY_TURNAROUND')
      AND NOT EXISTS (SELECT 1 FROM vocabularies v WHERE v.list = 'ACTIVITY_TYPE' AND v.code = NEW.activity_type AND v.active = 1))
  OR (NEW.priority IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM vocabularies v WHERE v.list = 'PRIORITY' AND v.code = NEW.priority AND v.active = 1))
BEGIN SELECT RAISE(ABORT, 'staff_tasks.activity_type or priority is not on the list'); END;

CREATE TRIGGER staff_tasks_vocabulary_update BEFORE UPDATE OF activity_type, priority ON staff_tasks
WHEN (NEW.activity_type IS NOT OLD.activity_type
      AND NEW.activity_type NOT IN ('CPD_SESSION','CO_BRANDED_ONE_PAGER','PRIORITY_TURNAROUND')
      AND NOT EXISTS (SELECT 1 FROM vocabularies v WHERE v.list = 'ACTIVITY_TYPE' AND v.code = NEW.activity_type AND v.active = 1))
  OR (NEW.priority IS NOT NULL AND NEW.priority IS NOT OLD.priority
      AND NOT EXISTS (SELECT 1 FROM vocabularies v WHERE v.list = 'PRIORITY' AND v.code = NEW.priority AND v.active = 1))
BEGIN SELECT RAISE(ABORT, 'staff_tasks.activity_type or priority is not on the list'); END;

-- A property's type, free text until now, is a value on its list (disposition 20.2).
CREATE TRIGGER properties_property_type_insert BEFORE INSERT ON properties
WHEN NEW.property_type IS NOT NULL
 AND NOT EXISTS (SELECT 1 FROM vocabularies v WHERE v.list = 'PROPERTY_TYPE' AND v.code = NEW.property_type AND v.active = 1)
BEGIN SELECT RAISE(ABORT, 'properties.property_type is not on the property-type list'); END;

CREATE TRIGGER properties_property_type_update BEFORE UPDATE OF property_type ON properties
WHEN NEW.property_type IS NOT NULL AND NEW.property_type IS NOT OLD.property_type
 AND NOT EXISTS (SELECT 1 FROM vocabularies v WHERE v.list = 'PROPERTY_TYPE' AND v.code = NEW.property_type AND v.active = 1)
BEGIN SELECT RAISE(ABORT, 'properties.property_type is not on the property-type list'); END;


-- ---------------------------------------------------------------------------
-- 5 · THE MERGE — a firm the public referral form made, onto the firm already recorded
--
-- ONE ROW PER MERGE, recorded before anything moves and completed once, by an
-- administrator. A person at a firm stays at that firm EXCEPT inside an open merge
-- from that firm to that firm — the replaced contacts_introducer_fixed below.
-- ---------------------------------------------------------------------------
CREATE TABLE introducer_merges (
  id            TEXT PRIMARY KEY,
  from_id       TEXT NOT NULL REFERENCES introducers(id),
  into_id       TEXT NOT NULL REFERENCES introducers(id),
  reason        TEXT NOT NULL CHECK (length(trim(reason)) BETWEEN 2 AND 1000),
  merged_by     TEXT NOT NULL REFERENCES users(id),
  started_at    TEXT NOT NULL,
  completed_at  TEXT,
  leads_moved   INTEGER CHECK (leads_moved IS NULL OR leads_moved >= 0),
  people_moved  INTEGER CHECK (people_moved IS NULL OR people_moved >= 0),
  tasks_moved   INTEGER CHECK (tasks_moved IS NULL OR tasks_moved >= 0),
  CHECK (from_id <> into_id),
  CHECK ((completed_at IS NULL) = (leads_moved IS NULL) AND (completed_at IS NULL) = (people_moved IS NULL)
         AND (completed_at IS NULL) = (tasks_moved IS NULL))
) STRICT;

CREATE UNIQUE INDEX introducer_merges_from_once_uq ON introducer_merges(from_id);

CREATE TRIGGER introducer_merges_never_deleted BEFORE DELETE ON introducer_merges
BEGIN SELECT RAISE(ABORT, 'a merge is never deleted: it is the record of who referred what'); END;

CREATE TRIGGER introducer_merges_completed_once BEFORE UPDATE ON introducer_merges
WHEN OLD.completed_at IS NOT NULL OR NEW.id IS NOT OLD.id OR NEW.from_id IS NOT OLD.from_id OR NEW.into_id IS NOT OLD.into_id
  OR NEW.reason IS NOT OLD.reason OR NEW.merged_by IS NOT OLD.merged_by OR NEW.started_at IS NOT OLD.started_at
BEGIN SELECT RAISE(ABORT, 'a merge is recorded once and completed once'); END;

CREATE TRIGGER introducer_merges_by_an_administrator BEFORE INSERT ON introducer_merges
WHEN NOT EXISTS (SELECT 1 FROM users u WHERE u.id = NEW.merged_by AND u.role = 'ADMIN' AND u.disabled_at IS NULL)
BEGIN SELECT RAISE(ABORT, 'a firm is merged by an administrator'); END;

DROP TRIGGER contacts_introducer_fixed;

-- A person at a firm stays at that firm. Moving them would move who referred what — except inside the merge's own
-- open row, from exactly that firm to exactly that one. The message is unchanged.
CREATE TRIGGER contacts_introducer_fixed BEFORE UPDATE OF introducer_id ON contacts
WHEN OLD.introducer_id IS NOT NEW.introducer_id
 AND NOT EXISTS (SELECT 1 FROM introducer_merges m WHERE m.from_id = OLD.introducer_id AND m.into_id = NEW.introducer_id
                   AND m.completed_at IS NULL)
BEGIN SELECT RAISE(ABORT, 'a contact at an introducer stays at that introducer'); END;


-- ---------------------------------------------------------------- 6 · introducers, rebuilt

DROP TRIGGER leads_introducer_exists_insert;
DROP TRIGGER leads_introducer_exists_update;

CREATE TABLE introducers_new (
  id                       TEXT PRIMARY KEY,
  firm_name                TEXT NOT NULL CHECK (length(trim(firm_name)) BETWEEN 1 AND 300),
  -- A value on the configurable introducer-type list, by the named trigger pair below. NULL is not recorded (N4).
  introducer_type          TEXT,
  owner_id                 TEXT REFERENCES users(id),
  relationship_started_on  TEXT CHECK (relationship_started_on GLOB '[0-9][0-9][0-9][0-9]-[01][0-9]-[0-3][0-9]'),
  notice_contact_id        TEXT REFERENCES contacts(id),
  notes                    TEXT,
  created_via              TEXT NOT NULL CHECK (created_via IN ('STAFF','PUBLIC_FORM')),
  created_at               TEXT NOT NULL,
  updated_at               TEXT NOT NULL,
  -- CRM 9 of 10: merged onto a firm already recorded — once, by a merge, with who and when.
  merged_into_id           TEXT REFERENCES introducers(id),
  merged_at                TEXT,
  merged_by                TEXT REFERENCES users(id),
  CHECK ((merged_into_id IS NULL) = (merged_at IS NULL) AND (merged_into_id IS NULL) = (merged_by IS NULL)),
  CHECK (merged_into_id IS NULL OR merged_into_id <> id)
) STRICT;

INSERT INTO introducers_new (id, firm_name, introducer_type, owner_id, relationship_started_on, notice_contact_id, notes,
                             created_via, created_at, updated_at, merged_into_id, merged_at, merged_by)
SELECT id, firm_name, introducer_type, owner_id, relationship_started_on, notice_contact_id, notes,
       created_via, created_at, updated_at, NULL, NULL, NULL
  FROM introducers;

DROP TABLE introducers;
ALTER TABLE introducers_new RENAME TO introducers;

CREATE TRIGGER introducers_never_deleted BEFORE DELETE ON introducers
BEGIN SELECT RAISE(ABORT, 'an introducer is never deleted: leads and notices still name it'); END;

CREATE TRIGGER introducers_created_via_fixed BEFORE UPDATE OF created_via ON introducers
BEGIN SELECT RAISE(ABORT, 'an introducer keeps the route it was created by'); END;

CREATE TRIGGER introducers_notice_contact_is_the_firms_insert BEFORE INSERT ON introducers
WHEN NEW.notice_contact_id IS NOT NULL
 AND NOT EXISTS (SELECT 1 FROM contacts c WHERE c.id = NEW.notice_contact_id AND c.introducer_id = NEW.id)
BEGIN SELECT RAISE(ABORT, 'the person a progress notice goes to must be one of the firm''s own contacts'); END;

CREATE TRIGGER introducers_notice_contact_is_the_firms_update BEFORE UPDATE OF notice_contact_id ON introducers
WHEN NEW.notice_contact_id IS NOT NULL
 AND NOT EXISTS (SELECT 1 FROM contacts c WHERE c.id = NEW.notice_contact_id AND c.introducer_id = NEW.id)
BEGIN SELECT RAISE(ABORT, 'the person a progress notice goes to must be one of the firm''s own contacts'); END;

CREATE TRIGGER introducers_type_insert BEFORE INSERT ON introducers
WHEN NEW.introducer_type IS NOT NULL
 AND NOT EXISTS (SELECT 1 FROM vocabularies v WHERE v.list = 'INTRODUCER_TYPE' AND v.code = NEW.introducer_type AND v.active = 1)
BEGIN SELECT RAISE(ABORT, 'introducers.introducer_type is not on the introducer-type list'); END;

CREATE TRIGGER introducers_type_update BEFORE UPDATE OF introducer_type ON introducers
WHEN NEW.introducer_type IS NOT NULL AND NEW.introducer_type IS NOT OLD.introducer_type
 AND NOT EXISTS (SELECT 1 FROM vocabularies v WHERE v.list = 'INTRODUCER_TYPE' AND v.code = NEW.introducer_type AND v.active = 1)
BEGIN SELECT RAISE(ABORT, 'introducers.introducer_type is not on the introducer-type list'); END;

CREATE TRIGGER introducers_merged_once BEFORE UPDATE OF merged_into_id, merged_at, merged_by ON introducers
WHEN OLD.merged_into_id IS NOT NULL
BEGIN SELECT RAISE(ABORT, 'a firm merged onto another stays merged: the merge is the record of who referred what'); END;

CREATE TRIGGER introducers_merged_only_by_a_merge BEFORE UPDATE OF merged_into_id ON introducers
WHEN NEW.merged_into_id IS NOT NULL
 AND NOT EXISTS (SELECT 1 FROM introducer_merges m WHERE m.from_id = NEW.id AND m.into_id = NEW.merged_into_id AND m.completed_at IS NULL)
BEGIN SELECT RAISE(ABORT, 'a firm is merged only by a merge'); END;

CREATE TRIGGER introducers_not_onto_a_merged_firm BEFORE UPDATE OF merged_into_id ON introducers
WHEN NEW.merged_into_id IS NOT NULL
 AND EXISTS (SELECT 1 FROM introducers i WHERE i.id = NEW.merged_into_id AND i.merged_into_id IS NOT NULL)
BEGIN SELECT RAISE(ABORT, 'a firm is merged onto a firm still recorded, never onto one already merged away'); END;

CREATE TRIGGER leads_introducer_exists_insert BEFORE INSERT ON leads
WHEN NEW.introducer_id IS NOT NULL
 AND NOT EXISTS (SELECT 1 FROM introducers i WHERE i.id = NEW.introducer_id)
BEGIN SELECT RAISE(ABORT, 'leads.introducer_id must name an introducer that exists'); END;

CREATE TRIGGER leads_introducer_exists_update BEFORE UPDATE OF introducer_id ON leads
WHEN NEW.introducer_id IS NOT NULL
 AND NOT EXISTS (SELECT 1 FROM introducers i WHERE i.id = NEW.introducer_id)
BEGIN SELECT RAISE(ABORT, 'leads.introducer_id must name an introducer that exists'); END;


-- ---------------------------------------------------------------- 7 · automation_rules, rebuilt
--
-- REQUEST_DOCUMENT: a rule that asks the client for a document of a type something
-- can receive, raised through createDocumentRequest and never a second insert. The
-- request says why and what it holds up — `task_title` and `task_description`,
-- which the client reads — and is due the rule's days after the event. A rule
-- raised BY a document request may never raise one: it would ask again for ever.
-- ---------------------------------------------------------------------------
CREATE TABLE automation_rules_new (
  id                 TEXT PRIMARY KEY,
  label              TEXT NOT NULL CHECK (length(trim(label)) BETWEEN 1 AND 200),
  trigger_event      TEXT NOT NULL CHECK (trigger_event IN
                       ('LEAD_CREATED','STAGE_ENTERED','DOCUMENT_REQUESTED','TASK_COMPLETED','OWNER_CHANGED')),
  trigger_stage      TEXT,
  trigger_activity   TEXT,
  effect             TEXT NOT NULL CHECK (effect IN
                       ('CREATE_TASK','FOLLOW_UP','NOTIFY_OWNER','INFORMATION_REQUEST_TASKS','REQUEST_DOCUMENT')),
  task_title         TEXT,
  task_description   TEXT,
  task_activity_type TEXT,
  task_priority      TEXT,
  due_in_days        INTEGER CHECK (due_in_days IS NULL OR due_in_days BETWEEN 0 AND 365),
  assign_to          TEXT CHECK (assign_to IN ('SUBJECT_OWNER','ROLE')),
  assign_role        TEXT CHECK (assign_role IN ('ADMIN','SALES','ACCOUNTING','SURVEYING')),
  attach_to          TEXT NOT NULL DEFAULT 'SUBJECT' CHECK (attach_to IN ('SUBJECT','ORGANISATION')),
  active             INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)),
  ord                INTEGER NOT NULL,
  source             TEXT NOT NULL,
  created_at         TEXT NOT NULL,
  updated_at         TEXT NOT NULL,
  -- CRM 9 of 10: the document type a REQUEST_DOCUMENT rule asks for — one something can receive, by the trigger pair below.
  request_type       TEXT REFERENCES document_types(code),
  CHECK (trigger_event = 'STAGE_ENTERED' OR trigger_stage IS NULL),
  CHECK (trigger_event = 'TASK_COMPLETED' OR trigger_activity IS NULL),
  CHECK (effect IN ('NOTIFY_OWNER','REQUEST_DOCUMENT')
         OR (task_activity_type IS NOT NULL AND due_in_days IS NOT NULL AND assign_to IS NOT NULL)),
  CHECK (effect NOT IN ('CREATE_TASK','FOLLOW_UP') OR (task_title IS NOT NULL AND length(trim(task_title)) > 0)),
  CHECK (assign_to IS NOT 'ROLE' OR assign_role IS NOT NULL),
  CHECK (effect <> 'NOTIFY_OWNER' OR attach_to = 'SUBJECT'),
  CHECK ((effect = 'REQUEST_DOCUMENT') = (request_type IS NOT NULL)),
  CHECK (effect <> 'REQUEST_DOCUMENT'
         OR (trigger_event <> 'DOCUMENT_REQUESTED' AND due_in_days IS NOT NULL AND attach_to = 'SUBJECT'
             AND task_title IS NOT NULL AND length(trim(task_title)) > 0
             AND task_description IS NOT NULL AND length(trim(task_description)) > 0))
) STRICT;

INSERT INTO automation_rules_new (id, label, trigger_event, trigger_stage, trigger_activity, effect, task_title, task_description,
                                  task_activity_type, task_priority, due_in_days, assign_to, assign_role, attach_to, active, ord,
                                  source, created_at, updated_at, request_type)
SELECT id, label, trigger_event, trigger_stage, trigger_activity, effect, task_title, task_description,
       task_activity_type, task_priority, due_in_days, assign_to, assign_role, attach_to, active, ord,
       source, created_at, updated_at, NULL
  FROM automation_rules;

DROP TABLE automation_rules;
ALTER TABLE automation_rules_new RENAME TO automation_rules;

CREATE TRIGGER automation_rules_never_deleted BEFORE DELETE ON automation_rules
BEGIN SELECT RAISE(ABORT, 'an automation rule is retired by setting it inactive, never deleted: its runs still name it'); END;

CREATE TRIGGER automation_rules_stage_insert BEFORE INSERT ON automation_rules
WHEN NEW.trigger_stage IS NOT NULL AND NEW.trigger_stage NOT IN
  ('ENQUIRY','ASSESSMENT','ENGAGEMENT','DATA_GATHERING','SURVEY','VALUATION','TAX_ADVISER_SIGNOFF',
   'REPORTS','INVOICE','DEFENCE_PACK','CLOSED',
   'DECLINED_AT_ENQUIRY','CLIENT_DID_NOT_PROCEED','CLIENT_DECLINED_TO_SIGN','REASONED_NEGATIVE',
   'CLIENT_WITHDREW','OUTSIDE_AMENDMENT_WINDOW','CANCELLED','LOST','ON_HOLD')
BEGIN SELECT RAISE(ABORT, 'automation_rules.trigger_stage is not a stage of the operating procedure'); END;

CREATE TRIGGER automation_rules_stage_update BEFORE UPDATE OF trigger_stage ON automation_rules
WHEN NEW.trigger_stage IS NOT NULL AND NEW.trigger_stage NOT IN
  ('ENQUIRY','ASSESSMENT','ENGAGEMENT','DATA_GATHERING','SURVEY','VALUATION','TAX_ADVISER_SIGNOFF',
   'REPORTS','INVOICE','DEFENCE_PACK','CLOSED',
   'DECLINED_AT_ENQUIRY','CLIENT_DID_NOT_PROCEED','CLIENT_DECLINED_TO_SIGN','REASONED_NEGATIVE',
   'CLIENT_WITHDREW','OUTSIDE_AMENDMENT_WINDOW','CANCELLED','LOST','ON_HOLD')
BEGIN SELECT RAISE(ABORT, 'automation_rules.trigger_stage is not a stage of the operating procedure'); END;

-- The activity pair now reads the lists: a rule may listen for any value on the activity list, and gives its task an
-- active one. It never carries a reciprocity kind (migration 012 never admitted one, and it still does not).
CREATE TRIGGER automation_rules_activity_insert BEFORE INSERT ON automation_rules
WHEN (NEW.trigger_activity IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM vocabularies v WHERE v.list = 'ACTIVITY_TYPE' AND v.code = NEW.trigger_activity))
  OR (NEW.task_activity_type IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM vocabularies v WHERE v.list = 'ACTIVITY_TYPE' AND v.code = NEW.task_activity_type AND v.active = 1))
  OR (NEW.task_priority IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM vocabularies v WHERE v.list = 'PRIORITY' AND v.code = NEW.task_priority AND v.active = 1))
BEGIN SELECT RAISE(ABORT, 'an automation rule names an activity type or a priority that is not on the list'); END;

CREATE TRIGGER automation_rules_activity_update BEFORE UPDATE OF trigger_activity, task_activity_type, task_priority ON automation_rules
WHEN (NEW.trigger_activity IS NOT NULL AND NEW.trigger_activity IS NOT OLD.trigger_activity
      AND NOT EXISTS (SELECT 1 FROM vocabularies v WHERE v.list = 'ACTIVITY_TYPE' AND v.code = NEW.trigger_activity))
  OR (NEW.task_activity_type IS NOT NULL AND NEW.task_activity_type IS NOT OLD.task_activity_type
      AND NOT EXISTS (SELECT 1 FROM vocabularies v WHERE v.list = 'ACTIVITY_TYPE' AND v.code = NEW.task_activity_type AND v.active = 1))
  OR (NEW.task_priority IS NOT NULL AND NEW.task_priority IS NOT OLD.task_priority
      AND NOT EXISTS (SELECT 1 FROM vocabularies v WHERE v.list = 'PRIORITY' AND v.code = NEW.task_priority AND v.active = 1))
BEGIN SELECT RAISE(ABORT, 'an automation rule names an activity type or a priority that is not on the list'); END;

CREATE TRIGGER automation_rules_request_receivable_insert BEFORE INSERT ON automation_rules
WHEN NEW.request_type IS NOT NULL
 AND NOT EXISTS (SELECT 1 FROM document_types t WHERE t.code = NEW.request_type AND t.handler_type IS NOT NULL AND t.active = 1)
BEGIN SELECT RAISE(ABORT, 'E_NO_RECEIPT_POLICY: a rule asks for a document only of a type something can receive'); END;

CREATE TRIGGER automation_rules_request_receivable_update BEFORE UPDATE OF request_type ON automation_rules
WHEN NEW.request_type IS NOT NULL AND NEW.request_type IS NOT OLD.request_type
 AND NOT EXISTS (SELECT 1 FROM document_types t WHERE t.code = NEW.request_type AND t.handler_type IS NOT NULL AND t.active = 1)
BEGIN SELECT RAISE(ABORT, 'E_NO_RECEIPT_POLICY: a rule asks for a document only of a type something can receive'); END;


-- ---------------------------------------------------------------------------
-- 8 · THE FIVE ROLES ARE FIXED
--
-- A sixth role, or a change to one of the five, is a question for Lakhbir and then a
-- migration — never a row a setting could add. What each role may do is src/authz.ts.
-- ---------------------------------------------------------------------------
CREATE TRIGGER roles_fixed_insert BEFORE INSERT ON roles
BEGIN SELECT RAISE(ABORT, 'the five roles are fixed: a sixth is a question for Lakhbir, not a setting'); END;

CREATE TRIGGER roles_fixed_update BEFORE UPDATE ON roles
BEGIN SELECT RAISE(ABORT, 'the five roles are fixed: a sixth is a question for Lakhbir, not a setting'); END;

CREATE TRIGGER roles_fixed_delete BEFORE DELETE ON roles
BEGIN SELECT RAISE(ABORT, 'the five roles are fixed: a sixth is a question for Lakhbir, not a setting'); END;


-- 9 · THE GUARD. Zero violations, or this migration does not happen at all.
CREATE TABLE _fk_check_guard (ok INTEGER NOT NULL CHECK (ok = 0)) STRICT;
INSERT INTO _fk_check_guard (ok) SELECT count(*) FROM pragma_foreign_key_check;
DROP TABLE _fk_check_guard;

-- 10 · commit.
COMMIT;

-- 11 · and back on.
PRAGMA foreign_keys = ON;
