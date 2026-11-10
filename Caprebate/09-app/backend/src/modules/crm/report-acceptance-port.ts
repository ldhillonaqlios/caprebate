/**
 * WHAT THE CRM ASKS THE CLIENT PORTAL (Phase 161l2; 09-app/docs/ARCHITECTURE.md rule 2): the client's acceptance of the
 * claim's issued report (the portal's client_report_acceptances), which the pipeline's card shows. The portal sits
 * above the CRM in the order, so the CRM never imports it: it owns this port, and the portal's front door fills it as it
 * loads (src/modules/portal/crm-ports.ts). Asked while a request runs, never while files load.
 */
import type { Db, Param, Row } from '../../core/index.ts';

type AcceptanceReader = <T extends Row = Row>(db: Db, params: readonly Param[]) => T | undefined;
var acceptance: AcceptanceReader | undefined;
export function setReportAcceptanceReader(read: AcceptanceReader): void { acceptance = read; }
/**
 * The first acceptance of the report with this fingerprint since the moment given (params: the claim, the fingerprint,
 * the moment), with who accepted it. Fails loudly when the portal has not handed in its reader.
 */
export function getClientReportAcceptancesAcceptedAtUserIdByClaimIdFingerprint<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  if (acceptance === undefined) throw new Error('The client\'s acceptance of the report is not set up. The client portal sets it up when it loads, so nothing was read.');
  return acceptance<T>(db, params);
}
