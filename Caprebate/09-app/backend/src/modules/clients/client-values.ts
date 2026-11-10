/**
 * WHAT THE OUTSIDE SERVICES' TEST LOOKUPS ASK THE CLIENT RECORD, handed in to the port they own
 * (src/integrations/connectors/client-values.ts) as the client record's front door loads: every organisation's name,
 * legal name and company number, and every lead's organisation and postcode. The statements are the client record's own
 * (data.ts), unchanged.
 */
import { setClientValuesReader } from '../../integrations/index.ts';
import { listBusinessesNameLegalName, listLeadsProspectOrganisationProspectPostcode } from './data.ts';

setClientValuesReader((db) => ({ businesses: listBusinessesNameLegalName(db), leads: listLeadsProspectOrganisationProspectPostcode(db) }));
