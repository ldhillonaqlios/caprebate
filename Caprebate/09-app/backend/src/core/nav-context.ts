/**
 * THE REQUEST'S CONTEXT, THE NAME SWITCHES AND THE MENU A PAGE OPENS OUT. Kept apart from the header
 * (src/core/navigation.ts, which reads business modules) so the route files' plumbing (src/core/http.ts) and the core's
 * front door can use them without loading any business module. navigation.ts names them too, for its existing callers.
 */
import { AsyncLocalStorage } from 'node:async_hooks';
import type { Db } from './db.ts';

/* ------------------------------------------------------------------ *
 * THE REQUEST'S CONTEXT
 * ------------------------------------------------------------------ */

/**
 * WHAT THE HEADER NEEDS THAT `nav(actor)` WAS NEVER GIVEN — the database for the task count, the clock, and the address
 * for the current tab. Sixty page functions take `nav(actor)`; threading three more arguments through every one of them
 * would touch every screen for no change in what any of them shows. The router runs each back-office and portal
 * request inside this store instead. Outside it (a unit test calling a page function directly) the header is drawn
 * without a count and without a current tab, which is the honest reading of "not known".
 */
export type NavContext = {
  readonly db: Db; readonly now: () => string; readonly path: string;
  /** The two name switches for this request (B7, B9). Absent is `NAME_SWITCHES`. */
  readonly names?: NameSwitches;
  /**
   * A REFUSED FORM KEEPS WHAT WAS TYPED (B6). The router records what a POST carried here, and `problem()` in
   * src/app/staff.ts redraws the page the form was on with those values in it. `rerender` draws a GET of the back office
   * for that. Mutable on purpose: it is this one request's scratch space, and nothing outlives the request.
   */
  readonly form?: { typed?: URLSearchParams; action?: string; pending?: Promise<void>; rerender?: (href: string) => Promise<{ status: number; body: string }> };
};
export const navContext = new AsyncLocalStorage<NavContext>();

/* ------------------------------------------------------------------ *
 * THE NAMES — BUILT, SWITCHED OFF, AND ASKED
 * ------------------------------------------------------------------ */

export type NameSwitches = {
  /** B9: the proposed names for the client's six steps (src/modules/portal/portal-steps.ts), instead of the current ones. */
  readonly portalSteps: boolean;
};

/**
 * THE SWITCH: ON SINCE. the owner answered CAPREBATE QUESTIONS, "The new names and the client's step
 * names - which do we switch on?", in the chat that asked it: "Switch on". Clients read "1 Your estimate" to "6 Aftercare".
 * A test still passes both positions.
 *
 * THE MENU NAMES ARE NO LONGER A SWITCH. Of the three proposed "Introducer fees" is now the
 * section's name; "Client files" and "Claims needing an owner" no longer apply, because Engaged clients became the one
 * Clients list and Next actions became a filter on Tasks. The `menu` switch went with them.
 */
export const NAME_SWITCHES: NameSwitches = Object.freeze({ portalSteps: true });

/** The switches this request reads. */
export function nameSwitches(): NameSwitches {
  return navContext.getStore()?.names ?? NAME_SWITCHES;
}

/* ------------------------------------------------------------------ *
 * A MENU THAT OPENS OUT
 * ------------------------------------------------------------------ */

/**
 * THE ENTRIES UNDER THE CURRENT SECTION. On an inner page the menu opens out under the section a person is in: Settings
 * lists each setting; later phases add a client's own claims and sections, a survey job's parts and Finance's. An entry is
 * a page or a place on one, and a page passes in only what its own gates already show (`setSubMenu`). `title` names
 * the thing open, such as a client.
 */
export type SubMenu = {
  readonly title?: string;
  readonly items: readonly { readonly href: string; readonly label: string; readonly note?: string; readonly current?: boolean; readonly sub?: boolean }[];
};

/** Read by the header, which draws the menu a page set. */
export const SUB_MENUS = new WeakMap<NavContext, SubMenu>();

/** A page names the entries that open out under its section, for this request only. Outside a request it does nothing. */
export function setSubMenu(menu: SubMenu): void {
  const ctx = navContext.getStore();
  if (ctx !== undefined) SUB_MENUS.set(ctx, menu);
}

/**
 * A page inside another's frame adds its own parts under the entry marked current — a claim's sections
 * under that claim, in its client's menu. With no menu set yet, they become the menu, under `title`.
 */
export function addUnderCurrent(title: string, items: SubMenu['items']): void {
  const ctx = navContext.getStore();
  if (ctx === undefined) return;
  const menu = SUB_MENUS.get(ctx);
  const sub = items.map((i) => ({ ...i, sub: true }));
  const at = menu === undefined ? -1 : menu.items.findIndex((i) => i.current === true);
  if (menu === undefined || at < 0) { SUB_MENUS.set(ctx, { title, items: sub }); return; }
  SUB_MENUS.set(ctx, { ...menu, items: [...menu.items.slice(0, at + 1), ...sub, ...menu.items.slice(at + 1)] });
}
