-- ===========================================================================
-- 109 — WHO CLAIMS, AND WHAT THE REGISTERS ALREADY SAY                       Phase 159g, 10 October 2026
--
-- The stress test of 9 October 2026 (the Lockwood Surgery live run, L2, L8 and L11; the coverage matrix, 2.4, 2.5 and
-- 3.1): the live run picked a dormant company as the owner, and the registers held a real sale price and tenure that
-- nobody read. So the property carries the facts that decide WHOSE claim it is, each with where it came from:
--
--   claimant_role   how the client holds the building: OWNER_OCCUPIER (owns it and works from it), LANDLORD (owns it
--                   and lets it to another business: a property business is a qualifying activity, CAA 2001 s.15(1)(b)
--                   to (d)), or TENANT (rents it: the claim is on fixtures the tenant paid for). NULL is not known (N4).
--   tenure_source   where the tenure (migration 009's FREEHOLD / LEASEHOLD) came from: Price Paid, the title check, or
--                   the client — the words the property page shows beside it.
--   lease_end_date  the day a lease ends, where the property is leasehold and it is known.
--   landlord        a company name or a role token (src/web/crm.ts OWNER_ROLE_TOKENS) — never a person's name (N2).
--   council_area    the council area the postcode is in (postcodes.io's admin_district, or the ONS table's), kept so the
--                   survey pack can draft its BCIS location from it (src/web/survey-pack.ts).
-- ===========================================================================

ALTER TABLE properties ADD COLUMN claimant_role TEXT CHECK (claimant_role IS NULL OR claimant_role IN ('OWNER_OCCUPIER','LANDLORD','TENANT'));
ALTER TABLE properties ADD COLUMN claimant_role_source TEXT CHECK (claimant_role_source IS NULL OR length(claimant_role_source) BETWEEN 1 AND 200);
ALTER TABLE properties ADD COLUMN tenure_source TEXT CHECK (tenure_source IS NULL OR length(tenure_source) BETWEEN 1 AND 200);
ALTER TABLE properties ADD COLUMN lease_end_date TEXT CHECK (lease_end_date IS NULL OR lease_end_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]');
ALTER TABLE properties ADD COLUMN landlord TEXT CHECK (landlord IS NULL OR length(landlord) BETWEEN 1 AND 200);
ALTER TABLE properties ADD COLUMN council_area TEXT CHECK (council_area IS NULL OR length(council_area) BETWEEN 1 AND 100);
ALTER TABLE properties ADD COLUMN council_area_source TEXT CHECK (council_area_source IS NULL OR length(council_area_source) BETWEEN 1 AND 200);
