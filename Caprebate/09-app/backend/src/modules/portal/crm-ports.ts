/**
 * WHAT THE CRM ASKS THE CLIENT PORTAL, handed in to the port it owns (src/modules/crm/report-acceptance-port.ts) as the
 * portal's front door loads (Phase 161l2): the client's acceptance of the claim's issued report. The statement is the
 * portal's own (data.ts), text unchanged from the client record's borrowed file.
 */
import { setReportAcceptanceReader } from '../crm/index.ts';
import { getClientReportAcceptancesAcceptedAtUserIdByClaimIdFingerprint } from './data.ts';

setReportAcceptanceReader(getClientReportAcceptancesAcceptedAtUserIdByClaimIdFingerprint);
