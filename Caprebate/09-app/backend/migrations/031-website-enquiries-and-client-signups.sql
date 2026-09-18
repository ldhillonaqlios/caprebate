-- ===========================================================================
-- 031 — THE WEBSITE'S ENQUIRY FORM, AND A CLIENT'S OWN ACCOUNT.   Phase 133j, 18 September 2026
--
-- WHY. The public website (`Caprebate site.html`) is now served by the back end at `/`. Its "Request my estimate"
-- form posts here, and a person who finishes the assessment may create their own client login, checked by email.
--
-- 1. website_enquiries. A form a visitor sent. IT IS NOT A LEAD, on purpose: the leads table's origin list is fixed
--    by fourteen triggers and nine dependants, and an enquiry is not yet something anybody has decided to work. Sales
--    opens it as a lead (status LEAD, lead_id set) or closes it (CLOSED). Consent to be contacted is required and
--    recorded; it is not marketing consent.
--
-- 2. client_signups. The offer made on the thank-you page after a funnel close, and the account request that follows
--    it. ONLY HASHES OF THE TWO TOKENS ARE STORED (the offer on the page, the link in the email), each expiring and each
--    single-use, the same pattern as password_reset_tokens (001). The password is stored only as its hash, until the
--    email is confirmed and the CLIENT login is created for the organisation the assessment recorded.
-- ===========================================================================

CREATE TABLE website_enquiries (
  id              TEXT PRIMARY KEY,
  created_at      TEXT NOT NULL,
  full_name       TEXT NOT NULL CHECK (length(full_name) BETWEEN 1 AND 200),
  firm            TEXT CHECK (firm IS NULL OR length(firm) <= 300),
  email           TEXT NOT NULL CHECK (length(email) BETWEEN 3 AND 254),
  phone           TEXT CHECK (phone IS NULL OR length(phone) <= 40),
  property_type   TEXT NOT NULL CHECK (property_type IN ('Care home','Dental practice','GP / primary care',
                    'Private hospital / clinic','Supported living','Other healthcare property')),
  message         TEXT CHECK (message IS NULL OR length(message) <= 2000),
  contact_consent INTEGER NOT NULL CHECK (contact_consent = 1),
  status          TEXT NOT NULL DEFAULT 'NEW' CHECK (status IN ('NEW','LEAD','CLOSED')),
  lead_id         TEXT REFERENCES leads(id),
  handled_by      TEXT REFERENCES users(id),
  handled_at      TEXT,
  CHECK ((status = 'LEAD') = (lead_id IS NOT NULL)),
  CHECK ((status = 'NEW') = (handled_at IS NULL))
) STRICT;

CREATE INDEX website_enquiries_open ON website_enquiries (status, created_at);

CREATE TABLE client_signups (
  id                 TEXT PRIMARY KEY,
  business_id        TEXT NOT NULL REFERENCES businesses(id),
  assessment_id      TEXT,
  offer_hash         TEXT NOT NULL UNIQUE,
  created_at         TEXT NOT NULL,
  offer_expires_at   TEXT NOT NULL,
  email_canonical    TEXT,
  display_name       TEXT,
  password_hash      TEXT,
  verify_hash        TEXT UNIQUE,
  verify_expires_at  TEXT,
  requested_at       TEXT,
  verified_at        TEXT,
  user_id            TEXT REFERENCES users(id),
  CHECK ((verified_at IS NULL) = (user_id IS NULL)),
  CHECK (verified_at IS NULL OR requested_at IS NOT NULL)
) STRICT;
