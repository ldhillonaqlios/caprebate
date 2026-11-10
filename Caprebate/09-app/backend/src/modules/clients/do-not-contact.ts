/**
 * DO_NOT_CONTACT, ASKED OF THE CRM'S RECORDS. The outbox's control (src/integrations/email/email.ts, isDoNotContact)
 * asks this through a port it owns; the CRM hands it in as its front door loads. The four tests, in the
 * same order as before and as the outbox trigger (migration 009): the message's organisation, an organisation's channel
 * address, a contact's address, and a client login that belongs to an organisation so marked. Text unchanged.
 */
import { setDoNotContactCheck, type DoNotContactCheck } from '../../integrations/index.ts';
import { getBusinessesCountByClientStatus, getBusinessesCountByIdClientStatus, getContactsCountByClientStatus } from './data.ts';
import { getUsersCountByClientStatusEmailCanonical } from './data.ts';

export const isDoNotContactHere: DoNotContactCheck = (db, to_email, business_id) => {
  if (business_id !== null && business_id !== undefined) {
    const b = getBusinessesCountByIdClientStatus<{ n: number }>(db, [business_id]);
    if ((b?.n ?? 0) > 0) return true;
  }
  const byChannel = getBusinessesCountByClientStatus<{ n: number }>(db, [to_email]);
  if ((byChannel?.n ?? 0) > 0) return true;
  const byContact = getContactsCountByClientStatus<{ n: number }>(db, [to_email]);
  if ((byContact?.n ?? 0) > 0) return true;
  const byLogin = getUsersCountByClientStatusEmailCanonical<{ n: number }>(db, [to_email]);
  return (byLogin?.n ?? 0) > 0;
};

setDoNotContactCheck(isDoNotContactHere);
