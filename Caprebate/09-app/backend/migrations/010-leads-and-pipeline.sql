-- ===========================================================================
-- 010 — LEADS AND THE CLAIM PIPELINE: the operating procedure's ten stages,
-- their gates and their exits.                     CRM 2 of 10, 10 Sep 2026
--
-- The scope is 09-app/CAPREBATE-CRM-DISPOSITION.md, and every choice below that
-- is not obvious is recorded in its Part E with the reason. The procedure is
-- 08-monday-doc-exports/12552682457__Item-2-Standard-Operating-Procedures-
-- enquiry-to-defence-pack.md; src/web/stages.ts carries its words.
--
-- EXTENDED, NEVER REBUILT. `claims` gains columns by ALTER TABLE ADD COLUMN and
-- its stage vocabulary changes by REPLACING THE TWO NAMED TRIGGERS migration 009
-- left for exactly this, and nothing else. `surveyor_jobs` gains `claim_id` the
-- same way. Every table created here is STRICT.
--
-- ---------------------------------------------------------------------------
-- THE GATES ARE NOT IN THIS FILE. Every gate is in src/web/pipeline.ts, on the
-- server, and every one has a test that tries to skip it. The engagement gate
-- in particular is `assertSignedEngagement` in src/web/research.ts and there is
-- no second one: a trigger here that refused a stage past ENGAGEMENT would be
-- exactly the second implementation the brief forbids.
--
-- The one place this file reads the same two records a gate reads is the
-- ONE-TIME CONVERSION in section 5, and it is not a gate: it places an existing
-- claim, and it can only ever place it EARLIER than its old stage named. It
-- opens nothing.
-- ===========================================================================


-- ---------------------------------------------------------------------------
-- 1 · THE CONFIGURABLE REASON LISTS
--
-- A lead's lost reason and a claim's exit reason are codes from a list held
-- here, not in code, so CRM 9 of 10's settings screen can add to it without a
-- release. A code is never deleted — a retired one is set inactive — so a
-- historic row always still reads. Every seeded code names the stop condition
-- it comes from.
-- ---------------------------------------------------------------------------
CREATE TABLE reason_lists (
  list    TEXT NOT NULL CHECK (list IN ('LEAD_LOST','CLAIM_EXIT')),
  code    TEXT NOT NULL CHECK (length(code) BETWEEN 2 AND 60 AND code NOT GLOB '*[^A-Z_]*'),
  label   TEXT NOT NULL,
  ord     INTEGER NOT NULL,
  active  INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)),
  source  TEXT NOT NULL,
  PRIMARY KEY (list, code)
) STRICT;

CREATE TRIGGER reason_lists_never_deleted BEFORE DELETE ON reason_lists
BEGIN SELECT RAISE(ABORT, 'a reason code is retired by setting it inactive, never deleted: old rows still read it'); END;

CREATE TRIGGER reason_lists_code_is_permanent BEFORE UPDATE OF list, code ON reason_lists
BEGIN SELECT RAISE(ABORT, 'a reason code keeps its list and its code for ever'); END;

INSERT INTO reason_lists (list, code, label, ord, source) VALUES
  ('LEAD_LOST', 'OUTSIDE_SCOPE', 'Not a UK healthcare property', 10, 'SOP 1, stop conditions'),
  ('LEAD_LOST', 'OWNERSHIP_NOT_DEMONSTRATED', 'The enquirer cannot demonstrate ownership or authority to act for the owner', 20, 'SOP 1, stop conditions'),
  ('LEAD_LOST', 'PROPERTY_OR_STRUCTURE_WITHHELD', 'The enquirer will not identify the property or the ownership structure', 30, 'SOP 1, stop conditions'),
  ('LEAD_LOST', 'UNRESOLVED_PRIOR_CLAIM', 'A previous claim on the same fixtures that has not been resolved', 40, 'SOP 1, stop conditions'),
  ('LEAD_LOST', 'NOT_A_TRADING_CLIENT', 'Not a trading client', 50, 'Standing rule 13(a): commercial means the client, not the building'),
  ('LEAD_LOST', 'NO_RESPONSE', 'No response after contact', 60, 'Recorded by staff'),
  ('LEAD_LOST', 'CHOSE_NOT_TO_PROCEED', 'The prospect chose not to proceed', 70, 'Recorded by staff'),
  ('LEAD_LOST', 'DUPLICATE_LEAD', 'A duplicate of another lead', 80, 'Recorded by staff'),
  ('LEAD_LOST', 'OTHER', 'Another reason — written in the note', 90, 'Recorded by staff'),

  ('CLAIM_EXIT', 'OUTSIDE_SCOPE', 'Not a UK healthcare property', 10, 'SOP 1, stop conditions'),
  ('CLAIM_EXIT', 'OWNERSHIP_NOT_DEMONSTRATED', 'The enquirer cannot demonstrate ownership or authority to act for the owner', 20, 'SOP 1, stop conditions'),
  ('CLAIM_EXIT', 'UNRESOLVED_PRIOR_CLAIM', 'A previous claim on the same fixtures that has not been resolved', 30, 'SOP 1, stop conditions'),
  ('CLAIM_EXIT', 'NOT_A_TRADING_CLIENT', 'Not a trading client', 40, 'Standing rule 13(a): commercial means the client, not the building'),
  ('CLAIM_EXIT', 'NO_ASSESSMENT_DATA', 'The client cannot supply even approximate cost or floor area data', 50, 'SOP 2, stop conditions'),
  ('CLAIM_EXIT', 'CHOSE_NOT_TO_PROCEED', 'The client chose not to proceed to a paid engagement', 60, 'SOP 2, the gate'),
  ('CLAIM_EXIT', 'LETTER_NOT_SIGNED', 'No signed engagement letter, or the fee basis not agreed in writing', 70, 'SOP 3, stop conditions'),
  ('CLAIM_EXIT', 'CLIENT_ENTITY_UNCONFIRMED', 'The client entity cannot be confirmed', 80, 'SOP 3, stop conditions'),
  ('CLAIM_EXIT', 'ELECTION_UNRESOLVED', 'A nominal or unscoped section 198 election affects the property', 90, 'SOP 4, stop conditions'),
  ('CLAIM_EXIT', 'GRANT_NOT_TRACEABLE', 'A grant or contribution cannot be traced to specific cost elements', 100, 'SOP 4 and SOP 6, stop conditions'),
  ('CLAIM_EXIT', 'ADVISER_DIRECTED_NEGATIVE', 'The tax adviser directed a reasoned negative', 110, 'SOP 7, steps'),
  ('CLAIM_EXIT', 'AMENDMENT_WINDOW_CLOSED', 'The amendment window has closed, or will close before the claim can be filed', 120, 'SOP 7 and SOP 9, stop conditions'),
  ('CLAIM_EXIT', 'CLIENT_REJECTED_REPORT', 'The client rejected the report, or withdrew', 130, 'SOP 8, stop conditions'),
  ('CLAIM_EXIT', 'DUPLICATE_CLAIM', 'A duplicate of another claim', 140, 'Recorded by staff'),
  ('CLAIM_EXIT', 'OTHER', 'Another reason — written in the note', 150, 'Recorded by staff');


-- ---------------------------------------------------------------------------
-- 2 · THE CLAIM, EXTENDED
--
-- `hold_return_stage` — ON_HOLD CARRIES THE STAGE IT RETURNS TO, and a trigger
-- below refuses an ON_HOLD claim without one or without a hold reason.
--
-- `completed_at` — set when, and only when, the claim is CLOSED (disposition
-- row 8.26). A trigger keeps the two in step, so a reopen clears it.
--
-- `tax_adviser_signoff_at` — NULL UNTIL CRM 6 of 10. The gate out of
-- TAX_ADVISER_SIGNOFF reads this column and nothing else, so it ships SHUT:
-- nothing in this build writes it. CRM 6 of 10 builds the sign-off record and
-- points this gate at it.
-- ---------------------------------------------------------------------------
ALTER TABLE claims ADD COLUMN hold_return_stage TEXT;
ALTER TABLE claims ADD COLUMN completed_at TEXT;
ALTER TABLE claims ADD COLUMN tax_adviser_signoff_at TEXT;

-- The parent key for the two composite foreign keys below that point at a
-- claim: a lead's claim, and nothing else, must be of the lead's organisation.
CREATE UNIQUE INDEX claims_id_business_uq ON claims(id, business_id);
CREATE UNIQUE INDEX bookings_id_business_uq ON bookings(id, business_id);


-- ---------------------------------------------------------------------------
-- 3 · SURVEY JOBS REACH A CLAIM BY ITS ID (disposition Part E, row E5)
--
-- A survey job was keyed to an assessment, so a surveyor reached a claim only
-- through that claim's assessment. It now carries the claim itself, and
-- `claimSurveyors` in src/web/crm.ts reads this column and not the assessment.
-- The backfill takes the claim carrying the job's own assessment, which is the
-- one claim migration 009 opened for it. A job's claim must be of the job's own
-- organisation: refused below, at the database.
-- ---------------------------------------------------------------------------
ALTER TABLE surveyor_jobs ADD COLUMN claim_id TEXT REFERENCES claims(id);

UPDATE surveyor_jobs SET claim_id = (
  SELECT c.id FROM claims c
   WHERE c.assessment_id = surveyor_jobs.assessment_id AND c.business_id = surveyor_jobs.business_id
   ORDER BY c.created_at ASC, c.id ASC LIMIT 1);

CREATE INDEX surveyor_jobs_claim_idx ON surveyor_jobs(claim_id);

CREATE TRIGGER surveyor_jobs_claim_same_organisation_insert BEFORE INSERT ON surveyor_jobs
WHEN NEW.claim_id IS NOT NULL
 AND NOT EXISTS (SELECT 1 FROM claims c WHERE c.id = NEW.claim_id AND c.business_id = NEW.business_id)
BEGIN SELECT RAISE(ABORT, 'a survey job''s claim must belong to the job''s own organisation'); END;

CREATE TRIGGER surveyor_jobs_claim_same_organisation_update BEFORE UPDATE OF claim_id, business_id ON surveyor_jobs
WHEN NEW.claim_id IS NOT NULL
 AND NOT EXISTS (SELECT 1 FROM claims c WHERE c.id = NEW.claim_id AND c.business_id = NEW.business_id)
BEGIN SELECT RAISE(ABORT, 'a survey job''s claim must belong to the job''s own organisation'); END;


-- ---------------------------------------------------------------------------
-- 4 · EVERY MOVE, KEPT
--
-- WHO, FROM, TO AND WHY, one row per move, append-only. The audit log carries
-- the same move with the reason's CODE and never its free text — a note can
-- hold a name, and an audit line cannot be deleted. This table is also what a
-- card's age and CRM 9 of 10's days-per-stage are read from.
--
-- `kind`:
--   FORWARD    one stage on, through that stage's gate
--   EXIT       to one of the procedure's reasoned exits
--   HOLD       to ON_HOLD, carrying the stage it returns to
--   RESUME     from ON_HOLD back to that stage, and nowhere else
--   REOPEN     ADMIN only, with a reason: back to an earlier stage
--   OPENED     a claim coming into being, at the stage it starts in
--   CONVERTED  section 5's one-time conversion from the six-key vocabulary
-- ---------------------------------------------------------------------------
CREATE TABLE claim_stage_moves (
  id          TEXT PRIMARY KEY,
  claim_id    TEXT NOT NULL REFERENCES claims(id),
  at          TEXT NOT NULL,
  actor_id    TEXT REFERENCES users(id),
  actor_role  TEXT,
  kind        TEXT NOT NULL CHECK (kind IN ('FORWARD','EXIT','HOLD','RESUME','REOPEN','OPENED','CONVERTED')),
  from_stage  TEXT,
  to_stage    TEXT,
  reason_code TEXT,
  reason_text TEXT,
  -- A person moves a claim. Only its opening and the conversion may have nobody.
  CHECK (kind IN ('OPENED','CONVERTED') OR actor_id IS NOT NULL),
  -- An exit is reasoned, and a reopen is reasoned.
  CHECK (kind <> 'EXIT' OR reason_code IS NOT NULL),
  CHECK (kind NOT IN ('REOPEN','HOLD') OR (reason_text IS NOT NULL AND length(trim(reason_text)) > 0))
) STRICT;

CREATE INDEX claim_stage_moves_claim_idx ON claim_stage_moves(claim_id, at);

CREATE TRIGGER claim_stage_moves_no_update BEFORE UPDATE ON claim_stage_moves
BEGIN SELECT RAISE(ABORT, 'claim_stage_moves is append-only'); END;

CREATE TRIGGER claim_stage_moves_no_delete BEFORE DELETE ON claim_stage_moves
BEGIN SELECT RAISE(ABORT, 'claim_stage_moves is append-only'); END;

CREATE TRIGGER claim_stage_moves_exit_reason_is_listed BEFORE INSERT ON claim_stage_moves
WHEN NEW.reason_code IS NOT NULL
 AND NOT EXISTS (SELECT 1 FROM reason_lists r WHERE r.list = 'CLAIM_EXIT' AND r.code = NEW.reason_code)
BEGIN SELECT RAISE(ABORT, 'an exit reason must be a code on the claim exit list'); END;


-- ---------------------------------------------------------------------------
-- 5 · THE STAGE VOCABULARY — THE TWO TRIGGERS REPLACED, AND EVERY CLAIM CONVERTED
--
-- DROP FIRST, because the old update trigger would refuse the conversion.
--
-- THE CONVERSION, ONCE. Each old key is mapped to the procedure stage it names:
--   ASSESSMENT_SUBMITTED -> ASSESSMENT        AT_SURVEY -> SURVEY
--   ENGAGEMENT_SIGNED    -> DATA_GATHERING    INVOICED  -> INVOICE
--   RESEARCH_PART_RUN    -> DATA_GATHERING    PAID      -> DEFENCE_PACK
-- and then PLACED NO LATER THAN THE RECORDS THAT A GATE READS CAN EVIDENCE —
-- because a converted claim sitting past a gate its record could never have
-- opened is a state the application refuses to produce:
--   past ENGAGEMENT only where the organisation's engagement letter is SIGNED;
--   past SURVEY only where a surveyor's commitment exists on a job on the claim;
--   past TAX_ADVISER_SIGNOFF never, because no sign-off record exists yet.
-- The gates a person opens by recording a confirmation — the enquiry checks and
-- the milestones — had no record to read before this migration, so a converted
-- claim beyond one shows that confirmation as never recorded. It does not pass
-- it: nothing moves forward through a gate that is not open.
-- A NULL stage stays NULL, and a screen says it is not recognised (N4).
-- Every conversion is a CONVERTED row in claim_stage_moves, old key to new.
-- ---------------------------------------------------------------------------
DROP TRIGGER claims_stage_insert;
DROP TRIGGER claims_stage_update;

WITH named AS (
  SELECT c.id AS claim_id, c.business_id, c.stage AS legacy, c.updated_at,
    CASE c.stage
      WHEN 'ASSESSMENT_SUBMITTED' THEN 'ASSESSMENT'
      WHEN 'ENGAGEMENT_SIGNED'    THEN 'DATA_GATHERING'
      WHEN 'RESEARCH_PART_RUN'    THEN 'DATA_GATHERING'
      WHEN 'AT_SURVEY'            THEN 'SURVEY'
      WHEN 'INVOICED'             THEN 'INVOICE'
      WHEN 'PAID'                 THEN 'DEFENCE_PACK'
    END AS stage
  FROM claims c
  WHERE c.stage IS NOT NULL
),
placed AS (
  SELECT n.claim_id, n.legacy, n.updated_at,
    CASE
      WHEN n.stage IN ('DATA_GATHERING','SURVEY','VALUATION','TAX_ADVISER_SIGNOFF','REPORTS','INVOICE','DEFENCE_PACK')
       AND NOT EXISTS (SELECT 1 FROM engagements e WHERE e.business_id = n.business_id AND e.letter_state = 'SIGNED')
        THEN 'ENGAGEMENT'
      WHEN n.stage IN ('VALUATION','TAX_ADVISER_SIGNOFF','REPORTS','INVOICE','DEFENCE_PACK')
       AND NOT EXISTS (SELECT 1 FROM surveyor_commitments sc JOIN surveyor_jobs j ON j.id = sc.job_id
                        WHERE j.claim_id = n.claim_id)
        THEN 'SURVEY'
      WHEN n.stage IN ('REPORTS','INVOICE','DEFENCE_PACK')
        THEN 'TAX_ADVISER_SIGNOFF'
      ELSE n.stage
    END AS stage
  FROM named n
)
INSERT INTO claim_stage_moves (id, claim_id, at, actor_id, actor_role, kind, from_stage, to_stage, reason_code, reason_text)
SELECT lower(hex(randomblob(16))), p.claim_id, p.updated_at, NULL, NULL, 'CONVERTED', p.legacy, p.stage, NULL,
       'converted by migration 010 from the six-key vocabulary, placed no later than its records evidence'
  FROM placed p;

UPDATE claims SET stage = (
  SELECT m.to_stage FROM claim_stage_moves m WHERE m.claim_id = claims.id AND m.kind = 'CONVERTED')
WHERE stage IS NOT NULL;

CREATE TRIGGER claims_stage_insert BEFORE INSERT ON claims
WHEN NEW.stage IS NOT NULL AND NEW.stage NOT IN
  ('ENQUIRY','ASSESSMENT','ENGAGEMENT','DATA_GATHERING','SURVEY','VALUATION','TAX_ADVISER_SIGNOFF',
   'REPORTS','INVOICE','DEFENCE_PACK','CLOSED',
   'DECLINED_AT_ENQUIRY','CLIENT_DID_NOT_PROCEED','CLIENT_DECLINED_TO_SIGN','REASONED_NEGATIVE',
   'CLIENT_WITHDREW','OUTSIDE_AMENDMENT_WINDOW','CANCELLED','LOST',
   'ON_HOLD')
BEGIN SELECT RAISE(ABORT, 'claims.stage is not a stage of the operating procedure'); END;

CREATE TRIGGER claims_stage_update BEFORE UPDATE OF stage ON claims
WHEN NEW.stage IS NOT NULL AND NEW.stage NOT IN
  ('ENQUIRY','ASSESSMENT','ENGAGEMENT','DATA_GATHERING','SURVEY','VALUATION','TAX_ADVISER_SIGNOFF',
   'REPORTS','INVOICE','DEFENCE_PACK','CLOSED',
   'DECLINED_AT_ENQUIRY','CLIENT_DID_NOT_PROCEED','CLIENT_DECLINED_TO_SIGN','REASONED_NEGATIVE',
   'CLIENT_WITHDREW','OUTSIDE_AMENDMENT_WINDOW','CANCELLED','LOST',
   'ON_HOLD')
BEGIN SELECT RAISE(ABORT, 'claims.stage is not a stage of the operating procedure'); END;

-- ON_HOLD CARRIES A REASON AND THE STAGE IT RETURNS TO — one of the ten.
CREATE TRIGGER claims_on_hold_carries_its_return_insert BEFORE INSERT ON claims
WHEN NEW.stage = 'ON_HOLD' AND (NEW.hold_reason IS NULL OR NEW.hold_return_stage IS NULL
  OR NEW.hold_return_stage NOT IN ('ENQUIRY','ASSESSMENT','ENGAGEMENT','DATA_GATHERING','SURVEY','VALUATION',
                                   'TAX_ADVISER_SIGNOFF','REPORTS','INVOICE','DEFENCE_PACK'))
BEGIN SELECT RAISE(ABORT, 'a claim on hold carries a hold reason and the procedure stage it returns to'); END;

CREATE TRIGGER claims_on_hold_carries_its_return_update BEFORE UPDATE ON claims
WHEN NEW.stage = 'ON_HOLD' AND (NEW.hold_reason IS NULL OR NEW.hold_return_stage IS NULL
  OR NEW.hold_return_stage NOT IN ('ENQUIRY','ASSESSMENT','ENGAGEMENT','DATA_GATHERING','SURVEY','VALUATION',
                                   'TAX_ADVISER_SIGNOFF','REPORTS','INVOICE','DEFENCE_PACK'))
BEGIN SELECT RAISE(ABORT, 'a claim on hold carries a hold reason and the procedure stage it returns to'); END;

-- A COMPLETION DATE MEANS CLOSED, AND CLOSED MEANS A COMPLETION DATE.
CREATE TRIGGER claims_completed_when_closed_update BEFORE UPDATE ON claims
WHEN (NEW.stage IS 'CLOSED') <> (NEW.completed_at IS NOT NULL)
BEGIN SELECT RAISE(ABORT, 'a claim has a completion date exactly when it is closed'); END;

CREATE TRIGGER claims_completed_when_closed_insert BEFORE INSERT ON claims
WHEN (NEW.stage IS 'CLOSED') <> (NEW.completed_at IS NOT NULL)
BEGIN SELECT RAISE(ABORT, 'a claim has a completion date exactly when it is closed'); END;


-- ---------------------------------------------------------------------------
-- 6 · THE MILESTONES A PERSON CONFIRMS
--
-- The procedure's gates at DATA_GATHERING, VALUATION, REPORTS, INVOICE and
-- DEFENCE_PACK turn on facts CRM 6 of 10 builds — the floor area's source, the
-- election, every rate sourced, the reports accepted. Until then the gate is a
-- RECORDED CONFIRMATION: who, when, a note, and the stage the claim was in.
-- A gate reads only a confirmation made since the claim last ENTERED that
-- stage, so a reopen invalidates what was confirmed before it.
--
-- NOT HERE, ON PURPOSE: the surveyor's commitment (a real record, 006) and the
-- tax adviser's sign-off (a column, above, null until CRM 6 of 10). Neither can
-- be stood in for by a click, so neither is on this list.
-- ---------------------------------------------------------------------------
CREATE TABLE claim_milestones (
  id           TEXT PRIMARY KEY,
  claim_id     TEXT NOT NULL REFERENCES claims(id),
  milestone    TEXT NOT NULL CHECK (milestone IN
                 ('DATA_GATHERING_COMPLETE','VALUATION_SIGNED','CLIENT_ACCEPTED_REPORT',
                  'ACCOUNTANT_CONFIRMED_RETURN','AMENDED_RETURN_FILED','HMRC_PROCESSED_RELIEF',
                  'DEFENCE_PACK_COMPLETE')),
  stage_at     TEXT NOT NULL,
  note         TEXT,
  recorded_by  TEXT NOT NULL REFERENCES users(id),
  recorded_at  TEXT NOT NULL
) STRICT;

CREATE INDEX claim_milestones_claim_idx ON claim_milestones(claim_id, milestone, recorded_at);

CREATE TRIGGER claim_milestones_no_update BEFORE UPDATE ON claim_milestones
BEGIN SELECT RAISE(ABORT, 'claim_milestones is append-only'); END;

CREATE TRIGGER claim_milestones_no_delete BEFORE DELETE ON claim_milestones
BEGIN SELECT RAISE(ABORT, 'claim_milestones is append-only'); END;


-- ---------------------------------------------------------------------------
-- 7 · LEADS — NOT A SECOND INTAKE
--
-- A filled assessment, a funnel-close booking, a gated exit and a referral are
-- already leads. This table ties them together; it does not collect them again.
--
-- A LEAD CARRIES NO PERSON. The client's own contact is a `contacts` row on the
-- organisation, where the funnel close already writes it. A lead with no
-- organisation yet — a referral — carries the organisation's name and sector,
-- and nothing about anybody.
--
-- NO SCORE AND NO PROBABILITY COLUMN. A score built on the estimate routes
-- unknowns into a number that ranks leads (N4): disposition rows 7.8 and 25.10.
--
-- `introducer_id` IS A COLUMN WITHOUT A FOREIGN KEY. CRM 5 of 10 builds the
-- introducers and adds it.
--
-- CONVERSION IS FINAL AND COMPLETE: a CONVERTED lead has its organisation, its
-- claim and its conversion date, and keeps all three for ever. A LOST lead has a
-- listed reason. A lead is never deleted.
-- ---------------------------------------------------------------------------
CREATE TABLE leads (
  id                    TEXT PRIMARY KEY,
  business_id           TEXT REFERENCES businesses(id),
  assessment_id         TEXT,
  booking_id            TEXT,
  claim_id              TEXT,
  origin                TEXT NOT NULL CHECK (origin IN ('ASSESSMENT','BOOKING','GATED_EXIT','REFERRAL','STAFF')),
  source                TEXT NOT NULL,
  introducer_id         TEXT,
  prospect_organisation TEXT,
  prospect_sector       TEXT CHECK (prospect_sector IN
                          ('care_homes','dental','supported_living','gp','private_hospital')),
  lead_date             TEXT NOT NULL,
  owner_id              TEXT REFERENCES users(id),
  -- LOW, NORMAL, HIGH — validated in code, as claims.priority is.
  priority              TEXT,
  next_action           TEXT,
  next_action_due       TEXT,
  status                TEXT NOT NULL,
  lost_reason           TEXT,
  lost_note             TEXT,
  converted_at          TEXT,
  created_at            TEXT NOT NULL,
  updated_at            TEXT NOT NULL,
  FOREIGN KEY (assessment_id, business_id) REFERENCES assessments(id, business_id),
  FOREIGN KEY (booking_id, business_id) REFERENCES bookings(id, business_id),
  FOREIGN KEY (claim_id, business_id) REFERENCES claims(id, business_id),
  CHECK (business_id IS NOT NULL OR (prospect_organisation IS NOT NULL AND length(trim(prospect_organisation)) > 0)),
  CHECK (assessment_id IS NULL OR business_id IS NOT NULL),
  CHECK (booking_id IS NULL OR business_id IS NOT NULL),
  CHECK (claim_id IS NULL OR business_id IS NOT NULL),
  CHECK (status <> 'CONVERTED' OR (converted_at IS NOT NULL AND claim_id IS NOT NULL AND business_id IS NOT NULL)),
  CHECK (status = 'CONVERTED' OR (converted_at IS NULL AND claim_id IS NULL)),
  CHECK (status <> 'LOST' OR lost_reason IS NOT NULL)
) STRICT;

CREATE INDEX leads_business_idx ON leads(business_id);
CREATE UNIQUE INDEX leads_one_per_assessment_uq ON leads(assessment_id) WHERE assessment_id IS NOT NULL;
CREATE UNIQUE INDEX leads_one_per_claim_uq ON leads(claim_id) WHERE claim_id IS NOT NULL;

CREATE TRIGGER leads_source_insert BEFORE INSERT ON leads
WHEN NEW.source NOT IN ('WEBSITE','REFERRAL','ACCOUNTANT','ADVISER','OUTBOUND','EVENT','EXISTING_CLIENT','OTHER')
BEGIN SELECT RAISE(ABORT, 'leads.source is not on the lead-source list'); END;

CREATE TRIGGER leads_source_update BEFORE UPDATE OF source ON leads
WHEN NEW.source NOT IN ('WEBSITE','REFERRAL','ACCOUNTANT','ADVISER','OUTBOUND','EVENT','EXISTING_CLIENT','OTHER')
BEGIN SELECT RAISE(ABORT, 'leads.source is not on the lead-source list'); END;

CREATE TRIGGER leads_status_insert BEFORE INSERT ON leads
WHEN NEW.status NOT IN ('NEW','CONTACTED','QUALIFIED','NURTURE','CONVERTED','LOST')
BEGIN SELECT RAISE(ABORT, 'leads.status is not on the lead-status list'); END;

CREATE TRIGGER leads_status_update BEFORE UPDATE OF status ON leads
WHEN NEW.status NOT IN ('NEW','CONTACTED','QUALIFIED','NURTURE','CONVERTED','LOST')
BEGIN SELECT RAISE(ABORT, 'leads.status is not on the lead-status list'); END;

CREATE TRIGGER leads_lost_reason_is_listed_insert BEFORE INSERT ON leads
WHEN NEW.lost_reason IS NOT NULL
 AND NOT EXISTS (SELECT 1 FROM reason_lists r WHERE r.list = 'LEAD_LOST' AND r.code = NEW.lost_reason)
BEGIN SELECT RAISE(ABORT, 'a lost reason must be a code on the lead lost list'); END;

CREATE TRIGGER leads_lost_reason_is_listed_update BEFORE UPDATE OF lost_reason ON leads
WHEN NEW.lost_reason IS NOT NULL
 AND NOT EXISTS (SELECT 1 FROM reason_lists r WHERE r.list = 'LEAD_LOST' AND r.code = NEW.lost_reason)
BEGIN SELECT RAISE(ABORT, 'a lost reason must be a code on the lead lost list'); END;

CREATE TRIGGER leads_conversion_is_final BEFORE UPDATE ON leads
WHEN OLD.status = 'CONVERTED' AND (NEW.status IS NOT 'CONVERTED' OR NEW.claim_id IS NOT OLD.claim_id
  OR NEW.business_id IS NOT OLD.business_id OR NEW.converted_at IS NOT OLD.converted_at
  OR NEW.assessment_id IS NOT OLD.assessment_id)
BEGIN SELECT RAISE(ABORT, 'a converted lead keeps its organisation, its claim and its conversion for ever'); END;

CREATE TRIGGER leads_never_deleted BEFORE DELETE ON leads
BEGIN SELECT RAISE(ABORT, 'a lead is never deleted: it is lost, with a reason, and the record stays'); END;

-- BACKFILL: ONE LEAD PER EXISTING ORGANISATION, FROM WHAT ALREADY MADE IT A LEAD.
--   the assessment  its latest, where it has one
--   the booking     its first, where it has one
--   the origin      ASSESSMENT where there is an assessment; otherwise GATED_EXIT or BOOKING from
--                   the booking's own entry point; otherwise STAFF
--   the source      the organisation's own, which migration 009 derived as WEBSITE for the funnel
--   the date        the first assessment, else the first booking, else the organisation's creation
--   the status      CONVERTED where a claim already exists — migration 009 opened one for every
--                   organisation, so today that is every one — carrying the claim that holds the
--                   assessment, or the organisation's first claim; NEW otherwise
INSERT INTO leads (id, business_id, assessment_id, booking_id, claim_id, origin, source, introducer_id,
                   prospect_organisation, prospect_sector, lead_date, owner_id, priority, next_action,
                   next_action_due, status, lost_reason, lost_note, converted_at, created_at, updated_at)
SELECT
  lower(hex(randomblob(16))),
  b.id,
  a.id,
  k.id,
  cl.id,
  CASE WHEN a.id IS NOT NULL THEN 'ASSESSMENT'
       WHEN k.entry_point = 'gated_exit' THEN 'GATED_EXIT'
       WHEN k.id IS NOT NULL THEN 'BOOKING'
       ELSE 'STAFF' END,
  COALESCE(b.source, CASE WHEN a.id IS NOT NULL THEN 'WEBSITE' ELSE 'OTHER' END),
  NULL, NULL, NULL,
  COALESCE((SELECT MIN(x.submitted_at) FROM assessments x WHERE x.business_id = b.id), k.created_at, b.created_at),
  b.owner_id, NULL, NULL, NULL,
  CASE WHEN cl.id IS NOT NULL THEN 'CONVERTED' ELSE 'NEW' END,
  NULL, NULL,
  cl.created_at,
  b.created_at,
  b.created_at
FROM businesses b
LEFT JOIN assessments a ON a.id = (
  SELECT x.id FROM assessments x WHERE x.business_id = b.id ORDER BY x.submitted_at DESC, x.id DESC LIMIT 1)
LEFT JOIN bookings k ON k.id = (
  SELECT y.id FROM bookings y WHERE y.business_id = b.id ORDER BY y.created_at ASC, y.id ASC LIMIT 1)
LEFT JOIN claims cl ON cl.id = COALESCE(
  (SELECT z.id FROM claims z WHERE z.business_id = b.id AND z.assessment_id = a.id ORDER BY z.created_at, z.id LIMIT 1),
  (SELECT z.id FROM claims z WHERE z.business_id = b.id ORDER BY z.created_at, z.id LIMIT 1));


-- ---------------------------------------------------------------------------
-- 8 · THE ENQUIRY GATE — each check YES, NO or UNKNOWN, with who recorded it
--
-- From SOP 1, and standing rule 13(a): a UK healthcare property; a TRADING
-- client (commercial means the client, not the building — so supported living
-- is in); the enquirer is the owner or acts with the owner's authority; no
-- existing claim conflict. Recorded against a lead, or against a claim a person
-- opened without one. APPEND-ONLY: the current answer is the latest, and every
-- earlier one is still here.
--
-- UNKNOWN DOES NOT PASS, AND NEITHER DOES A CHECK NOBODY RECORDED. The two read
-- identically in src/web/pipeline.ts, and a test asserts both.
-- ---------------------------------------------------------------------------
CREATE TABLE enquiry_checks (
  id           TEXT PRIMARY KEY,
  lead_id      TEXT REFERENCES leads(id),
  claim_id     TEXT REFERENCES claims(id),
  check_key    TEXT NOT NULL CHECK (check_key IN
                 ('UK_HEALTHCARE_PROPERTY','TRADING_CLIENT','OWNER_OR_AUTHORISED','NO_CLAIM_CONFLICT')),
  answer       TEXT NOT NULL CHECK (answer IN ('YES','NO','UNKNOWN')),
  note         TEXT,
  recorded_by  TEXT NOT NULL REFERENCES users(id),
  recorded_at  TEXT NOT NULL,
  CHECK ((lead_id IS NULL) <> (claim_id IS NULL))
) STRICT;

CREATE INDEX enquiry_checks_lead_idx ON enquiry_checks(lead_id, check_key, recorded_at);
CREATE INDEX enquiry_checks_claim_idx ON enquiry_checks(claim_id, check_key, recorded_at);

CREATE TRIGGER enquiry_checks_no_update BEFORE UPDATE ON enquiry_checks
BEGIN SELECT RAISE(ABORT, 'enquiry_checks is append-only: record a new answer instead'); END;

CREATE TRIGGER enquiry_checks_no_delete BEFORE DELETE ON enquiry_checks
BEGIN SELECT RAISE(ABORT, 'enquiry_checks is append-only: record a new answer instead'); END;
