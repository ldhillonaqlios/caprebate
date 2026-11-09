/**
 * THE SURVEY'S PERMISSIONS (09-app/docs/ARCHITECTURE.md: each module declares its own actions). The rules are
 * the same as they were in the one table (src/core/authz.ts), word for word; the core puts every module's together
 * when the module loads (registerActions), and authorise() decides exactly as before. Loaded first by the front door.
 */
import { PREDICATES, registerActions, type ObjType, type Rule } from '../../core/index.ts';

const { always, assignedSurveyor } = PREDICATES;

export const SURVEY_ACTIONS = registerActions('survey', {

  /* --- the surveyor's workspace, and nothing else --- */
  /**
   * MAY YOU OPEN THE SURVEY SECTION AT ALL — the same kind of question
   * `backoffice.enter` asks, and it needs its own row for a reason that only
   * shows up on this section.
   *
   * Every other collection gate in this application is a SENTINEL OBJECT: a
   * business belonging to nobody, refused to CLIENT because every rule that
   * lets a client through is `ownBusiness`. That works because the roles the
   * gate admits are on `always`. It does not work here: SURVEYING reaches
   * `surveyor_job.read` through `assignedSurveyor`, which is a test on the
   * SPECIFIC job, and a sentinel job would have to carry the requester's own
   * id in `surveyor_id` to pass it — a sentinel built to satisfy the rule
   * being asked, which proves nothing and reads as a trick.
   *
   * So the section is its own action. ACCOUNTING is absent, as it is from
   * every row below.
   */
  'surveyor_job.enter': { ADMIN: always, SALES: always, SURVEYING: always },
  'surveyor_job.read': {
    ADMIN: always, SALES: always,
    SURVEYING: assignedSurveyor as Rule<ObjType>,
  },
  'surveyor_job.commit': { SURVEYING: assignedSurveyor as Rule<ObjType> },
  'surveyor_job.assign': { ADMIN: always, SALES: always },
});
