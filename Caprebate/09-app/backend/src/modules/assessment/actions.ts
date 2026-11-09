/**
 * THE ASSESSMENT'S PERMISSIONS (09-app/docs/ARCHITECTURE.md: each module declares its own actions). The rules are
 * the same as they were in the one table (src/core/authz.ts), word for word; the core puts every module's together
 * when the module loads (registerActions), and authorise() decides exactly as before. Loaded first by the front door.
 */
import { PREDICATES, registerActions, type ObjType, type Rule } from '../../core/index.ts';

const { always, ownBusiness } = PREDICATES;

export const ASSESSMENT_ACTIONS = registerActions('assessment', {
  'assessment.read': {
    ADMIN: always, SALES: always,
    SURVEYING: always, // an INPUT the survey needs; the estimate is a separate object
    CLIENT: ownBusiness as Rule<ObjType>,
  },
  'answer.read': {
    ADMIN: always, SALES: always, SURVEYING: always,
    CLIENT: ownBusiness as Rule<ObjType>,
  },
  'estimate.read': {
    ADMIN: always, SALES: always,
    CLIENT: ownBusiness as Rule<ObjType>,
    // SURVEYING is deliberately absent. See payload.ts and N1.
  },
});
