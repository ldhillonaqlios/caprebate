-- ===========================================================================
-- 093 — THE ENQUIRY CLEAN-UP JOB MAY DELETE A LOST FUNNEL ENQUIRY.   Phase 157 (the sweep), 6 October 2026
--
-- WHY. Phase 153c built the clean-up for closed website enquiries (src/web/enquiry-retention.ts, ENQUIRY_RETENTION,
-- Word question 222, OFF) and left the four-stage funnel's enquiries counted but never deleted: a funnel enquiry is a
-- CRM lead, tied to its organisation, contacts, bookings and emails, and every one of those refuses a delete by
-- trigger ("a lead is never deleted: it is lost, with a reason, and the record stays"). That is right while nobody has
-- said how long a lost enquiry is kept, and wrong for ever: it is personal data.
--
-- WHAT CHANGES HERE — THE PATTERN OF MIGRATION 038 (the message clean-up). Each "never deleted" trigger below is
-- replaced by one that admits a delete ONLY where the deletion log already holds an entry under the rule
-- ENQ-RETENTION for the lead the row belongs to (record kind FUNNEL_LEAD) or, when the whole organisation goes, for
-- the organisation (FUNNEL_BUSINESS). The job writes those entries first, in the same transaction, then deletes.
-- Anything else that tries to delete one of these rows is refused exactly as before.
--
-- NOTHING IS DELETED BY THIS FILE, AND NOTHING NEW IS EDITABLE. Every "never edited" trigger stays as it was. A lead
-- whose organisation holds a claim, an engagement, an invoice, a complaint, a rights request or anything else with a
-- reason of its own to stay is NOT deleted by the job at all (src/web/enquiry-retention.ts, leadDeletionPlan).
-- ===========================================================================

DROP TRIGGER leads_never_deleted;
CREATE TRIGGER leads_never_deleted BEFORE DELETE ON leads
WHEN NOT (EXISTS (SELECT 1 FROM deletion_log l WHERE l.basis_rule = 'ENQ-RETENTION' AND l.record_kind = 'FUNNEL_LEAD' AND l.record_id = OLD.id))
BEGIN SELECT RAISE(ABORT, 'a lead is never deleted: it is lost, with a reason, and the record stays - except by the enquiry clean-up job'); END;

DROP TRIGGER enquiry_checks_no_delete;
CREATE TRIGGER enquiry_checks_no_delete BEFORE DELETE ON enquiry_checks
WHEN NOT (EXISTS (SELECT 1 FROM deletion_log l WHERE l.basis_rule = 'ENQ-RETENTION' AND l.record_kind = 'FUNNEL_LEAD' AND l.record_id = OLD.lead_id))
BEGIN SELECT RAISE(ABORT, 'enquiry_checks is append-only: record a new answer instead - except with its lead by the enquiry clean-up job'); END;

DROP TRIGGER automation_runs_no_delete;
CREATE TRIGGER automation_runs_no_delete BEFORE DELETE ON automation_runs
WHEN NOT (EXISTS (SELECT 1 FROM deletion_log l WHERE l.basis_rule = 'ENQ-RETENTION' AND l.record_kind = 'FUNNEL_LEAD' AND l.record_id = OLD.lead_id) OR EXISTS (SELECT 1 FROM deletion_log l WHERE l.basis_rule = 'ENQ-RETENTION' AND l.record_kind = 'FUNNEL_BUSINESS' AND l.record_id = OLD.business_id))
BEGIN SELECT RAISE(ABORT, 'automation_runs is append-only - except with its lead by the enquiry clean-up job'); END;

DROP TRIGGER staff_tasks_never_deleted;
CREATE TRIGGER staff_tasks_never_deleted BEFORE DELETE ON staff_tasks
WHEN NOT (EXISTS (SELECT 1 FROM deletion_log l WHERE l.basis_rule = 'ENQ-RETENTION' AND l.record_kind = 'FUNNEL_LEAD' AND l.record_id = OLD.lead_id) OR EXISTS (SELECT 1 FROM deletion_log l WHERE l.basis_rule = 'ENQ-RETENTION' AND l.record_kind = 'FUNNEL_BUSINESS' AND l.record_id = OLD.business_id))
BEGIN SELECT RAISE(ABORT, 'a staff task is cancelled, with a reason, never deleted - except with its lead by the enquiry clean-up job'); END;

DROP TRIGGER consent_answers_no_delete;
CREATE TRIGGER consent_answers_no_delete BEFORE DELETE ON consent_answers
WHEN NOT (EXISTS (SELECT 1 FROM contacts c JOIN deletion_log l ON l.basis_rule = 'ENQ-RETENTION' AND ((l.record_kind = 'FUNNEL_LEAD' AND l.record_id = c.lead_id) OR (l.record_kind = 'FUNNEL_BUSINESS' AND l.record_id = c.business_id)) WHERE c.id = OLD.contact_id))
BEGIN SELECT RAISE(ABORT, 'consent_answers is append-only: record a new answer instead - except with its lead by the enquiry clean-up job'); END;

DROP TRIGGER outbox_never_deleted;
CREATE TRIGGER outbox_never_deleted BEFORE DELETE ON outbox
WHEN NOT (EXISTS (SELECT 1 FROM deletion_log l WHERE l.basis_rule = 'ENQ-RETENTION' AND l.record_kind = 'FUNNEL_LEAD' AND l.record_id = OLD.lead_id) OR EXISTS (SELECT 1 FROM deletion_log l WHERE l.basis_rule = 'ENQ-RETENTION' AND l.record_kind = 'FUNNEL_BUSINESS' AND l.record_id = OLD.business_id) OR EXISTS (SELECT 1 FROM contacts c JOIN deletion_log l ON l.basis_rule = 'ENQ-RETENTION' AND ((l.record_kind = 'FUNNEL_LEAD' AND l.record_id = c.lead_id) OR (l.record_kind = 'FUNNEL_BUSINESS' AND l.record_id = c.business_id)) WHERE c.id = OLD.contact_id))
BEGIN SELECT RAISE(ABORT, 'an email is never deleted from the outbox - except with its lead by the enquiry clean-up job'); END;

DROP TRIGGER outbox_attachments_no_delete;
CREATE TRIGGER outbox_attachments_no_delete BEFORE DELETE ON outbox_attachments
WHEN NOT (EXISTS (SELECT 1 FROM outbox o JOIN deletion_log l ON l.basis_rule = 'ENQ-RETENTION' AND ((l.record_kind = 'FUNNEL_LEAD' AND l.record_id = o.lead_id) OR (l.record_kind = 'FUNNEL_BUSINESS' AND l.record_id = o.business_id)) WHERE o.id = OLD.outbox_id))
BEGIN SELECT RAISE(ABORT, 'what an email carried is never deleted - except with its lead by the enquiry clean-up job'); END;

DROP TRIGGER outbox_inline_files_no_delete;
CREATE TRIGGER outbox_inline_files_no_delete BEFORE DELETE ON outbox_inline_files
WHEN NOT (EXISTS (SELECT 1 FROM outbox o JOIN deletion_log l ON l.basis_rule = 'ENQ-RETENTION' AND ((l.record_kind = 'FUNNEL_LEAD' AND l.record_id = o.lead_id) OR (l.record_kind = 'FUNNEL_BUSINESS' AND l.record_id = o.business_id)) WHERE o.id = OLD.outbox_id))
BEGIN SELECT RAISE(ABORT, 'what an email carried is never deleted - except with its lead by the enquiry clean-up job'); END;

DROP TRIGGER lookups_declined_no_delete;
CREATE TRIGGER lookups_declined_no_delete BEFORE DELETE ON lookups_declined
WHEN NOT (EXISTS (SELECT 1 FROM deletion_log l WHERE l.basis_rule = 'ENQ-RETENTION' AND l.record_kind = 'FUNNEL_BUSINESS' AND l.record_id = OLD.business_id))
BEGIN SELECT RAISE(ABORT, 'a client''s choice not to be looked up is kept with their file - except by the enquiry clean-up job'); END;

DROP TRIGGER thread_reads_no_delete;
CREATE TRIGGER thread_reads_no_delete BEFORE DELETE ON thread_reads
WHEN NOT (EXISTS (SELECT 1 FROM deletion_log l WHERE l.basis_rule = 'ENQ-RETENTION' AND l.record_kind = 'FUNNEL_BUSINESS' AND l.record_id = OLD.business_id))
BEGIN SELECT RAISE(ABORT, 'a read is never deleted - except with its organisation by the enquiry clean-up job'); END;

DROP TRIGGER channel_reads_no_delete;
CREATE TRIGGER channel_reads_no_delete BEFORE DELETE ON channel_reads
WHEN NOT (EXISTS (SELECT 1 FROM deletion_log l WHERE l.basis_rule = 'ENQ-RETENTION' AND l.record_kind = 'FUNNEL_BUSINESS' AND l.record_id = OLD.business_id))
BEGIN SELECT RAISE(ABORT, 'a read is never deleted - except with its organisation by the enquiry clean-up job'); END;
