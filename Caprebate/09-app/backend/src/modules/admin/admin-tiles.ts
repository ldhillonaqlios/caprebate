/**
 * SETTINGS — ONE PAGE OF TILES, FOR ADMIN.
 *
 * Until this phase Admin's menu was eight tabs of setup screens — Users, Admin settings, Document types, Automation, Email
 * templates, Compliance, Audit log — and the reward model under More. the owner asked for menus that do not repeat and are
 * not bloated, so the setup screens moved behind one "Settings" tab: a page of tiles, one per screen.
 *
 * NOTHING HERE DECIDES WHO MAY DO WHAT. Each tile names the gate its screen's store calls first, and is drawn only where
 * that gate admits the login. The page's own gate is `user.list`, Admin's, because the brief made Settings Admin's page;
 * every screen behind a tile still answers its own address, for every login its own gate admits, exactly as before.
 */

import type { Actor } from '../../core/index.ts';
import { h, type Safe } from '../../shared/index.ts';
import { usersGate } from './admin.permissions.ts';
import { assertConfigurationRead } from './configuration.ts';
import { documentTypesGate } from '../claims/index.ts';
import { automationGate } from '../clients/index.ts';
import { templatesGate } from './templates.ts';
import { assertComplianceRead } from '../compliance/index.ts';
import { auditLogGate } from '../compliance/index.ts';
import { rewardModelGate } from '../clients/index.ts';
import { adminSettingsGate } from './admin.permissions.ts';

export type Tile = {
  readonly href: string;
  readonly label: string;
  /** What the person does there, in under fifteen words. */
  readonly does: string;
  readonly gate: (actor: Actor) => void;
};

/** THE EIGHT TILES, in the brief's order. */
export const SETTINGS_TILES: readonly Tile[] = Object.freeze([
  { href: '/staff/users', label: 'Users', does: 'Add a colleague, change their role, or stop their sign-in.', gate: usersGate },
  { href: '/staff/admin-settings', label: 'Switches', does: 'Turn features on or off, and set the numbers the system uses.', gate: assertConfigurationRead },
  // Every outside service, its key and its switch, on one read-only page; Admin's, as Users is.
  { href: '/staff/connections', label: 'Connections', does: 'Every outside service: its key, its switch and its last call.', gate: usersGate },
  // Every rule in force, its version and who approves it; read only, Admin's (Phase 161m).
  { href: '/staff/rules', label: 'Rules', does: 'Every tax reading and switch: its version and who approves it.', gate: usersGate },
  { href: '/staff/document-types', label: 'Document types', does: 'The kinds of document we ask clients for.', gate: documentTypesGate },
  { href: '/staff/automation', label: 'Automation', does: 'Tasks and reminders that start by themselves when a claim moves.', gate: automationGate },
  { href: '/staff/templates', label: 'Email templates', does: 'The wording of the emails we send to clients.', gate: templatesGate },
  { href: '/staff/compliance', label: 'Compliance', does: 'Identity checks, data requests and anything that went wrong.', gate: assertComplianceRead },
  { href: '/staff/audit', label: 'Audit log', does: 'Who did what, and when. Nothing in it can be changed.', gate: auditLogGate },
  { href: '/staff/introducer-rewards', label: 'Introducer fees', does: 'What we pay firms that send us clients.', gate: rewardModelGate },
]);

/** The tiles this login's gates admit. The page gate is asked first. */
export function settingsTiles(actor: Actor, opens: (actor: Actor, gate: (actor: Actor) => void) => boolean): readonly Tile[] {
  adminSettingsGate(actor);
  return SETTINGS_TILES.filter((t) => opens(actor, t.gate));
}

/** The page body: a heading and the tiles. No paragraph explains it — each tile says what it is for. */
export function settingsBody(tiles: readonly Tile[]): Safe {
  return h`<h1>Settings</h1>
    <ul class="tiles settings-tiles">${tiles.map((t) => h`<li class="tile"><a class="tilelink" href="${t.href}">
      <span class="tilename">${t.label}</span><span class="tiledoes">${t.does}</span></a></li>`)}</ul>`;
}
