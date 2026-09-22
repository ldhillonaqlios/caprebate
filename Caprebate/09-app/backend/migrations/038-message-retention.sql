-- ===========================================================================
-- 038 — THE MESSAGE CLEAN-UP JOB IS THE ONLY THING THAT CAN DELETE A MESSAGE.
--                                                  Phase 142a, 22 September 2026
--
-- WHY. Migration 037 made both chat threads refuse every delete, by trigger. That
-- is right while nobody has said how long a message is kept, and wrong for ever:
-- a message is personal data, and personal data kept without a period breaks the
-- storage-limitation rule. The period is the data protection officer's question
-- in CAPREBATE QUESTIONS — "How long do we keep client messages and the team
-- chat?" — and it is not answered. So the job that applies it is BUILT AND
-- SWITCHED OFF (MESSAGE_RETENTION, src/web/message-retention.ts).
--
-- WHAT CHANGES HERE. Each "never deleted" trigger on the two threads, and on the
-- rows that hang off a message, is replaced by one that admits a delete ONLY where
-- the deletion log (migration 022) already holds an entry for that very record,
-- written under the rule MSG-RETENTION. The job writes that entry first, in the
-- same transaction, then deletes. Anything else that tries to delete a message —
-- a stray statement, a new route, a script — is refused exactly as before.
--
--   record_kind      what it admits
--   CLIENT_MESSAGE   a row of client_messages, and the rows of client_message_files
--                    that say which files it brought (the FILES THEMSELVES are
--                    documents, and keep their own document rules — nothing here
--                    touches logical_documents or documents)
--   TEAM_MESSAGE     a row of internal_notes — the "Team only" thread
--   INBOUND_EMAIL    an email reply read from contactus@ (037), which holds the same
--                    words as the message it became: its files' rows, the rows
--                    saying which document a file became, and its filing
--
-- NOTHING IS DELETED BY THIS FILE, AND NOTHING NEW IS EDITABLE. Every "never
-- edited" trigger stays exactly as 037 wrote it. The deletion log keeps its own
-- rules: never deleted, verified once.
-- ===========================================================================

-- --- the thread with the client -------------------------------------------
DROP TRIGGER client_messages_never_deleted;
CREATE TRIGGER client_messages_never_deleted BEFORE DELETE ON client_messages
WHEN NOT EXISTS (SELECT 1 FROM deletion_log l
                  WHERE l.record_kind = 'CLIENT_MESSAGE' AND l.record_id = OLD.id AND l.basis_rule = 'MSG-RETENTION')
BEGIN SELECT RAISE(ABORT, 'a message is never deleted, except by the message clean-up job'); END;

DROP TRIGGER client_message_files_no_delete;
CREATE TRIGGER client_message_files_no_delete BEFORE DELETE ON client_message_files
WHEN NOT EXISTS (SELECT 1 FROM deletion_log l
                  WHERE l.record_kind = 'CLIENT_MESSAGE' AND l.record_id = OLD.message_id AND l.basis_rule = 'MSG-RETENTION')
BEGIN SELECT RAISE(ABORT, 'what a message carried is never deleted, except with the message by the clean-up job'); END;

-- --- the team thread ------------------------------------------------------
DROP TRIGGER internal_notes_never_deleted;
CREATE TRIGGER internal_notes_never_deleted BEFORE DELETE ON internal_notes
WHEN NOT EXISTS (SELECT 1 FROM deletion_log l
                  WHERE l.record_kind = 'TEAM_MESSAGE' AND l.record_id = OLD.id AND l.basis_rule = 'MSG-RETENTION')
BEGIN SELECT RAISE(ABORT, 'a team message is never deleted, except by the message clean-up job'); END;

-- --- an emailed reply, which carries the same words -----------------------
DROP TRIGGER inbound_email_never_deleted;
CREATE TRIGGER inbound_email_never_deleted BEFORE DELETE ON inbound_email
WHEN NOT EXISTS (SELECT 1 FROM deletion_log l
                  WHERE l.record_kind = 'INBOUND_EMAIL' AND l.record_id = OLD.id AND l.basis_rule = 'MSG-RETENTION')
BEGIN SELECT RAISE(ABORT, 'an email we received is never deleted, except by the message clean-up job'); END;

DROP TRIGGER inbound_email_files_no_delete;
CREATE TRIGGER inbound_email_files_no_delete BEFORE DELETE ON inbound_email_files
WHEN NOT EXISTS (SELECT 1 FROM deletion_log l
                  WHERE l.record_kind = 'INBOUND_EMAIL' AND l.record_id = OLD.inbound_email_id AND l.basis_rule = 'MSG-RETENTION')
BEGIN SELECT RAISE(ABORT, 'an email''s files are never deleted, except with the email by the clean-up job'); END;

DROP TRIGGER inbound_email_file_saves_no_delete;
CREATE TRIGGER inbound_email_file_saves_no_delete BEFORE DELETE ON inbound_email_file_saves
WHEN NOT EXISTS (SELECT 1 FROM deletion_log l JOIN inbound_email_files f ON f.inbound_email_id = l.record_id
                  WHERE f.id = OLD.inbound_email_file_id AND l.record_kind = 'INBOUND_EMAIL' AND l.basis_rule = 'MSG-RETENTION')
BEGIN SELECT RAISE(ABORT, 'a saved file is never deleted, except with its email by the clean-up job'); END;

DROP TRIGGER inbound_email_filings_no_delete;
CREATE TRIGGER inbound_email_filings_no_delete BEFORE DELETE ON inbound_email_filings
WHEN NOT EXISTS (SELECT 1 FROM deletion_log l
                  WHERE l.record_kind = 'INBOUND_EMAIL' AND l.record_id = OLD.inbound_email_id AND l.basis_rule = 'MSG-RETENTION')
BEGIN SELECT RAISE(ABORT, 'a filing is never deleted, except with its email by the clean-up job'); END;
