/**
 * WHO EVERY EMAIL COMES FROM, READ FROM THE ADMIN'S SETTING (migration 036, the latest row of email_sender). The
 * outbox (src/integrations/email/email.ts, currentSender) asks it through a port it owns; the admin hands it in as its
 * front door loads (Phase 161l). The statement is the admin's own (data.ts), unchanged.
 */
import { setSenderReader, type SenderRow } from '../../integrations/index.ts';
import { getEmailSenderDisplayNameAddress } from './data.ts';

setSenderReader((db) => getEmailSenderDisplayNameAddress<SenderRow>(db));
