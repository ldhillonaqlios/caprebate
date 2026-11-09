/**
 * ADMIN'S PERMISSIONS (09-app/docs/ARCHITECTURE.md: each module declares its own actions). The rules are
 * the same as they were in the one table (src/core/authz.ts), word for word; the core puts every module's together
 * when the module loads (registerActions), and authorise() decides exactly as before. Loaded first by the front door.
 */
import { PREDICATES, registerActions, type ObjType, type Rule } from '../../core/index.ts';

const { always, ownView } = PREDICATES;

export const ADMIN_ACTIONS = registerActions('admin', {
  'email_template.read': { ADMIN: always, SALES: always },
  'email_template.write': { ADMIN: always },
  'email.queue': { ADMIN: always, SALES: always },
  /*
   * EXPORT IS THE LIST THE READER ALREADY READS, AS CSV — and SURVEYING is not on it. A surveyor's lists are the
   * working line of their own jobs, and nothing about survey work needs a spreadsheet of them; a file leaves the
   * application, where no rule follows it. What each exporter's file holds is their own row shape (src/shared/lists.ts).
   */
  'list.export': { ADMIN: always, SALES: always, ACCOUNTING: always },
  /* A SAVED VIEW is a person's own; a SHARED one is ADMIN's to set and to retire. */
  'saved_view.write': {
    ADMIN: ownView as Rule<ObjType>, SALES: ownView as Rule<ObjType>,
    ACCOUNTING: ownView as Rule<ObjType>, SURVEYING: ownView as Rule<ObjType>,
  },
  'saved_view.share': { ADMIN: always },
  /*
   * THE ADMIN SETTINGS SCREEN. SALES READS IT, as it reads the automation rules, the templates and the document types
   * it folds in; ADMIN alone changes a list or a reason. What no setting may change — a gate, a switch, a role — is
   * refused by the store (src/modules/admin/configuration.ts), and no action here reaches one.
   */
  'configuration.read': { ADMIN: always, SALES: always },
  'configuration.write': { ADMIN: always },
});
