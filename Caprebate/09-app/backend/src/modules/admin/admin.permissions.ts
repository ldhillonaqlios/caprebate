/**
 * WHO MAY ENTER ADMIN'S SECTIONS: the Settings page and Users and roles.
 *
 * Kept apart from the rules in src/modules/admin/settings.ts and the tiles in admin-tiles.ts so a change to who may
 * open a section is made in one small file (Phase 161l2, the same split as src/modules/crm/crm.permissions.ts). Every
 * view and write still authorises on its own object as well; these gates only decide whether a login may enter the
 * section at all. Moved here unchanged. (The email templates' gate stays with the templates' own sentinel, in
 * src/modules/admin/templates.ts.)
 */
import { authorise, type Actor } from '../../core/index.ts';

/**
 * THE GATE OF USERS AND ROLES, EXPORTED FOR THE NAVIGATION. The same call its store function makes first;
 * src/core/navigation.ts asks it to decide whether the section is in a login's menu, and test/core/header-and-navigation.test.ts opens
 * every menu link for every login, so a gate that drifted from its route fails there.
 */
export function usersGate(actor: Actor): void {
  authorise(actor, 'user.list', { type: 'user', id: actor.id, role: actor.role });
}

/** The page's gate: Admin's, as the brief set it. */
export function adminSettingsGate(actor: Actor): void {
  usersGate(actor);
}
