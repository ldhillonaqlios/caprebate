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
 * NOTHING HERE READS A FIGURE. The header counts my open tasks through `myWork`, which authorises every row it returns.
 */

import { AsyncLocalStorage } from 'node:async_hooks';
import type { Db } from '../db.ts';
import type { Actor } from '../authz.ts';
import type { AppRole } from '../roles.ts';
import { h, raw, Safe } from './html.ts';
import { assertBackOffice, assertSection } from './backoffice.ts';
import { assertDashboard } from './dashboard.ts';
import { searchGate } from './search.ts';
import { myWork, nextActionsGate } from './tasks.ts';
import { assertLeadSection } from './leads.ts';
import { assertOrganisationSection, assertPropertySection, pipelineBoardGate } from './crm.ts';
import { claimListGate } from './lists.ts';
import { assertClientsSection } from './engaged.ts';
import { documentCentreGate, documentTypesGate } from './documents.ts';
import { assertIntroducerSection, rewardModelGate } from './introducers.ts';
import { assertSurveySection } from './surveyor.ts';
import { assertFinanceSection } from './finance.ts';
import { assertComplianceRead } from './compliance.ts';
import { assertConfigurationRead } from './configuration.ts';
import { automationGate } from './automation.ts';
import { templatesGate } from './templates.ts';
import { auditLogGate } from './audit-log.ts';
import { usersGate } from './settings.ts';

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
  /** B7: the proposed menu names below, instead of the current ones. */
  readonly menu: boolean;
  /** B9: the proposed names for the client's six steps (src/web/portal-steps.ts), instead of the current ones. */
  readonly portalSteps: boolean;
};

/**
 * THE SWITCHES, AS SHIPPED: BOTH OFF. Which to switch on is a question for Lakhbir in CAPREBATE QUESTIONS, "The new names
 * and the client's step names - which do we switch on?". Turning either on is a one-word change here.
 */
export const NAME_SWITCHES: NameSwitches = Object.freeze({ menu: false, portalSteps: false });

/** THE MENU LABEL TABLE: each renamed section's current name and the proposed one. A section not listed keeps its name. */
export const MENU_NAMES: readonly { readonly key: string; readonly current: string; readonly proposed: string }[] = Object.freeze([
  { key: 'clients', current: 'Engaged clients', proposed: 'Client files' },
  { key: 'next-actions', current: 'Next actions', proposed: 'Claims needing an owner' },
  { key: 'introducer-rewards', current: 'Reward model', proposed: 'Introducer fees' },
]);

/** The switches this request reads. */
export function nameSwitches(): NameSwitches {
  return navContext.getStore()?.names ?? NAME_SWITCHES;
}

/** A section's label under the menu switch. */
export function sectionLabel(s: { readonly key: string; readonly label: string }, switches: NameSwitches = nameSwitches()): string {
  if (!switches.menu) return s.label;
  return MENU_NAMES.find((n) => n.key === s.key)?.proposed ?? s.label;
}

/* ------------------------------------------------------------------ *
 * THE SECTIONS
 * ------------------------------------------------------------------ */

export type Section = {
  readonly key: string;
  readonly href: string;
  readonly label: string;
  /** The logins this section is a PRIMARY tab for. Anywhere else it may open, it sits under More. */
  readonly primary: readonly AppRole[];
  /** THE SECTION'S OWN GATE — the function its route's store calls first. Throws when the login may not open it. */
  readonly gate: (actor: Actor) => void;
  /** Addresses under this section that mark its tab as current. */
  readonly under?: readonly string[];
};

/**
 * EVERY BACK-OFFICE SECTION, in the order a login's tabs are drawn. The ORDER of primary tabs per login follows the
 * phase brief: Sales — Home, Leads, Organisations, Properties, Claims, Pipeline, Tasks, Introducers; Accounting — Home,
 * Finance (its invoices, fees and VAT), Claims, Tasks; Surveying — Home, Survey jobs (the review queue), Tasks; Admin —
 * Home, Users, Admin settings, Document types, Automation, Email templates, Compliance, Audit log; Read only — Home,
 * Pipeline, Claims, Leads, Dashboard.
 */
export const SECTIONS: readonly Section[] = Object.freeze([
  { key: 'home', href: '/staff', label: 'Home', primary: ['ADMIN', 'SALES', 'ACCOUNTING', 'SURVEYING', 'READ_ONLY'], gate: assertBackOffice },
  { key: 'users', href: '/staff/users', label: 'Users', primary: ['ADMIN'], gate: usersGate },
  { key: 'admin-settings', href: '/staff/admin-settings', label: 'Admin settings', primary: ['ADMIN'], gate: assertConfigurationRead },
  { key: 'document-types', href: '/staff/document-types', label: 'Document types', primary: ['ADMIN'], gate: documentTypesGate },
  { key: 'automation', href: '/staff/automation', label: 'Automation', primary: ['ADMIN'], gate: automationGate },
  { key: 'templates', href: '/staff/templates', label: 'Email templates', primary: ['ADMIN'], gate: templatesGate },
  { key: 'compliance', href: '/staff/compliance', label: 'Compliance', primary: ['ADMIN'], gate: assertComplianceRead },
  { key: 'audit', href: '/staff/audit', label: 'Audit log', primary: ['ADMIN'], gate: auditLogGate },
  { key: 'survey', href: '/staff/survey', label: 'Survey jobs', primary: ['SURVEYING'], gate: assertSurveySection },
  { key: 'finance', href: '/staff/finance', label: 'Finance', primary: ['ACCOUNTING'], gate: assertFinanceSection },
  { key: 'pipeline', href: '/staff/pipeline', label: 'Pipeline', primary: ['READ_ONLY'], gate: pipelineBoardGate },
  { key: 'leads', href: '/staff/leads', label: 'Leads', primary: ['SALES', 'READ_ONLY'], gate: assertLeadSection },
  { key: 'organisations', href: '/staff/organisations', label: 'Organisations', primary: ['SALES'], gate: assertOrganisationSection },
  { key: 'properties', href: '/staff/properties', label: 'Properties', primary: ['SALES'], gate: assertPropertySection },
  { key: 'claims', href: '/staff/claims', label: 'Claims', primary: ['SALES', 'ACCOUNTING', 'READ_ONLY'], gate: claimListGate },
  { key: 'pipeline-sales', href: '/staff/pipeline', label: 'Pipeline', primary: ['SALES'], gate: pipelineBoardGate },
  { key: 'dashboard', href: '/staff/dashboard', label: 'Dashboard', primary: ['READ_ONLY'], gate: assertDashboard },
  { key: 'tasks', href: '/staff/tasks', label: 'Tasks', primary: ['SALES', 'ACCOUNTING', 'SURVEYING'], gate: assertBackOffice },
  { key: 'introducers', href: '/staff/introducers', label: 'Introducers', primary: ['SALES'], gate: assertIntroducerSection },
  { key: 'assessments', href: '/staff/assessments', label: 'Assessments', primary: [], gate: (a) => assertSection(a, 'assessment.read') },
  { key: 'clients', href: '/staff/clients', label: 'Engaged clients', primary: [], gate: assertClientsSection },
  { key: 'documents', href: '/staff/documents', label: 'Documents', primary: [], gate: documentCentreGate },
  { key: 'calendar', href: '/staff/calendar', label: 'Calendar', primary: [], gate: (a) => assertSection(a, 'booking.read') },
  { key: 'next-actions', href: '/staff/next-actions', label: 'Next actions', primary: [], gate: nextActionsGate },
  { key: 'introducer-rewards', href: '/staff/introducer-rewards', label: 'Reward model', primary: [], gate: rewardModelGate },
  { key: 'search', href: '/staff/search', label: 'Search', primary: [], gate: searchGate },
]);

/** Whether a gate lets this login in. The gate throws `NotAuthorised`; anything else it throws is a defect and escapes. */
export function opens(actor: Actor, gate: (actor: Actor) => void): boolean {
  try { gate(actor); return true; } catch (e) {
    if ((e as { code?: string }).code === 'E_NOT_AUTHORISED' || (e instanceof Error && e.name === 'NotAuthorised')) return false;
    throw e;
  }
}

export type Tabs = { readonly primary: readonly Section[]; readonly more: readonly Section[] };

/**
 * A LOGIN'S TABS. Primary first, in table order; then every other section it may open, alphabetically, under More —
 * each address once (the pipeline is a primary tab for two logins through two rows). Search is in the header, not a tab.
 */
export function tabsFor(actor: Actor, switches: NameSwitches = nameSwitches()): Tabs {
  const open = SECTIONS.filter((s) => opens(actor, s.gate)).map((s) => ({ ...s, label: sectionLabel(s, switches) }));
  const primary = open.filter((s) => s.primary.includes(actor.role));
  const hrefs = new Set(primary.map((s) => s.href));
  const more: Section[] = [];
  for (const s of open) {
    if (hrefs.has(s.href) || s.key === 'search') continue;
    hrefs.add(s.href);
    more.push(s);
  }
  more.sort((a, b) => a.label.localeCompare(b.label));
  return { primary, more };
}

/** Every address a login's menu links to — what the Phase 133a test opens. */
export function menuHrefs(actor: Actor): string[] {
  const t = tabsFor(actor);
  const out = [...t.primary, ...t.more].map((s) => s.href);
  if (opens(actor, searchGate)) out.push('/staff/search');
  out.push('/staff/settings');
  return [...new Set(out)];
}

function isCurrent(s: Section, path: string | null): boolean {
  if (path === null) return false;
  if (s.href === '/staff') return path === '/staff';
  return path === s.href || path.startsWith(`${s.href}/`);
}

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
    <a href="${settingsHref}">Settings</a>${signOut()}</div></details>`;
}

/** The back office's header and tabs, for a staff login. */
export function staffShell(actor: Actor): Shell {
  const ctx = navContext.getStore();
  const path = ctx?.path ?? null;
  const tabs = tabsFor(actor);
  let taskLink: Safe = raw('');
  if (ctx !== undefined) {
    try {
      const w = myWork(ctx.db, actor, ctx.now());
      const open = w.tasks.length;
      taskLink = h`<a class="taskcount" href="/staff/tasks"><span class="n">${open}</span> open ${open === 1 ? 'task' : 'tasks'}${
        w.overdue > 0 ? h`, <span class="overdue-n">${w.overdue} overdue</span>` : raw('')}</a>`;
    } catch (e) {
      if (!((e as { code?: string }).code === 'E_NOT_AUTHORISED' || (e instanceof Error && e.name === 'NotAuthorised'))) throw e;
    }
  }
  const search = opens(actor, searchGate)
    ? h`<form class="gsearch" method="get" action="/staff/search" role="search"><label class="vh" for="gsearch-q">Search</label>
        <input id="gsearch-q" name="q" type="search" placeholder="Search organisations, claims, invoices…" minlength="2">
        <button type="submit">Search</button></form>`
    : raw('');
  const tab = (s: Section): Safe => isCurrent(s, path)
    ? h`<a href="${s.href}" aria-current="page">${s.label}</a>`
    : h`<a href="${s.href}">${s.label}</a>`;
  const moreCurrent = tabs.more.some((s) => isCurrent(s, path));
  const help = h`<a class="helplink" href="/staff/help?screen=${helpScreenFor(path ?? '/staff')}">Help</a>`;
  const html = h`<div class="util">${search}${taskLink}${help}${userMenu(displayName(ctx?.db, actor), actor, '/staff/settings')}</div>
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
  ['/staff/introducers', 'B30'], ['/staff/compliance', 'B33'], ['/staff/dashboard', 'B40'], ['/staff/search', 'B41'],
  ['/staff/admin-settings', 'B43'], ['/staff/audit', 'B45'],
]);

export function helpScreenFor(path: string): string {
  for (const [prefix, code] of HELP_SCREENS) if (path === prefix || path.startsWith(`${prefix}/`)) return code;
  return 'B0';
}
