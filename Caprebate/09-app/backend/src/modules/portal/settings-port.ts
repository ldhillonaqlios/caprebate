/**
 * A CLIENT'S OWN ACCOUNT SETTINGS (/portal/settings), HANDED IN TO A PORT THE PORTAL OWNS (Phase 161l2;
 * 09-app/docs/ARCHITECTURE.md rule 2).
 *
 * There is one settings implementation for both applications, on purpose: the back office's (handleSettings in
 * src/app/staff.ts), mounted again here so that a client can change their own password, and so that the two can never
 * drift apart. It lives in the start-up wiring, which sits above every module, so the portal cannot import it; the back
 * office hands its portal mount in as src/app/staff.ts loads, which the router shell loads before any request reaches
 * the portal. Until Phase 161l2 the router shell lent it in an unnamed bag (lendShellParts in src/core/http.ts).
 *
 * Asked before it is handed in, it refuses rather than answer the settings address with something else. Asked only
 * while a request runs. Declared with `var`, so a hand-in that comes while this file is still loading is kept.
 */
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Actor, App, WebResult } from '../../core/index.ts';
import type { FsObjectStore } from '../../shared/index.ts';

export type PortalSettingsDeps = { app: App; store: FsObjectStore; newId: () => string };

export type PortalSettings = (
  d: PortalSettingsDeps, req: IncomingMessage, res: ServerResponse, url: URL, method: string, actor: Actor,
  form: (r: IncomingMessage) => Promise<URLSearchParams>,
  body: (r: IncomingMessage, max?: number) => Promise<Buffer>,
) => Promise<WebResult>;

var settings: PortalSettings | undefined;

/** The back office hands in its portal mount of the settings (src/app/staff.ts). */
export function setPortalSettings(handle: PortalSettings): void { settings = handle; }

/** The settings, as the portal's /portal/settings addresses answer them. */
export function portalSettings(): PortalSettings {
  if (settings === undefined) throw new Error('The account settings are not set up. The back office (src/app/staff.ts) sets them up when it loads, so the settings page cannot open.');
  return settings;
}
