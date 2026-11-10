/**
 * WHAT THE CLAIMS ASK THE PORTAL, HANDED IN TO THE PORT THEY OWN (Phase 161l2; src/modules/claims/above-ports.ts): the
 * client's filing route, the accountant's confirmations, and the client's acceptance of the report. Each is this
 * module's own function, unchanged. Loaded last by the portal's front door.
 */
import { setPortalAsked } from '../claims/index.ts';
import { latestAnswer, returnFilings } from './accountant-confirm.ts';
import { getClientReportAcceptancesAcceptedAtFingerprintByClaimIdFing, getClientReportAcceptancesCountByClaimId } from './data.ts';

setPortalAsked({ latestAnswer, returnFilings, getClientReportAcceptancesAcceptedAtFingerprintByClaimIdFing, getClientReportAcceptancesCountByClaimId });
