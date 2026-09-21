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

import { AsyncLocalStorage } from 'node:async_hooks';
import type { Db } from '../db.ts';
import { NotAuthorised, type Actor } from '../authz.ts';
import type { AppRole } from '../roles.ts';
import { h, raw, Safe } from './html.ts';
import { assertBackOffice, assertSection } from './backoffice.ts';
import { searchGate } from './search.ts';
import { mayCreateTask, myWork, nextActionsGate } from './tasks.ts';
import { assertLeadSection } from './leads.ts';
import { assertOrganisationSection, pipelineBoardGate } from './crm.ts';
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
  /** PHASE 133c: the two name switches for this request (B7, B9). Absent is `NAME_SWITCHES`, both off as shipped. */
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
 * THE SWITCH, AS SHIPPED: OFF. Which to switch on is a question for Lakhbir in CAPREBATE QUESTIONS, "The new names and the
 * client's step names - which do we switch on?". Turning it on is a one-word change here.
 *
 * PHASE 135 — THE MENU NAMES ARE NO LONGER A SWITCH. Of the three proposed in Phase 133c, "Introducer fees" is now the
 * section's name; "Client files" and "Claims needing an owner" no longer apply, because Engaged clients became the one
 * Clients list and Next actions became a filter on Tasks. The `menu` switch went with them.
 */
export const NAME_SWITCHES: NameSwitches = Object.freeze({ portalSteps: false });

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
  { key: 'clients', href: '/staff/clients', label: 'Clients', gate: assertOrganisationSection, under: ['/staff/organisations'] },
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
 * dozen entries under More. A login's menu now lists the sections it does its daily job in — being allowed to open a
 * section is not a reason to list it. The verdict for every section, and the reason for each, is the table "The menus"
 * in 09-app/CAPREBATE-DEVELOPER-SPEC.md, section 2. `test/phase135.test.ts` asserts every menu exactly.
 *
 * THE MENU NEVER GRANTS OR REMOVES A PERMISSION. A listed section is still drawn only where its gate admits the login,
 * and a section on no menu answers its address exactly as before.
 */
export const MENUS: Readonly<Partial<Record<AppRole, { readonly tabs: readonly string[]; readonly more: readonly string[] }>>> = Object.freeze({
  SALES: { tabs: ['home', 'leads', 'clients', 'pipeline', 'tasks', 'introducers'], more: ['calendar'] },
  // Claims where the brief put Clients: Accounting may not read the client record, and no permission changes here.
  ACCOUNTING: { tabs: ['home', 'claims', 'finance', 'tasks'], more: ['introducer-rewards'] },
  SURVEYING: { tabs: ['home', 'survey', 'tasks'], more: [] },
  READ_ONLY: { tabs: ['home', 'leads', 'clients', 'pipeline'], more: [] },
  ADMIN: { tabs: ['home', 'leads', 'clients', 'pipeline', 'tasks', 'finance', 'settings'], more: ['calendar', 'introducers', 'survey'] },
});

/** More holds at most this many entries, or it is not drawn. Checked when the module loads, so a fifth cannot ship. */
export const MORE_LIMIT = 4;
for (const [role, m] of Object.entries(MENUS)) {
  if (m.more.length > MORE_LIMIT) throw new Error(`${role}'s More menu lists ${m.more.length} entries; the limit is ${MORE_LIMIT}`);
  for (const key of [...m.tabs, ...m.more]) {
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

export type Tabs = { readonly primary: readonly Section[]; readonly more: readonly Section[] };

/** A LOGIN'S TABS: its menu, in the menu's order, each section only where its gate admits the login. */
export function tabsFor(actor: Actor): Tabs {
  const m = MENUS[actor.role];
  if (m === undefined) return { primary: [], more: [] };
  const pick = (keys: readonly string[]): Section[] => keys
    .map((k) => SECTIONS.find((s) => s.key === k))
    .filter((s): s is Section => s !== undefined && opens(actor, s.gate));
  return { primary: pick(m.tabs), more: pick(m.more) };
}

/** Every address a login's menu links to — what the Phase 133a test opens. */
export function menuHrefs(actor: Actor): string[] {
  const t = tabsFor(actor);
  const out = [...t.primary, ...t.more].map((s) => s.href);
  if (opens(actor, searchGate)) out.push('/staff/search');
  out.push('/staff/settings');
  return [...new Set(out)];
}

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
  constructor(html: string, home: string) { super(html); this.home = home; }
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
    <a href="${settingsHref}">Your account</a>${signOut()}</div></details>`;
}

/** The back office's header and tabs, for a staff login. */
export function staffShell(actor: Actor): Shell {
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
  const moreCurrent = tabs.more.some((s) => isCurrent(s, path));
  const help = h`<a class="helplink" href="/staff/help?screen=${helpScreenFor(path ?? '/staff')}">Help</a>`;
  const html = h`<div class="util">${search}${help}${userMenu(displayName(ctx?.db, actor), actor, '/staff/settings')}</div>
    <nav class="appnav" aria-label="Sections">
      <ul class="tabs-main">${tabs.primary.map((s) => h`<li>${tab(s)}</li>`)}${tabs.more.length === 0 ? raw('') : h`<li class="more"><details${moreCurrent ? raw(' class="has-current"') : raw('')}><summary>More</summary>
        <ul>${tabs.more.map((s) => h`<li>${tab(s)}</li>`)}</ul></details></li>`}</ul></nav>`;
  return new Shell(html.html, '/staff');
}

/**
 * The client portal's header — simpler on purpose: their claims, their settings, sign out. PHASE 134: one company may hold
 * many claims, so the one tab is "Your claims", and it is current on every claim's own page too.
 */
export function portalShell(actor: Actor): Shell {
  const ctx = navContext.getStore();
  const name = displayName(ctx?.db, actor);
  const current = ctx?.path === '/portal' || (ctx?.path ?? '').startsWith('/portal/claims/');
  const html = h`<div class="util"><a class="helplink" href="/portal/help">Help</a>${userMenu(name, actor, '/portal/settings')}</div>
    <nav class="appnav portalnav" aria-label="Sections"><ul class="tabs-main"><li>${current
      ? h`<a href="/portal" aria-current="page">Your claims</a>` : h`<a href="/portal">Your claims</a>`}</li></ul></nav>`;
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
  ['/staff/admin-settings', 'B43'], ['/staff/audit', 'B45'], ['/staff/admin', 'B46'],
]);

export function helpScreenFor(path: string): string {
  for (const [prefix, code] of HELP_SCREENS) if (path === prefix || path.startsWith(`${prefix}/`)) return code;
  return 'B0';
}
