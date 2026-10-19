/**
 * THE HEADER AND THE NAVIGATION — PHASE 133a, 17 September 2026.
 *
 * Lakhbir: the CRM should "look and work like Salesforce — easy to use, intuitive, an easy layout for each one of the
 * logins". That is a set of layout patterns — a header with search, the user menu and my open work; a row of tabs per
 * login — and nothing of anybody's brand.
 *
 * THE MENU SHOWS ONLY WHAT THE LOGIN CAN OPEN, AND THAT IS A REVERSAL, ON INSTRUCTION. Until this phase the back office
 * drew the same twenty links for every staff role, on the reasoning (src/web/staff.ts, before this phase) that "a menu
 * built from `can()` would put an authorisation decision in a renderer, where the next person to add a section would
 * forget it, and the failure would be silent in both directions". Both halves of that worry are answered here rather
 * than set aside:
 *
 *   · THE MENU ASKS NO RULE OF ITS OWN. Every section names its `gate` — the very function its route's store calls
 *     first (exported beside that store for this purpose). The menu never decides; it asks the section.
 *   · THE FAILURE IS NOT SILENT. test/phase133a.test.ts opens every menu link for every login and requires 200, and
 *     opens every section NOT in a login's menu and requires 403. A section added to a route and not here, or a gate
 *     that drifts from its route, goes red in both directions.
 *
 * A SCREEN A LOGIN MAY NOT OPEN IS STILL REFUSED, NOT MERELY HIDDEN: typing its address answers 403, now as a page.
 *
 * NOTHING HERE READS A FIGURE. The Tasks tab counts my open tasks through `myWork`, which authorises every row it returns.
 *
 * PHASE 135, 21 September 2026 — A MENU IS A LOGIN'S DAILY WORK, NOT EVERYTHING IT MAY OPEN. Lakhbir found tabs repeating
 * each other and a dozen entries under More. Each login's menu is now named in `MENUS`, More holds at most four, and a
 * section off the menu still opens by its address for every login its gate admits. Both halves of the Phase 133a worry
 * still hold: a listed section is still drawn only where its gate admits the login, and test/phase135.test.ts asserts
 * every login's exact menu and every address's answer, so neither a menu nor a permission can drift unseen.
 */

import { unreadCount } from './messages.ts';
import { AsyncLocalStorage } from 'node:async_hooks';
import type { Db } from '../db.ts';
import { NotAuthorised, type Actor } from '../authz.ts';
import type { AppRole } from '../roles.ts';
import { h, raw, Safe } from './html.ts';
import { assertBackOffice, assertSection } from './backoffice.ts';
import { searchGate } from './search.ts';
import { mayCreateTask, myWork, nextActionsGate } from './tasks.ts';
import { assertLeadSection } from './leads.ts';
import { pipelineBoardGate } from './crm.ts';
import { billingViewFor, clientsAreaGate } from './billing.ts';
import { claimListGate } from './lists.ts';
import { assertIntroducerSection, rewardModelGate } from './introducers.ts';
import { assertSurveySection } from './surveyor.ts';
import { assertFinanceSection } from './finance.ts';
import { adminSettingsGate, SETTINGS_TILES } from './admin-tiles.ts';

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
  /** PHASE 133c: the two name switches for this request (B7, B9). Absent is `NAME_SWITCHES` (portal steps on since Phase 144). */
  readonly names?: NameSwitches;
  /**
   * PHASE 133c: A REFUSED FORM KEEPS WHAT WAS TYPED (B6). The router records what a POST carried here, and `problem()` in
   * src/web/staff.ts redraws the page the form was on with those values in it. `rerender` draws a GET of the back office
   * for that. Mutable on purpose: it is this one request's scratch space, and nothing outlives the request.
   */
  readonly form?: { typed?: URLSearchParams; action?: string; pending?: Promise<void>; rerender?: (href: string) => Promise<{ status: number; body: string }> };
};
export const navContext = new AsyncLocalStorage<NavContext>();

/* ------------------------------------------------------------------ *
 * THE NAMES — BUILT, SWITCHED OFF, AND ASKED (PHASE 133c, B7 and B9)
 * ------------------------------------------------------------------ */

export type NameSwitches = {
  /** B9: the proposed names for the client's six steps (src/web/portal-steps.ts), instead of the current ones. */
  readonly portalSteps: boolean;
};

/**
 * THE SWITCH: ON SINCE 22 SEPTEMBER 2026. Lakhbir answered CAPREBATE QUESTIONS, "The new names and the client's step
 * names - which do we switch on?", in the Phase 144 chat: "Switch on". Clients read "1 Your estimate" to "6 Aftercare".
 * (Shipped OFF by Phase 133c.) A test still passes both positions.
 *
 * PHASE 135 — THE MENU NAMES ARE NO LONGER A SWITCH. Of the three proposed in Phase 133c, "Introducer fees" is now the
 * section's name; "Client files" and "Claims needing an owner" no longer apply, because Engaged clients became the one
 * Clients list and Next actions became a filter on Tasks. The `menu` switch went with them.
 */
export const NAME_SWITCHES: NameSwitches = Object.freeze({ portalSteps: true });

/** The switches this request reads. */
export function nameSwitches(): NameSwitches {
  return navContext.getStore()?.names ?? NAME_SWITCHES;
}

/* ------------------------------------------------------------------ *
 * THE SECTIONS
 * ------------------------------------------------------------------ */

export type Section = {
  readonly key: string;
  readonly href: string;
  readonly label: string;
  /** THE SECTION'S OWN GATE — the function its route's store calls first. Throws when the login may not open it. */
  readonly gate: (actor: Actor) => void;
  /** Addresses under this section that mark its tab as current: a filter of it, or an old address it absorbed. */
  readonly under?: readonly string[];
};

/**
 * EVERY BACK-OFFICE SECTION a menu can name. PHASE 135: a section is listed once. Which login sees it, and where, is
 * `MENUS` below — not this table — and a section on no menu still opens by its address for every login its gate admits.
 */
export const SECTIONS: readonly Section[] = Object.freeze([
  { key: 'home', href: '/staff', label: 'Home', gate: assertBackOffice, under: ['/staff/reports'] },
  { key: 'leads', href: '/staff/leads', label: 'Leads', gate: assertLeadSection, under: ['/staff/assessments'] },
  // PHASE 151b: the whole record (Admin, Sales, read-only) or Accounting's billing view of it (src/web/billing.ts).
  { key: 'clients', href: '/staff/clients', label: 'Clients', gate: clientsAreaGate, under: ['/staff/organisations'] },
  { key: 'pipeline', href: '/staff/pipeline', label: 'Pipeline', gate: pipelineBoardGate },
  { key: 'claims', href: '/staff/claims', label: 'Claims', gate: claimListGate },
  { key: 'tasks', href: '/staff/tasks', label: 'Tasks', gate: assertBackOffice, under: ['/staff/next-actions'] },
  { key: 'finance', href: '/staff/finance', label: 'Finance', gate: assertFinanceSection },
  { key: 'survey', href: '/staff/survey', label: 'Survey jobs', gate: assertSurveySection },
  { key: 'introducers', href: '/staff/introducers', label: 'Introducers', gate: assertIntroducerSection },
  { key: 'introducer-rewards', href: '/staff/introducer-rewards', label: 'Introducer fees', gate: rewardModelGate },
  { key: 'calendar', href: '/staff/calendar', label: 'Calendar', gate: (a) => assertSection(a, 'booking.read') },
  { key: 'settings', href: '/staff/admin', label: 'Settings', gate: adminSettingsGate,
    under: SETTINGS_TILES.map((t) => t.href) },
]);

/**
 * PHASE 135 — EACH LOGIN'S MENU, BY NAME. Lakhbir, 18 September 2026: the tabs repeated each other, and some logins had a
 * dozen entries under More. A login's menu lists the sections it does its daily job in — being allowed to open a section
 * is not a reason to list it. `test/phase135.test.ts` asserts every menu exactly.
 *
 * UI TIDY PHASE 2, 2 October 2026 — A LEFT-HAND MENU IN GROUPS, AND NO MORE. Lakhbir chose "design 2" from the mock-ups
 * (00-START-HERE/hub/UI-TIDY-PLAN.md): the menu runs down the left in named groups, so nothing is hidden. Admin's Survey
 * jobs, Calendar and Introducers, Sales's Calendar and Accounting's Introducer fees came out of More into their groups;
 * no section joined or left any login's menu. The verdict for every section is the table "The menus" in
 * 09-app/CAPREBATE-DEVELOPER-SPEC.md, section 2.
 *
 * THE MENU NEVER GRANTS OR REMOVES A PERMISSION. A listed section is still drawn only where its gate admits the login,
 * and a section on no menu answers its address exactly as before.
 */
export type MenuGroup = { readonly label: string | null; readonly keys: readonly string[] };

export const MENUS: Readonly<Partial<Record<AppRole, readonly MenuGroup[]>>> = Object.freeze({
  SALES: [
    { label: null, keys: ['home', 'tasks'] },
    { label: 'Winning clients', keys: ['leads', 'pipeline', 'introducers'] },
    { label: 'Clients and claims', keys: ['clients', 'calendar'] },
  ],
  // PHASE 151b (Word answer 40, closed 24 September 2026): Clients, as the brief asked — Accounting's billing view of it:
  // who to chase, what waits for an invoice, what is owed. Not the client record, which it still may not read.
  ACCOUNTING: [
    { label: null, keys: ['home', 'tasks'] },
    { label: 'Clients and claims', keys: ['clients', 'claims'] },
    { label: 'Money', keys: ['finance', 'introducer-rewards'] },
  ],
  SURVEYING: [{ label: null, keys: ['home', 'survey', 'tasks'] }],
  READ_ONLY: [
    { label: null, keys: ['home'] },
    { label: 'Winning clients', keys: ['leads', 'pipeline'] },
    { label: 'Clients and claims', keys: ['clients'] },
  ],
  ADMIN: [
    { label: null, keys: ['home', 'tasks'] },
    { label: 'Winning clients', keys: ['leads', 'pipeline', 'introducers'] },
    { label: 'Clients and claims', keys: ['clients', 'survey', 'calendar'] },
    { label: 'Money', keys: ['finance'] },
    { label: 'Admin', keys: ['settings'] },
  ],
});

/** Checked when the module loads: every key is a section, and no login's menu names a section twice. */
for (const [role, groups] of Object.entries(MENUS)) {
  const keys = groups.flatMap((g) => g.keys);
  if (new Set(keys).size !== keys.length) throw new Error(`${role}'s menu names a section twice`);
  for (const key of keys) {
    if (!SECTIONS.some((s) => s.key === key)) throw new Error(`${role}'s menu names ${key}, which is not a section`);
  }
}

/** Whether a gate lets this login in. The gate throws `NotAuthorised`; anything else it throws is a defect and escapes. */
export function opens(actor: Actor, gate: (actor: Actor) => void): boolean {
  try { gate(actor); return true; } catch (e) {
    if ((e as { code?: string }).code === 'E_NOT_AUTHORISED' || (e instanceof Error && e.name === 'NotAuthorised')) return false;
    throw e;
  }
}

export type Tabs = {
  /** The menu's groups, each with only the sections its gates admit; a group left empty is not drawn. */
  readonly groups: readonly { readonly label: string | null; readonly sections: readonly Section[] }[];
  /** Every section on the menu, in order. */
  readonly primary: readonly Section[];
};

/** A LOGIN'S MENU: its groups, in the menu's order, each section only where its gate admits the login. */
export function tabsFor(actor: Actor): Tabs {
  const m = MENUS[actor.role];
  if (m === undefined) return { groups: [], primary: [] };
  const groups = m.map((g) => ({
    label: g.label,
    sections: g.keys.map((k) => SECTIONS.find((s) => s.key === k))
      .filter((s): s is Section => s !== undefined && opens(actor, s.gate)),
  })).filter((g) => g.sections.length > 0);
  return { groups, primary: groups.flatMap((g) => g.sections) };
}

/** Every address a login's menu links to — what the Phase 133a test opens. */
export function menuHrefs(actor: Actor): string[] {
  const t = tabsFor(actor);
  const out = t.primary.map((s) => s.href);
  if (opens(actor, searchGate)) out.push('/staff/search');
  out.push('/staff/settings');
  return [...new Set(out)];
}

/* ------------------------------------------------------------------ *
 * A MENU THAT OPENS OUT — UI TIDY PHASE 2
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

const SUB_MENUS = new WeakMap<NavContext, SubMenu>();

/** A page names the entries that open out under its section, for this request only. Outside a request it does nothing. */
export function setSubMenu(menu: SubMenu): void {
  const ctx = navContext.getStore();
  if (ctx !== undefined) SUB_MENUS.set(ctx, menu);
}

/**
 * UI TIDY PHASE 18: a page inside another's frame adds its own parts under the entry marked current — a claim's sections
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

/** The entries under `section` for this request: the page's own, or Settings' list of settings. None elsewhere. */
function subMenuFor(actor: Actor, section: Section, path: string | null): SubMenu | null {
  const ctx = navContext.getStore();
  const own = ctx === undefined ? undefined : SUB_MENUS.get(ctx);
  if (own !== undefined) return own;
  if (section.key === 'settings') {
    return { items: SETTINGS_TILES.filter((t) => opens(actor, t.gate)).map((t) => ({
      href: t.href, label: t.label, current: path !== null && (path === t.href || path.startsWith(`${t.href}/`)) })) };
  }
  return null;
}

function subMenuHtml(menu: SubMenu | null): Safe {
  if (menu === null || menu.items.length === 0) return raw('');
  return h`${menu.title === undefined ? raw('') : h`<p class="subtitle">${menu.title}</p>`}<ul class="subnav">${menu.items.map((i) => h`<li${i.sub === true ? raw(' class="subsub"') : raw('')}><a href="${i.href}"${
    i.current === true ? raw(' aria-current="page"') : raw('')}>${i.label}${i.note === undefined ? raw('') : h` <span class="subnote">${i.note}</span>`}</a></li>`)}</ul>`;
}

/**
 * THE PHONE'S MENU BUTTON. Under 900 px the menu folds behind one button, with no script: a checkbox and its label, and
 * the stylesheet shows the menu while it is ticked. It comes last in the header so the parts before it keep their order.
 */
const MENU_BUTTON = raw('<input type="checkbox" id="navtoggle" class="navtoggle"><label for="navtoggle" class="navbutton">Menu</label>');

/* ------------------------------------------------------------------ *
 * FILTERS — ONE TAB, TWO VIEWS (PHASE 135)
 * ------------------------------------------------------------------ */

/**
 * A ROW OF FILTERS AT THE TOP OF A LIST. Leads and filled assessments are one tab; so are tasks and the claims with no next
 * step. Each view keeps its own address and its own gate, and a filter is drawn only where its gate admits the login —
 * so no login is shown a link it would be refused.
 */
export type Filter = { readonly href: string; readonly label: string; readonly gate: (actor: Actor) => void };

export function filterBar(actor: Actor, filters: readonly Filter[], current: string): Safe {
  const shown = filters.filter((f) => opens(actor, f.gate));
  if (shown.length < 2) return raw('');
  return h`<nav class="viewbar" aria-label="Show">${shown.map((f) => f.href === current
    ? h`<a href="${f.href}" aria-current="page">${f.label}</a>`
    : h`<a href="${f.href}">${f.label}</a>`)}</nav>`;
}

function isCurrent(s: Section, path: string | null): boolean {
  if (path === null) return false;
  if (s.href === '/staff') return path === '/staff' || (s.under ?? []).some((x) => path === x || path.startsWith(`${x}/`));
  return [s.href, ...(s.under ?? [])].some((x) => path === x || path.startsWith(`${x}/`));
}

/** Leads: every lead, or the filled assessments — a filled assessment is a lead that came through the website. */
export const LEAD_FILTERS: readonly Filter[] = Object.freeze([
  { href: '/staff/leads', label: 'All leads', gate: assertLeadSection },
  { href: '/staff/assessments', label: 'Filled assessments', gate: (a: Actor) => assertSection(a, 'assessment.read') },
]);

/** Tasks: mine, every open one, and the claims with no next step (the list that was "Next actions"). */
export const TASK_FILTERS: readonly Filter[] = Object.freeze([
  { href: '/staff/tasks', label: 'My tasks', gate: assertBackOffice },
  { href: '/staff/tasks?view=all', label: 'Every open task',
    gate: (a: Actor) => { if (!mayCreateTask(a)) throw new NotAuthorised('staff_task.create', 'staff_task'); } },
  { href: '/staff/next-actions', label: 'Claims with no next step', gate: nextActionsGate },
]);

/* ------------------------------------------------------------------ *
 * THE SHELL
 * ------------------------------------------------------------------ */

/**
 * A HEADER THAT KNOWS WHERE HOME IS. `page()` draws the Caprebate name as a link to `home`, and draws `html` beside it.
 * It is a Safe value, so every existing `nav: Safe` type still holds.
 */
export class Shell extends Safe {
  readonly home: string;
  /**
   * PHASE 160a: THE BACK OFFICE'S TOP BAR, drawn by `page()` above the page once it knows the page's title — the trail
   * that ends on that title, Admin's views, the search, Help and the user menu. Absent for the portal, which keeps its look.
   * `own` is the trail a page drew for itself (`breadcrumb` in src/web/components.ts), moved up here unchanged so a page
   * never shows two.
   */
  readonly bar?: (title: string, own: Safe | null) => Safe;
  constructor(html: string, home: string, bar?: (title: string, own: Safe | null) => Safe) {
    super(html); this.home = home;
    if (bar !== undefined) this.bar = bar;
  }
}

const ROLE_WORDS: Readonly<Record<AppRole, string>> = Object.freeze({
  ADMIN: 'Admin', SALES: 'Sales', ACCOUNTING: 'Accounting', SURVEYING: 'Surveying', CLIENT: 'Client', READ_ONLY: 'Read only',
});

function displayName(db: Db | undefined, actor: Actor): string {
  if (db === undefined) return ROLE_WORDS[actor.role];
  const u = db.get<{ display_name: string | null }>('SELECT display_name FROM users WHERE id = ?', [actor.id]);
  return u?.display_name ?? ROLE_WORDS[actor.role];
}

function signOut(): Safe {
  return h`<form method="post" action="/logout" class="inline"><button class="linkish" type="submit">Sign out</button></form>`;
}

function userMenu(name: string, actor: Actor, settingsHref: string): Safe {
  return h`<details class="usermenu"><summary><span class="avatar" aria-hidden="true">${name.slice(0, 1).toUpperCase()}</span><span class="uname">${name}</span></summary>
    <div class="menu-pop"><p class="who">${name}<br><span class="help">${ROLE_WORDS[actor.role]}</span></p>
    <a href="${settingsHref}">Your account</a><a href="${settingsHref.startsWith('/portal') ? '/portal/two-factor' : '/staff/two-factor'}">Your second step</a>${signOut()}</div></details>`;
}

/** The back office's header and tabs, for a staff login. */
/**
 * 1 OCT 2026 — ADMIN'S VIEWS IN THE TOP BAR. Lakhbir: "i want the sales, accounting, survayor, admin these tabs to be
 * shifted next to the search box in the white space from logo to search box". Admin's choice of Home dashboard, on every
 * back-office page; the one Home is showing is marked. Nobody else has them (src/web/staff-dashboard.ts, dashView).
 */
function viewTabs(actor: Actor, current: string | null): Safe {
  if (actor.role !== 'ADMIN') return raw('');
  const views: readonly (readonly [string, string])[] = [['sales', 'Sales'], ['accounting', 'Accounting'], ['surveying', 'Surveyor'], ['admin', 'Admin']];
  return h`<nav class="dash-tabs" aria-label="Whose dashboard">${views.map(([v, label]) => h`<a href="/staff?view=${v}" class="dash-tab"${v === current ? raw(' aria-current="page"') : raw('')}>${label}</a>`)}</nav>`;
}

export function staffShell(actor: Actor, view: string | null = null): Shell {
  const ctx = navContext.getStore();
  const path = ctx?.path ?? null;
  const tabs = tabsFor(actor);
  // PHASE 135: the open-task count sits on the Tasks tab. The header's "N open tasks" link opened the same page.
  let taskCount: Safe = raw('');
  if (ctx !== undefined && tabs.primary.some((s) => s.key === 'tasks')) {
    try {
      const w = myWork(ctx.db, actor, ctx.now());
      const open = w.tasks.length;
      if (open > 0) {
        taskCount = h` <span class="tabcount${w.overdue > 0 ? ' late' : ''}">${open}<span class="vh"> open${
          w.overdue > 0 ? h`, ${w.overdue} overdue` : raw('')}</span></span>`;
      }
    } catch (e) {
      if (!((e as { code?: string }).code === 'E_NOT_AUTHORISED' || (e instanceof Error && e.name === 'NotAuthorised'))) throw e;
    }
  }
  const search = opens(actor, searchGate)
    ? h`<form class="gsearch" method="get" action="/staff/search" role="search"><label class="vh" for="gsearch-q">Search</label>
        <input id="gsearch-q" name="q" type="search" placeholder="Search clients, claims, invoices…" minlength="2">
        <button type="submit">Search</button></form>`
    : raw('');
  const tab = (s: Section): Safe => {
    const extra = s.key === 'tasks' ? taskCount : raw('');
    return isCurrent(s, path)
      ? h`<a href="${s.href}" aria-current="page">${s.label}${extra}</a>`
      : h`<a href="${s.href}">${s.label}${extra}</a>`;
  };
  const help = h`<a class="helplink" href="/staff/help?screen=${helpScreenFor(path ?? '/staff', actor)}">Help</a>`;
  /* PHASE 160a, 19 October 2026 — THE SIDEBAR LAYOUT LAKHBIR CHOSE (the Cap Rebate Simple CRM design). The menu down the
     left holds only the login's own sections, each with its icon; the search, Help, the user menu and Admin's views move
     to the top bar over the page, after the trail of where the person is. Which sections a login sees is still `tabsFor`. */
  const html = h`<nav class="appnav" aria-label="Sections"><ul class="navgroups">${tabs.groups.map((g) => h`<li class="navgroup">${
      g.label === null ? raw('') : h`<p class="navlabel">${g.label}</p>`}<ul class="tabs-main">${g.sections.map((s) => h`<li>${tab(s)}${
      isCurrent(s, path) ? subMenuHtml(subMenuFor(actor, s, path)) : raw('')}</li>`)}</ul></li>`)}</ul></nav>${MENU_BUTTON}`;
  const section = tabs.primary.find((s) => isCurrent(s, path)) ?? null;
  const util = h`<div class="util">${search}${help}${userMenu(displayName(ctx?.db, actor), actor, '/staff/settings')}</div>`;
  return new Shell(html.html, '/staff', (title, own) => h`<a class="crumbroot" href="/staff">Cap Rebate</a>${own ?? trail(section, path, title)}${viewTabs(actor, view)}${util}`);
}

/**
 * PHASE 160a — WHERE YOU ARE: "Cap Rebate / the section / the page". "Cap Rebate" is a link drawn before the trail (so it
 * also leads a trail a page drew for itself); the section is the one the menu marks as current; the page is the page's
 * own title, left out where it only repeats the section (Leads on the Leads list). The last step is the page itself, so
 * it is words, not a link.
 */
function trail(section: Section | null, path: string | null, title: string): Safe {
  const steps: { label: string; href: string }[] = [];
  if (section !== null) steps.push({ label: section.label, href: section.href });
  if (title !== '' && title !== section?.label) steps.push({ label: title, href: path ?? '' });
  const last = steps.length - 1;
  return h`<nav class="crumbs" aria-label="Where you are"><ol>${steps.map((s, i) => i === last
    ? h`<li><span aria-current="page">${s.label}</span></li>`
    : h`<li><a href="${s.href}">${s.label}</a></li>`)}</ol></nav>`;
}

/**
 * The client portal's header — simpler on purpose: their claims, their settings, sign out. PHASE 134: one company may hold
 * many claims, so the one tab is "Your claims", and it is current on every claim's own page too.
 */
export function portalShell(actor: Actor): Shell {
  const ctx = navContext.getStore();
  const name = displayName(ctx?.db, actor);
  const current = ctx?.path === '/portal' || (ctx?.path ?? '').startsWith('/portal/claims/');
  // UI TIDY PHASE 16: on the claims page, its sections open out under Your claims (the page names them, `setSubMenu`).
  // PHASE 142: MESSAGES, with how many of ours the client has not read. Only for the client, on their own company.
  const onMessages = ctx?.path === '/portal/messages' || (ctx?.path ?? '').startsWith('/portal/messages/');
  const unread = ctx?.db !== undefined && actor.role === 'CLIENT' && actor.business_id !== null && !onMessages
    ? unreadCount(ctx.db, actor, actor.business_id, 'CLIENT') : 0;
  const messages = h`<a href="/portal/messages"${onMessages ? raw(' aria-current="page"') : raw('')}>Messages${
    unread > 0 ? h` <span class="tabcount" aria-label="${unread} not read">${unread}</span>` : raw('')}</a>`;
  const html = h`<div class="util"><a class="helplink" href="/portal/help">Help</a>${userMenu(name, actor, '/portal/settings')}</div>
    <nav class="appnav portalnav" aria-label="Sections"><ul class="tabs-main"><li>${current
      ? h`<a href="/portal" aria-current="page">Your claims</a>${subMenuHtml(ctx === undefined ? null : SUB_MENUS.get(ctx) ?? null)}` : h`<a href="/portal">Your claims</a>`}</li>${
      actor.role === 'CLIENT' ? h`<li>${messages}</li>` : raw('')}</ul></nav>${MENU_BUTTON}`;
  return new Shell(html.html, '/portal');
}

/* ------------------------------------------------------------------ *
 * HELP — WHICH TRAINING SECTION A SCREEN OPENS (PHASE 133c, B5)
 * ------------------------------------------------------------------ */

/**
 * THE SCREEN A HELP LINK NAMES, from the address the header was drawn for. The key is a screen code of the user guide's
 * Part 3 (src/web/help.ts reads the section for it). An address with no training section of its own names "B0", the
 * landing page's, which lists every other.
 */
export const HELP_SCREENS: readonly (readonly [prefix: string, code: string])[] = Object.freeze([
  ['/staff/clients', 'B5'], ['/staff/survey', 'B7'], ['/staff/finance', 'B9'], ['/staff/users', 'B11'],
  ['/staff/organisations', 'B13'], ['/staff/properties', 'B15'], ['/staff/claims', 'B17'], ['/staff/leads', 'B19'],
  ['/staff/pipeline', 'B21'], ['/staff/tasks', 'B22'], ['/staff/next-actions', 'B24'], ['/staff/automation', 'B25'],
  ['/staff/templates', 'B26'], ['/staff/document-types', 'B29'], ['/staff/documents', 'B44'], ['/staff/introducer-rewards', 'B32'],
  ['/staff/introducers', 'B30'], ['/staff/compliance', 'B33'], ['/staff/dashboard', 'B40'], ['/staff/reports', 'B40'], ['/staff/search', 'B41'],
  // PHASE 151b: the roles the super admin makes, before '/staff/admin' so the longer address wins.
  ['/staff/admin/roles', 'B54'],
  ['/staff/admin-settings', 'B43'], ['/staff/audit', 'B45'], ['/staff/admin', 'B46'],
  // PHASE 142: email replies to sort are part of the chat's training section.
  ['/staff/replies', 'B49'],
]);

export function helpScreenFor(path: string, actor?: Actor): string {
  // PHASE 140: a company's files have their own training section, inside the Clients address.
  if (/^\/staff\/clients\/([A-Za-z0-9-]+)\/files$/.test(path)) return 'B47';
  /* PHASE 151c: THE SAME ADDRESS, A DIFFERENT SCREEN. A login that reads the billing view of the Clients tab rather than
     the client record (Accounting, src/web/billing.ts) is trained in B55, not B5 — so the link asks who is looking, not
     only where. The same question the Clients tab itself asks (`billingViewFor`), never a role name. */
  if (actor !== undefined && (path === '/staff/clients' || path.startsWith('/staff/clients/')) && billingViewFor(actor)) return 'B55';
  for (const [prefix, code] of HELP_SCREENS) if (path === prefix || path.startsWith(`${prefix}/`)) return code;
  return 'B0';
}
