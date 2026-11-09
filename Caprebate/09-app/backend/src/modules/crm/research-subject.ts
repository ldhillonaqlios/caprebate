/**
 * WHAT THE OUTSIDE SERVICES ASK THE CRM ABOUT AN ORGANISATION, handed in to the port they own as the CRM's front door
 * loads: its name, legal name, company number and sector, for what a free lookup is asked about
 * (src/integrations/connectors/nations.ts, researchSubject). The statement is the CRM's own (data.ts), unchanged.
 */
import { setSubjectBusinessReader, type SubjectBusiness } from '../../integrations/index.ts';
import { getBusinessesNameLegalNameById } from './data.ts';

setSubjectBusinessReader((db, business_id) => getBusinessesNameLegalNameById<SubjectBusiness>(db, [business_id]));
