/**
 * WHETHER A CLAIM IS THIS COMPANY'S, handed in to the port the client record owns (src/modules/clients/messages.ts) as
 * the claims' front door loads, so a message tagged to a claim is refused when the claim is another company's. The
 * statement is the claims' own (data.ts), unchanged.
 */
import { setClaimOfBusinessReader } from '../clients/index.ts';
import { getClaimsIdByIdBusinessId } from './data.ts';

setClaimOfBusinessReader((db, claim_id, business_id) => getClaimsIdByIdBusinessId<{ id: string }>(db, [claim_id, business_id]));
