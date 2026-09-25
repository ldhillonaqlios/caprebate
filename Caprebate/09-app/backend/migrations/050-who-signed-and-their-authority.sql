-- ===========================================================================
-- 050 — WHO SIGNED, AND WHETHER THE REGISTER SAYS THEY MAY: YES OR NO, AND NO NAME.   Phase 151b, 25 September 2026
--
-- Word question 156, for the data protection officer: "May we briefly check two public register names without saving
-- them?" Answer, closed 24 September 2026: "Yes – best to check who signs and if they have authority". The action
-- plan: "check who signs and whether they have authority against the public register, reading names in memory and
-- keeping only yes or no; switched off with the lookups."
--
-- src/connectors/signatory-check.ts compares the name typed on the signed engagement letter with the Companies House
-- officers list and the care regulator's registered manager and nominated individual, in memory. This table keeps
-- what that comparison came to, and only that:
--
--   signatory_checks   ONE CHECK OF ONE REGISTER ON ONE RUN: the organisation, the engagement whose signer was
--                      checked, the register (COMPANIES_HOUSE or CQC), the result (YES, NO or NOT_CHECKED), the
--                      reason as a CODE from a closed list, when, and who pressed "Run the research". APPEND-ONLY:
--                      the latest row for a register is the answer, and every row is kept.
--
-- NO NAME, ANYWHERE. There is no name column, and the reason is not free text: a CHECK allows only the codes below,
-- so no later change to the code can write a name into it. The words a person reads are made from the code when the
-- research panel is drawn (signatoryWords in src/connectors/signatory-check.ts). The client never sees this table.
--
-- NOT KEPT: an outcome where nothing happened — the lookups switched off, free lookups not yet open, the letter not
-- signed, no key. Those are worked out afresh each time the panel is drawn, so no row and "not checked" read alike.
--
-- "NO" IS NOT A RISK. It records what the register shows; nothing reads it as a warning, and a person decides.
-- ===========================================================================

CREATE TABLE signatory_checks (
  id             TEXT PRIMARY KEY,
  business_id    TEXT NOT NULL REFERENCES businesses(id),
  engagement_id  TEXT NOT NULL REFERENCES engagements(id),
  source         TEXT NOT NULL CHECK (source IN ('COMPANIES_HOUSE','CQC')),
  result         TEXT NOT NULL CHECK (result IN ('YES','NO','NOT_CHECKED')),
  reason         TEXT NOT NULL CHECK (reason IN (
                   'CURRENT_DIRECTOR','DESIGNATED_MEMBER','REGISTERED_MANAGER','NOMINATED_INDIVIDUAL',
                   'NOT_LISTED','RESIGNED','ROLE_CANNOT_SIGN',
                   'NO_SIGNER_NAME','NO_COMPANY_NUMBER','NO_CARE_REGISTRATION','NOT_ON_THIS_REGISTER','NO_RECORD_ON_REGISTER',
                   'REGISTER_DID_NOT_ANSWER','REGISTER_UNREADABLE','TOO_MANY_TO_READ')),
  checked_at     TEXT NOT NULL,
  checked_by     TEXT NOT NULL REFERENCES users(id),
  -- The result follows from the reason, so the two can never disagree.
  CHECK ((result = 'YES') = (reason IN ('CURRENT_DIRECTOR','DESIGNATED_MEMBER','REGISTERED_MANAGER','NOMINATED_INDIVIDUAL'))),
  CHECK ((result = 'NO') = (reason IN ('NOT_LISTED','RESIGNED','ROLE_CANNOT_SIGN'))),
  -- A director is Companies House's to name; a registered manager or nominated individual is the care regulator's.
  CHECK (source = 'COMPANIES_HOUSE' OR reason NOT IN ('CURRENT_DIRECTOR','DESIGNATED_MEMBER','RESIGNED','ROLE_CANNOT_SIGN','NO_COMPANY_NUMBER')),
  CHECK (source = 'CQC' OR reason NOT IN ('REGISTERED_MANAGER','NOMINATED_INDIVIDUAL','NO_CARE_REGISTRATION'))
) STRICT;

CREATE INDEX signatory_checks_by_business ON signatory_checks (business_id, source, checked_at);

CREATE TRIGGER signatory_checks_no_update BEFORE UPDATE ON signatory_checks
BEGIN SELECT RAISE(ABORT, 'a check is never edited: a later check is a new row'); END;

CREATE TRIGGER signatory_checks_no_delete BEFORE DELETE ON signatory_checks
BEGIN SELECT RAISE(ABORT, 'a check is kept as a record of what the register showed'); END;
