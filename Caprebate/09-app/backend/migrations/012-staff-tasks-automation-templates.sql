-- ===========================================================================
-- 012 — STAFF TASKS, ONE NEXT ACTION PER CLAIM, AUTOMATION RULES AND EMAIL
-- TEMPLATES.                                         CRM 3 of 10, 11 Sep 2026
--
-- The scope is 09-app/CAPREBATE-CRM-DISPOSITION.md, and every choice below that
-- is not obvious is recorded in its Part E, rows E23 onwards, with the reason.
--
-- WHAT IS NOT IN THIS FILE, ON PURPOSE: A TIMELINE TABLE. The activity timeline
-- for an organisation, a property, a claim and a lead is a READ over what is
-- already recorded — bookings and their changes, client questions, documents
-- and their events, internal notes, research runs, stage moves, confirmations,
-- enquiry checks, staff tasks, invoices, the outbox and the audit log's record
-- changes — in src/web/timeline.ts. A second event log would be a second copy
-- of each of those that could disagree with the first, and a test reads
-- sqlite_master to hold that no such table exists.
--
-- EXTENDED, NEVER REBUILT. `client_tasks` and `internal_notes` gain columns by
-- ALTER TABLE ADD COLUMN. Two CRM 1 of 10 fields are RETIRED rather than
-- dropped, by the idiom migration 004 established: their values are carried
-- into what replaces them, and a named trigger refuses any new one.
--
-- EVERY TABLE CREATED HERE IS STRICT, AND NOTHING HERE IS EVER DELETED. A task
-- is cancelled, a rule and a template are retired, and a run is a record.
-- ===========================================================================


-- ---------------------------------------------------------------------------
-- 1 · AUTOMATION RULES — a table ADMIN edits
--
-- A TRIGGER AND AN EFFECT, AND BOTH VOCABULARIES ARE CLOSED. The triggers are
-- the full specification's own four, plus "a lead is created" (14.1); the
-- stage a rule listens for is one of the operating procedure's. The effects
-- are four: a task from the template, a follow-up (a task — a follow-up date
-- IS a task in this build, row E25), a notice to the outbox, and the
-- information-request tasks derived from the business page's missing list.
--
-- WHAT NO RULE MAY DO IS NOT A MISSING OPTION ON A FORM. The CHECK on `effect`
-- refuses anything else at the database, and src/web/automation.ts refuses it
-- by name, with the reason, before it gets here: open either register gate,
-- move a claim past a gate, flip a tax adviser's switch, fire a register call,
-- send anywhere but the outbox, write to a DO_NOT_CONTACT organisation, or
-- create an invoice email. Nothing in this table has a column that could carry
-- an address, a URL, a switch name or a stage to move to.
-- ---------------------------------------------------------------------------
CREATE TABLE automation_rules (
  id                 TEXT PRIMARY KEY,
  label              TEXT NOT NULL CHECK (length(trim(label)) BETWEEN 1 AND 200),
  trigger_event      TEXT NOT NULL CHECK (trigger_event IN
                       ('LEAD_CREATED','STAGE_ENTERED','DOCUMENT_REQUESTED','TASK_COMPLETED','OWNER_CHANGED')),
  -- The stage a STAGE_ENTERED rule listens for. NULL is any stage.
  trigger_stage      TEXT,
  -- The activity a TASK_COMPLETED rule listens for. NULL is any activity.
  trigger_activity   TEXT,
  effect             TEXT NOT NULL CHECK (effect IN
                       ('CREATE_TASK','FOLLOW_UP','NOTIFY_OWNER','INFORMATION_REQUEST_TASKS')),
  task_title         TEXT,
  task_description   TEXT,
  task_activity_type TEXT,
  task_priority      TEXT,
  due_in_days        INTEGER CHECK (due_in_days IS NULL OR due_in_days BETWEEN 0 AND 365),
  -- SUBJECT_OWNER: the claim's, the lead's or the task's own owner, falling back
  -- to `assign_role` where the subject has none. ROLE: the team named, unowned.
  assign_to          TEXT CHECK (assign_to IN ('SUBJECT_OWNER','ROLE')),
  assign_role        TEXT CHECK (assign_role IN ('ADMIN','SALES','ACCOUNTING','SURVEYING')),
  -- ORGANISATION: the task is the organisation's, so the rule needs one — and a
  -- lead with no organisation records that the rule did not run (row E27).
  attach_to          TEXT NOT NULL DEFAULT 'SUBJECT' CHECK (attach_to IN ('SUBJECT','ORGANISATION')),
  active             INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)),
  ord                INTEGER NOT NULL,
  -- Where the rule came from: the full specification's row, and how it was re-keyed.
  source             TEXT NOT NULL,
  created_at         TEXT NOT NULL,
  updated_at         TEXT NOT NULL,
  CHECK (trigger_event = 'STAGE_ENTERED' OR trigger_stage IS NULL),
  CHECK (trigger_event = 'TASK_COMPLETED' OR trigger_activity IS NULL),
  CHECK (effect = 'NOTIFY_OWNER'
         OR (task_activity_type IS NOT NULL AND due_in_days IS NOT NULL AND assign_to IS NOT NULL)),
  CHECK (effect NOT IN ('CREATE_TASK','FOLLOW_UP') OR (task_title IS NOT NULL AND length(trim(task_title)) > 0)),
  CHECK (assign_to IS NOT 'ROLE' OR assign_role IS NOT NULL),
  CHECK (effect <> 'NOTIFY_OWNER' OR attach_to = 'SUBJECT')
) STRICT;

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

CREATE TRIGGER automation_rules_activity_insert BEFORE INSERT ON automation_rules
WHEN (NEW.trigger_activity IS NOT NULL AND NEW.trigger_activity NOT IN
       ('CALL','EMAIL','MEETING','NOTE','TASK','SURVEY','DOCUMENT_REQUEST','REVIEW','OTHER'))
  OR (NEW.task_activity_type IS NOT NULL AND NEW.task_activity_type NOT IN
       ('CALL','EMAIL','MEETING','NOTE','TASK','SURVEY','DOCUMENT_REQUEST','REVIEW','OTHER'))
  OR (NEW.task_priority IS NOT NULL AND NEW.task_priority NOT IN ('LOW','NORMAL','HIGH'))
BEGIN SELECT RAISE(ABORT, 'an automation rule names an activity type or a priority that is not on the list'); END;

CREATE TRIGGER automation_rules_activity_update BEFORE UPDATE OF trigger_activity, task_activity_type, task_priority ON automation_rules
WHEN (NEW.trigger_activity IS NOT NULL AND NEW.trigger_activity NOT IN
       ('CALL','EMAIL','MEETING','NOTE','TASK','SURVEY','DOCUMENT_REQUEST','REVIEW','OTHER'))
  OR (NEW.task_activity_type IS NOT NULL AND NEW.task_activity_type NOT IN
       ('CALL','EMAIL','MEETING','NOTE','TASK','SURVEY','DOCUMENT_REQUEST','REVIEW','OTHER'))
  OR (NEW.task_priority IS NOT NULL AND NEW.task_priority NOT IN ('LOW','NORMAL','HIGH'))
BEGIN SELECT RAISE(ABORT, 'an automation rule names an activity type or a priority that is not on the list'); END;


-- ---------------------------------------------------------------------------
-- 2 · AUTOMATION RUNS — what each rule did, and what it did NOT do
--
-- ONE ROW PER RULE PER EVENT, INCLUDING THE RULES THAT DID NOT RUN. A rule that
-- matched and was stopped — a DO_NOT_CONTACT organisation, a lead with no
-- organisation for a rule that needs one, nobody to own the task — writes
-- NOT_RUN and its reason. It is never skipped silently. This is the rule
-- runner's own record, as `research_runs` is the research button's: it is not a
-- timeline, and the timeline reads it.
-- ---------------------------------------------------------------------------
CREATE TABLE automation_runs (
  id            TEXT PRIMARY KEY,
  rule_id       TEXT NOT NULL REFERENCES automation_rules(id),
  at            TEXT NOT NULL,
  trigger_event TEXT NOT NULL,
  stage         TEXT,
  claim_id      TEXT REFERENCES claims(id),
  lead_id       TEXT REFERENCES leads(id),
  -- The task whose completion or change was the event, where it was one.
  task_id       TEXT REFERENCES staff_tasks(id),
  business_id   TEXT REFERENCES businesses(id),
  -- Who caused the event. NULL for the funnel, which has no account.
  actor_id      TEXT REFERENCES users(id),
  outcome       TEXT NOT NULL CHECK (outcome IN ('RAN','NOT_RUN')),
  reason        TEXT,
  tasks_created INTEGER NOT NULL DEFAULT 0 CHECK (tasks_created >= 0),
  outbox_id     TEXT REFERENCES outbox(id),
  CHECK (outcome <> 'NOT_RUN' OR (reason IS NOT NULL AND tasks_created = 0 AND outbox_id IS NULL))
) STRICT;

CREATE INDEX automation_runs_claim_idx ON automation_runs(claim_id, at);
CREATE INDEX automation_runs_lead_idx ON automation_runs(lead_id, at);

CREATE TRIGGER automation_runs_no_update BEFORE UPDATE ON automation_runs
BEGIN SELECT RAISE(ABORT, 'automation_runs is append-only'); END;

CREATE TRIGGER automation_runs_no_delete BEFORE DELETE ON automation_runs
BEGIN SELECT RAISE(ABORT, 'automation_runs is append-only'); END;


-- ---------------------------------------------------------------------------
-- 3 · STAFF TASKS — a job a colleague does
--
-- DISTINCT FROM `client_tasks` AND NEVER MERGED INTO IT. A question the client
-- answers and a job a colleague does are different facts: one has an answer,
-- provenance and a portal; the other has an owner, a due date and a status.
-- There is no foreign key between the two tables in either direction.
--
-- A TASK IS ABOUT SOMETHING. An organisation, a property, a claim — or a LEAD,
-- because a call asked for at the reasoned negative is a lead with no
-- organisation (migration 011, row E22) and its first follow-up has to live
-- somewhere (row E24). A property and a claim each name their organisation, and
-- the composite foreign keys make it their own. A contact may be named as well:
-- the client's own contacts are not third parties.
--
-- A DUE DATE IS A CALENDAR DATE, NOT AN INSTANT (row E26). Nothing stored here
-- is a local time: `due_on` is YYYY-MM-DD, the day the task is due in the
-- business's own calendar, and "overdue" is asked of src/web/localtime.ts —
-- still the only file that names a zone — as "is today's UK date after it".
--
-- ONE CURRENT NEXT ACTION PER CLAIM, AT THE DATABASE. `is_next_action` on an
-- open task; the partial unique index below refuses a second. EXACTLY one — and
-- with an owner and a due date — is the store's rule and the breakers list's,
-- in src/web/tasks.ts, because a claim with none is a state to report, not a
-- row the database can refuse.
--
-- CANCELLED, NEVER DELETED; AND A CLOSED TASK KEEPS ITS RECORD. Completing or
-- cancelling records who and when; after that nothing about the row changes.
--
-- A RECURRENCE IS A RULE ABOUT COMPLETION, NOT A SCHEDULER. Completing a
-- recurring task creates its successor in the same transaction, once — the
-- partial unique index on `recurred_from_id` refuses a second — and nothing
-- anywhere wakes up on a clock.
-- ---------------------------------------------------------------------------
CREATE TABLE staff_tasks (
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
  FOREIGN KEY (property_id, business_id) REFERENCES properties(id, business_id),
  FOREIGN KEY (claim_id, business_id) REFERENCES claims(id, business_id),
  CHECK (business_id IS NOT NULL OR lead_id IS NOT NULL),
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

CREATE INDEX staff_tasks_owner_idx ON staff_tasks(owner_id, status, due_on);
CREATE INDEX staff_tasks_role_idx ON staff_tasks(owner_role, status, due_on);
CREATE INDEX staff_tasks_business_idx ON staff_tasks(business_id);
CREATE INDEX staff_tasks_claim_idx ON staff_tasks(claim_id);
CREATE INDEX staff_tasks_lead_idx ON staff_tasks(lead_id);
CREATE INDEX staff_tasks_contact_idx ON staff_tasks(contact_id);
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
CREATE TRIGGER staff_tasks_vocabulary_insert BEFORE INSERT ON staff_tasks
WHEN NEW.activity_type NOT IN ('CALL','EMAIL','MEETING','NOTE','TASK','SURVEY','DOCUMENT_REQUEST','REVIEW','OTHER')
  OR (NEW.priority IS NOT NULL AND NEW.priority NOT IN ('LOW','NORMAL','HIGH'))
BEGIN SELECT RAISE(ABORT, 'staff_tasks.activity_type or priority is not on the list'); END;

CREATE TRIGGER staff_tasks_vocabulary_update BEFORE UPDATE OF activity_type, priority ON staff_tasks
WHEN NEW.activity_type NOT IN ('CALL','EMAIL','MEETING','NOTE','TASK','SURVEY','DOCUMENT_REQUEST','REVIEW','OTHER')
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

-- A CONTACT NAMED ON A TASK IS ONE OF THE TASK'S OWN ORGANISATION OR LEAD.
CREATE TRIGGER staff_tasks_contact_belongs_insert BEFORE INSERT ON staff_tasks
WHEN NEW.contact_id IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM contacts c WHERE c.id = NEW.contact_id
     AND ((NEW.business_id IS NOT NULL AND c.business_id = NEW.business_id)
       OR (NEW.lead_id IS NOT NULL AND c.lead_id = NEW.lead_id)))
BEGIN SELECT RAISE(ABORT, 'a task''s contact must be one of its own organisation''s or lead''s'); END;

CREATE TRIGGER staff_tasks_contact_belongs_update BEFORE UPDATE OF contact_id, business_id, lead_id ON staff_tasks
WHEN NEW.contact_id IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM contacts c WHERE c.id = NEW.contact_id
     AND ((NEW.business_id IS NOT NULL AND c.business_id = NEW.business_id)
       OR (NEW.lead_id IS NOT NULL AND c.lead_id = NEW.lead_id)))
BEGIN SELECT RAISE(ABORT, 'a task''s contact must be one of its own organisation''s or lead''s'); END;


-- ---------------------------------------------------------------------------
-- 4 · EMAIL TEMPLATES — merged into the outbox, and nowhere else
--
-- MERGE FIELDS ARE {{contact_name}}, {{organisation}}, {{property_address}},
-- {{claim_reference}}, {{next_action}} and {{due_date}}, and the store refuses
-- any other. A merged value is escaped; a missing one is a visible gap.
--
-- A TEMPLATE CARRYING BANK DETAILS OR AN INVOICE IS REFUSED — here, by
-- keyword, and in src/web/templates.ts by keyword and by the shape of a sort
-- code, an account number and an IBAN. The invoice email waits on the
-- invoice-fraud procedure (Developer Spec §5.1 item 6); a template is the
-- easiest way round that wait, so it is closed at the table.
-- ---------------------------------------------------------------------------
CREATE TABLE email_templates (
  id          TEXT PRIMARY KEY,
  label       TEXT NOT NULL CHECK (length(trim(label)) BETWEEN 1 AND 200),
  subject     TEXT NOT NULL CHECK (length(trim(subject)) BETWEEN 1 AND 300),
  body        TEXT NOT NULL CHECK (length(trim(body)) BETWEEN 1 AND 20000),
  active      INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)),
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
) STRICT;

CREATE TRIGGER email_templates_never_deleted BEFORE DELETE ON email_templates
BEGIN SELECT RAISE(ABORT, 'an email template is retired by setting it inactive, never deleted'); END;

CREATE TRIGGER email_templates_no_invoice_or_bank_insert BEFORE INSERT ON email_templates
WHEN (NEW.label || ' ' || NEW.subject || ' ' || NEW.body) LIKE '%invoice%'
  OR (NEW.label || ' ' || NEW.subject || ' ' || NEW.body) LIKE '%remittance%'
  OR (NEW.label || ' ' || NEW.subject || ' ' || NEW.body) LIKE '%sort code%'
  OR (NEW.label || ' ' || NEW.subject || ' ' || NEW.body) LIKE '%account number%'
  OR (NEW.label || ' ' || NEW.subject || ' ' || NEW.body) LIKE '%bank detail%'
  OR (NEW.label || ' ' || NEW.subject || ' ' || NEW.body) LIKE '%bank account%'
  OR (NEW.label || ' ' || NEW.subject || ' ' || NEW.body) LIKE '%iban%'
BEGIN SELECT RAISE(ABORT, 'E_TEMPLATE_REFUSED: a template may not carry bank details or an invoice'); END;

CREATE TRIGGER email_templates_no_invoice_or_bank_update BEFORE UPDATE OF label, subject, body ON email_templates
WHEN (NEW.label || ' ' || NEW.subject || ' ' || NEW.body) LIKE '%invoice%'
  OR (NEW.label || ' ' || NEW.subject || ' ' || NEW.body) LIKE '%remittance%'
  OR (NEW.label || ' ' || NEW.subject || ' ' || NEW.body) LIKE '%sort code%'
  OR (NEW.label || ' ' || NEW.subject || ' ' || NEW.body) LIKE '%account number%'
  OR (NEW.label || ' ' || NEW.subject || ' ' || NEW.body) LIKE '%bank detail%'
  OR (NEW.label || ' ' || NEW.subject || ' ' || NEW.body) LIKE '%bank account%'
  OR (NEW.label || ' ' || NEW.subject || ' ' || NEW.body) LIKE '%iban%'
BEGIN SELECT RAISE(ABORT, 'E_TEMPLATE_REFUSED: a template may not carry bank details or an invoice'); END;


-- ---------------------------------------------------------------------------
-- 5 · A CLIENT QUESTION CAN BE DUE, AND AN INTERNAL NOTE CAN BE ABOUT A CLAIM
--
-- `client_tasks.due_on` — NULLABLE, and a question with none is not overdue and
-- not on time either: it has no due date, and the screen says so (N4). Document
-- requests are client questions of kind DOCUMENT when CRM 4 of 10 builds them,
-- so they inherit this column rather than growing their own.
--
-- `internal_notes.claim_id` and `property_id` — disposition rows 6.21 and 8.27.
-- ONE NOTES STORE: a note is still the organisation's, and may also say which
-- claim or property it is about. Each must be of the note's own organisation.
-- ---------------------------------------------------------------------------
ALTER TABLE client_tasks ADD COLUMN due_on TEXT
  CHECK (due_on IS NULL OR due_on GLOB '[0-9][0-9][0-9][0-9]-[01][0-9]-[0-3][0-9]');

ALTER TABLE internal_notes ADD COLUMN claim_id TEXT REFERENCES claims(id);
ALTER TABLE internal_notes ADD COLUMN property_id TEXT REFERENCES properties(id);

CREATE INDEX internal_notes_claim_idx ON internal_notes(claim_id);

CREATE TRIGGER internal_notes_link_same_organisation_insert BEFORE INSERT ON internal_notes
WHEN (NEW.claim_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM claims c WHERE c.id = NEW.claim_id AND c.business_id = NEW.business_id))
  OR (NEW.property_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM properties p WHERE p.id = NEW.property_id AND p.business_id = NEW.business_id))
BEGIN SELECT RAISE(ABORT, 'a note''s claim or property must be of the note''s own organisation'); END;

CREATE TRIGGER internal_notes_link_same_organisation_update BEFORE UPDATE OF claim_id, property_id, business_id ON internal_notes
WHEN (NEW.claim_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM claims c WHERE c.id = NEW.claim_id AND c.business_id = NEW.business_id))
  OR (NEW.property_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM properties p WHERE p.id = NEW.property_id AND p.business_id = NEW.business_id))
BEGIN SELECT RAISE(ABORT, 'a note''s claim or property must be of the note''s own organisation'); END;


-- ---------------------------------------------------------------------------
-- 6 · THE CLAIM'S NEXT ACTION BECOMES A TASK — carried over, then retired
--
-- `claims.next_action` and `next_action_due` (CRM 1 of 10) were free text and a
-- date, with no owner. Every non-empty one becomes an OPEN task on its claim,
-- owned by the claim's owner where it has one, due on the recorded date where
-- it is one — and the claim's current next action where the claim has not
-- closed or left the procedure. NOTHING IS INVENTED: a claim with no owner
-- carries an unowned next action, and the breakers list shows it; a claim that
-- recorded no next action gets none, and the breakers list shows that too.
--
-- Then both columns are emptied, and two named triggers refuse a new value —
-- migration 004's idiom for a retired field. Every reader now takes the next
-- action from the task (src/web/crm.ts, CLAIM_SELECT).
-- ---------------------------------------------------------------------------
INSERT INTO staff_tasks (id, title, description, owner_id, owner_role, due_on, priority, status, activity_type,
                         business_id, property_id, claim_id, lead_id, contact_id, fact_id, recurrence, recurred_from_id,
                         is_next_action, origin, automation_run_id, created_by, created_at, updated_at)
SELECT lower(hex(randomblob(16))),
       substr(trim(c.next_action), 1, 300),
       CASE WHEN length(trim(c.next_action)) > 300 THEN trim(c.next_action) ELSE NULL END,
       c.owner_id, NULL,
       CASE WHEN c.next_action_due GLOB '[0-9][0-9][0-9][0-9]-[01][0-9]-[0-3][0-9]' THEN c.next_action_due ELSE NULL END,
       NULL, 'OPEN', 'TASK', c.business_id, NULL, c.id, NULL, NULL, NULL, NULL, NULL,
       CASE WHEN c.stage IN ('CLOSED','DECLINED_AT_ENQUIRY','CLIENT_DID_NOT_PROCEED','CLIENT_DECLINED_TO_SIGN',
                             'REASONED_NEGATIVE','CLIENT_WITHDREW','OUTSIDE_AMENDMENT_WINDOW','CANCELLED','LOST')
            THEN 0 ELSE 1 END,
       'MIGRATION', NULL, NULL, c.updated_at, c.updated_at
  FROM claims c
 WHERE c.next_action IS NOT NULL AND length(trim(c.next_action)) > 0;

UPDATE claims SET next_action = NULL, next_action_due = NULL
 WHERE next_action IS NOT NULL OR next_action_due IS NOT NULL;

CREATE TRIGGER claims_next_action_retired_insert BEFORE INSERT ON claims
WHEN NEW.next_action IS NOT NULL OR NEW.next_action_due IS NOT NULL
BEGIN SELECT RAISE(ABORT, 'claims.next_action is retired: a claim''s next action is a staff task with an owner and a due date'); END;

CREATE TRIGGER claims_next_action_retired_update BEFORE UPDATE OF next_action, next_action_due ON claims
WHEN NEW.next_action IS NOT NULL OR NEW.next_action_due IS NOT NULL
BEGIN SELECT RAISE(ABORT, 'claims.next_action is retired: a claim''s next action is a staff task with an owner and a due date'); END;


-- ---------------------------------------------------------------------------
-- 7 · A CONTACT'S FOLLOW-UP BECOMES A TASK, AND THE LAST CONTACT IS DERIVED
--
-- Disposition rows 5.11 and 5.12. `next_follow_up_at` becomes an OPEN follow-up
-- task naming the contact — owned by the organisation's owner or the lead's,
-- and otherwise waiting with Sales — and the column is emptied and retired.
--
-- `last_contact_at` IS DERIVED FROM THE TIMELINE from here on: the latest
-- completed call, email or meeting task naming the contact, or a message to the
-- contact's address that the outbox actually sent. A value staff recorded
-- before today is KEPT, as the one thing the timeline cannot re-derive, and
-- read as "recorded by staff"; a trigger refuses any change to it. Nothing
-- recorded and nothing on the timeline read identically: no contact recorded.
-- ---------------------------------------------------------------------------
INSERT INTO staff_tasks (id, title, description, owner_id, owner_role, due_on, priority, status, activity_type,
                         business_id, property_id, claim_id, lead_id, contact_id, fact_id, recurrence, recurred_from_id,
                         is_next_action, origin, automation_run_id, created_by, created_at, updated_at)
SELECT lower(hex(randomblob(16))),
       'Follow up with this contact',
       'Carried over from the contact''s next follow-up date when a follow-up became a task.',
       COALESCE((SELECT b.owner_id FROM businesses b WHERE b.id = ct.business_id),
                (SELECT l.owner_id FROM leads l WHERE l.id = ct.lead_id)),
       CASE WHEN COALESCE((SELECT b.owner_id FROM businesses b WHERE b.id = ct.business_id),
                          (SELECT l.owner_id FROM leads l WHERE l.id = ct.lead_id)) IS NULL THEN 'SALES' ELSE NULL END,
       CASE WHEN substr(ct.next_follow_up_at, 1, 10) GLOB '[0-9][0-9][0-9][0-9]-[01][0-9]-[0-3][0-9]'
            THEN substr(ct.next_follow_up_at, 1, 10) ELSE NULL END,
       NULL, 'OPEN', 'CALL', ct.business_id, NULL, NULL,
       CASE WHEN ct.business_id IS NULL THEN ct.lead_id ELSE NULL END,
       ct.id, NULL, NULL, NULL, 0, 'MIGRATION', NULL, NULL,
       COALESCE(ct.updated_at, ct.created_at), COALESCE(ct.updated_at, ct.created_at)
  FROM contacts ct
 WHERE ct.next_follow_up_at IS NOT NULL AND length(trim(ct.next_follow_up_at)) > 0;

UPDATE contacts SET next_follow_up_at = NULL WHERE next_follow_up_at IS NOT NULL;

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


-- ---------------------------------------------------------------------------
-- 8 · THE SEEDED RULES — the full specification's list, re-keyed onto the
-- operating procedure (disposition section 14, and row E28)
--
-- Every rule is an ADMIN's to change or retire. The ids are readable because a
-- rule is named in its runs and in the tests, and a random id would be read by
-- nobody.
-- ---------------------------------------------------------------------------
INSERT INTO automation_rules (id, label, trigger_event, trigger_stage, trigger_activity, effect, task_title,
                              task_description, task_activity_type, task_priority, due_in_days, assign_to, assign_role,
                              attach_to, active, ord, source, created_at, updated_at) VALUES
  ('rule-lead-first-follow-up', 'A new lead gets its first follow-up', 'LEAD_CREATED', NULL, NULL, 'FOLLOW_UP',
   'First follow-up on a new lead', 'Contact the prospect by the route they chose, and record what you learn on the lead.',
   'CALL', NULL, 1, 'SUBJECT_OWNER', 'SALES', 'SUBJECT', 1, 10,
   'The full specification 14.1: lead created → an owner and a first follow-up. The owner is the lead''s own where it has one; otherwise the follow-up waits with Sales until somebody takes it. It fires for a lead with no organisation too.',
   strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')),

  ('rule-engaged-information-requests', 'Data gathering starts: ask for what is still missing', 'STAGE_ENTERED', 'DATA_GATHERING', NULL,
   'INFORMATION_REQUEST_TASKS', NULL, NULL, 'DOCUMENT_REQUEST', NULL, 5, 'SUBJECT_OWNER', 'SALES', 'SUBJECT', 1, 20,
   'The full specification 14.2, re-keyed: engagement signed → information-request tasks. A claim enters data gathering only through the engagement gate, so this is the moment the letter is signed; the tasks are generated from the DERIVED missing list on the business page, one per fact nobody has yet asked for — never a hand list.',
   strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')),

  ('rule-survey-brief', 'Survey stage: brief the surveyor', 'STAGE_ENTERED', 'SURVEY', NULL, 'CREATE_TASK',
   'Assign the survey job and give the surveyor the property, the room schedule and the evidence', NULL,
   'SURVEY', NULL, 3, 'SUBJECT_OWNER', 'SALES', 'SUBJECT', 1, 30,
   'The full specification 14.3 and 14.4, re-keyed: data gathering confirmed complete opens the survey stage → the next operational task. No appointment is stored: the survey is desktop-first.',
   strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')),

  ('rule-committed-valuation', 'Surveyor committed: prepare the valuation', 'STAGE_ENTERED', 'VALUATION', NULL, 'CREATE_TASK',
   'Prepare the valuation under the surveyor''s measured record, every rate sourced', NULL,
   'REVIEW', NULL, 10, 'SUBJECT_OWNER', 'SALES', 'SUBJECT', 1, 40,
   'The full specification 14.5, re-keyed: survey committed → valuation and report tasks. The gate out of the survey stage is the surveyor''s commitment and nothing else, so entering valuation is that commitment.',
   strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')),

  ('rule-committed-reports', 'Surveyor committed: prepare the reports', 'STAGE_ENTERED', 'VALUATION', NULL, 'CREATE_TASK',
   'Prepare the client report and the accountant report', 'No figure is stated to the client as claimable before the tax adviser''s sign-off.',
   'TASK', NULL, 20, 'SUBJECT_OWNER', 'SALES', 'SUBJECT', 1, 50,
   'The full specification 14.5, re-keyed, as above: the report task of the pair.',
   strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')),

  ('rule-reports-follow-up', 'Reports: follow up the client''s review', 'STAGE_ENTERED', 'REPORTS', NULL, 'FOLLOW_UP',
   'Follow up the client''s review of the report', NULL, 'CALL', NULL, 7, 'SUBJECT_OWNER', 'SALES', 'SUBJECT', 1, 60,
   'The full specification 14.6: the report enters client review → a follow-up date. Client review is a sub-state of the reports stage.',
   strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')),

  ('rule-invoice-finance-task', 'Invoice stage: a finance task', 'STAGE_ENTERED', 'INVOICE', NULL, 'CREATE_TASK',
   'Raise the invoice for this claim in the finance view', 'A task, never an email: the invoice email waits on the invoice-fraud procedure.',
   'TASK', NULL, 3, 'ROLE', 'ACCOUNTING', 'SUBJECT', 1, 70,
   'The full specification 14.7, re-keyed: INVOICE reached → a finance task, waiting with Accounting. Never an invoice email (Developer Spec §5.1 item 6).',
   strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')),

  ('rule-stage-notify-owner', 'Stage changed: tell the claim''s owner', 'STAGE_ENTERED', NULL, NULL, 'NOTIFY_OWNER',
   NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'SUBJECT', 1, 80,
   'The full specification 14.9: stage changed → notify. To the outbox only, to the owner''s own staff address, and never about a do-not-contact organisation.',
   strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')),

  ('rule-owner-notify', 'Owner changed: tell the new owner', 'OWNER_CHANGED', NULL, NULL, 'NOTIFY_OWNER',
   NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'SUBJECT', 1, 90,
   'The full specification 14.9: owner changed → notify. To the outbox only.',
   strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now'));

INSERT INTO email_templates (id, label, subject, body, active, created_at, updated_at) VALUES
  ('template-next-step', 'What happens next on your claim', 'Your claim {{claim_reference}} — the next step',
   'Dear {{contact_name}},' || char(10) || char(10) ||
   'This is about the claim {{claim_reference}} for {{organisation}}, on {{property_address}}.' || char(10) || char(10) ||
   'The next step is: {{next_action}}. We expect it by {{due_date}}.' || char(10) || char(10) ||
   'If anything here is not right, reply to this message and we will correct it.' || char(10) || char(10) ||
   'Caprebate',
   1, strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now'));
