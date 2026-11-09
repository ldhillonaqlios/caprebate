/**
 * THE PORTAL'S PERMISSIONS (09-app/docs/ARCHITECTURE.md: each module declares its own actions). The rules are
 * the same as they were in the one table (src/core/authz.ts), word for word; the core puts every module's together
 * when the module loads (registerActions), and authorise() decides exactly as before. Loaded first by the front door.
 */
import { PREDICATES, registerActions, type ObjType, type Rule } from '../../core/index.ts';

const { always, ownBusiness } = PREDICATES;

export const PORTAL_ACTIONS = registerActions('portal', {
  /* The client accepts the survey report released to them, in their portal (src/modules/portal/report-accept.ts). Their own act. */
  'client_report.accept': { CLIENT: ownBusiness as Rule<ObjType> },
  'client_step.tell': { ADMIN: always, SALES: always },
  'client_step.take_back': { ADMIN: always },
  'client_step.read': { ADMIN: always, SALES: always, CLIENT: ownBusiness as Rule<ObjType> },
  /* Recording the client's own written filing confirmation, where the client has no accountant — the
     people who hold the claim's papers, as a deliverable is. Nobody else; test/claims/engagement-terms-and-fees.test.ts asserts it per role. */
  'client_filing.record': { ADMIN: always, SALES: always },
  'share_consent.client_record': { CLIENT: ownBusiness as Rule<ObjType> },
});
