-- ===========================================================================
-- 014 — INTRODUCERS AND THE REFERRAL CHANNEL.            CRM 5 of 10, 11 Sep 2026
--
-- The scope is 09-app/CAPREBATE-CRM-DISPOSITION.md, section 12 and rows B4.6 and
-- B4.7, and every choice below that is not obvious is recorded in its Part E
-- with the reason. The mechanics are the Accountant Referral Network paper,
-- section 5 (08-monday-doc-exports/12552691718__Accountant-Referral-Network.md);
-- src/web/introducers.ts carries its words.
--
-- EXTENDED, NEVER REBUILT — WITH TWO REBUILDS, AND BOTH ARE A CHECK THAT SQLITE
-- CANNOT WIDEN IN PLACE. "The people at the firm are contacts of type
-- INTRODUCER", and a contact had to belong to an organisation or a lead. And what
-- happens with a firm is a staff task — CRM 3 of 10's decision, held by a test
-- that no second activity table exists — and a task had to be about an
-- organisation or a lead. Both rebuilds follow migration 011 to the letter.
-- Everything else here is a new table, an ADD COLUMN, or a named trigger.
--
-- WHAT HANGS OFF THE TWO TABLES, RE-DERIVED FROM sqlite_master ON A FRESHLY
-- MIGRATED DATABASE ON 11 SEPTEMBER 2026, NOT REMEMBERED:
--   contacts     contacts_business_idx, contacts_lead_idx; the contact-type pair
--                (009, re-created by 011); the lead-same-organisation pair (011);
--                the follow-up-retired pair and the last-contact-derived pair (012).
--                Named in the bodies of triggers on OTHER tables — dropped first
--                and re-created after, because SQLite re-parses every trigger on
--                a RENAME and the name does not exist in between:
--                outbox_refuses_do_not_contact (009, as 011 re-created it), and
--                staff_tasks_contact_belongs_insert and _update (012), which are
--                re-created with staff_tasks below.
--                Referenced by name by staff_tasks.contact_id (012).
--   staff_tasks  eight indexes and eight triggers, every one on the table itself.
--                No trigger on another table names it. Referenced by name by
--                automation_runs.task_id (012) and by its own recurred_from_id.
--   A reference by name survives the drop and rename with foreign keys off, as
--   011 records for its own two.
--
-- `leads.introducer_id` HAS EXISTED SINCE 010 WITHOUT A FOREIGN KEY, and SQLite
-- cannot add one to an existing column without rebuilding `leads`. The reference
-- is enforced by a NAMED TRIGGER PAIR, as migration 009 enforced its own, and
-- the other half of a foreign key — the parent never disappearing — is a trigger
-- that refuses to delete an introducer.
--
-- NOTHING HERE IS A COUNT. Leads referred, claims opened and won, reasoned
-- negatives, the estimated value, the fees, the last contact and the next are
-- READ BY QUERY in src/web/introducers.ts and stored nowhere (disposition 12.6 to
-- 12.13).
-- ===========================================================================

-- 1 · foreign keys off. A no-op inside a transaction, so it goes FIRST.
PRAGMA foreign_keys = OFF;

-- 2 · one transaction. All of it, or none of it.
BEGIN;


-- ---------------------------------------------------------------------------
-- 3 · INTRODUCERS — the FIRM. Never a user, and nothing here leads to a login.
--
-- `introducer_type` IS NULLABLE: not recorded is not "other" (N4).
-- THERE IS NO LAST-CONTACT AND NO NEXT-CONTACT COLUMN. Both are read from the
-- staff tasks on the firm — the last completed call, email, meeting or
-- reciprocity, and the earliest open task — as a client contact's are (row E48).
-- `notice_contact_id` IS THE ONE PERSON AT THE FIRM A PROGRESS NOTICE GOES TO —
-- one address, not everybody at the practice. It must be one of the firm's own
-- contacts, by trigger in section 4.
-- `created_via` says whether a person made the row or the public referral form
-- did, and it never changes.
-- ---------------------------------------------------------------------------
CREATE TABLE introducers (
  id                       TEXT PRIMARY KEY,
  firm_name                TEXT NOT NULL CHECK (length(trim(firm_name)) BETWEEN 1 AND 300),
  introducer_type          TEXT CHECK (introducer_type IN ('ACCOUNTANT_FIRM','TAX_ADVISER','AGENT','SOLICITOR','OTHER')),
  owner_id                 TEXT REFERENCES users(id),
  relationship_started_on  TEXT CHECK (relationship_started_on GLOB '[0-9][0-9][0-9][0-9]-[01][0-9]-[0-3][0-9]'),
  notice_contact_id        TEXT REFERENCES contacts(id),
  -- Internal. ADMIN and SALES only, escaped on output.
  notes                    TEXT,
  created_via              TEXT NOT NULL CHECK (created_via IN ('STAFF','PUBLIC_FORM')),
  created_at               TEXT NOT NULL,
  updated_at               TEXT NOT NULL
) STRICT;

CREATE TRIGGER introducers_never_deleted BEFORE DELETE ON introducers
BEGIN SELECT RAISE(ABORT, 'an introducer is never deleted: leads and notices still name it'); END;

CREATE TRIGGER introducers_created_via_fixed BEFORE UPDATE OF created_via ON introducers
BEGIN SELECT RAISE(ABORT, 'an introducer keeps the route it was created by'); END;


-- ---------------------------------------------------------------------------
-- 4 · THE REWARD MODEL — ONE SETTING, SHIPPED OFF
--
-- OFF, A (no cash: firm-level reciprocity) or B (a fixed, disclosed fee per
-- successful claim, paid to the firm). One row, never deleted. The refusal to
-- turn it on while clause 1 of the engagement letter is blank is in
-- src/web/introducers.ts, because only code can read the .docx; the database
-- refuses what each model's absence forbids — a reciprocity task while A is off
-- (section 7), and a fee while B is off (section 10).
-- ---------------------------------------------------------------------------
CREATE TABLE introducer_reward_setting (
  id          INTEGER PRIMARY KEY CHECK (id = 1),
  model       TEXT NOT NULL CHECK (model IN ('OFF','A_RECIPROCITY','B_DISCLOSED_FEE')),
  fee_pence   INTEGER CHECK (fee_pence IS NULL OR fee_pence > 0),
  changed_by  TEXT REFERENCES users(id),
  changed_at  TEXT,
  CHECK (model <> 'B_DISCLOSED_FEE' OR fee_pence IS NOT NULL)
) STRICT;

INSERT INTO introducer_reward_setting (id, model, fee_pence, changed_by, changed_at) VALUES (1, 'OFF', NULL, NULL, NULL);

CREATE TRIGGER introducer_reward_setting_never_deleted BEFORE DELETE ON introducer_reward_setting
BEGIN SELECT RAISE(ABORT, 'the reward setting is switched off, never deleted'); END;


-- ---------------------------------------------------------------- 5 · contacts, rebuilt

DROP TRIGGER outbox_refuses_do_not_contact;
DROP TRIGGER staff_tasks_contact_belongs_insert;
DROP TRIGGER staff_tasks_contact_belongs_update;

CREATE TABLE contacts_new (
  id               TEXT PRIMARY KEY,
  -- NULL only while the contact belongs to a lead that has no organisation yet.
  business_id      TEXT REFERENCES businesses(id),
  full_name        TEXT NOT NULL,
  job_role         TEXT,
  job_role_other   TEXT,
  -- Per channel, never once globally: the client picked a route and the
  -- consent is for that route. CB_BOOKING.CONSENTS.
  contact_consent  INTEGER NOT NULL CHECK (contact_consent IN (0,1)),
  -- PECR. Separate, unticked, never a condition of submitting.
  marketing_optin  INTEGER NOT NULL CHECK (marketing_optin IN (0,1)),
  created_at       TEXT NOT NULL,
  contact_type TEXT, is_decision_maker INTEGER CHECK (is_decision_maker IN (0,1)), email TEXT, phone TEXT,
  last_contact_at TEXT, next_follow_up_at TEXT, notes TEXT, updated_at TEXT,
  -- The lead this person asked through, where there is no organisation to hold
  -- them. Kept after the lead is linked: it is where the contact came from.
  lead_id          TEXT REFERENCES leads(id),
  -- CRM 5 of 10: a person at an introducing firm. On nothing else, and of type
  -- INTRODUCER — the client's own accountant is a contact on the client, typed
  -- ACCOUNTANT, and is a different row about a different relationship.
  introducer_id    TEXT REFERENCES introducers(id),
  CHECK (business_id IS NOT NULL OR lead_id IS NOT NULL OR introducer_id IS NOT NULL),
  CHECK (introducer_id IS NULL OR (business_id IS NULL AND lead_id IS NULL AND contact_type IS 'INTRODUCER'))
) STRICT;

INSERT INTO contacts_new (id, business_id, full_name, job_role, job_role_other, contact_consent, marketing_optin,
  created_at, contact_type, is_decision_maker, email, phone, last_contact_at, next_follow_up_at, notes, updated_at,
  lead_id, introducer_id)
SELECT id, business_id, full_name, job_role, job_role_other, contact_consent, marketing_optin,
  created_at, contact_type, is_decision_maker, email, phone, last_contact_at, next_follow_up_at, notes, updated_at,
  lead_id, NULL
FROM contacts;

DROP TABLE contacts;
ALTER TABLE contacts_new RENAME TO contacts;

CREATE INDEX contacts_business_idx ON contacts(business_id);
CREATE INDEX contacts_lead_idx ON contacts(lead_id);
CREATE INDEX contacts_introducer_idx ON contacts(introducer_id);

CREATE TRIGGER contacts_contact_type_insert BEFORE INSERT ON contacts
WHEN NEW.contact_type IS NOT NULL AND NEW.contact_type NOT IN
  ('DECISION_MAKER','FINANCE','ACCOUNTANT','ADVISER','INTRODUCER','OTHER')
BEGIN SELECT RAISE(ABORT, 'contacts.contact_type is not on the contact-type list'); END;

CREATE TRIGGER contacts_contact_type_update BEFORE UPDATE OF contact_type ON contacts
WHEN NEW.contact_type IS NOT NULL AND NEW.contact_type NOT IN
  ('DECISION_MAKER','FINANCE','ACCOUNTANT','ADVISER','INTRODUCER','OTHER')
BEGIN SELECT RAISE(ABORT, 'contacts.contact_type is not on the contact-type list'); END;

-- A LEAD'S CONTACT BELONGS TO THE LEAD'S OWN ORGANISATION, once it has one.
CREATE TRIGGER contacts_lead_same_organisation_insert BEFORE INSERT ON contacts
WHEN NEW.lead_id IS NOT NULL AND NEW.business_id IS NOT NULL
 AND EXISTS (SELECT 1 FROM leads l WHERE l.id = NEW.lead_id AND l.business_id IS NOT NULL AND l.business_id <> NEW.business_id)
BEGIN SELECT RAISE(ABORT, 'a lead''s contact belongs to the lead''s own organisation'); END;

CREATE TRIGGER contacts_lead_same_organisation_update BEFORE UPDATE OF business_id, lead_id ON contacts
WHEN NEW.lead_id IS NOT NULL AND NEW.business_id IS NOT NULL
 AND EXISTS (SELECT 1 FROM leads l WHERE l.id = NEW.lead_id AND l.business_id IS NOT NULL AND l.business_id <> NEW.business_id)
BEGIN SELECT RAISE(ABORT, 'a lead''s contact belongs to the lead''s own organisation'); END;

CREATE TRIGGER contacts_next_follow_up_retired_insert BEFORE INSERT ON contacts
WHEN NEW.next_follow_up_at IS NOT NULL
BEGIN SELECT RAISE(ABORT, 'contacts.next_follow_up_at is retired: a follow-up is a staff task naming the contact'); END;

CREATE TRIGGER contacts_next_follow_up_retired_update BEFORE UPDATE OF next_follow_up_at ON contacts
WHEN NEW.next_follow_up_at IS NOT NULL
BEGIN SELECT RAISE(ABORT, 'contacts.next_follow_up_at is retired: a follow-up is a staff task naming the contact'); END;

CREATE TRIGGER contacts_last_contact_derived_insert BEFORE INSERT ON contacts
WHEN NEW.last_contact_at IS NOT NULL
BEGIN SELECT RAISE(ABORT, 'contacts.last_contact_at is derived from the timeline and is not recorded by hand'); END;

CREATE TRIGGER contacts_last_contact_derived_update BEFORE UPDATE OF last_contact_at ON contacts
WHEN NEW.last_contact_at IS NOT OLD.last_contact_at
BEGIN SELECT RAISE(ABORT, 'contacts.last_contact_at is derived from the timeline and is not recorded by hand'); END;

-- A person at a firm stays at that firm. Moving them would move who referred what.
CREATE TRIGGER contacts_introducer_fixed BEFORE UPDATE OF introducer_id ON contacts
WHEN OLD.introducer_id IS NOT NEW.introducer_id
BEGIN SELECT RAISE(ABORT, 'a contact at an introducer stays at that introducer'); END;

-- ------------------------------------------------ the outbox control, verbatim from 009

CREATE TRIGGER outbox_refuses_do_not_contact BEFORE INSERT ON outbox
WHEN
  (NEW.business_id IS NOT NULL AND EXISTS (
     SELECT 1 FROM businesses b WHERE b.id = NEW.business_id AND b.client_status = 'DO_NOT_CONTACT'))
  OR EXISTS (
     SELECT 1 FROM businesses b
      WHERE b.client_status = 'DO_NOT_CONTACT' AND lower(b.contact_email) = lower(NEW.to_email))
  OR EXISTS (
     SELECT 1 FROM contacts c JOIN businesses b ON b.id = c.business_id
      WHERE b.client_status = 'DO_NOT_CONTACT' AND lower(c.email) = lower(NEW.to_email))
  OR EXISTS (
     SELECT 1 FROM users u JOIN businesses b ON b.id = u.business_id
      WHERE b.client_status = 'DO_NOT_CONTACT' AND u.email_canonical = lower(NEW.to_email))
BEGIN SELECT RAISE(ABORT, 'E_DO_NOT_CONTACT: nothing may be queued to an organisation marked do not contact'); END;

-- ---------------------------------------------------------------------------
-- 6 · THE FIRM'S NOTICE CONTACT IS ONE OF THE FIRM'S OWN PEOPLE
-- ---------------------------------------------------------------------------
CREATE TRIGGER introducers_notice_contact_is_the_firms_insert BEFORE INSERT ON introducers
WHEN NEW.notice_contact_id IS NOT NULL
 AND NOT EXISTS (SELECT 1 FROM contacts c WHERE c.id = NEW.notice_contact_id AND c.introducer_id = NEW.id)
BEGIN SELECT RAISE(ABORT, 'the person a progress notice goes to must be one of the firm''s own contacts'); END;

CREATE TRIGGER introducers_notice_contact_is_the_firms_update BEFORE UPDATE OF notice_contact_id ON introducers
WHEN NEW.notice_contact_id IS NOT NULL
 AND NOT EXISTS (SELECT 1 FROM contacts c WHERE c.id = NEW.notice_contact_id AND c.introducer_id = NEW.id)
BEGIN SELECT RAISE(ABORT, 'the person a progress notice goes to must be one of the firm''s own contacts'); END;


-- ---------------------------------------------------------------------------
-- 7 · CONTACT WITH A FIRM IS A STAFF TASK ON THE FIRM — staff_tasks, rebuilt (row E48)
--
-- CRM 3 of 10 decided that a call, an email or a meeting is a staff task, and
-- that a contact's last contact and next follow-up are read from tasks. So what
-- happens with a firm is a task ON THE FIRM: logged as completed, or planned
-- with an owner and a due date — and model A's reciprocity is logged the same way.
--
-- A TASK ABOUT A FIRM IS ABOUT THE FIRM ALONE — no organisation, property, claim
-- or lead beside it — so nothing done with an introducer lands in a client's
-- record. A contact named on it is one of the firm's own people.
--
-- THE THREE RECIPROCITY KINDS JOIN THE ACTIVITY LIST by replacing the named
-- trigger pair 012 left for exactly that; they are allowed only on a firm, and
-- only while reward model A is the setting.
--
-- Every other column, CHECK, index and trigger is character for character 012's.
-- ---------------------------------------------------------------------------
CREATE TABLE staff_tasks_new (
  id                TEXT PRIMARY KEY,
  title             TEXT NOT NULL CHECK (length(trim(title)) BETWEEN 1 AND 300),
  description       TEXT,
  owner_id          TEXT REFERENCES users(id),
  -- The team a task waits with while nobody has taken it. Never CLIENT.
  owner_role        TEXT CHECK (owner_role IN ('ADMIN','SALES','ACCOUNTING','SURVEYING')),
  due_on            TEXT CHECK (due_on IS NULL OR due_on GLOB '[0-9][0-9][0-9][0-9]-[01][0-9]-[0-3][0-9]'),
  priority          TEXT,
  status            TEXT NOT NULL CHECK (status IN ('OPEN','IN_PROGRESS','COMPLETED','CANCELLED')),
  activity_type     TEXT NOT NULL,
  business_id       TEXT REFERENCES businesses(id),
  property_id       TEXT,
  claim_id          TEXT,
  lead_id           TEXT REFERENCES leads(id),
  contact_id        TEXT REFERENCES contacts(id),
  -- The missing fact an information-request task asks for — the id
  -- `missingFacts` in src/web/engaged.ts gives it — so the list is derived.
  fact_id           TEXT,
  recurrence        TEXT CHECK (recurrence IN ('WEEKLY','FORTNIGHTLY','MONTHLY','QUARTERLY')),
  recurred_from_id  TEXT REFERENCES staff_tasks(id),
  is_next_action    INTEGER NOT NULL DEFAULT 0 CHECK (is_next_action IN (0,1)),
  origin            TEXT NOT NULL CHECK (origin IN ('STAFF','AUTOMATION','RECURRENCE','MIGRATION')),
  automation_run_id TEXT REFERENCES automation_runs(id),
  created_by        TEXT REFERENCES users(id),
  created_at        TEXT NOT NULL,
  updated_at        TEXT NOT NULL,
  started_at        TEXT,
  completed_at      TEXT,
  completed_by      TEXT REFERENCES users(id),
  cancelled_at      TEXT,
  cancelled_by      TEXT REFERENCES users(id),
  cancel_reason     TEXT,
  -- CRM 5 of 10: an introducing firm, and then nothing else.
  introducer_id     TEXT REFERENCES introducers(id),
  FOREIGN KEY (property_id, business_id) REFERENCES properties(id, business_id),
  FOREIGN KEY (claim_id, business_id) REFERENCES claims(id, business_id),
  CHECK (business_id IS NOT NULL OR lead_id IS NOT NULL OR introducer_id IS NOT NULL),
  CHECK (introducer_id IS NULL OR (business_id IS NULL AND lead_id IS NULL AND property_id IS NULL AND claim_id IS NULL)),
  CHECK (property_id IS NULL OR business_id IS NOT NULL),
  CHECK (claim_id IS NULL OR business_id IS NOT NULL),
  CHECK (is_next_action = 0 OR claim_id IS NOT NULL),
  CHECK (status <> 'COMPLETED' OR (completed_at IS NOT NULL AND completed_by IS NOT NULL)),
  CHECK (status = 'COMPLETED' OR (completed_at IS NULL AND completed_by IS NULL)),
  CHECK (status <> 'CANCELLED' OR (cancelled_at IS NOT NULL AND cancelled_by IS NOT NULL
                                   AND cancel_reason IS NOT NULL AND length(trim(cancel_reason)) > 0)),
  CHECK (status = 'CANCELLED' OR (cancelled_at IS NULL AND cancelled_by IS NULL AND cancel_reason IS NULL)),
  CHECK (origin <> 'STAFF' OR created_by IS NOT NULL),
  CHECK (origin <> 'AUTOMATION' OR automation_run_id IS NOT NULL),
  CHECK (origin <> 'RECURRENCE' OR recurred_from_id IS NOT NULL)
) STRICT;

INSERT INTO staff_tasks_new (id, title, description, owner_id, owner_role, due_on, priority, status, activity_type,
  business_id, property_id, claim_id, lead_id, contact_id, fact_id, recurrence, recurred_from_id, is_next_action, origin,
  automation_run_id, created_by, created_at, updated_at, started_at, completed_at, completed_by, cancelled_at, cancelled_by,
  cancel_reason, introducer_id)
SELECT id, title, description, owner_id, owner_role, due_on, priority, status, activity_type,
  business_id, property_id, claim_id, lead_id, contact_id, fact_id, recurrence, recurred_from_id, is_next_action, origin,
  automation_run_id, created_by, created_at, updated_at, started_at, completed_at, completed_by, cancelled_at, cancelled_by,
  cancel_reason, NULL
FROM staff_tasks;

DROP TABLE staff_tasks;
ALTER TABLE staff_tasks_new RENAME TO staff_tasks;

CREATE INDEX staff_tasks_owner_idx ON staff_tasks(owner_id, status, due_on);
CREATE INDEX staff_tasks_role_idx ON staff_tasks(owner_role, status, due_on);
CREATE INDEX staff_tasks_business_idx ON staff_tasks(business_id);
CREATE INDEX staff_tasks_claim_idx ON staff_tasks(claim_id);
CREATE INDEX staff_tasks_lead_idx ON staff_tasks(lead_id);
CREATE INDEX staff_tasks_contact_idx ON staff_tasks(contact_id);
CREATE INDEX staff_tasks_introducer_idx ON staff_tasks(introducer_id, status, due_on);
CREATE UNIQUE INDEX staff_tasks_one_next_action_uq ON staff_tasks(claim_id)
  WHERE is_next_action = 1 AND status IN ('OPEN','IN_PROGRESS');
CREATE UNIQUE INDEX staff_tasks_one_successor_uq ON staff_tasks(recurred_from_id)
  WHERE recurred_from_id IS NOT NULL;

CREATE TRIGGER staff_tasks_never_deleted BEFORE DELETE ON staff_tasks
BEGIN SELECT RAISE(ABORT, 'a staff task is cancelled, with a reason, never deleted'); END;

CREATE TRIGGER staff_tasks_closed_is_final BEFORE UPDATE ON staff_tasks
WHEN OLD.status IN ('COMPLETED','CANCELLED')
BEGIN SELECT RAISE(ABORT, 'a completed or cancelled task keeps its record: nothing about it changes'); END;

-- The activity types and priorities are lists CRM 9 of 10's settings make
-- configurable, so they are named trigger pairs and not CHECKs (row E2's idiom).
-- CRM 5 of 10 adds the three reciprocity kinds of reward model A.
CREATE TRIGGER staff_tasks_vocabulary_insert BEFORE INSERT ON staff_tasks
WHEN NEW.activity_type NOT IN ('CALL','EMAIL','MEETING','NOTE','TASK','SURVEY','DOCUMENT_REQUEST','REVIEW','OTHER',
                               'CPD_SESSION','CO_BRANDED_ONE_PAGER','PRIORITY_TURNAROUND')
  OR (NEW.priority IS NOT NULL AND NEW.priority NOT IN ('LOW','NORMAL','HIGH'))
BEGIN SELECT RAISE(ABORT, 'staff_tasks.activity_type or priority is not on the list'); END;

CREATE TRIGGER staff_tasks_vocabulary_update BEFORE UPDATE OF activity_type, priority ON staff_tasks
WHEN NEW.activity_type NOT IN ('CALL','EMAIL','MEETING','NOTE','TASK','SURVEY','DOCUMENT_REQUEST','REVIEW','OTHER',
                               'CPD_SESSION','CO_BRANDED_ONE_PAGER','PRIORITY_TURNAROUND')
  OR (NEW.priority IS NOT NULL AND NEW.priority NOT IN ('LOW','NORMAL','HIGH'))
BEGIN SELECT RAISE(ABORT, 'staff_tasks.activity_type or priority is not on the list'); END;

-- A LEAD'S TASK BELONGS TO THE LEAD'S OWN ORGANISATION, once it has one.
CREATE TRIGGER staff_tasks_lead_same_organisation_insert BEFORE INSERT ON staff_tasks
WHEN NEW.lead_id IS NOT NULL AND NEW.business_id IS NOT NULL
 AND EXISTS (SELECT 1 FROM leads l WHERE l.id = NEW.lead_id AND l.business_id IS NOT NULL AND l.business_id <> NEW.business_id)
BEGIN SELECT RAISE(ABORT, 'a lead''s task belongs to the lead''s own organisation'); END;

CREATE TRIGGER staff_tasks_lead_same_organisation_update BEFORE UPDATE OF business_id, lead_id ON staff_tasks
WHEN NEW.lead_id IS NOT NULL AND NEW.business_id IS NOT NULL
 AND EXISTS (SELECT 1 FROM leads l WHERE l.id = NEW.lead_id AND l.business_id IS NOT NULL AND l.business_id <> NEW.business_id)
BEGIN SELECT RAISE(ABORT, 'a lead''s task belongs to the lead''s own organisation'); END;

-- A CONTACT NAMED ON A TASK IS ONE OF THE TASK'S OWN ORGANISATION, LEAD OR FIRM.
CREATE TRIGGER staff_tasks_contact_belongs_insert BEFORE INSERT ON staff_tasks
WHEN NEW.contact_id IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM contacts c WHERE c.id = NEW.contact_id
     AND ((NEW.business_id IS NOT NULL AND c.business_id = NEW.business_id)
       OR (NEW.lead_id IS NOT NULL AND c.lead_id = NEW.lead_id)
       OR (NEW.introducer_id IS NOT NULL AND c.introducer_id = NEW.introducer_id)))
BEGIN SELECT RAISE(ABORT, 'a task''s contact must be one of its own organisation''s, lead''s or firm''s'); END;

CREATE TRIGGER staff_tasks_contact_belongs_update BEFORE UPDATE OF contact_id, business_id, lead_id, introducer_id ON staff_tasks
WHEN NEW.contact_id IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM contacts c WHERE c.id = NEW.contact_id
     AND ((NEW.business_id IS NOT NULL AND c.business_id = NEW.business_id)
       OR (NEW.lead_id IS NOT NULL AND c.lead_id = NEW.lead_id)
       OR (NEW.introducer_id IS NOT NULL AND c.introducer_id = NEW.introducer_id)))
BEGIN SELECT RAISE(ABORT, 'a task''s contact must be one of its own organisation''s, lead''s or firm''s'); END;

-- MODEL A'S RECIPROCITY: on a firm, and only while model A is the setting.
CREATE TRIGGER staff_tasks_reciprocity_under_model_a_insert BEFORE INSERT ON staff_tasks
WHEN NEW.activity_type IN ('CPD_SESSION','CO_BRANDED_ONE_PAGER','PRIORITY_TURNAROUND')
 AND (NEW.introducer_id IS NULL
      OR NOT EXISTS (SELECT 1 FROM introducer_reward_setting s WHERE s.id = 1 AND s.model = 'A_RECIPROCITY'))
BEGIN SELECT RAISE(ABORT, 'E_REWARD_OFF: reciprocity is a task on an introducer, and only while reward model A is switched on'); END;

CREATE TRIGGER staff_tasks_reciprocity_under_model_a_update BEFORE UPDATE OF activity_type, introducer_id ON staff_tasks
WHEN NEW.activity_type IN ('CPD_SESSION','CO_BRANDED_ONE_PAGER','PRIORITY_TURNAROUND')
 AND (NEW.activity_type IS NOT OLD.activity_type OR NEW.introducer_id IS NOT OLD.introducer_id)
 AND (NEW.introducer_id IS NULL
      OR NOT EXISTS (SELECT 1 FROM introducer_reward_setting s WHERE s.id = 1 AND s.model = 'A_RECIPROCITY'))
BEGIN SELECT RAISE(ABORT, 'E_REWARD_OFF: reciprocity is a task on an introducer, and only while reward model A is switched on'); END;


-- ---------------------------------------------------------------------------
-- 8 · LEADS — THE INTRODUCER'S REFERENCE, AND THE PROPERTY BASICS A REFERRAL BRINGS
--
-- THE TRIGGER PAIR IS THE FOREIGN KEY. An introducer_id names a row that exists,
-- on insert and on update; `introducers_never_deleted` above is the other half.
--
-- A LEAD WITH AN INTRODUCER CAME BY REFERRAL: its source is ACCOUNTANT, ADVISER
-- or REFERRAL, whichever the firm's type derives (src/web/introducers.ts).
--
-- THE PROPERTY BASICS are what the referral paper's step 2 asks an accountant
-- for — "property basics" — held on a lead with no organisation exactly as its
-- name and sector are, and cleared when the lead converts, because the
-- assessment's own property is then the record. Each is nullable: an accountant
-- who does not know the year has not told us a year (N4). None can hold a person.
-- ---------------------------------------------------------------------------
ALTER TABLE leads ADD COLUMN prospect_postcode TEXT CHECK (prospect_postcode IS NULL OR length(prospect_postcode) BETWEEN 2 AND 10);
ALTER TABLE leads ADD COLUMN prospect_event TEXT CHECK (prospect_event IN ('PURCHASE','BUILD','FIT_OUT','REFURBISHMENT','ABOUT_TO_SELL'));
ALTER TABLE leads ADD COLUMN prospect_event_year INTEGER CHECK (prospect_event_year BETWEEN 1950 AND 2100);

CREATE INDEX leads_introducer_idx ON leads(introducer_id);

CREATE TRIGGER leads_introducer_exists_insert BEFORE INSERT ON leads
WHEN NEW.introducer_id IS NOT NULL
 AND NOT EXISTS (SELECT 1 FROM introducers i WHERE i.id = NEW.introducer_id)
BEGIN SELECT RAISE(ABORT, 'leads.introducer_id must name an introducer that exists'); END;

CREATE TRIGGER leads_introducer_exists_update BEFORE UPDATE OF introducer_id ON leads
WHEN NEW.introducer_id IS NOT NULL
 AND NOT EXISTS (SELECT 1 FROM introducers i WHERE i.id = NEW.introducer_id)
BEGIN SELECT RAISE(ABORT, 'leads.introducer_id must name an introducer that exists'); END;

CREATE TRIGGER leads_introducer_is_a_referral_insert BEFORE INSERT ON leads
WHEN NEW.introducer_id IS NOT NULL AND NEW.source NOT IN ('ACCOUNTANT','ADVISER','REFERRAL')
BEGIN SELECT RAISE(ABORT, 'a lead with an introducer came by referral: its source is accountant, adviser or referral'); END;

CREATE TRIGGER leads_introducer_is_a_referral_update BEFORE UPDATE OF introducer_id, source ON leads
WHEN NEW.introducer_id IS NOT NULL AND NEW.source NOT IN ('ACCOUNTANT','ADVISER','REFERRAL')
BEGIN SELECT RAISE(ABORT, 'a lead with an introducer came by referral: its source is accountant, adviser or referral'); END;


-- ---------------------------------------------------------------------------
-- 9 · SHARING PROGRESS WITH THE FIRM — THE CLIENT'S OPT-IN (paper, section 5a)
--
-- THE CLIENT IS THE DATA SUBJECT, SO THE OPT-IN IS THE CLIENT'S: on the
-- organisation, or on the lead while there is no organisation yet — and the
-- organisation's reading includes the rows on its own leads, so nothing is moved
-- or copied when a lead converts. PER INTRODUCER, and only an introducer this
-- client was actually referred by.
--
-- APPEND-ONLY. The current answer is the LATEST row for the client and the firm,
-- by insertion order. NEVER ASKED IS NO ROW, and it shares nothing — exactly as
-- a DECLINED or a WITHDRAWN row shares nothing (N4).
--
-- THE WORDING VERSION NAMES THE WORDS THE CLIENT WAS ASKED. A version is added by
-- a migration and its words are never edited; the CHECK is the list of versions
-- that exist.
-- ---------------------------------------------------------------------------
CREATE TABLE introducer_share_consents (
  id               TEXT PRIMARY KEY,
  introducer_id    TEXT NOT NULL REFERENCES introducers(id),
  business_id      TEXT REFERENCES businesses(id),
  lead_id          TEXT REFERENCES leads(id),
  decision         TEXT NOT NULL CHECK (decision IN ('GIVEN','DECLINED','WITHDRAWN')),
  wording_version  TEXT NOT NULL CHECK (wording_version IN ('SHARE-PROGRESS-1')),
  route            TEXT NOT NULL CHECK (route IN ('STAFF_RECORDED')),
  recorded_by      TEXT NOT NULL REFERENCES users(id),
  recorded_at      TEXT NOT NULL,
  CHECK ((business_id IS NULL) <> (lead_id IS NULL))
) STRICT;

CREATE INDEX introducer_share_consents_business_idx ON introducer_share_consents(business_id, introducer_id);
CREATE INDEX introducer_share_consents_lead_idx ON introducer_share_consents(lead_id, introducer_id);

CREATE TRIGGER introducer_share_consents_no_update BEFORE UPDATE ON introducer_share_consents
BEGIN SELECT RAISE(ABORT, 'introducer_share_consents is append-only: record a new answer instead'); END;

CREATE TRIGGER introducer_share_consents_no_delete BEFORE DELETE ON introducer_share_consents
BEGIN SELECT RAISE(ABORT, 'introducer_share_consents is append-only: record a new answer instead'); END;

CREATE TRIGGER introducer_share_consents_referred_by_that_firm BEFORE INSERT ON introducer_share_consents
WHEN (NEW.lead_id IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM leads l WHERE l.id = NEW.lead_id AND l.introducer_id = NEW.introducer_id))
  OR (NEW.business_id IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM leads l WHERE l.business_id = NEW.business_id AND l.introducer_id = NEW.introducer_id))
BEGIN SELECT RAISE(ABORT, 'a client opts in to sharing progress with a firm that referred them, and no other'); END;


-- ---------------------------------------------------------------------------
-- 10 · THE STAGE NOTICES TO THE FIRM — every one evaluated, and kept
--
-- One row each time a notice falls due: QUEUED, with the outbox row and the
-- opt-in it was queued under, or NOT_QUEUED, with the reason — as an automation
-- rule that did not run records why (012). It is not a second event log: the
-- outbox holds what was queued, and nothing else holds what was not. A notice is
-- queued once per lead, whatever re-enters the stage.
--
-- THE DATABASE REFUSES A QUEUED ROW UNLESS ITS OPT-IN IS GIVEN AND IS STILL THE
-- CLIENT'S LATEST ANSWER FOR THAT FIRM — the same reading, in the same order, as
-- src/web/introducers.ts, so a caller that went round the code is refused too.
-- ---------------------------------------------------------------------------
CREATE TABLE introducer_notices (
  id             TEXT PRIMARY KEY,
  introducer_id  TEXT NOT NULL REFERENCES introducers(id),
  lead_id        TEXT NOT NULL REFERENCES leads(id),
  claim_id       TEXT REFERENCES claims(id),
  notice         TEXT NOT NULL CHECK (notice IN
                   ('REFERRED','RANGE_ISSUED','ENGAGED','REPORT_DELIVERED','FEE_SETTLED','REASONED_NEGATIVE')),
  outcome        TEXT NOT NULL CHECK (outcome IN ('QUEUED','NOT_QUEUED')),
  reason         TEXT CHECK (reason IN ('NO_OPT_IN','NO_ADDRESS','DO_NOT_CONTACT')),
  consent_id     TEXT REFERENCES introducer_share_consents(id),
  outbox_id      TEXT REFERENCES outbox(id),
  at             TEXT NOT NULL,
  CHECK ((outcome = 'QUEUED') = (outbox_id IS NOT NULL)),
  CHECK (outcome <> 'QUEUED' OR (consent_id IS NOT NULL AND reason IS NULL)),
  CHECK (outcome <> 'NOT_QUEUED' OR reason IS NOT NULL)
) STRICT;

CREATE INDEX introducer_notices_lead_idx ON introducer_notices(lead_id, notice);
CREATE UNIQUE INDEX introducer_notices_queued_once_uq ON introducer_notices(lead_id, notice) WHERE outcome = 'QUEUED';

CREATE TRIGGER introducer_notices_no_update BEFORE UPDATE ON introducer_notices
BEGIN SELECT RAISE(ABORT, 'introducer_notices is append-only'); END;

CREATE TRIGGER introducer_notices_no_delete BEFORE DELETE ON introducer_notices
BEGIN SELECT RAISE(ABORT, 'introducer_notices is append-only'); END;

CREATE TRIGGER introducer_notices_queued_only_under_the_opt_in BEFORE INSERT ON introducer_notices
WHEN NEW.outcome = 'QUEUED' AND NOT EXISTS (
  SELECT 1 FROM introducer_share_consents s
   WHERE s.id = NEW.consent_id
     AND s.introducer_id = NEW.introducer_id
     AND s.decision = 'GIVEN'
     AND (s.lead_id = NEW.lead_id
          OR s.business_id = (SELECT l.business_id FROM leads l WHERE l.id = NEW.lead_id)
          OR s.lead_id IN (SELECT l2.id FROM leads l2
                            WHERE l2.business_id = (SELECT l.business_id FROM leads l WHERE l.id = NEW.lead_id)))
     AND NOT EXISTS (
       SELECT 1 FROM introducer_share_consents t
        WHERE t.introducer_id = s.introducer_id AND t.rowid > s.rowid
          AND (t.lead_id = NEW.lead_id
               OR t.business_id = (SELECT l.business_id FROM leads l WHERE l.id = NEW.lead_id)
               OR t.lead_id IN (SELECT l2.id FROM leads l2
                                 WHERE l2.business_id = (SELECT l.business_id FROM leads l WHERE l.id = NEW.lead_id)))))
BEGIN SELECT RAISE(ABORT, 'E_NO_OPT_IN: a notice reaches the firm only while the client''s opt-in to share progress with it is given'); END;


-- ---------------------------------------------------------------------------
-- 11 · MODEL B — A FIXED, DISCLOSED FEE PER SUCCESSFUL CLAIM, PAID TO THE FIRM
--
-- PAID TO THE FIRM: the row names the introducer and no person, and has no
-- column that could hold one. ONE PER CLAIM, and only on a claim whose lead that
-- firm referred. THE AMOUNT IS FIXED when the fee accrues, from the setting.
--
-- NOTHING IS PAYABLE BEFORE THE DISCLOSURE IS GIVEN: a PAID row without a
-- disclosure is refused by CHECK, and a disclosure once given is never unset.
-- A paid fee is final. Nothing is deleted. And nothing accrues while model B is
-- not the setting.
-- ---------------------------------------------------------------------------
CREATE TABLE introducer_fees (
  id                      TEXT PRIMARY KEY,
  introducer_id           TEXT NOT NULL REFERENCES introducers(id),
  claim_id                TEXT NOT NULL,
  business_id             TEXT NOT NULL,
  amount_pence            INTEGER NOT NULL CHECK (amount_pence > 0),
  disclosure_given_at     TEXT,
  disclosure_recorded_by  TEXT REFERENCES users(id),
  state                   TEXT NOT NULL CHECK (state IN ('ACCRUED','PAID')),
  paid_at                 TEXT,
  paid_recorded_by        TEXT REFERENCES users(id),
  created_at              TEXT NOT NULL,
  updated_at              TEXT NOT NULL,
  FOREIGN KEY (claim_id, business_id) REFERENCES claims(id, business_id),
  CHECK ((disclosure_given_at IS NULL) = (disclosure_recorded_by IS NULL)),
  CHECK (state <> 'PAID' OR (disclosure_given_at IS NOT NULL AND paid_at IS NOT NULL AND paid_recorded_by IS NOT NULL)),
  CHECK (state = 'PAID' OR (paid_at IS NULL AND paid_recorded_by IS NULL))
) STRICT;

CREATE UNIQUE INDEX introducer_fees_one_per_claim_uq ON introducer_fees(claim_id);
CREATE INDEX introducer_fees_introducer_idx ON introducer_fees(introducer_id);

CREATE TRIGGER introducer_fees_only_under_model_b BEFORE INSERT ON introducer_fees
WHEN NOT EXISTS (SELECT 1 FROM introducer_reward_setting s WHERE s.id = 1 AND s.model = 'B_DISCLOSED_FEE')
BEGIN SELECT RAISE(ABORT, 'E_REWARD_OFF: a fee to an introducer accrues only while reward model B is switched on'); END;

CREATE TRIGGER introducer_fees_referred_by_that_firm BEFORE INSERT ON introducer_fees
WHEN NOT EXISTS (SELECT 1 FROM leads l WHERE l.claim_id = NEW.claim_id AND l.introducer_id = NEW.introducer_id)
BEGIN SELECT RAISE(ABORT, 'a fee is paid only to the firm that referred the claim'); END;

CREATE TRIGGER introducer_fees_fixed BEFORE UPDATE OF introducer_id, claim_id, business_id, amount_pence, created_at ON introducer_fees
BEGIN SELECT RAISE(ABORT, 'a fee keeps its firm, its claim and its amount'); END;

CREATE TRIGGER introducer_fees_disclosure_never_unset BEFORE UPDATE OF disclosure_given_at, disclosure_recorded_by ON introducer_fees
WHEN OLD.disclosure_given_at IS NOT NULL
 AND (NEW.disclosure_given_at IS NOT OLD.disclosure_given_at OR NEW.disclosure_recorded_by IS NOT OLD.disclosure_recorded_by)
BEGIN SELECT RAISE(ABORT, 'a disclosure once given stays given'); END;

CREATE TRIGGER introducer_fees_paid_is_final BEFORE UPDATE ON introducer_fees
WHEN OLD.state = 'PAID'
BEGIN SELECT RAISE(ABORT, 'a paid fee is final'); END;

CREATE TRIGGER introducer_fees_never_deleted BEFORE DELETE ON introducer_fees
BEGIN SELECT RAISE(ABORT, 'a fee to an introducer is never deleted'); END;


-- 12 · THE GUARD. Zero violations — including a lead naming an introducer that
-- does not exist, which no foreign key could have caught — or this migration
-- does not happen at all.
CREATE TABLE _fk_check_guard (ok INTEGER NOT NULL CHECK (ok = 0)) STRICT;
INSERT INTO _fk_check_guard (ok) SELECT count(*) FROM pragma_foreign_key_check;
INSERT INTO _fk_check_guard (ok)
  SELECT count(*) FROM leads l WHERE l.introducer_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM introducers i WHERE i.id = l.introducer_id);
DROP TABLE _fk_check_guard;

-- 13 · commit.
COMMIT;

-- 14 · and back on.
PRAGMA foreign_keys = ON;
