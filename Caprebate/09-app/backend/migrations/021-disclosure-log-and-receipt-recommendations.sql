-- ===========================================================================
-- 021 — THE PER-DISCLOSURE LOG, AND THE RECOMMENDED RECEIPT STRIPS.
--                                                  Phase 129, 12 September 2026
--
-- TWO THINGS, BOTH BUILT AND SWITCHED OFF, AND NEITHER CHANGES WHAT RUNS TODAY.
--
-- 1 · `disclosure_log` — one row per disclosure of a client's personal data to
--     a recipient: when, to whom, which data, on what lawful basis, by whom.
--     The code is src/web/disclosure-log.ts. The switch, `DISCLOSURE_LOG`, ships
--     `enabled: false`, and while it is off nothing writes here and nothing
--     reads here. The recipient vocabulary is the document "Who we pass client
--     personal data on to" (06-commercial-and-governance/
--     Caprebate-Recipients-of-Client-Personal-Data-v1.md), sections 1 and 2,
--     WORD FOR WORD: R1 to R4 are recipients, P1 to P7 are processors — and
--     R5, the registers, is NOT here, because a source is not a recipient.
--
-- 2 · `receipt_strip_recommendations` — for each of the fourteen document types
--     migration 013 recorded with no receipt policy, the strip we RECOMMEND and a
--     one-line reason the data protection officer can approve or amend. THIS
--     BINDS NOTHING. `document_types.handler_type` stays NULL for all fourteen, so
--     NO_RECEIPT_POLICY in src/web/documents.ts refuses an upload of any of them,
--     and a request for one, exactly as before. The copy the code reads is
--     RECEIPT_RECOMMENDATIONS in src/web/receipt-recommendations.ts, and a test
--     holds the two identical.
--
-- WHAT BINDING A RECOMMENDATION WILL TAKE — more than "one line", and said here
-- so nobody prices it as one: a policy entry in the ingestion module
-- (04-phase-work/phase3/caprebate-client-doc-ingestion.ts) under a document type
-- of its own, because `document_types_handler_uq` allows one type per policy; and
-- a migration that rebuilds `document_types`, because the handler_type CHECK
-- lists the eleven policies and SQLite cannot alter a CHECK, and that drops and
-- recreates `document_types_fixed` around the change.
--
-- NOTHING HERE IS EVER DELETED OR CHANGED. A disclosure recorded wrongly is
-- corrected by a new row naming the one it corrects.
-- ===========================================================================


-- ---------------------------------------------------------------------------
-- 1 · THE PER-DISCLOSURE LOG
--
-- NO PERSON'S NAME IS WRITTEN HERE. "To whom" is the recipient's code and, where
-- there is one, the contact or the surveyor's login already on record; "which
-- data" is a list of categories; "by whom" is the user who recorded it.
--
-- A PROCESSOR IS A RECIPIENT TOO (Article 4(9)), and the three CHECKs at the foot
-- hold the one shape a processor's row can have: it holds the data on our
-- instruction, in its own system, under Article 28 terms.
-- ---------------------------------------------------------------------------
CREATE TABLE disclosure_log (
  id                    TEXT PRIMARY KEY,
  business_id           TEXT NOT NULL REFERENCES businesses(id),
  claim_id              TEXT REFERENCES claims(id),
  recipient             TEXT NOT NULL CHECK (recipient IN
                          ('R1_SURVEYOR','R2_TAX_ADVISER','R3_CLIENT_ACCOUNTANT','R4_HMRC',
                           'P1_MICROSOFT','P2_MONDAY','P3_IONOS','P4_OBJECT_STORE','P5_WORDPRESS_HOST',
                           'P6_EXTRACTION_MODEL','P7_ADDRESS_LOOKUP')),
  recipient_contact_id  TEXT REFERENCES contacts(id),
  recipient_user_id     TEXT REFERENCES users(id),
  data_categories       TEXT NOT NULL CHECK (json_valid(data_categories) AND json_type(data_categories) = 'array'
                          AND json_array_length(data_categories) >= 1),
  occasion              TEXT NOT NULL CHECK (occasion IN
                          ('VALUATION_INSTRUCTION','REVIEW_OR_SIGNOFF','CLIENT_INSTRUCTION','REFERRAL_CHANNEL','FILING','PROCESSOR_HOLDING')),
  route                 TEXT NOT NULL CHECK (route IN ('EMAIL','PORTAL','VIA_CLIENT_OR_AGENT','PROCESSOR_SYSTEM')),
  lawful_basis          TEXT NOT NULL CHECK (lawful_basis IN
                          ('CONTRACT','LEGITIMATE_INTERESTS','LEGAL_OBLIGATION','CONSENT','PROCESSOR_ON_INSTRUCTION')),
  disclosed_at          TEXT NOT NULL,
  recorded_by           TEXT NOT NULL REFERENCES users(id),
  recorded_at           TEXT NOT NULL,
  corrects_id           TEXT REFERENCES disclosure_log(id),
  CHECK (recipient_contact_id IS NULL OR recipient_user_id IS NULL),
  CHECK ((substr(recipient, 1, 1) = 'P') = (lawful_basis = 'PROCESSOR_ON_INSTRUCTION')),
  CHECK ((substr(recipient, 1, 1) = 'P') = (route = 'PROCESSOR_SYSTEM')),
  CHECK ((substr(recipient, 1, 1) = 'P') = (occasion = 'PROCESSOR_HOLDING')),
  CHECK (substr(recipient, 1, 1) = 'R' OR (recipient_contact_id IS NULL AND recipient_user_id IS NULL))
) STRICT;

CREATE INDEX disclosure_log_business_idx ON disclosure_log(business_id, disclosed_at);

CREATE TRIGGER disclosure_log_correction_same_client BEFORE INSERT ON disclosure_log
WHEN NEW.corrects_id IS NOT NULL
 AND NOT EXISTS (SELECT 1 FROM disclosure_log x WHERE x.id = NEW.corrects_id AND x.business_id = NEW.business_id)
BEGIN SELECT RAISE(ABORT, 'a correction names a disclosure of the same client''s data'); END;

CREATE TRIGGER disclosure_log_never_changed BEFORE UPDATE ON disclosure_log
BEGIN SELECT RAISE(ABORT, 'a disclosure is recorded once and never changed: record a correction that names it'); END;

CREATE TRIGGER disclosure_log_never_deleted BEFORE DELETE ON disclosure_log
BEGIN SELECT RAISE(ABORT, 'a disclosure is never deleted: it is the record Article 19 is owed against'); END;


-- ---------------------------------------------------------------------------
-- 2 · THE RECOMMENDED RECEIPT STRIPS — a recommendation, not a policy
--
--   KEEP_WHOLE                        nothing removed: a document we produce
--   STRIP_INDIVIDUALS_KEEP_FIGURES    the individuals removed and the figures kept,
--                                     modelled on the named existing policy
--   REFUSE_AS_UPLOAD                  not accepted as an upload at all
-- ---------------------------------------------------------------------------
CREATE TABLE receipt_strip_recommendations (
  type_code    TEXT PRIMARY KEY REFERENCES document_types(code),
  strip        TEXT NOT NULL CHECK (strip IN ('KEEP_WHOLE','STRIP_INDIVIDUALS_KEEP_FIGURES','REFUSE_AS_UPLOAD')),
  modelled_on  TEXT CHECK (modelled_on IS NULL OR modelled_on IN
                 ('PLANNING','FIRE_RISK_ASSESSMENT','OM_MANUAL','ASBESTOS_REGISTER','INSURANCE_REINSTATEMENT',
                  'LEASE','CONTRACTOR_COST_BREAKDOWN','BUILDING_REGS_COMPLETION','GRANT_FUNDING_AGREEMENT',
                  'CPSE_REPLIES','SALE_CONTRACT')),
  reason       TEXT NOT NULL CHECK (length(trim(reason)) BETWEEN 20 AND 400),
  drafted_on   TEXT NOT NULL,
  CHECK ((strip = 'STRIP_INDIVIDUALS_KEEP_FIGURES') = (modelled_on IS NOT NULL))
) STRICT;

CREATE TRIGGER receipt_strip_recommendations_unbound_only BEFORE INSERT ON receipt_strip_recommendations
WHEN EXISTS (SELECT 1 FROM document_types t WHERE t.code = NEW.type_code AND t.handler_type IS NOT NULL)
BEGIN SELECT RAISE(ABORT, 'a recommendation is for a type with no receipt policy: a bound type already has its policy'); END;

CREATE TRIGGER receipt_strip_recommendations_fixed BEFORE UPDATE ON receipt_strip_recommendations
BEGIN SELECT RAISE(ABORT, 'a recommendation is not edited in place: the data protection officer''s answer is bound by a migration'); END;

CREATE TRIGGER receipt_strip_recommendations_never_deleted BEFORE DELETE ON receipt_strip_recommendations
BEGIN SELECT RAISE(ABORT, 'a recommendation is never deleted: it is what the data protection officer was asked to approve'); END;

INSERT INTO receipt_strip_recommendations (type_code, strip, modelled_on, reason, drafted_on) VALUES
  ('ENGAGEMENT_LETTER', 'KEEP_WHOLE', NULL,
   'We write it and the client signs it: everyone it names is the client’s own signatory or ours, and the signed copy is the evidence the engagement exists.', '2026-09-12'),
  ('INVOICE', 'KEEP_WHOLE', NULL,
   'We issue it: it names our client and us, the bank details on it are our own company’s, and the finance record must match the document exactly.', '2026-09-12'),
  ('SURVEY_REPORT', 'KEEP_WHOLE', NULL,
   'Our surveyor writes it for this claim to a template that names nobody outside it; a report naming a resident or a member of staff is a defect corrected in the report, not a reason to strip every report.', '2026-09-12'),
  ('CA_REPORT', 'KEEP_WHOLE', NULL,
   'Our issued report, written to name nobody the claim does not need; a party in the entitlement chain appears in it only as the conveyancing question allows, so the control is in the writing.', '2026-09-12'),
  ('CLAIM_DOCUMENTATION', 'KEEP_WHOLE', NULL,
   'Only what we produce for the claim; an election signed by the other party to a purchase is not this type but the sale contract’s election schedule, received under that document’s own policy.', '2026-09-12'),
  ('COMPLETION_STATEMENT', 'STRIP_INDIVIDUALS_KEEP_FIGURES', 'LEASE',
   'The price, its apportionment, the stamp duty and the dates are what the claim needs; the fee earners, any individual party and the bank details for completion money are not.', '2026-09-12'),
  ('VALUATION', 'STRIP_INDIVIDUALS_KEEP_FIGURES', 'INSURANCE_REINSTATEMENT',
   'The figures and the basis of value are the cross-check the claim uses; the valuer’s name and registration sit in the certification block, which is not kept, as for the reinstatement valuation.', '2026-09-12'),
  ('ACCOUNTS', 'STRIP_INDIVIDUALS_KEEP_FIGURES', 'LEASE',
   'The balance sheet and the fixed-asset and tax notes say whether the company can use the allowances; the directors, the preparer and anyone in a related-party note are not needed for that.', '2026-09-12'),
  ('TAX_COMPUTATION', 'STRIP_INDIVIDUALS_KEEP_FIGURES', 'LEASE',
   'The pool figures and the profit position are the claim’s inputs; the preparer’s name, and an individual taxpayer’s tax reference or National Insurance number, are not.', '2026-09-12'),
  ('CONTRACTOR_INVOICE', 'STRIP_INDIVIDUALS_KEEP_FIGURES', 'CONTRACTOR_COST_BREAKDOWN',
   'Line items, amounts and dates are actual cost, which beats any apportionment; a sole-trader contractor’s name, a signatory and anybody’s bank details are not needed for it.', '2026-09-12'),
  ('PLANS', 'STRIP_INDIVIDUALS_KEEP_FIGURES', 'OM_MANUAL',
   'Room labels and schedules locate the plant; the title block’s drawn-by, checked-by and client names are not needed. Only the text layer passes the strip, so the picture itself is kept only if the raw-file rule keeps the file.', '2026-09-12'),
  ('SURVEY_PHOTOS', 'REFUSE_AS_UPLOAD', NULL,
   'A photograph has no parts to keep or remove, and one of a care home corridor may show a resident; survey photographs stay in the surveyor’s own record.', '2026-09-12'),
  ('CORRESPONDENCE', 'REFUSE_AS_UPLOAD', NULL,
   'Every receipt policy already removes correspondence as content we have no lawful basis to keep, so a letter under the same rule keeps nothing; its substance goes in a note on the claim.', '2026-09-12'),
  ('OTHER', 'REFUSE_AS_UPLOAD', NULL,
   'Nobody can say what it holds, so no strip can be written for it; the uploader chooses the type the document actually is, or it is not taken.', '2026-09-12');
