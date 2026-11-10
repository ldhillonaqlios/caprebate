/**
 * THE RULES IN FORCE, FOR ADMIN, READ ONLY (Phase 161m, 10 Nov 2026).
 *
 *   GET  /staff/rules   every rule in every area's register: what it decides, its version, the date it takes effect
 *                       from, who approves it and where that stands, and its position; then the claim calculator's
 *                       version and its own switches. Admin only.
 *
 * NOTHING HERE CHANGES A RULE. Changing one is a change to the code (the area's logic/rules.ts) with its tests, reviewed
 * in a pull request: the page says so. It is drawn from the registers themselves (src/modules/<area>/logic/rules.ts), so
 * it cannot say something the code does not do.
 */
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Actor } from '../../core/index.ts';
import { h, raw, page, HTML_HEADERS, type Safe } from '../../shared/index.ts';
import { ctaSwitchReadings, engineVersion, type RuleEntry, type RuleValue } from '../../shared/index.ts';
import { rulesThroughCompliance } from '../compliance/index.ts';

export const RULES_IN_FORCE_PATH = '/staff/rules';

/** Each area's name as a person reads it. */
const AREA_WORDS: Readonly<Record<string, string>> = Object.freeze({
  shared: 'Money readings and files', core: 'Sign-in and roles', integrations: 'Outside services', clients: 'The client record',
  assessment: 'The eligibility check', claims: 'Claims, fees and the letter', survey: 'The survey pack', finance: 'Finance',
  compliance: 'Compliance',
});

/** A rule's position in words: On or Off, and any period or mode it sets. */
export function positionWords(v: RuleValue): string {
  if (typeof v === 'boolean') return v ? 'On' : 'Off';
  if (v === null) return 'Not set';
  if (typeof v === 'string' || typeof v === 'number') return String(v);
  if (Array.isArray(v)) return v.map((x) => positionWords(x as RuleValue)).join(', ');
  const o = v as { readonly [k: string]: RuleValue };
  if (typeof o['test_system'] === 'boolean' && typeof o['elsewhere'] === 'boolean') {
    return `${o['test_system'] ? 'On' : 'Off'} on the test website, ${o['elsewhere'] ? 'on' : 'off'} everywhere else`;
  }
  // A rulebook: its own version (the file it is, by name, is on the rulebooks' list, never on a screen).
  if (typeof o['rulebook_version'] === 'string') return `Version ${String(o['rulebook_version']).replace(/^v/, '')}`;
  const parts: string[] = [];
  if (typeof o['enabled'] === 'boolean') parts.push(o['enabled'] ? 'On' : 'Off');
  for (const k of Object.keys(o).sort()) {
    if (k === 'enabled') continue;
    const x = o[k] as RuleValue;
    parts.push(`${k.replace(/_/g, ' ')}: ${typeof x === 'boolean' ? (x ? 'yes' : 'no') : positionWords(x)}`);
  }
  return parts.length === 0 ? 'Not set' : parts.join('; ');
}

export type RulesPageDeps = { readonly nav: (a: Actor) => Safe; readonly problem: (res: ServerResponse, actor: Actor, title: string, why: string, back: string) => 'handled' };

export function rulesInForcePage(nav: Safe, rules: readonly RuleEntry[] = rulesThroughCompliance()): string {
  const engine = engineVersion() ?? 'not known';
  const cta = ctaSwitchReadings();
  const on = cta.filter((s) => s.on).length;
  const areas = [...new Set(rules.map((r) => r.area))];
  const body = h`<div class="pagehead"><div><h1>Rules in force</h1>
    <p class="lede">Every tax reading and switch the system uses: its version, the date it takes effect from, and who approves it. ${String(rules.length)} rules.</p></div></div>
    <p class="help">This page changes nothing. A rule is changed in the code, with its tests, and checked before it goes live. A changed rule gets a new version. Each estimate, pack, report and invoice keeps the versions it was made with. Its figures never move.</p>
    <h2>The claim calculator</h2>
    <p>Version <strong>${engine}</strong>. Its own switches: ${String(cta.length)}, of which ${String(on)} ${on === 1 ? 'is' : 'are'} on. They change only with a new version of the calculator.</p>
    ${areas.map((a) => h`<h2>${AREA_WORDS[a] ?? a}</h2>
      <table class="stack dash-table rules-table"><thead><tr><th>Rule</th><th>Position</th><th>Version</th><th>From</th><th>Approved by</th></tr></thead><tbody>${
        rules.filter((r) => r.area === a).map((r) => h`<tr id="rule-${r.id}">
          <td data-label="Rule"><strong>${r.title}</strong><br><span class="help">${r.id}</span></td>
          <td data-label="Position">${positionWords(r.value)}</td>
          <td data-label="Version">${String(r.version)}</td>
          <td data-label="From">${r.effective_from}</td>
          <td data-label="Approved by">${r.approver}<br><span class="help">${r.approval}</span></td></tr>`)
      }</tbody></table>`)}
    ${raw('')}`;
  return page({ title: 'Rules in force', nav, wide: true, body });
}

export async function handleRulesPage(d: RulesPageDeps, _req: IncomingMessage, res: ServerResponse, url: URL, method: string, actor: Actor): Promise<'handled' | 'not-mine'> {
  if (!(url.pathname === '/staff/rules' && method === 'GET')) return 'not-mine';
  if (actor.role !== 'ADMIN') return d.problem(res, actor, 'Not for you', 'The rules page is for Admin.', '/staff');
  res.writeHead(200, HTML_HEADERS);
  res.end(rulesInForcePage(d.nav(actor)));
  return 'handled';
}
