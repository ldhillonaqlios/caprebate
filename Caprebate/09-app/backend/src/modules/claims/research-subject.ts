/**
 * WHAT THE OUTSIDE SERVICES ASK THE CLAIMS ABOUT A PROPERTY, handed in to the ports they own as the claims' front door
 * loads: a company's first property, for what a free lookup is asked about
 * (src/integrations/connectors/nations.ts), and whether a property is the company's, before a site area is worked
 * out (src/integrations/connectors/site-area.ts). The statements are the claims' own (data.ts), unchanged.
 */
import { setPropertyOfBusinessReader, setSubjectPropertyReader, type SubjectProperty } from '../../integrations/index.ts';
import { getPropertiesIdAddressLine1ByBusinessId, getPropertiesIdByIdBusinessId } from './data.ts';

setSubjectPropertyReader((db, business_id) => getPropertiesIdAddressLine1ByBusinessId<SubjectProperty>(db, [business_id]));
setPropertyOfBusinessReader((db, property_id, business_id) => getPropertiesIdByIdBusinessId<{ id: string }>(db, [property_id, business_id]));
